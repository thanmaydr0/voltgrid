"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthersChainClient = void 0;
exports.eventMetrics = eventMetrics;
exports.eventNames = eventNames;
exports.digestInput = digestInput;
const ethers_1 = require("ethers");
const abi_1 = require("./abi");
const errors_1 = require("./errors");
function numberValue(value) {
    const number = typeof value === "bigint" ? Number(value) : Number(value);
    if (!Number.isSafeInteger(number))
        throw new Error("chain numeric value exceeds safe integer range");
    return number;
}
function stringValue(value) {
    return typeof value === "bigint" ? value.toString() : String(value);
}
function parseEvent(iface, log) {
    let parsed;
    try {
        parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    }
    catch {
        return null;
    }
    if (!parsed)
        return null;
    const args = {};
    const names = parsed.fragment.inputs.map((input, index) => input.name || String(index));
    for (let index = 0; index < names.length; index += 1) {
        const value = parsed.args[index];
        if (typeof value === "boolean")
            args[names[index]] = value;
        else if (typeof value === "string")
            args[names[index]] = value;
        else
            args[names[index]] = stringValue(value);
    }
    return Object.freeze({
        name: parsed.name,
        args: Object.freeze(args),
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex: log.index,
        address: (0, ethers_1.getAddress)(log.address),
    });
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
function metricsEventArgs(event, events = [event]) {
    const args = event.args;
    if (event.name === "DayClosed") {
        const dayId = String(args.dayId).toLowerCase();
        const snapshots = events.filter((item) => item.name === "CarbonFactorApplied"
            && String(item.args.dayId).toLowerCase() === dayId);
        if (snapshots.length !== 1)
            throw new Error("day close must include exactly one carbon factor snapshot");
        const factorGPerKwh = Number(snapshots[0].args.factorGPerKwh);
        const factorVersion = Number(snapshots[0].args.factorVersion);
        if (!Number.isSafeInteger(factorGPerKwh) || factorGPerKwh < 1 || factorGPerKwh > 2000
            || !Number.isSafeInteger(factorVersion) || factorVersion < 1) {
            throw new Error("day close carbon factor snapshot is invalid");
        }
        const minted = events.filter((item) => item.name === "CertificateMinted"
            && String(item.args.dayId).toLowerCase() === dayId);
        const sellers = new Set();
        const tokenIds = new Set();
        const certificates = minted.map((item) => {
            const solarSeller = String(item.args.solarSeller);
            const sellerKey = solarSeller.toLowerCase();
            const tokenId = String(item.args.tokenId);
            const eligibleWh = Number(item.args.eligibleWh);
            const eventFactor = Number(item.args.factorGPerKwh);
            const avoidedMgCo2e = String(item.args.avoidedMgCo2e);
            if (sellers.has(sellerKey) || tokenIds.has(tokenId) || !Number.isSafeInteger(eligibleWh) || eligibleWh <= 0
                || eventFactor !== factorGPerKwh || BigInt(avoidedMgCo2e) !== BigInt(eligibleWh) * BigInt(factorGPerKwh)) {
                throw new Error("certificate mint events are duplicated or fail formula/factor reconciliation");
            }
            sellers.add(sellerKey);
            tokenIds.add(tokenId);
            return Object.freeze({
                dayId: dayId,
                tokenId,
                solarSeller,
                eligibleWh,
                factorGPerKwh,
                factorVersion,
                avoidedMgCo2e,
                txHash: item.transactionHash,
                blockNumber: item.blockNumber,
                logIndex: item.logIndex,
                contractAddress: item.address,
            });
        });
        const totalEligibleWh = certificates.reduce((sum, record) => sum + record.eligibleWh, 0);
        const totalAvoidedMgCo2e = certificates.reduce((sum, record) => sum + BigInt(record.avoidedMgCo2e), 0n).toString();
        return Object.freeze({
            factorGPerKwh,
            factorVersion,
            totalEligibleWh,
            totalAvoidedMgCo2e,
            certificates: Object.freeze(certificates),
        });
    }
    if (event.name === "EpochSettled") {
        return {
            priceMicroVltPerKwh: String(args.priceMicro),
            matchedWh: Number(args.matchedWh),
            exportedWh: Number(args.exportedWh),
            importedWh: Number(args.importedWh),
            feesWei: String(args.feesWei),
        };
    }
    if (event.name === "EmergencyResolved") {
        return {
            targetWh: Number(args.targetWh),
            shavedWh: Number(args.shavedWh),
            payoutWei: String(args.payoutWei),
        };
    }
    if (event.name === "EmergencyDeclared") {
        return { targetWh: Number(args.targetWh), tariffMicroVltPerKwh: Number(args.tariffMicro) };
    }
    if (event.name === "EmergencyReportRecorded") {
        const dayId = String(args.dayId).toLowerCase();
        const epochIndex = Number(args.epochIndex);
        const discharges = events.filter((item) => item.name === "BatteryDischarged"
            && String(item.args.dayId).toLowerCase() === dayId
            && Number(item.args.epochIndex) === epochIndex).map((item) => Object.freeze({
            house: String(item.args.house),
            deliveredWh: Number(item.args.deliveredWh),
            payoutWei: String(item.args.payoutWei),
        }));
        const deliveredWh = discharges.reduce((sum, item) => sum + item.deliveredWh, 0);
        const payoutWei = discharges.reduce((sum, item) => sum + BigInt(item.payoutWei), 0n).toString();
        if (discharges.length !== Number(args.dischargeCount)
            || deliveredWh !== Number(args.deliveredWh)
            || payoutWei !== String(args.payoutWei)) {
            throw new Error("emergency report does not reconcile with BatteryDischarged logs");
        }
        return {
            deliveredWh,
            payoutWei,
            dischargeCount: discharges.length,
            discharges: Object.freeze(discharges),
        };
    }
    return {};
}
class EthersChainClient {
    constructor(config) {
        this.config = config;
        this.marketAddress = (0, ethers_1.getAddress)(config.marketAddress);
        this.provider = new ethers_1.JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true });
        this.wallet = new ethers_1.NonceManager(new ethers_1.Wallet(config.oraclePrivateKey, this.provider));
        this.iface = new ethers_1.Interface(abi_1.MARKET_ABI);
        this.market = new ethers_1.Contract(this.marketAddress, abi_1.MARKET_ABI, this.wallet);
    }
    async getChainId() {
        const network = await this.provider.getNetwork();
        return numberValue(network.chainId);
    }
    async getRegisteredHouses() {
        const addresses = await this.market.getHouses();
        const houses = [];
        for (const rawAddress of addresses) {
            const address = (0, ethers_1.getAddress)(rawAddress);
            const row = await this.market.houses(address);
            houses.push(Object.freeze({
                address,
                hasSolar: Boolean(row[1]),
                hasBattery: Boolean(row[2]),
                batteryCapacityWh: numberValue(row[3]),
                batteryOptedIn: Boolean(row[4]),
                registrationIndex: numberValue(row[5]),
            }));
        }
        return Object.freeze(houses);
    }
    async getTreasuryBalance() {
        const treasury = await this.market.treasury();
        return BigInt(await this.market.internalBalance(treasury));
    }
    async getCurrentDay() {
        const row = await this.market.currentDay();
        return Object.freeze({
            active: Boolean(row[0]),
            id: String(row[1]),
            inputDigest: String(row[2]),
            modelVersion: numberValue(row[3]),
            nextEpoch: numberValue(row[4]),
            emergencyActive: Boolean(row[9]),
            emergencyReported: Boolean(row[10]),
            emergencyTargetWh: numberValue(row[11]),
            emergencyTariffMicro: numberValue(row[12]),
        });
    }
    async isDayIdUsed(dayId) {
        return Boolean(await this.market.usedDayIds(dayId));
    }
    async latestBlockNumber() {
        // Bypass ethers' short block-number cache so a just-confirmed receipt is
        // visible to the bounded event reader immediately.
        const raw = await this.provider.send("eth_blockNumber", []);
        return Number(BigInt(raw));
    }
    async send(operation) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const transaction = await operation();
                return Object.freeze({ hash: transaction.hash, nonce: transaction.nonce });
            }
            catch (error) {
                const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
                if (attempt === 0 && (code === "NONCE_EXPIRED" || code === "REPLACEMENT_UNDERPRICED")) {
                    // Restart/external-admin recovery: refresh the serialized signer nonce once.
                    this.wallet.reset();
                    continue;
                }
                throw error;
            }
        }
        throw new Error("nonce retry exhausted");
    }
    sendStartDay(dayId, inputDigest, modelVersion) {
        return this.send(() => this.market.startDay(dayId, inputDigest, modelVersion));
    }
    sendSettleEpoch(dayId, epochIndex, readings) {
        return this.send(() => this.market.settleEpoch(dayId, epochIndex, readings));
    }
    sendDeclareEmergency(dayId, epochIndex, targetWh, tariffMicro) {
        return this.send(() => this.market.declareEmergency(dayId, epochIndex, targetWh, tariffMicro));
    }
    sendReportDischarge(dayId, epochIndex, discharges) {
        return this.send(() => this.market.reportDischarge(dayId, epochIndex, discharges));
    }
    sendResolveEmergency(dayId, epochIndex) {
        return this.send(() => this.market.resolveEmergency(dayId, epochIndex));
    }
    sendCloseDay(dayId) {
        return this.send(() => this.market.closeDay(dayId));
    }
    async getReceipt(txHash) {
        const receipt = await this.provider.getTransactionReceipt(txHash);
        if (!receipt)
            return null;
        return Object.freeze({
            hash: receipt.hash,
            status: receipt.status ?? 0,
            blockNumber: receipt.blockNumber,
            logs: Object.freeze(receipt.logs.map((log, index) => Object.freeze({
                address: (0, ethers_1.getAddress)(log.address),
                topics: Object.freeze([...log.topics]),
                data: log.data,
                index: log.index ?? index,
            }))),
        });
    }
    decodeReceipt(receipt) {
        const events = [];
        for (const log of receipt.logs) {
            if (log.address.toLowerCase() !== this.marketAddress.toLowerCase())
                continue;
            const event = parseEvent(this.iface, {
                ...log,
                transactionHash: receipt.hash,
                blockNumber: receipt.blockNumber,
            });
            if (event)
                events.push(event);
        }
        return Object.freeze(events);
    }
    async reconcileAction(action, dayId, epochIndex) {
        const latest = await this.latestBlockNumber();
        const eventName = actionEventName(action);
        const event = this.iface.getEvent(eventName);
        if (!event)
            throw new Error(`Missing ABI event ${eventName}`);
        const topics = [event.topicHash, dayId];
        if (action !== "start" && action !== "closeDay")
            topics.push(`0x${epochIndex.toString(16).padStart(64, "0")}`);
        const logs = await this.provider.getLogs({
            address: this.marketAddress,
            fromBlock: Math.max(0, latest - this.config.eventLookbackBlocks),
            toBlock: latest,
            topics,
        });
        for (const log of logs) {
            const receipt = await this.getReceipt(log.transactionHash);
            if (!receipt || receipt.status !== 1)
                continue;
            const events = this.decodeReceipt(receipt);
            if (events.some((decoded) => decoded.name === eventName && String(decoded.args.dayId).toLowerCase() === dayId.toLowerCase())) {
                return Object.freeze({ receipt, events });
            }
        }
        return null;
    }
    async listEvents(cursor, limit) {
        const latest = await this.latestBlockNumber();
        let snapshotBlock = latest;
        let offset = 0;
        if (cursor) {
            try {
                const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
                snapshotBlock = parsed.snapshotBlock;
                offset = parsed.offset;
            }
            catch {
                throw new errors_1.HttpError(400, "INVALID_INPUT", "invalid events cursor", false);
            }
        }
        if (!Number.isSafeInteger(offset) || offset < 0)
            throw new errors_1.HttpError(400, "INVALID_INPUT", "invalid events cursor", false);
        const logs = await this.provider.getLogs({
            address: this.marketAddress,
            fromBlock: Math.max(0, snapshotBlock - this.config.eventLookbackBlocks),
            toBlock: snapshotBlock,
        });
        const events = logs.map((log, index) => parseEvent(this.iface, {
            address: log.address,
            topics: log.topics,
            data: log.data,
            index: log.index ?? index,
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
        })).filter((event) => event !== null).sort((left, right) => left.blockNumber - right.blockNumber || left.logIndex - right.logIndex);
        const page = events.slice(offset, offset + limit);
        const nextOffset = offset + page.length;
        const nextCursor = nextOffset < events.length
            ? Buffer.from(JSON.stringify({ snapshotBlock, offset: nextOffset }), "utf8").toString("base64url")
            : undefined;
        return Object.freeze({ events: Object.freeze(page), ...(nextCursor ? { nextCursor } : {}) });
    }
}
exports.EthersChainClient = EthersChainClient;
function eventMetrics(events, name) {
    const event = events.find((item) => item.name === name);
    return event ? metricsEventArgs(event, events) : undefined;
}
function eventNames(events) {
    return Object.freeze(events.map((event) => event.name));
}
function digestInput(value) {
    return (0, ethers_1.keccak256)((0, ethers_1.toUtf8Bytes)(JSON.stringify(value)));
}
