# P3 frontend shell handoff

Status: **frontend shell complete; live settlement intentionally not wired**  
Date: 28 September 2026  
Owner: P3

## What shipped

The Hello demo home screen is replaced by a responsive VoltGrid dashboard shell in the existing Next.js 14 app. It includes:

- Accessible neighbourhood SVG with labelled homes, transformer, legend and modelled flow lines.
- Readable price chart with ₹/kWh units, modelled floor/cap band, feed-in/retail reference lines and an active preview point.
- Transformer load gauge with `role="meter"`, explicit Wh/capacity units and a 95% emergency-proposal threshold.
- Scenario controls for sunny, rainy and heatwave fixture days; a modelled EV toggle; play/pause/reset preview controls; no real-settlement action.
- Wallet and network panel with disconnect state, testnet-only network warning, add/switch action, provider discovery note, and disabled faucet/deposit/withdraw/opt-in actions.
- Transaction feed that never invents hashes or explorer links; it explicitly reports that confirmed activity is unavailable until a live relayer returns a receipt.
- Emergency VPP and carbon certificate placeholders with unavailable states and modelled-assumption labels.
- Persistent notice: “Meters are simulated. Once confirmed, settlement transactions are real MST Testnet activity.”
- A data-contract card defining `preview simulation`, `submitted / pending`, `confirmed on-chain` and `unavailable`.
- A local `lib/provenance.ts` adapter matching the frozen provenance union; every fixture snapshot carries a `model-preview` record with model version, scenario, seed and epoch index.

All economic values and carbon estimates shown in the shell are labelled as modelled assumptions. The deterministic fixture is local, repeatable and visually marked as preview data; it does not claim to be a meter observation, trade, balance, receipt or certificate.

## Wallet / BridgeKey decision

BridgeKey’s public multi-chain page documents custom EVM RPC networks and network switching, and its Chrome Web Store listing describes dApp interaction, switching and transaction signing. Neither page documents a proprietary injected global, EIP-6963 metadata, or a custom signing API.

The frontend therefore uses the starter’s standard wagmi `injected()` connector and observes standard EIP-6963 announcements in `hooks/useProviderDiscovery.ts`. It never guesses `window.bridgekey` or another proprietary API. If an announced provider name contains “BridgeKey”, the UI reports that fact; otherwise it candidly says BridgeKey-specific injection is unverified and offers the generic injected/manual route.

`useSwitchChain({ chainId: mstTestnet.id })` is the supported add/switch path. The wagmi injected connector handles an unknown-chain response by requesting `wallet_addEthereumChain`, then verifies the chain. The only configured chain is MST Testnet (`91562037`, `0x5752035`); the prior mainnet route was removed. Wallet-facing native gas is displayed as provisional `tMSTC` per the architecture notes, pending a human BridgeKey confirmation.

References checked: [BridgeKey multi-chain](https://bridgekey.io/multi-chain), [BridgeKey Chrome Web Store listing](https://chromewebstore.google.com/detail/bridgekey/bfjojdcfenehemjgjlepdjomkpginlkg), [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193), and [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963).

## Safety and provenance

- Removed the shipped burner-wallet playground and its `createRandom`/private-key flow: `components/SdkWalletPanel.tsx`, `hooks/useMstWallet.ts`, `lib/mstSdk.ts`.
- Removed the Hello contract hook and screen path: `hooks/useHello.ts` and the old `app/page.tsx` implementation.
- No browser code accepts, generates, stores, displays or bundles a private key.
- No fake transaction hash is present. Explorer links are not rendered by the preview feed; a future link must be built from a relayer-returned actual hash.
- Faucet, VLT deposit, VLT withdrawal, battery opt-in, day close and certificate retirement remain disabled with actionable missing-ABI/deployment messages.
- The same-origin RPC route is testnet-only, rejects the old mainnet route, limits body size to 64 KiB, rejects batches, and allows only the required read methods. Wallet writes continue through the user’s EIP-1193 provider.

## Verification performed

All commands were run from `C:\thanmay\mst\voltgrid` without installing packages, editing the lockfile, committing, deploying or signing a transaction. The npm executable was invoked from `C:\Program Files\nodejs` as recorded by P0.

| Check | Result |
|---|---|
| `npm run build --workspace frontend` | **PASS**. Next.js production build, lint and type validation completed. Existing optional dependency warnings remain for `encoding` via MetaMask SDK and `pino-pretty` via WalletConnect. npm also reports the existing pnpm-only `link-workspace-packages` config warning. |
| `npx tsc -p packages/frontend/tsconfig.json --noEmit --incremental false` | **PASS** |
| `npm run lint --workspace frontend` | **PASS**, no ESLint warnings/errors |
| Browser desktop load at `http://127.0.0.1:3000/` | **PASS**. Title, persistent simulation notice, controls, wallet state, SVG map, gauge, price chart, transaction feed, emergency panel and carbon panel were visible in the accessibility tree. |
| Keyboard navigation | **PASS**. First `Tab` focused “Skip to dashboard”, the next focused the dashboard home link, and subsequent focus reached the scenario controls. Focus-visible styles are defined globally. |
| Narrow browser viewport | **PASS**. In-app browser reported `innerWidth: 662`, `innerHeight: 594`, `matchesMobile: true`; `document.documentElement.scrollWidth: 648`, so there was no horizontal overflow. The scenario controls collapsed to a single column in the captured narrow view. |
| Browser wallet state | **PASS / expected unavailable**. No wallet provider was installed in the local browser session, so the UI showed “Disconnected”, “BridgeKey-specific injection not verified”, MST Testnet required, and disabled ABI-dependent actions. No connection or signing prompt was attempted. |
| Browser console | **PASS**. No warning/error entries were returned during the local check. |
| Browser secret/hash scan | **PASS for app chunk**. `page.js` contained no 32-byte hex literals, `BEGIN PRIVATE KEY`, `DEPLOYER_PRIVATE_KEY`, `ORACLE_PRIVATE_KEY`, `PRIVATE_KEY=`, `createRandom` or `burner` literals. Vendor viem source maps contain documentation examples, which are not VoltGrid data. |

Screenshots were captured during the local browser check (desktop hero/notice and the narrow scenario-control view) but were not committed because this P3 handoff is limited to code/docs and no screenshot artifact path was required.

## P6 integration points / missing shared dependency

The frozen `packages/shared/src/contracts.ts` is still an empty deployment map, and P3 did not edit shared packages. P6 must provide the generated ABI/address adapter for `VoltToken`, `VoltGridMarket` and any shipped `CarbonCertificate`; no frontend contract action should be enabled before those are backed by verified deployment evidence.

P6 should wire the following without changing the current provenance rules:

1. Replace the local preview source with the relayer client for `/v1/days`, `/v1/days/:dayId/epochs/:epochIndex/advance`, status polling and `/v1/events`. Persist browser `clientRunId`/`clientRequestId` as specified by `INTERFACE.md`.
2. Map relayer action states to the existing status badges. Pending responses may show an actual submitted hash, but only successful receipt/log decoding may become `confirmed on-chain`.
3. Add a typed shared contract/deployment dependency or local adapter boundary for `deposit`, `withdraw`, `setBatteryOptIn`, faucet, `closeDay` and `retire`; keep the UI disabled for unavailable functions and ABI errors.
4. Replace fixture price/load/carbon numbers with relayer/sim-core values only when provenance is carried alongside the value. Preserve the “modelled assumption” copy for tariffs, transformer capacity, emergency tariff and carbon factor.
5. Exercise BridgeKey in an actual extension-enabled browser. Confirm whether it announces EIP-6963 metadata or only exposes legacy `window.ethereum`, and confirm `wallet_addEthereumChain`, `wallet_switchEthereumChain` and signing behavior. If absent, retain the generic/manual route and do not add a guessed API.
6. Re-run a clean-browser wrong-network test with an injected wallet. The current warning/switcher logic is implemented but could not be exercised because the local verification browser had no wallet extension.

No shared package, contract, simulator, relayer, root configuration or lockfile was edited by P3. Existing concurrent worktree changes outside the P3 ownership boundary were left untouched.
