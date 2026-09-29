"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppAccount, useAppServices } from "@/lib/services/provider";
import type { UserPreferences } from "@/lib/services/contracts";

const DEFAULT_PREFERENCES: UserPreferences = { displayName: null, defaultScenario: "sunny", compactNavigation: false };

export function SettingsView() {
  const services = useAppServices();
  const account = useAppAccount();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "ready" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (account.state !== "signed-in") return;
    setStatus("loading");
    const result = await services.data.readPreferences();
    if (result.status === "ok") {
      if (result.data) setPreferences(result.data);
      setStatus("ready");
      setMessage(null);
    } else {
      setStatus("error");
      setMessage(result.message);
    }
  }, [account.state, services.data]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setStatus("saving");
    const result = await services.data.savePreferences(preferences);
    if (result.status === "ok") {
      setStatus("ready");
      setMessage("Saved preferences to your account.");
    } else {
      setStatus("error");
      setMessage(result.message);
    }
  }

  return <main id="main-content" className="dashboard-shell !pt-8 sm:!pt-12">
    <header className="mb-5 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">VoltGrid / settings</p><h1 className="!mb-2 !max-w-3xl !text-4xl sm:!text-5xl">Account data stays in its lane.</h1><p className="!mb-0 !max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">Supabase stores only your optional preferences and saved pointers. Wallet approval and relayer authorization remain separate.</p></div><StatusBadge status={account.state === "signed-in" ? "confirmed on-chain" : "unavailable"} /></header>
    <Card>
      <CardHeader><CardTitle>Account</CardTitle><CardDescription>{account.user?.email ? `Signed in as ${account.user.email}.` : "Login is optional for preview and public read-only views."}</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {account.state === "checking" && <p role="status" className="text-sm text-muted-foreground">Checking account session…</p>}
        {account.state === "unavailable" && <p role="status" className="text-sm text-muted-foreground">Account services are offline or not configured. Public preview remains available.</p>}
        {account.state === "error" && <p role="alert" className="text-sm text-destructive">{account.message ?? "Account session needs attention."}</p>}
        {account.state !== "signed-in" && account.state !== "checking" && <Link className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href="/auth/sign-in?next=%2Fsettings">Sign in to save preferences</Link>}
        {account.state === "signed-in" && <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm" htmlFor="settings-display-name"><span>Display name</span><input id="settings-display-name" className="min-h-11 rounded-md border border-border bg-background px-3" value={preferences.displayName ?? ""} onChange={(event) => setPreferences((current) => ({ ...current, displayName: event.target.value || null }))} /></label>
          <label className="grid gap-2 text-sm" htmlFor="settings-scenario"><span>Default preview scenario</span><select id="settings-scenario" className="min-h-11 rounded-md border border-border bg-background px-3" value={preferences.defaultScenario} onChange={(event) => setPreferences((current) => ({ ...current, defaultScenario: event.target.value as UserPreferences["defaultScenario"] }))}><option value="sunny">Sunny</option><option value="rainy">Rainy</option><option value="heatwave">Heatwave</option></select></label>
        </div>}
        {account.state === "signed-in" && <Button onClick={() => void save()} disabled={status === "loading" || status === "saving"}>{status === "saving" ? "Saving…" : "Save preferences"}</Button>}
        {message && <p role={status === "error" ? "alert" : "status"} className="text-sm text-muted-foreground">{message}</p>}
        <p className="text-xs leading-5 text-muted-foreground">Saved-day pointers are re-read from the relayer after wallet authorization. Clearing browser storage does not delete account data.</p>
      </CardContent>
    </Card>
  </main>;
}
