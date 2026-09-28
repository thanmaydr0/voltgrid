"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayerHttpRouter = void 0;
exports.createNodeServer = createNodeServer;
exports.createExpressApp = createExpressApp;
const node_http_1 = __importDefault(require("node:http"));
const errors_1 = require("./errors");
class QuotaLimiter {
    constructor(clock = () => Date.now()) {
        this.clock = clock;
        this.counters = new Map();
    }
    consume(key, maximum, windowMs) {
        const current = this.clock();
        const prior = this.counters.get(key);
        if (!prior || current - prior.windowStartedAt >= windowMs) {
            this.counters.set(key, { windowStartedAt: current, count: 1 });
            return;
        }
        if (prior.count >= maximum)
            throw new errors_1.HttpError(429, "RATE_LIMITED", "demo quota exhausted", true);
        prior.count += 1;
    }
    reset() { this.counters.clear(); }
}
function lowerHeaders(headers) {
    const output = {};
    for (const [key, value] of Object.entries(headers))
        output[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    return output;
}
function originFor(request, config) {
    const origin = request.headers.origin;
    if (!origin) {
        if (config.requireOrigin)
            throw new errors_1.HttpError(403, "UNAUTHORIZED", "Origin is required for state-changing requests", false);
        return config.allowedOrigins[0] || "http://localhost:3000";
    }
    if (!config.allowedOrigins.includes(origin))
        throw new errors_1.HttpError(403, "UNAUTHORIZED", "origin is not allowlisted", false);
    return origin;
}
function bearer(request) {
    const value = request.headers.authorization;
    if (!value)
        return undefined;
    const match = /^Bearer\s+([^\s]+)$/i.exec(value);
    return match?.[1];
}
function requireObject(body) {
    if (body === null || typeof body !== "object" || Array.isArray(body))
        throw new errors_1.HttpError(400, "INVALID_INPUT", "JSON object body required", false);
    return body;
}
function rejectReadings(body) {
    if (Object.prototype.hasOwnProperty.call(body, "readings") || Object.prototype.hasOwnProperty.call(body, "generationWh") || Object.prototype.hasOwnProperty.call(body, "consumptionWh")) {
        throw new errors_1.HttpError(400, "INVALID_INPUT", "client readings are not accepted; the server regenerates them from the stored run", false);
    }
}
function jsonBody(body) {
    return JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value);
}
function response(status, body, extraHeaders = {}) {
    return Object.freeze({
        status,
        headers: Object.freeze({ "content-type": "application/json; charset=utf-8", ...extraHeaders }),
        body,
    });
}
function actionStatusCode(status) {
    if (status === "confirmed")
        return 200;
    if (status === "reverted")
        return 409;
    return 202;
}
class RelayerHttpRouter {
    constructor(service, config, clock) {
        this.service = service;
        this.config = config;
        this.limiter = new QuotaLimiter(clock);
    }
    auth(request, stateChanging) {
        const origin = stateChanging ? originFor(request, this.config) : (request.headers.origin || this.config.allowedOrigins[0] || "http://localhost:3000");
        const context = this.service.auth.requireSession(bearer(request), origin, request.ip);
        return context;
    }
    async dispatch(request) {
        try {
            if (request.method === "OPTIONS") {
                const origin = request.headers.origin;
                if (origin && !this.config.allowedOrigins.includes(origin))
                    throw new errors_1.HttpError(403, "UNAUTHORIZED", "origin is not allowlisted", false);
                return response(204, null, {
                    ...(origin ? { "access-control-allow-origin": origin } : {}),
                    "access-control-allow-credentials": "true",
                    "access-control-allow-headers": "authorization,content-type,x-admin-secret",
                    "access-control-allow-methods": "GET,POST,OPTIONS",
                    vary: "Origin",
                });
            }
            if (request.method === "GET" && request.pathname === "/healthz") {
                await this.service.assertChain();
                return response(200, { ok: true, chainId: this.config.chainId, marketAddress: this.config.marketAddress, modelVersion: 1 });
            }
            if (request.method === "POST" && request.pathname === "/v1/auth/challenge") {
                const origin = originFor(request, this.config);
                this.limiter.consume(`auth:${request.ip}`, this.config.maxAuthPerIp, 60000);
                const body = requireObject(request.body);
                return response(200, { ...this.service.auth.createChallenge(body.address, origin, request.ip), chainId: this.config.chainId, modelVersion: 1 });
            }
            if (request.method === "POST" && request.pathname === "/v1/auth/verify") {
                const origin = originFor(request, this.config);
                this.limiter.consume(`auth:${request.ip}`, this.config.maxAuthPerIp, 60000);
                const body = requireObject(request.body);
                return response(200, { ...this.service.auth.verify(body.address, body.message, body.signature, origin, request.ip), chainId: this.config.chainId, modelVersion: 1 });
            }
            if (request.method === "POST" && request.pathname === "/v1/admin/reset") {
                const origin = originFor(request, this.config);
                void origin;
                const body = requireObject(request.body);
                const scope = body.scope === "state" ? "state" : body.scope === "sessions" || body.scope === undefined ? "sessions" : undefined;
                if (!scope)
                    throw new errors_1.HttpError(400, "INVALID_INPUT", "scope must be sessions or state", false);
                const result = await this.service.resetDemo(scope, request.headers["x-admin-secret"]);
                this.limiter.reset();
                return response(200, result);
            }
            if (request.method === "POST" && request.pathname === "/v1/days") {
                this.limiter.consume(`ip:${request.ip}`, this.config.maxActionsPerIp, 24 * 60 * 60000);
                const context = this.auth(request, true);
                this.limiter.consume(`session:${context.token}`, this.config.maxActionsPerSession, 24 * 60 * 60000);
                const body = requireObject(request.body);
                rejectReadings(body);
                if (Object.keys(body).some((key) => !["clientRunId", "scenario", "seed", "viewerEvCharging"].includes(key))) {
                    throw new errors_1.HttpError(400, "INVALID_INPUT", "day creation accepts only deterministic run inputs", false);
                }
                const result = await this.service.createDay({
                    clientRunId: body.clientRunId,
                    scenario: body.scenario,
                    seed: body.seed,
                    viewerEvCharging: body.viewerEvCharging,
                }, context);
                const status = result.action.status === "confirmed" ? "confirmed" : result.action.status;
                return response(result.action.status === "confirmed" ? 201 : actionStatusCode(result.action.status), {
                    dayId: result.day.dayId,
                    status,
                    actions: [result.action],
                    chainId: this.config.chainId,
                    marketAddress: this.config.marketAddress,
                    modelVersion: 1,
                });
            }
            const dayMatch = /^\/v1\/days\/(0x[0-9a-fA-F]{64})$/.exec(request.pathname);
            if (request.method === "GET" && dayMatch) {
                const context = this.auth(request, false);
                const result = await this.service.getDayState(dayMatch[1], context);
                return response(200, { ...result, chainId: this.config.chainId, marketAddress: this.config.marketAddress, modelVersion: 1 });
            }
            if (request.method === "GET" && request.pathname === "/v1/days/current") {
                const context = this.auth(request, false);
                const result = await this.service.getCurrentDay(context);
                return response(200, { ...result, chainId: this.config.chainId, marketAddress: this.config.marketAddress, modelVersion: 1 });
            }
            const advanceMatch = /^\/v1\/days\/(0x[0-9a-fA-F]{64})\/epochs\/(\d+)\/advance$/.exec(request.pathname);
            if (request.method === "POST" && advanceMatch) {
                this.limiter.consume(`ip:${request.ip}`, this.config.maxActionsPerIp, 24 * 60 * 60000);
                const context = this.auth(request, true);
                this.limiter.consume(`session:${context.token}`, this.config.maxActionsPerSession, 24 * 60 * 60000);
                const body = requireObject(request.body);
                rejectReadings(body);
                if (Object.keys(body).some((key) => key !== "clientRequestId"))
                    throw new errors_1.HttpError(400, "INVALID_INPUT", "advance accepts only clientRequestId", false);
                const outcome = await this.service.advance(advanceMatch[1], Number(advanceMatch[2]), body.clientRequestId, context);
                return response(actionStatusCode(outcome.status), { ...outcome, chainId: this.config.chainId, marketAddress: this.config.marketAddress, modelVersion: 1 });
            }
            const epochMatch = /^\/v1\/days\/(0x[0-9a-fA-F]{64})\/epochs\/(\d+)$/.exec(request.pathname);
            if (request.method === "GET" && epochMatch) {
                const context = this.auth(request, false);
                const outcome = await this.service.getEpoch(epochMatch[1], Number(epochMatch[2]), context);
                return response(200, { ...outcome, chainId: this.config.chainId, marketAddress: this.config.marketAddress, modelVersion: 1 });
            }
            const closeMatch = /^\/v1\/days\/(0x[0-9a-fA-F]{64})\/close$/.exec(request.pathname);
            if (request.method === "POST" && closeMatch) {
                this.limiter.consume(`ip:${request.ip}`, this.config.maxActionsPerIp, 24 * 60 * 60000);
                const context = this.auth(request, true);
                this.limiter.consume(`session:${context.token}`, this.config.maxActionsPerSession, 24 * 60 * 60000);
                const body = requireObject(request.body);
                if (Object.keys(body).some((key) => key !== "clientRequestId"))
                    throw new errors_1.HttpError(400, "INVALID_INPUT", "close accepts only clientRequestId", false);
                const result = await this.service.closeDay(closeMatch[1], body.clientRequestId, context);
                return response(actionStatusCode(result.status), { ...result, chainId: this.config.chainId, marketAddress: this.config.marketAddress, modelVersion: 1 });
            }
            if (request.method === "GET" && request.pathname === "/v1/events") {
                this.auth(request, false);
                const rawLimit = request.query.get("limit");
                const limit = rawLimit === null ? 50 : Number(rawLimit);
                if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
                    throw new errors_1.HttpError(400, "INVALID_INPUT", "limit must be between 1 and 100", false);
                const page = await this.service.chain.listEvents(request.query.get("cursor") || undefined, limit);
                return response(200, { ...page, chainId: this.config.chainId, marketAddress: this.config.marketAddress, modelVersion: 1 });
            }
            return response(404, { code: "NOT_FOUND", message: "route not found", retryable: false });
        }
        catch (error) {
            const httpError = (0, errors_1.asHttpError)(error);
            return response(httpError.status, httpError.toBody());
        }
    }
    async dispatchNode(req, body) {
        const parsed = new URL(req.url || "/", "http://relayer.invalid");
        const ip = this.config.trustProxy ? (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket.remoteAddress || "unknown") : (req.socket.remoteAddress || "unknown");
        return this.dispatch(Object.freeze({ method: req.method || "GET", pathname: parsed.pathname, query: parsed.searchParams, headers: lowerHeaders(req.headers), body, ip }));
    }
}
exports.RelayerHttpRouter = RelayerHttpRouter;
async function readNodeBody(req, maxBytes) {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > maxBytes)
        throw new errors_1.HttpError(413, "INVALID_INPUT", "request body too large", false);
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS")
        return undefined;
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBytes)
            throw new errors_1.HttpError(413, "INVALID_INPUT", "request body too large", false);
        chunks.push(buffer);
    }
    if (size === 0)
        return undefined;
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    catch {
        throw new errors_1.HttpError(400, "INVALID_INPUT", "body must be valid JSON", false);
    }
}
function createNodeServer(router) {
    return node_http_1.default.createServer(async (req, res) => {
        let result;
        try {
            const body = await readNodeBody(req, router.service.config.maxBodyBytes);
            result = await router.dispatchNode(req, body);
        }
        catch (error) {
            const httpError = (0, errors_1.asHttpError)(error);
            result = response(httpError.status, httpError.toBody());
        }
        const origin = req.headers.origin;
        if (origin && router.service.config.allowedOrigins.includes(origin)) {
            res.setHeader("access-control-allow-origin", origin);
            res.setHeader("access-control-allow-credentials", "true");
            res.setHeader("vary", "Origin");
        }
        for (const [key, value] of Object.entries(result.headers))
            res.setHeader(key, value);
        res.statusCode = result.status;
        if (result.status === 204) {
            res.end();
            return;
        }
        res.end(jsonBody(result.body));
    });
}
/** Express 4/5 adapter. Express is lazy-loaded so local tests need no install. */
function createExpressApp(router) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const express = require("express");
    const app = express();
    app.use(express.json({ limit: `${router.service.config.maxBodyBytes}b` }));
    app.use(async (req, res, next) => {
        try {
            const parsed = new URL(req.originalUrl, "http://relayer.invalid");
            const responseValue = await router.dispatch(Object.freeze({
                method: req.method,
                pathname: parsed.pathname,
                query: parsed.searchParams,
                headers: lowerHeaders(req.headers),
                body: req.body,
                ip: req.socket.remoteAddress || "unknown",
            }));
            const headers = { ...responseValue.headers };
            if (req.headers.origin && router.service.config.allowedOrigins.includes(req.headers.origin)) {
                headers["access-control-allow-origin"] = req.headers.origin;
                headers["access-control-allow-credentials"] = "true";
                headers.vary = "Origin";
            }
            if (responseValue.status === 204) {
                res.status(responseValue.status).set(headers).end();
                return;
            }
            res.status(responseValue.status).set(headers).json(responseValue.body);
        }
        catch (error) {
            next(error);
        }
    });
    return app;
}
