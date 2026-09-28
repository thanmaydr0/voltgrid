import { formatUnits } from "viem";
import { StatusBadge } from "@/components/StatusBadge";
import type { EpochOutcome } from "@/lib/relayer";

type ModelledBattery = Readonly<{
  house: string;
  capacityWh: number;
  availableWh: number;
  eligibleEmergencyDischargeWh: number;
}>;

function formatVlt(value: string | undefined) {
  if (!value) return "0 VLT";
  try { return `${formatUnits(BigInt(value), 18)} VLT`; } catch { return "Unavailable"; }
}

function fallbackCopy(reason: EpochOutcome["fallbackReason"]): string | null {
  switch (reason) {
    case "no-opted-in-battery": return "No registered simulated battery was opted in. The grid operator resolved the emergency with 0 Wh and 0 payout; the target remains unmet.";
    case "no-modelled-energy": return "Opted-in batteries had no modelled available energy for this hour. No discharge or payout was recorded; the target remains unmet.";
    case "treasury-underfunded": return "The simulated treasury could not cover the modelled payout. No battery was discharged or paid; the emergency resolved at 0 Wh.";
    default: return null;
  }
}

function stateFor(outcome: EpochOutcome | undefined, proposed: boolean) {
  if (!outcome) return { status: "preview simulation" as const, title: proposed ? "SOS proposed by the model" : "No emergency proposed", detail: proposed ? "This deterministic heatwave proposal is not an on-chain declaration." : "The selected modelled hour remains below the strict emergency threshold." };
  if (outcome.status === "confirmed") return { status: "confirmed on-chain" as const, title: "SOS resolved on-chain", detail: `Epoch ${String(outcome.epochIndex).padStart(2, "0")} is finalized from successful declaration, report, and resolution receipts.` };
  if (outcome.status === "pending") return { status: "submitted / pending" as const, title: "SOS awaiting confirmation", detail: "A submitted emergency action is not settled until the expected receipt event is confirmed." };
  if (outcome.status === "reverted") return { status: "unavailable" as const, title: "SOS action reverted", detail: "No emergency outcome is shown as settled. Check the receipt trail and retry only after the on-chain cause is addressed." };
  return { status: "submitted / pending" as const, title: "SOS outcome needs reconciliation", detail: "The relayer is reconciling the existing transaction before attempting any retry." };
}

export function EmergencyPanel({
  proposed,
  proposedTargetWh,
  outcome,
  batteryState,
  explorerUrl,
}: {
  proposed: boolean;
  proposedTargetWh: number;
  outcome?: EpochOutcome;
  batteryState: readonly ModelledBattery[];
  explorerUrl: string;
}) {
  const state = stateFor(outcome, proposed);
  const confirmed = outcome?.status === "confirmed" && outcome.kind === "emergency";
  const declarationConfirmed = outcome?.actions.some((action) => action.action === "declareEmergency" && action.status === "confirmed") ?? false;
  const receiptTargetWh = declarationConfirmed ? outcome?.metrics?.targetWh : undefined;
  const shownTargetWh = receiptTargetWh ?? proposedTargetWh;
  const actions = outcome?.actions ?? [];
  const discharges = confirmed ? outcome?.metrics?.discharges ?? [] : [];
  const fallback = confirmed ? fallbackCopy(outcome?.fallbackReason) : null;

  return (
    <section className={`card emergency-card ${proposed ? "emergency-proposed" : ""}`} aria-labelledby="emergency-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Grid response · modelled demo</p>
          <h2 id="emergency-title">Emergency VPP</h2>
        </div>
        <StatusBadge status={state.status} />
      </div>
      <div className="emergency-state" aria-live="polite">
        <span className="emergency-icon" aria-hidden="true">{confirmed ? "✓" : proposed ? "!" : "·"}</span>
        <div>
          <strong>{state.title}</strong>
          <span>{state.detail}</span>
        </div>
      </div>
      <div className="metric-strip emergency-metrics">
        <div><span>{receiptTargetWh !== undefined ? "Receipt target" : "Modelled target preview"}</span><strong>{shownTargetWh.toLocaleString()} Wh</strong></div>
        <div><span>Confirmed shaved</span><strong>{confirmed ? `${(outcome?.metrics?.shavedWh ?? 0).toLocaleString()} Wh` : "Not confirmed"}</strong></div>
        <div><span>Confirmed payout</span><strong>{confirmed ? formatVlt(outcome?.metrics?.payoutWei) : "Not confirmed"}</strong></div>
      </div>
      {confirmed && outcome.metrics?.tariffMicroVltPerKwh !== undefined && <p className="card-copy">Receipt tariff: {(outcome.metrics.tariffMicroVltPerKwh / 1_000_000).toFixed(3)} model VLT/kWh · bounded demo assumption.</p>}
      {fallback && <p className="inline-error" role="status">{fallback}</p>}
      {discharges.length > 0 && <div className="emergency-dispatches">
        <strong>Confirmed battery discharge events</strong>
        <ul>
          {discharges.map((item, index) => <li key={`${item.house}-${index}`}>
            <span><code>{item.house.slice(0, 8)}…{item.house.slice(-6)}</code> · {item.deliveredWh.toLocaleString()} Wh · {formatVlt(item.payoutWei)}</span>
            {actions.find((action) => action.action === "reportDischarge")?.txHash && <a href={`${explorerUrl}/tx/${actions.find((action) => action.action === "reportDischarge")!.txHash}`} target="_blank" rel="noreferrer">Report receipt</a>}
          </li>)}
        </ul>
      </div>}
      {actions.length > 0 && <div className="emergency-receipts" aria-label="Emergency transaction receipts">
        {actions.map((action, index) => <span key={`${action.action}-${index}`}>
          {action.action}: {action.status}{action.txHash ? <> · <a href={`${explorerUrl}/tx/${action.txHash}`} target="_blank" rel="noreferrer">view receipt</a></> : " · no hash returned"}
        </span>)}
      </div>}
      <div className="emergency-batteries">
        <strong>Simulated battery state</strong>
        <span>Preview-only software estimate; no physical battery, utility dispatch, or Neurick-board battery connection. Confirmed dispatch is listed only from receipt events above.</span>
        {batteryState.length > 0 ? <ul>{batteryState.map((battery) => <li key={battery.house}>
          <code>{battery.house.slice(0, 8)}…{battery.house.slice(-6)}</code>
          <span>{battery.availableWh.toLocaleString()} / {battery.capacityWh.toLocaleString()} Wh modelled available · {battery.eligibleEmergencyDischargeWh.toLocaleString()} Wh eligible</span>
        </li>)}</ul> : <small>No simulated battery capacity is present in this preview.</small>}
      </div>
      <p className="assumption">Opt in using the connected house’s wallet signature before starting a day. The demo snapshots opt-in at day start; no real utility dispatch is claimed.</p>
      <a className="wallet-tx" href="#wallet-title">Manage battery opt-in in Wallet &amp; network</a>
    </section>
  );
}
