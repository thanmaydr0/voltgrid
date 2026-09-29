export type ServiceFailure =
  | { status: "unavailable"; code: "not-configured" | "offline"; message: string }
  | { status: "error"; code: string; message: string };

export type ServiceResult<T> = { status: "ok"; data: T } | ServiceFailure;

export interface AuthUser {
  /** Provider-issued identity; never accepted back as an authorization argument. */
  readonly id: string;
  readonly email: string | null;
}

export interface UserPreferences {
  readonly displayName: string | null;
  readonly defaultScenario: "sunny" | "rainy" | "heatwave";
  readonly compactNavigation: boolean;
}

/** A private, user-owned draft of declarations; not proof of a house or hardware. */
export interface HouseRegistrationDraft {
  readonly draftId: string;
  readonly label: string;
  readonly solarEnabled: boolean;
  readonly batteryEnabled: boolean;
  readonly batteryCapacityWh: number | null;
  readonly updatedAtISO: string;
}

/** A pointer only. Receipt metrics and settlement state must be read from chain/relayer. */
export interface SavedDayReference {
  readonly dayId: `0x${string}`;
  readonly chainId: number;
  readonly marketAddress: `0x${string}`;
  readonly scenario: "sunny" | "rainy" | "heatwave";
  readonly seed: string;
  readonly savedAtISO: string;
}

/** Implementations derive the account scope from a verified auth session, never an input user ID. */
export interface AuthService {
  getCurrentUser(): Promise<ServiceResult<AuthUser | null>>;
  requestEmailLink(input: { readonly email: string; readonly redirectTo: string }): Promise<ServiceResult<void>>;
  signOut(): Promise<ServiceResult<void>>;
}

/** Data access methods are implicitly scoped to the authenticated user. */
export interface AppDataService {
  readPreferences(): Promise<ServiceResult<UserPreferences | null>>;
  savePreferences(preferences: UserPreferences): Promise<ServiceResult<void>>;
  listHouseDrafts(): Promise<ServiceResult<readonly HouseRegistrationDraft[]>>;
  saveHouseDraft(draft: HouseRegistrationDraft): Promise<ServiceResult<void>>;
  deleteHouseDraft(draftId: string): Promise<ServiceResult<void>>;
  listSavedDays(): Promise<ServiceResult<readonly SavedDayReference[]>>;
  saveDayReference(reference: SavedDayReference): Promise<ServiceResult<void>>;
  deleteDayReference(dayId: `0x${string}`): Promise<ServiceResult<void>>;
}

export interface AppServices {
  readonly auth: AuthService;
  readonly data: AppDataService;
}
