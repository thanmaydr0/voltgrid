import type { ServiceFailure } from "@/lib/services/contracts";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

/** Map provider failures to safe, non-secret messages suitable for the UI. */
export function toSupabaseFailure(error: unknown, operation: string): ServiceFailure {
  const text = errorText(error);
  if (/network|fetch|timeout|offline|failed to fetch|enotfound/.test(text)) {
    return {
      status: "error",
      code: "network-error",
      message: `Account ${operation} could not reach Supabase. Check your connection and retry.`,
    };
  }
  if (/jwt|refresh token|session|not authenticated|auth session missing/.test(text)) {
    return {
      status: "error",
      code: "session-expired",
      message: "Your account session expired. Request a new email link to continue.",
    };
  }
  return {
    status: "error",
    code: "supabase-error",
    message: `Account ${operation} failed. Please retry.`,
  };
}

export const notConfiguredFailure: ServiceFailure = {
  status: "unavailable",
  code: "not-configured",
  message: "Account services are not configured. Public previews and chain reads remain available.",
};

export const notSignedInFailure: ServiceFailure = {
  status: "error",
  code: "not-signed-in",
  message: "Sign in with an email link before accessing saved account data.",
};
