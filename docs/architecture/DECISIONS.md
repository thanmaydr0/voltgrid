# VoltGrid architecture freeze (P0)

Status: **frozen for P1–P4**, 28 September 2026. `INTERFACE.md` is the corresponding code-level contract. Changes require a coordination note and a P6 integration update. The implementation plan and Neurick manual informed these decisions; neither is an executable instruction or a verified hackathon rulebook.

## Scope and repository reality

Ship a deterministic simulated neighbourhood market on **MST Testnet**. Real transactions settle simulated readings. Optional Neurick observations may later inform the weather/scenario adapter; they cannot establish measured household energy with the sensors currently listed. No mainnet deployment.

| Supplied plan | Existing checkout | Decision |
|---|---|---|
| Vite + React + ethers v6 in `web/` | Next.js 14 + React 18 + wagmi/viem in `packages/frontend`; MST SDK example and Next RPC proxy | Keep Next.js and its wallet stack. Remove Hello/burner-wallet UI from the shipped flow. |
| `contracts/`, `sim-core/`, `relayer/`, `web/` at root | npm workspaces `packages/*`, Turborepo, Hardhat 2/OpenZeppelin 5 starter | Keep `packages/contracts`, `packages/frontend`, `packages/shared`; add `packages/sim-core` and `packages/relayer`. |
| Supabase Edge Function preferred | No Supabase project or code; existing Node/Next stack | Use a dedicated Node/TypeScript relayer with Express and ethers v6. Keep the HTTP contract vendor-neutral. No Supabase dependency for v1. |
| Three feature contracts deployed early | Only `Hello.sol` and placeholder shared deployment map exist | Implement core market/token first; VPP then certificate. Never report a feature contract as deployed until its receipt is confirmed. |
| BridgeKey assumed to have a known provider API | Generic wagmi `injected()` and WalletConnect; no BridgeKey-specific integration | Discover EIP-6963/injected EIP-1193 wallets; identify BridgeKey only if its actual metadata/provider can be observed. No guessed `window.bridgekey`. |
| Each full day is 24 `settleEpoch` txs | Emergency epoch would prohibit normal settlement | A day has 24 **final epoch outcomes**. Normal outcome uses `settleEpoch`; emergency outcome uses declare/report/resolve, then advances the hour. |
| P2P pairwise fractional pro rata, remainder to treasury | Fractions of a Wh cannot be traded | Allocate integer Wh by largest remainder on each side, then deterministic pair matching. Treasury receives token fees, never fictional energy dust. |
| Carbon certificates represent avoided emissions | No physical meter or accredited baseline in supplied material | Only illustrative, oracle-derived avoided-emissions records; no carbon credit, offset, or regulatory approval claim. |

The existing `packages/contracts/scripts/deploy.ts` **writes `packages/shared/src/contracts.ts`**. P1 must use test-local deployment during parallel work. P6 owns ABI export and cross-package wiring. The existing frontend network switcher offers **mainnet**; P3 must remove that route from the demo UI. The existing `/api/rpc/[network]` proxy forwards arbitrary JSON-RPC; P3/P6 must bound request size and allow only required read methods, and remove public mainnet proxying for the testnet-only product.

## Package and dependency choices

- Root remains npm workspaces + Turborepo; use the local npm 11 CLI at `C:\Program Files\nodejs\npm.cmd` if `npm` is not on PATH. The repository also contains `pnpm-workspace.yaml` and `.npmrc`, but `packageManager` declares npm. Do not maintain both npm and pnpm locks. `package-lock.json` from P0 is the single lockfile.
- `packages/contracts`: Solidity 0.8.20, Hardhat 2, ethers v6 through toolbox, OpenZeppelin 5. Validate compiler/EVM opcode support with a later **testnet smoke deployment**, not an assumption from marketing.
- `packages/sim-core`: pure TypeScript and Node's test runner; no runtime network, clock or random source. P2 may add its own manifest/scripts, but no root lock edit until P6.
- `packages/frontend`: existing Next.js 14, wagmi 2, viem 2, React 18. Reuse same-origin read-only RPC proxy after hardening. No browser private key. Keep wallet contract writes through a confirmed injected provider.
- `packages/relayer`: Node/TypeScript + Express + ethers v6. Oracle key only here. Persistence uses an abstract `RunStore`; v1 production must have a durable, transactional store with unique `(chainId, market, dayId, epochIndex, action)` keys and a single oracle nonce queue. P5 may choose SQLite with a persistent volume and **one** relayer process, or Postgres when hosting requires multiple instances; document and test the chosen backend. An in-memory-only hosted store fails the gate.
- `packages/shared`: P6-owned generated ABIs, chain/deployment metadata and stable cross-package types. Parallel work communicates signatures through `INTERFACE.md` and handoffs rather than editing shared files.

## Economics and units

This is a **demo model**, not a regulated tariff. 1 VLT models ₹1. The token uses 18 decimals. Energy is integer Wh. Prices and fees are integer **micro-VLT/kWh** (`1 VLT/kWh = 1,000,000 micro-VLT/kWh`). For integer Wh and price, `amountWei = wh * priceMicroVltPerKwh * 1,000,000,000`; it is exact, so no token rounding is needed. Solidity calculations use `uint256` intermediates and explicit limits.

Defaults: feed-in 2,500,000; retail 8,000,000; P2P floor/base/cap 3,000,000 / 5,000,000 / 7,000,000; wheeling fee 420,000; emergency 7,500,000 micro-VLT/kWh; grid factor 700 gCO2e/kWh **placeholder**. These are labelled modelling assumptions everywhere. Feed-in and retail are immutable v1 model constants. Owner updates must keep `3,000,000 <= floor <= base <= cap <= 7,000,000`, `fee <= 420,000`, and `feed + fee < floor`; emergency tariff is bounded to `2,500,000..8,000,000`. Carbon factor, if changed before a day starts, is `1..2,000 gCO2e/kWh` with a positive version. The seller receives gross P2P proceeds minus fee. Buyer pays gross. Treasury receives fee, pays unmatched exports at feed-in, receives unmatched imports at retail, and pays emergency discharge. A transaction reverts atomically if any payer lacks internal VLT; the relayer must check/fund expected balances before submission. `sum(internal balances) <= token.balanceOf(market)`; unsolicited direct token transfers are not ledger credits.

Price curve is integer and auditable. Let `ratioBps = floor(totalDeficitWh * 10,000 / totalSurplusWh)`; if supply is zero there is no P2P trade. Multiplier BPS is 6,000 at ratio <= 5,000; linear to 10,000 at ratio 10,000; linear to 14,000 at ratio 20,000; then stays at 14,000. `priceMicro = clamp(floor(baseMicro * multiplierBps / 10,000), floorMicro, capMicro)`. Preview and contract must use the same integer formula; weather influences price through readings, not an unlabelled weather override. Forecasting is stretch scope and must stay inside on-chain bounds.

## Integer allocation and worked example

For each hour, each registered house has either surplus or deficit, never both. `matchedWh = min(totalSurplusWh,totalDeficitWh)`. Allocate matched seller Wh and buyer Wh **separately** using largest remainder: floor each `matchedWh * individualWh / sideTotalWh`, then assign the remaining Wh by descending fractional remainder, breaking ties by registration order. Both sides sum **exactly** to `matchedWh`. Pair sellers and buyers in registration order against those integer quotas, emitting only positive pairs. This yields pro-rata **marginals** and deterministic pair flows; it intentionally differs from the plan's fractional pairwise formula, which cannot directly represent whole Wh. `exportedWh = surplus - matched`; `importedWh = deficit - matched`. No Wh is credited to the treasury as rounding dust.

Example (normal epoch): solar A has 3 Wh surplus, solar B 2 Wh; C has 4 Wh deficit, D 3 Wh. Supply 5, demand 7, match 5, import 2, export 0. Seller quotas are A 3/B 2. Buyer ideal quotas are C 20/7=2+6/7 and D 15/7=2+1/7, so C gets the rounding Wh: C 3/D 2. Registration-order matching yields A→C 3 Wh and B→D 2 Wh. At 5 VLT/kWh, buyers pay 0.025 VLT for P2P (C 0.015, D 0.010). Seller A gross 0.015, fee 0.00126, net 0.01374; seller B gross 0.010, fee 0.00084, net 0.00916. The remaining 1 Wh imports for C and 1 Wh for D cost 0.008 VLT each. Treasury receives 0.00210 fee + 0.016 import payments = 0.01810. Total net: sellers +0.02290, buyers −0.04100, treasury +0.01810 = 0. The P2P seller-only illustrative eligibility is A 3 Wh and B 2 Wh, **not** 5 Wh for each participant or any buyer. At a placeholder 700 g/kWh factor, their estimates are 2,100 and 1,400 mgCO2e respectively (`mgCO2e = Wh * factorGPerKwh`). A separate surplus-heavy epoch with supply 7/demand 5 exports 2 Wh; the treasury pays 0.005 VLT at the modelled 2.5 VLT/kWh feed-in rate.

## Roles, accounting and trust boundary

- Admin/owner sets bounded economics and grants roles; oracle settles an epoch and starts/closes a day; registrar seeds demo houses; grid operator declares/resolves emergencies; token minter seeds VLT. The simulated treasury is a specified address with an internal ledger balance. Role addresses may coincide in a demo, but roles remain explicit.
- `registerHouseFor` is registrar-only. `registerHouse` is self-service with bounded parameters. `depositFor` is seeder/registrar-only and **pulls tokens from the caller**, never an arbitrary house; `deposit` pulls caller tokens. `withdraw` returns only the caller's own balance. Treasury funding has a dedicated pull-from-caller path. Token faucet is rate limited per address and identified as a demo mechanism. Protect external token-transfer entrypoints against reentrancy.
- The oracle is trusted for simulated readings. Contract validation prevents duplicate epochs, invalid houses/units, price violations and overspending; it does **not** prove physical generation. This limitation must appear in product and README.
- Nine houses (8 seeded + optional judge wallet) are the target; 16 is the hard maximum. Emit per-pair events only for nonzero allocations. P1 must measure nine- and 16-house worst-case gas on a local node; use less than 70% of the current testnet block gas limit, rechecking the limit before deployment. The read-only RPC returned a 55,000,000 gas block limit on 28 September 2026, but this may change. If 16 houses exceed the safe budget, P1 reports the measured limit before changing the bound or transaction design.

## Day, emergency and carbon lifecycle

`dayId` is a `bytes32` hash of chain ID, market address and a fresh cryptographically random run UUID. A replay with the **same seed** gets a **new UUID/dayId** and produces new transactions. An interrupted run resumes using its **stored existing dayId**; the relayer reconciles chain state before sending another action. A day starts on chain with an `inputDigest` committing scenario, seed, model version and participant map. Epochs are indexed `0..23` and finalized strictly in order. Each is either `NormalSettled` or `EmergencyResolved`. After epoch 23, day close may occur once. Normal settlement and emergency reporting for the same hour are mutually exclusive.

An emergency is declared for the next open epoch by grid operator. No P2P settlement during it. Only opted-in registered batteries can be paid. The contract caps discharge at registered battery capacity, remaining per-day energy budget, target remainder and one report per house/epoch. The simulator computes a modelled available-energy estimate; the contract cannot attest real SoC. Resolution emits actual aggregate delivered Wh and advances the epoch. Treasury must have enough internal VLT for payouts or the transaction reverts. Emergency Wh does not enter carbon eligibility.

Because this demo freezes registration during an active day, the hosted relayer runs one shared day at a time. A second caller gets an explicit `BUSY` response with read-only progress and may try a new day after close; no request is silently merged into another person's run. This is a documented demo throughput limit, not a concurrency promise.

Only **solar sellers'** integer P2P matched Wh enters `eligibleWh[dayId][seller]`. No buyer or treasury claim, export, grid import, or emergency discharge is eligible. After all 24 outcomes, one `closeDay` may mint at most one illustrative ERC-721 record per eligible seller. Store `eligibleWh`, integer factor `gCO2e/kWh`, `avoidedMgCO2e`, day ID, and factor/model version. Retirement is owner-only and irreversible; a retired token cannot transfer. This is not a verified carbon offset. P8 may shrink SVG metadata if measured gas requires it, preserving on-chain quantities and provenance.

## Relayer and UI provenance

The relayer regenerates readings from a stored scenario/seed/participant map; browser-provided readings are rejected. Gas-spending routes require a wallet-signed short-lived challenge/token bound to domain, chain ID and address, per-wallet/IP/day quotas, and allowlisted origin. Persist action state (`pending`, `confirmed`, `reverted`, `unknown`) with transaction hash and receipt. Serialize oracle sends; use unique idempotency keys and reconcile unknown outcomes from chain before retry. The production store must survive process restart. A public unauthenticated endpoint cannot spend gas.

The frontend renders four distinct provenance states: **model preview**, **sensor observation** (optional), **pending testnet transaction**, and **confirmed event-derived settlement**. Confirmed Wh/prices/VLT/certificates come from decoded receipts/logs and on-chain balance reads. A preview may animate if visibly labelled. Hash links are created only from actual submitted/confirmed transactions. On wrong network or disconnected wallet, show an explanatory state; never silently switch to mainnet. BridgeKey custom-network support is documented, but its browser injection API is **not yet verified**; P3 must test actual injection before identifying it by name.

The Neurick manual documents the ESP32-S3 application controller and P1 expansion header, shared I2C on GPIO8/9, and **3.3 V-only GPIO** (PDF pages 2, 6–10). It does not specify the models or electrical outputs of the user's GPS, satellite, raindrop, or temperature/humidity sensors. H1 must request those datasheets before a wiring diagram. No available external sensor measures house generation/consumption, and the board's battery-voltage monitor is not a substitute.

## Verification and source status

| Item | Current evidence | Status / next gate |
|---|---|---|
| RPC and chain ID | Live `eth_chainId` to `https://testnetrpc.mstblockchain.com` returned `0x5752035` (= 91562037); `eth_blockNumber` and latest block also answered on 28 Sep 2026. | **Verified read-only today**. Repeat before deployment. |
| Explorer | [MST Testnet explorer](https://testnet.mstscan.com/) loaded. | Site availability verified; actual contract/hash pages require P9. |
| Faucet | [Official MST Testnet Faucet](https://faucet.mstblockchain.com/) presents an address field. | Page verified; funding limit and successful use require a human wallet in P9. The plan's other faucet URL is unverified. |
| Native gas token symbol | [Ethereum chain registry](https://chainid.network/chain/91562037/) says `tMSTC`; the official faucet labels its distribution `MSTC`; starter says `MST`. | **Display symbol unresolved from primary source**. Use `tMSTC` provisionally in wallet-add metadata, confirm in BridgeKey before a public claim. VLT is the separate simulated settlement token. |
| EVM/Solidity | [MST site](https://mstblockchain.com/) describes EVM/Solidity support; `eth_getBlockByNumber` succeeded. | Marketing/read-only support only. Compiler opcode and contract behavior require P9 smoke deploy/receipt. |
| BridgeKey | [BridgeKey](https://bridgekey.io/multi-chain) describes custom EVM networks; its site and [Chrome Web Store](https://chromewebstore.google.com/detail/bridgekey/bfjojdcfenehemjgjlepdjomkpginlkg) describe dApp interaction. | **Injected provider name, EIP-1193/EIP-6963, add/switch and signing unverified**. P3/P6 require actual wallet test. |
| Hackathon rules, deadline, prizes, social track, submission form | Only the supplied implementation plan cites a separate guide. | **Unverified** until the actual rulebook is supplied/checked. Do not stop P1–P4. |
| Tariffs, wheeling charge, emissions factor, regulatory alignment | Illustrative values in the plan without the cited primary data. | **Modelling assumptions** only. P4/P11 must source any public factual claim. |

## P0 baseline

P0 dependency installation and compile/test/build results are recorded in `docs/coordination/README.md` after the commands complete. No testnet deployment or transaction was made in P0.

## P8 carbon implementation decision (28 September 2026)

The single non-overlapping certificate owner is the **solar seller**. The market increments `eligibleWh[dayId][seller]` by the seller-side integer amount in each confirmed matched P2P trade; buyers, grid imports/exports, and emergency batteries receive no eligibility. Day close snapshots factor/version at start and atomically mints at most one token for each nonzero seller total, bounded by the existing 16-house limit. The one-time `setCarbonCertificate` binding is required after sequential deployment and is checked against the certificate's immutable market address. Repeated API close calls reconcile to the same receipt; the contract itself rejects a second close, preventing a second mint.

The default `700 gCO2e/kWh` remains a **configurable, versioned modelling assumption**. `docs/evidence/SOURCES.md` has no suitable verified primary emissions source for it, so neither the token metadata nor the UI calls it an offset, credit, verified certificate of environmental attributes, or regulatory instrument. The factor source string is stored in on-chain token metadata. JSON and a compact SVG are generated as base64 data URIs in `tokenURI()`; minting does not write the image bytes to storage, so the SVG does not increase close transaction gas. Day/Wh/factor/version/derived-mg fields are immutable; retirement is a separate irreversible owner state that blocks transfer.
