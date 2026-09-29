/** The public frontend proxy must never expose operator-only relayer paths. */
export function isAdminRelayerPath(path: readonly string[]): boolean {
  const normalizedPath = new URL(path.join("/"), "http://localhost/").pathname;
  return /^\/v1\/admin(?:\/|$)/.test(normalizedPath);
}
