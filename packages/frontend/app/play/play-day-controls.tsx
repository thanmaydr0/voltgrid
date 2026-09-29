"use client";

import type { Scenario } from "voltgrid-sim-core";
import { Badge } from "@/components/ui/badge";
import { dailyScenarioLabel, type AutomaticDailyProfile } from "./daily-profile";

export function PlayDayControls({
  profile,
  activeScenario,
  activeDay,
  hour,
  isPlaying,
  onPlay,
  onReset,
  viewerEvCharging,
  setViewerEvCharging,
  onStartReal,
  liveStatus,
  liveBusy,
}: {
  profile: AutomaticDailyProfile | null;
  activeScenario: Scenario;
  activeDay: boolean;
  hour: number;
  isPlaying: boolean;
  onPlay: () => void;
  onReset: () => void;
  viewerEvCharging: boolean;
  setViewerEvCharging: (value: boolean) => void;
  onStartReal: () => void;
  liveStatus: string;
  liveBusy: boolean;
}) {
  const profileLabel = dailyScenarioLabel(activeScenario);
  return (
    <section className="card controls-card" aria-labelledby="controls-title">
      <div className="card-heading">
        <div><p className="eyebrow">Day simulator</p><h2 id="controls-title">Automatic daily weather</h2></div>
        <Badge variant="outline">{activeDay ? "Real-day input locked" : "Preview profile"}</Badge>
      </div>
      <p className="card-copy">
        {activeDay
          ? "This day uses the exact scenario and seed returned by the relayer when it started."
          : profile
            ? `${profileLabel} was selected deterministically for ${profile.dayKey}. Hourly weather and market values come from sim-core.`
            : "Assigning today’s deterministic model profile after the page loads…"}
      </p>
      <div className="rounded-lg border border-[var(--line)] bg-[rgba(10,17,21,.32)] p-3" aria-live="polite">
        <p className="eyebrow !mb-1">Selected daily profile</p>
        <strong>{profile ? profileLabel : activeDay ? profileLabel : "Preparing model day…"}</strong>
        <p className="mb-0 mt-1 break-words text-xs text-[var(--ink-faint)]">
          {activeDay ? "Fixed by the active relayer day." : profile ? `Automatic · local day ${profile.dayKey} · no manual weather selection` : "No preview readings are shown until the profile is ready."}
        </p>
      </div>
      <label className="toggle-row mt-4">
        <input type="checkbox" checked={viewerEvCharging} onChange={(event) => setViewerEvCharging(event.target.checked)} disabled={activeDay || !profile} />
        <span>Model my EV charging from 17:00 onwards</span><small>assumption</small>
      </label>
      <div className="day-progress" aria-label={`Modelled hour ${hour} of 24`}>
        <div className="progress-meta"><span>Hour {String(hour).padStart(2, "0")} / 24</span><span>Preview only</span></div>
        <div className="progress-track"><span style={{ width: `${(hour / 24) * 100}%` }} /></div>
      </div>
      <div className="control-actions">
        <button className="button button-primary" onClick={onPlay} disabled={!profile && !activeDay}>{isPlaying ? "Pause preview" : "Play model preview"}</button>
        <button className="button button-quiet" onClick={onReset} disabled={!profile && !activeDay}>Reset preview</button>
        <button className="button button-primary" onClick={onStartReal} disabled={liveBusy || (!profile && !activeDay)}>
          {liveBusy ? "Waiting for receipt…" : activeDay ? "Resume real day" : "Start real day"}
        </button>
      </div>
      <p className="action-note" role="status" aria-live="polite">{liveStatus || "Real-day status and outcomes are read from relayer-confirmed records."}</p>
    </section>
  );
}
