export type SupabasePublicEnv = Readonly<{
  url: string;
  publishableKey: string;
}>;

/**
 * Reads only the two public Supabase settings that are safe for browser code.
 * Missing/invalid settings intentionally select the offline adapter instead of
 * creating a client with an undefined URL or key.
 */
export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
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
