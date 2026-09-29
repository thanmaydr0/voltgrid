import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectLegacyDays,
  LEGACY_CARBON_DAY_KEY,
  LEGACY_PLAY_DAY_KEY,
  parseLegacyDay,
  reconcileLegacyDay,
  type LegacyStorage,
} from "../lib/legacy-day-migration";
import type { DayResponse } from "../lib/relayer";

const dayId = `0x${"a".repeat(64)}`;
const owner = `0x${"b".repeat(40)}`;
const market = `0x${"c".repeat(40)}`;

function legacyValue() {
  return JSON.stringify({
    dayId,
    ownerAddress: owner,
    clientRunId: "legacy-run",
    scenario: "heatwave",
    seed: "legacy-seed",
    viewerEvCharging: false,
    outcomes: [{ metrics: { matchedWh: 999999 } }],
  });
}

function storage(values: Record<string, string | null>): LegacyStorage {
  return {
    getItem: (key) => values[key] ?? null,
    removeItem: (key) => { values[key] = null; },
  };
}

function response(): DayResponse {
  return {
    day: { dayId, ownerAddress: owner, clientRunId: "legacy-run", scenario: "heatwave", seed: "server-seed", viewerEvCharging: false, houses: [], modelVersion: 1, inputDigest: "server-digest", transformerCapacityWh: 100, status: "active", nextEpoch: 4, createdAt: 1 },
    outcomes: [{ dayId, epochIndex: 0, kind: "normal", status: "confirmed", actions: [], metrics: { matchedWh: 12 } }],
    closeAction: null,
    chainId: 91562037,
    marketAddress: market,
    modelVersion: 1,
  };
}

test("legacy pointers are shape-checked and cached metrics are ignored", () => {
  const parsed = parseLegacyDay(legacyValue());
  assert.equal(parsed?.dayId, dayId);
  assert.equal(parseLegacyDay(JSON.stringify({ dayId })), null);
  const inspected = inspectLegacyDays(storage({ [LEGACY_PLAY_DAY_KEY]: legacyValue(), [LEGACY_CARBON_DAY_KEY]: legacyValue() }));
  assert.deepEqual(inspected.invalidKeys, []);
  assert.deepEqual([...inspected.candidates[0].keys].sort(), [LEGACY_CARBON_DAY_KEY, LEGACY_PLAY_DAY_KEY].sort());
});

test("successful legacy reconciliation saves returned reference then removes old keys", async () => {
  const values: Record<string, string | null> = { [LEGACY_PLAY_DAY_KEY]: legacyValue(), [LEGACY_CARBON_DAY_KEY]: legacyValue() };
  let savedReference: unknown;
  const result = await reconcileLegacyDay({
    candidate: inspectLegacyDays(storage(values)).candidates[0],
    walletAddress: owner,
    getDay: async () => response(),
    saveReference: async (reference) => { savedReference = reference; return { status: "ok", data: undefined }; },
    storage: storage(values),
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(savedReference, { dayId, chainId: 91562037, marketAddress: market, scenario: "heatwave", seed: "server-seed", savedAtISO: (savedReference as { savedAtISO: string }).savedAtISO });
  assert.equal(values[LEGACY_PLAY_DAY_KEY], null);
  assert.equal(values[LEGACY_CARBON_DAY_KEY], null);
});

test("legacy reconciliation failure preserves the old entry", async () => {
  const values: Record<string, string | null> = { [LEGACY_PLAY_DAY_KEY]: legacyValue() };
  const result = await reconcileLegacyDay({
    candidate: inspectLegacyDays(storage(values)).candidates[0],
    walletAddress: `0x${"d".repeat(40)}`,
    getDay: async () => response(),
    saveReference: async () => ({ status: "error", code: "not-signed-in", message: "Sign in first." }),
    storage: storage(values),
  });
  assert.equal(result.status, "error");
  assert.equal(values[LEGACY_PLAY_DAY_KEY], legacyValue());
});
