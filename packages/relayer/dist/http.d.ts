import http from "node:http";
import type { IncomingMessage } from "node:http";
import type { RelayerConfig } from "./types";
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
export declare class RelayerHttpRouter {
    readonly service: RelayerService;
    private readonly config;
    private readonly limiter;
    constructor(service: RelayerService, config: RelayerConfig, clock?: () => number);
    private auth;
    dispatch(request: HttpRequest): Promise<HttpResponse>;
    dispatchNode(req: IncomingMessage, body: unknown): Promise<HttpResponse>;
}
export declare function createNodeServer(router: RelayerHttpRouter): http.Server;
/** Express 4/5 adapter. Express is lazy-loaded so local tests need no install. */
export declare function createExpressApp(router: RelayerHttpRouter): unknown;
