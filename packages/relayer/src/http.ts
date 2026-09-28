import http from "node:http";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { asHttpError, HttpError } from "./errors";
import type { AuthContext, RelayerConfig } from "./types";
import { RelayerService } from "./service";

export type HttpRequest = Readonly<{
  method: string;
  pathname: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  body: unknown;
  ip: string;
}>;

export type HttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
}>;

type Counter = { windowStartedAt: number; count: number };

class QuotaLimiter {
  private readonly counters = new Map<string, Counter>();
  constructor(private readonly clock: () => number = () => Date.now()) {}

  consume(key: string, maximum: number, windowMs: number): void {
    const current = this.clock();
    const prior = this.counters.get(key);
    if (!prior || current - prior.windowStartedAt >= windowMs) {
      this.counters.set(key, { windowStartedAt: current, count: 1 });
      return;
    }
    if (prior.count >= maximum) throw new HttpError(429, "RATE_LIMITED", "demo quota exhausted", true);
    prior.count += 1;
  }

  reset(): void { this.counters.clear(); }
}

function lowerHeaders(headers: IncomingHttpHeaders | Record<string, string | undefined>): Record<string, string | undefined> {
  const output: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) output[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  return output;
}

function originFor(request: HttpRequest, config: RelayerConfig): string {
  const origin = request.headers.origin;
  if (!origin) {
    if (config.requireOrigin) throw new HttpError(403, "UNAUTHORIZED", "Origin is required for state-changing requests", false);
    return config.allowedOrigins[0] || "http://localhost:3000";
  }
  if (!config.allowedOrigins.includes(origin)) throw new HttpError(403, "UNAUTHORIZED", "origin is not allowlisted", false);
  return origin;
}

function bearer(request: HttpRequest): string | undefined {
  const value = request.headers.authorization;
  if (!value) return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(value);
  return match?.[1];
}

function requireObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "INVALID_INPUT", "JSON object body required", false);
  return body as Record<string, unknown>;
}

function rejectReadings(body: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(body, "readings") || Object.prototype.hasOwnProperty.call(body, "generationWh") || Object.prototype.hasOwnProperty.call(body, "consumptionWh")) {
    throw new HttpError(400, "INVALID_INPUT", "client readings are not accepted; the server regenerates them from the stored run", false);
  }
}

function jsonBody(body: unknown): string {
  return JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value);
}

function response(status: number, body: unknown, extraHeaders: Record<string, string> = {}): HttpResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8", ...extraHeaders }),
    body,
  });
}

function actionStatusCode(status: string): number {
  if (status === "confirmed") return 200;
  if (status === "reverted") return 409;
  return 202;
}

export class RelayerHttpRouter {
  private readonly limiter: QuotaLimiter;

  constructor(readonly service: RelayerService, private readonly config: RelayerConfig, clock?: () => number) {
    this.limiter = new QuotaLimiter(clock);
  }

  private auth(request: HttpRequest, stateChanging: boolean): AuthContext {
    const origin = stateChanging ? originFor(request, this.config) : (request.headers.origin || this.config.allowedOrigins[0] || "http://localhost:3000");
    const context = this.service.auth.requireSession(bearer(request), origin, request.ip);
    return context;
  }

  async dispatch(request: HttpRequest): Promise<HttpResponse> {
    try {
      if (request.method === "OPTIONS") {
        const origin = request.headers.origin;
        if (origin && !this.config.allowedOrigins.includes(origin)) throw new HttpError(403, "UNAUTHORIZED", "origin is not allowlisted", false);
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
        this.limiter.consume(`auth:${request.ip}`, this.config.maxAuthPerIp, 60_000);
        const body = requireObject(request.body);
        return response(200, { ...this.service.auth.createChallenge(body.address, origin, request.ip), chainId: this.config.chainId, modelVersion: 1 });
      }

      if (request.method === "POST" && request.pathname === "/v1/auth/verify") {
        const origin = originFor(request, this.config);
        this.limiter.consume(`auth:${request.ip}`, this.config.maxAuthPerIp, 60_000);
        const body = requireObject(request.body);
        return response(200, { ...this.service.auth.verify(body.address, body.message, body.signature, origin, request.ip), chainId: this.config.chainId, modelVersion: 1 });
      }

      if (request.method === "POST" && request.pathname === "/v1/admin/reset") {
        const origin = originFor(request, this.config);
        void origin;
        const body = requireObject(request.body);
        const scope = body.scope === "state" ? "state" : body.scope === "sessions" || body.scope === undefined ? "sessions" : undefined;
        if (!scope) throw new HttpError(400, "INVALID_INPUT", "scope must be sessions or state", false);
        const result = await this.service.resetDemo(scope, request.headers["x-admin-secret"]);
        this.limiter.reset();
        return response(200, result);
      }

      if (request.method === "POST" && request.pathname === "/v1/days") {
        this.limiter.consume(`ip:${request.ip}`, this.config.maxActionsPerIp, 24 * 60 * 60_000);
        const context = this.auth(request, true);
        this.limiter.consume(`session:${context.token}`, this.config.maxActionsPerSession, 24 * 60 * 60_000);
        const body = requireObject(request.body);
        rejectReadings(body);
        if (Object.keys(body).some((key) => !["clientRunId", "scenario", "seed", "viewerEvCharging"].includes(key))) {
          throw new HttpError(400, "INVALID_INPUT", "day creation accepts only deterministic run inputs", false);
        }
        const result = await this.service.createDay({
          clientRunId: body.clientRunId as string,
          scenario: body.scenario as never,
          seed: body.seed as string,
          viewerEvCharging: body.viewerEvCharging as boolean,
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
        this.limiter.consume(`ip:${request.ip}`, this.config.maxActionsPerIp, 24 * 60 * 60_000);
        const context = this.auth(request, true);
        this.limiter.consume(`session:${context.token}`, this.config.maxActionsPerSession, 24 * 60 * 60_000);
        const body = requireObject(request.body);
        rejectReadings(body);
        if (Object.keys(body).some((key) => key !== "clientRequestId")) throw new HttpError(400, "INVALID_INPUT", "advance accepts only clientRequestId", false);
        const outcome = await this.service.advance(advanceMatch[1], Number(advanceMatch[2]), body.clientRequestId as string, context);
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
        this.limiter.consume(`ip:${request.ip}`, this.config.maxActionsPerIp, 24 * 60 * 60_000);
        const context = this.auth(request, true);
        this.limiter.consume(`session:${context.token}`, this.config.maxActionsPerSession, 24 * 60 * 60_000);
        const body = requireObject(request.body);
        if (Object.keys(body).some((key) => key !== "clientRequestId")) throw new HttpError(400, "INVALID_INPUT", "close accepts only clientRequestId", false);
        const result = await this.service.closeDay(closeMatch[1], body.clientRequestId as string, context);
        return response(actionStatusCode(result.status), { ...result, chainId: this.config.chainId, marketAddress: this.config.marketAddress, modelVersion: 1 });
      }

      if (request.method === "GET" && request.pathname === "/v1/events") {
        this.auth(request, false);
        const rawLimit = request.query.get("limit");
        const limit = rawLimit === null ? 50 : Number(rawLimit);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, "INVALID_INPUT", "limit must be between 1 and 100", false);
        const page = await this.service.chain.listEvents(request.query.get("cursor") || undefined, limit);
        return response(200, { ...page, chainId: this.config.chainId, marketAddress: this.config.marketAddress, modelVersion: 1 });
      }

      return response(404, { code: "NOT_FOUND", message: "route not found", retryable: false });
    } catch (error) {
      const httpError = asHttpError(error);
      return response(httpError.status, httpError.toBody());
    }
  }

  async dispatchNode(req: IncomingMessage, body: unknown): Promise<HttpResponse> {
    const parsed = new URL(req.url || "/", "http://relayer.invalid");
    const ip = this.config.trustProxy ? (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket.remoteAddress || "unknown") : (req.socket.remoteAddress || "unknown");
    return this.dispatch(Object.freeze({ method: req.method || "GET", pathname: parsed.pathname, query: parsed.searchParams, headers: lowerHeaders(req.headers), body, ip }));
  }
}

async function readNodeBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > maxBytes) throw new HttpError(413, "INVALID_INPUT", "request body too large", false);
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new HttpError(413, "INVALID_INPUT", "request body too large", false);
    chunks.push(buffer);
  }
  if (size === 0) return undefined;
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400, "INVALID_INPUT", "body must be valid JSON", false); }
}

export function createNodeServer(router: RelayerHttpRouter): http.Server {
  return http.createServer(async (req, res) => {
    let result: HttpResponse;
    try {
      const body = await readNodeBody(req, router.service.config.maxBodyBytes);
      result = await router.dispatchNode(req, body);
    } catch (error) {
      const httpError = asHttpError(error);
      result = response(httpError.status, httpError.toBody());
    }
    const origin = req.headers.origin;
    if (origin && router.service.config.allowedOrigins.includes(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("vary", "Origin");
    }
    for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
    res.statusCode = result.status;
    if (result.status === 204) { res.end(); return; }
    res.end(jsonBody(result.body));
  });
}

/** Express 4/5 adapter. Express is lazy-loaded so local tests need no install. */
export function createExpressApp(router: RelayerHttpRouter): unknown {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require("express") as { (): { use: Function; }; json: (options: { limit: string }) => Function };
  const app = express();
  app.use(express.json({ limit: `${router.service.config.maxBodyBytes}b` }));
  app.use(async (req: { method: string; originalUrl: string; headers: IncomingHttpHeaders; body: unknown; socket: { remoteAddress?: string | null }; }, res: { status: (code: number) => { set: (headers: Record<string, string>) => { json: (body: unknown) => void; end: () => void; }; }; }, next: Function) => {
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
      if (responseValue.status === 204) { res.status(responseValue.status).set(headers).end(); return; }
      res.status(responseValue.status).set(headers).json(responseValue.body);
    } catch (error) { next(error); }
  });
  return app;
}
