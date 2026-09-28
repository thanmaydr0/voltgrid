export type ActionStatus = "pending" | "confirmed" | "reverted" | "unknown";
export type Scenario = "sunny" | "rainy" | "heatwave";
export type HouseConfig = Readonly<{ address: `0x${string}`; kind: "solarBattery" | "solarOnly" | "ev" | "regular" | "viewer"; hasSolar: boolean; hasBattery: boolean; batteryCapacityWh: number }>;

export type ChainAction = Readonly<{
  action: "start" | "settle" | "declareEmergency" | "reportDischarge" | "resolveEmergency" | "closeDay";
  status: ActionStatus;
  txHash?: string;
  blockNumber?: string;
  contractAddress?: string;
  errorCode?: string;
  fallbackReason?: "no-opted-in-battery" | "no-modelled-energy" | "treasury-underfunded";
  metrics?: EpochMetrics | CarbonCloseMetrics;
}>;

export type CarbonCertificate = Readonly<{
  dayId: string;
  tokenId: string;
  solarSeller: string;
  eligibleWh: number;
  factorGPerKwh: number;
  factorVersion: number;
  avoidedMgCo2e: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  contractAddress: string;
}>;

export type CarbonCloseMetrics = Readonly<{
  factorGPerKwh: number;
  factorVersion: number;
  totalEligibleWh: number;
  totalAvoidedMgCo2e: string;
  certificates: readonly CarbonCertificate[];
}>;

export type EpochMetrics = Readonly<{
  priceMicroVltPerKwh?: string;
  matchedWh?: number;
  exportedWh?: number;
  importedWh?: number;
  feesWei?: string;
  shavedWh?: number;
  payoutWei?: string;
  targetWh?: number;
  tariffMicroVltPerKwh?: number;
  deliveredWh?: number;
  dischargeCount?: number;
  discharges?: readonly Readonly<{ house: string; deliveredWh: number; payoutWei: string }>[];
}>;

export type EpochOutcome = Readonly<{
  dayId: string;
  epochIndex: number;
  kind: "normal" | "emergency";
  status: ActionStatus;
  actions: readonly ChainAction[];
  metrics?: EpochMetrics;
  fallbackReason?: "no-opted-in-battery" | "no-modelled-energy" | "treasury-underfunded";
}>;

export type RelayerDay = Readonly<{
  dayId: string;
  ownerAddress: string;
  clientRunId: string;
  scenario: Scenario;
  seed: string;
  viewerEvCharging: boolean;
  houses: readonly HouseConfig[];
  modelVersion: 1;
  inputDigest: string;
  transformerCapacityWh: number;
  status: "starting" | "active" | "closed" | "failed";
  nextEpoch: number;
  createdAt: number;
}>;

export type DayResponse = Readonly<{
  day: RelayerDay;
  outcomes: readonly EpochOutcome[];
  closeAction: ChainAction | null;
  chainId: number;
  marketAddress: string;
  modelVersion: 1;
}>;

export type ApiEnvelope = Readonly<{
  chainId: number;
  marketAddress: string;
  modelVersion: 1;
}>;

export type StoredRelayerSession = Readonly<{ address: string; accessToken: string; expiresAt: number }>;

export class RelayerRequestError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
    this.name = "RelayerRequestError";
  }
}

const SESSION_KEY = "voltgrid:relayer-session";
const DEFAULT_BASE = "/api/relayer";

export function readStoredRelayerSession(): StoredRelayerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "null") as StoredRelayerSession | null;
    if (!parsed?.accessToken || !/^0x[0-9a-fA-F]{40}$/.test(parsed.address) || !Number.isSafeInteger(parsed.expiresAt) || parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function storeRelayerSession(session: StoredRelayerSession): void {
  if (typeof window !== "undefined") window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearRelayerSession(): void {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_KEY);
}

function relayerBase(): string {
  // The same-origin Next proxy is the default. A public override is useful
  // only when hosting deliberately exposes the relayer with matching CORS.
  return process.env.NEXT_PUBLIC_RELAYER_URL || DEFAULT_BASE;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return { code: "INTERNAL", message: text || "invalid relayer response" }; }
}

export async function relayerRequest<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${relayerBase()}${path}`, { ...options, headers, credentials: "same-origin", cache: "no-store" });
  const body = await parseResponse(response);
  if (!response.ok) {
    const error = body as { message?: string; code?: string; retryable?: boolean };
    throw new RelayerRequestError(response.status, error?.code, `${error?.code ? `${error.code}: ` : ""}${error?.message || `relayer request failed (${response.status})`}`);
  }
  return body as T;
}

export async function createChallenge(address: string): Promise<{ message: string; expiresAt: number }> {
  return relayerRequest("/v1/auth/challenge", { method: "POST", body: JSON.stringify({ address }) });
}

export async function verifyChallenge(address: string, message: string, signature: string): Promise<Pick<StoredRelayerSession, "accessToken" | "expiresAt">> {
  return relayerRequest("/v1/auth/verify", { method: "POST", body: JSON.stringify({ address, message, signature }) });
}

export async function createDay(input: { clientRunId: string; scenario: Scenario; seed: string; viewerEvCharging: boolean }, accessToken: string) {
  return relayerRequest<{ dayId: string; status: ActionStatus; actions: readonly ChainAction[] }>("/v1/days", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export async function getCurrentDay(accessToken: string): Promise<{ day: RelayerDay | null; outcomes: readonly EpochOutcome[]; closeAction: ChainAction | null } & ApiEnvelope> {
  return relayerRequest("/v1/days/current", {}, accessToken);
}

export async function getDay(dayId: string, accessToken: string): Promise<DayResponse> {
  return relayerRequest(`/v1/days/${dayId}`, {}, accessToken);
}

export async function advanceEpoch(dayId: string, epochIndex: number, clientRequestId: string, accessToken: string): Promise<EpochOutcome & ApiEnvelope> {
  return relayerRequest(`/v1/days/${dayId}/epochs/${epochIndex}/advance`, { method: "POST", body: JSON.stringify({ clientRequestId }) }, accessToken);
}

export async function closeDay(dayId: string, clientRequestId: string, accessToken: string): Promise<{ dayId: string; status: ActionStatus; actions: readonly ChainAction[]; closeAction: ChainAction } & ApiEnvelope> {
  return relayerRequest(`/v1/days/${dayId}/close`, { method: "POST", body: JSON.stringify({ clientRequestId }) }, accessToken);
}

export async function getEvents(accessToken: string, cursor?: string, limit = 100) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  return relayerRequest<{ events: readonly Record<string, unknown>[]; nextCursor?: string } & ApiEnvelope>(`/v1/events?${query.toString()}`, {}, accessToken);
}

