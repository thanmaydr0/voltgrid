import { StatusBadge } from "@/components/StatusBadge";
import type { EpochOutcome } from "@/lib/relayer";

export function TxFeed({ outcomes, explorerUrl, chainId }: { outcomes: readonly EpochOutcome[]; explorerUrl: string; chainId: number }) {
  const actions = outcomes.flatMap((outcome) => outcome.actions.map((action) => ({ ...action, epochIndex: outcome.epochIndex, kind: outcome.kind, metrics: outcome.metrics })));
  return (
    <section className="card tx-card" aria-labelledby="tx-title">
      <div className="card-heading">
        <div><p className="eyebrow">Settlement trail</p><h2 id="tx-title">Receipt feed</h2></div>
        <StatusBadge status={actions.some((action) => action.status === "confirmed") ? "confirmed on-chain" : actions.length ? "submitted / pending" : "unavailable"} />
      </div>
      <p className="card-copy">Only relayer-returned hashes and successful receipt events appear here. Model previews are never promoted to settled values.</p>
      {actions.length === 0 ? <div className="empty-state">No submitted, pending, or confirmed MST Testnet activity in this browser session.</div> : <ol className="tx-list">
        {actions.slice().reverse().map((action, index) => (
          <li key={`${action.txHash ?? action.action}-${action.epochIndex}-${index}`} className="tx-item">
            <span className="tx-icon" aria-hidden="true">{action.status === "confirmed" ? "✓" : action.status === "reverted" ? "!" : "○"}</span>
            <div>
              <strong>Epoch {String(action.epochIndex).padStart(2, "0")} · {action.action}</strong>
              <span>{action.status}{action.blockNumber ? ` · block ${action.blockNumber}` : ""}{action.metrics?.matchedWh === undefined ? "" : ` · ${action.metrics.matchedWh} matched Wh`}</span>
            </div>
            {action.txHash && <a href={`${explorerUrl}/tx/${action.txHash}`} target="_blank" rel="noreferrer">{action.txHash.slice(0, 10)}…</a>}
          </li>
        ))}
      </ol>}
      <small className="assumption">Chain {chainId} · explorer links use only actual relayer hashes.</small>
    </section>
  );
}
