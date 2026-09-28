import type { FixtureHouse } from "@/lib/fixture";
import { StatusBadge } from "@/components/StatusBadge";

function houseFill(role: FixtureHouse["role"]) {
  if (role === "solar") return "#e5b85c";
  if (role === "battery") return "#68d5bc";
  if (role === "viewer") return "#b6a5ff";
  return "#ff8976";
}

export function NeighborhoodMap({ houses }: { houses: FixtureHouse[] }) {
  return (
    <section className="card map-card" aria-labelledby="map-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Live grid</p>
          <h2 id="map-title">Neighbourhood energy map</h2>
        </div>
        <StatusBadge status="preview simulation" />
      </div>
      <p className="card-copy">
        Deterministic sim-core flow for preview. Lines show modelled surplus moving toward modelled load;
        they are not meter observations or settled trades.
      </p>
      <div className="map-frame">
        <svg
          className="neighborhood-svg"
          viewBox="0 0 590 270"
          role="img"
          aria-labelledby="neighborhood-title neighborhood-description"
        >
          <title id="neighborhood-title">VoltGrid neighbourhood preview</title>
          <desc id="neighborhood-description">
            Eight modelled homes connect through a transformer. Gold and mint homes model generation or batteries;
            coral homes model load; an optional violet home is the connected viewer wallet.
          </desc>
          <defs>
            <linearGradient id="road" x1="0" x2="1">
              <stop offset="0" stopColor="#17222a" />
              <stop offset="1" stopColor="#203039" />
            </linearGradient>
            <filter id="soft-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect width="590" height="270" rx="18" fill="#10191f" />
          <path d="M0 130 H590 M0 146 H590" stroke="url(#road)" strokeWidth="16" />
          <path d="M296 0 V270" stroke="#1a2830" strokeWidth="8" strokeDasharray="10 12" />
          <g className="flow-lines" aria-hidden="true">
            <path d="M84 70 C170 94 230 112 296 136" />
            <path d="M214 70 C246 91 272 112 296 136" />
            <path d="M344 70 C330 93 314 113 296 136" />
            <path d="M84 188 C170 177 230 158 296 136" />
            <path d="M214 188 C246 172 272 153 296 136" />
            <path d="M344 188 C330 171 314 151 296 136" />
            <path d="M474 129 C410 130 360 133 296 136" />
          </g>
          <g aria-label="Transformer node">
            <circle cx="296" cy="136" r="31" fill="#0d1419" stroke="#f1cc74" strokeWidth="3" filter="url(#soft-glow)" />
            <path d="M287 119 h11 l-7 14 h11 l-15 21 4-15 h-10z" fill="#f1cc74" />
            <text x="296" y="180" textAnchor="middle" className="svg-label">T-01 • transformer</text>
          </g>
          {houses.map((house) => (
            <g key={house.id} transform={`translate(${house.x - 28} ${house.y - 24})`} aria-label={`${house.name}, ${house.role} model`}>
              <rect width="56" height="48" rx="10" fill="#16222a" stroke={houseFill(house.role)} strokeWidth="2" />
              <path d="M10 22 L28 8 L46 22 V40 H10Z" fill={houseFill(house.role)} opacity="0.25" />
              <path d="M15 22 L28 11 L41 22" fill="none" stroke={houseFill(house.role)} strokeWidth="2" />
              <rect x="23" y="27" width="10" height="13" rx="2" fill={houseFill(house.role)} opacity="0.9" />
              {house.role === "battery" && <path d="M23 15 h10 v5 h-10z" fill="#68d5bc" />}
              {house.role === "solar" && <path d="M18 14 h20 l-3 7 H15z" fill="#e5b85c" />}
              {house.role === "viewer" && <circle cx="28" cy="17" r="5" fill="#b6a5ff" />}
              <text x="28" y="64" textAnchor="middle" className="svg-label">{house.name}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="legend" aria-label="Neighbourhood legend">
        <span><i className="legend-dot legend-sun" /> Solar</span>
        <span><i className="legend-dot legend-battery" /> Battery</span>
        <span><i className="legend-dot legend-load" /> Load</span>
        <span><i className="legend-dot legend-you" /> Connected wallet</span>
      </div>
    </section>
  );
}
