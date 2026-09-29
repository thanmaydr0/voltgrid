export const AUTH_CALLBACK_PATH = "/auth/callback";
export const DEFAULT_AUTH_RETURN_PATH = "/";

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/** Accept only a same-origin relative path; reject protocol-relative URLs. */
export function getSafeReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 512 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || CONTROL_CHARACTER.test(value)) {
    return DEFAULT_AUTH_RETURN_PATH;
  }

  try {
    const parsed = new URL(value, "https://voltgrid.invalid");
    if (parsed.origin !== "https://voltgrid.invalid") return DEFAULT_AUTH_RETURN_PATH;
  } catch {
    return DEFAULT_AUTH_RETURN_PATH;
  }

  return value;
}

export function buildAuthCallbackUrl(origin: string, nextPath?: string): string {
  const callback = new URL(AUTH_CALLBACK_PATH, origin);
  callback.searchParams.set("next", getSafeReturnPath(nextPath));
  return callback.toString();
}

export function isAllowedAuthRedirect(redirectTo: string, expectedOrigin: string): boolean {
  try {
    const redirect = new URL(redirectTo);
    const origin = new URL(expectedOrigin);
    return redirect.origin === origin.origin
      && redirect.pathname === AUTH_CALLBACK_PATH
      && getSafeReturnPath(redirect.searchParams.get("next")) === (redirect.searchParams.get("next") || DEFAULT_AUTH_RETURN_PATH);
  } catch {
    return false;
  }
}
