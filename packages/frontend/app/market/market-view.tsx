"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { PriceChart } from "@/components/PriceChart";
import { StatusBadge } from "@/components/StatusBadge";
import { useReceiptDay } from "@/app/domain/use-receipt-day";
import { makePriceSeries } from "@/lib/fixture";
import type { Scenario } from "@/lib/fixture";

function settledPrice(micro: string | undefined) {
  if (!micro || !/^\d+$/.test(micro)) return null;
  const value = Number(micro) / 1_000_000;
  return Number.isFinite(value) ? `₹${value.toFixed(2)} / kWh` : null;
}

export function MarketView() {
  const { address } = useAccount();
  const [scenario, setScenario] = useState<Scenario>("sunny");
  const [seed, setSeed] = useState("market-preview");
  const [hour, setHour] = useState(12);
  const receipt = useReceiptDay();
  const series = useMemo(() => makePriceSeries(scenario, seed, false, address), [address, scenario, seed]);
  const confirmedRows = receipt.state?.outcomes.filter((outcome) => outcome.kind === "normal" && outcome.status === "confirmed") ?? [];
  const liveRows = receipt.state?.outcomes.filter((outcome) => outcome.kind === "normal") ?? [];

  return (
    <main id="main-content" className="dashboard-shell !pt-8 sm:!pt-12">
      <header className="mb-5 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">VoltGrid / market</p><h1 className="!mb-2 !max-w-3xl !text-4xl sm:!text-5xl">A frozen curve, two kinds of truth.</h1><p className="!mb-0 !max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">The curve explains the deterministic preview. Only returned confirmed outcome metrics describe a settled epoch.</p></div><StatusBadge status="preview simulation" /></header>

      <section className="card mb-4 !p-4 sm:!p-5" aria-labelledby="curve-controls-title"><div className="card-heading"><div><p className="eyebrow">Preview controls</p><h2 id="curve-controls-title">Explore the model signal</h2></div><StatusBadge status="preview simulation" /></div><div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-xs text-[var(--ink-soft)]"><span>Scenario</span><select className="min-h-11 rounded-lg border border-[var(--line-bright)] bg-[#0f1a1f] px-3 text-sm text-[var(--ink)]" value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}><option value="sunny">Sunny</option><option value="rainy">Rainy</option><option value="heatwave">Heatwave</option></select></label><label className="grid gap-1 text-xs text-[var(--ink-soft)] sm:col-span-2"><span>Seed</span><input className="min-h-11 rounded-lg border border-[var(--line-bright)] bg-[#0f1a1f] px-3 text-sm text-[var(--ink)]" value={seed} maxLength={256} onChange={(event) => setSeed(event.target.value)} /></label></div><label className="mt-3 grid gap-1 text-xs text-[var(--ink-soft)] sm:max-w-sm"><span>Preview hour: {String(hour).padStart(2, "0")}</span><input type="range" min="0" max="23" value={hour} onChange={(event) => setHour(Number(event.target.value))} aria-label="Preview hour" /></label></section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]"><PriceChart scenario={scenario} seed={seed} activeHour={hour} viewerEvCharging={false} viewerAddress={address} /><section className="card" aria-labelledby="curve-rules-title"><div className="card-heading"><div><p className="eyebrow">Frozen rules</p><h2 id="curve-rules-title">What the band means</h2></div><StatusBadge status="preview simulation" /></div><ul className="m-0 grid gap-3 pl-5 text-sm leading-6 text-[var(--ink-soft)]"><li>Modelled P2P price stays between the configured ₹3.00 floor and ₹7.00 cap.</li><li>Feed-in ₹2.50 and retail ₹8.00 are demo assumptions, not live tariffs.</li><li>On-chain balances and events report completed actions; they do not forecast this curve.</li></ul><p className="assumption">The chart is a visual model preview. Use the representative table below for a readable, non-chart summary.</p></section></div>

      <section className="card mt-4" aria-labelledby="preview-table-title"><div className="card-heading"><div><p className="eyebrow">Accessible summary</p><h2 id="preview-table-title">Preview curve checkpoints</h2></div><StatusBadge status="preview simulation" /></div><div className="overflow-x-auto"><table className="w-full min-w-[28rem] border-collapse text-left text-xs"><thead><tr className="text-[var(--ink-faint)]"><th className="border-b border-[var(--line)] p-2">Hour</th><th className="border-b border-[var(--line)] p-2">Model price</th><th className="border-b border-[var(--line)] p-2">Provenance</th></tr></thead><tbody>{[0, 6, 12, 18, 23].map((index) => <tr key={index}><td className="border-b border-[var(--line)] p-2">{String(index).padStart(2, "0")}</td><td className="border-b border-[var(--line)] p-2">{series[index] === null ? "No P2P trade" : `₹${series[index]!.toFixed(2)} / kWh`}</td><td className="border-b border-[var(--line)] p-2 text-[var(--gold)]">preview / sim-core</td></tr>)}</tbody></table></div></section>

      <section className="card mt-4" aria-labelledby="settled-market-title"><div className="card-heading"><div><p className="eyebrow">Receipt-backed market</p><h2 id="settled-market-title">Confirmed epoch matching</h2></div><StatusBadge status={confirmedRows.length > 0 ? "confirmed on-chain" : "unavailable"} /></div>{receipt.status === "session-needed" && <p className="mb-3 text-sm leading-6 text-[var(--ink-soft)]" role="status">{receipt.message} <Link className="text-[var(--mint)]" href="/play#connect-wallet">Authorize in Play</Link>.</p>}{receipt.status === "error" && <p className="inline-error" role="alert">{receipt.message}</p>}{receipt.status === "empty" && <p className="empty-state">No active or closed relayer day is available for this wallet. The preview remains separate.</p>}{confirmedRows.length === 0 && receipt.status !== "session-needed" && receipt.status !== "error" && receipt.status !== "empty" && <p className="empty-state">No confirmed market outcome is available yet. Pending, reverted, and unknown actions are not displayed as settled metrics.</p>}{liveRows.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[42rem] border-collapse text-left text-xs"><thead><tr className="text-[var(--ink-faint)]"><th className="border-b border-[var(--line)] p-2">Epoch</th><th className="border-b border-[var(--line)] p-2">Status</th><th className="border-b border-[var(--line)] p-2">Price</th><th className="border-b border-[var(--line)] p-2">Matched</th><th className="border-b border-[var(--line)] p-2">Import / export</th><th className="border-b border-[var(--line)] p-2">Receipt</th></tr></thead><tbody>{liveRows.map((outcome) => { const action = outcome.actions.find((item) => item.action === "settle"); const confirmed = outcome.status === "confirmed"; return <tr key={outcome.epochIndex}><td className="border-b border-[var(--line)] p-2">{String(outcome.epochIndex).padStart(2, "0")}</td><td className="border-b border-[var(--line)] p-2">{confirmed ? "confirmed" : outcome.status}</td><td className="border-b border-[var(--line)] p-2">{confirmed ? settledPrice(outcome.metrics?.priceMicroVltPerKwh) ?? "not returned" : "not settled"}</td><td className="border-b border-[var(--line)] p-2">{confirmed ? `${outcome.metrics?.matchedWh ?? "not returned"} Wh` : "not settled"}</td><td className="border-b border-[var(--line)] p-2">{confirmed ? `${outcome.metrics?.importedWh ?? "not returned"} / ${outcome.metrics?.exportedWh ?? "not returned"} Wh` : "not settled"}</td><td className="border-b border-[var(--line)] p-2">{confirmed && action?.txHash ? <a className="break-all text-[var(--mint)]" href={`https://testnet.mstscan.com/tx/${action.txHash}`} target="_blank" rel="noreferrer">{action.txHash}</a> : action?.status ?? "no receipt"}</td></tr>; })}</tbody></table></div>}<p className="assumption">Every number in this table is read from a returned confirmed outcome record. No price or Wh value is recomputed from the preview.</p></section>
    </main>
  );
}
