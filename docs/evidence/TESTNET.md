# MST Testnet deployment evidence

Date checked: 2026-09-28 (Asia/Kolkata)  
Workspace: `C:\thanmay\mst\voltgrid`  
Status: **preflight passed; testnet deployment and hosting are blocked on user-controlled wallet funding and hosting setup. No transaction was sent.**

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

No recognized P9 private-key/API-key variables are populated in the ignored repository-root `.env.local`; that path is ignored by Git. The sample file [packages/contracts/.env.testnet.example](../../packages/contracts/.env.testnet.example) contains names only and blank key fields. Secret-pattern scans found no credential assignment in package source and no oracle/deployer/MSTScan key markers in generated frontend chunks. No contract deployment artifact exists at `packages/contracts/deployments/testnet.json`.

No testnet deployment, role grant, seed, smoke, explorer source-verification attempt, faucet request, or hosted deployment has occurred. Thus there are currently **no** testnet contract addresses, deployment transaction hashes, block numbers, confirmed events, MSTScan transaction links, or hosted URL to report. They will be written here only after receipt and bytecode checks succeed. MSTScan source verification is not attempted until confirmed deployment addresses exist; explorer API compatibility remains unverified.

## Hosting constraint and required human actions

The relayer persists idempotency/receipt state to a JSON file and its mutex, auth challenges/sessions, and quotas are process-local. A demo host therefore needs TLS, one relayer process/instance with a durable persistent volume mounted at `RELAYER_DATA_PATH`, backups, and no horizontal autoscaling. A serverless or multi-instance relayer deployment is unsafe without first replacing the store/locking/quota design with shared transactional infrastructure. The production entry point is `npm run start --workspace=voltgrid-relayer` after the workspace build. The Next.js frontend should use the same-origin `/api/relayer` proxy unless a deliberate public relayer origin is configured and allowlisted. No hosting provider/project/authenticated account is configured in this workspace, so selecting or logging into an external host is still required.

Before deployment, the user must:

1. Create/fund two separate user-controlled MST Testnet accounts (deployer and oracle); do not send private keys in chat. Use the [official faucet](https://faucet.mstblockchain.com/) after confirming its displayed amount. Confirm the testnet wallet currency ticker with MST/BridgeKey support; do not infer it from the third-party `tMSTC` listing.
2. Copy the names in `packages/contracts/.env.testnet.example` into the ignored repository-root `.env.local` and populate the values locally. The key names are `MST_TESTNET_DEPLOYER_PRIVATE_KEY`, `ORACLE_PRIVATE_KEY`, `ORACLE_ADDRESS`; optional configuration names are `MST_RPC_URL`, `MST_CHAIN_ID`, `TREASURY_ADDRESS`, `HOUSE_ADDRESSES`, `MSTSCAN_API_KEY`, and `MST_TESTNET_RECEIPT_TIMEOUT_MS`. Keep the deployer and oracle distinct. Never paste values in chat, source, or browser settings.
3. Choose/authenticate to a hosting service that supports the single-instance persistent-volume requirement. Put `ORACLE_PRIVATE_KEY` only in that service’s server-side secret manager. Relayer environment names are in `packages/relayer/.env.example`; frontend public address variables are in `packages/frontend/.env.example` and are set only after the deployment artifact exists.
4. After those external steps, rerun the live balance preflight, then deploy → grant roles → seed → verify bytecode/state → lock down deployment roles → smoke → verify receipts and attempt MSTScan source verification. Configure and deploy the relayer/frontend only with confirmed addresses and the exact hosted origin; then run the clean-browser connect/faucet/deposit, full-day, heatwave, close/retirement, retry/rate-limit/network-failure checks.

Until the wallet funding, currency confirmation, hosting choice/authentication, deployed receipts, and clean private-window flow are evidenced, the testnet/hosted verification gate remains **pending**. Do not publish a demo URL or describe local Hardhat receipts as live testnet activity.
