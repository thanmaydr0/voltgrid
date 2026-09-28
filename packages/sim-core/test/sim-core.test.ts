import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_HOUSES,
  DEFAULT_TRANSFORMER_CAPACITY_WH,
  EMERGENCY_THRESHOLD_BPS,
  MAX_READING_WH,
  MODEL_VERSION,
  createDefaultSimulationInput,
  emergencyDischarges,
  previewPriceMicroVltPerKwh,
  simulateDay,
  simulateEpoch,
  type SimInput,
} from "../src/index";

const golden = require("../fixtures/golden.json") as {
  cases: readonly Readonly<{
    scenario: SimInput["scenario"];
    seed: string;
    epochIndex: number;
    expected: Readonly<Record<string, number | boolean | null>>;
  }>[];
};

function input(scenario: SimInput["scenario"], seed = "golden-seed"): SimInput {
  return {
    modelVersion: MODEL_VERSION,
    scenario,
    seed,
    epochIndex: 12,
    houses: DEFAULT_HOUSES,
    transformerCapacityWh: DEFAULT_TRANSFORMER_CAPACITY_WH,
    viewerEvCharging: false,
  };
}

test("same input serializes identically for every scenario", () => {
  for (const scenario of ["sunny", "rainy", "heatwave"] as const) {
    const first = simulateEpoch(input(scenario));
    const second = simulateEpoch(input(scenario));
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(first.source, "simulation");
    assert.equal(first.scenario, scenario);
    assert.equal(first.modelVersion, MODEL_VERSION);
    assert.match(first.dayId, /^0x[0-9a-f]{64}$/);
    assert.deepEqual(first.units, {
      energy: "Wh",
      price: "micro-VLT/kWh",
      stress: "bps",
      temperature: "degC",
      humidity: "bps",
      precipitation: "bps",
    });
  }
});

test("inspectable golden summaries stay stable", () => {
  for (const fixture of golden.cases) {
    const output = simulateEpoch({
      ...input(fixture.scenario, fixture.seed),
      epochIndex: fixture.epochIndex,
    });
    for (const [field, expected] of Object.entries(fixture.expected)) {
      assert.equal(output[field as keyof typeof output], expected, `${fixture.scenario}.${field}`);
    }
  }
});

test("seed and scenario affect modelled readings", () => {
  const sunnyA = simulateEpoch(input("sunny", "seed-a"));
  const sunnyB = simulateEpoch(input("sunny", "seed-b"));
  const rainy = simulateEpoch(input("rainy", "seed-a"));
  assert.notEqual(JSON.stringify(sunnyA.readings), JSON.stringify(sunnyB.readings));
  assert.notEqual(JSON.stringify(sunnyA.readings), JSON.stringify(rainy.readings));
  assert.notEqual(sunnyA.weather.irradianceBps, rainy.weather.irradianceBps);
});

test("optional viewer house and EV toggle are explicit model inputs", () => {
  const viewerAddress = "0x0000000000000000000000000000000000000abc" as const;
  const withoutCharging = simulateEpoch({
    ...createDefaultSimulationInput({ scenario: "sunny", seed: "viewer-seed", viewerAddress }),
    epochIndex: 19,
  });
  const withCharging = simulateEpoch({
    ...createDefaultSimulationInput({ scenario: "sunny", seed: "viewer-seed", viewerAddress, viewerEvCharging: true }),
    epochIndex: 19,
  });
  assert.equal(withCharging.readings.length, 9);
  const viewerWithout = withoutCharging.readings.find((reading) => reading.house === viewerAddress);
  const viewerWith = withCharging.readings.find((reading) => reading.house === viewerAddress);
  assert.ok(viewerWithout && viewerWith);
  assert.ok(viewerWith.consumptionWh > viewerWithout.consumptionWh);
});

test("a day is exactly 24 ordered, reproducible epochs with integer totals", () => {
  const day = simulateDay(createDefaultSimulationInput({ scenario: "sunny", seed: "day-seed" }));
  assert.equal(day.length, 24);
  assert.deepEqual(day.map((epoch) => epoch.epochIndex), Array.from({ length: 24 }, (_, index) => index));
  assert.ok(day.some((epoch) => epoch.totalGenerationWh > epoch.totalConsumptionWh));
  for (const epoch of day) {
    assert.equal(epoch.readings.length, DEFAULT_HOUSES.length);
    assert.ok(Number.isSafeInteger(epoch.totalGenerationWh));
    assert.ok(Number.isSafeInteger(epoch.totalConsumptionWh));
    for (const reading of epoch.readings) {
      assert.ok(Number.isInteger(reading.generationWh));
      assert.ok(Number.isInteger(reading.consumptionWh));
      assert.ok(reading.generationWh >= 0 && reading.generationWh <= MAX_READING_WH);
      assert.ok(reading.consumptionWh >= 0 && reading.consumptionWh <= MAX_READING_WH);
    }
  }
  assert.equal(JSON.stringify(day), JSON.stringify(simulateDay(createDefaultSimulationInput({ scenario: "sunny", seed: "day-seed" }))));
});

test("night has zero solar generation", () => {
  for (const scenario of ["sunny", "rainy", "heatwave"] as const) {
    const epoch = simulateEpoch({ ...input(scenario), epochIndex: 2 });
    assert.equal(epoch.totalGenerationWh, 0);
    assert.ok(epoch.readings.every((reading) => reading.generationWh === 0));
  }
});

test("battery state stays within capacity and exposes conservative discharge candidates", () => {
  const day = simulateDay(createDefaultSimulationInput({ scenario: "sunny", seed: "battery-seed" }));
  assert.ok(day[0].batteryState.length > 0);
  for (const epoch of day) {
    for (const battery of epoch.batteryState) {
      assert.ok(battery.availableWh >= 0 && battery.availableWh <= battery.capacityWh);
      assert.ok(battery.eligibleEmergencyDischargeWh >= 0);
      assert.ok(battery.eligibleEmergencyDischargeWh <= battery.availableWh);
    }
  }
  const discharges = emergencyDischarges(day[19], 1_000);
  assert.ok(discharges.every((discharge) => discharge.deliveredWh > 0));
  assert.ok(discharges.reduce((sum, discharge) => sum + discharge.deliveredWh, 0) <= 1_000);
});

test("heatwave evening crosses the strict emergency threshold", () => {
  const day = simulateDay(createDefaultSimulationInput({ scenario: "heatwave", seed: "hot-seed" }));
  const emergency = day.find((epoch) => epoch.emergencyProposed);
  assert.ok(emergency);
  assert.ok(emergency.stressBps > EMERGENCY_THRESHOLD_BPS);
  assert.ok(emergency.proposedTargetWh > 0);
  assert.ok(emergency.proposedTargetWh <= 1_600_000);
});

test("the 9,500 bps emergency boundary is strict", () => {
  const unbounded = simulateEpoch({ ...input("heatwave", "boundary-seed"), epochIndex: 18, transformerCapacityWh: 1_000_000 });
  const capacityWh = Math.floor((unbounded.totalConsumptionWh * 10_000) / EMERGENCY_THRESHOLD_BPS);
  let exactCapacityWh = capacityWh;
  while (Math.floor((unbounded.totalConsumptionWh * 10_000) / exactCapacityWh) < EMERGENCY_THRESHOLD_BPS) exactCapacityWh -= 1;
  while (Math.floor((unbounded.totalConsumptionWh * 10_000) / exactCapacityWh) > EMERGENCY_THRESHOLD_BPS) exactCapacityWh += 1;
  const atBoundary = simulateEpoch({ ...input("heatwave", "boundary-seed"), epochIndex: 18, transformerCapacityWh: exactCapacityWh });
  assert.equal(atBoundary.stressBps, EMERGENCY_THRESHOLD_BPS);
  assert.equal(atBoundary.emergencyProposed, false);
  let overloadedCapacityWh = exactCapacityWh - 1;
  while (Math.floor((unbounded.totalConsumptionWh * 10_000) / overloadedCapacityWh) <= EMERGENCY_THRESHOLD_BPS) overloadedCapacityWh -= 1;
  const overBoundary = simulateEpoch({ ...input("heatwave", "boundary-seed"), epochIndex: 18, transformerCapacityWh: overloadedCapacityWh });
  assert.ok(overBoundary.stressBps > EMERGENCY_THRESHOLD_BPS);
  assert.equal(overBoundary.emergencyProposed, true);
});

test("confirmed emergency discharges are replayed into modelled SoC exactly once", () => {
  const day = simulateDay(createDefaultSimulationInput({ scenario: "heatwave", seed: "soc-emergency" }));
  const source = day.find((epoch) => epoch.emergencyProposed && epoch.eligibleEmergencyDischargeWh.some((item) => item.deliveredWh > 0));
  assert.ok(source);
  const candidate = source.eligibleEmergencyDischargeWh.find((item) => item.deliveredWh > 0)!;
  const deliveredWh = Math.min(100, candidate.deliveredWh);
  const nextEpoch = source.epochIndex + 1;
  const afterDispatch = simulateEpoch({
    ...createDefaultSimulationInput({ scenario: "heatwave", seed: "soc-emergency" }),
    epochIndex: nextEpoch,
    priorEmergencyDischarges: [{ house: candidate.house, epochIndex: source.epochIndex, deliveredWh }],
  });
  const before = day[nextEpoch].batteryState.find((battery) => battery.house === candidate.house)!;
  const after = afterDispatch.batteryState.find((battery) => battery.house === candidate.house)!;
  assert.equal(after.availableWh, before.availableWh - deliveredWh);
  assert.equal(after.dischargedWh, before.dischargedWh + deliveredWh);
  assert.throws(() => simulateEpoch({
    ...createDefaultSimulationInput({ scenario: "heatwave", seed: "soc-emergency" }),
    epochIndex: nextEpoch,
    priorEmergencyDischarges: [
      { house: candidate.house, epochIndex: source.epochIndex, deliveredWh },
      { house: candidate.house, epochIndex: source.epochIndex, deliveredWh },
    ],
  }), /duplicate/);
  assert.throws(() => simulateEpoch({
    ...createDefaultSimulationInput({ scenario: "heatwave", seed: "soc-emergency" }),
    epochIndex: nextEpoch,
    priorEmergencyDischarges: [{ house: candidate.house, epochIndex: source.epochIndex, deliveredWh: source.batteryState.find((battery) => battery.house === candidate.house)!.availableWh + 1 }],
  }), /available energy/);
});

test("frozen curve preview follows integer boundaries", () => {
  assert.equal(previewPriceMicroVltPerKwh(0, 10), null);
  assert.equal(previewPriceMicroVltPerKwh(10, 0), null);
  assert.equal(previewPriceMicroVltPerKwh(100, 50), 3_000_000);
  assert.equal(previewPriceMicroVltPerKwh(100, 100), 5_000_000);
  assert.equal(previewPriceMicroVltPerKwh(100, 200), 7_000_000);
  assert.equal(previewPriceMicroVltPerKwh(100, 150), 6_000_000);
});

test("invalid values and duplicate houses are rejected", () => {
  assert.throws(() => simulateEpoch({ ...input("sunny"), epochIndex: 24 }), /epochIndex/);
  assert.throws(() => simulateEpoch({ ...input("sunny"), modelVersion: 2 as 1 }), /modelVersion/);
  assert.throws(() => simulateEpoch({ ...input("sunny"), scenario: "storm" as SimInput["scenario"] }), /scenario/);
  assert.throws(() => simulateEpoch({ ...input("sunny"), houses: [DEFAULT_HOUSES[0], DEFAULT_HOUSES[0]] }), /duplicate/);
  assert.throws(() => simulateEpoch({ ...input("sunny"), houses: [{ ...DEFAULT_HOUSES[0], address: "0x0000000000000000000000000000000000000000" }] }), /zero address/);
  assert.throws(() => simulateEpoch({ ...input("sunny"), houses: [{ ...DEFAULT_HOUSES[0], batteryCapacityWh: 100_001 }] }), /batteryCapacityWh/);
  assert.throws(() => simulateEpoch({ ...input("sunny"), transformerCapacityWh: 0 }), /transformerCapacityWh/);
  assert.throws(() => simulateEpoch({ ...input("sunny"), hour: 11 }), /hour/);
});

test("output records are immutable and compatible with Reading/Discharge shapes", () => {
  const output = simulateEpoch(input("sunny"));
  assert.ok(Object.isFrozen(output));
  assert.ok(Object.isFrozen(output.readings));
  assert.ok(Object.isFrozen(output.readings[0]));
  assert.deepEqual(Object.keys(output.readings[0]).sort(), ["consumptionWh", "generationWh", "house"]);
  const discharge = emergencyDischarges(output, 10)[0];
  if (discharge) {
    assert.deepEqual(Object.keys(discharge).sort(), ["deliveredWh", "house"]);
  }
});
