/**
 * VoltGrid's deterministic, model-only meter simulator.
 *
 * This module deliberately has no clock, network, filesystem, crypto, or
 * ambient random source. A run is a pure function of its explicit inputs.
 */

export const MODEL_VERSION = 1 as const;
export const MAX_HOUSES = 16 as const;
export const MAX_READING_WH = 100_000 as const;
export const MAX_EMERGENCY_TARGET_WH = 1_600_000 as const;
export const EMERGENCY_THRESHOLD_BPS = 9_500 as const;

export const FEED_IN_TARIFF_MICRO_VLT_PER_KWH = 2_500_000 as const;
export const RETAIL_TARIFF_MICRO_VLT_PER_KWH = 8_000_000 as const;
export const DEFAULT_FLOOR_MICRO_VLT_PER_KWH = 3_000_000 as const;
export const DEFAULT_BASE_MICRO_VLT_PER_KWH = 5_000_000 as const;
export const DEFAULT_CAP_MICRO_VLT_PER_KWH = 7_000_000 as const;
export const DEFAULT_WHEELING_FEE_MICRO_VLT_PER_KWH = 420_000 as const;
export const DEFAULT_EMERGENCY_TARIFF_MICRO_VLT_PER_KWH = 7_500_000 as const;
export const DEFAULT_TRANSFORMER_CAPACITY_WH = 10_000 as const;

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

export type ModelledEmergencyDischarge = Readonly<Discharge & { epochIndex: number }>;

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

export const SIMULATION_UNITS: SimulationUnits = Object.freeze({
  energy: "Wh",
  price: "micro-VLT/kWh",
  stress: "bps",
  temperature: "degC",
  humidity: "bps",
  precipitation: "bps",
});

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

export const DEFAULT_PRICING_PARAMS: PricingParams = Object.freeze({
  floorMicroVltPerKwh: DEFAULT_FLOOR_MICRO_VLT_PER_KWH,
  baseMicroVltPerKwh: DEFAULT_BASE_MICRO_VLT_PER_KWH,
  capMicroVltPerKwh: DEFAULT_CAP_MICRO_VLT_PER_KWH,
});

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
  batteryAvailableWh: readonly Readonly<{ house: Address; availableWh: number }>[];
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

export class SimulationInputError extends Error {
  readonly code: "INVALID_INPUT";
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "SimulationInputError";
    this.code = "INVALID_INPUT";
    this.field = field;
  }
}

const DAY_HOURS = 24;
const BPS = 10_000;
const BATTERY_CHARGE_EFFICIENCY_BPS = 9_000;
const EMERGENCY_RESERVE_BPS = 8_000;

const SOLAR_BELL_BPS: readonly number[] = Object.freeze([
  0, 0, 0, 0, 0, 0, 1_800, 4_000, 6_000, 7_800, 9_000, 9_800,
  10_000, 9_800, 9_000, 7_800, 6_000, 4_000, 1_800, 0, 0, 0, 0, 0,
]);

const DEFAULT_HOUSE_ADDRESSES = [
  "0x0000000000000000000000000000000000000101",
  "0x0000000000000000000000000000000000000102",
  "0x0000000000000000000000000000000000000103",
  "0x0000000000000000000000000000000000000104",
  "0x0000000000000000000000000000000000000105",
  "0x0000000000000000000000000000000000000106",
  "0x0000000000000000000000000000000000000107",
  "0x0000000000000000000000000000000000000108",
] as const satisfies readonly Address[];

export const DEFAULT_HOUSES: readonly HouseConfig[] = Object.freeze([
  Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[0], kind: "solarBattery", hasSolar: true, hasBattery: true, batteryCapacityWh: 6_000 }),
  Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[1], kind: "solarBattery", hasSolar: true, hasBattery: true, batteryCapacityWh: 6_500 }),
  Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[2], kind: "solarBattery", hasSolar: true, hasBattery: true, batteryCapacityWh: 5_500 }),
  Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[3], kind: "solarOnly", hasSolar: true, hasBattery: false, batteryCapacityWh: 0 }),
  Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[4], kind: "ev", hasSolar: false, hasBattery: false, batteryCapacityWh: 0 }),
  Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[5], kind: "ev", hasSolar: false, hasBattery: false, batteryCapacityWh: 0 }),
  Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[6], kind: "regular", hasSolar: false, hasBattery: false, batteryCapacityWh: 0 }),
  Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[7], kind: "regular", hasSolar: false, hasBattery: false, batteryCapacityWh: 0 }),
]);

const VALID_SCENARIOS: readonly Scenario[] = ["sunny", "rainy", "heatwave"];
const VALID_KINDS: readonly HouseKind[] = ["solarBattery", "solarOnly", "ev", "regular", "viewer"];

function fail(field: string, message: string): never {
  throw new SimulationInputError(field, message);
}

function assertSafeInteger(field: string, value: unknown, min: number, max: number): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(field, `must be an integer between ${min} and ${max}`);
  }
}

function assertBoolean(field: string, value: unknown): asserts value is boolean {
  if (typeof value !== "boolean") {
    fail(field, "must be a boolean");
  }
}

function assertAddress(field: string, address: unknown): asserts address is Address {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    fail(field, "must be a 20-byte 0x-prefixed hex address");
  }
  if (/^0x0{40}$/i.test(address)) {
    fail(field, "zero address is not permitted");
  }
}

function assertDayId(field: string, dayId: unknown): asserts dayId is DayId {
  if (typeof dayId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(dayId)) {
    fail(field, "must be a 32-byte 0x-prefixed hex value");
  }
}

function assertScenario(value: unknown): asserts value is Scenario {
  if (typeof value !== "string" || !VALID_SCENARIOS.includes(value as Scenario)) {
    fail("scenario", `must be one of ${VALID_SCENARIOS.join(", ")}`);
  }
}

function assertKind(value: unknown, field: string): asserts value is HouseKind {
  if (typeof value !== "string" || !VALID_KINDS.includes(value as HouseKind)) {
    fail(field, `must be one of ${VALID_KINDS.join(", ")}`);
  }
}

function normalizeAddress(address: Address): string {
  return address.toLowerCase();
}

function validateHouses(houses: readonly HouseConfig[]): readonly HouseConfig[] {
  if (!Array.isArray(houses) || houses.length < 1 || houses.length > MAX_HOUSES) {
    fail("houses", `must contain between 1 and ${MAX_HOUSES} houses`);
  }

  const seen = new Set<string>();
  const validated: HouseConfig[] = [];
  houses.forEach((house, index) => {
    if (house === null || typeof house !== "object") {
      fail(`houses[${index}]`, "must be an object");
    }
    assertAddress(`houses[${index}].address`, house.address);
    const key = normalizeAddress(house.address);
    if (seen.has(key)) {
      fail(`houses[${index}].address`, "duplicate house address");
    }
    seen.add(key);

    assertKind(house.kind, `houses[${index}].kind`);
    assertBoolean(`houses[${index}].hasSolar`, house.hasSolar);
    assertBoolean(`houses[${index}].hasBattery`, house.hasBattery);
    assertSafeInteger(`houses[${index}].batteryCapacityWh`, house.batteryCapacityWh, 0, MAX_READING_WH);
    if (!house.hasBattery && house.batteryCapacityWh !== 0) {
      fail(`houses[${index}].batteryCapacityWh`, "must be zero when hasBattery is false");
    }
    if (house.hasBattery && house.batteryCapacityWh === 0) {
      fail(`houses[${index}].batteryCapacityWh`, "must be positive when hasBattery is true");
    }
    if (house.kind === "solarBattery" && (!house.hasSolar || !house.hasBattery)) {
      fail(`houses[${index}]`, "solarBattery houses need both solar and a battery");
    }
    if (house.kind === "solarOnly" && (!house.hasSolar || house.hasBattery)) {
      fail(`houses[${index}]`, "solarOnly houses need solar and no battery");
    }
    if ((house.kind === "ev" || house.kind === "regular") && (house.hasSolar || house.hasBattery)) {
      fail(`houses[${index}]`, `${house.kind} houses cannot have solar or a battery`);
    }
    validated.push(house);
  });
  return Object.freeze(validated);
}

function validateInput(input: SimInput): readonly HouseConfig[] {
  if (input === null || typeof input !== "object") {
    fail("input", "must be an object");
  }
  if (input.modelVersion !== MODEL_VERSION) {
    fail("modelVersion", `must equal ${MODEL_VERSION}`);
  }
  assertScenario(input.scenario);
  if (typeof input.seed !== "string" || input.seed.length === 0 || input.seed.length > 256) {
    fail("seed", "must be a non-empty string of at most 256 characters");
  }
  assertSafeInteger("epochIndex", input.epochIndex, 0, DAY_HOURS - 1);
  if (input.hour !== undefined) {
    assertSafeInteger("hour", input.hour, 0, DAY_HOURS - 1);
    if (input.hour !== input.epochIndex) {
      fail("hour", "must match epochIndex when both are supplied");
    }
  }
  assertSafeInteger("transformerCapacityWh", input.transformerCapacityWh, 1, Number.MAX_SAFE_INTEGER);
  assertBoolean("viewerEvCharging", input.viewerEvCharging);
  if (input.dayId !== undefined) {
    assertDayId("dayId", input.dayId);
  }
  const houses = validateHouses(input.houses);
  if (input.priorEmergencyDischarges !== undefined) {
    if (!Array.isArray(input.priorEmergencyDischarges)) {
      fail("priorEmergencyDischarges", "must be an array");
    }
    const houseByAddress = new Map(houses.map((house) => [normalizeAddress(house.address), house]));
    const seen = new Set<string>();
    for (let index = 0; index < input.priorEmergencyDischarges.length; index += 1) {
      const discharge = input.priorEmergencyDischarges[index];
      if (discharge === null || typeof discharge !== "object") {
        fail(`priorEmergencyDischarges[${index}]`, "must be an object");
      }
      assertAddress(`priorEmergencyDischarges[${index}].house`, discharge.house);
      assertSafeInteger(`priorEmergencyDischarges[${index}].epochIndex`, discharge.epochIndex, 0, input.epochIndex - 1);
      assertSafeInteger(`priorEmergencyDischarges[${index}].deliveredWh`, discharge.deliveredWh, 1, MAX_READING_WH);
      const house = houseByAddress.get(normalizeAddress(discharge.house));
      if (!house?.hasBattery) fail(`priorEmergencyDischarges[${index}].house`, "must be a registered modelled battery");
      if (discharge.deliveredWh > house.batteryCapacityWh) {
        fail(`priorEmergencyDischarges[${index}].deliveredWh`, "must not exceed battery capacity");
      }
      const key = `${discharge.epochIndex}|${normalizeAddress(discharge.house)}`;
      if (seen.has(key)) fail(`priorEmergencyDischarges[${index}]`, "duplicate house/epoch discharge");
      seen.add(key);
    }
  }
  return houses;
}

function hash32(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash >>> 0;
}

function seededBps(seed: string, key: string, min: number, max: number): number {
  const span = max - min + 1;
  return min + (hash32(`${seed}|${key}`) % span);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function scaleBps(value: number, multiplierBps: number): number {
  return Math.floor((value * multiplierBps) / BPS);
}

function weatherFor(scenario: Scenario, seed: string, epochIndex: number): ModelledWeather {
  const weatherNoise = seededBps(seed, `weather:${epochIndex}`, -300, 300);
  const daylight = SOLAR_BELL_BPS[epochIndex];
  let irradianceBps: number;
  let temperatureC: number;
  let humidityBps: number;
  let precipitationBps: number;
  let condition: WeatherCondition;

  if (scenario === "sunny") {
    condition = "clear";
    irradianceBps = clampInteger(9_700 + weatherNoise, 0, BPS);
    temperatureC = clampInteger(20 + Math.floor((daylight * 12) / BPS) + Math.floor(weatherNoise / 150), 15, 38);
    humidityBps = clampInteger(4_200 - Math.floor((daylight * 1_500) / BPS) - weatherNoise, 1_500, 7_000);
    precipitationBps = 0;
  } else if (scenario === "rainy") {
    condition = "rain";
    irradianceBps = clampInteger(3_300 + weatherNoise, 1_500, 5_000);
    temperatureC = clampInteger(19 + Math.floor((daylight * 6) / BPS) + Math.floor(weatherNoise / 200), 15, 30);
    humidityBps = clampInteger(8_200 + Math.floor(weatherNoise / 2), 7_000, 10_000);
    precipitationBps = clampInteger(6_500 + Math.floor(weatherNoise / 2), 5_000, 8_000);
  } else {
    condition = "heatwave";
    irradianceBps = clampInteger(8_900 + weatherNoise, 7_000, BPS);
    temperatureC = clampInteger(33 + Math.floor((daylight * 10) / BPS) + Math.floor(weatherNoise / 150), 30, 48);
    humidityBps = clampInteger(2_700 - Math.floor((daylight * 700) / BPS) - Math.floor(weatherNoise / 2), 1_000, 4_500);
    precipitationBps = 0;
  }

  return Object.freeze({
    source: "modelled",
    condition,
    epochIndex,
    cloudCoverBps: BPS - irradianceBps,
    irradianceBps,
    temperatureC,
    humidityBps,
    precipitationBps,
  });
}

function dayIdFor(input: SimInput, houses: readonly HouseConfig[]): DayId {
  if (input.dayId !== undefined) {
    return input.dayId.toLowerCase() as DayId;
  }
  const houseMap = houses.map((house) => `${normalizeAddress(house.address)}:${house.kind}:${house.hasSolar ? 1 : 0}:${house.hasBattery ? 1 : 0}:${house.batteryCapacityWh}`).join(",");
  const material = `${MODEL_VERSION}|${input.scenario}|${input.seed}|${input.transformerCapacityWh}|${input.viewerEvCharging ? 1 : 0}|${houseMap}`;
  let value = "";
  for (let part = 0; part < 8; part += 1) {
    value += hash32(`${material}|${part}`).toString(16).padStart(8, "0");
  }
  return `0x${value}` as DayId;
}

function solarGenerationWh(house: HouseConfig, weather: ModelledWeather, seed: string, epochIndex: number): number {
  if (!house.hasSolar) {
    return 0;
  }
  const nameFactor = house.kind === "solarOnly" ? 5_200 : house.kind === "viewer" ? 4_300 : 4_600;
  const houseFactorBps = seededBps(seed, `${house.address}:solar:${epochIndex}`, 9_400, 10_600);
  const scenarioFactorBps = weather.condition === "rain" ? 9_000 : weather.condition === "heatwave" ? 9_500 : 10_000;
  const withShape = scaleBps(nameFactor, SOLAR_BELL_BPS[epochIndex]);
  const withWeather = scaleBps(withShape, weather.irradianceBps);
  return clampInteger(scaleBps(scaleBps(withWeather, houseFactorBps), scenarioFactorBps), 0, MAX_READING_WH);
}

function eveningLoadBps(epochIndex: number): number {
  if (epochIndex >= 17 && epochIndex <= 22) {
    return 10_000;
  }
  if (epochIndex >= 7 && epochIndex <= 16) {
    return 5_500;
  }
  return 3_000;
}

function consumptionWh(house: HouseConfig, scenario: Scenario, seed: string, epochIndex: number, viewerEvCharging: boolean): number {
  const evening = eveningLoadBps(epochIndex);
  let baseline: number;
  if (house.kind === "ev") {
    baseline = 360 + scaleBps(2_650, evening);
  } else if (house.kind === "regular") {
    baseline = 430 + scaleBps(620, evening);
  } else {
    baseline = 470 + scaleBps(430, evening);
  }

  if (house.kind === "viewer" && viewerEvCharging) {
    baseline += scaleBps(2_900, evening);
  }
  if (scenario === "rainy") {
    baseline += 80;
  } else if (scenario === "heatwave") {
    // Modelled cooling load is intentionally largest during the hot evening.
    baseline += 350 + (epochIndex >= 11 && epochIndex <= 21 ? 520 : 0);
  }

  const variationBps = seededBps(seed, `${house.address}:load:${epochIndex}`, 9_700, 10_300);
  return clampInteger(scaleBps(baseline, variationBps), 0, MAX_READING_WH);
}

type MutableBatteryState = {
  house: HouseConfig;
  availableWh: number;
  chargedWh: number;
  dischargedWh: number;
};

function initialBatteryState(house: HouseConfig, seed: string): MutableBatteryState {
  const initialSoCBps = seededBps(seed, `${house.address}:initial-soc`, 4_500, 7_000);
  return {
    house,
    availableWh: scaleBps(house.batteryCapacityWh, initialSoCBps),
    chargedWh: 0,
    dischargedWh: 0,
  };
}

function batteryStatesFor(houses: readonly HouseConfig[], seed: string): MutableBatteryState[] {
  return houses.filter((house) => house.hasBattery).map((house) => initialBatteryState(house, seed));
}

function advanceBatteryState(state: MutableBatteryState, reading: Reading): void {
  const surplusWh = Math.max(reading.generationWh - reading.consumptionWh, 0);
  const deficitWh = Math.max(reading.consumptionWh - reading.generationWh, 0);
  if (surplusWh > 0 && state.availableWh < state.house.batteryCapacityWh) {
    const storableWh = scaleBps(surplusWh, BATTERY_CHARGE_EFFICIENCY_BPS);
    const chargedWh = Math.min(storableWh, state.house.batteryCapacityWh - state.availableWh);
    state.availableWh += chargedWh;
    state.chargedWh += chargedWh;
  } else if (deficitWh > 0 && state.availableWh > 0) {
    const dischargedWh = Math.min(deficitWh, state.availableWh);
    state.availableWh -= dischargedWh;
    state.dischargedWh += dischargedWh;
  }
}

function priceMultiplierBps(ratioBps: number): number {
  if (ratioBps <= 5_000) {
    return 6_000;
  }
  if (ratioBps <= 10_000) {
    return 6_000 + Math.floor(((ratioBps - 5_000) * 4_000) / 5_000);
  }
  if (ratioBps <= 20_000) {
    return 10_000 + Math.floor(((ratioBps - 10_000) * 4_000) / 10_000);
  }
  return 14_000;
}

function validatePricingParams(params: PricingParams): void {
  assertSafeInteger("pricing.floorMicroVltPerKwh", params.floorMicroVltPerKwh, 3_000_000, 7_000_000);
  assertSafeInteger("pricing.baseMicroVltPerKwh", params.baseMicroVltPerKwh, 3_000_000, 7_000_000);
  assertSafeInteger("pricing.capMicroVltPerKwh", params.capMicroVltPerKwh, 3_000_000, 7_000_000);
  if (!(params.floorMicroVltPerKwh <= params.baseMicroVltPerKwh && params.baseMicroVltPerKwh <= params.capMicroVltPerKwh)) {
    fail("pricing", "must satisfy floor <= base <= cap");
  }
}

/** Exact integer preview of the frozen VoltGrid on-chain pricing curve. */
export function previewPriceMicroVltPerKwh(
  totalSurplusWh: number,
  totalDeficitWh: number,
  params: PricingParams = DEFAULT_PRICING_PARAMS,
): number | null {
  assertSafeInteger("totalSurplusWh", totalSurplusWh, 0, Number.MAX_SAFE_INTEGER);
  assertSafeInteger("totalDeficitWh", totalDeficitWh, 0, Number.MAX_SAFE_INTEGER);
  validatePricingParams(params);
  if (totalSurplusWh === 0 || totalDeficitWh === 0) {
    return null;
  }
  const ratioBps = Math.floor((totalDeficitWh * BPS) / totalSurplusWh);
  const curvePrice = Math.floor((params.baseMicroVltPerKwh * priceMultiplierBps(ratioBps)) / BPS);
  return clampInteger(curvePrice, params.floorMicroVltPerKwh, params.capMicroVltPerKwh);
}

export const calculatePricePreview = previewPriceMicroVltPerKwh;
export const previewPrice = previewPriceMicroVltPerKwh;

function deriveBatteryStateForEpoch(input: SimInput, houses: readonly HouseConfig[], weatherForEpoch: ModelledWeather): readonly MutableBatteryState[] {
  const states = batteryStatesFor(houses, input.seed);
  const dischargesByHour = new Map<number, Map<string, number>>();
  for (const discharge of input.priorEmergencyDischarges ?? []) {
    const byHouse = dischargesByHour.get(discharge.epochIndex) ?? new Map<string, number>();
    byHouse.set(normalizeAddress(discharge.house), discharge.deliveredWh);
    dischargesByHour.set(discharge.epochIndex, byHouse);
  }
  for (let hour = 0; hour <= input.epochIndex; hour += 1) {
    const weather = hour === input.epochIndex ? weatherForEpoch : weatherFor(input.scenario, input.seed, hour);
    for (const state of states) {
      const reading: Reading = Object.freeze({
        house: state.house.address,
        generationWh: solarGenerationWh(state.house, weather, input.seed, hour),
        consumptionWh: consumptionWh(state.house, input.scenario, input.seed, hour, input.viewerEvCharging),
      });
      advanceBatteryState(state, reading);
      const emergencyWh = dischargesByHour.get(hour)?.get(normalizeAddress(state.house.address)) ?? 0;
      if (emergencyWh > state.availableWh) {
        fail("priorEmergencyDischarges", `epoch ${hour} discharge exceeds modelled available energy for ${state.house.address}`);
      }
      state.availableWh -= emergencyWh;
      state.dischargedWh += emergencyWh;
    }
  }
  return states;
}

function makeOutput(input: SimInput, houses: readonly HouseConfig[]): SimOutput {
  const weather = weatherFor(input.scenario, input.seed, input.epochIndex);
  const readings = Object.freeze(houses.map((house) => Object.freeze({
    house: house.address,
    generationWh: solarGenerationWh(house, weather, input.seed, input.epochIndex),
    consumptionWh: consumptionWh(house, input.scenario, input.seed, input.epochIndex, input.viewerEvCharging),
  })));
  const totalGenerationWh = readings.reduce((total, reading) => total + reading.generationWh, 0);
  const totalConsumptionWh = readings.reduce((total, reading) => total + reading.consumptionWh, 0);
  const surplusWh = readings.reduce((total, reading) => total + Math.max(reading.generationWh - reading.consumptionWh, 0), 0);
  const deficitWh = readings.reduce((total, reading) => total + Math.max(reading.consumptionWh - reading.generationWh, 0), 0);
  const stressBps = Math.floor((totalConsumptionWh * BPS) / input.transformerCapacityWh);
  const emergencyProposed = stressBps > EMERGENCY_THRESHOLD_BPS;
  const safeLoadAtThresholdWh = Math.floor((input.transformerCapacityWh * EMERGENCY_THRESHOLD_BPS) / BPS);
  const proposedTargetWh = emergencyProposed
    ? clampInteger(totalConsumptionWh - safeLoadAtThresholdWh, 1, MAX_EMERGENCY_TARGET_WH)
    : 0;

  const mutableBatteryStates = deriveBatteryStateForEpoch(input, houses, weather);
  const batteryState = Object.freeze(mutableBatteryStates.map((state) => Object.freeze({
    house: state.house.address,
    capacityWh: state.house.batteryCapacityWh,
    availableWh: clampInteger(state.availableWh, 0, state.house.batteryCapacityWh),
    chargedWh: state.chargedWh,
    dischargedWh: state.dischargedWh,
    eligibleEmergencyDischargeWh: scaleBps(state.availableWh, EMERGENCY_RESERVE_BPS),
  })));
  const batteryAvailableWh = Object.freeze(batteryState.map((state) => Object.freeze({
    house: state.house,
    availableWh: state.availableWh,
  })));
  const eligibleEmergencyDischargeWh = Object.freeze(batteryState.map((state) => Object.freeze({
    house: state.house,
    deliveredWh: state.eligibleEmergencyDischargeWh,
  })));

  const output: SimOutput = {
    modelVersion: MODEL_VERSION,
    source: "simulation",
    scenario: input.scenario,
    seed: input.seed,
    dayId: dayIdFor(input, houses),
    epochIndex: input.epochIndex,
    units: SIMULATION_UNITS,
    weather,
    readings,
    batteryAvailableWh,
    batteryState,
    eligibleEmergencyDischargeWh,
    totalGenerationWh,
    totalConsumptionWh,
    transformerCapacityWh: input.transformerCapacityWh,
    stressBps,
    emergencyProposed,
    proposedTargetWh,
    previewPriceMicroVltPerKwh: previewPriceMicroVltPerKwh(surplusWh, deficitWh),
  };
  return Object.freeze(output);
}

export function simulateEpoch(input: SimInput): SimOutput {
  const houses = validateInput(input);
  return makeOutput(input, houses);
}

export function simulateDay(input: SimDayInput): readonly SimOutput[] {
  if (input === null || typeof input !== "object") {
    fail("input", "must be an object");
  }
  const outputs: SimOutput[] = [];
  for (let epochIndex = 0; epochIndex < DAY_HOURS; epochIndex += 1) {
    outputs.push(simulateEpoch(Object.freeze({ ...input, epochIndex })));
  }
  return Object.freeze(outputs);
}

export const generateDay = simulateDay;

export type DefaultHouseOptions = Readonly<{
  viewerAddress?: Address;
  viewerHasSolar?: boolean;
  viewerHasBattery?: boolean;
  viewerBatteryCapacityWh?: number;
}>;

export function createDefaultHouses(options: DefaultHouseOptions = {}): readonly HouseConfig[] {
  if (options.viewerAddress === undefined) {
    return DEFAULT_HOUSES;
  }
  assertAddress("viewerAddress", options.viewerAddress);
  const viewerHasSolar = options.viewerHasSolar ?? false;
  const viewerHasBattery = options.viewerHasBattery ?? false;
  const viewerBatteryCapacityWh = options.viewerBatteryCapacityWh ?? 0;
  assertBoolean("viewerHasSolar", viewerHasSolar);
  assertBoolean("viewerHasBattery", viewerHasBattery);
  assertSafeInteger("viewerBatteryCapacityWh", viewerBatteryCapacityWh, 0, MAX_READING_WH);
  const viewer: HouseConfig = Object.freeze({
    address: options.viewerAddress,
    kind: "viewer",
    hasSolar: viewerHasSolar,
    hasBattery: viewerHasBattery,
    batteryCapacityWh: viewerBatteryCapacityWh,
  });
  return validateHouses(Object.freeze([...DEFAULT_HOUSES, viewer]));
}

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

export function createDefaultSimulationInput(options: DefaultSimulationOptions): SimDayInput {
  assertScenario(options.scenario);
  if (typeof options.seed !== "string" || options.seed.length === 0) {
    fail("seed", "must be a non-empty string");
  }
  const viewerEvCharging = options.viewerEvCharging ?? false;
  assertBoolean("viewerEvCharging", viewerEvCharging);
  const transformerCapacityWh = options.transformerCapacityWh ?? DEFAULT_TRANSFORMER_CAPACITY_WH;
  assertSafeInteger("transformerCapacityWh", transformerCapacityWh, 1, Number.MAX_SAFE_INTEGER);
  if (options.dayId !== undefined) {
    assertDayId("dayId", options.dayId);
  }
  return Object.freeze({
    modelVersion: MODEL_VERSION,
    scenario: options.scenario,
    seed: options.seed,
    houses: createDefaultHouses(options),
    transformerCapacityWh,
    viewerEvCharging,
    ...(options.dayId === undefined ? {} : { dayId: options.dayId }),
  });
}

/** Convert positive modelled candidates to the frozen Discharge ABI shape. */
export function emergencyDischarges(output: SimOutput, targetWh = output.proposedTargetWh): readonly Discharge[] {
  assertSafeInteger("targetWh", targetWh, 0, MAX_EMERGENCY_TARGET_WH);
  let remaining = targetWh;
  const result: Discharge[] = [];
  for (const candidate of output.eligibleEmergencyDischargeWh) {
    if (remaining === 0) {
      break;
    }
    const deliveredWh = Math.min(candidate.deliveredWh, remaining);
    if (deliveredWh > 0) {
      result.push(Object.freeze({ house: candidate.house, deliveredWh }));
      remaining -= deliveredWh;
    }
  }
  return Object.freeze(result);
}
