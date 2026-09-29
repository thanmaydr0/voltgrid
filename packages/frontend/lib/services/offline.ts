import type { AppDataService, AuthService, ServiceResult } from "./contracts";

const notConfigured = <T,>(): ServiceResult<T> => ({
  status: "unavailable",
  code: "not-configured",
  message: "Account services are not configured. Public previews and chain reads remain available.",
});

/** Explicit no-op auth adapter. It never stores session state in browser storage. */
export const offlineAuthService: AuthService = Object.freeze({
  async getCurrentUser() { return notConfigured<null>(); },
  async requestEmailLink() { return notConfigured<void>(); },
  async signOut() { return notConfigured<void>(); },
});

/** Explicit no-op app-data adapter. It does not cache or persist user data locally. */
export const offlineAppDataService: AppDataService = Object.freeze({
  async readPreferences() { return notConfigured<null>(); },
  async savePreferences() { return notConfigured<void>(); },
  async listHouseDrafts() { return notConfigured<[]>(); },
  async saveHouseDraft() { return notConfigured<void>(); },
  async deleteHouseDraft() { return notConfigured<void>(); },
  async listSavedDays() { return notConfigured<[]>(); },
  async saveDayReference() { return notConfigured<void>(); },
  async deleteDayReference() { return notConfigured<void>(); },
});
