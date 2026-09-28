# P5 relayer handoff

Status: **P5 local gate passed** on 28 September 2026. The relayer is
implemented only under `packages/relayer/**`; this handoff is the only other
file changed by P5. No package was installed, committed, deployed, or pushed.

## Implementation

The package is a Node/TypeScript relayer using ethers v6 and a vendor-neutral
HTTP router. It has an Express adapter plus a built-in Node HTTP fallback so
the checked-in local tests do not require a package install. The oracle key is
loaded only by the server configuration and is never returned or logged.

The server loads the P2 simulator through `voltgrid-sim-core`, with a
source-only fallback for this shared checkout. A stored day contains the
scenario, seed, model version, registered-house map, transformer capacity,
and a cryptographically generated day ID. Each advance request regenerates
the hour's integer-Wh readings from those values; client readings,
generation, and consumption fields are rejected and cannot become
authoritative. The persisted day ID is passed into the simulator so a
resume reproduces the same model output.

Normal epochs submit `settleEpoch` and require a successful receipt containing
`EpochSettled`. Emergency epochs submit `declareEmergency`, one discharge
batch, and `resolveEmergency`; the latter must contain `EmergencyResolved`
before the epoch advances. The relayer never returns `confirmed` or
`settled` without receipt status 1 and the expected event. Receipt metrics
are decoded from the actual ABI logs, not copied from the simulation preview.

The `EthersChainClient` uses the P1 ABI fragments, checks the configured chain
ID, serializes all sends through one oracle queue, uses a nonce manager, and
refreshes the nonce once for stale-nonce errors. Receipt hashes, nonces,
block numbers, contract address, status, and decoded event-derived metrics
are retained in the action records. Unknown/pending actions are reconciled by
transaction hash or bounded day/epoch event lookup before any future send.

Persistence is provided by `RunStore`, `JsonRunStore`, and `MemoryRunStore`.
The JSON store uses a process mutex, mode-0600 files, and atomic temporary
file replacement. Durable action state is `pending`, `confirmed`,
`reverted`, or `unknown`; action keys are deployment-scoped
`dayId|epoch|action`, while the configured chain ID and market address define
the store's deployment namespace. Client UUIDs are separately bound to a
day/epoch and conflicting reuse returns `DUPLICATE_CONFLICT`.

## HTTP contract

Every successful response includes `chainId`, `marketAddress`, and
`modelVersion`. State-changing routes require the short-lived bearer session
described below.

| Method and path | Behavior |
| --- | --- |
| `POST /v1/auth/challenge` | Creates an origin/IP-bound EIP-191 challenge for `{address}`. |
| `POST /v1/auth/verify` | Verifies `{address,message,signature}` and returns a short-lived bearer token. |
| `POST /v1/days` | Accepts only `{clientRunId,scenario,seed,viewerEvCharging}`; starts a fresh day or returns the idempotent existing start action. |
| `GET /v1/days/current` | Returns the latest owned run and outcome summaries without sending a transaction. |
| `GET /v1/days/:dayId` | Returns persisted day state and completed outcome summaries. |
| `POST /v1/days/:dayId/epochs/:epochIndex/advance` | Accepts only `{clientRequestId}` and runs the normal or emergency lifecycle for that exact next epoch. |
| `GET /v1/days/:dayId/epochs/:epochIndex` | Returns action state and confirmed receipt-derived metrics. |
| `POST /v1/days/:dayId/close` | Accepts only `{clientRequestId}` and closes after all 24 outcomes are confirmed. |
| `GET /v1/events?cursor=&limit=` | Returns decoded confirmed market logs with bounded cursor pagination (`1..100`). |
| `POST /v1/admin/reset` | Requires the configured admin secret and an allowlisted origin; resets sessions or inactive demo state. |

Confirmed action responses include the actual `txHash`, `blockNumber`, and
`contractAddress`. Pending and unknown results use HTTP 202; reverted results
use HTTP 409; no status is upgraded based on a client claim. RPC/network
failures are surfaced as retryable `RPC_UNAVAILABLE`/`RPC_TIMEOUT` states.

Authentication signs a server challenge containing origin, address, chain ID,
nonce, and expiry. Tokens are HMAC-hashed at rest and bound to the issuing
origin. Production requires an allowlisted origin; the router also handles
CORS preflight, body-size limits, strict JSON payloads, same-origin checks for
state changes, per-session quotas, per-IP quotas, and per-IP auth quotas.
The admin reset is server-side only. No endpoint accepts a private key.

## Environment variable names

Values are intentionally omitted here and in `.env.example`.

`RELAYER_MODE`, `RELAYER_PORT`, `MST_RPC_URL`, `MST_CHAIN_ID`,
`MARKET_ADDRESS`, `ORACLE_PRIVATE_KEY`, `RELAYER_DATA_PATH`,
`RELAYER_ALLOWED_ORIGINS`, `RELAYER_ADMIN_SECRET`, `RELAYER_AUTH_SECRET`,
`RELAYER_TRANSFORMER_CAPACITY_WH`, `RELAYER_TRUST_PROXY`,
`RELAYER_RECEIPT_TIMEOUT_MS`, `RELAYER_RECEIPT_POLL_MS`,
`RELAYER_EVENT_LOOKBACK_BLOCKS`, `RELAYER_MAX_BODY_BYTES`,
`RELAYER_MAX_ACTIONS_PER_SESSION`, `RELAYER_MAX_ACTIONS_PER_IP`,
`RELAYER_MAX_AUTH_PER_IP`.

Production mode fails closed when its RPC URL, chain ID, market address,
oracle key, origin allowlist, admin secret, or auth secret is absent or
invalid. Local mode defaults to the local Hardhat RPC/chain ID but still
requires a configured market address and oracle key.

## Exported API

`packages/relayer/src/index.ts` exports:

- `EthersChainClient`, `ChainClient`, `eventMetrics` and ABI fragments;
- `RelayerService`, deterministic server orchestration, and action/state
  types;
- `RelayerHttpRouter`, `createNodeServer`, and `createExpressApp`;
- `AuthManager`, `loadConfig`, `HttpError`;
- `JsonRunStore`, `MemoryRunStore`, and `RunStore`;
- the frozen API/receipt/event/day/config TypeScript types.

## Verification commands and results

Run from `packages/relayer` after dependencies are already present:

```powershell
& ..\..\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.test.json
# PASS

node --require ts-node/register --test --test-reporter=spec test/**/*.test.ts
# PASS: 7/7 tests (6 service/router tests plus the local-chain integration)

& ..\..\node_modules\.bin\tsc.cmd -p tsconfig.json
# PASS: package build and declarations

node --require ts-node/register --test --test-reporter=spec test/local.integration.test.ts
# PASS: Hardhat node + in-memory P1 ABI deployment; 24 confirmed normal
#       EpochSettled outcomes, 0 EmergencyResolved outcomes, and no new
#       event after a duplicate epoch retry
```

The integration test starts a temporary Hardhat node, reads the existing P1
artifacts, deploys token/market in memory, seeds eight houses, and exercises
the real `EthersChainClient`. It does not run a deployment script or write a
contract deployment record. It asserts actual receipt status, transaction
hashes, block numbers, contract address, decoded `EpochSettled` metrics,
bounded event pagination, and no duplicate epoch transaction. The test uses a
temporary system directory and removes its state in `finally`.

The six non-chain tests cover a valid 24-hour sequence, duplicate and
concurrent POSTs, out-of-order requests, forged readings, unauthenticated
requests, quotas, wrong chain ID, timeout/unknown receipts, reverts, durable
restart reconciliation, and no duplicate transaction after retry. P2 owns
the independent simulator checks for repeated serialization across sunny,
rainy, and heatwave seeds, integer/bound validation, night solar, battery
SoC, overload/emergency threshold, and `Reading`/`Discharge` compatibility.

## P6/P9 requests and tradeoffs

1. Reconcile `packages/relayer/package.json` and `packages/sim-core` with the
   normal workspace install and lockfile. The implementation intentionally
   did not install `express`, update the lockfile, or edit root workspace
   configuration. The current wildcard workspace should discover the package;
   if the integration environment does not, P6 owns the root registration.
2. Provide the confirmed deployed market address and ABI export through the
   existing shared integration path. The relayer must use a server-only
   oracle key that has the required P1 oracle/grid-operator roles; do not put
   it in Next.js or public configuration.
3. The JSON store is appropriate for one relayer process on a persistent
   volume and is atomic at the file boundary, but it is not a multi-instance
   transactional database. P6/P9 must choose a locked single-host deployment
   or replace `RunStore` with SQLite/Postgres and a distributed quota/nonce
   strategy before horizontal scaling.
4. P9 must terminate TLS, preserve the real client IP only behind a trusted
   proxy, keep the origin allowlist exact, rotate the admin/auth secrets, and
   protect the reset route. Quotas are process-local in this v1 implementation
   and therefore need a shared limiter for multiple instances.
5. The local normal-day gate uses a high transformer capacity so all 24
   epochs are normal. P6/P9 should add a funded emergency-role fixture and
   confirm treasury liquidity before demonstrating heatwave emergency payouts
   on a shared deployment.
