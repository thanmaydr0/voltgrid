"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryRunStore = exports.JsonRunStore = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const EMPTY_STATE = Object.freeze({ schemaVersion: 1, days: {}, actions: {}, requests: {} });
class AsyncMutex {
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
class BaseStore {
    constructor() {
        this.state = EMPTY_STATE;
        this.mutex = new AsyncMutex();
    }
    async init() { return; }
    async lock(operation) { return this.mutex.run(operation); }
    snapshot() { return this.state; }
    async saveDay(day) {
        this.state = Object.freeze({ ...this.state, days: Object.freeze({ ...this.state.days, [day.dayId]: day }) });
        await this.persist();
    }
    async saveAction(action) {
        this.state = Object.freeze({ ...this.state, actions: Object.freeze({ ...this.state.actions, [action.key]: action }) });
        await this.persist();
    }
    async saveRequest(request) {
        this.state = Object.freeze({ ...this.state, requests: Object.freeze({ ...this.state.requests, [request.clientRequestId]: request }) });
        await this.persist();
    }
    async deleteDay(dayId) {
        const days = { ...this.state.days };
        delete days[dayId];
        const actions = { ...this.state.actions };
        for (const [key, action] of Object.entries(actions))
            if (action.dayId === dayId)
                delete actions[key];
        this.state = Object.freeze({ ...this.state, days: Object.freeze(days), actions: Object.freeze(actions) });
        await this.persist();
    }
    async clearEphemeral() { return; }
    async resetDurable() {
        const active = Object.values(this.state.days).some((day) => day.status === "active" || day.status === "starting");
        if (active)
            throw new Error("cannot reset while a day is active");
        this.state = EMPTY_STATE;
        await this.persist();
    }
}
class JsonRunStore extends BaseStore {
    constructor(filePath) {
        super();
        this.filePath = filePath;
    }
    async init() {
        try {
            const raw = await promises_1.default.readFile(this.filePath, "utf8");
            const parsed = JSON.parse(raw);
            if (parsed.schemaVersion !== 1 || !parsed.days || !parsed.actions || !parsed.requests)
                throw new Error("invalid store schema");
            this.state = Object.freeze(parsed);
        }
        catch (error) {
            const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
            if (code !== "ENOENT")
                throw error;
            this.state = EMPTY_STATE;
            await this.persist();
        }
    }
    async persist() {
        await promises_1.default.mkdir(node_path_1.default.dirname(this.filePath), { recursive: true });
        const temporary = `${this.filePath}.${process.pid}.${(0, node_crypto_1.randomBytes)(8).toString("hex")}.tmp`;
        await promises_1.default.writeFile(temporary, JSON.stringify(this.state, null, 2) + "\n", { mode: 0o600 });
        await promises_1.default.rename(temporary, this.filePath);
    }
}
exports.JsonRunStore = JsonRunStore;
class MemoryRunStore extends BaseStore {
    async persist() { return; }
}
exports.MemoryRunStore = MemoryRunStore;
