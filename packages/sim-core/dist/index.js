"use strict";
/**
 * VoltGrid's deterministic, model-only meter simulator.
 *
 * This module deliberately has no clock, network, filesystem, crypto, or
 * ambient random source. A run is a pure function of its explicit inputs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDay = exports.previewPrice = exports.calculatePricePreview = exports.DEFAULT_HOUSES = exports.SimulationInputError = exports.DEFAULT_PRICING_PARAMS = exports.SIMULATION_UNITS = exports.DEFAULT_TRANSFORMER_CAPACITY_WH = exports.DEFAULT_EMERGENCY_TARIFF_MICRO_VLT_PER_KWH = exports.DEFAULT_WHEELING_FEE_MICRO_VLT_PER_KWH = exports.DEFAULT_CAP_MICRO_VLT_PER_KWH = exports.DEFAULT_BASE_MICRO_VLT_PER_KWH = exports.DEFAULT_FLOOR_MICRO_VLT_PER_KWH = exports.RETAIL_TARIFF_MICRO_VLT_PER_KWH = exports.FEED_IN_TARIFF_MICRO_VLT_PER_KWH = exports.EMERGENCY_THRESHOLD_BPS = exports.MAX_EMERGENCY_TARGET_WH = exports.MAX_READING_WH = exports.MAX_HOUSES = exports.MODEL_VERSION = void 0;
exports.previewPriceMicroVltPerKwh = previewPriceMicroVltPerKwh;
exports.simulateEpoch = simulateEpoch;
exports.simulateDay = simulateDay;
exports.createDefaultHouses = createDefaultHouses;
exports.createDefaultSimulationInput = createDefaultSimulationInput;
exports.emergencyDischarges = emergencyDischarges;
exports.MODEL_VERSION = 1;
exports.MAX_HOUSES = 16;
exports.MAX_READING_WH = 100000;
exports.MAX_EMERGENCY_TARGET_WH = 1600000;
exports.EMERGENCY_THRESHOLD_BPS = 9500;
exports.FEED_IN_TARIFF_MICRO_VLT_PER_KWH = 2500000;
exports.RETAIL_TARIFF_MICRO_VLT_PER_KWH = 8000000;
exports.DEFAULT_FLOOR_MICRO_VLT_PER_KWH = 3000000;
exports.DEFAULT_BASE_MICRO_VLT_PER_KWH = 5000000;
exports.DEFAULT_CAP_MICRO_VLT_PER_KWH = 7000000;
exports.DEFAULT_WHEELING_FEE_MICRO_VLT_PER_KWH = 420000;
exports.DEFAULT_EMERGENCY_TARIFF_MICRO_VLT_PER_KWH = 7500000;
exports.DEFAULT_TRANSFORMER_CAPACITY_WH = 10000;
exports.SIMULATION_UNITS = Object.freeze({
    energy: "Wh",
    price: "micro-VLT/kWh",
    stress: "bps",
    temperature: "degC",
    humidity: "bps",
    precipitation: "bps",
});
exports.DEFAULT_PRICING_PARAMS = Object.freeze({
    floorMicroVltPerKwh: exports.DEFAULT_FLOOR_MICRO_VLT_PER_KWH,
    baseMicroVltPerKwh: exports.DEFAULT_BASE_MICRO_VLT_PER_KWH,
    capMicroVltPerKwh: exports.DEFAULT_CAP_MICRO_VLT_PER_KWH,
});
class SimulationInputError extends Error {
    constructor(field, message) {
        super(`${field}: ${message}`);
        this.name = "SimulationInputError";
        this.code = "INVALID_INPUT";
        this.field = field;
    }
}
exports.SimulationInputError = SimulationInputError;
const DAY_HOURS = 24;
const BPS = 10000;
const BATTERY_CHARGE_EFFICIENCY_BPS = 9000;
const EMERGENCY_RESERVE_BPS = 8000;
const SOLAR_BELL_BPS = Object.freeze([
    0, 0, 0, 0, 0, 0, 1800, 4000, 6000, 7800, 9000, 9800,
    10000, 9800, 9000, 7800, 6000, 4000, 1800, 0, 0, 0, 0, 0,
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
];
exports.DEFAULT_HOUSES = Object.freeze([
    Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[0], kind: "solarBattery", hasSolar: true, hasBattery: true, batteryCapacityWh: 6000 }),
    Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[1], kind: "solarBattery", hasSolar: true, hasBattery: true, batteryCapacityWh: 6500 }),
    Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[2], kind: "solarBattery", hasSolar: true, hasBattery: true, batteryCapacityWh: 5500 }),
    Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[3], kind: "solarOnly", hasSolar: true, hasBattery: false, batteryCapacityWh: 0 }),
    Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[4], kind: "ev", hasSolar: false, hasBattery: false, batteryCapacityWh: 0 }),
    Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[5], kind: "ev", hasSolar: false, hasBattery: false, batteryCapacityWh: 0 }),
    Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[6], kind: "regular", hasSolar: false, hasBattery: false, batteryCapacityWh: 0 }),
    Object.freeze({ address: DEFAULT_HOUSE_ADDRESSES[7], kind: "regular", hasSolar: false, hasBattery: false, batteryCapacityWh: 0 }),
]);
const VALID_SCENARIOS = ["sunny", "rainy", "heatwave"];
const VALID_KINDS = ["solarBattery", "solarOnly", "ev", "regular", "viewer"];
function fail(field, message) {
    throw new SimulationInputError(field, message);
}
function assertSafeInteger(field, value, min, max) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
        fail(field, `must be an integer between ${min} and ${max}`);
    }
}
function assertBoolean(field, value) {
    if (typeof value !== "boolean") {
        fail(field, "must be a boolean");
    }
}
function assertAddress(field, address) {
    if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        fail(field, "must be a 20-byte 0x-prefixed hex address");
    }
    if (/^0x0{40}$/i.test(address)) {
        fail(field, "zero address is not permitted");
    }
}
function assertDayId(field, dayId) {
    if (typeof dayId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(dayId)) {
        fail(field, "must be a 32-byte 0x-prefixed hex value");
    }
}
function assertScenario(value) {
    if (typeof value !== "string" || !VALID_SCENARIOS.includes(value)) {
        fail("scenario", `must be one of ${VALID_SCENARIOS.join(", ")}`);
    }
}
function assertKind(value, field) {
    if (typeof value !== "string" || !VALID_KINDS.includes(value)) {
        fail(field, `must be one of ${VALID_KINDS.join(", ")}`);
    }
}
function normalizeAddress(address) {
    return address.toLowerCase();
}
function validateHouses(houses) {
    if (!Array.isArray(houses) || houses.length < 1 || houses.length > exports.MAX_HOUSES) {
        fail("houses", `must contain between 1 and ${exports.MAX_HOUSES} houses`);
    }
    const seen = new Set();
    const validated = [];
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
        assertSafeInteger(`houses[${index}].batteryCapacityWh`, house.batteryCapacityWh, 0, exports.MAX_READING_WH);
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
function validateInput(input) {
    if (input === null || typeof input !== "object") {
        fail("input", "must be an object");
    }
    if (input.modelVersion !== exports.MODEL_VERSION) {
        fail("modelVersion", `must equal ${exports.MODEL_VERSION}`);
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
        const seen = new Set();
        for (let index = 0; index < input.priorEmergencyDischarges.length; index += 1) {
            const discharge = input.priorEmergencyDischarges[index];
            if (discharge === null || typeof discharge !== "object") {
                fail(`priorEmergencyDischarges[${index}]`, "must be an object");
            }
            assertAddress(`priorEmergencyDischarges[${index}].house`, discharge.house);
            assertSafeInteger(`priorEmergencyDischarges[${index}].epochIndex`, discharge.epochIndex, 0, input.epochIndex - 1);
            assertSafeInteger(`priorEmergencyDischarges[${index}].deliveredWh`, discharge.deliveredWh, 1, exports.MAX_READING_WH);
            const house = houseByAddress.get(normalizeAddress(discharge.house));
            if (!house?.hasBattery)
                fail(`priorEmergencyDischarges[${index}].house`, "must be a registered modelled battery");
            if (discharge.deliveredWh > house.batteryCapacityWh) {
                fail(`priorEmergencyDischarges[${index}].deliveredWh`, "must not exceed battery capacity");
            }
            const key = `${discharge.epochIndex}|${normalizeAddress(discharge.house)}`;
            if (seen.has(key))
                fail(`priorEmergencyDischarges[${index}]`, "duplicate house/epoch discharge");
            seen.add(key);
        }
    }
    return houses;
}
function hash32(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
}
function seededBps(seed, key, min, max) {
    const span = max - min + 1;
    return min + (hash32(`${seed}|${key}`) % span);
}
function clampInteger(value, min, max) {
    return Math.min(max, Math.max(min, Math.floor(value)));
}
function scaleBps(value, multiplierBps) {
    return Math.floor((value * multiplierBps) / BPS);
}
function weatherFor(scenario, seed, epochIndex) {
    const weatherNoise = seededBps(seed, `weather:${epochIndex}`, -300, 300);
    const daylight = SOLAR_BELL_BPS[epochIndex];
    let irradianceBps;
    let temperatureC;
    let humidityBps;
    let precipitationBps;
    let condition;
    if (scenario === "sunny") {
        condition = "clear";
        irradianceBps = clampInteger(9700 + weatherNoise, 0, BPS);
        temperatureC = clampInteger(20 + Math.floor((daylight * 12) / BPS) + Math.floor(weatherNoise / 150), 15, 38);
        humidityBps = clampInteger(4200 - Math.floor((daylight * 1500) / BPS) - weatherNoise, 1500, 7000);
        precipitationBps = 0;
    }
    else if (scenario === "rainy") {
        condition = "rain";
        irradianceBps = clampInteger(3300 + weatherNoise, 1500, 5000);
        temperatureC = clampInteger(19 + Math.floor((daylight * 6) / BPS) + Math.floor(weatherNoise / 200), 15, 30);
        humidityBps = clampInteger(8200 + Math.floor(weatherNoise / 2), 7000, 10000);
        precipitationBps = clampInteger(6500 + Math.floor(weatherNoise / 2), 5000, 8000);
    }
    else {
        condition = "heatwave";
        irradianceBps = clampInteger(8900 + weatherNoise, 7000, BPS);
        temperatureC = clampInteger(33 + Math.floor((daylight * 10) / BPS) + Math.floor(weatherNoise / 150), 30, 48);
        humidityBps = clampInteger(2700 - Math.floor((daylight * 700) / BPS) - Math.floor(weatherNoise / 2), 1000, 4500);
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
function dayIdFor(input, houses) {
    if (input.dayId !== undefined) {
        return input.dayId.toLowerCase();
    }
    const houseMap = houses.map((house) => `${normalizeAddress(house.address)}:${house.kind}:${house.hasSolar ? 1 : 0}:${house.hasBattery ? 1 : 0}:${house.batteryCapacityWh}`).join(",");
    const material = `${exports.MODEL_VERSION}|${input.scenario}|${input.seed}|${input.transformerCapacityWh}|${input.viewerEvCharging ? 1 : 0}|${houseMap}`;
    let value = "";
    for (let part = 0; part < 8; part += 1) {
        value += hash32(`${material}|${part}`).toString(16).padStart(8, "0");
    }
    return `0x${value}`;
}
function solarGenerationWh(house, weather, seed, epochIndex) {
    if (!house.hasSolar) {
        return 0;
    }
    const nameFactor = house.kind === "solarOnly" ? 5200 : house.kind === "viewer" ? 4300 : 4600;
    const houseFactorBps = seededBps(seed, `${house.address}:solar:${epochIndex}`, 9400, 10600);
    const scenarioFactorBps = weather.condition === "rain" ? 9000 : weather.condition === "heatwave" ? 9500 : 10000;
    const withShape = scaleBps(nameFactor, SOLAR_BELL_BPS[epochIndex]);
    const withWeather = scaleBps(withShape, weather.irradianceBps);
    return clampInteger(scaleBps(scaleBps(withWeather, houseFactorBps), scenarioFactorBps), 0, exports.MAX_READING_WH);
}
function eveningLoadBps(epochIndex) {
    if (epochIndex >= 17 && epochIndex <= 22) {
        return 10000;
    }
    if (epochIndex >= 7 && epochIndex <= 16) {
        return 5500;
    }
    return 3000;
}
function consumptionWh(house, scenario, seed, epochIndex, viewerEvCharging) {
    const evening = eveningLoadBps(epochIndex);
    let baseline;
    if (house.kind === "ev") {
        baseline = 360 + scaleBps(2650, evening);
    }
    else if (house.kind === "regular") {
        baseline = 430 + scaleBps(620, evening);
    }
    else {
        baseline = 470 + scaleBps(430, evening);
    }
    if (house.kind === "viewer" && viewerEvCharging) {
        baseline += scaleBps(2900, evening);
    }
    if (scenario === "rainy") {
        baseline += 80;
    }
    else if (scenario === "heatwave") {
        // Modelled cooling load is intentionally largest during the hot evening.
        baseline += 350 + (epochIndex >= 11 && epochIndex <= 21 ? 520 : 0);
    }
    const variationBps = seededBps(seed, `${house.address}:load:${epochIndex}`, 9700, 10300);
    return clampInteger(scaleBps(baseline, variationBps), 0, exports.MAX_READING_WH);
}
function initialBatteryState(house, seed) {
    const initialSoCBps = seededBps(seed, `${house.address}:initial-soc`, 4500, 7000);
    return {
        house,
        availableWh: scaleBps(house.batteryCapacityWh, initialSoCBps),
        chargedWh: 0,
        dischargedWh: 0,
    };
}
function batteryStatesFor(houses, seed) {
    return houses.filter((house) => house.hasBattery).map((house) => initialBatteryState(house, seed));
}
function advanceBatteryState(state, reading) {
    const surplusWh = Math.max(reading.generationWh - reading.consumptionWh, 0);
    const deficitWh = Math.max(reading.consumptionWh - reading.generationWh, 0);
    if (surplusWh > 0 && state.availableWh < state.house.batteryCapacityWh) {
        const storableWh = scaleBps(surplusWh, BATTERY_CHARGE_EFFICIENCY_BPS);
        const chargedWh = Math.min(storableWh, state.house.batteryCapacityWh - state.availableWh);
        state.availableWh += chargedWh;
        state.chargedWh += chargedWh;
    }
    else if (deficitWh > 0 && state.availableWh > 0) {
        const dischargedWh = Math.min(deficitWh, state.availableWh);
        state.availableWh -= dischargedWh;
        state.dischargedWh += dischargedWh;
    }
}
function priceMultiplierBps(ratioBps) {
    if (ratioBps <= 5000) {
        return 6000;
    }
    if (ratioBps <= 10000) {
        return 6000 + Math.floor(((ratioBps - 5000) * 4000) / 5000);
    }
    if (ratioBps <= 20000) {
        return 10000 + Math.floor(((ratioBps - 10000) * 4000) / 10000);
    }
    return 14000;
}
function validatePricingParams(params) {
    assertSafeInteger("pricing.floorMicroVltPerKwh", params.floorMicroVltPerKwh, 3000000, 7000000);
    assertSafeInteger("pricing.baseMicroVltPerKwh", params.baseMicroVltPerKwh, 3000000, 7000000);
    assertSafeInteger("pricing.capMicroVltPerKwh", params.capMicroVltPerKwh, 3000000, 7000000);
    if (!(params.floorMicroVltPerKwh <= params.baseMicroVltPerKwh && params.baseMicroVltPerKwh <= params.capMicroVltPerKwh)) {
        fail("pricing", "must satisfy floor <= base <= cap");
    }
}
/** Exact integer preview of the frozen VoltGrid on-chain pricing curve. */
function previewPriceMicroVltPerKwh(totalSurplusWh, totalDeficitWh, params = exports.DEFAULT_PRICING_PARAMS) {
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
exports.calculatePricePreview = previewPriceMicroVltPerKwh;
exports.previewPrice = previewPriceMicroVltPerKwh;
function deriveBatteryStateForEpoch(input, houses, weatherForEpoch) {
    const states = batteryStatesFor(houses, input.seed);
    const dischargesByHour = new Map();
    for (const discharge of input.priorEmergencyDischarges ?? []) {
        const byHouse = dischargesByHour.get(discharge.epochIndex) ?? new Map();
        byHouse.set(normalizeAddress(discharge.house), discharge.deliveredWh);
        dischargesByHour.set(discharge.epochIndex, byHouse);
    }
    for (let hour = 0; hour <= input.epochIndex; hour += 1) {
        const weather = hour === input.epochIndex ? weatherForEpoch : weatherFor(input.scenario, input.seed, hour);
        for (const state of states) {
            const reading = Object.freeze({
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
function makeOutput(input, houses) {
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
    const emergencyProposed = stressBps > exports.EMERGENCY_THRESHOLD_BPS;
    const safeLoadAtThresholdWh = Math.floor((input.transformerCapacityWh * exports.EMERGENCY_THRESHOLD_BPS) / BPS);
    const proposedTargetWh = emergencyProposed
        ? clampInteger(totalConsumptionWh - safeLoadAtThresholdWh, 1, exports.MAX_EMERGENCY_TARGET_WH)
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
    const output = {
        modelVersion: exports.MODEL_VERSION,
        source: "simulation",
        scenario: input.scenario,
        seed: input.seed,
        dayId: dayIdFor(input, houses),
        epochIndex: input.epochIndex,
        units: exports.SIMULATION_UNITS,
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
function simulateEpoch(input) {
    const houses = validateInput(input);
    return makeOutput(input, houses);
}
function simulateDay(input) {
    if (input === null || typeof input !== "object") {
        fail("input", "must be an object");
    }
    const outputs = [];
    for (let epochIndex = 0; epochIndex < DAY_HOURS; epochIndex += 1) {
        outputs.push(simulateEpoch(Object.freeze({ ...input, epochIndex })));
    }
    return Object.freeze(outputs);
}
exports.generateDay = simulateDay;
function createDefaultHouses(options = {}) {
    if (options.viewerAddress === undefined) {
        return exports.DEFAULT_HOUSES;
    }
    assertAddress("viewerAddress", options.viewerAddress);
    const viewerHasSolar = options.viewerHasSolar ?? false;
    const viewerHasBattery = options.viewerHasBattery ?? false;
    const viewerBatteryCapacityWh = options.viewerBatteryCapacityWh ?? 0;
    assertBoolean("viewerHasSolar", viewerHasSolar);
    assertBoolean("viewerHasBattery", viewerHasBattery);
    assertSafeInteger("viewerBatteryCapacityWh", viewerBatteryCapacityWh, 0, exports.MAX_READING_WH);
    const viewer = Object.freeze({
        address: options.viewerAddress,
        kind: "viewer",
        hasSolar: viewerHasSolar,
        hasBattery: viewerHasBattery,
        batteryCapacityWh: viewerBatteryCapacityWh,
    });
    return validateHouses(Object.freeze([...exports.DEFAULT_HOUSES, viewer]));
}
function createDefaultSimulationInput(options) {
    assertScenario(options.scenario);
    if (typeof options.seed !== "string" || options.seed.length === 0) {
        fail("seed", "must be a non-empty string");
    }
    const viewerEvCharging = options.viewerEvCharging ?? false;
    assertBoolean("viewerEvCharging", viewerEvCharging);
    const transformerCapacityWh = options.transformerCapacityWh ?? exports.DEFAULT_TRANSFORMER_CAPACITY_WH;
    assertSafeInteger("transformerCapacityWh", transformerCapacityWh, 1, Number.MAX_SAFE_INTEGER);
    if (options.dayId !== undefined) {
        assertDayId("dayId", options.dayId);
    }
    return Object.freeze({
        modelVersion: exports.MODEL_VERSION,
        scenario: options.scenario,
        seed: options.seed,
        houses: createDefaultHouses(options),
        transformerCapacityWh,
        viewerEvCharging,
        ...(options.dayId === undefined ? {} : { dayId: options.dayId }),
    });
}
/** Convert positive modelled candidates to the frozen Discharge ABI shape. */
function emergencyDischarges(output, targetWh = output.proposedTargetWh) {
    assertSafeInteger("targetWh", targetWh, 0, exports.MAX_EMERGENCY_TARGET_WH);
    let remaining = targetWh;
    const result = [];
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
