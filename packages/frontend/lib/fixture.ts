import type { SimOutput, Scenario } from "voltgrid-sim-core";
import type { Address } from "viem";
import type { Provenance } from "@/lib/provenance";
import { makeSimulationSnapshot } from "@/lib/simulation";

export type { Scenario };

export type FixtureHouse = {
  id: string;
  name: string;
  role: "solar" | "battery" | "consumer" | "viewer";
  x: number;
  y: number;
  generationWh: number;
  consumptionWh: number;
  accent: string;
};

export type FixtureSnapshot = {
  scenario: Scenario;
  seed: string;
  hour: number;
  price: number | null;
  floor: number;
  cap: number;
  feedIn: number;
  retail: number;
  matchedWh: number;
  totalGenerationWh: number;
  totalConsumptionWh: number;
  transformerCapacityWh: number;
  stressPercent: number;
  proposedEmergency: boolean;
  shavedWh: number;
  provenance: Extract<Provenance, { kind: "model-preview" }>;
  houses: FixtureHouse[];
  output: SimOutput;
};

const SCENARIO_LABELS: Record<Scenario, string> = {
  sunny: "Sunny Sunday",
  rainy: "Rainy day",
  heatwave: "Heatwave evening",
};

export function scenarioLabel(scenario: Scenario) {
  return SCENARIO_LABELS[scenario];
}

export function makeFixture(
  scenario: Scenario,
  hour: number,
  viewerEvCharging: boolean,
  seed = "p3-fixture",
  viewerAddress?: Address,
): FixtureSnapshot {
  return makeSimulationSnapshot(scenario, seed, Math.max(0, Math.min(23, hour)), viewerEvCharging, viewerAddress);
}

export function makePriceSeries(scenario: Scenario, seed = "p3-fixture", viewerEvCharging = false, viewerAddress?: Address) {
  return Array.from({ length: 24 }, (_, epochIndex) => makeSimulationSnapshot(scenario, seed, epochIndex, viewerEvCharging, viewerAddress).price);
}
