/**
 * VoltGrid's deterministic, model-only meter simulator.
 *
 * This module deliberately has no clock, network, filesystem, crypto, or
 * ambient random source. A run is a pure function of its explicit inputs.
 */
export declare const MODEL_VERSION: 1;
export declare const MAX_HOUSES: 16;
export declare const MAX_READING_WH: 100000;
export declare const MAX_EMERGENCY_TARGET_WH: 1600000;
export declare const EMERGENCY_THRESHOLD_BPS: 9500;
export declare const FEED_IN_TARIFF_MICRO_VLT_PER_KWH: 2500000;
export declare const RETAIL_TARIFF_MICRO_VLT_PER_KWH: 8000000;
export declare const DEFAULT_FLOOR_MICRO_VLT_PER_KWH: 3000000;
export declare const DEFAULT_BASE_MICRO_VLT_PER_KWH: 5000000;
export declare const DEFAULT_CAP_MICRO_VLT_PER_KWH: 7000000;
export declare const DEFAULT_WHEELING_FEE_MICRO_VLT_PER_KWH: 420000;
export declare const DEFAULT_EMERGENCY_TARIFF_MICRO_VLT_PER_KWH: 7500000;
export declare const DEFAULT_TRANSFORMER_CAPACITY_WH: 10000;
export type ModelVersion = typeof MODEL_VERSION;
export type Scenario = "sunny" | "rainy" | "heatwave";
export type HouseKind = "solarBattery" | "solarOnly" | "ev" | "regular" | "viewer";
export type Address = `0x${string}`;
export type DayId = `0x${string}`;
export type Reading = Readonly<{
    house: Address;
    generationWh: number;
    consumptionWh: number;
}>;
export type Discharge = Readonly<{
    house: Address;
    deliveredWh: number;
}>;
export type HouseConfig = Readonly<{
    address: Address;
    kind: HouseKind;
    hasSolar: boolean;
    hasBattery: boolean;
    batteryCapacityWh: number;
}>;
export type ModelledEmergencyDischarge = Readonly<Discharge & {
    epochIndex: number;
}>;
export type SimInput = Readonly<{
    modelVersion: ModelVersion;
    scenario: Scenario;
    seed: string;
    /** Frozen interface name for the simulated hour, 0 through 23. */
    epochIndex: number;
    /** Optional spelling accepted for callers that think in hours. */
    hour?: number;
    houses: readonly HouseConfig[];
    transformerCapacityWh: number;
    viewerEvCharging: boolean;
    /** Confirmed prior emergency reports replayed into the modelled SoC path. */
    priorEmergencyDischarges?: readonly ModelledEmergencyDischarge[];
    /** Optional chain-compatible day ID. If absent, a stable model day ID is derived. */
    dayId?: DayId;
}>;
export type SimDayInput = Readonly<Omit<SimInput, "epochIndex" | "hour">>;
export type SimulationUnits = Readonly<{
    energy: "Wh";
    price: "micro-VLT/kWh";
    stress: "bps";
    temperature: "degC";
    humidity: "bps";
    precipitation: "bps";
}>;
export declare const SIMULATION_UNITS: SimulationUnits;
export type WeatherCondition = "clear" | "rain" | "heatwave";
export type ModelledWeather = Readonly<{
    source: "modelled";
    condition: WeatherCondition;
    epochIndex: number;
    cloudCoverBps: number;
    irradianceBps: number;
    temperatureC: number;
    humidityBps: number;
    precipitationBps: number;
}>;
export type BatteryState = Readonly<{
    house: Address;
    capacityWh: number;
    availableWh: number;
    chargedWh: number;
    dischargedWh: number;
    eligibleEmergencyDischargeWh: number;
}>;
export type PricingParams = Readonly<{
    floorMicroVltPerKwh: number;
    baseMicroVltPerKwh: number;
    capMicroVltPerKwh: number;
}>;
export declare const DEFAULT_PRICING_PARAMS: PricingParams;
export type SimOutput = Readonly<{
    modelVersion: ModelVersion;
    source: "simulation";
    scenario: Scenario;
    seed: string;
    dayId: DayId;
    epochIndex: number;
    units: SimulationUnits;
    weather: ModelledWeather;
    readings: readonly Reading[];
    batteryAvailableWh: readonly Readonly<{
        house: Address;
        availableWh: number;
    }>[];
    batteryState: readonly BatteryState[];
    /** Conservative modelled discharge candidates for a future emergency report. */
    eligibleEmergencyDischargeWh: readonly Discharge[];
    totalGenerationWh: number;
    totalConsumptionWh: number;
    transformerCapacityWh: number;
    stressBps: number;
    emergencyProposed: boolean;
    proposedTargetWh: number;
    previewPriceMicroVltPerKwh: number | null;
}>;
export type SimulationObservationContext = Readonly<{
    modelVersion: ModelVersion;
    scenario: Scenario;
    seed: string;
    dayId: DayId;
    epochIndex: number;
}>;
/**
 * Reserved seam for a future GPS/weather/sensor adapter. The default
 * simulator never calls an adapter and never treats its output as household
 * generation or consumption. Adapter implementations belong outside sim-core.
 */
export interface SimulationInputAdapter<TObservation = unknown> {
    readonly name: string;
    observe(context: SimulationObservationContext): TObservation;
}
export declare class SimulationInputError extends Error {
    readonly code: "INVALID_INPUT";
    readonly field: string;
    constructor(field: string, message: string);
}
export declare const DEFAULT_HOUSES: readonly HouseConfig[];
/** Exact integer preview of the frozen VoltGrid on-chain pricing curve. */
export declare function previewPriceMicroVltPerKwh(totalSurplusWh: number, totalDeficitWh: number, params?: PricingParams): number | null;
export declare const calculatePricePreview: typeof previewPriceMicroVltPerKwh;
export declare const previewPrice: typeof previewPriceMicroVltPerKwh;
export declare function simulateEpoch(input: SimInput): SimOutput;
export declare function simulateDay(input: SimDayInput): readonly SimOutput[];
export declare const generateDay: typeof simulateDay;
export type DefaultHouseOptions = Readonly<{
    viewerAddress?: Address;
    viewerHasSolar?: boolean;
    viewerHasBattery?: boolean;
    viewerBatteryCapacityWh?: number;
}>;
export declare function createDefaultHouses(options?: DefaultHouseOptions): readonly HouseConfig[];
export type DefaultSimulationOptions = Readonly<{
    scenario: Scenario;
    seed: string;
    viewerAddress?: Address;
    viewerHasSolar?: boolean;
    viewerHasBattery?: boolean;
    viewerBatteryCapacityWh?: number;
    viewerEvCharging?: boolean;
    transformerCapacityWh?: number;
    dayId?: DayId;
}>;
export declare function createDefaultSimulationInput(options: DefaultSimulationOptions): SimDayInput;
/** Convert positive modelled candidates to the frozen Discharge ABI shape. */
export declare function emergencyDischarges(output: SimOutput, targetWh?: number): readonly Discharge[];
