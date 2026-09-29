import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { getSupabasePublicEnv } from "./env";

/** Create a request-scoped SSR client. Never cache this client across requests. */
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database> | null> {
  const env = getSupabasePublicEnv();
  if (!env) return null;

  const cookieStore = await cookies();
  return createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; middleware/route handlers can.
        }
      },
    },
  });
}

/** Verify the current identity with Supabase Auth; do not trust getSession().user. */
export async function getVerifiedServerUser() {
  const client = await createServerSupabaseClient();
  if (!client) return { client: null, user: null, error: new Error("Supabase is not configured.") };
  const { data, error } = await client.auth.getUser();
  return { client, user: data.user, error };
}
