"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getSupabasePublicEnv } from "./env";

let browserClient: SupabaseClient<Database> | null = null;

/** Cookie/local-storage aware client for Client Components. */
export function createClient(): SupabaseClient<Database> {
  const env = getSupabasePublicEnv();
  if (!env) throw new Error("Supabase public environment is not configured.");
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(env.url, env.publishableKey);
  }
  return browserClient;
}

export function getBrowserClient(): SupabaseClient<Database> | null {
  return getSupabasePublicEnv() ? createClient() : null;
}
