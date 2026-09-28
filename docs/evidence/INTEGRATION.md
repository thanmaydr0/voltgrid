# VoltGrid integration evidence

Date: 2026-09-28  
Workspace: `C:\thanmay\mst\voltgrid`  
Scope: local integration only. No testnet deployment, push, commit, or mainnet operation was performed.

## Gate confirmation

The coordination notes were read before integration: `DECISIONS.md`, `INTERFACE.md`, the implementation plan as reference, and every `docs/coordination/*-handoff.md`.

| Gate | Evidence from handoff / verification |
| --- | --- |
| P1 contracts | PASS reported in `P1-handoff.md`; local contract tests and compile were rerun by the root gate. |
| P2 simulator | PASS reported in `P2-handoff.md`; 11 simulator tests pass, including repeated serialization, all scenarios, 24 epochs, integer bounds, battery limits, heatwave threshold and ABI-compatible Reading/Discharge shapes. |
| P3 frontend shell | PASS as the deterministic fixture shell; this phase replaces its fixture formulas with the real sim-core adapter and preserves the explicit disconnected/unavailable state. |
| P4 evidence | Baseline evidence and source ledger read. No P4 evidence was promoted to live-chain evidence. |
| P5 relayer | PASS reported in `P5-handoff.md`; the relayer suite now includes the two-day local receipt integration described below. |

The only active Codex thread during this work was the current integration thread; the earlier sim-core thread was contacted and no shared-file conflict was observed.

## Implemented integration

- The dashboard preview calls `voltgrid-sim-core` directly. Preview values carry a `preview simulation` status and are never sent as readings.
- `Play real day` authenticates with a wallet signature, sends only `{ clientRunId, scenario, seed, viewerEvCharging }`, persists the server-issued day ID and one request UUID per epoch, and advances only the server-regenerated epoch.
- Refresh/resume reads the owner’s current relayer day and outcomes. Unknown or pending receipts stop automatic advancement and retry the same request ID; duplicate clicks therefore reconcile rather than submit another epoch.
- The relayer response is the source for displayed confirmed metrics. `TxFeed` renders only returned transaction hashes, block numbers and event-derived metrics. The UI has no hard-coded transaction hash.
- The final close is a separate idempotent receipt-backed action after 24 confirmed outcomes.
- Shared browser ABIs cover the actual VoltToken faucet/balance/allowance/approval/event surface and the actual market registration, deposit, withdrawal, internal-balance, house, battery-opt-in and event surface. Address configuration is empty-by-default and disables writes until verified addresses are supplied.
- Wallet writes use the generic injected/EIP-6963 route, check MST Testnet (`91562037`), wait for receipts and show explorer links only for actual hashes. No proprietary BridgeKey API or private key is assumed.
- The same-origin `/api/relayer` proxy forwards the frozen relayer routes without putting the oracle key in browser code or logs.

No frozen interface or decision text required a semantic change: the proxy is only same-origin transport, and the browser uses the existing relayer request/receipt contract. The additional `registerHouse` ABI fragment mirrors the actual P1 contract and is used only for the optional connected-user house flow.

## Commands and results

Dependencies were installed once with the repository’s declared npm workspace setup:

```text
& 'C:\Program Files\nodejs\npm.cmd' install
```

Result: completed successfully; 41 packages added, 1 removed, 1394 audited. npm reported 68 audit findings (22 low, 31 moderate, 14 high, 1 critical). npm also warned that the existing `link-workspace-packages` config is not recognized by npm 11. After the frontend workspace dependency was added, the lockfile was reconciled without reinstalling packages:

```text
& 'C:\Program Files\nodejs\npm.cmd' install --package-lock-only --ignore-scripts
```

Successful verification commands:

```text
& 'C:\Program Files\nodejs\npm.cmd' --prefix packages/sim-core run typecheck
& 'C:\Program Files\nodejs\npm.cmd' --prefix packages/sim-core run test
```

Result: 11/11 simulator tests passed.

```text
& 'C:\Program Files\nodejs\npm.cmd' --prefix packages/relayer run typecheck
& 'C:\Program Files\nodejs\npm.cmd' --prefix packages/relayer run test
```

Result: 7/7 relayer tests passed. The test command is serialized so the local Hardhat node cannot race another test worker.

```text
& 'C:\Program Files\nodejs\npm.cmd' --prefix packages/frontend run build
& 'C:\Program Files\nodejs\npm.cmd' --prefix packages/frontend run lint
```

Result: frontend build and lint passed. Next built `/`, `/api/relayer/[...path]` and `/api/rpc/[network]`; lint reported no ESLint warnings or errors. Build retains two non-fatal optional dependency warnings from the existing wagmi connector bundle (`encoding` and `pino-pretty`).

The root commands require the installed Node directory on this Windows shell’s PATH so Turbo can find npm:

```text
$env:Path = "C:\Program Files\nodejs;$env:Path"; & 'C:\Program Files\nodejs\npm.cmd' run test
$env:Path = "C:\Program Files\nodejs;$env:Path"; & 'C:\Program Files\nodejs\npm.cmd' run build
$env:Path = "C:\Program Files\nodejs;$env:Path"; & 'C:\Program Files\nodejs\npm.cmd' run compile
$env:Path = "C:\Program Files\nodejs;$env:Path"; & 'C:\Program Files\nodejs\npm.cmd' run lint
```

Results: root test completed with 4 successful Turbo tasks: contracts (15 passing), sim-core (11 passing), relayer (7 passing), and the contracts compile dependency. Root build completed with 3 successful tasks (frontend, relayer, sim-core). Root compile completed with 1 successful contracts task. Root lint completed with 2 successful tasks; Solhint reported 3 warnings and 0 errors in the pre-existing `Hello.sol` import and immutable naming checks.

## Local full-day receipt integration

The relayer test starts a fresh local Hardhat node, deploys the actual compiled VoltToken and VoltGridMarket artifacts, registers eight houses, funds house ledgers and the simulated treasury, then runs two sequential days.

Assertions that passed:

- Day one and day two each started with a confirmed `DayStarted` receipt and had different server-generated day IDs.
- Each day advanced epochs `0..23` in order and produced exactly 24 confirmed normal `EpochSettled` outcomes.
- The first day’s epoch-zero transaction input was decoded from the mined transaction and deep-compared with an independent sim-core output for the same day ID, seed, scenario, houses and inputs.
- After both close receipts, the chain event reader found 48 `EpochSettled`, 2 `DayStarted`, 2 `DayClosed`, and 0 `EmergencyResolved` events.
- Retrying the first day’s epoch zero returned the existing confirmed outcome and did not increase the `EpochSettled` count (still 48).
- The market’s total internal ledger before the first day equalled the ledger after each completed day. After each close, all eight house balances and the treasury balance were queried, their sum matched the ledger total, and ERC-20 custody at the market matched the same total.
- The relayer unit suite separately covers concurrent duplicate POSTs, out-of-order calls, forged readings, unauthenticated calls, quota exhaustion, wrong chain, RPC timeout/unknown, revert and restart recovery.

The local test intentionally uses a disposable temporary state directory and local Hardhat accounts. It does not create testnet state.

## Browser verification

The local Next development server was opened at `http://localhost:3000/`. The rendered page visibly showed:

- `PREVIEW SIMULATION`, real sim-core wording, scenario/seed controls and a 24-cell preview timeline.
- `UNAVAILABLE`, `Disconnected`, no contract-address configuration, disabled faucet/register/deposit/withdraw/opt-in buttons, and an honest BridgeKey-specific injection-not-verified message.
- No receipt feed entries, no transaction hash, no explorer link, and no settled value while disconnected.
- Explicit `submitted / pending`, `confirmed on-chain`, `preview simulation` and `unavailable` state definitions.
- Carbon output marked illustrative/unavailable rather than a certificate.

This verifies the safe offline/unconfigured state. A live wallet extension and user signature were not available to this automated browser session, so no wallet transaction was attempted and no manual wallet check is claimed as passed.

## Manual wallet check still pending

When a supported injected wallet or BridgeKey is available, perform these numbered steps on MST Testnet only:

1. Open the local frontend with `NEXT_PUBLIC_VOLT_TOKEN_ADDRESS` and `NEXT_PUBLIC_VOLT_MARKET_ADDRESS` set to the verified local/testnet deployment addresses and the relayer URL configured by the host.
2. Click `Connect wallet`; approve the connection in the wallet. If the network warning appears, click `Add / switch to MST Testnet` and approve the network switch.
3. Confirm the wallet panel changes from unavailable to the read-only VLT, market-balance and allowance values. Do not continue if the chain ID is not `91562037`.
4. Click `Claim VLT faucet`; approve the transaction. Wait for the receipt and confirm the wallet balance changes and the explorer link uses the returned hash.
5. Click `Register my house` and approve. Then enter a small demo amount, click `Approve & deposit VLT`, and approve both the token approval and market deposit prompts. Confirm both receipts and the market balance.
6. Click `Opt in battery dispatch` and approve; verify the read updates. Click `Withdraw VLT` for an amount at or below the internal balance and approve.
7. Select a scenario and seed, click `Play real day`, sign only the relayer challenge, and verify each hourly cell becomes confirmed only after the epoch receipt. Refresh during an in-flight hour and use the same `Resume real day` action; verify no second epoch event appears.
8. After 24 confirmed cells, click the close-day action and verify the separate `DayClosed` receipt. Check the explorer transaction logs against the displayed epoch metrics.

Expected failure checks: deny the challenge and confirm no relayer action is submitted; switch to another chain and confirm the real-day action is refused; stop the relayer or delay RPC and confirm the UI remains pending/unknown and retries the same request rather than showing settled; double-click an epoch and confirm one on-chain outcome.

## Required environment names and unresolved items

Names only (no values are committed here):

- Frontend: `NEXT_PUBLIC_VOLT_TOKEN_ADDRESS`, `NEXT_PUBLIC_VOLT_MARKET_ADDRESS`, `NEXT_PUBLIC_RELAYER_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
- Relayer server: `RELAYER_MODE`, `RELAYER_PORT`, `MST_RPC_URL`, `MST_CHAIN_ID`, `MARKET_ADDRESS`, `ORACLE_PRIVATE_KEY`, `RELAYER_DATA_PATH`, `RELAYER_ALLOWED_ORIGINS`, `RELAYER_ADMIN_SECRET`, `RELAYER_AUTH_SECRET`, `RELAYER_TRANSFORMER_CAPACITY_WH`, `RELAYER_TRUST_PROXY`, `RELAYER_RECEIPT_TIMEOUT_MS`, `RELAYER_RECEIPT_POLL_MS`, `RELAYER_EVENT_LOOKBACK_BLOCKS`, `RELAYER_MAX_BODY_BYTES`, `RELAYER_MAX_ACTIONS_PER_SESSION`, `RELAYER_MAX_ACTIONS_PER_IP`, `RELAYER_MAX_AUTH_PER_IP`.

P6/P9 decisions still required: production persistence/locking and multi-instance hosting for the durable relayer store; verified public contract addresses and deployment ownership; whether a production wallet should use the generic injected flow or a supported BridgeKey integration; and P9’s separate testnet deployment/verification. No oracle secret is included in frontend code, the browser bundle, this evidence, or logs.

Known scope boundaries after P8: carbon certificates are implemented and locally verified, but not deployed to testnet; weather/sensor adapters remain optional model inputs and are not connected; the local JSON store is suitable for the single-process demo gate, not a horizontally scaled production relayer; npm audit findings and optional wagmi connector warnings remain for dependency maintenance.

## P7 emergency integration addendum (2026-09-28)

The additive grid-emergency lifecycle passed contract, simulator, relayer HTTP/API, and local Hardhat verification. It preserves the P6 normal-day path; the relayer suite again completed full sunny and rainy days. The heatwave local evidence contains 24 confirmed outcomes (18 normal + 6 emergency), receipt hashes, actual event-derived per-house payouts, ledger/custody reconciliation, retry evidence, transaction count, and measured gas: [EMERGENCY-LOCAL.md](EMERGENCY-LOCAL.md). This local evidence is not public testnet proof.

P7 amended `docs/architecture/INTERFACE.md` additively with `EmergencyReportRecorded`, including zero-discharge reports. The dashboard's offline/disconnected state was browser-checked and the production build/lint passed. The browser had no injected wallet, so interactive battery opt-in and wallet-driven Play Day remain **pending human verification**; do not mark those checks passed. See [P7-handoff.md](../coordination/P7-handoff.md) for commands, API detail, env names, security/hosting tradeoffs and the pending wallet procedure.

## P8 carbon certificates (2026-09-28)

P8 is verified on disposable local Hardhat chain ID `31337`; this is **not** MST Testnet evidence. No testnet deployment, publication, or human wallet signature was performed. The local deployment addresses were Market `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` and CarbonCertificate `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`.

The local relayer/contract integration completed separate sunny, rainy, and heatwave days. For every day, the close-receipt `CertificateMinted` seller amounts were compared with the sum of that seller's confirmed `TradeSettled.wh` logs and the public `eligibleWh(dayId,seller)` mapping; the total certificate Wh matched the daily `EpochSettled.matchedWh` total. Each token owner, immutable on-chain certificate tuple, versioned factor, exact formula, and base64 JSON/SVG metadata were read back and checked. No buyer, import/export, or emergency-discharge quantity appeared as eligible. The local heatwave retained 24 ordered outcomes (18 normal and 6 emergency).

Receipt-backed local examples from the run:

| Scenario | Day ID | Close receipt (block / tx) | Minted | Eligible seller Wh | Illustrative mgCO2e | Close gas |
|---|---|---|---:|---:|---:|---:|
| Sunny | `0x06715f7bdca87c03f42c28fd8952378787a59e47cca7e9d317caf4b2a6b60ef3` | 49 / `0x46f2dd31e021962e508ce2fd7b28808123bf49af20a44de54a240bcdc0006280` | 4 | 74,787 | 52,350,900 | 747,886 |
| Rainy | `0x96ff8abb210caac5a8cb648638aed3331b8a6ca6ec7a3cabeca526e1e55d2e81` | 76 / `0x79d2b37fe908b4ac16e4a51307f27e93bbbeec85c0964be45159ec400b218dbf` | 4 | 14,645 | 10,251,500 | 679,486 |
| Heatwave | `0xbe25c51e2f090b166abef90c3c070ac3c6b74b9ed83a7cdef3b8c5799f93ef68` | 63 / `0x20cbcca0ec6114dc429f45fe281a657a9417d0b699fbf20cece6a87d13a75e48` | 4 | 75,440 | 52,808,000 | 747,886 |

All used factor `700 gCO2e/kWh`, version `1`, explicitly a configurable modelling assumption with no verified primary emissions source. Example sunny mint logs in the close receipt: seller `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` received 17,226 eligible Wh / 12,058,200 mgCO2e (token 1); `0x90F79bf6EB2c4f870365E785982E1f101E93b906` 20,090 / 14,063,000 (token 2); `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` 17,107 / 11,974,900 (token 3); and `0x14dC79964da2C08b23698B3D3cc7Ca32193d9955` 20,364 / 14,254,800 (token 4). These sums equal the receipt totals, not a duplicated matchedWh per participant.

The sunny local owner-retire action emitted `CertificateRetired(tokenId=1, owner=0x70997970C51812dc3A010C7d01b50e0d17dc79C8)` at block 50, transaction `0xf7e6e9b7e009bf731146a3a4f5716c5c49b87b1bcd98f474e80b3129a6afe0c0`. The test read `retired(1)=true`, decoded the retirement event, verified the token URI's retired trait changed, and confirmed a subsequent transfer reverted. This is local-only proof, not a public explorer transaction.

The 16-house / 15-eligible-seller contract close used 2,606,310 gas locally. A four-certificate day close used 747,886 gas in the local integration. The complete P7 heatwave lifecycle, including close and certificates, used 6,064,577 gas across 38 submitted transactions. Duplicate/concurrent close requests returned the same stored receipt and did not increase `nextTokenId`; a service restart reloaded the close metrics for the gallery.

Commands and final results:

```text
& 'C:\Program Files\nodejs\npm.cmd' test
PASS: 13 sim-core, 23 contract, and 9 relayer tests; both full normal-day and heatwave local-chain integration tests included.
& 'C:\Program Files\nodejs\npm.cmd' run test:local --workspace=voltgrid-relayer
PASS: 2 local integration tests (sunny + rainy and heatwave), receipt/event/metadata and retirement assertions.
$env:Path = "C:\Program Files\nodejs;$env:Path"; & 'C:\Program Files\nodejs\npm.cmd' run build
PASS: sim-core, relayer, and frontend (3/3 Turbo tasks). Existing optional wagmi bundle warnings for `encoding` and `pino-pretty` remain.
$env:Path = "C:\Program Files\nodejs;$env:Path"; & 'C:\Program Files\nodejs\npm.cmd' run lint
PASS: 0 errors; 4 Solhint warnings (pre-existing `Hello.sol` import and immutable naming warnings, including the market/certificate address field style).
& 'C:\Program Files\nodejs\npm.cmd' run typecheck --workspace=voltgrid-relayer
PASS.
& 'C:\Program Files\nodejs\npm.cmd' run compile --workspace=contracts
PASS: Solidity 0.8.20 compile (initial P8 contract compile); root test also confirmed compile dependency.
```

The frontend gallery and owner-signed retirement path compile and lint, but a wallet-driven browser signature is **pending** until P9 deploys the P8 contracts and a human wallet owns an eligible solar seller token. Add `NEXT_PUBLIC_VOLT_CERTIFICATE_ADDRESS` alongside the existing public token/market address variables then. No credit/offset claim is authorized by this modelling record. Full commands, API shape, deployment setup, and pending human steps are in [P8-handoff.md](../coordination/P8-handoff.md).
