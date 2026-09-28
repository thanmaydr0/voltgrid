export type Address = `0x${string}`;
export type DayId = `0x${string}`;
export type Scenario = "sunny" | "rainy" | "heatwave";
export type HouseKind = "solarBattery" | "solarOnly" | "ev" | "regular" | "viewer";
export type Reading = Readonly<{
    house: Address;
    generationWh: number;
    consumptionWh: number;
}>;
export type Discharge = Readonly<{
    house: Address;
    deliveredWh: number;
}>;
export type ModelledEmergencyDischarge = Readonly<Discharge & {
    epochIndex: number;
}>;
export type EmergencyFallbackReason = "no-opted-in-battery" | "no-modelled-energy" | "treasury-underfunded";
export type HouseConfig = Readonly<{
    address: Address;
    kind: HouseKind;
    hasSolar: boolean;
    hasBattery: boolean;
    batteryCapacityWh: number;
}>;
export type SimOutput = Readonly<{
    modelVersion: 1;
    source: "simulation";
    scenario: Scenario;
    seed: string;
    dayId: DayId;
    epochIndex: number;
    readings: readonly Reading[];
    eligibleEmergencyDischargeWh: readonly Discharge[];
    totalGenerationWh: number;
    totalConsumptionWh: number;
    transformerCapacityWh: number;
    stressBps: number;
    emergencyProposed: boolean;
    proposedTargetWh: number;
    previewPriceMicroVltPerKwh: number | null;
}>;
export type ActionName = "start" | "settle" | "declareEmergency" | "reportDischarge" | "resolveEmergency" | "closeDay";
export type ActionStatus = "pending" | "confirmed" | "reverted" | "unknown";
export type EpochKind = "normal" | "emergency";
export type ChainAction = Readonly<{
    action: ActionName;
    status: ActionStatus;
    txHash?: string;
    blockNumber?: string;
    contractAddress?: Address;
    errorCode?: string;
    nonce?: number;
    fallbackReason?: EmergencyFallbackReason;
    metrics?: ActionMetrics;
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
    discharges?: readonly Readonly<{
        house: Address;
        deliveredWh: number;
        payoutWei: string;
    }>[];
}>;
export type CarbonCertificateMetric = Readonly<{
    dayId: DayId;
    tokenId: string;
    solarSeller: Address;
    eligibleWh: number;
    factorGPerKwh: number;
    factorVersion: number;
    avoidedMgCo2e: string;
    txHash: string;
    blockNumber: number;
    logIndex: number;
    contractAddress: Address;
}>;
export type CarbonCloseMetrics = Readonly<{
    factorGPerKwh: number;
    factorVersion: number;
    totalEligibleWh: number;
    totalAvoidedMgCo2e: string;
    certificates: readonly CarbonCertificateMetric[];
}>;
export type ActionMetrics = EpochMetrics | CarbonCloseMetrics;
export type EpochOutcome = Readonly<{
    dayId: DayId;
    epochIndex: number;
    kind: EpochKind;
    status: ActionStatus;
    actions: readonly ChainAction[];
    metrics?: EpochMetrics;
    fallbackReason?: EmergencyFallbackReason;
}>;
export type ApiErrorCode = "UNAUTHORIZED" | "INVALID_INPUT" | "WRONG_CHAIN" | "BUSY" | "OUT_OF_ORDER" | "DUPLICATE_CONFLICT" | "RATE_LIMITED" | "RPC_UNAVAILABLE" | "RPC_TIMEOUT" | "REVERTED" | "MISSING_EXPECTED_LOG" | "NOT_FOUND" | "INTERNAL";
export type ApiErrorBody = Readonly<{
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    dayId?: string;
    epochIndex?: number;
}>;
export type OnChainHouse = Readonly<{
    address: Address;
    hasSolar: boolean;
    hasBattery: boolean;
    batteryCapacityWh: number;
    batteryOptedIn: boolean;
    registrationIndex: number;
}>;
export type OnChainDay = Readonly<{
    active: boolean;
    id: DayId;
    inputDigest: string;
    modelVersion: number;
    nextEpoch: number;
    emergencyActive: boolean;
    emergencyReported: boolean;
    emergencyTargetWh: number;
    emergencyTariffMicro: number;
}>;
export type ReceiptLog = Readonly<{
    address: Address;
    topics: readonly string[];
    data: string;
    index: number;
}>;
export type ChainReceipt = Readonly<{
    hash: string;
    status: number;
    blockNumber: number;
    logs: readonly ReceiptLog[];
}>;
export type SubmittedTransaction = Readonly<{
    hash: string;
    nonce?: number;
}>;
export type DecodedEvent = Readonly<{
    name: string;
    args: Readonly<Record<string, string | number | boolean>>;
    transactionHash: string;
    blockNumber: number;
    logIndex: number;
    address: Address;
}>;
export type EventPage = Readonly<{
    events: readonly DecodedEvent[];
    nextCursor?: string;
}>;
export type CreateDayInput = Readonly<{
    clientRunId: string;
    scenario: Scenario;
    seed: string;
    viewerEvCharging: boolean;
}>;
export type DayRecord = Readonly<{
    dayId: DayId;
    ownerAddress: Address;
    clientRunId: string;
    scenario: Scenario;
    seed: string;
    viewerEvCharging: boolean;
    modelVersion: 1;
    inputDigest: string;
    houses: readonly HouseConfig[];
    onChainHouses: readonly OnChainHouse[];
    transformerCapacityWh: number;
    status: "starting" | "active" | "closed" | "failed";
    nextEpoch: number;
    createdAt: number;
}>;
export type StoredAction = Readonly<{
    key: string;
    dayId: DayId;
    epochIndex: number;
    action: ActionName;
    status: ActionStatus;
    contractAddress: Address;
    txHash?: string;
    nonce?: number;
    blockNumber?: string;
    errorCode?: string;
    clientRequestId?: string;
    metrics?: EpochMetrics;
    fallbackReason?: EmergencyFallbackReason;
    updatedAt: number;
}>;
export type StoredRequest = Readonly<{
    clientRequestId: string;
    dayId: DayId;
    epochIndex: number;
    createdAt: number;
}>;
export type StoreState = Readonly<{
    schemaVersion: 1;
    days: Readonly<Record<string, DayRecord>>;
    actions: Readonly<Record<string, StoredAction>>;
    requests: Readonly<Record<string, StoredRequest>>;
}>;
export type AuthContext = Readonly<{
    address: Address;
    token: string;
    origin: string;
    ip: string;
}>;
export type RelayerConfig = Readonly<{
    mode: "local" | "production";
    rpcUrl: string;
    chainId: number;
    marketAddress: Address;
    oraclePrivateKey: string;
    dataPath: string;
    allowedOrigins: readonly string[];
    adminSecret: string;
    authSecret: string;
    transformerCapacityWh: number;
    emergencyTariffMicro: number;
    trustProxy: boolean;
    requireOrigin: boolean;
    maxBodyBytes: number;
    sessionTtlMs: number;
    receiptTimeoutMs: number;
    receiptPollMs: number;
    eventLookbackBlocks: number;
    maxActionsPerSession: number;
    maxActionsPerIp: number;
    maxAuthPerIp: number;
}>;
export type SimulatedEpoch = Readonly<{
    output: SimOutput;
    readings: readonly Reading[];
    discharges: readonly Discharge[];
    fallbackReason?: EmergencyFallbackReason;
}>;
