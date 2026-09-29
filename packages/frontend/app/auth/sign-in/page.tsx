"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAppServices } from "@/lib/services/provider";
import { buildAuthCallbackUrl, getSafeReturnPath } from "@/lib/supabase/redirects";
import type { AuthUser } from "@/lib/services/contracts";

const ERROR_COPY: Record<string, string> = {
  "callback-failed": "That sign-in link is invalid or has already been used. Request a new one.",
  "not-configured": "Account sign-in is not configured on this deployment. Public preview remains available.",
  "session-expired": "Your account session expired. Request a fresh email link to continue.",
};

export default function SignInPage() {
  const services = useAppServices();
  const [email, setEmail] = useState("");
  const [nextPath, setNextPath] = useState("/");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(getSafeReturnPath(params.get("next")));
    const queryError = params.get("error");
    if (queryError) setError(ERROR_COPY[queryError] ?? "Account sign-in needs attention. Request a new email link.");

    void services.auth.getCurrentUser().then((result) => {
      if (result.status === "ok") setCurrentUser(result.data);
      else if (result.status === "error") setError(result.message);
    });
  }, [services.auth]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    const result = await services.auth.requestEmailLink({
      email: email.trim(),
      redirectTo: buildAuthCallbackUrl(window.location.origin, nextPath),
    });
    setBusy(false);
    if (result.status === "ok") setMessage("Check your email for a one-time VoltGrid sign-in link.");
    else setError(result.message);
  }

  async function signOut() {
    setBusy(true);
    const result = await services.auth.signOut();
    setBusy(false);
    if (result.status === "ok") {
      setCurrentUser(null);
      setMessage("You have been signed out.");
    } else setError(result.message);
  }

  return (
    <main className="mx-auto min-h-[60vh] w-full max-w-lg px-5 py-16">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">VoltGrid account</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Sign in with email</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">Login is optional. Public previews and read-only chain views remain available without an account.</p>

        {currentUser ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm text-emerald-100">Signed in as {currentUser.email ?? "your verified account"}.</p>
            <button type="button" onClick={signOut} disabled={busy} className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "Signing out…" : "Sign out"}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm text-slate-200" htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2.5 text-white outline-none focus:border-emerald-300" placeholder="you@example.com" />
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? "Sending link…" : "Email me a sign-in link"}</button>
          </form>
        )}

        {message ? <p role="status" className="mt-5 text-sm text-emerald-200">{message}</p> : null}
        {error ? <p role="alert" className="mt-5 text-sm text-rose-200">{error}</p> : null}
        <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">Wallet signatures remain separate from account login. A Supabase session never authorizes relayer or on-chain wallet actions.</p>
      </div>
    </main>
  );
}
