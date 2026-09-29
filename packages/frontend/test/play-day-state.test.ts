import assert from "node:assert/strict";
import test from "node:test";
import { applyOutcome, closeRequestId, epochRequestId, mergeOutcome, stateFromDayResponse } from "../app/domain/route-models";
import type { ChainAction, EpochOutcome, RelayerDay } from "../lib/relayer";

const dayId = `0x${"1".repeat(64)}` as `0x${string}`;
const day: RelayerDay = { dayId, ownerAddress: `0x${"2".repeat(40)}`, clientRunId: "client-run", scenario: "sunny", seed: "reload-seed", viewerEvCharging: false, houses: [], modelVersion: 1, inputDigest: "digest", transformerCapacityWh: 100, status: "active", nextEpoch: 4, createdAt: 1 };
const action: ChainAction = { action: "settle", status: "unknown", txHash: `0x${"3".repeat(64)}` };

function outcome(epochIndex: number, status: EpochOutcome["status"] = "confirmed", kind: EpochOutcome["kind"] = "normal"): EpochOutcome {
  return { dayId, epochIndex, kind, status, actions: [action] };
}

test("reload reconstructs the current day and its returned outcomes", () => {
  const restored = stateFromDayResponse({ day, outcomes: [outcome(2), outcome(3)], closeAction: null, chainId: 91562037, marketAddress: `0x${"4".repeat(40)}` });
  assert.equal(restored.day.dayId, dayId);
  assert.deepEqual(restored.outcomes.map((item) => item.epochIndex), [2, 3]);
  assert.equal(restored.day.nextEpoch, 4);
});

test("retry uses the same request identity after an unknown response", () => {
  const first = epochRequestId(dayId, 4);
  const retry = epochRequestId(dayId, 4);
  assert.equal(first, retry);
  assert.notEqual(first, epochRequestId(dayId, 5));
  assert.equal(closeRequestId(dayId), closeRequestId(dayId));
});

test("merge replaces a stale epoch record instead of duplicating it", () => {
  const merged = mergeOutcome([outcome(4, "unknown")], outcome(4, "confirmed"));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "confirmed");
});

test("a 24-epoch sequence reaches close-ready state without changing emergency identity", () => {
  let state = stateFromDayResponse({ day: { ...day, nextEpoch: 0 }, outcomes: [], closeAction: null, chainId: 91562037, marketAddress: `0x${"4".repeat(40)}` });
  for (let epoch = 0; epoch < 24; epoch += 1) state = applyOutcome(state, outcome(epoch, "confirmed", epoch === 18 ? "emergency" : "normal"));
  assert.equal(state.day.nextEpoch, 24);
  assert.equal(state.outcomes.length, 24);
  assert.equal(state.outcomes[18].kind, "emergency");
  assert.equal(state.outcomes.every((item) => item.status === "confirmed"), true);
});
