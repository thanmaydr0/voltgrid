import type { ApiErrorCode, ApiErrorBody } from "./types";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly dayId?: string,
    readonly epochIndex?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }

  toBody(): ApiErrorBody {
    return Object.freeze({
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.dayId === undefined ? {} : { dayId: this.dayId }),
      ...(this.epochIndex === undefined ? {} : { epochIndex: this.epochIndex }),
    });
  }
}

export function asHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  // Provider errors can contain RPC URLs, transaction payloads, or other
  // implementation details. Keep those in server diagnostics only; the
  // HTTP boundary returns a stable generic message.
  void error;
  return new HttpError(500, "INTERNAL", "internal relayer error", false);
}
