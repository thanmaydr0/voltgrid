"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
exports.asHttpError = asHttpError;
class HttpError extends Error {
    constructor(status, code, message, retryable, dayId, epochIndex) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryable = retryable;
        this.dayId = dayId;
        this.epochIndex = epochIndex;
        this.name = "HttpError";
    }
    toBody() {
        return Object.freeze({
            code: this.code,
            message: this.message,
            retryable: this.retryable,
            ...(this.dayId === undefined ? {} : { dayId: this.dayId }),
            ...(this.epochIndex === undefined ? {} : { epochIndex: this.epochIndex }),
        });
    }
}
exports.HttpError = HttpError;
function asHttpError(error) {
    if (error instanceof HttpError)
        return error;
    // Provider errors can contain RPC URLs, transaction payloads, or other
    // implementation details. Keep those in server diagnostics only; the
    // HTTP boundary returns a stable generic message.
    void error;
    return new HttpError(500, "INTERNAL", "internal relayer error", false);
}
