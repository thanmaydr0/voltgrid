import type { HouseRegistrationDraft, SavedDayReference, UserPreferences } from "../services/contracts";

export const SCENARIOS = ["sunny", "rainy", "heatwave"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_ID_PATTERN = /^0x[0-9a-f]{64}$/i;
const EVM_ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

export function isScenario(value: string): value is UserPreferences["defaultScenario"] {
  return (SCENARIOS as readonly string[]).includes(value);
}

export function normalizeDisplayName(value: string | null): string | null {
  if (value === null) return null;
  const displayName = value.trim();
  if (!displayName || displayName.length > 80) throw new Error("Display name must be between 1 and 80 characters.");
  return displayName;
}

export function validateDraft(draft: HouseRegistrationDraft): void {
  if (!UUID_PATTERN.test(draft.draftId)) throw new Error("House draft ID must be a UUID.");
  if (!draft.label.trim() || draft.label.trim().length > 120) throw new Error("House draft label must be between 1 and 120 characters.");
  if (!draft.batteryEnabled && draft.batteryCapacityWh !== null) throw new Error("Battery capacity must be empty when the battery is disabled.");
  if (draft.batteryEnabled && (!Number.isSafeInteger(draft.batteryCapacityWh) || (draft.batteryCapacityWh as number) < 1 || (draft.batteryCapacityWh as number) > 100000)) {
    throw new Error("Battery capacity must be a whole number between 1 and 100000 Wh.");
  }
  if (Number.isNaN(Date.parse(draft.updatedAtISO))) throw new Error("House draft timestamp is invalid.");
}

export function validateSavedDay(reference: SavedDayReference): void {
  if (!DAY_ID_PATTERN.test(reference.dayId)) throw new Error("Saved day ID is invalid.");
  if (!Number.isSafeInteger(reference.chainId) || reference.chainId < 1 || reference.chainId > 2147483647) throw new Error("Saved day chain ID is invalid.");
  if (!EVM_ADDRESS_PATTERN.test(reference.marketAddress)) throw new Error("Saved day market address is invalid.");
  if (!isScenario(reference.scenario)) throw new Error("Saved day scenario is invalid.");
  if (!reference.seed.trim() || reference.seed.length > 256) throw new Error("Saved day seed is invalid.");
  if (Number.isNaN(Date.parse(reference.savedAtISO))) throw new Error("Saved day timestamp is invalid.");
}

export function normalizeEvmAddress(address: string): `0x${string}` {
  if (!EVM_ADDRESS_PATTERN.test(address)) throw new Error("EVM address is invalid.");
  return address.toLowerCase() as `0x${string}`;
}

export function normalizeDayId(dayId: string): `0x${string}` {
  if (!DAY_ID_PATTERN.test(dayId)) throw new Error("Day ID is invalid.");
  return dayId.toLowerCase() as `0x${string}`;
}
