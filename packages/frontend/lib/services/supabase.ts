import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppDataService,
  AppServices,
  AuthService,
  AuthUser,
  HouseRegistrationDraft,
  SavedDayReference,
  ServiceFailure,
  ServiceResult,
  UserPreferences,
} from "./contracts";
import type { Database } from "@/types/supabase";
import { getBrowserClient } from "@/lib/supabase/client";
import { isAllowedAuthRedirect } from "@/lib/supabase/redirects";
import { notConfiguredFailure, notSignedInFailure, toSupabaseFailure } from "@/lib/supabase/errors";
import {
  isScenario,
  normalizeDayId,
  normalizeDisplayName,
  normalizeEvmAddress,
  validateDraft,
  validateSavedDay,
} from "@/lib/supabase/validation";

type TypedClient = SupabaseClient<Database>;
type AuthenticatedClient = Readonly<{ client: TypedClient; userId: string }>;

const ok = <T>(data: T): ServiceResult<T> => ({ status: "ok", data });
const failure = (error: unknown, operation: string): ServiceFailure => toSupabaseFailure(error, operation);
const invalid = (code: string, message: string): ServiceFailure => ({ status: "error", code, message });

async function authenticatedClient(): Promise<AuthenticatedClient | { failure: ServiceFailure }> {
  const client = getBrowserClient();
  if (!client) return { failure: notConfiguredFailure };
  const { data, error } = await client.auth.getUser();
  if (error) return { failure: failure(error, "session check") };
  if (!data.user) return { failure: notSignedInFailure };
  return { client, userId: data.user.id };
}

const authService: AuthService = {
  async getCurrentUser(): Promise<ServiceResult<AuthUser | null>> {
    const client = getBrowserClient();
    if (!client) return notConfiguredFailure;
    const { data, error } = await client.auth.getUser();
    if (error) {
      if (/auth session missing|session not found/i.test(error.message)) return ok(null);
      return failure(error, "session check");
    }
    return ok(data.user ? { id: data.user.id, email: data.user.email ?? null } : null);
  },

  async requestEmailLink(input: Parameters<AuthService["requestEmailLink"]>[0]): Promise<ServiceResult<void>> {
    const email = input.email.trim();
    if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
      return invalid("invalid-email", "Enter a valid email address.");
    }
    if (typeof window === "undefined" || !isAllowedAuthRedirect(input.redirectTo, window.location.origin)) {
      return invalid("invalid-redirect", "The sign-in return path is not allowed.");
    }
    const client = getBrowserClient();
    if (!client) return notConfiguredFailure;
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: input.redirectTo,
        shouldCreateUser: true,
      },
    });
    return error ? failure(error, "email link request") : ok(undefined);
  },

  async signOut() {
    const client = getBrowserClient();
    if (!client) return notConfiguredFailure;
    const { error } = await client.auth.signOut();
    return error ? failure(error, "sign out") : ok(undefined);
  },
};
Object.freeze(authService);

const appDataService: AppDataService = {
  async readPreferences(): Promise<ServiceResult<UserPreferences | null>> {
    const auth = await authenticatedClient();
    if ("failure" in auth) return auth.failure;
    const [profileResult, preferenceResult] = await Promise.all([
      auth.client.from("profiles").select("display_name").eq("id", auth.userId).maybeSingle(),
      auth.client.from("user_preferences").select("default_scenario, compact_navigation").eq("user_id", auth.userId).maybeSingle(),
    ]);
    if (profileResult.error) return failure(profileResult.error, "preference read");
    if (preferenceResult.error) return failure(preferenceResult.error, "preference read");
    if (!profileResult.data && !preferenceResult.data) return ok(null);
    return ok({
      displayName: profileResult.data?.display_name ?? null,
      defaultScenario: preferenceResult.data?.default_scenario ?? "sunny",
      compactNavigation: preferenceResult.data?.compact_navigation ?? false,
    });
  },

  async savePreferences(preferences: UserPreferences): Promise<ServiceResult<void>> {
    const auth = await authenticatedClient();
    if ("failure" in auth) return auth.failure;
    if (!isScenario(preferences.defaultScenario)) return invalid("invalid-preferences", "The selected scenario is invalid.");
    let displayName: string | null;
    try {
      displayName = normalizeDisplayName(preferences.displayName);
    } catch (error) {
      return invalid("invalid-preferences", error instanceof Error ? error.message : "Preferences are invalid.");
    }
    const profileResult = await auth.client.from("profiles").upsert({ id: auth.userId, display_name: displayName });
    if (profileResult.error) return failure(profileResult.error, "preference save");
    const preferenceResult = await auth.client.from("user_preferences").upsert({
      user_id: auth.userId,
      default_scenario: preferences.defaultScenario,
      compact_navigation: preferences.compactNavigation,
    });
    return preferenceResult.error ? failure(preferenceResult.error, "preference save") : ok(undefined);
  },

  async listHouseDrafts(): Promise<ServiceResult<readonly HouseRegistrationDraft[]>> {
    const auth = await authenticatedClient();
    if ("failure" in auth) return auth.failure;
    const { data, error } = await auth.client.from("house_registration_drafts").select("draft_id, label, solar_enabled, battery_enabled, battery_capacity_wh, updated_at").order("updated_at", { ascending: false });
    if (error) return failure(error, "house draft read");
    return ok((data ?? []).map((draft): HouseRegistrationDraft => ({
      draftId: draft.draft_id,
      label: draft.label,
      solarEnabled: draft.solar_enabled,
      batteryEnabled: draft.battery_enabled,
      batteryCapacityWh: draft.battery_capacity_wh,
      updatedAtISO: draft.updated_at,
    })));
  },

  async saveHouseDraft(draft: HouseRegistrationDraft): Promise<ServiceResult<void>> {
    const auth = await authenticatedClient();
    if ("failure" in auth) return auth.failure;
    try {
      validateDraft(draft);
    } catch (error) {
      return invalid("invalid-house-draft", error instanceof Error ? error.message : "House draft is invalid.");
    }
    const { error } = await auth.client.from("house_registration_drafts").upsert({
      draft_id: draft.draftId,
      user_id: auth.userId,
      label: draft.label.trim(),
      solar_enabled: draft.solarEnabled,
      battery_enabled: draft.batteryEnabled,
      battery_capacity_wh: draft.batteryCapacityWh,
      updated_at: new Date(draft.updatedAtISO).toISOString(),
    });
    return error ? failure(error, "house draft save") : ok(undefined);
  },

  async deleteHouseDraft(draftId: string): Promise<ServiceResult<void>> {
    const auth = await authenticatedClient();
    if ("failure" in auth) return auth.failure;
    const { error } = await auth.client.from("house_registration_drafts").delete().eq("draft_id", draftId);
    return error ? failure(error, "house draft delete") : ok(undefined);
  },

  async listSavedDays(): Promise<ServiceResult<readonly SavedDayReference[]>> {
    const auth = await authenticatedClient();
    if ("failure" in auth) return auth.failure;
    const { data, error } = await auth.client.from("saved_days").select("day_id, chain_id, market_address, scenario, seed, saved_at").order("saved_at", { ascending: false });
    if (error) return failure(error, "saved day read");
    return ok((data ?? []).map((reference): SavedDayReference => ({
      dayId: reference.day_id as `0x${string}`,
      chainId: reference.chain_id,
      marketAddress: reference.market_address as `0x${string}`,
      scenario: reference.scenario,
      seed: reference.seed,
      savedAtISO: reference.saved_at,
    })));
  },

  async saveDayReference(reference: SavedDayReference): Promise<ServiceResult<void>> {
    const auth = await authenticatedClient();
    if ("failure" in auth) return auth.failure;
    try {
      validateSavedDay(reference);
    } catch (error) {
      return invalid("invalid-saved-day", error instanceof Error ? error.message : "Saved day reference is invalid.");
    }
    const { error } = await auth.client.from("saved_days").upsert({
      user_id: auth.userId,
      day_id: normalizeDayId(reference.dayId),
      chain_id: reference.chainId,
      market_address: normalizeEvmAddress(reference.marketAddress),
      scenario: reference.scenario,
      seed: reference.seed.trim(),
      saved_at: new Date(reference.savedAtISO).toISOString(),
    });
    return error ? failure(error, "saved day save") : ok(undefined);
  },

  async deleteDayReference(dayId: `0x${string}`): Promise<ServiceResult<void>> {
    const auth = await authenticatedClient();
    if ("failure" in auth) return auth.failure;
    let normalizedDayId: `0x${string}`;
    try {
      normalizedDayId = normalizeDayId(dayId);
    } catch (error) {
      return invalid("invalid-saved-day", error instanceof Error ? error.message : "Saved day ID is invalid.");
    }
    const { error } = await auth.client.from("saved_days").delete().eq("day_id", normalizedDayId);
    return error ? failure(error, "saved day delete") : ok(undefined);
  },
};
Object.freeze(appDataService);

export const supabaseAuthService: AuthService = authService;
export const supabaseAppDataService: AppDataService = appDataService;
export const supabaseAppServices: AppServices = Object.freeze({
  auth: authService,
  data: appDataService,
});
