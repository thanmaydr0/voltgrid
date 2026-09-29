"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { EmergencyPanel } from "@/components/EmergencyPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { useReceiptDay } from "@/app/domain/use-receipt-day";
import { makeSimulationSnapshot } from "@/lib/simulation";
import { mstTestnet } from "@/lib/chains";
import type { Scenario } from "@/lib/fixture";

function formatVlt(value: string | undefined) {
  if (!value) return "not returned";
  try { return `${formatUnits(BigInt(value), 18)} VLT`; } catch { return "not returned"; }
}

export function EmergencyView() {
  const [scenario, setScenario] = useState<Scenario>("heatwave");
  const [seed, setSeed] = useState("emergency-preview");
  const [hour, setHour] = useState(19);
  const receipt = useReceiptDay();
  const snapshot = useMemo(() => makeSimulationSnapshot(scenario, seed, hour, false), [hour, scenario, seed]);
  const emergencyRows = receipt.state?.outcomes.filter((outcome) => outcome.kind === "emergency") ?? [];
  const selectedOutcome = emergencyRows[emergencyRows.length - 1];
  const confirmed = selectedOutcome?.status === "confirmed";

  return (
    <main id="main-content" className="dashboard-shell !pt-8 sm:!pt-12">
      <header className="mb-5 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">VoltGrid / emergency</p><h1 className="!mb-2 !max-w-3xl !text-4xl sm:!text-5xl">Stress proposal, explicit consent, honest receipts.</h1><p className="!mb-0 !max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">Heatwave stress is a deterministic proposal. This screen never claims utility dispatch or a physical battery response.</p></div><StatusBadge status={confirmed ? "confirmed on-chain" : snapshot.proposedEmergency ? "preview simulation" : "unavailable"} /></header>

      <section className="card mb-4 !p-4 sm:!p-5" aria-labelledby="emergency-preview-title"><div className="card-heading"><div><p className="eyebrow">Modelled proposal</p><h2 id="emergency-preview-title">Explore feeder stress</h2></div><StatusBadge status="preview simulation" /></div><div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-xs text-[var(--ink-soft)]"><span>Scenario</span><select className="min-h-11 rounded-lg border border-[var(--line-bright)] bg-[#0f1a1f] px-3 text-sm text-[var(--ink)]" value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}><option value="sunny">Sunny</option><option value="rainy">Rainy</option><option value="heatwave">Heatwave</option></select></label><label className="grid gap-1 text-xs text-[var(--ink-soft)] sm:col-span-2"><span>Seed</span><input className="min-h-11 rounded-lg border border-[var(--line-bright)] bg-[#0f1a1f] px-3 text-sm text-[var(--ink)]" value={seed} maxLength={256} onChange={(event) => setSeed(event.target.value)} /></label></div><label className="mt-3 grid gap-1 text-xs text-[var(--ink-soft)] sm:max-w-sm"><span>Preview hour: {String(hour).padStart(2, "0")}</span><input type="range" min="0" max="23" value={hour} onChange={(event) => setHour(Number(event.target.value))} aria-label="Emergency preview hour" /></label></section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]"><EmergencyPanel proposed={snapshot.proposedEmergency} proposedTargetWh={snapshot.output.proposedTargetWh} outcome={selectedOutcome} batteryState={snapshot.output.batteryState} explorerUrl={mstTestnet.blockExplorers.default.url} /><section className="card" aria-labelledby="consent-title"><div className="card-heading"><div><p className="eyebrow">Consent / fallback</p><h2 id="consent-title">A proposal is not permission</h2></div><StatusBadge status="unavailable" /></div><div className="grid gap-3 text-sm leading-6 text-[var(--ink-soft)]"><p><strong className="text-[var(--ink)]">Battery consent:</strong> a separate wallet-signed opt-in is required. This route does not infer it from registration or from a modelled battery.</p><p><strong className="text-[var(--ink)]">Fallback:</strong> if the receipt record reports no opted-in battery, no modelled energy, or an underfunded treasury, the resolved result stays at the returned value; this page does not fill the gap.</p><p><strong className="text-[var(--ink)]">Boundary:</strong> no real utility dispatch, physical state-of-charge, sensor measurement, or grid-saving claim is made.</p></div><Link className="button button-quiet mt-4 inline-block no-underline" href="/play#connect-wallet">Authorize a real-day read in Play</Link></section></div>

      <section className="card mt-4" aria-labelledby="emergency-receipt-title"><div className="card-heading"><div><p className="eyebrow">Confirmed outcome</p><h2 id="emergency-receipt-title">Receipt-derived stress result</h2></div><StatusBadge status={confirmed ? "confirmed on-chain" : selectedOutcome ? (selectedOutcome.status === "pending" ? "submitted / pending" : "unavailable") : "unavailable"} /></div>{selectedOutcome && <div className="grid gap-3 sm:grid-cols-3"><div><span className="text-xs text-[var(--ink-faint)]">Outcome</span><strong className="mt-1 block text-sm">{selectedOutcome.status === "confirmed" ? "confirmed emergency" : selectedOutcome.status}</strong></div><div><span className="text-xs text-[var(--ink-faint)]">Shaved Wh</span><strong className="mt-1 block text-sm">{confirmed ? `${selectedOutcome.metrics?.shavedWh ?? "not returned"} Wh` : "not settled"}</strong></div><div><span className="text-xs text-[var(--ink-faint)]">Payout</span><strong className="mt-1 block text-sm">{confirmed ? formatVlt(selectedOutcome.metrics?.payoutWei) : "not settled"}</strong></div></div>}{!selectedOutcome && <p className="empty-state">No emergency outcome is available for this wallet day. Preview proposals do not appear in activity or settled metrics.</p>}{selectedOutcome && <div className="mt-4 grid gap-2 border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-soft)]">{selectedOutcome.actions.map((action, index) => <div key={`${action.action}-${index}`} className="flex flex-wrap items-center justify-between gap-2"><span>{action.action}: {action.status}</span>{action.txHash ? <a className="break-all text-[var(--mint)]" href={`${mstTestnet.blockExplorers.default.url}/tx/${action.txHash}`} target="_blank" rel="noreferrer">{action.txHash}</a> : <span className="text-[var(--ink-faint)]">no receipt hash returned</span>}</div>)}</div>}<p className="assumption">Discharge Wh, payout, target, and shaved Wh are shown only when the relayer returns a confirmed emergency outcome with the expected receipt events.</p></section>
    </main>
  );
}
