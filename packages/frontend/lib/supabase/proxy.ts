import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";
import { getSupabasePublicEnv } from "./env";

/** Refresh cookie sessions for the App Router proxy boundary. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const env = getSupabasePublicEnv();
  if (!env) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      Object.entries(headers).forEach(([name, value]) => supabaseResponse.headers.set(name, value));
      },
    },
  });

  try {
    // getClaims verifies the token and refreshes it when it is close to expiry.
    await supabase.auth.getClaims();
  } catch {
    // A stale/network-failed session must not make public preview routes fail.
    // The sign-in page surfaces the next actionable state when the user retries.
  }

  return supabaseResponse;
}
