"use client";

import type { Scenario } from "@/lib/fixture";
import { scenarioLabel } from "@/lib/fixture";
import { StatusBadge } from "@/components/StatusBadge";
import { ObservationInputPanel } from "@/components/ObservationInputPanel";

const SCENARIOS: Scenario[] = ["sunny", "rainy", "heatwave"];

export function ScenarioControls({
  scenario,
  setScenario,
  seed,
  setSeed,
  hour,
  isPlaying,
  onPlay,
  onReset,
  viewerEvCharging,
  setViewerEvCharging,
  onStartReal,
  liveStatus,
  liveBusy,
  locked,
}: {
  scenario: Scenario;
  setScenario: (scenario: Scenario) => void;
  seed: string;
  setSeed: (seed: string) => void;
  hour: number;
  isPlaying: boolean;
  onPlay: () => void;
  onReset: () => void;
  viewerEvCharging: boolean;
  setViewerEvCharging: (value: boolean) => void;
  onStartReal: () => void;
  liveStatus: string;
  liveBusy: boolean;
  locked?: boolean;
}) {
  return (
    <section className="card controls-card" aria-labelledby="controls-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Day simulator</p>
          <h2 id="controls-title">Choose a modelled day</h2>
        </div>
        <StatusBadge status="preview simulation" />
      </div>
      <p className="card-copy">Preview uses the real deterministic sim-core model. Real settlement asks the relayer to regenerate the same readings; browser readings are never submitted.</p>
      <div className="scenario-buttons" role="group" aria-label="Scenario">
        {SCENARIOS.map((item) => (
          <button key={item} className={`scenario-button ${item === scenario ? "scenario-selected" : ""}`} onClick={() => setScenario(item)} aria-pressed={item === scenario} disabled={locked}>
            <span aria-hidden="true">{item === "sunny" ? "☀" : item === "rainy" ? "☂" : "⚡"}</span>
            {scenarioLabel(item)}
          </button>
        ))}
      </div>
      <label className="seed-row">
        <span>Seed</span>
        <input value={seed} onChange={(event) => setSeed(event.target.value)} maxLength={256} aria-label="Simulation seed" disabled={locked} />
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={viewerEvCharging} onChange={(event) => setViewerEvCharging(event.target.checked)} disabled={locked} />
        <span>Model my EV charging from 17:00 onwards</span>
        <small>assumption</small>
      </label>
      <ObservationInputPanel onUseScenario={setScenario} locked={locked} />
      <div className="day-progress" aria-label={`Modelled hour ${hour} of 24`}>
        <div className="progress-meta"><span>Hour {String(hour).padStart(2, "0")} / 24</span><span>Preview only</span></div>
        <div className="progress-track"><span style={{ width: `${(hour / 24) * 100}%` }} /></div>
      </div>
      <div className="control-actions">
        <button className="button button-primary" onClick={onPlay}>{isPlaying ? "Pause preview" : "Play model preview"}</button>
        <button className="button button-quiet" onClick={onReset}>Reset</button>
        <button className="button button-primary" onClick={onStartReal} disabled={liveBusy}>{liveBusy ? "Waiting for receipt…" : "Play real day"}</button>
      </div>
      <p className="action-note" role="status">{liveStatus || "Real day state is resumable from this browser. Every confirmed value comes from relayer-decoded receipt logs."}</p>
    </section>
  );
}
