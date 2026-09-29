"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { EmergencyPanel } from "@/components/EmergencyPanel";
import { EpochTimeline } from "@/components/EpochTimeline";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { PriceChart } from "@/components/PriceChart";
import { StatusBadge } from "@/components/StatusBadge";
import { TxFeed } from "@/components/TxFeed";
import { useAppServices } from "@/lib/services/provider";
import { makeSimulationSnapshot } from "@/lib/simulation";
import { mstTestnet } from "@/lib/chains";
import { advanceEpoch, closeDay, createDay, getCurrentDay, getDay, RelayerRequestError } from "@/lib/relayer";
import { useRelayerSession } from "@/hooks/useRelayerSession";
import { applyOutcome, closeRequestId, epochRequestId, stateFromDayResponse, type PlayDayState } from "@/app/domain/route-models";
import { inspectLegacyDays, reconcileLegacyDay, type LegacyDayInspection } from "@/lib/legacy-day-migration";
import { automaticDailyProfile } from "./daily-profile";
import { HourlyModelTable, WeatherModelCard } from "./weather-model-card";
import { PlayDayControls } from "./play-day-controls";

type PageStatus = "idle" | "loading" | "ready" | "session-needed" | "empty" | "error";

function requestId() {
  return crypto.randomUUID();
}

function messageFor(status: PageStatus, state: PlayDayState | null, error: string | null) {
  if (error) return error;
  if (status === "session-needed") return "A wallet signature is required for protected real-day reads and writes.";
  if (status === "loading") return "Reading the relayer day state…";
  if (status === "empty") return "No real day is active. Preview is available; start a day when the wallet and network are ready.";
  if (!state) return "Preview is local and deterministic. Real-day values appear only after receipt reconciliation.";
  if (state.day.status === "closed") return `Day closed with ${state.outcomes.filter((outcome) => outcome.status === "confirmed").length}/24 confirmed epochs.`;
  if (state.day.nextEpoch >= 24) return "All 24 epochs are confirmed. Close day is the final receipt-backed step.";
  return `Real day ready at epoch ${String(state.day.nextEpoch).padStart(2, "0")}. Refresh is safe; the relayer remains authoritative.`;
}

export function PlayView() {
  const { address, chainId } = useAccount();
  const { session, authenticate, withSession, logout, isAuthenticating, error: authError } = useRelayerSession();
  const services = useAppServices();
  const [dailyProfile, setDailyProfile] = useState<ReturnType<typeof automaticDailyProfile> | null>(null);
  const [hour, setHour] = useState(7);
  const [viewerEvCharging, setViewerEvCharging] = useState(false);
  const [state, setState] = useState<PlayDayState | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>("idle");
  const [liveBusy, setLiveBusy] = useState(false);
  const [livePlaying, setLivePlaying] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceNotice, setServiceNotice] = useState<string | null>(null);
  const [legacyInspection, setLegacyInspection] = useState<LegacyDayInspection | null>(null);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const processing = useRef(false);

  const activeDay = state?.day.status === "active" || state?.day.status === "starting" ? state.day : null;
  const selectedScenario = activeDay?.scenario ?? dailyProfile?.scenario ?? "sunny";
  const selectedSeed = activeDay?.seed ?? dailyProfile?.seed ?? "profile-initializing";
  const selectedEvCharging = activeDay?.viewerEvCharging ?? viewerEvCharging;
  const activeEpoch = activeDay?.nextEpoch ?? hour;
  const hourlySnapshots = useMemo(() => Array.from({ length: 24 }, (_, epochIndex) => makeSimulationSnapshot(selectedScenario, selectedSeed, epochIndex, selectedEvCharging, address)), [address, selectedScenario, selectedEvCharging, selectedSeed]);
  const snapshot = hourlySnapshots[Math.min(activeEpoch, 23)];
  const emergencyOutcome = state?.outcomes.find((outcome) => outcome.epochIndex === activeEpoch && outcome.kind === "emergency")
    ?? state?.outcomes.filter((outcome) => outcome.kind === "emergency").slice(-1)[0];
  const feedOutcomes = useMemo(() => state?.outcomes.map((outcome) => ({
    ...outcome,
    metrics: outcome.status === "confirmed" ? outcome.metrics : undefined,
    actions: outcome.actions.map((action) => ({ ...action, metrics: action.status === "confirmed" ? action.metrics : undefined })),
  })) ?? [], [state?.outcomes]);

  const readCurrent = useCallback(async (token: string, expectedAddress: string) => {
    const response = await getCurrentDay(token);
    if (response.day && response.day.ownerAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error("The relayer returned a day for a different wallet; it was not attached.");
    }
    let next: PlayDayState | null = response.day ? stateFromDayResponse({ ...response, day: response.day }) : null;
    if (!next) {
      const saved = await services.data.listSavedDays();
      if (saved.status === "ok") {
        for (const reference of saved.data) {
          try {
            const restored = await getDay(reference.dayId, token);
            if (restored.day.ownerAddress.toLowerCase() !== expectedAddress.toLowerCase()) continue;
            next = stateFromDayResponse(restored);
            break;
          } catch {
            // A stale pointer is not authoritative and must not block a new day.
          }
        }
      } else if (saved.code !== "not-signed-in") {
        setServiceNotice(saved.message);
      }
    }
    if (!next) {
      setState(null);
      setPageStatus("empty");
      return null;
    }
    setState(next);
    setPageStatus("ready");
    setViewerEvCharging(next.day.viewerEvCharging);
    return next;
  }, [services.data]);

  const refresh = useCallback(async () => {
    if (!address || !session?.accessToken) {
      setPageStatus(address ? "session-needed" : "idle");
      setError(address ? "Authorize this wallet to read the current relayer day." : null);
      return;
    }
    setPageStatus("loading");
    setError(null);
    try {
      await readCurrent(session.accessToken, address);
    } catch (cause) {
      if (cause instanceof RelayerRequestError && cause.status === 401) {
        logout();
        setError("Wallet authorization expired. Sign a new wallet challenge to continue.");
      } else setError(cause instanceof Error ? cause.message : "The current day could not be read.");
      setPageStatus(cause instanceof RelayerRequestError && cause.status === 401 ? "session-needed" : "error");
    }
  }, [address, logout, readCurrent, session?.accessToken]);

  useEffect(() => {
    const updateProfileForToday = () => {
      const next = automaticDailyProfile(new Date());
      setDailyProfile((current) => current?.dayKey === next.dayKey ? current : next);
    };
    updateProfileForToday();
    const timer = window.setInterval(updateProfileForToday, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (session?.accessToken && address) void refresh();
    else {
      setState(null);
      setPageStatus(address ? "session-needed" : "idle");
    }
  }, [address, refresh, session?.accessToken]);

  useEffect(() => {
    if (typeof window !== "undefined") setLegacyInspection(inspectLegacyDays(window.localStorage));
  }, []);

  const saveReference = useCallback(async (next: PlayDayState) => {
    const result = await services.data.saveDayReference({
      dayId: next.day.dayId as `0x${string}`,
      chainId: next.chainId,
      marketAddress: next.marketAddress as `0x${string}`,
      scenario: next.day.scenario,
      seed: next.day.seed,
      savedAtISO: new Date().toISOString(),
    });
    if (result.status !== "ok") setServiceNotice(`${result.message} The relayer and chain remain the source of truth.`);
  }, [services.data]);

  const startOrResume = useCallback(async () => {
    setError(null);
    if (!address) {
      setError("Connect a wallet before starting a real day.");
      return;
    }
    if (chainId !== mstTestnet.id) {
      setError(`Wrong network: switch to MST Testnet (${mstTestnet.id}) before signing.`);
      return;
    }
    if (!activeDay && !dailyProfile) {
      setError("Today’s automatic model profile is still being prepared. Try again in a moment.");
      return;
    }
    setLiveBusy(true);
    try {
      const next = await withSession(async (token) => {
        const currentState = await readCurrent(token, address);
        if (currentState) {
          const currentDay = currentState.day;
          if (currentDay.status === "starting") {
            const retried = await createDay({ clientRunId: currentDay.clientRunId, scenario: currentDay.scenario, seed: currentDay.seed, viewerEvCharging: currentDay.viewerEvCharging }, token);
            if (retried.status !== "confirmed") {
              setState(currentState);
              return currentState;
            }
            const started = await getDay(retried.dayId, token);
            return stateFromDayResponse(started);
          }
          return currentState;
        }
        const created = await createDay({ clientRunId: requestId(), scenario: dailyProfile!.scenario, seed: dailyProfile!.seed, viewerEvCharging }, token);
        if (created.status !== "confirmed") {
          setError("Day start is pending or unknown. Press the same action again to reconcile; no epoch was submitted.");
          return null;
        }
        return stateFromDayResponse(await getDay(created.dayId, token));
      });
      if (!next) return;
      setState(next);
      setPageStatus("ready");
      setViewerEvCharging(next.day.viewerEvCharging);
      await saveReference(next);
      if (next.day.status === "active" && next.day.nextEpoch < 24) setLivePlaying(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The real day could not be started or resumed.");
      setPageStatus("error");
    } finally {
      setLiveBusy(false);
    }
  }, [activeDay, address, chainId, dailyProfile, readCurrent, saveReference, viewerEvCharging, withSession]);

  const restoreLegacy = useCallback(async () => {
    const candidate = legacyInspection?.candidates[0];
    if (!candidate) return;
    if (!address) {
      setError("Connect the wallet that created the older day before restoring it.");
      return;
    }
    setLegacyBusy(true);
    setError(null);
    try {
      const result = await withSession((token) => reconcileLegacyDay({
        candidate,
        walletAddress: address,
        getDay: (dayId) => getDay(dayId, token),
        saveReference: (reference) => services.data.saveDayReference(reference),
        storage: window.localStorage,
      }));
      if (result.status !== "ok") {
        setError(result.message);
        return;
      }
      const next = stateFromDayResponse(result.response);
      setState(next);
      setPageStatus("ready");
      setViewerEvCharging(next.day.viewerEvCharging);
      setLegacyInspection(inspectLegacyDays(window.localStorage));
      setServiceNotice(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The legacy day could not be reconciled; it was kept.");
    } finally {
      setLegacyBusy(false);
    }
  }, [address, legacyInspection, services.data, withSession]);

  const advanceOne = useCallback(async () => {
    if (!state || !address || state.day.status !== "active" || state.day.nextEpoch >= 24 || processing.current) return;
    processing.current = true;
    setLiveBusy(true);
    setError(null);
    const epoch = state.day.nextEpoch;
    try {
      const outcome = await withSession((token) => advanceEpoch(state.day.dayId, epoch, epochRequestId(state.day.dayId, epoch), token));
      const next = applyOutcome(state, outcome);
      setState(next);
      if (outcome.status !== "confirmed") {
        setLivePlaying(false);
        setError(outcome.status === "unknown" ? "Epoch receipt is unknown. Retry the same epoch to reconcile the existing transaction." : `Epoch ${epoch} is ${outcome.status}; no settled metric is shown.`);
      } else if (epoch >= 23) setLivePlaying(false);
    } catch (cause) {
      setLivePlaying(false);
      setError(cause instanceof Error ? cause.message : "The epoch could not be reconciled.");
    } finally {
      processing.current = false;
      setLiveBusy(false);
    }
  }, [address, state, withSession]);

  useEffect(() => {
    if (!livePlaying || !state || state.day.status !== "active" || state.day.nextEpoch >= 24) return;
    void advanceOne();
  }, [advanceOne, livePlaying, state]);

  const closeCompletedDay = useCallback(async () => {
    if (!state || state.day.nextEpoch !== 24 || state.day.status !== "active") return;
    setLiveBusy(true);
    setError(null);
    try {
      const result = await withSession((token) => closeDay(state.day.dayId, closeRequestId(state.day.dayId), token));
      const next = { ...state, day: { ...state.day, status: result.status === "confirmed" ? "closed" as const : state.day.status }, closeAction: result.closeAction };
      setState(next);
      if (result.status !== "confirmed") setError(`Day close is ${result.status}. Retry to reconcile the same close request.`);
      else await saveReference(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Day close could not be reconciled.");
    } finally {
      setLiveBusy(false);
    }
  }, [saveReference, state, withSession]);

  useEffect(() => {
    if (!previewPlaying) return;
    const timer = window.setInterval(() => setHour((current) => current >= 23 ? (setPreviewPlaying(false), 0) : current + 1), 900);
    return () => window.clearInterval(timer);
  }, [previewPlaying]);

  const status = messageFor(pageStatus, state, error ?? authError);
  const showSessionAction = Boolean(address) && (pageStatus === "session-needed" || !session);

  return (
    <main id="main-content" className="dashboard-shell !pt-8 sm:!pt-12">
      <header className="mb-5 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="eyebrow">VoltGrid / play day</p><h1 className="!mb-2 !max-w-3xl !text-4xl sm:!text-5xl">Preview freely. Settle deliberately.</h1><p className="!mb-0 !max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">A deterministic 24-epoch model preview sits beside an optional wallet-authorized real day. Browser readings are never submitted.</p></div>
        <StatusBadge status={state ? (state.day.status === "closed" ? "confirmed on-chain" : "submitted / pending") : "preview simulation"} />
      </header>

      <section className="mb-5 grid gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[rgba(20,33,39,.75)] p-4 sm:grid-cols-[1fr_auto] sm:items-center" id="connect-wallet">
        <div><p className="eyebrow !mb-1">Real-day authorization</p><p className="mb-0 text-sm leading-6 text-[var(--ink-soft)]" aria-live="polite">{status}</p></div>
        <div className="flex flex-wrap items-center gap-2"><ConnectButton />{address && <NetworkSwitcher />}{showSessionAction && <button className="button button-primary" onClick={() => void authenticate().then(() => void refresh())} disabled={isAuthenticating}>{isAuthenticating ? "Waiting for signature…" : "Authorize wallet"}</button>}</div>
      </section>

      {serviceNotice && <p className="mb-4 rounded-xl border border-[rgba(142,201,255,.35)] bg-[rgba(142,201,255,.08)] p-3 text-xs leading-5 text-[var(--ink-soft)]" role="status">Account reference is offline: {serviceNotice}</p>}

      {legacyInspection && (legacyInspection.candidates.length > 0 || legacyInspection.invalidKeys.length > 0) && <section className="card mb-4 !p-4" aria-labelledby="legacy-restore-title">
        <div className="card-heading"><div><p className="eyebrow">One-time migration</p><h2 id="legacy-restore-title">Restore an older day pointer</h2></div><StatusBadge status="unavailable" /></div>
        {legacyInspection.candidates[0] && <p className="card-copy">An older browser entry points to <code className="break-all">{legacyInspection.candidates[0].pointer.dayId}</code>. It is only a lookup hint: the connected wallet, relayer response, and Supabase save must all succeed before the old entry is removed.</p>}
        {legacyInspection.invalidKeys.length > 0 && <p className="mb-3 text-sm leading-6 text-[var(--ink-soft)]" role="status">An older entry could not be validated and was left untouched. Reconciliation will not import its cached metrics.</p>}
        {legacyInspection.candidates[0] && <button className="button button-primary" onClick={() => void restoreLegacy()} disabled={legacyBusy || !address}>{legacyBusy ? "Reconciling…" : address ? "Verify and restore" : "Connect wallet to restore"}</button>}
      </section>}

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]">
        <PlayDayControls profile={dailyProfile} activeScenario={selectedScenario} activeDay={Boolean(activeDay)} hour={activeEpoch} isPlaying={previewPlaying} onPlay={() => setPreviewPlaying((current) => !current)} onReset={() => { setPreviewPlaying(false); setHour(7); }} viewerEvCharging={selectedEvCharging} setViewerEvCharging={setViewerEvCharging} onStartReal={() => void startOrResume()} liveStatus={status} liveBusy={liveBusy || isAuthenticating} />
        <section className="card" aria-labelledby="day-contract-title">
          <div className="card-heading"><div><p className="eyebrow">Receipt contract</p><h2 id="day-contract-title">One state machine, 24 outcomes</h2></div><StatusBadge status={state ? "submitted / pending" : "unavailable"} /></div>
          <p className="card-copy">The relayer/chain owns real-day status. This page keeps a stable request ID per day/epoch, reconciles current state on refresh, and never promotes pending, reverted, or unknown data to settled.</p>
          <div className="grid gap-2 text-xs leading-5 text-[var(--ink-soft)] sm:grid-cols-2"><p><StatusBadge status="preview simulation" /> local sim-core only</p><p><StatusBadge status="submitted / pending" /> transaction awaiting receipt</p><p><StatusBadge status="confirmed on-chain" /> expected event and hash</p><p><StatusBadge status="unavailable" /> offline / unauthorized / unknown</p></div>
          {state && <dl className="mt-4 grid gap-2 border-t border-[var(--line)] pt-3 text-xs sm:grid-cols-2"><div><dt className="text-[var(--ink-faint)]">Day ID</dt><dd className="mt-1 break-all font-mono">{state.day.dayId}</dd></div><div><dt className="text-[var(--ink-faint)]">Input</dt><dd className="mt-1 break-words">{state.day.scenario} · {state.day.seed}</dd></div><div><dt className="text-[var(--ink-faint)]">Confirmed outcomes</dt><dd className="mt-1">{state.outcomes.filter((outcome) => outcome.status === "confirmed").length}/24</dd></div><div><dt className="text-[var(--ink-faint)]">Settlement authority</dt><dd className="mt-1">relayer + chain receipt</dd></div></dl>}
          <button className="button button-quiet mt-4" onClick={() => void refresh()} disabled={pageStatus === "loading" || !session}>{pageStatus === "loading" ? "Refreshing…" : "Refresh receipt state"}</button>
        </section>
      </section>

      {activeDay || dailyProfile ? <>
        <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-3"><PriceChart scenario={selectedScenario} seed={selectedSeed} activeHour={activeEpoch} viewerEvCharging={selectedEvCharging} viewerAddress={address} /><WeatherModelCard snapshot={snapshot} scenario={selectedScenario} /><EmergencyPanel proposed={snapshot.proposedEmergency} proposedTargetWh={snapshot.output.proposedTargetWh} outcome={emergencyOutcome} batteryState={snapshot.output.batteryState} explorerUrl={mstTestnet.blockExplorers.default.url} /></div>
        <HourlyModelTable snapshots={hourlySnapshots} />
      </> : <section className="card mt-4" role="status" aria-live="polite"><p className="eyebrow">Preview setup</p><h2>Preparing the automatic daily model</h2><p className="card-copy">Weather and price values will appear after the browser-local day profile is assigned. No placeholder measurements are shown.</p></section>}
      <div className="mt-4"><EpochTimeline outcomes={state?.outcomes ?? []} nextEpoch={state?.day.nextEpoch ?? hour} live={Boolean(state)} /></div>
      {state && <div className="mt-4"><TxFeed outcomes={feedOutcomes} explorerUrl={mstTestnet.blockExplorers.default.url} chainId={state.chainId} /></div>}
      {state?.day.nextEpoch === 24 && state.day.status === "active" && <div className="close-day-row"><button className="button button-primary" onClick={() => void closeCompletedDay()} disabled={liveBusy}>Close day after 24 confirmed epochs</button><span>Close uses the same deterministic request ID on retry and returns certificate evidence only after its receipt is confirmed.</span></div>}

      <p className="assumption mt-4">Account persistence seam: {serviceNotice ? "typed service unavailable" : "Prompt 1 service interface active"}. The offline adapter intentionally stores no authoritative day data; the relayer remains the source of truth.</p>
    </main>
  );
}
