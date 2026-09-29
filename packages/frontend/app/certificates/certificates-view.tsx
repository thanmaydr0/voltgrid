"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { useReceiptDay } from "@/app/domain/use-receipt-day";
import { CertificateCard } from "./certificate-card";
import type { CarbonCloseMetrics } from "@/lib/relayer";

export function CertificatesView() {
  const receipt = useReceiptDay();
  const closeAction = receipt.state?.closeAction;
  const metrics = closeAction?.status === "confirmed" && closeAction.metrics && "certificates" in closeAction.metrics ? closeAction.metrics as CarbonCloseMetrics : undefined;
  const certificates = metrics?.certificates ?? [];
  const closeHash = closeAction?.status === "confirmed" ? closeAction.txHash : undefined;

  return <main id="main-content" className="dashboard-shell !pt-8 sm:!pt-12">
    <header className="mb-5 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">VoltGrid / certificates</p><h1 className="!mb-2 !max-w-3xl !text-4xl sm:!text-5xl">Evidence for eligible sellers only.</h1><p className="!mb-0 !max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">A certificate record is visible only when the relayer returns a confirmed day-close record. It is a modelling record, not a verified credit or environmental claim.</p></div><StatusBadge status={certificates.length > 0 ? "confirmed on-chain" : "unavailable"} /></header>
    <section className="card mb-4 !p-4 sm:!p-5" aria-labelledby="certificate-rule-title"><div className="card-heading"><div><p className="eyebrow">Qualification rule</p><h2 id="certificate-rule-title">Confirmed seller allocation × configured factor</h2></div><StatusBadge status="preview simulation" /></div><div className="grid gap-3 text-sm leading-6 text-[var(--ink-soft)] sm:grid-cols-3"><p><strong className="text-[var(--ink)]">Eligible:</strong> integer matched P2P Wh from confirmed solar seller rows.</p><p><strong className="text-[var(--ink)]">Excluded:</strong> buyer totals, grid import/export and emergency discharge.</p><p><strong className="text-[var(--ink)]">Source:</strong> receipt-backed relayer close metrics plus immutable token metadata when configured.</p></div><p className="assumption">Factor source is the configured VoltGrid modelling assumption; no primary emissions source was verified. No physical meter, sensor or household verification is implied.</p></section>
    {receipt.status === "session-needed" && <section className="card mb-4 !p-4" role="status"><p className="mb-2 text-sm text-[var(--ink-soft)]">{receipt.message}</p><Link className="button button-primary inline-block no-underline" href="/play#connect-wallet">Authorize wallet in Play</Link></section>}
    {receipt.status === "error" && <p className="inline-error mb-4" role="alert">{receipt.message}</p>}
    {closeAction && closeAction.status !== "confirmed" && <section className="card mb-4 !p-4"><div className="card-heading"><h2>Close-day evidence is {closeAction.status}</h2><StatusBadge status={closeAction.status === "pending" ? "submitted / pending" : "unavailable"} /></div><p className="mb-0 text-sm leading-6 text-[var(--ink-soft)]">No certificate amount, factor, or retirement state is shown as settled until the expected DayClosed and certificate records are reconciled.</p></section>}
    {metrics && <section className="card mb-4 !p-4 sm:!p-5" aria-labelledby="close-summary-title"><div className="card-heading"><div><p className="eyebrow">Confirmed close</p><h2 id="close-summary-title">Day {receipt.state?.day.dayId}</h2></div><StatusBadge status="confirmed on-chain" /></div><dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-[var(--ink-faint)]">Eligible seller Wh</dt><dd className="mt-1 font-semibold">{metrics.totalEligibleWh.toLocaleString("en-IN")} Wh</dd></div><div><dt className="text-xs text-[var(--ink-faint)]">Factor</dt><dd className="mt-1 font-semibold">{metrics.factorGPerKwh} gCO₂e/kWh · v{metrics.factorVersion}</dd></div><div><dt className="text-xs text-[var(--ink-faint)]">Illustrative avoided amount</dt><dd className="mt-1 break-words font-semibold">{metrics.totalAvoidedMgCo2e} mgCO₂e</dd></div></dl>{closeHash && <a className="mt-3 block break-all text-xs text-[var(--mint)]" href={`https://testnet.mstscan.com/tx/${closeHash}`} target="_blank" rel="noreferrer">Confirmed close receipt · {closeHash}</a>}</section>}
    {metrics && certificates.length === 0 && <p className="empty-state">The confirmed day had zero eligible solar-seller allocation; no certificate was minted.</p>}
    {certificates.length > 0 && <section className="grid gap-3" aria-label="Eligible certificate records">{certificates.map((record) => <CertificateCard key={record.tokenId} record={record} />)}</section>}
    {!metrics && receipt.status !== "session-needed" && receipt.status !== "error" && <p className="empty-state">No confirmed day-close certificate evidence is available. Preview readings never create certificate records.</p>}
  </main>;
}
