import type { Scenario } from "voltgrid-sim-core";

export const OBSERVATION_INPUT_FEATURE_FLAG = "NEXT_PUBLIC_VOLTGRID_OBSERVATION_ADAPTER" as const;
export const OBSERVATION_INPUT_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_VOLTGRID_OBSERVATION_ADAPTER === "true";

export type ObservationMode = "simulation" | "fixture" | "device";
export type ObservationSource = "recorded-fixture" | "device";
export type LocationPrivacySetting = "not-collected" | "coarse-region" | "precise-location";
export type CalibrationState = "verified" | "not-required" | "unverified" | "not-applicable";
export type MissingDataHandling = "fallback-to-simulation" | "suppress-scenario-hint";

export type ObservationRecord = Readonly<{
  source: ObservationSource;
  sourceId: string;
  observedAt: string;
  locationPrivacy: LocationPrivacySetting;
  calibration: Readonly<{ version: string; state: CalibrationState }>;
  validation: Readonly<{ state: "passed" | "not-run"; policyVersion: string }>;
  qualityFlags: readonly string[];
  stalenessLimitMs: number;
  missingDataHandling: MissingDataHandling;
  forecast: Readonly<{ scenarioCandidate: Scenario | null; policyVersion: string }> | null;
}>;

/** Device adapters must apply the exact model-specific value/unit checks before returning a validated record. */
export interface TypedObservationAdapter {
  readonly source: ObservationSource;
  read(): Promise<ObservationRecord | null>;
}

export type SimulationFallbackReason =
  | "simulation-selected"
  | "feature-disabled"
  | "adapter-unavailable"
  | "adapter-error"
  | "invalid-metadata"
  | "source-mismatch"
  | "future-timestamp"
  | "stale"
  | "privacy-rejected"
  | "quality-rejected"
  | "calibration-unverified"
  | "missing-data-fallback"
  | "missing-data-suppressed";

export type ObservationResolution =
  | Readonly<{
      requestedMode: ObservationMode;
      activeSource: "simulation";
      sensorObserved: false;
      settlementSource: "simulation";
      reason: SimulationFallbackReason;
    }>
  | Readonly<{
      requestedMode: "fixture" | "device";
      activeSource: ObservationSource;
      sensorObserved: boolean;
      settlementSource: "simulation";
      sourceId: string;
      observedAt: string;
      locationPrivacy: LocationPrivacySetting;
      calibrationVersion: string;
      validationPolicyVersion: string;
      qualityFlags: readonly string[];
      stalenessLimitMs: number;
      scenarioCandidate: Scenario;
      scenarioPolicyVersion: string;
    }>;

export type ObservationSelection = Readonly<{
  requestedMode: ObservationMode;
  featureEnabled: boolean;
  adapter?: TypedObservationAdapter;
  nowEpochMs: number;
  allowPreciseLocation?: boolean;
}>;

const SCENARIOS: readonly Scenario[] = Object.freeze(["sunny", "rainy", "heatwave"]);
const BLOCKING_QUALITY_FLAGS = new Set([
  "invalid",
  "stale",
  "out-of-range",
  "sensor-error",
  "calibration-unverified",
  "missing",
]);

function fallback(requestedMode: ObservationMode, reason: SimulationFallbackReason): ObservationResolution {
  return Object.freeze({
    requestedMode,
    activeSource: "simulation",
    sensorObserved: false,
    settlementSource: "simulation",
    reason,
  });
}

function isScenario(value: unknown): value is Scenario {
  return typeof value === "string" && SCENARIOS.includes(value as Scenario);
}

function validString(value: unknown, maxLength = 160): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function validateRecord(
  value: ObservationRecord,
  expectedSource: ObservationSource,
  nowEpochMs: number,
  allowPreciseLocation: boolean,
): SimulationFallbackReason | null {
  if (!value || typeof value !== "object") return "invalid-metadata";
  if (value.source !== expectedSource) return "source-mismatch";
  if (!validString(value.sourceId) || !validString(value.observedAt, 40)) return "invalid-metadata";
  if (!Number.isSafeInteger(value.stalenessLimitMs) || value.stalenessLimitMs <= 0) return "invalid-metadata";
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) return "invalid-metadata";
  if (!["not-collected", "coarse-region", "precise-location"].includes(value.locationPrivacy)) return "invalid-metadata";
  if (value.locationPrivacy === "precise-location" && !allowPreciseLocation) return "privacy-rejected";
  if (!value.calibration || !validString(value.calibration.version, 80)) return "invalid-metadata";
  if (!["verified", "not-required", "unverified", "not-applicable"].includes(value.calibration.state)) return "invalid-metadata";
  if (!value.validation || !validString(value.validation.policyVersion, 80)) return "invalid-metadata";
  if (value.validation.state !== "passed") return "quality-rejected";
  if (!Array.isArray(value.qualityFlags) || value.qualityFlags.some((flag) => typeof flag !== "string")) return "invalid-metadata";
  if (value.qualityFlags.some((flag) => BLOCKING_QUALITY_FLAGS.has(flag))) return "quality-rejected";

  const observedAtEpochMs = Date.parse(value.observedAt);
  if (!Number.isFinite(observedAtEpochMs) || new Date(observedAtEpochMs).toISOString() !== value.observedAt) return "invalid-metadata";
  if (observedAtEpochMs > nowEpochMs) return "future-timestamp";
  if (nowEpochMs - observedAtEpochMs > value.stalenessLimitMs) return "stale";

  if (expectedSource === "recorded-fixture") {
    if (!value.qualityFlags.includes("synthetic-test-fixture")) return "quality-rejected";
  } else if (value.calibration.state !== "verified" && value.calibration.state !== "not-required") {
    return "calibration-unverified";
  }

  if (!value.forecast) {
    return value.missingDataHandling === "suppress-scenario-hint"
      ? "missing-data-suppressed"
      : "missing-data-fallback";
  }
  if (!validString(value.forecast.policyVersion, 80)) return "invalid-metadata";
  if (value.forecast.scenarioCandidate === null) {
    return value.missingDataHandling === "suppress-scenario-hint"
      ? "missing-data-suppressed"
      : "missing-data-fallback";
  }
  if (!isScenario(value.forecast.scenarioCandidate)) return "invalid-metadata";
  return null;
}

/**
 * Resolve an optional forecast/scenario source. This never returns meter Wh:
 * every successful resolution explicitly keeps the settlement source simulated.
 */
export async function selectObservationSource(selection: ObservationSelection): Promise<ObservationResolution> {
  const { requestedMode, featureEnabled, adapter, nowEpochMs, allowPreciseLocation = false } = selection;
  if (requestedMode === "simulation") return fallback("simulation", "simulation-selected");
  if (!featureEnabled) return fallback(requestedMode, "feature-disabled");
  if (!adapter) return fallback(requestedMode, "adapter-unavailable");

  const expectedSource: ObservationSource = requestedMode === "fixture" ? "recorded-fixture" : "device";
  if (adapter.source !== expectedSource) return fallback(requestedMode, "source-mismatch");

  let record: ObservationRecord | null;
  try {
    record = await adapter.read();
  } catch {
    return fallback(requestedMode, "adapter-error");
  }
  if (!record) return fallback(requestedMode, "missing-data-fallback");

  const validationError = validateRecord(record, expectedSource, nowEpochMs, allowPreciseLocation);
  if (validationError) return fallback(requestedMode, validationError);

  const candidate = record.forecast?.scenarioCandidate;
  if (!candidate || !record.forecast) return fallback(requestedMode, "missing-data-fallback");

  return Object.freeze({
    requestedMode,
    activeSource: expectedSource,
    sensorObserved: expectedSource === "device",
    settlementSource: "simulation",
    sourceId: record.sourceId,
    observedAt: record.observedAt,
    locationPrivacy: record.locationPrivacy,
    calibrationVersion: record.calibration.version,
    validationPolicyVersion: record.validation.policyVersion,
    qualityFlags: Object.freeze([...record.qualityFlags]),
    stalenessLimitMs: record.stalenessLimitMs,
    scenarioCandidate: candidate,
    scenarioPolicyVersion: record.forecast.policyVersion,
  });
}

/** Synthetic scenario-hint fixture used only for deterministic UI/tests, never a live sensor record. */
export const SYNTHETIC_TEST_OBSERVATION: ObservationRecord = Object.freeze({
  source: "recorded-fixture",
  sourceId: "synthetic-forecast-fixture-v1",
  observedAt: "2026-09-29T00:00:00.000Z",
  locationPrivacy: "not-collected",
  calibration: Object.freeze({ version: "fixture-v1", state: "not-applicable" }),
  validation: Object.freeze({ state: "passed", policyVersion: "synthetic-fixture-schema-v1" }),
  qualityFlags: Object.freeze(["synthetic-test-fixture"]),
  stalenessLimitMs: 7 * 24 * 60 * 60 * 1_000,
  missingDataHandling: "fallback-to-simulation",
  forecast: Object.freeze({ scenarioCandidate: "rainy", policyVersion: "synthetic-fixture-hint-v1" }),
});

export const syntheticTestObservationAdapter: TypedObservationAdapter = Object.freeze({
  source: "recorded-fixture",
  async read() {
    return SYNTHETIC_TEST_OBSERVATION;
  },
});
