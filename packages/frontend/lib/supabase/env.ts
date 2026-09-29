export type SupabasePublicEnv = Readonly<{
  url: string;
  publishableKey: string;
}>;

// These are the VoltGrid project's public client settings, not server secrets.
// They are a production fallback for hosts that omit NEXT_PUBLIC_* at build
// time. A publishable key is designed for browser exposure; never put a
// service_role/secret key here.
const VOLTGRID_PRODUCTION_PUBLIC_ENV: SupabasePublicEnv = {
  url: "https://gdlszyatixsnqenakuhg.supabase.co",
  publishableKey: "sb_publishable_UQ55CFzmLsl2BZS39wVSPg_nGfput5J",
};

/**
 * Reads only the two public Supabase settings that are safe for browser code.
 * Missing/invalid settings intentionally select the offline adapter instead of
 * creating a client with an undefined URL or key.
 */
export function getSupabasePublicEnv(isProduction = process.env.NODE_ENV === "production"): SupabasePublicEnv | null {
  if (process.env.NEXT_PUBLIC_SUPABASE_DISABLED === "true") return null;

  const productionDefaults = isProduction ? VOLTGRID_PRODUCTION_PUBLIC_ENV : undefined;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || productionDefaults?.url;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || productionDefaults?.publishableKey;
  if (!url || !publishableKey) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicEnv() !== null;
}
