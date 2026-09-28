# MST Testnet deployment evidence

Date checked: 2026-09-29 (Asia/Kolkata)
Workspace: `C:\thanmay\mst\voltgrid`  
Status: **Testnet contract setup and sunny smoke passed on 2026-09-29.** The user reports successful `roles:testnet`, `seed:testnet`, `verify:testnet`, `lockdown:testnet`, and `smoke:testnet` runs. Verification checked deployment receipts, runtime bytecode hashes, constructor/state wiring, and chain ID `91562037`; lockdown removed the deployer's market operational roles and token `MINTER_ROLE`; the sunny smoke recorded 24 outcomes, zero emergencies, and a confirmed day close. Testnet deployment authority was exposed in chat earlier and remains compromised; the user elected to continue this deployment for testnet-only use. The deployer still holds `DEFAULT_ADMIN_ROLE` on token and market. Do not reuse this signer for mainnet or real-value assets. MSTScan source verification and hosted relayer/frontend/wallet flows remain pending.

## Network identity and sources

Primary sources checked live:

| Item | Evidence | Result |
| --- | --- | --- |
| MST official site | [mstblockchain.com](https://mstblockchain.com/) | Its “Try Our Testnet” link points to MSTScan’s testnet explorer. It describes MST as EVM-compatible and uses the MSTC label for fees. |
| Official faucet | [faucet.mstblockchain.com](https://faucet.mstblockchain.com/) | The page says “MST Testnet Faucet” and “Get Your MSTC”. It does not publish a per-claim amount or claim limit. No faucet request was made. |
| Officially linked testnet explorer | [testnet.mstscan.com](https://testnet.mstscan.com/) | The explorer opened; its read-only `/api/v2/stats` endpoint returned gas stats but no native currency symbol. |
| Official developer docs | [docs.mstblockchain.com](https://docs.mstblockchain.com/) | Unavailable during the live check (HTTP 500 / inaccessible). No chain-parameter claim is attributed to this site. |
| BridgeKey custom network guidance | [bridgekey.io/multi-chain](https://bridgekey.io/multi-chain) | The first-party page describes testnet connectivity and says custom networks are added under Settings → Networks → Add Network using RPC URL, chain ID, and currency symbol. This does not verify the installed wallet/extension or a successful signature. |

Live read-only probe of `https://testnetrpc.mstblockchain.com` via the repository preflight:

| RPC/config value | Observation |
| --- | --- |
| `eth_chainId` | `0x5752035` = `91562037` |
| `net_version` | `91562037` |
| Configured Hardhat chain ID | `91562037`; exact match |
| Configured frontend chain ID | `91562037`; exact match |
| Latest block at final preflight | `5787246`; a separate raw JSON-RPC probe shortly afterward observed `5787277` |
| Latest block gas limit | `55000000` |
| RPC gas price at that preflight | `1000000000` wei (1 gwei; a later explorer stats read showed 1.3 gwei, so fees are time-varying) |
| RPC client | `Geth/v1.7.3-5c7d31a4-20260519/linux-amd64/go1.25.0` |

Independent raw JSON-RPC call (not only Hardhat's configured provider) returned `eth_chainId=0x5752035`, `net_version=91562037`, latest block `5787277`, and `eth_gasPrice=1000000000` wei. Both frontend and Hardhat chain configuration remain `91562037`.

The configured native symbol needs a human/first-party confirmation. The official site and faucet use `MSTC`, but accessible first-party material does not explicitly publish a distinct testnet wallet ticker. The app currently configures `tMSTC`, based on non-primary registry information; treat that label as provisional until MST/BridgeKey confirms it. The RPC chain ID is verified; the currency-symbol question is not.

## Local gates and read-only preflight

Dependencies were reconciled once with the repository’s declared npm 11 workspace setup:

```text
npm install --no-audit --no-fund
```

Result: exit 0, “up to date”. npm reported six dependency install scripts not covered by its allow-scripts policy; none were explicitly approved. The subsequent forced tests and build passed with the installed tree. The existing npm configuration also warns that `link-workspace-packages` is unknown to npm 11.

Passed commands:

```text
npm run compile
npm test -- --force
npm run build -- --force
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2020 --module CommonJS --moduleResolution node --esModuleInterop --skipLibCheck packages/contracts/hardhat.config.ts packages/contracts/scripts/deploy-testnet.ts packages/contracts/scripts/grant-roles-testnet.ts packages/contracts/scripts/lockdown-testnet.ts packages/contracts/scripts/preflight-testnet.ts packages/contracts/scripts/seed-testnet.ts packages/contracts/scripts/smoke-testnet.ts packages/contracts/scripts/verify-testnet.ts packages/contracts/scripts/verify-source-testnet.ts packages/contracts/scripts/lib/testnetDeployment.ts
```

Results: Solidity compile passed; simulator 13/13, contract 23/23, relayer 9/9; workspace build passed; testnet script-only TypeScript check passed. The Next.js production build emitted non-blocking optional dependency warnings for `encoding` (MetaMask SDK) and `pino-pretty` (WalletConnect logging). The fresh local relayer integration reconfirmed sunny/rainy receipt runs and a heatwave run with 24 outcomes, 6 emergency epochs, 38 submitted lifecycle transactions, and `6064577` gas. These are local Hardhat results, not MST testnet evidence.

Read-only testnet deployment dry run:

```text
npm run preflight:testnet --workspace=contracts
```

Result: exit 0; no transaction broadcast. At the live RPC price of 1 gwei:

| Contract creation | Estimated gas | Native coin at observed gas price |
| --- | ---: | ---: |
| VoltToken | 919760 | 0.00091976 |
| VoltGridMarket | 3626864 | 0.003626864 |
| CarbonCertificate | 2124718 | 0.002124718 |
| Total | 6671342 | 0.006671342 |
| Total plus 50% buffer | 10007013 | 0.010007013 |

This is an initcode-only estimate from a non-funded placeholder sender. It excludes deployment binding, role grants, VLT seeding, wallet actions, and relayed day transactions. The local heatwave run consumed 6064577 gas (about 0.006064577 native at 1 gwei before buffer), but that is not a testnet estimate. No testnet wallet keys are configured, so no actual balances were read. The faucet does not disclose its amount; therefore no exact number of claims or fully funded end-to-end budget can be asserted. Rerun preflight after the user populates the ignored environment file; it reports deployer/oracle balances when their keys are present.

## Deployment and secrets status

The guarded testnet scripts are present:

```text
npm run preflight:testnet --workspace=contracts
npm run deploy:testnet --workspace=contracts
npm run roles:testnet --workspace=contracts
npm run seed:testnet --workspace=contracts
npm run lockdown:testnet --workspace=contracts
npm run verify:testnet --workspace=contracts
npm run smoke:testnet --workspace=contracts
npm run verify:source:testnet --workspace=contracts
```

Deployment/admin writes use a process lock and ignored, atomic journals; a submitted transaction is reconciled by nonce/hash and successful receipt rather than blindly resent. The smoke run serializes with other admin operations, persists its day plan, checks price previews and expected event logs, and recovers confirmed start/epoch/close receipts. Testnet commands enforce chain ID `91562037`. No mainnet command was run.

The confirmed deployment artifact exists at `packages/contracts/deployments/testnet.json` (local, untracked deployment evidence). No secret values are reproduced in this document. Keep deployer/oracle keys out of source, browser configuration, and logs; the exposed deployer key is not suitable for any production or real-value use. The earlier source/bundle scan found no credential assignment in package source and no oracle/deployer/MSTScan key markers in generated frontend chunks; repeat secret scanning before any hosted release.

Deployment receipt evidence, checked read-only against the configured RPC on 2026-09-29:

| Item | Address / relationship | Transaction | Block | Gas |
| --- | --- | --- | ---: | ---: |
| Chain ID | `91562037` (`eth_chainId=0x5752035`) | — | — | — |
| `VoltToken` | `0x66fa5F2596111F7C6421a8b7eA5fc2D75495194E` | `0x51eea6ebe77aef98e5fe3b187eb50a036ccc0444e8ae6233f222044b339528f6` | `5788358` | `911588` |
| `VoltGridMarket` | `0xe7f944785De4D7936ae21a1F5Af47BDC7B775Ae6` | `0xd5adc84e947b031a90405ca9253ffc98e563f265d103d1f04065d4c60c604686` | `5788595` | `3597376` |
| `CarbonCertificate` | `0xCed6462B7E9E0FFE891bcdE8260d0FA6D9139D93` | `0x114721e179fef7cfabf57e16dfa91d523db877a5fc9d6e09891777ae2cdf206b` | `5788597` | `2106830` |
| Certificate binding | market `0xe7f944785De4D7936ae21a1F5Af47BDC7B775Ae6` → certificate above | `0x81998846c11f416e026aba1bd564a17ec9e3d9720b984349f6a1daa72bec8a19` | `5788599` | `35926` |

All four deployment/binding receipts returned status `1`; each deployment address had non-empty runtime bytecode. The artifact exists at `packages/contracts/deployments/testnet.json`. All four transaction senders were `0xcc689cfA225Bd86d24D0a359Cd474130671550d9`, matching the earlier preflight deployer address. The oracle address in the artifact has `ORACLE_ROLE` and `GRID_OPERATOR_ROLE`; the 19-receipt seed plan registered eight demo houses, minted VLT, and funded the house/treasury ledgers. At the intermediate lockdown check, before the final minter-revocation retry, the deployer had already lost market `ORACLE_ROLE`, `GRID_OPERATOR_ROLE`, `REGISTRAR_ROLE`, and `SEEDER_ROLE`, but retained `DEFAULT_ADMIN_ROLE` on market and both `DEFAULT_ADMIN_ROLE` and `MINTER_ROLE` on token. The final minter revocation is recorded below as confirmed. The deployer retains `DEFAULT_ADMIN_ROLE`; the oracle still holds `ORACLE_ROLE` and `GRID_OPERATOR_ROLE`.

The previously pending token minter revocation is now recorded as confirmed: transaction `0xf55746fa3688367e77b4cddc183fdb976bd176b6c2a752ba6278d9dd04c4edd9`, block `5789005`. The user reports that `lockdown:testnet` completed successfully. The deployment artifact records all five deployer operational-role revocations as confirmed. The user also reports successful `roles:testnet` and `seed:testnet`; the artifact contains their grants and 19 seed receipts (eight houses, VLT seed/funding, and treasury funding).

The user-reported `verify:testnet` output passed on chain `91562037`: all three deployment receipts matched the artifact and all runtime code hashes were present and matched; constructor/state checks passed. The user-reported `smoke:testnet` output confirmed a sunny day with 24 outcomes and zero emergencies. Day ID: `0x729f6ccfb304f249d85ea2d7c6bd3d41a0e78bad21023679d354564ad937b57a`; close transaction: `0xfd6119e6ff9bdb5299773e00c1e72e601e439b4df221d3f631886ccb8af190a4`, block `5789084`, gas `6434141`; [MSTScan transaction](https://testnet.mstscan.com/tx/0xfd6119e6ff9bdb5299773e00c1e72e601e439b4df221d3f631886ccb8af190a4). The deployment artifact records four certificates for this smoke day. These results establish the contract/sunny-smoke gate only, not the heatwave or hosted-app gates. Source verification has not yet been reported.

## Hosting constraint and required human actions

The relayer persists idempotency/receipt state to a JSON file and its mutex, auth challenges/sessions, and quotas are process-local. A demo host therefore needs TLS, one relayer process/instance with a durable persistent volume mounted at `RELAYER_DATA_PATH`, backups, and no horizontal autoscaling. A serverless or multi-instance relayer deployment is unsafe without first replacing the store/locking/quota design with shared transactional infrastructure. The production entry point is `npm run start --workspace=voltgrid-relayer` after the workspace build. The Next.js frontend should use the same-origin `/api/relayer` proxy unless a deliberate public relayer origin is configured and allowlisted. No hosting provider/project/authenticated account is configured in this workspace, so selecting or logging into an external host is still required.

Railway/Railpack preparation previously reported “No start command detected”; the root manifest now forwards `npm start` to the relayer workspace (`node dist/server.js`). The later Railway runtime log showed the actual startup failure was `Missing required relayer configuration: MARKET_ADDRESS`, not a build failure. The root start command starts only the relayer; the Next.js frontend is a separate workspace/service using `npm run start --workspace=frontend`. No successful Railway service deployment is evidenced yet.

Remaining actions to complete the testnet demo gate:

1. Run `npm run verify:source:testnet --workspace=contracts` and record the exact MSTScan response. This is distinct from the already-passed on-chain receipt/bytecode verification.
2. Configure the relayer host with the names in `packages/relayer/.env.example`; set `RELAYER_MODE=production`, chain ID `91562037`, the confirmed market address, the allowed frontend origin, and strong server-side auth/admin secrets. Supply only the separate authorized oracle key as a server secret; never use the exposed deployer key for relayer signing or place any private key in the browser. Bind `RELAYER_PORT` to the host's assigned port and mount durable storage at the configured `RELAYER_DATA_PATH`.
3. The relayer's JSON idempotency store, locks, sessions and quotas require one process/instance plus a persistent volume and backups; do not use serverless or horizontal autoscaling for this implementation. For the frontend service, provide the confirmed public token, market, and certificate addresses from `packages/contracts/deployments/testnet.json`; leave `NEXT_PUBLIC_RELAYER_URL` empty to use the same-origin proxy and set server-only `RELAYER_URL` to the relayer's private/internal service URL. Use the frontend start command `npm run start --workspace=frontend` (the root `npm start` is the relayer).
4. In a clean/private browser, verify the hosted wallet connect/network switch, faucet, registration, approval/deposit, withdrawal, sunny full day, heatwave emergency, close-day certificate gallery, and owner-signed retirement if available. Exercise refresh/resume, duplicate clicks, denied signatures, wrong network, rate limits, relayer failure and RPC delay. Reconcile displayed values and links against actual receipt logs; do not claim wallet checks passed until a human completes them.

The testnet deployment and sunny contract smoke are evidenced. MSTScan source publication, hosted service health, testnet heatwave lifecycle, human wallet signatures, and clean/private-browser verification remain **pending**. Do not publish a demo URL or describe local Hardhat receipts as live testnet activity until those checks pass.
