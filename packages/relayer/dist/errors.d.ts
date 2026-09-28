import type { ApiErrorCode, ApiErrorBody } from "./types";
export declare class HttpError extends Error {
    readonly status: number;
    readonly code: ApiErrorCode;
    readonly retryable: boolean;
    readonly dayId?: string | undefined;
    readonly epochIndex?: number | undefined;
    constructor(status: number, code: ApiErrorCode, message: string, retryable: boolean, dayId?: string | undefined, epochIndex?: number | undefined);
    toBody(): ApiErrorBody;
}
export declare function asHttpError(error: unknown): HttpError;
