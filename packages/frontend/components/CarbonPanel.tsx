"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { parseEventLogs } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { MODEL_VERSION, simulateEpoch, type HouseConfig as SimHouseConfig, type ModelledEmergencyDischarge, type SimOutput } from "voltgrid-sim-core";
import { StatusBadge } from "@/components/StatusBadge";
import { mstTestnet } from "@/lib/chains";
import { contractAddresses, hasCertificateAddress } from "@/lib/addresses";
import type { ChainAction, CarbonCertificate, EpochOutcome, Scenario } from "@/lib/relayer";
import { CARBON_CERTIFICATE_ABI } from "voltgrid-shared";

type CarbonRun = Readonly<{
  dayId: string;
  scenario: Scenario;
  seed: string;
  status: "starting" | "active" | "closed" | "failed";
  viewerEvCharging: boolean;
  houses?: readonly SimHouseConfig[];
  transformerCapacityWh?: number;
  outcomes: readonly EpochOutcome[];
  closeAction?: ChainAction | null;
}>;

type ReplayRow = Readonly<{ output: SimOutput; outcome?: EpochOutcome }>;

const FACTOR_SOURCE = "Configurable VoltGrid modelling assumption; no primary emissions source was verified.";
const EXPLORER = mstTestnet.blockExplorers.default.url;

function closeMetrics(action?: ChainAction | null) {
  const metrics = action?.metrics;
  return metrics && "certificates" in metrics ? metrics : undefined;
}

function svgFromTokenUri(uri: unknown): string | undefined {
  if (typeof uri !== "string" || !uri.startsWith("data:application/json;base64,")) return undefined;
  try {
    const json = JSON.parse(window.atob(uri.slice("data:application/json;base64,".length))) as { image?: unknown };
    return typeof json.image === "string" && json.image.startsWith("data:image/svg+xml;base64,") ? json.image : undefined;
  } catch {
    return undefined;
  }
}

function CertificateCard({ record }: { record: CarbonCertificate }) {
  const { address, chainId, isConnected } = useAccount();
  const client = usePublicClient({ chainId: mstTestnet.id });
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retireHash, setRetireHash] = useState<`0x${string}` | undefined>();
  const [retireConfirmed, setRetireConfirmed] = useState(false);
  const enabled = hasCertificateAddress;
  const tokenId = BigInt(record.tokenId);
  const owner = useReadContract({
    address: contractAddresses.certificate,
    abi: CARBON_CERTIFICATE_ABI,
    functionName: "ownerOf",
    args: [tokenId],
    chainId: mstTestnet.id,
    query: { enabled },
  });
  const retired = useReadContract({
    address: contractAddresses.certificate,
    abi: CARBON_CERTIFICATE_ABI,
    functionName: "retired",
    args: [tokenId],
    chainId: mstTestnet.id,
    query: { enabled },
  });
  const data = useReadContract({
    address: contractAddresses.certificate,
    abi: CARBON_CERTIFICATE_ABI,
    functionName: "certificateData",
    args: [tokenId],
    chainId: mstTestnet.id,
    query: { enabled },
  });
  const tokenUri = useReadContract({
    address: contractAddresses.certificate,
    abi: CARBON_CERTIFICATE_ABI,
    functionName: "tokenURI",
    args: [tokenId],
    chainId: mstTestnet.id,
    query: { enabled },
  });
  const svg = useMemo(() => svgFromTokenUri(tokenUri.data), [tokenUri.data]);
  const ownerAddress = typeof owner.data === "string" ? owner.data : undefined;
  const onChainData = data.data as unknown as {
    dayId?: string;
    eligibleWh?: bigint;
    factorGPerKwh?: bigint;
    factorVersion?: bigint;
    avoidedMgCo2e?: bigint;
  } | undefined;
  const metadataMatches = Boolean(onChainData
    && onChainData.dayId?.toLowerCase() === record.dayId.toLowerCase()
    && Number(onChainData.eligibleWh) === record.eligibleWh
    && Number(onChainData.factorGPerKwh) === record.factorGPerKwh
    && Number(onChainData.factorVersion) === record.factorVersion
    && String(onChainData.avoidedMgCo2e) === record.avoidedMgCo2e);
  const isRetired = retired.data === true;
  const isOwner = Boolean(address && ownerAddress?.toLowerCase() === address.toLowerCase());
  const canRetire = Boolean(enabled && isConnected && chainId === mstTestnet.id && isOwner && !isRetired && !busy && client);

  async function retireCertificate() {
    if (!canRetire || !client || !contractAddresses.certificate || !address) return;
    setBusy(true);
    setError(null);
    setRetireHash(undefined);
    setRetireConfirmed(false);
    try {
      const hash = await writeContractAsync({
        address: contractAddresses.certificate,
        abi: CARBON_CERTIFICATE_ABI,
        functionName: "retire",
        args: [tokenId],
        chainId: mstTestnet.id,
      });
      setRetireHash(hash);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Retirement transaction reverted; the on-chain state is unchanged.");
      const logs = parseEventLogs({ abi: CARBON_CERTIFICATE_ABI, logs: receipt.logs, eventName: "CertificateRetired", strict: false });
      const confirmed = logs.some((log) => log.address.toLowerCase() === contractAddresses.certificate!.toLowerCase()
        && log.args.tokenId === tokenId
        && log.args.owner?.toLowerCase() === address.toLowerCase());
      if (!confirmed) throw new Error("Successful receipt did not contain this token's expected CertificateRetired event.");
      setRetireConfirmed(true);
      await Promise.all([retired.refetch(), owner.refetch()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The wallet action could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="certificate-card">
      <div className="certificate-heading">
        <div><strong>Solar seller record #{record.tokenId}</strong><span>{record.solarSeller}</span></div>
        <StatusBadge status={enabled ? (isRetired ? "confirmed on-chain" : "confirmed on-chain") : "unavailable"} />
      </div>
      {svg && <Image className="certificate-image" src={svg} alt={`On-chain illustrative record ${record.tokenId}, ${record.eligibleWh} eligible watt-hours`} width={600} height={360} unoptimized />}
      <dl className="certificate-values">
        <div><dt>Assigned eligible allocation</dt><dd>{record.eligibleWh.toLocaleString()} Wh</dd></div>
        <div><dt>Model factor / version</dt><dd>{record.factorGPerKwh} gCO₂e/kWh · v{record.factorVersion}</dd></div>
        <div><dt>Illustrative formula</dt><dd>{record.eligibleWh} × {record.factorGPerKwh} = {record.avoidedMgCo2e} mgCO₂e</dd></div>
      </dl>
      <p className="certificate-note">Seller-only share of confirmed simulated solar P2P `TradeSettled` allocations. Export, import, buyer share, and emergency discharge are excluded.</p>
      <p className="certificate-note">Factor source: {FACTOR_SOURCE}</p>
      <p className="certificate-note">Simulated readings: model-derived for {record.dayId.slice(0, 10)}…; receipt confirms the resulting allocation, not a physical meter or external sensor.</p>
      <p className="certificate-note">On-chain metadata: {enabled ? (metadataMatches ? "matches mint event" : data.isLoading ? "reading…" : "unavailable or mismatch") : "certificate address not configured"} · retirement: {enabled ? (isRetired ? "retired (transfer blocked)" : "active") : "unavailable"}</p>
      <div className="certificate-links">
        <a href={`${EXPLORER}/tx/${record.txHash}`} target="_blank" rel="noreferrer">View confirmed mint receipt · block {record.blockNumber}</a>
        {retireHash && <a href={`${EXPLORER}/tx/${retireHash}`} target="_blank" rel="noreferrer">View {retireConfirmed ? "confirmed retirement" : "submitted retirement"}</a>}
      </div>
      {enabled && isOwner && !isRetired && <button className="button button-primary" type="button" onClick={() => void retireCertificate()} disabled={!canRetire}>{busy ? "Awaiting confirmed retirement…" : chainId === mstTestnet.id ? "Retire this record (wallet signature)" : "Switch wallet to MST Testnet to retire"}</button>}
      {enabled && isConnected && !isOwner && !owner.isLoading && <p className="certificate-note">Only the current token owner can retire this record.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {retireConfirmed && <p className="wallet-success" role="status">Retirement event confirmed. Transfers are now blocked on chain.</p>}
    </article>
  );
}

export function CarbonPanel({ run }: { run: CarbonRun | null }) {
  const metrics = run?.status === "closed" && run.closeAction?.status === "confirmed" ? closeMetrics(run.closeAction) : undefined;
  const action = run?.closeAction;
  const confirmed = Boolean(metrics && action?.txHash && action.blockNumber);
  const replay = useMemo(() => {
    if (!run?.houses?.length || !run.transformerCapacityWh) return [];
    const discharges: ModelledEmergencyDischarge[] = [];
    const rows: ReplayRow[] = [];
    for (let epochIndex = 0; epochIndex < 24; epochIndex += 1) {
      const output = simulateEpoch({
        modelVersion: MODEL_VERSION,
        scenario: run.scenario,
        seed: run.seed,
        dayId: run.dayId as `0x${string}`,
        epochIndex,
        houses: run.houses,
        transformerCapacityWh: run.transformerCapacityWh,
        viewerEvCharging: run.viewerEvCharging,
        priorEmergencyDischarges: Object.freeze([...discharges]),
      });
      const outcome = run.outcomes.find((item) => item.epochIndex === epochIndex);
      rows.push(Object.freeze({ output, ...(outcome ? { outcome } : {}) }));
      if (outcome?.status === "confirmed" && outcome.kind === "emergency") {
        for (const item of outcome.metrics?.discharges ?? []) {
          discharges.push(Object.freeze({ house: item.house as `0x${string}`, deliveredWh: item.deliveredWh, epochIndex }));
        }
      }
    }
    return Object.freeze(rows);
  }, [run]);
  return (
    <section className="card carbon-card" aria-labelledby="carbon-title">
      <div className="card-heading">
        <div><p className="eyebrow">Illustrative emissions model</p><h2 id="carbon-title">Solar allocation records</h2></div>
        <StatusBadge status={confirmed ? "confirmed on-chain" : action?.status === "pending" || action?.status === "unknown" ? "submitted / pending" : "unavailable"} />
      </div>
      <p className="card-copy">A close-day record is minted only from confirmed local simulated solar-seller P2P allocations. It is not a verified carbon offset, credit, environmental attribute, or regulatory claim.</p>
      {run && <p className="certificate-note">Day {run.dayId} · {run.scenario} · seed <code>{run.seed}</code> · simulation model v1</p>}
      {confirmed && metrics ? (
        <>
          <div className="carbon-preview"><div><strong>{metrics.totalEligibleWh.toLocaleString()} eligible seller Wh</strong><span>{metrics.certificates.length} non-overlapping seller record(s) · factor {metrics.factorGPerKwh} gCO₂e/kWh v{metrics.factorVersion}</span><small>Receipt-confirmed close. No buyer-side duplication.</small></div></div>
          {metrics.certificates.length === 0
            ? <p className="certificate-note">This confirmed day had zero eligible solar P2P allocation; no certificate was minted.</p>
            : <div className="carbon-gallery">{metrics.certificates.map((record) => <CertificateCard key={record.tokenId} record={record} />)}</div>}
          <p className="certificate-note">Formula: eligible seller Wh × configured factor gCO₂e/kWh = illustrative mgCO₂e (Wh × g/kWh equals mg by units). Factor source: {FACTOR_SOURCE}</p>
          {replay.length === 24 && <details className="carbon-readings">
            <summary>Show 24-hour simulated readings and confirmed outcomes</summary>
            <p>Sim-core replay of the stored day ID, scenario, seed, registered-house snapshot and confirmed prior emergency discharges. Generation and consumption are modelled inputs, not physical meter observations. The matched / emergency column comes from final receipt events.</p>
            <div className="carbon-readings-scroll"><table><thead><tr><th>Hour</th><th>Model generation</th><th>Model consumption</th><th>Stress</th><th>Confirmed outcome</th><th>Per-house readings</th></tr></thead><tbody>
              {replay.map(({ output, outcome }) => <tr key={output.epochIndex}>
                <td>{String(output.epochIndex).padStart(2, "0")}</td>
                <td>{output.totalGenerationWh.toLocaleString()} Wh</td>
                <td>{output.totalConsumptionWh.toLocaleString()} Wh</td>
                <td>{(output.stressBps / 100).toFixed(1)}%</td>
                <td>{outcome?.status === "confirmed" ? outcome.kind === "normal" ? `${outcome.metrics?.matchedWh ?? 0} matched Wh` : `${outcome.metrics?.shavedWh ?? 0} emergency Wh` : "not confirmed"}</td>
                <td><details><summary>{output.readings.length} readings</summary><ul>{output.readings.map((reading) => <li key={reading.house}>{reading.house}: {reading.generationWh} generation / {reading.consumptionWh} consumption Wh</li>)}</ul></details></td>
              </tr>)}
            </tbody></table></div>
          </details>}
        </>
      ) : (
        <div className="carbon-preview"><div><strong>{action?.status === "pending" || action?.status === "unknown" ? "Close receipt not confirmed" : "No confirmed day-close record yet"}</strong><span>Preview-only readings and matched Wh do not create records. A successful close receipt with expected events is required.</span><small>{FACTOR_SOURCE}</small></div></div>
      )}
      {!hasCertificateAddress && <p className="assumption">Read/retire features stay unavailable until the verified certificate contract address is configured. Event-backed mint data remains visible where returned by the relayer.</p>}
    </section>
  );
}
