import type {
  ActionStatus,
  ChainAction,
  EpochMetrics,
  EpochOutcome,
  RelayerDay,
} from "../../lib/relayer";

export const ROUTE_PATHS = [
  "/",
  "/overview",
  "/play",
  "/market",
  "/emergency",
  "/certificates",
  "/activity",
  "/settings",
] as const;

export type RoutePath = (typeof ROUTE_PATHS)[number];

export type PlayDayState = Readonly<{
  day: RelayerDay;
  outcomes: readonly EpochOutcome[];
  closeAction: ChainAction | null;
  chainId: number;
  marketAddress: string;
}>;

export function stableRequestId(scope: string): string {
  // The relayer accepts UUIDs. A deterministic UUID lets a refresh or a lost
  // response retry the same day/epoch without relying on browser storage.
  let hash = 2166136261;
  for (let index = 0; index < scope.length; index += 1) {
    hash ^= scope.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const chunks: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0x5bd1e995);
    hash ^= hash >>> 15;
    chunks.push((hash >>> 0).toString(16).padStart(8, "0"));
  }
  const hex = chunks.join("").split("");
  hex[12] = "5";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function mergeOutcome(
  outcomes: readonly EpochOutcome[],
  outcome: EpochOutcome,
): readonly EpochOutcome[] {
  return [...outcomes.filter((item) => item.epochIndex !== outcome.epochIndex), outcome]
    .sort((left, right) => left.epochIndex - right.epochIndex);
}

export function applyOutcome(state: PlayDayState, outcome: EpochOutcome): PlayDayState {
  const nextEpoch = outcome.status === "confirmed"
    ? Math.max(state.day.nextEpoch, outcome.epochIndex + 1)
    : state.day.nextEpoch;
  return {
    ...state,
    day: { ...state.day, nextEpoch },
    outcomes: mergeOutcome(state.outcomes, outcome),
  };
}

export function stateFromDayResponse(response: {
  day: RelayerDay;
  outcomes: readonly EpochOutcome[];
  closeAction: ChainAction | null;
  chainId: number;
  marketAddress: string;
}): PlayDayState {
  return {
    day: response.day,
    outcomes: [...response.outcomes].sort((left, right) => left.epochIndex - right.epochIndex),
    closeAction: response.closeAction,
    chainId: response.chainId,
    marketAddress: response.marketAddress,
  };
}

export function epochRequestId(dayId: string, epochIndex: number): string {
  return stableRequestId(`${dayId}:epoch:${epochIndex}`);
}

export function closeRequestId(dayId: string): string {
  return stableRequestId(`${dayId}:close`);
}

export function confirmedMetric<K extends keyof EpochMetrics>(
  outcome: EpochOutcome | undefined,
  key: K,
): EpochMetrics[K] | undefined {
  return outcome?.status === "confirmed" ? outcome.metrics?.[key] : undefined;
}

export function statusLabel(status: ActionStatus): string {
  switch (status) {
    case "confirmed": return "confirmed";
    case "pending": return "pending";
    case "reverted": return "reverted";
    case "unknown": return "unknown / reconcile";
  }
}

export type ConfirmedActivity = Readonly<{
  name: string;
  txHash: string;
  blockNumber?: string | number;
  logIndex?: number;
  address?: string;
  dayId?: string;
  epochIndex?: number;
}>;

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

export function normalizeConfirmedActivity(value: Record<string, unknown>): ConfirmedActivity | null {
  const txHash = stringValue(value.transactionHash) ?? stringValue(value.txHash);
  const name = stringValue(value.name) ?? stringValue(value.eventName);
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash) || !name) return null;
  const args = recordValue(value.args);
  const dayId = stringValue(args?.dayId) ?? stringValue(args?.["0"]);
  const epochIndex = numberValue(args?.epochIndex) ?? numberValue(args?.["1"]);
  return {
    name,
    txHash,
    ...(numberValue(value.blockNumber) === undefined && stringValue(value.blockNumber) === undefined ? {} : { blockNumber: numberValue(value.blockNumber) ?? stringValue(value.blockNumber) }),
    ...(numberValue(value.logIndex) === undefined ? {} : { logIndex: numberValue(value.logIndex) }),
    ...(stringValue(value.address) ? { address: stringValue(value.address) } : {}),
    ...(dayId ? { dayId } : {}),
    ...(epochIndex === undefined ? {} : { epochIndex }),
  };
}
