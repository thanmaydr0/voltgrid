import type { Scenario } from "./relayer";
import type { DayResponse } from "./relayer";
import type { SavedDayReference, ServiceResult } from "./services/contracts";

export const LEGACY_PLAY_DAY_KEY = "voltgrid:play-day";
export const LEGACY_CARBON_DAY_KEY = "voltgrid:last-carbon-day";

type LegacyDayShape = Readonly<{
  dayId: string;
  ownerAddress: string;
  clientRunId: string;
  scenario: Scenario;
  seed: string;
  viewerEvCharging: boolean;
}>;

export type LegacyDayCandidate = Readonly<{
  pointer: LegacyDayShape;
  keys: readonly string[];
}>;

export type LegacyDayInspection = Readonly<{
  candidates: readonly LegacyDayCandidate[];
  invalidKeys: readonly string[];
}>;

export interface LegacyStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

const DAY_ID_PATTERN = /^0x[0-9a-f]{64}$/i;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const SCENARIOS: readonly Scenario[] = ["sunny", "rainy", "heatwave"];

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function parseLegacyDay(value: string | null): LegacyDayShape | null {
  if (!value) return null;
  try {
    const parsed = recordValue(JSON.parse(value));
    if (!parsed) return null;
    const dayId = parsed.dayId;
    const ownerAddress = parsed.ownerAddress;
    const clientRunId = parsed.clientRunId;
    const scenario = parsed.scenario;
    const seed = parsed.seed;
    const viewerEvCharging = parsed.viewerEvCharging;
    if (
      typeof dayId !== "string" || !DAY_ID_PATTERN.test(dayId)
      || typeof ownerAddress !== "string" || !ADDRESS_PATTERN.test(ownerAddress)
      || typeof clientRunId !== "string" || clientRunId.trim().length === 0 || clientRunId.length > 256
      || typeof scenario !== "string" || !SCENARIOS.includes(scenario as Scenario)
      || typeof seed !== "string" || seed.trim().length === 0 || seed.length > 256
      || typeof viewerEvCharging !== "boolean"
    ) return null;
    return {
      dayId: dayId.toLowerCase(),
      ownerAddress: ownerAddress.toLowerCase(),
      clientRunId,
      scenario: scenario as Scenario,
      seed,
      viewerEvCharging,
    };
  } catch {
    return null;
  }
}

export function inspectLegacyDays(storage: LegacyStorage): LegacyDayInspection {
  const entries = [LEGACY_PLAY_DAY_KEY, LEGACY_CARBON_DAY_KEY].map((key) => ({ key, value: storage.getItem(key) }));
  const invalidKeys = entries.filter((entry) => entry.value !== null && !parseLegacyDay(entry.value)).map((entry) => entry.key);
  const valid = entries.flatMap((entry) => {
    const pointer = parseLegacyDay(entry.value);
    return pointer ? [{ key: entry.key, pointer }] : [];
  });
  const grouped = new Map<string, { pointer: LegacyDayShape; keys: string[] }>();
  for (const entry of valid) {
    const existing = grouped.get(entry.pointer.dayId);
    if (existing) existing.keys.push(entry.key);
    else grouped.set(entry.pointer.dayId, { pointer: entry.pointer, keys: [entry.key] });
  }
  return {
    candidates: [...grouped.values()].map((item) => ({ pointer: item.pointer, keys: item.keys })),
    invalidKeys,
  };
}

export type LegacyMigrationResult =
  | Readonly<{ status: "ok"; response: DayResponse; reference: SavedDayReference }>
  | Readonly<{ status: "error"; message: string }>;

export async function reconcileLegacyDay(input: {
  candidate: LegacyDayCandidate;
  walletAddress: string;
  getDay: (dayId: string) => Promise<DayResponse>;
  saveReference: (reference: SavedDayReference) => Promise<ServiceResult<void>>;
  storage: LegacyStorage;
}): Promise<LegacyMigrationResult> {
  if (!ADDRESS_PATTERN.test(input.walletAddress) || input.walletAddress.toLowerCase() !== input.candidate.pointer.ownerAddress.toLowerCase()) {
    return { status: "error", message: "The legacy day belongs to a different wallet. It was kept and not restored." };
  }

  let response: DayResponse;
  try {
    // The local value is only a lookup hint. The returned response replaces all
    // cached outcomes and metrics before anything is saved or displayed.
    response = await input.getDay(input.candidate.pointer.dayId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "The relayer could not reconcile the legacy day. It was kept." };
  }

  if (
    response.day.dayId.toLowerCase() !== input.candidate.pointer.dayId.toLowerCase()
    || response.day.ownerAddress.toLowerCase() !== input.walletAddress.toLowerCase()
  ) {
    return { status: "error", message: "The relayer did not confirm ownership of this legacy day. It was kept." };
  }

  const reference: SavedDayReference = {
    dayId: response.day.dayId as `0x${string}`,
    chainId: response.chainId,
    marketAddress: response.marketAddress as `0x${string}`,
    scenario: response.day.scenario,
    seed: response.day.seed,
    savedAtISO: new Date().toISOString(),
  };
  const saved = await input.saveReference(reference);
  if (saved.status !== "ok") return { status: "error", message: `${saved.message} The legacy entry was kept.` };

  for (const key of input.candidate.keys) input.storage.removeItem(key);
  return { status: "ok", response, reference };
}
