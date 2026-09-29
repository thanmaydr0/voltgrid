import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { applyOutcome, confirmedMetric, normalizeConfirmedActivity, ROUTE_PATHS, stableRequestId } from "../app/domain/route-models";
import { actionStatusCopy, stateTone } from "../app/domain/route-copy";
import type { EpochOutcome, RelayerDay } from "../lib/relayer";

const root = resolve(__dirname, "..");

test("owned App Router pages exist for direct navigation and refresh", () => {
  for (const route of ROUTE_PATHS) {
    const page = route === "/" ? "app/page.tsx" : `app${route}/page.tsx`;
    assert.equal(existsSync(resolve(root, page)), true, page);
  }
});

test("stable action IDs are UUIDs and are repeatable for safe retry", () => {
  const first = stableRequestId("0xday:epoch:4");
  assert.equal(first, stableRequestId("0xday:epoch:4"));
  assert.notEqual(first, stableRequestId("0xday:epoch:5"));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("settled metrics are inaccessible for non-confirmed outcomes", () => {
  const base = { dayId: `0x${"a".repeat(64)}`, epochIndex: 2, kind: "normal" as const, actions: [], metrics: { matchedWh: 42 } };
  assert.equal(confirmedMetric({ ...base, status: "pending" }, "matchedWh"), undefined);
  assert.equal(confirmedMetric({ ...base, status: "unknown" }, "matchedWh"), undefined);
  assert.equal(confirmedMetric({ ...base, status: "reverted" }, "matchedWh"), undefined);
  assert.equal(confirmedMetric({ ...base, status: "confirmed" }, "matchedWh"), 42);
});

test("pending, reverted, unknown, and unavailable states stay visibly distinct", () => {
  assert.equal(stateTone("pending"), "submitted / pending");
  assert.equal(stateTone("reverted"), "unavailable");
  assert.equal(stateTone("unknown"), "unavailable");
  assert.match(actionStatusCopy("unknown"), /reconcile/i);
  assert.match(actionStatusCopy("reverted"), /no settled/i);
});

test("only decoded events with actual hashes become activity", () => {
  assert.equal(normalizeConfirmedActivity({ name: "PreviewEpoch", args: {} }), null);
  const event = normalizeConfirmedActivity({ name: "EpochSettled", transactionHash: `0x${"b".repeat(64)}`, blockNumber: 18, logIndex: 1, args: { dayId: `0x${"c".repeat(64)}`, epochIndex: 7 } });
  assert.deepEqual(event, { name: "EpochSettled", txHash: `0x${"b".repeat(64)}`, blockNumber: 18, logIndex: 1, dayId: `0x${"c".repeat(64)}`, epochIndex: 7 });
});

test("confirmed epoch advances one sequence step and preserves emergency kind", () => {
  const day: RelayerDay = { dayId: `0x${"d".repeat(64)}`, ownerAddress: `0x${"e".repeat(40)}`, clientRunId: "run", scenario: "heatwave", seed: "test", viewerEvCharging: false, houses: [], modelVersion: 1, inputDigest: "digest", transformerCapacityWh: 100, status: "active", nextEpoch: 5, createdAt: 0 };
  const outcome: EpochOutcome = { dayId: day.dayId, epochIndex: 5, kind: "emergency", status: "confirmed", actions: [], metrics: { shavedWh: 11, payoutWei: "2" } };
  const next = applyOutcome({ day, outcomes: [], closeAction: null, chainId: 91562037, marketAddress: `0x${"f".repeat(40)}` }, outcome);
  assert.equal(next.day.nextEpoch, 6);
  assert.equal(next.outcomes[0].kind, "emergency");
  assert.equal(next.outcomes[0].metrics?.shavedWh, 11);
});
