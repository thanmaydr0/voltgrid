import {
  DEFAULT_HOUSES,
  DEFAULT_TRANSFORMER_CAPACITY_WH,
  createDefaultHouses,
  simulateEpoch,
  type Address as SimAddress,
  type HouseKind,
  type Scenario,
  type SimOutput,
} from "voltgrid-sim-core";
import type { Address } from "viem";
import type { FixtureHouse, FixtureSnapshot } from "@/lib/fixture";

const HOUSE_POSITIONS = [
  [84, 70], [214, 70], [344, 70], [84, 188], [214, 188], [344, 188], [474, 70], [474, 188], [474, 129],
] as const;

function roleFor(kind: HouseKind): FixtureHouse["role"] {
  if (kind === "solarOnly") return "solar";
  if (kind === "solarBattery") return "battery";
  if (kind === "viewer") return "viewer";
  return "consumer";
}

function labelFor(index: number, kind: HouseKind): string {
  if (kind === "viewer") return "You";
  return `${index < 3 ? "Maple" : index < 6 ? "Pine" : "Cedar"} ${String((index % 3) + 1).padStart(2, "0")}`;
}

function toSnapshot(output: SimOutput, scenario: Scenario, seed: string, houseMetadata: readonly { kind: HouseKind }[]): FixtureSnapshot {
  const houses = output.readings.map((reading, index) => {
    const kind = houseMetadata[index]?.kind ?? (reading.generationWh > 0 ? "solarOnly" : "regular");
    const position = HOUSE_POSITIONS[index] ?? [474, 129];
    return {
      id: reading.house,
      name: labelFor(index, kind),
      role: roleFor(kind),
      x: position[0],
      y: position[1],
      generationWh: reading.generationWh,
      consumptionWh: reading.consumptionWh,
      accent: roleFor(kind),
    };
  });
  const surplusWh = output.readings.reduce((sum, item) => sum + Math.max(item.generationWh - item.consumptionWh, 0), 0);
  const deficitWh = output.readings.reduce((sum, item) => sum + Math.max(item.consumptionWh - item.generationWh, 0), 0);
  return {
    scenario,
    seed,
    hour: output.epochIndex,
    price: output.previewPriceMicroVltPerKwh === null ? null : output.previewPriceMicroVltPerKwh / 1_000_000,
    floor: 3,
    cap: 7,
    feedIn: 2.5,
    retail: 8,
    matchedWh: Math.min(surplusWh, deficitWh),
    totalGenerationWh: output.totalGenerationWh,
    totalConsumptionWh: output.totalConsumptionWh,
    transformerCapacityWh: output.transformerCapacityWh,
    stressPercent: output.stressBps / 100,
    proposedEmergency: output.emergencyProposed,
    shavedWh: output.proposedTargetWh,
    provenance: { kind: "model-preview", modelVersion: 1, scenario, seed, epochIndex: output.epochIndex },
    houses,
    output,
  };
}

export function makeSimulationSnapshot(
  scenario: Scenario,
  seed: string,
  epochIndex: number,
  viewerEvCharging: boolean,
  viewerAddress?: Address,
  dayId?: `0x${string}`,
): FixtureSnapshot {
  const houses = viewerAddress
    ? createDefaultHouses({ viewerAddress: viewerAddress as SimAddress })
    : DEFAULT_HOUSES;
  const output = simulateEpoch({
    modelVersion: 1,
    scenario,
    seed,
    epochIndex,
    houses,
    transformerCapacityWh: DEFAULT_TRANSFORMER_CAPACITY_WH,
    viewerEvCharging,
    ...(dayId ? { dayId } : {}),
  });
  return toSnapshot(output, scenario, seed, houses);
}

