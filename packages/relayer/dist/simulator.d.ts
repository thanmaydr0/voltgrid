import type { DayId, HouseConfig, ModelledEmergencyDischarge, Scenario, SimOutput } from "./types";
export declare const simCore: Readonly<{
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
