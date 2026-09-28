# VoltGrid shared-checkout handoff (P0)

The architecture freeze is in [`../architecture/DECISIONS.md`](../architecture/DECISIONS.md) and [`../architecture/INTERFACE.md`](../architecture/INTERFACE.md). Open both **before** P1–P4. The supplied implementation plan and Neurick manual are reference material; pasted user prompts and the actual repository control the work. The current hackathon rulebook was not supplied, so rule/deadline/submission claims from the plan are provisional.

## Baseline inspected on 28 September 2026

- Git root: `C:\thanmay\mst\voltgrid`, branch `master`, last commit `c5a251b` (`create-mst-app` starter). Before P0, the only working-tree addition was the user's `VOLTGRID_CODEX_PROMPTS.md`. No `AGENTS.md` was found in this checkout or its workspace parents.
- Existing workspaces: `contracts`, `frontend`, `voltgrid-shared`; no sim-core or relayer package yet. Root is npm workspaces (`packages/*`) with Turbo. A pnpm workspace file and `.npmrc` also exist, but root `packageManager` is `npm@11.19.0`.
- `packages/contracts` contains only `Hello.sol`, three Hello tests, Hardhat testnet/mainnet configuration, and a deploy writer that also overwrites `packages/shared/src/contracts.ts`.
- `packages/frontend` is Next.js 14, not Vite. It contains a Hello screen, generic wagmi injected/WalletConnect wiring, a switch to **mainnet**, unrestricted same-origin JSON-RPC proxy, and an unused demo `SdkWalletPanel` that can display an in-browser burner private key. P3 removes/isolate unsafe and irrelevant starter behavior in its owned files.
- `packages/shared/src/contracts.ts` is a placeholder with no deployed contracts. `.env.local` exists but `PRIVATE_KEY`, `MSTSCAN_API_KEY`, and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` were checked **only for nonempty presence** and are currently unconfigured. No secret values were read or printed. `node_modules` and `.env.local` are ignored. Root had no npm lockfile before P0.

### Read-only network check

On 28 Sep 2026, `POST https://testnetrpc.mstblockchain.com` returned `eth_chainId = 0x5752035` (= 91562037), `eth_blockNumber = 0x5839b3`, and a later latest block with `gasLimit = 0x3473bc0` (= 55,000,000). These are live read-only responses, **not** a deployment or compiler smoke test. [Testnet explorer](https://testnet.mstscan.com/) and [official faucet](https://faucet.mstblockchain.com/) opened; the latter's successful funding/limits are untested. [BridgeKey's network page](https://bridgekey.io/multi-chain) confirms custom-network support, while its exact browser provider object/signing behavior is unverified. [Chain registry](https://chainid.network/chain/91562037/) lists native symbol `tMSTC`; the official faucet labels its coin `MSTC`, and the starter says `MST`. Wallet-facing symbol must be tested in BridgeKey. Official developer docs were inaccessible to the web reader at P0, so no SDK/provider assertion is based on them.

## Toolchain and actual baseline commands

`npm` is installed at `C:\Program Files\nodejs\npm.cmd` but was not on this shell's PATH. Turbo failed to locate the package-manager binary until PATH included that directory. In every parallel chat's PowerShell session, use:

```powershell
$env:PATH='C:\Program Files\nodejs;'+$env:PATH
& 'C:\Program Files\nodejs\npm.cmd' run compile
```

P0 ran `C:\Program Files\nodejs\npm.cmd install --no-audit --no-fund` successfully: **1,348 packages added**, and the new root `package-lock.json` is the npm lock. npm warned about `link-workspace-packages` in `.npmrc` (pnpm-only setting), React Native optional peer resolution, deprecations, and six optional native install scripts not approved by npm's install-scripts policy. No package manifest was changed. Do not run another install or change the lockfile during P1–P4; P6 will reconcile new package manifests and install once.

| Check | Actual result | Follow-up |
|---|---|---|
| `npm run compile` without PATH fix | Failed: Turbo could not find package-manager binary | Use PATH command above. |
| `npm run build` without PATH fix | Same failure | Use PATH command above. |
| `npm run compile` with PATH fix | **Passed**. Hardhat 0.8.20 compiler downloaded; 3 Solidity files compiled, EVM target `paris`; typechain generated. | This is local Hardhat compatibility only. |
| `npm run test` with PATH fix | **Passed**. 3/3 `Hello` tests; Turbo reused compile cache. | No VoltGrid feature tests exist yet. |
| `npm run build` with PATH fix | **Passed**. Next.js 14.2.35 production build and type/lint checks succeeded. | Warnings: missing optional `encoding` and `pino-pretty` through wallet dependencies. P3/P6 should assess if bundled wallet behavior is affected. |
| `npm run lint` with PATH fix | **Failed**. Frontend ESLint passed; contract Solhint reported no files because its script uses single quotes around `contracts/**/*.sol` under Windows `cmd.exe`. | P1 owns `packages/contracts/package.json`; make the Solhint command cross-platform and rerun. |

The Next build automatically changed a comment in `packages/frontend/next-env.d.ts`; P0 inspected and restored only that generated comment change, leaving P3's ownership clean. No testnet transaction, deploy, publication or submission occurred.

## Parallel ownership and handoff protocol

After P0, run the four prompts in `VOLTGRID_CODEX_PROMPTS.md` in separate chats within this **same Git checkout**:

| Chat | Owns | Must not touch |
|---|---|---|
| **P1 contracts** | `packages/contracts/**`, `docs/coordination/P1-handoff.md` | Shared ABI writer output, root lock/config, sim-core, frontend, relayer |
| **P2 simulator** | `packages/sim-core/**`, `docs/coordination/P2-handoff.md` | Contracts, frontend, relayer, shared, root lock/config |
| **P3 frontend shell** | `packages/frontend/**`, `docs/coordination/P3-handoff.md` | Contracts, sim-core, relayer, shared, root lock/config |
| **P4 evidence/content** | `docs/demo/**`, `docs/evidence/**`, `docs/coordination/P4-handoff.md` | Code, README, root lock/config |

All four may read any file. Do not run installs, commits, pushes, branch changes, worktree operations, deployments, or Git index mutations concurrently. P1 local tests must avoid the starter deploy writer because it overwrites shared code. If one chat needs another's file changed, it records exact requested signature/path and reason in **its own handoff** and continues independent work; only the owner makes the change during P1–P4. Do not silently modify `INTERFACE.md` from a parallel chat. If the freeze proves inconsistent, record a proposed correction; P6 coordinates acceptance and updates the interface.

Each handoff must list changed files, exported functions/types/events, test commands and actual results, assumptions, known defects, and the precise action needed by P5/P6. A gate is complete only after its verification passes or a specific external blocker is recorded. P5 starts after **P1+P2**; P6 starts after **P1–P5**. P7 VPP, P8 illustrative carbon, P9 testnet hosting, P10 independent verification, and P11 submission follow in order. H1/H2 hardware are optional after simulation works and require exact sensor model documents before pin assignment.

## Manual actions that are not needed for P0

No wallet funding, key entry, service login or physical wiring is needed to start P1–P4. Later deployment requires a person to fund a dedicated testnet wallet, add a key to an ignored local environment file or hosted secret manager, approve wallet signatures, and verify the hosted flow; P9 must give those numbered steps only after all preparatory work is complete. The separate hackathon rulebook and exact models/datasheets for GPS, satellite, raindrop, and temperature/humidity sensors would help later, but their absence does **not** block the four parallel simulation tasks.
