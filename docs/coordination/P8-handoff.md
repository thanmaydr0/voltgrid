# P8 carbon-certificate handoff

Status: **local implementation and verification gates passed** on 28 September 2026. No public deployment, testnet transaction, publish, commit, or push occurred. Work was coordinated in this chat; the P1–P7 workspace changes were preserved.

## Prerequisites and frozen choices

- P6 local integration and P7 emergency evidence were reviewed, along with `DECISIONS.md`, `INTERFACE.md`, the actual market/relayer/frontend code, and the implementation plan as reference. P7 had passed; the normal P6 flow remains covered by the sunny/rainy runs.
- The frozen rule is implemented verbatim: **only solar sellers' integer matched P2P Wh**, accumulated from positive `TradeSettled.wh` seller rows, can mint. Buyer totals are not counted, and grid import/export and emergency discharge are excluded.
- Ownership is one non-overlapping side: the solar seller. The illustrative factor defaults to 700 gCO2e/kWh, version 1. `docs/evidence/SOURCES.md` records no verified primary source, so the factor is a configurable modelling assumption; no verified offset/credit claim is made.
- `INTERFACE.md` was amended additively: existing `CertificateMinted` fields/signature are unchanged; `CarbonFactorApplied` provides the factor-version snapshot; `setCarbonCertificate` records the one-time market binding needed by sequential deployment. A P8 day fails closed if the certificate is not bound.

## Implementation and exported surface

- `packages/contracts/contracts/VoltGridMarket.sol`: `eligibleWh(dayId,seller)` accumulates seller-side matched Wh during each normal settlement. `setCarbonFactor(factorGPerKwh,factorVersion)` is owner-only, bounded to 1–2,000, monotonically versioned, and future-day-only. `startDay` snapshots it. Atomic `closeDay` emits `CarbonFactorApplied`, mints no more than one token per eligible seller (max 16 registered houses), emits the frozen `CertificateMinted` fields, and finally emits `DayClosed`. Any mint failure reverts the whole close. A second on-chain close reverts rather than minting twice.
- New `packages/contracts/contracts/CarbonCertificate.sol`: ordinary ERC-721, only the immutable configured market can mint; per-token day ID, eligible Wh, factor, factor version and exact avoided mgCO2e are immutable. `tokenURI` generates base64 JSON and a compact SVG on demand; the media bytes do not add storage writes to close-day gas. Metadata states the factor is a configurable modelling assumption with no primary source verified and identifies confirmed simulated seller-allocation provenance. The current token owner alone can irreversibly retire; transfers after retirement revert.
- `packages/contracts/scripts/deploy-local.ts` deploys Market then CarbonCertificate, binds them once, and records the certificate deployment. This script was not run against testnet.
- Shared browser ABI exports `CARBON_CERTIFICATE_ABI`; public address configuration adds `NEXT_PUBLIC_VOLT_CERTIFICATE_ADDRESS`. The UI gallery uses only a confirmed `DayClosed` receipt and its `CertificateMinted` logs, queries owner/data/retired/tokenURI from the certificate contract, renders the SVG, displays the 24-hour deterministic model replay and receipt-derived outcomes, and offers a wallet-signed retire call only to the owner on the expected chain. The last closed run survives refresh/new days locally.
- No new route was added. `POST /v1/days/:dayId/close` now returns `closeAction` (also in `actions[0]`) with receipt-derived `metrics: { factorGPerKwh, factorVersion, totalEligibleWh, totalAvoidedMgCo2e, certificates }`. Each certificate record includes token, seller, exact Wh/factor/version/mg, tx hash, block/log index and event-emitter address. The relayer requires one matching `DayClosed` and exactly one factor snapshot, validates uniqueness and `eligibleWh * factor == avoidedMgCo2e`, and records the metrics durably. `GET /v1/days/:dayId` and `/v1/days/current` return the persisted/reconciled `closeAction` so the gallery can resume after refresh/restart. `/v1/events` includes market mint events.

No corporate buy flow was added. The only existing public environment name added for this feature is `NEXT_PUBLIC_VOLT_CERTIFICATE_ADDRESS`; no secret value is required in the browser.

## Verification

Final commands/results:

```text
& 'C:\Program Files\nodejs\npm.cmd' test
PASS: sim-core 13/13; contracts 23 passing; relayer 9/9. Includes sunny/rainy 24-epoch days and the heatwave day.

& 'C:\Program Files\nodejs\npm.cmd' run test:local --workspace=voltgrid-relayer
PASS: 2 integration tests. Sunny and rainy days each closed with 24 normal confirmed outcomes; heatwave completed 24 ordered outcomes (18 normal, 6 emergency). All mint amounts/owners/metadata were reconciled to logs and contract state.

$env:Path = "C:\Program Files\nodejs;$env:Path"; & 'C:\Program Files\nodejs\npm.cmd' run build
PASS: sim-core, relayer, frontend (3/3 Turbo tasks). Existing optional wagmi bundle warnings for `encoding` and `pino-pretty` remain.

$env:Path = "C:\Program Files\nodejs;$env:Path"; & 'C:\Program Files\nodejs\npm.cmd' run lint
PASS: zero errors. Four Solhint warnings remain: pre-existing Hello import and immutable naming conventions (two existing market fields plus the new certificate market field).

& 'C:\Program Files\nodejs\npm.cmd' run typecheck --workspace=voltgrid-relayer
PASS.

& 'C:\Program Files\nodejs\npm.cmd' run compile --workspace=contracts
PASS: Solidity 0.8.20; the root test also passed the contracts compile prerequisite.
```

Contract tests cover zero eligibility, seller rounding, trade plus import/export and emergency epochs, market-only mint, factor snapshot/authority/bounds, exactly-once per seller/day, repeated close, owner-only retirement, retired transfer rejection, JSON/SVG decode/render, and metadata immutability. The local E2E compares all minted seller amounts to the seller rows in confirmed `TradeSettled` events, compares daily totals to `EpochSettled`, reads each `eligibleWh` and ERC-721 record, parses URI JSON/SVG, confirms receipt status/logs, retries close concurrently, then reloads the relayer store and verifies gallery metrics survived restart. Sunny owner retirement was signed on the local test account and confirmed against the `CertificateRetired` event.

Maximum certificate close gas on a 16-house day with 15 nonzero solar sellers: **2,606,310 gas**. Four-certificate local closes used **747,886** (sunny/heatwave) and **679,486** (rainy) gas. The P7 heatwave lifecycle plus P8 close used **6,064,577 gas / 38 submitted transactions**.

### Local-only receipt evidence

Hardhat chain ID `31337`; ephemeral local addresses: Market `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`, CarbonCertificate `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`. These hashes are not testnet explorer links.

| Scenario | Day ID | Close block / receipt | Certificates | Eligible seller Wh | Derived mgCO2e | Gas |
|---|---|---|---:|---:|---:|---:|
| Sunny | `0x06715f7bdca87c03f42c28fd8952378787a59e47cca7e9d317caf4b2a6b60ef3` | 49 / `0x46f2dd31e021962e508ce2fd7b28808123bf49af20a44de54a240bcdc0006280` | 4 | 74,787 | 52,350,900 | 747,886 |
| Rainy | `0x96ff8abb210caac5a8cb648638aed3331b8a6ca6ec7a3cabeca526e1e55d2e81` | 76 / `0x79d2b37fe908b4ac16e4a51307f27e93bbbeec85c0964be45159ec400b218dbf` | 4 | 14,645 | 10,251,500 | 679,486 |
| Heatwave | `0xbe25c51e2f090b166abef90c3c070ac3c6b74b9ed83a7cdef3b8c5799f93ef68` | 63 / `0x20cbcca0ec6114dc429f45fe281a657a9417d0b699fbf20cece6a87d13a75e48` | 4 | 75,440 | 52,808,000 | 747,886 |

Example sunny receipt emitted four `CertificateMinted` records at factor 700/version 1: token 1, seller `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`, 17,226 Wh, 12,058,200 mg; token 2, seller `0x90F79bf6EB2c4f870365E785982E1f101E93b906`, 20,090 Wh, 14,063,000 mg; token 3, seller `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc`, 17,107 Wh, 11,974,900 mg; token 4, seller `0x14dC79964da2C08b23698B3D3cc7Ca32193d9955`, 20,364 Wh, 14,254,800 mg. Every record shares the close transaction above and matches its seller's `eligibleWh` state. The local retirement receipt for token 1 is block 50, `0xf7e6e9b7e009bf731146a3a4f5716c5c49b87b1bcd98f474e80b3129a6afe0c0`.

Expanded receipt evidence is in `docs/evidence/INTEGRATION.md` and in the output of `test:local`; no public chain proof is implied.

## Pending human wallet check and P9 requirements

P8 changed contract bytecode/ABI; old P6/P7 addresses do not implement it. P9 must deploy the updated token/market/certificate set separately, bind the certificate before granting the oracle a new day, and confirm the actual binding/deployment receipts. Configure the token, market, certificate and relayer endpoints with verified deployment addresses; set `NEXT_PUBLIC_VOLT_CERTIFICATE_ADDRESS` to the actual certificate deployment. Keep all relayer/deployer keys server-side.

After a P9 deployment and a connected wallet owns a seller record:

1. Connect a supported injected wallet on MST Testnet and verify the certificate contract address and day’s close transaction in the explorer.
2. Complete a sunny simulated day and wait for all 24 confirmed outcomes. Close it and verify each displayed seller Wh/factor/version/mg against `CertificateMinted` logs and the certificate's immutable `certificateData`/`tokenURI`.
3. Connect the wallet that owns one minted solar-seller token; click **Retire this record** and approve the contract call. Verify `CertificateRetired(tokenId,owner)` and `retired(tokenId)=true` on chain; attempt transfer only if the wallet safely supports it, expecting a revert.
4. Refresh the page. Confirm the same receipt-backed gallery, retired status, and actual mint/retirement transaction links remain; no preview-only day value is presented as settled.

This manual wallet signature/browser check is **pending**. No testnet deployment was made for P8. A primary emissions factor is also unresolved; until one is verified and incorporated as a new factor version, the UI/metadata must retain the modelling-assumption and no-verified-claim wording.
