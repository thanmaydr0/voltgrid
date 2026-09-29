import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSafeReturnPath } from "@/lib/supabase/redirects";

function signInRedirect(request: NextRequest, errorCode: string, nextPath: string) {
  const url = new URL("/auth/sign-in", request.url);
  url.searchParams.set("error", errorCode);
  url.searchParams.set("next", getSafeReturnPath(nextPath));
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const nextPath = getSafeReturnPath(query.get("next"));
  const code = query.get("code");
  const tokenHash = query.get("token_hash");

  if (query.has("error") || (!code && !tokenHash)) {
    return signInRedirect(request, "callback-failed", nextPath);
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return signInRedirect(request, "not-configured", nextPath);

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) return signInRedirect(request, "callback-failed", nextPath);
  } else {
    // Current PKCE Magic Link templates may deliver a one-time token hash.
    // Verify only the email type; never accept a caller-selected provider/type.
    const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: tokenHash as string, type: "email" });
    if (otpError) return signInRedirect(request, "callback-failed", nextPath);
  }

  // Confirm the exchanged session with the Auth service before redirecting.
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) return signInRedirect(request, "session-expired", nextPath);

  return NextResponse.redirect(new URL(nextPath, request.url));
}
