import type { EpochOutcome } from "@/lib/relayer";

function label(status: string, epoch: number, nextEpoch: number) {
  if (status === "confirmed") return "confirmed";
  if (status === "pending") return "pending";
  if (status === "unknown") return "reconcile";
  if (status === "reverted") return "reverted";
  return epoch === nextEpoch ? "next" : "waiting";
}

export function EpochTimeline({ outcomes, nextEpoch, live }: { outcomes: readonly EpochOutcome[]; nextEpoch: number; live: boolean }) {
  const byEpoch = new Map(outcomes.map((outcome) => [outcome.epochIndex, outcome]));
  return (
    <section className="card timeline-card" aria-labelledby="timeline-title">
      <div className="card-heading">
        <div><p className="eyebrow">Day state machine</p><h2 id="timeline-title">24 hourly outcomes</h2></div>
        <span className={`status-badge ${live ? "status-submitted---pending" : "status-preview-simulation"}`}>{live ? "live day" : "preview"}</span>
      </div>
      <p className="card-copy">Each cell advances only after the relayer confirms the expected receipt event. Refreshing this page re-reads the day from the relayer and reuses deterministic request IDs.</p>
      <ol className="epoch-grid" aria-label="24 epoch settlement states">
        {Array.from({ length: 24 }, (_, epoch) => {
          const outcome = byEpoch.get(epoch);
          const status = outcome?.status ?? "waiting";
          return <li key={epoch} className={`epoch-cell epoch-${status}`} aria-label={`Epoch ${epoch}, ${label(status, epoch, nextEpoch)}`}>
            <span>{String(epoch).padStart(2, "0")}</span>
            <small>{label(status, epoch, nextEpoch)}</small>
          </li>;
        })}
      </ol>
    </section>
  );
}
