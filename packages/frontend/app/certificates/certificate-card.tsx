"use client";

import { useState } from "react";
import { parseEventLogs } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { CARBON_CERTIFICATE_ABI } from "voltgrid-shared";
import { StatusBadge } from "@/components/StatusBadge";
import { contractAddresses, hasCertificateAddress } from "@/lib/addresses";
import { mstTestnet } from "@/lib/chains";
import type { CarbonCertificate } from "@/lib/relayer";

const FACTOR_SOURCE = "Configurable VoltGrid modelling assumption; no primary emissions source was verified.";

export function CertificateCard({ record }: { record: CarbonCertificate }) {
  const { address, chainId, isConnected } = useAccount();
  const client = usePublicClient({ chainId: mstTestnet.id });
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retireHash, setRetireHash] = useState<`0x${string}` | undefined>();
  const [retireConfirmed, setRetireConfirmed] = useState(false);
  const enabled = hasCertificateAddress;
  const tokenId = BigInt(record.tokenId);
  const owner = useReadContract({ address: contractAddresses.certificate, abi: CARBON_CERTIFICATE_ABI, functionName: "ownerOf", args: [tokenId], chainId: mstTestnet.id, query: { enabled } });
  const retired = useReadContract({ address: contractAddresses.certificate, abi: CARBON_CERTIFICATE_ABI, functionName: "retired", args: [tokenId], chainId: mstTestnet.id, query: { enabled } });
  const data = useReadContract({ address: contractAddresses.certificate, abi: CARBON_CERTIFICATE_ABI, functionName: "certificateData", args: [tokenId], chainId: mstTestnet.id, query: { enabled } });
  const ownerAddress = typeof owner.data === "string" ? owner.data : undefined;
  const onChainData = data.data as unknown as { dayId?: string; eligibleWh?: bigint; factorGPerKwh?: bigint; factorVersion?: bigint; avoidedMgCo2e?: bigint } | undefined;
  const metadataMatches = Boolean(onChainData && onChainData.dayId?.toLowerCase() === record.dayId.toLowerCase() && Number(onChainData.eligibleWh) === record.eligibleWh && Number(onChainData.factorGPerKwh) === record.factorGPerKwh && Number(onChainData.factorVersion) === record.factorVersion && String(onChainData.avoidedMgCo2e) === record.avoidedMgCo2e);
  const isRetired = retired.data === true;
  const isOwner = Boolean(address && ownerAddress?.toLowerCase() === address.toLowerCase());
  const canRetire = Boolean(enabled && isConnected && chainId === mstTestnet.id && isOwner && !isRetired && !busy && client && contractAddresses.certificate);

  async function retireCertificate() {
    if (!canRetire || !client || !contractAddresses.certificate || !address) return;
    setBusy(true); setError(null); setRetireHash(undefined); setRetireConfirmed(false);
    try {
      const hash = await writeContractAsync({ address: contractAddresses.certificate, abi: CARBON_CERTIFICATE_ABI, functionName: "retire", args: [tokenId], chainId: mstTestnet.id });
      setRetireHash(hash);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Retirement transaction reverted; on-chain state is unchanged.");
      const logs = parseEventLogs({ abi: CARBON_CERTIFICATE_ABI, logs: receipt.logs, eventName: "CertificateRetired", strict: false });
      const matched = logs.some((log) => log.address.toLowerCase() === contractAddresses.certificate!.toLowerCase() && log.args.tokenId === tokenId && log.args.owner?.toLowerCase() === address.toLowerCase());
      if (!matched) throw new Error("Successful receipt did not contain this token's expected CertificateRetired event.");
      setRetireConfirmed(true);
      await Promise.all([retired.refetch(), owner.refetch()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The retirement wallet action could not be confirmed.");
    } finally { setBusy(false); }
  }

  return <article className="rounded-xl border border-[var(--line)] bg-[rgba(11,17,21,.34)] p-3 sm:p-4">
    <div className="card-heading"><div><h3 className="!mb-1 text-sm">Solar seller record #{record.tokenId}</h3><p className="mb-0 break-all text-xs text-[var(--ink-faint)]">seller {record.solarSeller}</p></div><StatusBadge status={enabled ? (isRetired ? "confirmed on-chain" : "confirmed on-chain") : "unavailable"} /></div>
    <dl className="grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-[var(--ink-faint)]">Eligible seller allocation</dt><dd className="mt-1 font-semibold">{record.eligibleWh.toLocaleString("en-IN")} Wh</dd></div><div><dt className="text-[var(--ink-faint)]">Factor / version</dt><dd className="mt-1 font-semibold">{record.factorGPerKwh} gCO₂e/kWh · v{record.factorVersion}</dd></div><div><dt className="text-[var(--ink-faint)]">Immutable formula</dt><dd className="mt-1 break-words font-semibold">{record.eligibleWh} × {record.factorGPerKwh} = {record.avoidedMgCo2e} mgCO₂e</dd></div><div><dt className="text-[var(--ink-faint)]">Retirement state</dt><dd className="mt-1 font-semibold">{!enabled ? "certificate contract unavailable" : retired.isLoading ? "reading…" : isRetired ? "retired / transfer blocked" : retired.isError ? "unknown" : "active"}</dd></div></dl>
    <p className="mb-0 mt-3 text-xs leading-5 text-[var(--ink-faint)]">Eligible amount comes only from confirmed solar-seller P2P allocations. Buyer share, import/export and emergency discharge are excluded. Factor source: {FACTOR_SOURCE}</p>
    <p className="mb-0 mt-2 text-xs text-[var(--ink-faint)]">On-chain immutable metadata: {!enabled ? "not configured" : data.isLoading ? "reading…" : metadataMatches ? "matches returned mint record" : data.isError ? "unavailable" : "mismatch — not treated as verified"}.</p>
    <div className="mt-3 grid gap-2 text-xs"><a className="break-all text-[var(--mint)]" href={`${mstTestnet.blockExplorers.default.url}/tx/${record.txHash}`} target="_blank" rel="noreferrer">Mint receipt · block {record.blockNumber} · {record.txHash}</a>{retireHash && <a className="break-all text-[var(--mint)]" href={`${mstTestnet.blockExplorers.default.url}/tx/${retireHash}`} target="_blank" rel="noreferrer">{retireConfirmed ? "Confirmed retirement receipt" : "Submitted retirement transaction"} · {retireHash}</a>}</div>
    {enabled && isOwner && !isRetired && <button className="button button-primary mt-3" type="button" onClick={() => void retireCertificate()} disabled={!canRetire}>{busy ? "Awaiting retirement receipt…" : chainId === mstTestnet.id ? "Retire this record (wallet signature)" : "Switch wallet to MST Testnet"}</button>}
    {enabled && isConnected && !isOwner && !owner.isLoading && <p className="mb-0 mt-3 text-xs text-[var(--ink-faint)]">Only the current token owner can retire this record.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {retireConfirmed && <p className="wallet-success" role="status">CertificateRetired was confirmed. Transfers are blocked by the contract.</p>}
  </article>;
}
