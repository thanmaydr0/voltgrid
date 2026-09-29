import type { FixtureSnapshot } from "@/lib/fixture";
import { dailyScenarioLabel } from "./daily-profile";

function percent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(0)}%`;
}

function conditionLabel(condition: FixtureSnapshot["output"]["weather"]["condition"]): string {
  switch (condition) {
    case "clear": return "Clear";
    case "rain": return "Rain";
    case "heatwave": return "Heatwave";
  }
}

export function WeatherModelCard({ snapshot, scenario }: { snapshot: FixtureSnapshot; scenario: FixtureSnapshot["scenario"] }) {
  const weather = snapshot.output.weather;
  const values: readonly [string, string][] = [
    ["Condition class", conditionLabel(weather.condition)],
    ["Temperature", `${weather.temperatureC} °C`],
    ["Cloud cover", percent(weather.cloudCoverBps)],
    ["Humidity", percent(weather.humidityBps)],
    ["Precipitation", percent(weather.precipitationBps)],
    ["Solar irradiance", percent(weather.irradianceBps)],
    ["Modelled market price", snapshot.price === null ? "No P2P trade" : `₹${snapshot.price.toFixed(2)} / kWh`],
    ["Modelled generation / load", `${snapshot.totalGenerationWh.toLocaleString()} / ${snapshot.totalConsumptionWh.toLocaleString()} Wh`],
    ["Modelled grid stress", `${snapshot.stressPercent.toFixed(1)}%`],
  ];

  return (
    <section className="card min-w-0" aria-labelledby="weather-model-title">
      <div className="card-heading">
        <div><p className="eyebrow">sim-core · hour {String(weather.epochIndex).padStart(2, "0")}</p><h2 id="weather-model-title">Weather &amp; market</h2></div>
        <span className="rounded-full border border-[var(--line-bright)] px-2 py-1 text-[.65rem] font-bold text-[var(--gold)]">MODEL ONLY</span>
      </div>
      <p className="card-copy">{dailyScenarioLabel(scenario)} sets the day’s condition class; sim-core varies weather measurements and prices by hour from the seed. This is not a forecast, sensor reading, or live market feed.</p>
      <dl className="grid grid-cols-2 gap-2">
        {values.map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-[var(--line)] bg-[rgba(10,17,21,.32)] p-2.5">
          <dt className="text-xs leading-4 text-[var(--ink-faint)]">{label}</dt>
          <dd className="mt-1 break-words text-sm font-semibold text-[var(--ink)]">{value}</dd>
        </div>)}
      </dl>
    </section>
  );
}

export function HourlyModelTable({ snapshots }: { snapshots: readonly FixtureSnapshot[] }) {
  return (
    <details className="card mt-4">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--mint)]">Read all 24 modelled weather and price hours</summary>
      <p className="assumption mt-3">Every row is deterministic sim-core preview data only. It is not live weather, metered energy, a VLT price, or settled market activity.</p>
      <div className="mt-3 overflow-x-auto" role="region" aria-label="24-hour model data table" tabIndex={0}>
        <table className="w-full min-w-[44rem] border-collapse text-left text-xs">
          <thead><tr className="text-[var(--ink-faint)]"><th className="border-b border-[var(--line)] p-2">Hour</th><th className="border-b border-[var(--line)] p-2">Condition</th><th className="border-b border-[var(--line)] p-2">Temp</th><th className="border-b border-[var(--line)] p-2">Clouds</th><th className="border-b border-[var(--line)] p-2">Rain</th><th className="border-b border-[var(--line)] p-2">Price (₹/kWh)</th><th className="border-b border-[var(--line)] p-2">Generation (Wh)</th><th className="border-b border-[var(--line)] p-2">Load (Wh)</th><th className="border-b border-[var(--line)] p-2">Stress</th></tr></thead>
          <tbody>{snapshots.map((item) => <tr key={item.hour}>
            <td className="border-b border-[var(--line)] p-2">{String(item.hour).padStart(2, "0")}:00</td>
            <td className="border-b border-[var(--line)] p-2">{conditionLabel(item.output.weather.condition)}</td>
            <td className="border-b border-[var(--line)] p-2">{item.output.weather.temperatureC} °C</td>
            <td className="border-b border-[var(--line)] p-2">{percent(item.output.weather.cloudCoverBps)}</td>
            <td className="border-b border-[var(--line)] p-2">{percent(item.output.weather.precipitationBps)}</td>
            <td className="border-b border-[var(--line)] p-2">{item.price === null ? "—" : item.price.toFixed(2)}</td>
            <td className="border-b border-[var(--line)] p-2">{item.totalGenerationWh.toLocaleString()}</td>
            <td className="border-b border-[var(--line)] p-2">{item.totalConsumptionWh.toLocaleString()}</td>
            <td className="border-b border-[var(--line)] p-2">{item.stressPercent.toFixed(1)}%</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}
