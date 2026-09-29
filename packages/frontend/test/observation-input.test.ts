import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultSimulationInput, simulateEpoch } from "voltgrid-sim-core";
import {
  selectObservationSource,
  SYNTHETIC_TEST_OBSERVATION,
  type ObservationRecord,
  type TypedObservationAdapter,
} from "../lib/observation-input";

const FIXTURE_NOW = Date.parse("2026-09-29T01:00:00.000Z");

function adapter(record: ObservationRecord | null, source: "recorded-fixture" | "device" = "recorded-fixture"): TypedObservationAdapter {
  return { source, async read() { return record; } };
}

function selection(overrides: Partial<Parameters<typeof selectObservationSource>[0]> = {}) {
  return {
    requestedMode: "fixture" as const,
    featureEnabled: true,
    adapter: adapter(SYNTHETIC_TEST_OBSERVATION),
    nowEpochMs: FIXTURE_NOW,
    ...overrides,
  };
}

test("simulation is the default and does not call an optional adapter", async () => {
  let reads = 0;
  const result = await selectObservationSource(selection({
    requestedMode: "simulation",
    adapter: { source: "recorded-fixture", async read() { reads += 1; return SYNTHETIC_TEST_OBSERVATION; } },
  }));
  assert.equal(result.activeSource, "simulation");
  assert.equal(result.settlementSource, "simulation");
  assert.equal(reads, 0);
});

test("fixture can be selected then cleanly rolled back without changing deterministic readings", async () => {
  const input = createDefaultSimulationInput({ scenario: "sunny", seed: "source-switch-check" });
  const before = JSON.stringify(simulateEpoch({ ...input, epochIndex: 12 }));
  const fixture = await selectObservationSource(selection());
  assert.equal(fixture.activeSource, "recorded-fixture");
  assert.equal(fixture.sensorObserved, false);
  assert.equal(fixture.scenarioCandidate, "rainy");
  assert.equal(fixture.settlementSource, "simulation");

  const rolledBack = await selectObservationSource(selection({ requestedMode: "simulation" }));
  const after = JSON.stringify(simulateEpoch({ ...input, epochIndex: 12 }));
  assert.equal(rolledBack.activeSource, "simulation");
  assert.equal(rolledBack.reason, "simulation-selected");
  assert.equal(after, before);
});

test("feature flag off never reads or applies the fixture", async () => {
  let reads = 0;
  const result = await selectObservationSource(selection({
    featureEnabled: false,
    adapter: { source: "recorded-fixture", async read() { reads += 1; return SYNTHETIC_TEST_OBSERVATION; } },
  }));
  assert.equal(result.activeSource, "simulation");
  assert.equal(result.reason, "feature-disabled");
  assert.equal(reads, 0);
});

test("device mode without a validated device adapter safely falls back", async () => {
  const result = await selectObservationSource(selection({ requestedMode: "device", adapter: undefined }));
  assert.equal(result.activeSource, "simulation");
  assert.equal(result.reason, "adapter-unavailable");
  assert.equal(result.sensorObserved, false);
});

test("a validated device adapter can suggest a scenario but never becomes settlement input", async () => {
  const deviceRecord: ObservationRecord = {
    ...SYNTHETIC_TEST_OBSERVATION,
    source: "device",
    sourceId: "validated-device-adapter-test",
    qualityFlags: [],
    calibration: { version: "calibration-v1", state: "verified" },
    validation: { state: "passed", policyVersion: "device-validator-v1" },
  };
  const result = await selectObservationSource(selection({
    requestedMode: "device",
    adapter: adapter(deviceRecord, "device"),
  }));
  assert.equal(result.activeSource, "device");
  assert.equal(result.sensorObserved, true);
  assert.equal(result.scenarioCandidate, "rainy");
  assert.equal(result.settlementSource, "simulation");
});

test("stale, future, invalid-quality, uncalibrated, and precise-location records cannot suggest a scenario", async (t) => {
  const base = { ...SYNTHETIC_TEST_OBSERVATION, source: "device" as const, qualityFlags: Object.freeze([]), calibration: Object.freeze({ version: "cal-v1", state: "verified" as const }), validation: Object.freeze({ state: "passed" as const, policyVersion: "device-policy-v1" }) };
  const cases: readonly [string, ObservationRecord, number, string][] = [
    ["stale", { ...base, observedAt: "2026-09-20T00:00:00.000Z" }, FIXTURE_NOW, "stale"],
    ["future timestamp", { ...base, observedAt: "2026-09-30T00:00:00.000Z" }, FIXTURE_NOW, "future-timestamp"],
    ["quality error", { ...base, qualityFlags: ["out-of-range"] }, FIXTURE_NOW, "quality-rejected"],
    ["unvalidated input", { ...base, validation: { state: "not-run", policyVersion: "device-policy-v1" } }, FIXTURE_NOW, "quality-rejected"],
    ["uncalibrated device", { ...base, calibration: { version: "cal-v1", state: "unverified" } }, FIXTURE_NOW, "calibration-unverified"],
    ["precise location without consent", { ...base, locationPrivacy: "precise-location" }, FIXTURE_NOW, "privacy-rejected"],
  ];
  for (const [name, record, nowEpochMs, reason] of cases) {
    await t.test(name, async () => {
      const result = await selectObservationSource(selection({
        requestedMode: "device",
        adapter: adapter(record, "device"),
        nowEpochMs,
      }));
      assert.equal(result.activeSource, "simulation");
      assert.equal(result.reason, reason);
      assert.equal(result.settlementSource, "simulation");
    });
  }
});

test("missing forecast data follows the declared missing-data policy", async () => {
  const suppress = { ...SYNTHETIC_TEST_OBSERVATION, forecast: null, missingDataHandling: "suppress-scenario-hint" as const };
  const fallback = { ...SYNTHETIC_TEST_OBSERVATION, forecast: null, missingDataHandling: "fallback-to-simulation" as const };
  const suppressed = await selectObservationSource(selection({ adapter: adapter(suppress) }));
  const modelFallback = await selectObservationSource(selection({ adapter: adapter(fallback) }));
  assert.equal(suppressed.activeSource, "simulation");
  assert.equal(suppressed.reason, "missing-data-suppressed");
  assert.equal(modelFallback.activeSource, "simulation");
  assert.equal(modelFallback.reason, "missing-data-fallback");
});

test("adapter errors and missing records do not interrupt the model path", async () => {
  const failed = await selectObservationSource(selection({ adapter: { source: "recorded-fixture", async read() { throw new Error("fixture read failed"); } } }));
  const missing = await selectObservationSource(selection({ adapter: adapter(null) }));
  assert.equal(failed.activeSource, "simulation");
  assert.equal(failed.reason, "adapter-error");
  assert.equal(missing.activeSource, "simulation");
  assert.equal(missing.reason, "missing-data-fallback");
});
