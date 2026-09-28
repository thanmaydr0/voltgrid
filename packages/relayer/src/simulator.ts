import type { DayId, HouseConfig, ModelledEmergencyDischarge, Scenario, SimOutput } from "./types";

type SimCoreModule = Readonly<{
  MODEL_VERSION: 1;
  MAX_EMERGENCY_TARGET_WH: number;
  DEFAULT_HOUSES: readonly HouseConfig[];
  simulateEpoch(input: Readonly<{
    modelVersion: 1;
    scenario: Scenario;
    seed: string;
    dayId: DayId;
    epochIndex: number;
    houses: readonly HouseConfig[];
    transformerCapacityWh: number;
    viewerEvCharging: boolean;
    priorEmergencyDischarges?: readonly ModelledEmergencyDischarge[];
  }>): SimOutput;
}>;

function loadSimulator(): SimCoreModule {
  try {
    return require("voltgrid-sim-core") as SimCoreModule;
  } catch {
    // P6 will reconcile the workspace dependency. This fallback keeps the
    // no-install local test path usable in the shared checkout.
    return require("../../sim-core/src/index") as SimCoreModule;
  }
}

export const simCore = loadSimulator();
