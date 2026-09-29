"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AppServices, AuthUser } from "./contracts";
import { offlineAppDataService, offlineAuthService } from "./offline";
import { supabaseAppServices } from "./supabase";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const OFFLINE_APP_SERVICES: AppServices = Object.freeze({
  auth: offlineAuthService,
  data: offlineAppDataService,
});

export const DEFAULT_APP_SERVICES: AppServices = isSupabaseConfigured() ? supabaseAppServices : OFFLINE_APP_SERVICES;

const AppServicesContext = createContext<AppServices>(DEFAULT_APP_SERVICES);

export function AppServicesProvider({
  children,
  services = DEFAULT_APP_SERVICES,
}: {
  children: React.ReactNode;
  services?: AppServices;
}) {
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}

export function useAppServices(): AppServices {
  return useContext(AppServicesContext);
}

export type AccountState = "checking" | "signed-out" | "signed-in" | "unavailable" | "error";

export function useAppAccount() {
  const services = useAppServices();
  const [state, setState] = useState<AccountState>("checking");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState("checking");
    setMessage(null);
    const result = await services.auth.getCurrentUser();
    if (result.status === "ok") {
      setUser(result.data);
      setState(result.data ? "signed-in" : "signed-out");
      return result.data;
    }
    setUser(null);
    setState(result.status === "unavailable" ? "unavailable" : "error");
    setMessage(result.message);
    return null;
  }, [services.auth]);

  useEffect(() => {
    let active = true;
    void services.auth.getCurrentUser().then((result) => {
      if (!active) return;
      if (result.status === "ok") {
        setUser(result.data);
        setState(result.data ? "signed-in" : "signed-out");
        setMessage(null);
      } else {
        setUser(null);
        setState(result.status === "unavailable" ? "unavailable" : "error");
        setMessage(result.message);
      }
    });
    return () => { active = false; };
  }, [services.auth]);

  return { state, user, message, refresh };
}
