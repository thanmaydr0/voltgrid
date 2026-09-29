"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { StatusBadge } from "@/components/StatusBadge";
import { BentoGrid } from "@/components/ui/bento-grid";
import { useReceiptDay } from "@/app/domain/use-receipt-day";
import { makeSimulationSnapshot } from "@/lib/simulation";
import { mstTestnet } from "@/lib/chains";

function shortAddress(address: string) {
  return `${address.slice(0, 7)}…${address.slice(-5)}`;
}

export function OverviewView() {
  const { address } = useAccount();
  const [scenario] = useState<"sunny" | "rainy" | "heatwave">("sunny");
  const day = useReceiptDay();
  const snapshot = useMemo(() => makeSimulationSnapshot(scenario, "overview-preview", 7, false, address), [address, scenario]);
  const currentOutcome = day.state?.outcomes[day.state.outcomes.length - 1];
  const latestConfirmedAction = day.state?.outcomes
    .flatMap((outcome) => outcome.actions.map((action) => ({ action, epochIndex: outcome.epochIndex })))
    .reverse()
    .find(({ action }) => action.status === "confirmed" && action.txHash);
  const walletStatus = !address ? "unavailable" : day.status === "ready" ? "confirmed on-chain" : "unavailable";
  const nextAction = !address ? "Connect a wallet when you want receipt-backed day data." : day.status === "session-needed" ? "Authorize the wallet in Play to resume or start a real day." : day.state?.day.status === "active" ? `Continue epoch ${String(day.state.day.nextEpoch).padStart(2, "0")} in Play.` : "Choose a deterministic scenario and preview the next action.";

  return (
    <main id="main-content" className="dashboard-shell !pt-8 sm:!pt-12">
      <header className="mb-5 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">VoltGrid / overview</p>
          <h1 className="!mb-2 !max-w-3xl !text-4xl sm:!text-5xl">A neighbourhood view you can verify.</h1>
          <p className="!mb-0 !max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">See what is modelled, what is on-chain, and what needs your wallet. Preview remains useful without an account or a connected wallet.</p>
        </div>
        <StatusBadge status={day.state ? (day.state.day.status === "closed" ? "confirmed on-chain" : "submitted / pending") : "preview simulation"} />
      </header>

      <section className="mb-5 rounded-[var(--radius)] border border-[rgba(229,184,92,.35)] bg-[rgba(229,184,92,.08)] p-4" aria-label="Next action">
        <p className="eyebrow !mb-1">Next action</p>
        <p className="mb-3 text-sm leading-6 text-[#f5e6bf]" aria-live="polite">{nextAction}</p>
        <Link className="button button-primary inline-block no-underline" href={address ? "/play" : "/play#connect-wallet"}>{address ? "Open Play" : "Explore Play"}</Link>
      </section>

      <section aria-label="Neighbourhood overview cards">
        <BentoGrid>
        <article className="card !p-4 sm:!p-5">
          <div className="card-heading"><div><p className="eyebrow">Scenario / day status</p><h2>Modelled day</h2></div><StatusBadge status="preview simulation" /></div>
          <p className="mb-4 text-sm leading-6 text-[var(--ink-soft)]">{day.state ? `${day.state.day.scenario} · ${day.state.day.nextEpoch}/24 epochs reached` : "Sunny preview · epoch 07"}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-[var(--ink-faint)]">Preview source</dt><dd className="mt-1 font-semibold">sim-core v1</dd></div>
            <div><dt className="text-xs text-[var(--ink-faint)]">Settled source</dt><dd className="mt-1 font-semibold">{day.state ? "receipt records" : "none yet"}</dd></div>
          </dl>
          <p className="assumption">Preview numbers are not settlement. A confirmed day is read back from the relayer and chain.</p>
        </article>

        <article className="card !p-4 sm:!p-5">
          <div className="card-heading"><div><p className="eyebrow">Feeder stress</p><h2>Transformer T-01</h2></div><StatusBadge status="preview simulation" /></div>
          <div className="mb-3 flex items-end gap-3"><strong className="text-4xl tracking-[-.08em]">{Math.round(snapshot.stressPercent)}%</strong><span className="pb-1 text-xs text-[var(--ink-soft)]">modelled at preview hour 07</span></div>
          <div className="h-3 overflow-hidden rounded-full bg-[#0d1519]" role="meter" aria-label="Modelled transformer stress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(snapshot.stressPercent))}><span className="block h-full rounded-full bg-[var(--gold)]" style={{ width: `${Math.min(100, Math.max(0, snapshot.stressPercent))}%` }} /></div>
          <p className="assumption">{snapshot.totalConsumptionWh.toLocaleString("en-IN")} Wh modelled load / {snapshot.transformerCapacityWh.toLocaleString("en-IN")} Wh fixture capacity. This is not telemetry.</p>
        </article>

        <article className="card !p-4 sm:!p-5" id="wallet-status">
          <div className="card-heading"><div><p className="eyebrow">Wallet / network</p><h2>Write boundary</h2></div><StatusBadge status={walletStatus} /></div>
          <p className="mb-3 break-words text-sm leading-6 text-[var(--ink-soft)]">{address ? shortAddress(address) : "No wallet connected"}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-[var(--ink-faint)]">Network</dt><dd className="mt-1 font-semibold">MST Testnet</dd></div><div><dt className="text-xs text-[var(--ink-faint)]">Chain ID</dt><dd className="mt-1 font-semibold">{mstTestnet.id}</dd></div></dl>
          <p className="assumption">{day.status === "session-needed" ? "A wallet signature is required before protected day reads." : "Wallet signatures authorize relayer and chain writes; account services are separate."}</p>
        </article>

        <article className="card !p-4 sm:!p-5">
          <div className="card-heading"><div><p className="eyebrow">Recent confirmed event</p><h2>Receipt trail</h2></div><StatusBadge status={latestConfirmedAction ? "confirmed on-chain" : "unavailable"} /></div>
          {latestConfirmedAction?.action.txHash ? <>
            <p className="mb-2 text-sm">Epoch {String(latestConfirmedAction.epochIndex).padStart(2, "0")} · {latestConfirmedAction.action.action}</p>
            <a className="break-all text-xs text-[var(--mint)]" href={`${mstTestnet.blockExplorers.default.url}/tx/${latestConfirmedAction.action.txHash}`} target="_blank" rel="noreferrer">{latestConfirmedAction.action.txHash}</a>
            <p className="assumption">Confirmed receipt returned by the relayer. Preview events never appear here.</p>
          </> : <p className="mb-0 text-sm leading-6 text-[var(--ink-faint)]">No confirmed event is available for this wallet session. Start or resume a day in Play to create receipt-backed activity.</p>}
        </article>
        </BentoGrid>
      </section>

      <section className="card mt-4 !p-4 sm:!p-5" aria-labelledby="overview-state-title">
        <div className="card-heading"><div><p className="eyebrow">Data contract</p><h2 id="overview-state-title">State labels stay separate</h2></div><StatusBadge status="unavailable" /></div>
        <div className="grid gap-3 text-xs leading-5 text-[var(--ink-soft)] sm:grid-cols-2 lg:grid-cols-3"><p><StatusBadge status="preview simulation" /> Model output only.</p><p><StatusBadge status="submitted / pending" /> Request sent; receipt not confirmed.</p><p><StatusBadge status="confirmed on-chain" /> Expected receipt event and hash returned.</p><p><StatusBadge status="unavailable" /> Offline, unauthorized, or missing evidence.</p></div>
        <p className="assumption">No browser reading, physical battery state, household verification, emissions factor source, or public deployment claim is inferred from this screen.</p>
        {currentOutcome && <p className="assumption">Latest relayer outcome: epoch {currentOutcome.epochIndex} · {currentOutcome.kind} · {currentOutcome.status}.</p>}
      </section>
    </main>
  );
}
