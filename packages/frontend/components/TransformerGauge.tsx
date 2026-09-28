import { StatusBadge } from "@/components/StatusBadge";

export function TransformerGauge({ load, capacity }: { load: number; capacity: number }) {
  const stressPercent = Math.round((load / capacity) * 100);
  const safePercent = Math.min(100, stressPercent);
  const tone = stressPercent > 95 ? "gauge-danger" : stressPercent > 80 ? "gauge-warn" : "gauge-safe";

  return (
    <section className="card gauge-card" aria-labelledby="gauge-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Feeder health</p>
          <h2 id="gauge-title">Transformer T-01 load</h2>
        </div>
        <StatusBadge status="preview simulation" />
      </div>
      <div
        className="gauge-readout"
        role="meter"
        aria-label="Modelled transformer load"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={stressPercent}
        aria-valuetext={`${stressPercent}% modelled load`}
      >
        <strong>{stressPercent}%</strong>
        <span>modelled feeder load</span>
      </div>
      <div className="gauge-track"><span className={tone} style={{ width: `${safePercent}%` }} /></div>
      <div className="gauge-scale"><span>0%</span><span>80% watch</span><span>95% emergency proposal</span><span>100%</span></div>
      <div className="gauge-stats">
        <div><span>Load</span><strong>{load.toLocaleString()} Wh</strong></div>
        <div><span>Capacity</span><strong>{capacity.toLocaleString()} Wh</strong></div>
      </div>
      <p className="assumption">Modelled assumption: transformer capacity and stress are fixture parameters, not telemetry.</p>
    </section>
  );
}
