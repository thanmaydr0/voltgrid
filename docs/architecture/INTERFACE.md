# VoltGrid frozen interface v1

This file is the P1–P4 coordination contract. It specifies observable behavior and names; code is implemented in owned packages. A change requires a note in `docs/coordination/` and P6 approval. `DECISIONS.md` explains the rationale and worked accounting example.

P7 additive amendment (28 September 2026): the contract and relayer now emit/require `EmergencyReportRecorded` for every emergency report, including an empty fallback report. It aggregates and reconciles the associated `BatteryDischarged` logs before resolution. No existing v1 function signature or normal-day event shape changed; see `docs/coordination/P7-handoff.md` and `docs/evidence/EMERGENCY-LOCAL.md`.

P8 additive amendment (28 September 2026): day close atomically mints at most one ERC-721 per solar seller, using only that seller's cumulative confirmed `TradeSettled.wh` allocation. The existing `CertificateMinted` shape is unchanged. `CarbonFactorApplied` adds the factor-version snapshot to the close receipt; `setCarbonCertificate` is a one-time deployment binding because the market and certificate addresses are created sequentially. The 700 gCO2e/kWh default remains an explicitly unverified, configurable modelling assumption; no offset/credit claim is made. See `docs/coordination/P8-handoff.md`.

## Identity, units and limits

| Name | Type | Rule |
|---|---|---|
| `dayId` | Solidity `bytes32`; TS `0x` + 64 hex chars | `keccak256(chainId, marketAddress, fresh run UUID)`. A replay uses a new UUID/day ID; resume reuses the saved ID. |
| `epochIndex` | Solidity `uint8`; TS integer | 0 through 23, finalized strictly in ascending order. |
| `generationWh`, `consumptionWh`, `deliveredWh`, `targetWh` | Solidity `uint32`; TS safe integer | Nonnegative whole Wh. Per-house generation/consumption <= 100,000 Wh per epoch. |
| `priceMicroVltPerKwh` and tariff/fee analogues | Solidity `uint64`; TS integer or decimal string over JSON | One million = 1 VLT/kWh. Default 5,000,000. All on-chain math uses `uint256` intermediates. |
| `amountWei` | Solidity `uint256`; JSON decimal string | VLT has 18 decimals; `wh * priceMicroVltPerKwh * 1_000_000_000`. |
| `factorGPerKwh` | Solidity `uint32`; TS integer | Labelled model assumption. Snapshot at day start. |
| `avoidedMgCo2e` | Solidity `uint256`; JSON decimal string | `eligibleWh * factorGPerKwh`, exact integer milligrams. |
| `stressBps` | TS integer | `floor(totalConsumptionWh * 10_000 / transformerCapacityWh)`; overload threshold 9,500 BPS, strictly `> 9,500` triggers proposal. |
| `MAX_HOUSES` | constant | 16 registered addresses, target demo 8 seeded + 1 judge. |

Default model tariffs and price curve are in `DECISIONS.md`. `ratioBps` and curve interpolation floor at each integer division. Reject zero house address, duplicate registration/readings, invalid or unregistered house, out-of-range Wh, wrong length/order, wrong day/hour, and spending beyond internal balances. All public numeric JSON inputs must be validated before conversion to `bigint`.

Hard bounds: `MAX_HOUSES=16`; generation/consumption and registered battery capacity each <=100,000 Wh; emergency target <=1,600,000 Wh. Immutable model feed/retail are 2,500,000/8,000,000 micro-VLT/kWh. Owner-set floor/base/cap must satisfy `3,000,000 <= floor <= base <= cap <= 7,000,000`; fee `0..420,000`, with `feed + fee < floor`. Emergency tariff is `2,500,000..8,000,000`. Carbon factor is `1..2,000 gCO2e/kWh` with positive version. If `matchedWh=0`, `EpochSettled.priceMicro=0` (no P2P price occurred) and the UI displays no settled P2P price for that hour.

## Solidity records and required callable surface

These are **target signatures** for P1/P7/P8. P1 implements the normal core; P7 and P8 add the named optional feature groups without breaking the normal core. Keep exact external ABI names and field order unless P6 accepts a documented change.

```solidity
struct Reading {
    address house;
    uint32 generationWh;
    uint32 consumptionWh;
}
struct Discharge {
    address house;
    uint32 deliveredWh;
}

// VoltToken (ERC-20, name VoltCredit, symbol VLT, decimals 18)
function mint(address to, uint256 amountWei) external; // MINTER_ROLE
function faucet() external; // fixed 100 VLT, <= once per address per 24h

// VoltGridMarket: P1 normal core
function registerHouse(bool hasSolar, bool hasBattery, uint32 batteryCapacityWh) external;
function registerHouseFor(address house, bool hasSolar, bool hasBattery, uint32 batteryCapacityWh) external; // REGISTRAR_ROLE
function deposit(uint256 amountWei) external;
function depositFor(address house, uint256 amountWei) external; // SEEDER_ROLE; transferFrom(msg.sender), credit house
function withdraw(uint256 amountWei) external; // self only
function fundTreasury(uint256 amountWei) external; // transferFrom(msg.sender), credit treasury
function withdrawTreasury(uint256 amountWei) external; // treasury address only
function setBatteryOptIn(bool optedIn) external; // self only
function setPricingParams(uint64 floorMicro, uint64 baseMicro, uint64 capMicro, uint64 feeMicro) external; // owner, hard bounded
function startDay(bytes32 dayId, bytes32 inputDigest, uint32 modelVersion) external; // ORACLE_ROLE
function settleEpoch(bytes32 dayId, uint8 epochIndex, Reading[] calldata readings) external; // ORACLE_ROLE
function closeDay(bytes32 dayId) external; // ORACLE_ROLE, after 24 outcomes; P8 extends with mint
function setCarbonCertificate(address certificate) external; // owner, one-time, before a day starts; contract must be bound to this market
function eligibleWh(bytes32 dayId, address solarSeller) external view returns (uint32);

// P7 emergency extension
function declareEmergency(bytes32 dayId, uint8 epochIndex, uint32 targetWh, uint64 tariffMicro) external; // GRID_OPERATOR_ROLE
function reportDischarge(bytes32 dayId, uint8 epochIndex, Discharge[] calldata discharges) external; // ORACLE_ROLE; at most one batch
function resolveEmergency(bytes32 dayId, uint8 epochIndex) external; // GRID_OPERATOR_ROLE

// P8 carbon extension
function setCarbonFactor(uint32 factorGPerKwh, uint32 factorVersion) external; // owner; future days only
function mint(address solarSeller, bytes32 dayId, uint32 eligibleWh, uint32 factorGPerKwh, uint32 factorVersion) external returns (uint256 tokenId); // on CarbonCertificate; configured market only
function retire(uint256 tokenId) external; // on CarbonCertificate; owner ONLY
function retired(uint256 tokenId) external view returns (bool); // on CarbonCertificate
function certificateData(uint256 tokenId) external view returns (bytes32 dayId, uint32 eligibleWh, uint32 factorGPerKwh, uint32 factorVersion, uint256 avoidedMgCo2e);
function tokenURI(uint256 tokenId) external view returns (string memory); // on-chain base64 JSON and SVG
```

`setBatteryOptIn` is available in the core so the wallet panel can be built early, but it causes no dispatch until P7. `registerHouse` is allowed only between days; one day is active at a time, with its participant order and relevant parameter snapshot fixed at start. Registration is append-only in v1. `batteryCapacityWh=0` when `hasBattery=false`; opt-in requires a battery. `hasSolar=false` forces generation to zero in settlement. `closeDay` exists in P1 even before certificates; it seals the accounting day. P8 adds minting to the same atomic close path and must preserve idempotency. A P8 day cannot start until the one-time certificate/market binding is configured; a missing binding fails closed. If a contract redeploy is necessary for P7/P8, update ABI and deployment evidence at P9; do not pretend older testnet addresses implement new code.

`depositFor` pulls the seeder's own allowance and credits the target, so it cannot debit another wallet. `fundTreasury` similarly pulls the caller's allowance. All withdrawals decrease internal balance before ERC-20 transfer and use reentrancy protection. Normal settlement is atomic: failure in buyer funds, treasury export liquidity, or any validation reverts the whole hour. `sum(internal balances)` is conserved during settlement. Market token custody is at least total internal balance, with direct unsolicited token transfers not counted as a credit. Token mint/faucet changes token supply, not settlement conservation.

## Epoch and day state machine

```text
No active day --startDay--> Active(epoch 0, Open)
Open --settleEpoch--> NormalSettled --> Active(next epoch, Open)
Open --declareEmergency--> EmergencyDeclared
EmergencyDeclared --reportDischarge (0 or 1 batch)--> EmergencyReported
EmergencyDeclared/EmergencyReported --resolveEmergency--> EmergencyResolved --> Active(next epoch, Open)
After epoch 23 finalizes --closeDay--> Closed (new day may start)
```

`settleEpoch` requires the active day and exact next `epochIndex`, no declaration in progress, and one `Reading` per registered house in registration order. No same hour can be finalized twice. `declareEmergency` requires the active next hour, positive target and bounded tariff. `reportDischarge` requires distinct registered, opted-in battery houses, a positive delivery per listed house, no more than each house's capacity and remaining daily budget, and no more than remaining target. The modelled SoC is an oracle claim; contract checks the conservative day budget initialized from registered capacity at day start. `resolveEmergency` may resolve with 0 Wh if no valid battery responds, but then the UI says the target was unmet. It increments the epoch exactly once. `closeDay` requires all 24 finalized outcomes and can run once. P1/P6 can run ordinary days before the emergency extension exists.

### Integer energy allocation

For each house, `surplus=max(generation-consumption,0)` and `deficit=max(consumption-generation,0)`. `matched=min(sum(surplus),sum(deficit))`. Compute seller quotas and buyer quotas using Hamilton/largest-remainder allocation: floor `matched*individual/sideTotal`; give remaining 1 Wh units by descending remainder, ties by registration index. Both quota sums must equal `matched`. Pair positive quotas in registration order; each emitted `TradeSettled` represents a real integer flow. Total sold = total bought = matched. Export/import are the unmatched Wh; only one of export/import can be nonzero in an epoch. This differs from the implementation plan's fractional pairwise formula to avoid unrepresentable Wh and fictitious dust. Money accounting and numeric example are frozen in `DECISIONS.md`.

## Required events (exact names and fields)

Index at most three event parameters. Implementations may add events, but these fields must remain decodable by P5/P6.

```solidity
event HouseRegistered(address indexed house, bool hasSolar, bool hasBattery, uint32 batteryCapacityWh);
event Deposited(address indexed payer, address indexed house, uint256 amountWei);
event Withdrawn(address indexed house, uint256 amountWei);
event TreasuryFunded(address indexed payer, uint256 amountWei);
event TreasuryWithdrawn(address indexed treasury, uint256 amountWei);
event BatteryOptInChanged(address indexed house, bool optedIn);
event PricingParamsChanged(uint64 floorMicro, uint64 baseMicro, uint64 capMicro, uint64 feeMicro);
event DayStarted(bytes32 indexed dayId, bytes32 inputDigest, uint32 modelVersion);
event TradeSettled(bytes32 indexed dayId, uint8 indexed epochIndex, address indexed seller, address buyer, uint32 wh, uint64 priceMicro, uint256 grossWei, uint256 feeWei);
event GridExportSettled(bytes32 indexed dayId, uint8 indexed epochIndex, address indexed seller, uint32 wh, uint256 amountWei);
event GridImportSettled(bytes32 indexed dayId, uint8 indexed epochIndex, address indexed buyer, uint32 wh, uint256 amountWei);
event EpochSettled(bytes32 indexed dayId, uint8 indexed epochIndex, uint64 priceMicro, uint32 matchedWh, uint32 exportedWh, uint32 importedWh, uint256 feesWei);
event EmergencyDeclared(bytes32 indexed dayId, uint8 indexed epochIndex, uint32 targetWh, uint64 tariffMicro);
event BatteryDischarged(bytes32 indexed dayId, uint8 indexed epochIndex, address indexed house, uint32 deliveredWh, uint256 payoutWei);
event EmergencyReportRecorded(bytes32 indexed dayId, uint8 indexed epochIndex, uint32 deliveredWh, uint256 payoutWei, uint8 dischargeCount);
event EmergencyResolved(bytes32 indexed dayId, uint8 indexed epochIndex, uint32 targetWh, uint32 shavedWh, uint256 payoutWei);
event DayClosed(bytes32 indexed dayId);
event CertificateMinted(bytes32 indexed dayId, address indexed solarSeller, uint256 indexed tokenId, uint32 eligibleWh, uint32 factorGPerKwh, uint256 avoidedMgCo2e);
event CertificateRetired(uint256 indexed tokenId, address indexed owner);
event CarbonFactorApplied(bytes32 indexed dayId, uint32 factorGPerKwh, uint32 factorVersion);
```

For every `EpochSettled`, `sum(TradeSettled.wh) == matchedWh`, `sum(GridExportSettled.wh) == exportedWh`, and `sum(GridImportSettled.wh) == importedWh`; price/fees and balances reconcile exactly. Emergency events have no `TradeSettled` for that day/hour. `EmergencyReportRecorded` is emitted exactly once for every emergency report, including a zero-discharge report, and its totals/count must equal the associated `BatteryDischarged` logs. Resolution requires this report event; `EmergencyResolved.shavedWh` and `payoutWei` equal the report totals. `DayClosed` appears once. P8's certificate contract may emit the standard ERC-721 `Transfer` event as well.

P8 carbon accounting is deliberately seller-only: the market increments `eligibleWh[dayId][seller]` by each positive matched `TradeSettled.wh` (seller marginal), never by buyer shares, grid export/import, or emergency events. The day snapshots factor and monotonically increasing factor version at `startDay`; `closeDay` emits one `CarbonFactorApplied`, mints one token per seller with nonzero eligible Wh, emits the existing `CertificateMinted` event for each token, then emits `DayClosed` in the same transaction. A failure during any mint reverts the entire close. Zero-eligible days close without a token. The NFT stores immutable day ID, Wh, factor, factor version, and `eligibleWh * factorGPerKwh = avoidedMgCo2e`; its JSON/SVG is generated on chain. The source string explicitly says configurable modelling assumption/no primary source verified. Only the current ERC-721 owner may irreversibly retire; transfers after retirement revert. Admin binding and factor updates are disabled during an active day; factor versions must increase. Contract close itself rejects another call after closing; the idempotent relayer returns the original receipt instead of resubmitting.

## Simulator API for P2

Pure function, no I/O or implicit time/randomness:

```ts
type Scenario = "sunny" | "rainy" | "heatwave";
type HouseKind = "solarBattery" | "solarOnly" | "ev" | "regular" | "viewer";
type HouseConfig = {
  address: `0x${string}`; kind: HouseKind; hasSolar: boolean;
  hasBattery: boolean; batteryCapacityWh: number;
};
type SimInput = {
  modelVersion: 1; scenario: Scenario; seed: string; epochIndex: number;
  houses: readonly HouseConfig[]; transformerCapacityWh: number;
  viewerEvCharging: boolean;
};
type SimOutput = {
  modelVersion: 1; source: "simulation"; scenario: Scenario; seed: string;
  epochIndex: number; readings: readonly {
    house: `0x${string}`; generationWh: number; consumptionWh: number;
  }[];
  batteryAvailableWh: readonly { house: `0x${string}`; availableWh: number }[];
  totalGenerationWh: number; totalConsumptionWh: number;
  transformerCapacityWh: number; stressBps: number;
  emergencyProposed: boolean; proposedTargetWh: number;
  previewPriceMicroVltPerKwh: number | null;
};
function simulateEpoch(input: SimInput): SimOutput;
```

The run's seed/scenario/house map is stored by the relayer. P2 must provide a deterministic day generator or helper so 24 hours can be reproduced. `readings` order equals registration order. All numbers fit TS safe integers and contract bounds. Battery available energy is **modelled** and cumulative across the day; P7 must not treat it as board battery voltage. An optional future observation adapter can produce separate weather/location metadata, never measured household Wh without a new trusted meter and explicit review.

## Relayer HTTP contract for P5/P6

JSON uses decimal strings for values that might exceed JS safe integers. Every response carries `chainId: 91562037`, `marketAddress` once deployed, and `modelVersion: 1`. No endpoint accepts a private key or raw `Reading[]` from the browser. Protected endpoints require a short-lived bearer session obtained from a wallet-signed nonce with domain, address, chain ID and expiry; allowlist the frontend origin and rate-limit wallet/IP/day. No public request may run a mainnet transaction.

| Method/path | Input | Successful output / behavior |
|---|---|---|
| `POST /v1/auth/challenge` | `{address}` | `{nonce,message,expiresAt}`; rate limited. |
| `POST /v1/auth/verify` | `{address,message,signature}` | `{accessToken,expiresAt}` after signature/nonce/domain validation. |
| `POST /v1/days` | `{clientRunId,scenario,seed,viewerEvCharging}` | Idempotently creates and starts a **new** day; returns `{dayId,status,actions}`. Same wallet + `clientRunId` returns same day. |
| `GET /v1/days/current` | bearer | Latest owned run for refresh/resume; no new tx. |
| `GET /v1/days/:dayId` | bearer | Day state, next epoch, scenario/seed/model version and confirmed outcome summaries. |
| `POST /v1/days/:dayId/epochs/:epochIndex/advance` | `{clientRequestId}` | One normal settlement (P5) or P7 emergency lifecycle; `202 pending` until confirmed, `200 confirmed` when all actions have successful receipts. |
| `GET /v1/days/:dayId/epochs/:epochIndex` | bearer | Pending/confirmed/reverted/unknown action records and event-derived metrics. |
| `POST /v1/days/:dayId/close` | `{clientRequestId}` | Idempotent day close; P8 includes mint records. |
| `GET /v1/events?cursor=...&limit=...` | bearer or bounded public read | Cursor-paginated confirmed decoded logs only; never fabricate transaction data. |

`clientRunId` and `clientRequestId` are UUIDs generated by the browser and persisted for retries. The server's durable unique key is `(chainId,marketAddress,dayId,epochIndex,action)`, not just the client UUID. Duplicates return the saved pending/confirmed record and hash; mismatched inputs for an existing ID return `409 DUPLICATE_CONFLICT`. At most one oracle send runs at a time. On timeout or restart, reconcile transaction hash/nonce and chain events before re-sending. A failed receipt is `reverted`, not `confirmed`. Metrics are absent or `null` while pending; they are decoded from expected market logs after receipt status 1.

```ts
type ActionStatus = "pending" | "confirmed" | "reverted" | "unknown";
type ChainAction = {
  action: "start" | "settle" | "declareEmergency" | "reportDischarge" |
          "resolveEmergency" | "closeDay";
  status: ActionStatus; txHash?: `0x${string}`; blockNumber?: string;
  contractAddress?: `0x${string}`; errorCode?: string;
};
type EpochOutcome = {
  dayId: `0x${string}`; epochIndex: number; kind: "normal" | "emergency";
  status: ActionStatus; actions: ChainAction[];
  metrics?: { // only when confirmed; every field from logs
    priceMicroVltPerKwh?: string; matchedWh?: number; exportedWh?: number;
    importedWh?: number; feesWei?: string; shavedWh?: number;
    payoutWei?: string;
  };
};
type ApiError = {
  code: "UNAUTHORIZED" | "INVALID_INPUT" | "WRONG_CHAIN" | "OUT_OF_ORDER" |
        "DUPLICATE_CONFLICT" | "NOT_FUNDED" | "RATE_LIMITED" |
        "BUSY" | "RPC_UNAVAILABLE" | "REVERTED" | "INTERNAL";
  message: string; retryable: boolean; dayId?: string; epochIndex?: number;
};
```

Use 4xx for client/auth/state errors, 429 for rate limit, 503 for temporary RPC failure. Errors do not expose private keys, full signatures, connection strings or internals. `unknown` is a real operational state: display it and reconcile rather than declaring success or blindly resubmitting.

Only one shared day is active at once in v1. A different wallet attempting to start another day before close receives `409 BUSY` with no gas-spending action; read-only progress may still be shown. This demo capacity limit must be visible in the UI.

## Frontend provenance contract for P3/P6

```ts
type Provenance =
  | { kind: "model-preview"; modelVersion: 1; scenario: Scenario; seed: string; epochIndex: number }
  | { kind: "sensor-observation"; deviceId: string; observedAt: string; quality: "valid" | "stale" | "invalid" }
  | { kind: "chain-pending"; chainId: 91562037; dayId: string; txHash?: string }
  | { kind: "chain-confirmed"; chainId: 91562037; dayId: string; txHash: string; blockNumber: string; logIndex: number }
  | { kind: "unavailable"; reason: string };
```

The dashboard can show a model preview before a tx, but its caption and visual treatment must differ from settled values. Confirmed values must be derived from receipt/logs. A `chain-pending` tx may have an explorer link to its actual hash but no settled assertion. A sensor observation only describes that sensor's own quantity, not Wh. Never source a live feed from hard-coded hashes. Wallet discovery uses wagmi injected/EIP-6963 where supported; BridgeKey name/behavior must be confirmed in an actual extension test. Restrict the product network to testnet; do not offer a mainnet switch. Optional WalletConnect requires a user-provided project ID in a public config value, not a secret key.

## Deployment artifact and receipt proof

P6 may adapt the starter's cross-package writer. P9 emits `deployments/testnet.json` **only from successful real receipts**, with no placeholders and no secrets:

```json
{
  "schemaVersion": 1,
  "chainId": 91562037,
  "network": "mst-testnet",
  "explorerBaseUrl": "https://testnet.mstscan.com",
  "contracts": {
    "VoltToken": { "address": "<real address>", "deployTxHash": "<real hash>", "blockNumber": "<decimal string>" },
    "VoltGridMarket": { "address": "<real address>", "deployTxHash": "<real hash>", "blockNumber": "<decimal string>" },
    "CarbonCertificate": { "address": "<real address if shipped>", "deployTxHash": "<real hash>", "blockNumber": "<decimal string>" }
  }
}
```

Angle-bracket entries above describe **schema only**. Do not commit such placeholders as deployed data. Omit a feature contract not shipped. Generated ABIs and a typed address map live in `packages/shared`; deployment code must not overwrite parallel changes. A proof record requires `eth_getTransactionReceipt.status == 1`, matching `chainId`/contract address, expected decoded logs and an opening MSTScan link. A read-only RPC response and marketing EVM claim do not prove Solidity compiler compatibility.
