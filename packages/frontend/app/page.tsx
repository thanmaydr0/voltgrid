"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { CarbonPanel } from "@/components/CarbonPanel";
import { EmergencyPanel } from "@/components/EmergencyPanel";
import { EpochTimeline } from "@/components/EpochTimeline";
import { NeighborhoodMap } from "@/components/NeighborhoodMap";
import { PriceChart } from "@/components/PriceChart";
import { ScenarioControls } from "@/components/ScenarioControls";
import { StatusBadge } from "@/components/StatusBadge";
import { TransformerGauge } from "@/components/TransformerGauge";
import { TxFeed } from "@/components/TxFeed";
import { WalletPanel } from "@/components/WalletPanel";
import { useRelayerSession } from "@/hooks/useRelayerSession";
import { mstTestnet } from "@/lib/chains";
import { type Scenario } from "@/lib/fixture";
import { makeSimulationSnapshot } from "@/lib/simulation";
import { advanceEpoch, closeDay, createDay, getCurrentDay, getDay, type ChainAction, type EpochOutcome, type HouseConfig } from "@/lib/relayer";

const RUN_KEY = "voltgrid:play-day";
const CARBON_RUN_KEY = "voltgrid:last-carbon-day";

type PersistedRun = {
  dayId: string;
  ownerAddress: string;
  clientRunId: string;
  scenario: Scenario;
  seed: string;
  viewerEvCharging: boolean;
  houses?: readonly HouseConfig[];
  transformerCapacityWh?: number;
  nextEpoch: number;
  status: "starting" | "active" | "closed" | "failed";
  outcomes: readonly EpochOutcome[];
  requests: Readonly<Record<string, string>>;
  closeRequestId?: string;
  closeAction?: ChainAction | null;
};

function requestId() {
  return crypto.randomUUID();
}

function readRun(key = RUN_KEY): PersistedRun | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null") as PersistedRun | null;
    if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value.dayId) || !value.clientRunId) return null;
    return value;
  } catch {
    return null;
  }
}

function saveRun(run: PersistedRun) {
  if (typeof window !== "undefined") window.localStorage.setItem(RUN_KEY, JSON.stringify(run));
}

function saveCarbonRun(run: PersistedRun) {
  if (typeof window !== "undefined") window.localStorage.setItem(CARBON_RUN_KEY, JSON.stringify(run));
}

function mergeOutcome(outcomes: readonly EpochOutcome[], outcome: EpochOutcome) {
  return [...outcomes.filter((item) => item.epochIndex !== outcome.epochIndex), outcome].sort((a, b) => a.epochIndex - b.epochIndex);
}

function statusMessage(run: PersistedRun | null, busy: boolean, error: string | null) {
  if (error) return error;
  if (busy) return "Waiting for a confirmed receipt… refresh is safe and the same request ID will be reconciled.";
  if (!run) return "Choose a scenario and seed, then connect a wallet to start a resumable real day.";
  if (run.status === "closed") return `Day complete: ${run.outcomes.length}/24 confirmed epochs. Receipt values are reconciled below.`;
  if (run.status === "starting") return "Day start is pending; retry to reconcile the DayStarted receipt.";
  if (run.nextEpoch >= 24) return "All 24 epochs are confirmed. Close day is the final receipt-backed step.";
  return `Day ${run.nextEpoch}/24: next epoch is ${String(run.nextEpoch).padStart(2, "0")}.`;
}

export default function Home() {
  const { address, chainId } = useAccount();
  const { session, isAuthenticating, withSession, error: authError } = useRelayerSession();
  const [scenario, setScenario] = useState<Scenario>("sunny");
  const [seed, setSeed] = useState("demo-seed");
  const [hour, setHour] = useState(7);
  const [isPlaying, setIsPlaying] = useState(false);
  const [viewerEvCharging, setViewerEvCharging] = useState(false);
  const [run, setRun] = useState<PersistedRun | null>(null);
  const [lastClosedRun, setLastClosedRun] = useState<PersistedRun | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [livePlaying, setLivePlaying] = useState(false);
  const processing = useRef(false);
  const activeRun = run?.status === "active" || run?.status === "starting" ? run : null;

  useEffect(() => {
    const savedCarbonRun = readRun(CARBON_RUN_KEY);
    if (savedCarbonRun && address && savedCarbonRun.ownerAddress.toLowerCase() === address.toLowerCase() && savedCarbonRun.status === "closed") {
      setLastClosedRun(savedCarbonRun);
    } else setLastClosedRun(null);
    const stored = readRun();
    if (!stored || !address || stored.ownerAddress.toLowerCase() !== address.toLowerCase()) {
      setRun(null);
      return;
    }
    setRun(stored);
    if (stored.status === "closed") {
      setLastClosedRun(stored);
      saveCarbonRun(stored);
    }
    setScenario(stored.scenario);
    setSeed(stored.seed);
    setViewerEvCharging(stored.viewerEvCharging);
  }, [address]);

  const snapshot = useMemo(() => makeSimulationSnapshot(
    activeRun?.scenario ?? scenario,
    activeRun?.seed ?? seed,
    Math.min(activeRun?.nextEpoch ?? hour, 23),
    activeRun?.viewerEvCharging ?? viewerEvCharging,
    address,
    activeRun?.dayId as `0x${string}` | undefined,
  ), [activeRun, address, hour, scenario, seed, viewerEvCharging]);

  const persist = useCallback((next: PersistedRun) => {
    setRun(next);
    saveRun(next);
  }, []);

  const reconcileCurrent = useCallback(async (token: string, expectedAddress: string) => {
    const current = await getCurrentDay(token);
    if (!current.day || current.day.ownerAddress.toLowerCase() !== expectedAddress.toLowerCase()) return null;
    const existing = readRun();
    const next: PersistedRun = {
      dayId: current.day.dayId,
      ownerAddress: current.day.ownerAddress,
      clientRunId: current.day.clientRunId,
      scenario: current.day.scenario,
      seed: current.day.seed,
      viewerEvCharging: current.day.viewerEvCharging,
      houses: current.day.houses,
      transformerCapacityWh: current.day.transformerCapacityWh,
      nextEpoch: current.day.nextEpoch,
      status: current.day.status,
      outcomes: current.outcomes,
      closeAction: current.closeAction,
      requests: existing?.dayId === current.day.dayId ? existing.requests : {},
      closeRequestId: existing?.dayId === current.day.dayId ? existing.closeRequestId : undefined,
    };
    persist(next);
    setScenario(next.scenario);
    setSeed(next.seed);
    setViewerEvCharging(next.viewerEvCharging);
    return next;
  }, [persist]);

  const startOrResume = useCallback(async () => {
    setLiveError(null);
    if (!address) {
      setLiveError("Connect a wallet before starting a real day.");
      return;
    }
    if (chainId !== mstTestnet.id) {
      setLiveError(`Wrong network: switch the wallet to MST Testnet (${mstTestnet.id}) before signing.`);
      return;
    }
    setLiveBusy(true);
    try {
      const current = await withSession((token) => reconcileCurrent(token, address));
      if (current && current.status === "starting") {
        const retried = await withSession((token) => createDay({ clientRunId: current.clientRunId, scenario: current.scenario, seed: current.seed, viewerEvCharging: current.viewerEvCharging }, token));
        if (retried.status === "confirmed") {
          persist({ ...current, status: "active" });
          setLivePlaying(true);
        } else {
          setLiveError("Day start is still pending. Retry again to reconcile the same start action.");
        }
        return;
      }
      if (current && current.status === "active") {
        setLivePlaying(true);
        return;
      }
      const clientRunId = requestId();
      const created = await withSession((token) => createDay({ clientRunId, scenario, seed, viewerEvCharging }, token));
      if (created.status !== "confirmed") {
        setLiveError("Day start is not confirmed yet. Press Play real day again to reconcile it; no epoch was submitted.");
        return;
      }
      const startedDay = await withSession((token) => getDay(created.dayId, token));
      const started: PersistedRun = {
        dayId: created.dayId,
        ownerAddress: address,
        clientRunId,
        scenario,
        seed,
        viewerEvCharging,
        houses: startedDay.day.houses,
        transformerCapacityWh: startedDay.day.transformerCapacityWh,
        nextEpoch: 0,
        status: "active",
        outcomes: [],
        requests: {},
      };
      persist(started);
      setLivePlaying(true);
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "The real day could not be started.");
    } finally {
      setLiveBusy(false);
    }
  }, [address, chainId, persist, reconcileCurrent, scenario, seed, viewerEvCharging, withSession]);

  const advanceOne = useCallback(async () => {
    if (!run || !address || run.status !== "active" || run.nextEpoch >= 24 || processing.current) return;
    processing.current = true;
    setLiveBusy(true);
    setLiveError(null);
    const epoch = run.nextEpoch;
    const clientRequestId = run.requests[String(epoch)] ?? requestId();
    const withRequest = run.requests[String(epoch)] ? run : { ...run, requests: { ...run.requests, [String(epoch)]: clientRequestId } };
    if (withRequest !== run) persist(withRequest);
    try {
      const result = await withSession((token) => advanceEpoch(run.dayId, epoch, clientRequestId, token));
      const updated: PersistedRun = {
        ...withRequest,
        nextEpoch: result.status === "confirmed" ? Math.max(withRequest.nextEpoch, epoch + 1) : withRequest.nextEpoch,
        outcomes: mergeOutcome(withRequest.outcomes, result),
      };
      persist(updated);
      if (result.status !== "confirmed") {
        setLivePlaying(false);
        setLiveError("This receipt is pending or unknown. Retry the same epoch to reconcile without submitting a second transaction.");
      }
    } catch (error) {
      setLivePlaying(false);
      setLiveError(error instanceof Error ? error.message : "The epoch could not be reconciled.");
    } finally {
      processing.current = false;
      setLiveBusy(false);
    }
  }, [address, persist, run, withSession]);

  useEffect(() => {
    if (!livePlaying || !run || run.status !== "active") return;
    if (run.nextEpoch >= 24) {
      setLivePlaying(false);
      return;
    }
    void advanceOne();
  }, [advanceOne, livePlaying, run]);

  const closeCompletedDay = useCallback(async () => {
    if (!run || !address || run.nextEpoch !== 24) return;
    setLiveBusy(true);
    setLiveError(null);
    const id = run.closeRequestId ?? requestId();
    const withRequest = run.closeRequestId ? run : { ...run, closeRequestId: id };
    if (withRequest !== run) persist(withRequest);
    try {
      const result = await withSession((token) => closeDay(run.dayId, id, token));
      if (result.status === "confirmed") {
        const closedRun = { ...withRequest, status: "closed" as const, closeAction: result.closeAction };
        persist(closedRun);
        setLastClosedRun(closedRun);
        saveCarbonRun(closedRun);
      }
      else setLiveError("Day close is not confirmed yet. Retry to reconcile the same close request.");
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Day close could not be reconciled.");
    } finally {
      setLiveBusy(false);
    }
  }, [address, persist, run, withSession]);

  async function retryOrStart() {
    if (run && run.status === "active") {
      if (run.nextEpoch >= 24) await closeCompletedDay();
      else { setLivePlaying(true); await advanceOne(); }
    } else {
      await startOrResume();
    }
  }

  function resetPreview() {
    setIsPlaying(false);
    setHour(7);
  }

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setHour((current) => current >= 23 ? (setIsPlaying(false), 0) : current + 1), 900);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const displayedOutcomes = run?.outcomes ?? [];
  const activeHour = activeRun?.nextEpoch ?? hour;
  const activeEmergencyOutcome = displayedOutcomes.find((outcome) => outcome.epochIndex === activeHour && outcome.kind === "emergency")
    ?? displayedOutcomes.filter((outcome) => outcome.kind === "emergency").slice(-1)[0];
  const liveStatus = statusMessage(run, liveBusy || isAuthenticating, liveError ?? authError);

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to dashboard</a>
      <header className="site-header"><div className="header-inner">
        <a className="brand" href="#main-content" aria-label="VoltGrid dashboard home"><span className="brand-mark" aria-hidden="true">V</span><span><strong>voltgrid</strong><small>neighbourhood energy, honestly settled</small></span></a>
        <div className="header-meta"><span className="network-chip"><i aria-hidden="true" /> MST TESTNET ONLY</span><span className="header-model">Model v1 · sim-core + receipt state</span></div>
      </div></header>

      <main id="main-content" className="dashboard-shell">
        <section className="hero" aria-labelledby="page-title"><div className="hero-copy">
          <p className="eyebrow">Local energy exchange / control room</p><h1 id="page-title">See the neighbourhood before the market moves.</h1>
          <p className="hero-lede">A transparent control room for deterministic meter simulation, modelled price signals and receipt-backed MST Testnet settlement.</p>
          <div className="hero-status"><StatusBadge status={run?.status === "closed" ? "confirmed on-chain" : run ? "submitted / pending" : "preview simulation"} /><span>{run ? `${run.scenario} · epoch ${String(Math.min(activeHour, 23)).padStart(2, "0")}` : `${scenario} · preview hour ${String(hour).padStart(2, "0")}`}</span></div>
        </div><div className="hero-orb" aria-hidden="true"><span>24</span><small>epochs / day</small></div></section>

        <aside className="simulation-notice" role="note"><span className="notice-icon" aria-hidden="true">i</span><div><strong>Simulation boundary</strong><span>Modelled meters and treasury assumptions are clearly labelled. A settled value appears only after the relayer confirms and decodes the expected receipt event; no browser reading is authoritative.</span></div></aside>

        <div className="top-grid">
          <ScenarioControls scenario={activeRun?.scenario ?? scenario} setScenario={(next) => { if (!activeRun) { setScenario(next); setHour(7); setIsPlaying(false); } }} seed={activeRun?.seed ?? seed} setSeed={(next) => { if (!activeRun) setSeed(next); }} hour={activeHour} isPlaying={isPlaying} onPlay={() => setIsPlaying((current) => !current)} onReset={resetPreview} viewerEvCharging={activeRun?.viewerEvCharging ?? viewerEvCharging} setViewerEvCharging={(value) => { if (!activeRun) setViewerEvCharging(value); }} onStartReal={retryOrStart} liveStatus={liveStatus} liveBusy={liveBusy || isAuthenticating} locked={Boolean(activeRun)} />
          <WalletPanel />
        </div>

        <div className="primary-grid"><NeighborhoodMap houses={snapshot.houses} /><div className="side-stack"><TransformerGauge load={snapshot.totalConsumptionWh} capacity={snapshot.transformerCapacityWh} /><EmergencyPanel proposed={snapshot.proposedEmergency} proposedTargetWh={snapshot.output.proposedTargetWh} outcome={activeEmergencyOutcome} batteryState={snapshot.output.batteryState} explorerUrl={mstTestnet.blockExplorers.default.url} /></div></div>
        <div className="secondary-grid"><PriceChart scenario={activeRun?.scenario ?? scenario} seed={activeRun?.seed ?? seed} activeHour={activeHour} viewerEvCharging={activeRun?.viewerEvCharging ?? viewerEvCharging} viewerAddress={address} /><TxFeed outcomes={displayedOutcomes} explorerUrl={mstTestnet.blockExplorers.default.url} chainId={mstTestnet.id} /></div>
        <EpochTimeline outcomes={displayedOutcomes} nextEpoch={run?.nextEpoch ?? activeHour} live={Boolean(run)} />
        {run?.nextEpoch === 24 && run.status === "active" && <div className="close-day-row"><button className="button button-primary" onClick={() => void closeCompletedDay()} disabled={liveBusy}>Close day after 24 confirmed epochs</button><span>Close is a separate receipt-backed action; it does not alter epoch metrics.</span></div>}

        <div className="bottom-grid"><CarbonPanel run={run?.status === "closed" ? run : lastClosedRun} /><section className="card data-contract-card" aria-labelledby="data-title"><div className="card-heading"><div><p className="eyebrow">Data contract</p><h2 id="data-title">What each state means</h2></div><StatusBadge status="unavailable" /></div><div className="status-list"><div><StatusBadge status="preview simulation" /><span>Local deterministic sim-core output; safe to animate, never a settled trade.</span></div><div><StatusBadge status="submitted / pending" /><span>Real request sent; receipt not yet confirmed; no settled metrics asserted.</span></div><div><StatusBadge status="confirmed on-chain" /><span>Decoded from a successful receipt/log; actual hash and block are required.</span></div><div><StatusBadge status="unavailable" /><span>Integration or evidence is missing; the affected action stays disabled.</span></div></div><p className="assumption">All economic parameters, weather and treasury values are modelled assumptions. Sensor adapters remain optional and are not connected by default.</p></section></div>
        <footer className="site-footer"><span>VoltGrid integration · no private key · no fake hashes · no mainnet route</span><span>Live day: {run ? `${run.outcomes.length}/24 outcomes` : "not started"} · {session ? "relayer session present" : "wallet authorization required"}</span></footer>
      </main>
    </>
  );
}
