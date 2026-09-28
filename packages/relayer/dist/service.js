"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayerService = void 0;
const ethers_1 = require("ethers");
const simulator_1 = require("./simulator");
const chain_1 = require("./chain");
const errors_1 = require("./errors");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = ["start", "settle", "declareEmergency", "reportDischarge", "resolveEmergency", "closeDay"];
class SubmissionQueue {
    constructor() {
        this.tail = Promise.resolve();
    }
    async run(operation) {
        let release;
        const prior = this.tail;
        this.tail = new Promise((resolve) => { release = resolve; });
        await prior;
        try {
            return await operation();
        }
        finally {
            release();
        }
    }
}
function now() { return Date.now(); }
function validateUuid(field, value) {
    if (typeof value !== "string" || !UUID_PATTERN.test(value))
        throw new errors_1.HttpError(400, "INVALID_INPUT", `${field} must be a UUID`, false);
    return value;
}
function validateScenario(value) {
    if (value !== "sunny" && value !== "rainy" && value !== "heatwave")
        throw new errors_1.HttpError(400, "INVALID_INPUT", "scenario must be sunny, rainy, or heatwave", false);
    return value;
}
function validateSeed(value) {
    if (typeof value !== "string" || value.length === 0 || value.length > 256)
        throw new errors_1.HttpError(400, "INVALID_INPUT", "seed must be a non-empty string of at most 256 characters", false);
    return value;
}
function validateBoolean(field, value) {
    if (typeof value !== "boolean")
        throw new errors_1.HttpError(400, "INVALID_INPUT", `${field} must be boolean`, false);
    return value;
}
function validateDayId(value) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(value))
        throw new errors_1.HttpError(400, "INVALID_INPUT", "invalid dayId", false);
    return value;
}
function validateEpoch(value) {
    if (!/^\d+$/.test(value))
        throw new errors_1.HttpError(400, "INVALID_INPUT", "epochIndex must be an integer", false);
    const epoch = Number(value);
    if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch > 23)
        throw new errors_1.HttpError(400, "INVALID_INPUT", "epochIndex must be between 0 and 23", false);
    return epoch;
}
function actionKey(dayId, epochIndex, action) {
    return `${dayId.toLowerCase()}|${epochIndex}|${action}`;
}
function actionEventName(action) {
    switch (action) {
        case "start": return "DayStarted";
        case "settle": return "EpochSettled";
        case "declareEmergency": return "EmergencyDeclared";
        case "reportDischarge": return "EmergencyReportRecorded";
        case "resolveEmergency": return "EmergencyResolved";
        case "closeDay": return "DayClosed";
    }
}
function actionForEvent(eventName) {
    switch (eventName) {
        case "DayStarted": return "start";
        case "EpochSettled": return "settle";
        case "EmergencyDeclared": return "declareEmergency";
        case "EmergencyReportRecorded": return "reportDischarge";
        case "EmergencyResolved": return "resolveEmergency";
        case "DayClosed": return "closeDay";
        default: throw new Error(`unsupported receipt event ${eventName}`);
    }
}
function statusFromActions(actions) {
    if (actions.length === 0)
        return "unknown";
    if (actions.some((action) => action.status === "reverted"))
        return "reverted";
    if (actions.some((action) => action.status === "unknown"))
        return "unknown";
    if (actions.some((action) => action.status === "pending"))
        return "pending";
    return "confirmed";
}
function chainAction(stored) {
    return Object.freeze({
        action: stored.action,
        status: stored.status,
        contractAddress: stored.contractAddress,
        ...(stored.txHash ? { txHash: stored.txHash } : {}),
        ...(stored.blockNumber ? { blockNumber: stored.blockNumber } : {}),
        ...(stored.errorCode ? { errorCode: stored.errorCode } : {}),
        ...(stored.fallbackReason ? { fallbackReason: stored.fallbackReason } : {}),
        ...(stored.nonce === undefined ? {} : { nonce: stored.nonce }),
        ...(stored.metrics ? { metrics: stored.metrics } : {}),
    });
}
function kindForHouse(index, house) {
    if (house.hasBattery && house.hasSolar)
        return "solarBattery";
    if (house.hasSolar)
        return "solarOnly";
    if (house.hasBattery)
        return "viewer";
    if (index >= 8)
        return "viewer";
    return index % 2 === 0 ? "regular" : "ev";
}
function modelHouses(onChainHouses) {
    if (onChainHouses.length === 0 || onChainHouses.length > 16)
        throw new errors_1.HttpError(409, "BUSY", "the market has no usable registered houses", true);
    const houses = onChainHouses.map((house, index) => Object.freeze({
        address: house.address,
        kind: kindForHouse(index, house),
        hasSolar: house.hasSolar,
        hasBattery: house.hasBattery,
        batteryCapacityWh: house.batteryCapacityWh,
    }));
    return Object.freeze(houses);
}
function generateDayId(chainId, marketAddress) {
    return (0, ethers_1.keccak256)((0, ethers_1.concat)([(0, ethers_1.toBeHex)(chainId, 32), (0, ethers_1.getBytes)(marketAddress), (0, ethers_1.randomBytes)(16)]));
}
function inputDigest(day) {
    return (0, ethers_1.keccak256)(Buffer.from(JSON.stringify({
        modelVersion: day.modelVersion,
        scenario: day.scenario,
        seed: day.seed,
        viewerEvCharging: day.viewerEvCharging,
        transformerCapacityWh: day.transformerCapacityWh,
        houses: day.houses,
        batteryOptInSnapshot: day.onChainHouses.map((house) => ({
            address: house.address,
            hasBattery: house.hasBattery,
            batteryCapacityWh: house.batteryCapacityWh,
            batteryOptedIn: house.batteryOptedIn,
            registrationIndex: house.registrationIndex,
        })),
    }), "utf8"));
}
function errorCodeFor(error) {
    if (error instanceof errors_1.HttpError)
        return error.code;
    if (error && typeof error === "object" && "code" in error) {
        const code = String(error.code);
        if (code === "CALL_EXCEPTION" || code === "UNPREDICTABLE_GAS_LIMIT" || code === "INSUFFICIENT_FUNDS")
            return "REVERTED";
        if (code === "TIMEOUT" || code === "NETWORK_ERROR" || code === "SERVER_ERROR" || code === "UNKNOWN_ERROR")
            return "RPC_TIMEOUT";
        if (code === "NONCE_EXPIRED" || code === "REPLACEMENT_UNDERPRICED")
            return "RPC_UNAVAILABLE";
    }
    return "INTERNAL";
}
function isRetryableTransport(error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return code === "TIMEOUT" || code === "NETWORK_ERROR" || code === "SERVER_ERROR" || code === "UNKNOWN_ERROR" || code === "NONCE_EXPIRED" || code === "REPLACEMENT_UNDERPRICED";
}
class RelayerService {
    constructor(config, chain, store, auth, clock = now) {
        this.config = config;
        this.chain = chain;
        this.store = store;
        this.auth = auth;
        this.clock = clock;
        this.submissions = new SubmissionQueue();
        this.inFlight = new Map();
    }
    async init() {
        await this.store.init();
        await this.assertChain();
        // Recover a crash between startDay's receipt and the day-status write.
        // A persisted transaction hash/event is authoritative; no new send is
        // attempted when the outcome is still unknown.
        for (const day of Object.values(this.store.snapshot().days)) {
            if (day.status !== "starting")
                continue;
            const start = this.store.snapshot().actions[actionKey(day.dayId, -1, "start")];
            if (!start)
                continue;
            const reconciled = await this.actionResult(start, "DayStarted", -1);
            if (reconciled !== start)
                await this.store.saveAction(reconciled);
            if (reconciled.status === "confirmed")
                await this.store.saveDay(Object.freeze({ ...day, status: "active" }));
            else if (reconciled.status === "reverted")
                await this.store.saveDay(Object.freeze({ ...day, status: "failed" }));
        }
    }
    async assertChain() {
        let actual;
        try {
            actual = await this.chain.getChainId();
        }
        catch {
            throw new errors_1.HttpError(503, "RPC_UNAVAILABLE", "chain identity is unavailable", true);
        }
        if (actual !== this.config.chainId)
            throw new errors_1.HttpError(409, "WRONG_CHAIN", "configured chain ID does not match the RPC", false);
    }
    async getDay(dayId, context) {
        const id = validateDayId(dayId);
        const day = this.store.snapshot().days[id];
        if (!day)
            throw new errors_1.HttpError(404, "NOT_FOUND", "day not found", false, id);
        if (context && day.ownerAddress.toLowerCase() !== context.address.toLowerCase()) {
            throw new errors_1.HttpError(404, "NOT_FOUND", "day not found", false, id);
        }
        return day;
    }
    actionsFor(dayId, epochIndex, kind) {
        const names = kind === "normal" ? ["settle"] : ["declareEmergency", "reportDischarge", "resolveEmergency"];
        return names.map((action) => this.store.snapshot().actions[actionKey(dayId, epochIndex, action)]).filter((action) => Boolean(action));
    }
    outcome(day, epochIndex, kind) {
        const actions = this.actionsFor(day.dayId, epochIndex, kind);
        const final = actions.find((action) => action.action === (kind === "normal" ? "settle" : "resolveEmergency"));
        const declaration = actions.find((action) => action.action === "declareEmergency");
        const report = actions.find((action) => action.action === "reportDischarge");
        const mergedMetrics = Object.assign({}, declaration?.metrics, report?.metrics, final?.metrics);
        const emergencyAccountingMismatch = kind === "emergency"
            && final?.status === "confirmed"
            && report?.status === "confirmed"
            && declaration?.status === "confirmed"
            && (declaration.metrics?.targetWh !== final.metrics?.targetWh
                || report.metrics?.deliveredWh !== final.metrics?.shavedWh
                || report.metrics?.payoutWei !== final.metrics?.payoutWei);
        return Object.freeze({
            dayId: day.dayId,
            epochIndex,
            kind,
            status: emergencyAccountingMismatch ? "unknown" : final?.status ?? statusFromActions(actions),
            actions: Object.freeze(actions.map(chainAction)),
            ...(!emergencyAccountingMismatch && Object.keys(mergedMetrics).length > 0 ? { metrics: Object.freeze(mergedMetrics) } : {}),
            ...(report?.fallbackReason ? { fallbackReason: report.fallbackReason } : {}),
        });
    }
    async actionResult(action, expectedEvent, epochIndex) {
        if (action.status === "confirmed" || action.status === "reverted")
            return action;
        if (action.txHash) {
            try {
                const receipt = await this.chain.getReceipt(action.txHash);
                if (receipt)
                    return this.finishReceipt(action, receipt, expectedEvent, epochIndex);
            }
            catch {
                return action;
            }
        }
        if (expectedEvent) {
            try {
                const reconciled = await this.chain.reconcileAction(actionForEvent(expectedEvent), action.dayId, epochIndex);
                if (reconciled)
                    return this.finishReconciled(action, reconciled, expectedEvent, epochIndex);
            }
            catch {
                return action;
            }
        }
        return action;
    }
    finishReconciled(action, reconciled, expectedEvent, epochIndex) {
        return this.finishReceipt(action, reconciled.receipt, expectedEvent, epochIndex, reconciled.events);
    }
    finishReceipt(action, receipt, expectedEvent, epochIndex, alreadyDecoded) {
        const fullReceipt = receipt;
        if (receipt.status !== 1)
            return Object.freeze({ ...action, status: "reverted", errorCode: "REVERTED", updatedAt: this.clock() });
        const events = alreadyDecoded || this.chain.decodeReceipt(fullReceipt);
        const matchingExpectedEvents = expectedEvent ? events.filter((event) => event.name === expectedEvent
            && String(event.args.dayId).toLowerCase() === action.dayId.toLowerCase()
            && (expectedEvent === "DayStarted" || expectedEvent === "DayClosed" || Number(event.args.epochIndex) === epochIndex)) : [];
        if (expectedEvent && (matchingExpectedEvents.length === 0 || (expectedEvent === "DayClosed" && matchingExpectedEvents.length !== 1))) {
            return Object.freeze({ ...action, status: "unknown", errorCode: "MISSING_EXPECTED_LOG", updatedAt: this.clock() });
        }
        const metricEvent = expectedEvent === "EpochSettled" || expectedEvent === "EmergencyDeclared"
            || expectedEvent === "EmergencyReportRecorded" || expectedEvent === "EmergencyResolved"
            || expectedEvent === "DayClosed"
            ? expectedEvent
            : undefined;
        let metrics;
        if (metricEvent) {
            try {
                metrics = (0, chain_1.eventMetrics)(events, metricEvent);
            }
            catch {
                return Object.freeze({ ...action, status: "unknown", errorCode: "EVENT_ACCOUNTING_MISMATCH", updatedAt: this.clock() });
            }
        }
        return Object.freeze({
            ...action,
            status: "confirmed",
            txHash: receipt.hash || action.txHash,
            blockNumber: String(receipt.blockNumber),
            ...(metrics && Object.keys(metrics).length > 0 ? { metrics: Object.freeze(metrics) } : {}),
            updatedAt: this.clock(),
        });
    }
    async waitForAction(action, expectedEvent, epochIndex) {
        const deadline = this.clock() + this.config.receiptTimeoutMs;
        let lastError;
        while (this.clock() < deadline) {
            try {
                const receipt = action.txHash ? await this.chain.getReceipt(action.txHash) : null;
                if (receipt)
                    return this.finishReceipt(action, receipt, expectedEvent, epochIndex);
            }
            catch (error) {
                lastError = error;
            }
            await new Promise((resolve) => setTimeout(resolve, this.config.receiptPollMs));
        }
        return Object.freeze({ ...action, status: "unknown", errorCode: lastError && !isRetryableTransport(lastError) ? errorCodeFor(lastError) : "RPC_TIMEOUT", updatedAt: this.clock() });
    }
    async runAction(day, epochIndex, actionName, send, expectedEvent, clientRequestId, fallbackReason) {
        const key = actionKey(day.dayId, epochIndex, actionName);
        const prior = this.store.snapshot().actions[key];
        if (prior) {
            const reconciled = await this.actionResult(prior, expectedEvent, epochIndex);
            if (reconciled !== prior)
                await this.store.saveAction(reconciled);
            if (reconciled.status === "confirmed" || reconciled.status === "reverted" || reconciled.status === "unknown")
                return reconciled;
            return reconciled;
        }
        let action = Object.freeze({
            key,
            dayId: day.dayId,
            epochIndex,
            action: actionName,
            status: "pending",
            contractAddress: this.chain.marketAddress,
            ...(clientRequestId ? { clientRequestId } : {}),
            ...(fallbackReason ? { fallbackReason } : {}),
            updatedAt: this.clock(),
        });
        await this.store.saveAction(action);
        try {
            const submitted = await send();
            action = Object.freeze({ ...action, txHash: submitted.hash, ...(submitted.nonce === undefined ? {} : { nonce: submitted.nonce }), updatedAt: this.clock() });
            await this.store.saveAction(action);
        }
        catch (error) {
            action = Object.freeze({ ...action, status: isRetryableTransport(error) ? "unknown" : "reverted", errorCode: errorCodeFor(error), updatedAt: this.clock() });
            await this.store.saveAction(action);
            return action;
        }
        const completed = await this.waitForAction(action, expectedEvent, epochIndex);
        await this.store.saveAction(completed);
        return completed;
    }
    async simulatedEpoch(day, epochIndex) {
        const priorEmergencyDischarges = [];
        const dischargedByHouse = new Map();
        for (const action of Object.values(this.store.snapshot().actions)) {
            if (action.dayId.toLowerCase() !== day.dayId.toLowerCase()
                || action.action !== "reportDischarge"
                || action.status !== "confirmed"
                || action.epochIndex < 0
                || action.epochIndex >= epochIndex)
                continue;
            for (const discharge of action.metrics?.discharges ?? []) {
                priorEmergencyDischarges.push(Object.freeze({ ...discharge, epochIndex: action.epochIndex }));
                const key = discharge.house.toLowerCase();
                dischargedByHouse.set(key, (dischargedByHouse.get(key) ?? 0) + discharge.deliveredWh);
            }
        }
        const output = simulator_1.simCore.simulateEpoch({
            modelVersion: simulator_1.simCore.MODEL_VERSION,
            scenario: day.scenario,
            seed: day.seed,
            dayId: day.dayId,
            epochIndex,
            houses: day.houses,
            transformerCapacityWh: day.transformerCapacityWh,
            viewerEvCharging: day.viewerEvCharging,
            priorEmergencyDischarges: Object.freeze(priorEmergencyDischarges),
        });
        const onChainByAddress = new Map(day.onChainHouses.map((house) => [house.address.toLowerCase(), house]));
        const discharges = [];
        let remaining = output.proposedTargetWh;
        for (const candidate of output.eligibleEmergencyDischargeWh) {
            if (remaining === 0)
                break;
            const onChain = onChainByAddress.get(candidate.house.toLowerCase());
            if (!onChain?.hasBattery || !onChain.batteryOptedIn)
                continue;
            const remainingDailyCapacity = Math.max(0, onChain.batteryCapacityWh - (dischargedByHouse.get(onChain.address.toLowerCase()) ?? 0));
            const deliveredWh = Math.min(candidate.deliveredWh, remainingDailyCapacity, remaining);
            if (deliveredWh > 0) {
                discharges.push(Object.freeze({ house: onChain.address, deliveredWh }));
                remaining -= deliveredWh;
            }
        }
        let fallbackReason;
        if (output.emergencyProposed) {
            const hasOptedInBattery = day.onChainHouses.some((house) => house.hasBattery && house.batteryOptedIn);
            if (!hasOptedInBattery) {
                fallbackReason = "no-opted-in-battery";
            }
            else if (discharges.length === 0) {
                fallbackReason = "no-modelled-energy";
            }
            else {
                const payoutWei = discharges.reduce((sum, item) => sum + BigInt(item.deliveredWh) * BigInt(this.config.emergencyTariffMicro) * 1000000000n, 0n);
                if (await this.chain.getTreasuryBalance() < payoutWei) {
                    discharges.splice(0, discharges.length);
                    fallbackReason = "treasury-underfunded";
                }
            }
        }
        return Object.freeze({
            output,
            readings: output.readings,
            discharges: Object.freeze(discharges),
            ...(fallbackReason ? { fallbackReason } : {}),
        });
    }
    async createDay(raw, context) {
        const clientRunId = validateUuid("clientRunId", raw.clientRunId);
        const scenario = validateScenario(raw.scenario);
        const seed = validateSeed(raw.seed);
        const viewerEvCharging = validateBoolean("viewerEvCharging", raw.viewerEvCharging);
        return this.store.lock(async () => {
            await this.assertChain();
            const existing = Object.values(this.store.snapshot().days).find((day) => day.ownerAddress.toLowerCase() === context.address.toLowerCase() && day.clientRunId === clientRunId);
            if (existing) {
                if (existing.scenario !== scenario || existing.seed !== seed || existing.viewerEvCharging !== viewerEvCharging) {
                    throw new errors_1.HttpError(409, "DUPLICATE_CONFLICT", "clientRunId already has different inputs", false, existing.dayId);
                }
                const action = this.store.snapshot().actions[actionKey(existing.dayId, -1, "start")];
                if (!action)
                    throw new errors_1.HttpError(500, "INTERNAL", "stored day is missing its start action", false, existing.dayId);
                const reconciled = await this.runAction(existing, -1, "start", () => this.submissions.run(() => this.chain.sendStartDay(existing.dayId, existing.inputDigest, simulator_1.simCore.MODEL_VERSION)), "DayStarted", clientRunId);
                const updated = reconciled.status === "confirmed" && existing.status !== "active"
                    ? Object.freeze({ ...existing, status: "active" })
                    : existing;
                if (updated !== existing)
                    await this.store.saveDay(updated);
                return Object.freeze({ day: updated, action: chainAction(reconciled) });
            }
            const chainDay = await this.chain.getCurrentDay();
            if (chainDay.active)
                throw new errors_1.HttpError(409, "BUSY", "another shared day is active", true, chainDay.id);
            const onChainHouses = await this.chain.getRegisteredHouses();
            const houses = modelHouses(onChainHouses);
            let dayId = generateDayId(this.config.chainId, this.chain.marketAddress);
            for (let attempt = 0; attempt < 3 && await this.chain.isDayIdUsed(dayId); attempt += 1)
                dayId = generateDayId(this.config.chainId, this.chain.marketAddress);
            if (await this.chain.isDayIdUsed(dayId))
                throw new errors_1.HttpError(503, "RPC_UNAVAILABLE", "could not allocate a fresh day ID", true);
            const draft = {
                dayId,
                ownerAddress: (0, ethers_1.getAddress)(context.address),
                clientRunId,
                scenario,
                seed,
                viewerEvCharging,
                modelVersion: simulator_1.simCore.MODEL_VERSION,
                inputDigest: "0x",
                houses,
                onChainHouses,
                transformerCapacityWh: this.config.transformerCapacityWh,
            };
            const digest = inputDigest(draft);
            const day = Object.freeze({ ...draft, inputDigest: digest, status: "starting", nextEpoch: 0, createdAt: this.clock() });
            await this.store.saveDay(day);
            const action = await this.runAction(day, -1, "start", () => this.submissions.run(() => this.chain.sendStartDay(day.dayId, day.inputDigest, simulator_1.simCore.MODEL_VERSION)), "DayStarted", clientRunId);
            const updatedDay = action.status === "confirmed" ? Object.freeze({ ...day, status: "active" }) : day;
            if (updatedDay !== day)
                await this.store.saveDay(updatedDay);
            return Object.freeze({ day: updatedDay, action: chainAction(action) });
        });
    }
    async advance(dayIdValue, epochIndex, clientRequestIdValue, context) {
        const dayId = validateDayId(dayIdValue);
        const clientRequestId = validateUuid("clientRequestId", clientRequestIdValue);
        const flightKey = `${dayId}|${epochIndex}`;
        const existingFlight = this.inFlight.get(flightKey);
        if (existingFlight)
            return existingFlight;
        const operation = this.store.lock(async () => {
            await this.assertChain();
            const day = await this.getDay(dayId, context);
            const existingRequest = this.store.snapshot().requests[clientRequestId];
            if (existingRequest && (existingRequest.dayId.toLowerCase() !== dayId.toLowerCase() || existingRequest.epochIndex !== epochIndex)) {
                throw new errors_1.HttpError(409, "DUPLICATE_CONFLICT", "clientRequestId is already bound to another epoch", false, dayId, epochIndex);
            }
            if (!existingRequest)
                await this.store.saveRequest(Object.freeze({ clientRequestId, dayId, epochIndex, createdAt: this.clock() }));
            const simulated = await this.simulatedEpoch(day, epochIndex);
            const kind = simulated.output.emergencyProposed ? "emergency" : "normal";
            const existingOutcome = this.outcome(day, epochIndex, kind);
            if (existingOutcome.actions.length > 0 && (existingOutcome.status === "confirmed" || existingOutcome.status === "reverted")) {
                if (existingOutcome.status === "confirmed" && day.nextEpoch === epochIndex) {
                    await this.store.saveDay(Object.freeze({ ...day, nextEpoch: epochIndex + 1 }));
                }
                return existingOutcome;
            }
            if (day.status !== "active")
                throw new errors_1.HttpError(409, "BUSY", "day has not started or is already closed", true, dayId, epochIndex);
            if (day.nextEpoch !== epochIndex) {
                throw new errors_1.HttpError(409, "OUT_OF_ORDER", `next epoch is ${day.nextEpoch}`, false, dayId, epochIndex);
            }
            if (kind === "normal") {
                const settle = await this.runAction(day, epochIndex, "settle", () => this.submissions.run(() => this.chain.sendSettleEpoch(dayId, epochIndex, simulated.readings)), "EpochSettled", clientRequestId);
                if (settle.status === "confirmed")
                    await this.store.saveDay(Object.freeze({ ...day, nextEpoch: epochIndex + 1 }));
                return this.outcome(this.store.snapshot().days[dayId], epochIndex, kind);
            }
            if (simulated.output.proposedTargetWh <= 0 || simulated.output.proposedTargetWh > simulator_1.simCore.MAX_EMERGENCY_TARGET_WH) {
                throw new errors_1.HttpError(500, "INTERNAL", "simulator produced an invalid emergency target", false, dayId, epochIndex);
            }
            const declaration = await this.runAction(day, epochIndex, "declareEmergency", () => this.submissions.run(() => this.chain.sendDeclareEmergency(dayId, epochIndex, simulated.output.proposedTargetWh, this.config.emergencyTariffMicro)), "EmergencyDeclared", clientRequestId);
            if (declaration.status !== "confirmed")
                return this.outcome(day, epochIndex, kind);
            const report = await this.runAction(day, epochIndex, "reportDischarge", () => this.submissions.run(() => this.chain.sendReportDischarge(dayId, epochIndex, simulated.discharges)), "EmergencyReportRecorded", clientRequestId, simulated.fallbackReason);
            if (report.status !== "confirmed")
                return this.outcome(day, epochIndex, kind);
            const resolved = await this.runAction(day, epochIndex, "resolveEmergency", () => this.submissions.run(() => this.chain.sendResolveEmergency(dayId, epochIndex)), "EmergencyResolved", clientRequestId);
            if (resolved.status === "confirmed")
                await this.store.saveDay(Object.freeze({ ...day, nextEpoch: epochIndex + 1 }));
            return this.outcome(this.store.snapshot().days[dayId], epochIndex, kind);
        });
        this.inFlight.set(flightKey, operation);
        try {
            return await operation;
        }
        finally {
            this.inFlight.delete(flightKey);
        }
    }
    async getDayState(dayIdValue, context) {
        await this.assertChain();
        const day = await this.getDay(dayIdValue, context);
        const outcomes = [];
        for (let epoch = 0; epoch < day.nextEpoch; epoch += 1) {
            const kind = this.store.snapshot().actions[actionKey(day.dayId, epoch, "declareEmergency")] ? "emergency" : "normal";
            outcomes.push(this.outcome(day, epoch, kind));
        }
        let closeAction = this.store.snapshot().actions[actionKey(day.dayId, 24, "closeDay")];
        if (closeAction) {
            const reconciled = await this.actionResult(closeAction, "DayClosed", 24);
            if (reconciled !== closeAction) {
                await this.store.saveAction(reconciled);
                closeAction = reconciled;
            }
            if (closeAction.status === "confirmed" && day.status !== "closed") {
                const closedDay = Object.freeze({ ...day, status: "closed" });
                await this.store.saveDay(closedDay);
                return Object.freeze({ day: closedDay, outcomes: Object.freeze(outcomes), closeAction: chainAction(closeAction) });
            }
        }
        return Object.freeze({ day, outcomes: Object.freeze(outcomes), closeAction: closeAction ? chainAction(closeAction) : null });
    }
    async getCurrentDay(context) {
        await this.assertChain();
        const days = Object.values(this.store.snapshot().days).filter((day) => day.ownerAddress.toLowerCase() === context.address.toLowerCase()).sort((left, right) => right.createdAt - left.createdAt);
        if (days.length === 0)
            return Object.freeze({ day: null, outcomes: Object.freeze([]), closeAction: null });
        return this.getDayState(days[0].dayId, context);
    }
    async getEpoch(dayIdValue, epochIndex, context) {
        const day = await this.getDay(dayIdValue, context);
        const normal = this.outcome(day, epochIndex, "normal");
        const emergency = this.outcome(day, epochIndex, "emergency");
        return emergency.actions.length > 0 ? emergency : normal;
    }
    async closeDay(dayIdValue, clientRequestIdValue, context) {
        const dayId = validateDayId(dayIdValue);
        const clientRequestId = validateUuid("clientRequestId", clientRequestIdValue);
        return this.store.lock(async () => {
            await this.assertChain();
            const day = await this.getDay(dayId, context);
            const existingRequest = this.store.snapshot().requests[clientRequestId];
            if (existingRequest && (existingRequest.dayId.toLowerCase() !== dayId.toLowerCase() || existingRequest.epochIndex !== 24))
                throw new errors_1.HttpError(409, "DUPLICATE_CONFLICT", "clientRequestId is already bound to another operation", false, dayId);
            if (!existingRequest)
                await this.store.saveRequest(Object.freeze({ clientRequestId, dayId, epochIndex: 24, createdAt: this.clock() }));
            if (day.nextEpoch !== 24)
                throw new errors_1.HttpError(409, "OUT_OF_ORDER", "day is not complete", false, dayId);
            const action = await this.runAction(day, 24, "closeDay", () => this.submissions.run(() => this.chain.sendCloseDay(dayId)), "DayClosed", clientRequestId);
            if (action.status === "confirmed")
                await this.store.saveDay(Object.freeze({ ...day, status: "closed" }));
            const receiptAction = chainAction(action);
            return Object.freeze({ dayId, status: action.status, actions: Object.freeze([receiptAction]), closeAction: receiptAction });
        });
    }
    async resetDemo(scope, adminSecret) {
        this.auth.verifyAdmin(adminSecret);
        if (scope === "sessions") {
            this.auth.reset();
            await this.store.clearEphemeral();
            return Object.freeze({ reset: "sessions" });
        }
        await this.assertChain();
        const current = await this.chain.getCurrentDay();
        if (current.active)
            throw new errors_1.HttpError(409, "BUSY", "cannot reset durable state while an on-chain day is active", true, current.id);
        await this.store.resetDurable();
        this.auth.reset();
        return Object.freeze({ reset: "state" });
    }
}
exports.RelayerService = RelayerService;
