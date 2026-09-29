"use client";

import { useState } from "react";
import { scenarioLabel } from "@/lib/fixture";
import {
  OBSERVATION_INPUT_FEATURE_ENABLED,
  OBSERVATION_INPUT_FEATURE_FLAG,
  selectObservationSource,
  syntheticTestObservationAdapter,
  type ObservationMode,
  type ObservationResolution,
  type TypedObservationAdapter,
} from "@/lib/observation-input";
import type { Scenario } from "voltgrid-sim-core";

const SIMULATION_RESOLUTION: ObservationResolution = Object.freeze({
  requestedMode: "simulation",
  activeSource: "simulation",
  sensorObserved: false,
  settlementSource: "simulation",
  reason: "simulation-selected",
});

function fallbackCopy(reason: string) {
  switch (reason) {
    case "stale": return "The observation is stale; the model-only scenario remains active.";
    case "privacy-rejected": return "Precise location is not enabled; no observation was applied.";
    case "quality-rejected": return "Observation quality checks failed; the model-only scenario remains active.";
    case "calibration-unverified": return "Calibration is not validated; the model-only scenario remains active.";
    case "feature-disabled": return "The optional input feature flag is off; simulation remains the only source.";
    case "adapter-unavailable": return "No validated hardware adapter is connected; simulation remains the only source.";
    case "adapter-error": return "The observation source did not respond; simulation remains active.";
    case "future-timestamp": return "The observation timestamp is ahead of the current time; it was not applied.";
    case "missing-data-fallback":
    case "missing-data-suppressed": return "No valid scenario hint is available; the selected modelled scenario remains active.";
    default: return "Simulation is active. No sensor observation is being used.";
  }
}

export function ObservationInputPanel({ onUseScenario, locked = false, deviceAdapter }: {
  onUseScenario: (scenario: Scenario) => void;
  locked?: boolean;
  deviceAdapter?: TypedObservationAdapter;
}) {
  const [requestedMode, setRequestedMode] = useState<ObservationMode>("simulation");
  const [resolution, setResolution] = useState<ObservationResolution>(SIMULATION_RESOLUTION);
  const [busy, setBusy] = useState(false);

  async function chooseMode(mode: ObservationMode) {
    setRequestedMode(mode);
    if (mode === "simulation") {
      setResolution(SIMULATION_RESOLUTION);
      return;
    }
    setBusy(true);
    const next = await selectObservationSource({
      requestedMode: mode,
      featureEnabled: OBSERVATION_INPUT_FEATURE_ENABLED,
      adapter: mode === "fixture" ? syntheticTestObservationAdapter : mode === "device" ? deviceAdapter : undefined,
      nowEpochMs: Date.now(),
      allowPreciseLocation: false,
    });
    setResolution(next);
    setBusy(false);
  }

  async function applyScenarioHint() {
    if (resolution.activeSource === "simulation" || locked) return;
    setBusy(true);
    const checked = await selectObservationSource({
      requestedMode: requestedMode,
      featureEnabled: OBSERVATION_INPUT_FEATURE_ENABLED,
      adapter: requestedMode === "fixture" ? syntheticTestObservationAdapter : requestedMode === "device" ? deviceAdapter : undefined,
      nowEpochMs: Date.now(),
      allowPreciseLocation: false,
    });
    setResolution(checked);
    if (checked.activeSource !== "simulation") onUseScenario(checked.scenarioCandidate);
    setBusy(false);
  }

  const activeObservation = resolution.activeSource === "simulation" ? null : resolution;

  return (
    <section className="observation-input" aria-labelledby="observation-title">
      <div className="observation-heading">
        <h3 id="observation-title">Optional forecast input</h3>
        <span>{OBSERVATION_INPUT_FEATURE_ENABLED ? deviceAdapter ? "FEATURE ON · DEVICE READY" : "FEATURE ON · TEST FIXTURE" : "FEATURE OFF"}</span>
      </div>
      {OBSERVATION_INPUT_FEATURE_ENABLED ? (
        <div className="observation-mode" role="group" aria-label="Forecast input source">
          <button type="button" aria-pressed={requestedMode === "simulation"} disabled={busy || locked} onClick={() => void chooseMode("simulation")}>Simulation</button>
          <button type="button" aria-pressed={requestedMode === "fixture"} disabled={busy || locked} onClick={() => void chooseMode("fixture")}>Synthetic test fixture</button>
          <button type="button" aria-pressed={requestedMode === "device"} disabled={busy || locked || !deviceAdapter} title={deviceAdapter ? "Use the validated device scenario adapter" : "No validated device adapter is configured"} onClick={() => void chooseMode("device")}>{deviceAdapter ? "Device observation" : "Device unavailable"}</button>
        </div>
      ) : activeObservation?.activeSource === "device" ? (
        <div className="observation-result" role="status" aria-live="polite">
          <strong>Validated sensor-derived scenario hint: {scenarioLabel(activeObservation.scenarioCandidate)}</strong>
          <span>Source {activeObservation.sourceId} at {activeObservation.observedAt}; location {activeObservation.locationPrivacy}; calibration {activeObservation.calibrationVersion}; validator {activeObservation.validationPolicyVersion}; quality: {activeObservation.qualityFlags.join(", ")}.</span>
          <span>This is not an energy measurement. Household generation/consumption Wh and settlement inputs remain simulated.</span>
          <button className="button button-quiet" type="button" disabled={busy || locked} onClick={() => void applyScenarioHint()}>Use as a modelled scenario suggestion</button>
        </div>
      ) : (
        <p className="observation-copy">Set <code>{OBSERVATION_INPUT_FEATURE_FLAG}=true</code> in the frontend build environment to expose the isolated fixture switch. It defaults off.</p>
      )}

      {activeObservation?.activeSource === "recorded-fixture" ? (
        <div className="observation-result" role="status" aria-live="polite">
          <strong>Fixture scenario hint: {scenarioLabel(activeObservation.scenarioCandidate)}</strong>
          <span>Not sensor-observed: this is synthetic test data ({activeObservation.sourceId}), not a connected GPS/DHT22/rain/satellite device.</span>
          <span>Recorded {activeObservation.observedAt}; location {activeObservation.locationPrivacy}; calibration {activeObservation.calibrationVersion}; validator {activeObservation.validationPolicyVersion}; quality: {activeObservation.qualityFlags.join(", ")}.</span>
          <button className="button button-quiet" type="button" disabled={busy || locked} onClick={() => void applyScenarioHint()}>Use as a modelled scenario suggestion</button>
        </div>
      ) : (
        <p className="observation-copy" role="status" aria-live="polite">
          {fallbackCopy(resolution.activeSource === "simulation" ? resolution.reason : "simulation-selected")}
          {resolution.activeSource === "simulation" && resolution.requestedMode !== "simulation" ? ` Requested ${resolution.requestedMode} mode fell back safely.` : ""}
        </p>
      )}
      <p className="observation-boundary"><strong>{activeObservation?.activeSource === "device" ? "Sensor-observed: validated scenario hint only; no energy readings." : "Sensor-observed values: none."}</strong> Modelled: weather profile, household generation/consumption Wh, battery state, transformer stress and all settlement readings. Observations never replace simulated Wh.</p>
    </section>
  );
}
