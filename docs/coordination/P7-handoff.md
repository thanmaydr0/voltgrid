# P7 emergency state-machine handoff

Status: **local contract, relayer/API, and simulator gates passed** on 28 September 2026. No public deployment, testnet transaction, publish, commit, or push occurred. All edits stayed within the cross-cutting P7 authorization; existing changes from P1–P6 were preserved.

## Prerequisites and coordination

- P1–P5 pass status and signatures were checked in `docs/coordination/P1-handoff.md` through `P5-handoff.md`.
- P6's verified local integration evidence is `docs/evidence/INTEGRATION.md` (two confirmed normal days, 48 normal outcomes, accounting conservation). There is no separate `P6-handoff.md` in `docs/coordination/`.
- The implementation plan was read as reference. Frozen decisions/interface docs were read; the interface received only an additive P7 amendment for `EmergencyReportRecorded`. No function signatures or normal settlement events changed. P6 should incorporate/review this additive event in its integration record.

## Implementation

- `VoltGridMarket` restricts declaration/resolution to `GRID_OPERATOR_ROLE`, rejects ordinary settlement while an emergency is open, and requires one explicit report before resolution. It enforces registered/opted-in battery eligibility, per-report and cumulative per-day capacity, target remainder, uniqueness, and atomic treasury solvency. Opt-in is frozen while a day is active. A zero-discharge report can resolve with zero shaved Wh and zero payout. `EmergencyReportRecorded` aggregates every report, including an empty one; its totals are reconciled to individual `BatteryDischarged` events.
- sim-core remains deterministic and read-only with respect to physical inputs. It replays only prior confirmed battery-discharge records into modelled SoC; its default weather/sensor inputs remain unconnected model assumptions.
- The relayer regenerates readings from the server's day/seed/scenario/participant snapshot; clients still cannot submit authoritative readings. It clamps discharge candidates by replayed available energy, remaining registered capacity, and target remainder, then preflights the simulated treasury. Opt-out, no available modelled energy/capacity, and underfunding produce an explicit zero-discharge fallback. Tarif is configurable through `RELAYER_EMERGENCY_TARIFF_MICRO` and validated to the frozen 2,500,000–8,000,000 micro-VLT/kWh bounds.
- Emergency action metrics are assembled from successful receipt logs: declared target/tariff, report count and per-house Wh/payout, and resolved shaved Wh/aggregate payout. Missing expected events or mismatched aggregate logs cannot become confirmed metrics. The service advances the day only after resolution confirmation.
- The heatwave panel distinguishes preview, pending/reconciliation, reverted, and confirmed SOS states. It shows event-derived target/discharge/payout and actual report/declaration/resolution hash links only after those actions exist. Battery SoC is labelled preview-only; copy explicitly disclaims physical dispatch and a Neurick-board battery. The connected wallet can opt its registered simulated battery in/out before a day; the signature is a human-confirmed wallet transaction.
- Added aggregate report ABI to the relayer/shared ABI surfaces and an additive amendment to `docs/architecture/INTERFACE.md`. `packages/relayer/.env.example` now includes the tariff variable name with no value.

## HTTP shape

Existing P5 routes and authentication are unchanged. `POST /v1/days/:dayId/epochs/:epochIndex/advance` still returns a final `kind: "emergency"` outcome with three confirmed actions (`declareEmergency`, `reportDischarge`, `resolveEmergency`) once resolved. `metrics` is receipt-derived and includes `targetWh`, `tariffMicroVltPerKwh`, `shavedWh`, `payoutWei`, report/discharge count, and `discharges: [{ house, deliveredWh, payoutWei }]`. If opt-in, modelled energy, or treasury conditions prevent dispatch, the confirmed zero-report/resolve outcome carries `fallbackReason`; no positive shaved energy or payout is claimed. `GET /v1/events` includes the aggregate report and per-battery events. Pending/unknown outcomes are not labelled settled.

## Verification evidence

Commands run with the repository's existing npm installation (no install performed in P7):

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test --workspace=voltgrid-sim-core
# PASS 13/13
& 'C:\Program Files\nodejs\npm.cmd' test --workspace=contracts
# PASS 18 passing
& 'C:\Program Files\nodejs\npm.cmd' run typecheck --workspace=voltgrid-relayer
# PASS
& 'C:\Program Files\nodejs\npm.cmd' test --workspace=voltgrid-relayer
# PASS 9/9, includes sunny/rainy local chain days and the heatwave API/chain day
& 'C:\Program Files\nodejs\npm.cmd' run build --workspace=frontend
# PASS; Next production build emitted only the existing optional encoding/pino-pretty warnings
& 'C:\Program Files\nodejs\npm.cmd' run lint --workspace=frontend
# PASS, no ESLint warnings/errors
$env:Path = "C:\Program Files\nodejs;$env:Path"; & 'C:\Program Files\nodejs\npm.cmd' run build
# PASS, Turbo built sim-core, relayer, and frontend (3/3 tasks)
```

The captured standalone local heatwave evidence run used chain ID `31337`, market `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`, and day ID `0xa02cd15fdc4422f595266df6ccb68965d2981c50aa4aa5ae155a3ee67010f32a`. It produced 24 ordered confirmed outcomes: 18 normal and 6 emergency, with 3 positive-dispatch epochs (12,000 Wh / 90 VLT total) and 3 honest zero-discharge reports. It submitted 38 day-lifecycle transactions with 5,030,551 receipt gas. Concurrent retry calls reused original hashes; no duplicate final event appeared. Receipt hashes, blocks, payout summaries, custody/ledger checks, and the explicit local-only caveat are in `docs/evidence/EMERGENCY-LOCAL.md`.

The test separately re-ran full 24-hour sunny and rainy days. Contract and simulator tests cover authorization, strict 9,500-bps threshold, active-emergency normal-settlement rejection, zero-report requirement, duplicate report/resolve, unregistered/opted-out battery, capacity/target/daily budget, treasury insolvency, post-resolution settlement, deterministic replay, SoC and ledger/event conservation. Relayer tests cover auth/quota, forged readings, out-of-order calls, duplicate/concurrent calls, wrong chain, RPC timeout/unknown, reverted receipt, restart recovery, opted-out and underfunded fallbacks.

The dashboard was opened at `http://localhost:3001/`; its accessibility tree showed the preview-only emergency panel and safe disconnected/unconfigured state, with no hash or settled metric. The browser had no injected wallet. The full heatwave run exercised the authenticated local Node HTTP API and chain, but not a human browser wallet signature. Do not mark the wallet UI check as passed.

After P9 supplies P7-compatible verified deployment addresses (no such deployment was made here), the human wallet check is:

1. Configure the frontend with those verified addresses and the authorized relayer endpoint; confirm the wallet is on MST Testnet before proceeding.
2. Connect a supported injected wallet. Register a simulated house with a battery if the connected wallet does not own one, then click **Opt in battery dispatch** and approve the wallet transaction. Confirm the `BatteryOptInChanged` receipt and the UI's opted-in state before starting the day.
3. Choose **Heatwave evening**, set a seed, click **Play real day**, and approve the EIP-191 relayer-session signature. This is not a transaction; it must not expose a private key.
4. Observe each hour become confirmed only after the relayer receipt. At emergency hours verify the declaration, report, and resolution transactions; the payout and shaved-Wh metrics must equal `BatteryDischarged`, `EmergencyReportRecorded`, and `EmergencyResolved` logs. Follow only hashes returned by the app to the explorer.
5. Refresh during an in-flight emergency and resume. Confirm the same action hashes return and no second outcome is emitted. Complete epoch 23, close the day, and verify the `DayClosed` receipt.

This procedure remains pending until a human executes it against a P7 deployment. It is not an instruction to deploy during P7.

## P6/P9 follow-up and security/hosting tradeoffs

1. Before P9, choose role custody. The current relayer signer submits both oracle actions and emergency declarations, so deployment must deliberately grant that signer both `ORACLE_ROLE` and `GRID_OPERATOR_ROLE`, or P6/P9 must add a separate protected grid-operator signer. Contract authorization is always enforced; never place either key in frontend/public config or logs.
2. Confirm the shared simulated treasury has sufficient internal VLT for the bounded tariff and expected emergency dispatches. An underfunded treasury safely resolves with an empty report, but the target remains unmet.
3. The JSON state store and session/IP quotas are process-local. For the current single-process demo, keep one relayer instance on a persistent volume with exclusive oracle access. Before horizontal scaling, P6/P9 must move durable idempotency/quotas/nonces to a transactional shared store and coordinate signer locking.
4. P9 must configure TLS, exact origin allowlisting, trusted-proxy IP handling, auth/admin secret rotation, and explicit testnet chain/contract/role checks. Production mode fails closed for missing configuration. `RELAYER_EMERGENCY_TARIFF_MICRO` is bounded even when configured.
5. Public deployment, explorer receipts, actual utility dispatch, physical battery state, and Neurick telemetry remain unverified/not claimed. Keep the disconnected/offline path useful and honest until verified addresses and a human wallet test are available.

## Environment variable names only

`RELAYER_MODE`, `RELAYER_PORT`, `MST_RPC_URL`, `MST_CHAIN_ID`, `MARKET_ADDRESS`, `ORACLE_PRIVATE_KEY`, `RELAYER_DATA_PATH`, `RELAYER_ALLOWED_ORIGINS`, `RELAYER_ADMIN_SECRET`, `RELAYER_AUTH_SECRET`, `RELAYER_TRANSFORMER_CAPACITY_WH`, `RELAYER_EMERGENCY_TARIFF_MICRO`, `RELAYER_TRUST_PROXY`, `RELAYER_RECEIPT_TIMEOUT_MS`, `RELAYER_RECEIPT_POLL_MS`, `RELAYER_EVENT_LOOKBACK_BLOCKS`, `RELAYER_MAX_BODY_BYTES`, `RELAYER_MAX_ACTIONS_PER_SESSION`, `RELAYER_MAX_ACTIONS_PER_IP`, `RELAYER_MAX_AUTH_PER_IP`.

