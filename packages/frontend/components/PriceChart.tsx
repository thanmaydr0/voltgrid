import type { Scenario } from "@/lib/fixture";
import { makePriceSeries } from "@/lib/fixture";
import { StatusBadge } from "@/components/StatusBadge";

export function PriceChart({ scenario, seed, activeHour, viewerEvCharging, viewerAddress }: { scenario: Scenario; seed: string; activeHour: number; viewerEvCharging: boolean; viewerAddress?: `0x${string}` }) {
  const points = makePriceSeries(scenario, seed, viewerEvCharging, viewerAddress);
  const min = 0;
  const max = 9;
  const x = (index: number) => 36 + index * (253 / 23);
  const y = (value: number) => 176 - ((value - min) / (max - min)) * 132;
  const path = points.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value ?? 0)}`).join(" ");
  const activeIndex = Math.min(points.length - 1, Math.max(0, activeHour));
  const activePrice = points[activeIndex];

  return (
    <section className="card chart-card" aria-labelledby="price-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Market signal</p>
          <h2 id="price-title">Modelled price band</h2>
        </div>
        <StatusBadge status="preview simulation" />
      </div>
      <p className="card-copy">P2P price in ₹/kWh. The frozen curve clamps model output between ₹3.00 and ₹7.00.</p>
      <div className="chart-wrap">
        <svg className="price-chart" viewBox="0 0 320 210" role="img" aria-labelledby="chart-title chart-desc">
          <title id="chart-title">Preview price chart with modelled floor and cap</title>
          <desc id="chart-desc">The preview line shows the deterministic sim-core model. It is not a confirmed on-chain price.</desc>
          <rect x="36" y={y(7)} width="253" height={y(3) - y(7)} fill="#5e4b36" opacity="0.23" />
          {[3, 5, 7, 8].map((value) => (
            <g key={value}>
              <line x1="36" x2="289" y1={y(value)} y2={y(value)} className={value === 3 || value === 7 ? "chart-band-line" : "chart-grid-line"} />
              <text x="4" y={y(value) + 4} className="chart-axis">₹{value}</text>
            </g>
          ))}
          <line x1="36" x2="36" y1="44" y2="176" className="chart-axis-line" />
          <line x1="36" x2="289" y1="176" y2="176" className="chart-axis-line" />
          <path d={path} className="price-line" />
          <circle cx={x(activeIndex)} cy={y(activePrice ?? 0)} r="5" className="price-point" />
          <text x="38" y="195" className="chart-axis">00:00</text>
          <text x="142" y="195" className="chart-axis">12:00</text>
          <text x="257" y="195" className="chart-axis">23:00</text>
          <text x="258" y={y(7) - 6} className="chart-note">cap</text>
          <text x="258" y={y(3) + 14} className="chart-note">floor</text>
        </svg>
      </div>
      <div className="metric-strip">
        <div><span>Preview now</span><strong>{activePrice === null ? "No P2P trade" : `₹${activePrice.toFixed(2)} / kWh`}</strong></div>
        <div><span>Reference feed-in</span><strong>₹2.50 / kWh</strong></div>
        <div><span>Reference retail</span><strong>₹8.00 / kWh</strong></div>
      </div>
      <p className="assumption">Modelled assumptions: feed-in, retail, floor, cap and wheeling fee are not live tariffs.</p>
    </section>
  );
}
