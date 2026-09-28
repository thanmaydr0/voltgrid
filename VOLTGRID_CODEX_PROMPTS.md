# VoltGrid: copy-and-paste Codex build prompts

Prepared from `C:\Users\chiranth\Downloads\VOLTGRID_IMPLEMENTATION_PLAN.md`, `C:\Users\chiranth\Downloads\Neurick_Manual.pdf` (17 PDF pages), the four sensors named by the project owner, and a read-only inspection of the existing repository on 28 September 2026.

## How to run this

1. Open the **same Codex project folder**, `C:\thanmay\mst\voltgrid`, in every chat. Do not create separate worktrees for the parallel group. The existing repo is a `create-mst-app` **Next.js 14 / Hardhat / npm workspaces** starter under `packages/frontend`, `packages/contracts`, and `packages/shared`. Keep it; do not silently replace it with the plan's Vite layout.
2. Paste **Prompt 0** into one chat and wait for its acceptance gate. It freezes the interface and records the current state. Then paste **P1, P2, P3, and P4** into four separate chats. These four are **PARALLEL** and have disjoint write ownership.
3. After P1 and P2 pass, run **P5**. After P1–P5 pass, run **P6**. Run P7, P8, P9, and P10 in order. Run **H1/H2 only if time and the actual hardware permit**. Run P11 at the end.
4. In every chat, paste the whole fenced prompt. Each prompt tells the agent what to build, how to verify it, and what to report. If a gate fails, keep that chat working until it passes or records a specific external blocker. Do not mark a phase complete because code was merely written.
5. Parallel chats share the same files and Git index. During P1–P4, **do not let any chat install dependencies, edit root `package.json`/lockfiles, commit, push, deploy, or change another chat's owned files**. P0/P6 are the only coordinators for shared config and dependency installation. Stop overlapping file changes and send the relevant owner the request. Wait for P0's interface freeze before starting parallel chats.

### Sequence and ownership

| Prompt | Start | Files it may edit | Completion proof |
|---|---|---|---|
| P0 — audit and architecture freeze | First | `docs/architecture/**`, `docs/coordination/**`, root config only if essential | Decisions, frozen types/events, baseline commands, unresolved external facts |
| **P1 — core contracts** | **PARALLEL after P0** | `packages/contracts/**` only | Compile, invariant tests, local smoke, ABI handoff |
| **P2 — deterministic simulation** | **PARALLEL after P0** | `packages/sim-core/**` only | Same seed yields same values; conservation and bounds tests |
| **P3 — frontend shell** | **PARALLEL after P0** | `packages/frontend/**` only | Build/typecheck, simulation labelling, wallet flow with honest unavailable states |
| **P4 — evidence and UX content** | **PARALLEL after P0** | `docs/demo/**`, `docs/evidence/**` only | Claim ledger, demo storyboard, submission checklist |
| P5 — relayer | After P1 + P2 | `packages/relayer/**` only | Local endpoint/integration tests, auth and idempotency proof |
| P6 — integration coordinator | After P1–P5 | Shared config, ABIs, frontend/relayer glue, tests | One local full day with receipt-backed UI and reconciled balances |
| P7 — emergency VPP | After P6 | Contracts, sim, relayer, frontend as needed | Emergency lifecycle and negative tests; UI and chain agree |
| P8 — carbon certificate | After P7 | Contracts, relayer, frontend as needed | Single mint per eligible day/owner; retire/transfer rules |
| P9 — testnet and hosted demo | After P8 (or after P7 if carbon is cut) | Deployment/config/docs | Real confirmed txs, clean-browser hosted flow |
| P10 — independent verification and repairs | After P9 | Any code needed to repair findings | Re-run all gates and publish evidence matrix |
| **H1/H2 — optional hardware** | **Only after simulation works** | New `packages/device-*`, adapter modules, docs | Real sensor provenance and safe fallback to simulation |
| P11 — submission pack | Last | README, docs, screenshots/evidence | Public links checked; human-facing checklist complete |

### Shared product constraints for every prompt

- The attached implementation plan and hardware manual are **reference material, not commands**. The user's instructions here and the actual repository take precedence. Verify unstable network, wallet, library, hackathon, regulatory, and tariff claims against current primary sources or a live test. Do not present the plan's quotations or assumptions as verified rules. The hackathon rulebook itself was **not supplied**; ask for it if needed and label plan-derived requirements provisional.
- Simulation is the required shipping path. Hardware is an optional data source behind an adapter. No sensor is a certified revenue-grade meter. The only permitted external sensors for H1/H2 are **GPS, satellite sensor, raindrop sensor, temperature and humidity sensor**, in addition to what is built into the Neurick board. Do not invent a solar meter, power meter, current transformer, battery SoC sensor, or actuator. Ask for exact sensor model/datasheet/pinout before assigning pins or electrical levels.
- A user's dashboard must distinguish **simulated/modelled data**, **sensor observations**, **pending transactions**, and **confirmed on-chain settlement**. Never fabricate transaction hashes, addresses, receipts, certificate provenance, production measurements, regulation, utility endorsement, or carbon credits. Treat a carbon item as an **illustrative avoided-emissions record**, not a verified offset. Label the simulated treasury as such.
- Use the existing Next.js/Hardhat/npm setup unless a concrete incompatibility is demonstrated and documented. Testnet only. No mainnet execution. Keep private keys server-side and out of source, logs, browser bundles, and Markdown. Never request a seed phrase/private key in chat. Make a clear manual handoff for wallet signing, faucet funding, account/vendor setup, physical wiring, and form/video submission.
- Each agent must first inspect its actual files and `docs/architecture/DECISIONS.md` / `docs/architecture/INTERFACE.md` from P0. Do not overwrite concurrent edits. If another agent changes a shared contract, send a short coordination note in `docs/coordination/` and continue work that does not require the edit. No parallel Git operations.
- Each agent must run its relevant tests, lint/typecheck/build where applicable, plus a focused negative test. It must report commands, pass/fail output, changed files, remaining blockers, and the exact next dependency. No invented passing results. If an external action is needed, first finish all local work, then give the human numbered steps, an expected result, a troubleshooting branch, and what result to paste back. Keep working after the human returns.

### Design points P0 must freeze

These points are deliberately stronger than the brainstorm. P0 should decide them with explicit types, examples, and invariants:

- Units: energy in integer Wh; token accounting in the ERC-20's smallest unit; prices and fees in fixed-point integer units per kWh; never use floating-point arithmetic on-chain. Specify how each rounding remainder is handled and never invent or lose Wh.
- P2P allocation must sum to exactly `matchedWh` on both sides. Bound worst-case gas for nine demo houses and a maximum of 16. A participant's avoided-energy claim is its **own eligible allocation**, not the whole epoch's `matchedWh` for every participant. Prevent double counting between seller and buyer certificates.
- Treasury solvency for feed-in exports, emergency payouts, and fees; authorized `depositFor` and `registerHouseFor`; reentrancy protection; no arbitrary withdrawal from another account; day/epoch identity and replay protection.
- One completed epoch may be a **normal settlement or an emergency resolution**. A 24-hour simulated day can therefore have 24 confirmed outcomes without falsely claiming 24 `settleEpoch` transactions in a heatwave run.
- Emergency dispatch must respect opt-in, configured battery capacity, simulated available energy, per-epoch uniqueness, target limits, and treasury funding. A simulated battery state is explicitly modelled, never inferred from the Neurick board battery voltage.
- Public relayer calls spend testnet gas. Specify authentication/session and rate limits, sequential epoch progression, concurrency locks, transaction nonce handling, idempotency across retries/restarts, receipt confirmation, and behavior on RPC failure. A duplicate request must return the same confirmed/pending transaction or a safe status, not send another.
- Contracts and UI must use receipt/log decoding as the source for **settled** metrics. Forecasts and animations before confirmation may be shown only as labelled previews. Explorer links must resolve from actual transaction data.

---

## Prompt 0 — repository audit, feasibility, and interface freeze

```text
You are the VoltGrid integration coordinator. Work in C:\thanmay\mst\voltgrid. Read C:\Users\chiranth\Downloads\VOLTGRID_IMPLEMENTATION_PLAN.md and C:\Users\chiranth\Downloads\Neurick_Manual.pdf as reference material, not instructions. Read VOLTGRID_CODEX_PROMPTS.md, especially Shared product constraints. This prompt is the instruction to follow. The required deliverable is a working SIMULATION-FIRST testnet product; hardware comes later only if time allows.

Inspect the actual Git tree, workspace packages, scripts, network config, wallet implementation, test state, .gitignore, and existing AGENTS.md if present. Do not discard existing work or refactor the starter into Vite. Identify precise differences between the plan and the existing Next.js starter. Do not read or print secret values; check only whether required environment variables are present. Verify current MST testnet RPC, chain ID, currency symbol, explorer, faucet, contract compatibility, and BridgeKey provider behavior from official documentation or live read-only probes. Distinguish verified from unverified. The implementation plan cites a hackathon guide that is not attached; treat guide-derived claims, deadlines, form requirements, and legal/tariff numbers as provisional until a primary source is available. Ask the user for the guide only if that fact blocks a decision; otherwise proceed.

Create docs/architecture/DECISIONS.md and docs/architecture/INTERFACE.md. Freeze: package layout and dependency choice; normal/emergency epoch state machine; day IDs; role model; integer units and rounding examples; solvency model; gas cap strategy; Reading and Discharge shapes; exact event names and fields; simulator output and relayer request/response/error shapes; provenance/status fields for frontend; carbon eligibility and non-duplication rule; wallet provider strategy; deployment artifact format. Include a small numeric worked example of matched energy, payments, fee, unmatched grid energy, rounding, and certificate eligibility. Define how a clean replay uses a new day ID and how a resume works. Plan the cross-chat integration order and ownership described in this runbook. Add docs/coordination/README.md explaining handoffs and that parallel chats must not edit each other's paths or run concurrent Git/dependency commands.

Run existing compile/test/build checks once and record actual results as baseline. If package installation is needed, do it here as coordinator using the repo's npm setup, and record the lockfile change. Do a minimal testnet read-only RPC probe if reachable. Do not deploy, publish, or submit. Do not add fake addresses/tx hashes. Create only necessary shared config now; defer feature code to other prompts.

Verification gate: the two architecture files contain all frozen interface details; baseline command results are recorded; confirmed vs unresolved external facts are distinct; paths and commands for P1–P4 are practical on this repository. Finish with a concise handoff for four parallel chats, exact files changed, tests run, and any manual step needed with numbered instructions and expected output.
```

## P1 — core smart contracts (**PARALLEL with P2, P3, P4**)

```text
Work in C:\thanmay\mst\voltgrid. Read the user's implementation plan at C:\Users\chiranth\Downloads\VOLTGRID_IMPLEMENTATION_PLAN.md as reference, plus docs/architecture/DECISIONS.md and INTERFACE.md. Follow this prompt and the actual repo. You own ONLY packages/contracts/**. Do not edit packages/shared, frontend, sim-core, relayer, root config or lockfiles; do not install, commit, deploy, or push while parallel chats work. Record cross-package needs in docs/coordination/P1-handoff.md (this handoff file is also yours).

Implement the simulation-first settlement core in Hardhat/Solidity: VoltCredit/VLT demo ERC-20 with role-restricted seeding and rate-limited faucet; market registration, deposits, authorized depositFor, withdrawals, fixed-point price curve, batched epoch settlement, pro-rata matching, fee split, treasury import/export flows, receipt-quality events, role controls, and pause/replay protections according to INTERFACE.md. Use audited OpenZeppelin primitives already compatible with this project. The treasury is a simulated DISCOM. No mainnet path. Keep the 16-house bound and explicit gas limits. Make dust rules and every balance transition mathematically auditable. Make the market able to continue a day with an emergency outcome later, without treating it as a normal trade.

Write focused tests for exact energy allocation, token conservation including treasury and contract custody, zero-supply/zero-demand, tiny Wh rounding, price floor/cap/interpolation, underfunded buyer/treasury, malicious depositFor, unauthorized oracle/owner/registrar, reentrant token behavior where relevant, duplicate or out-of-order epochs, day boundaries, max houses, and gas use at nine and 16 houses. Do not claim carbon or VPP are finished in this prompt. Supply deploy/seed/smoke scripts that can run locally and are ready for P9 testnet use, but never output invented addresses or hashes. The starter's deploy script writes into packages/shared; do not run or extend that cross-package writer during this parallel phase. Use a test-local deployment path and leave shared ABI/export updates to P6.

Verification gate: Hardhat compile and contract tests pass; a local deploy + one seeded settlement has a confirmed receipt, decoded events, and exact expected balances; report gas at nine and 16 houses, whether within the actual testnet block limit if known, and any assumption not yet verified. Write P1-handoff with ABI/event/function signatures, how to get generated artifacts, and commands/results. If a signature must change, coordinate in the handoff and leave INTERFACE.md untouched for the coordinator to update.
```

## P2 — deterministic simulation core (**PARALLEL with P1, P3, P4**)

```text
Work in C:\thanmay\mst\voltgrid. Read the plan at C:\Users\chiranth\Downloads\VOLTGRID_IMPLEMENTATION_PLAN.md as reference and the frozen docs/architecture/DECISIONS.md and INTERFACE.md. You own ONLY packages/sim-core/** and docs/coordination/P2-handoff.md. Do not edit any existing package, root config, lockfile, contracts, frontend or relayer; do not install, commit or deploy. If npm workspaces need registration, write that request in the handoff for P6.

Build a pure TypeScript, deterministic, versioned simulator: 8 seeded households plus optional connected-user house; solar/battery, solar-only, EV, regular load profiles; sunny/rainy/heatwave scenarios; hour/seed/scenario/house inputs; integer Wh generation/consumption; transformer stress; modelled weather; battery capacity and available-energy state; eligible emergency discharge; off-chain price preview matching the frozen on-chain curve. Use deterministic seeded PRNG or pure formulas, never Math.random/Date.now inside simulation. Define immutable output records with source='simulation', scenario, seed, model version, day ID, epoch index, and units. Reject invalid values/duplicate house IDs. Do not pretend GPS, satellite, rain, temperature or humidity are already connected; reserve an optional input-adapter interface without changing the default results.

Test repeated runs with identical inputs, changes under different seeds/scenarios, 24-hour totals, zero/night solar, battery SoC limits, overload trigger, impossible sensor values, integer bounds, and compatibility against INTERFACE.md Reading/Discharge shapes. Include golden fixtures small enough to inspect. Do not write feature code in other packages to make tests pass.

Verification gate: package typecheck/tests pass; two independent runs of each scenario with the same seed serialize identically; readings stay within frozen numeric bounds; a heatwave actually crosses the frozen emergency threshold and a sunny day yields representative surplus. Record commands/results and exported API in P2-handoff.
```

## P3 — dashboard and wallet shell (**PARALLEL with P1, P2, P4**)

```text
Work in C:\thanmay\mst\voltgrid. Read the plan at C:\Users\chiranth\Downloads\VOLTGRID_IMPLEMENTATION_PLAN.md as reference, then docs/architecture/DECISIONS.md and INTERFACE.md. You own ONLY packages/frontend/** and docs/coordination/P3-handoff.md. Do not edit shared packages, contracts, sim-core, relayer, root config or lockfiles; do not install, commit or deploy. The actual starter is Next.js 14 with wagmi/viem and an MST SDK example. Extend it; do not create a Vite app. Avoid bundling a private key or writing one into the UI.

Replace the Hello demo home screen with a usable VoltGrid dashboard shell: accessible responsive neighbourhood SVG, readable price chart/band, transformer load gauge, tx feed, wallet panel, scenario/day controls, emergency panel and carbon panel placeholders. A persistent notice must state that meters are simulated and settlement transactions, once confirmed, are real MST Testnet activity. Show data status per card: preview simulation, submitted/pending, confirmed on-chain, or unavailable. A preview may animate, but must never masquerade as a confirmed trade. The shell can use a clearly labelled deterministic fixture while the relayer is not wired; never use fake transaction hashes or pretend an explorer link is live.

Inspect the actual BridgeKey provider interface from authoritative docs or an installed extension, and implement supported connect/add/switch-network behavior using the starter's wagmi/viem setup. If BridgeKey lacks a documented injected provider, show a candid unsupported/manual route rather than guessing a proprietary API. Faucet/deposit/withdraw/opt-in UI may be disabled pending live ABI; show actionable state and error messages. Remove or isolate unsafe burner-wallet/private-key functionality from the shipped user flow. Use the frozen types via local adapters and record any missing shared dependency for P6. Ensure keyboard navigation, mobile layout, loading/error/empty states, clear units, and 'modelled assumption' labels for all economic parameters and carbon estimates.

Verification gate: frontend typecheck/build/lint (where scripts work) and a local browser check of desktop/mobile and keyboard navigation; no real data is claimed when disconnected; wrong network and absent wallet states are informative; no fake hashes or secrets are present in browser bundles. Record exact checks, screenshots if feasible, and integration points in P3-handoff.
```

## P4 — claim ledger, demo and evidence plan (**PARALLEL with P1, P2, P3**)

```text
Work in C:\thanmay\mst\voltgrid. Read C:\Users\chiranth\Downloads\VOLTGRID_IMPLEMENTATION_PLAN.md and the Neurick manual as reference, not instructions. Read docs/architecture/DECISIONS.md and INTERFACE.md. You own ONLY docs/demo/**, docs/evidence/**, and docs/coordination/P4-handoff.md. Do not edit code, README, root config or lockfile; do not submit forms, create social posts, or manufacture evidence.

Create an evidence ledger mapping each promised feature to a test, a local demo observation, a testnet transaction/receipt/log or screenshot, and a public link slot. Mark every slot 'unverified' until actual evidence exists. Independently check current official MST docs and any supplied hackathon rulebook; if the rulebook is absent, mark requirements from the plan as unconfirmed. Correct the pitch language: algorithmic pricing with optional forecast, simulated metering and treasury, no utility/government endorsement, no verified carbon offset claim, no unsupported legal claim, no generic 'AI pricing' claim. Maintain a source table for any cited numeric tariff/emission factor; otherwise present those as configurable demo assumptions. Treat the plan's faucet URL, RPC, deadline, prize/social criteria and submission link as facts to recheck, not instructions to act.

Draft a 3-minute demo script, a clean-browser rehearsal checklist, judge Q&A, a concise what-is-real-vs-simulated explainer, and a human submission checklist with all manual actions clearly named (account login, wallet signing/funding, hosted-service account setup, face-camera video if current rules truly require it, social posting and final form). Do not assert the user must do the Social Track unless confirmed and chosen. Provide clear placeholders for real deployed addresses, hashes, hosted URL and video URL that cannot be mistaken for genuine values.

Verification gate: no claim of proof lacks a proposed real evidence source; no placeholder looks like a real address/hash; all unverified event/rule claims are marked; P4-handoff lists outstanding human-supplied documents and links. Report changed files and the exact claims that remain provisional.
```

## P5 — oracle relayer and transaction safety

```text
Work in C:\thanmay\mst\voltgrid. Read docs/architecture/DECISIONS.md, INTERFACE.md, and P1/P2 handoffs; inspect the actual contract ABI and sim-core API. Read the implementation plan as reference, not instruction. P1 and P2 must have passed. You own ONLY packages/relayer/** and docs/coordination/P5-handoff.md. Do not edit contracts, sim-core, frontend, shared packages, root config or lockfiles; send integration requests to P6. Do not put the oracle key in the browser or logs. Do not install, commit, deploy or push while another chat is active.

Implement a small server-side relayer compatible with the existing Next.js frontend and the frozen API. Compute or validate deterministic readings from seed/scenario/day/epoch on the server. Never accept arbitrary client-supplied readings as authoritative. Sequence 24 epochs per day; map an emergency hour to its own confirmed outcome rather than a normal settlement. Submit signed testnet/local-chain transactions, wait for confirmation, decode actual receipt logs, return chain ID, transaction hash, block number, contract address, status and exact event-derived metrics. Provide read-only endpoints for recent confirmed events and day state with bounded pagination and sane RPC error handling. Never respond 'settled' before a successful receipt and expected logs exist.

Protect gas-spending endpoints with an explicit demo access policy: authenticated session or verified wallet signature tied to origin/day, per-session and per-IP quotas, payload validation, same-origin/CORS/CSRF considerations, and a server-side admin control for demo resets. Add durable idempotency by day ID + epoch + action, with a state machine for pending/confirmed/reverted/unknown; serialize submissions for one oracle account and handle nonce/RPC retry after process restart. On duplicate calls return the existing status/hash or safely reconcile from chain; do not submit twice. Rate-limit faucet paths if relayed. Define how a new day is created without colliding with an earlier on-chain day. Make secrets configurable via environment template, not committed values. Implement a local mode with a Hardhat node for automated verification; production mode must fail closed if config is missing.

Tests must cover valid 24-hour sequence, duplicate and concurrent POSTs, out-of-order calls, forged readings, unauthenticated requests, exhausted quotas, wrong chain ID, RPC timeout/unknown receipt, revert, restart recovery, and no duplicate tx for the same epoch. At minimum run a local contract + relayer integration test that confirms one normal epoch and decodes its true receipt. Report any security or hosting tradeoff that P6/P9 must resolve.

Verification gate: local integration tests pass; 24-hour run produces exactly 24 confirmed epoch outcomes where no emergency occurs; simultaneous retry does not increase on-chain outcome count; no endpoint exposes keys; status and metrics reconcile with receipts. Record commands/results, required env variable *names only*, endpoint contract and handoff in P5-handoff.
```

## P6 — end-to-end integration and first complete simulated day

```text
You are the sole VoltGrid integration coordinator for this phase. Work in C:\thanmay\mst\voltgrid. Confirm P1–P5 gates and read all docs/coordination/*-handoff.md, docs/architecture/DECISIONS.md and INTERFACE.md, the actual code, and the plan as reference. Stop or coordinate with any chat still editing shared files. You may edit shared config, package manifests/lockfile, ABI exports, frontend integration, relayer adapters and tests now. Preserve unrelated changes and do not overwrite another person's work. Install dependencies once using the repository's actual npm/workspace setup. Keep testnet deployment separate for P9.

Wire the existing Next.js UI to the real sim-core preview, relayer API, contract ABIs, wallet actions and event reader. Update the frozen interface docs when implementation differences are unavoidable and notify owners in coordination notes. Make Play Day a resumable state machine: choose scenario and seed, create unique day ID, show 24 hours, await each receipt or safely retry, and reconcile every displayed settled value from decoded logs. Make page refresh/resume and duplicate clicks safe. Supply accessible wallet flow for supported BridgeKey/injected provider, including network check, VLT faucet, approval/deposit, withdrawal and balance read; require human wallet confirmation for writes. The UI must not display a hard-coded hash or an unconfirmed preview as settled. Keep modelled assumptions and simulated treasury obvious. When disconnected/offline, show an honest useful state.

Run a local seeded full-day integration test from clean chain state and a second run with a different day ID. Compare simulator outputs to submitted readings, receipts, event totals, account balances, treasury balance and UI values. Verify exactly 24 final epoch outcomes per completed day, no duplicates, no skipped hours, and reproducible results for the same seed. Test refresh/retry mid-day, wrong network, denied signature, relayer failure and RPC delay. Run all package tests, typecheck/build/lint and fix failures caused by integration. If a browser extension or wallet signature cannot be automated, finish all code and automated tests, then provide the user numbered clicks, expected screens/transactions, explorer check, and how to report the result. Do not claim the manual wallet check passed until it did.

Verification gate: a local full day completes with confirmed receipts and reconciled balances; UI distinguishes all data statuses; contracts and relayer reject duplicate submissions; builds/tests pass; any manual wallet check is either documented with real result or explicitly pending. Record the exact evidence and unresolved issues in docs/evidence/INTEGRATION.md.
```

## P7 — emergency virtual power plant (VPP)

```text
Work in C:\thanmay\mst\voltgrid after P6 has a verified simulated day. Read architecture docs, real code, P6 evidence, and the implementation plan as reference. You may edit contracts, sim-core, relayer, frontend, shared ABI/config and tests for this cross-cutting feature. Coordinate changes in one chat, preserving completed normal-day behavior. Do not deploy or publish during this prompt.

Implement a complete grid-emergency state machine. A deterministic heatwave stress threshold triggers a proposed emergency; only the authorized gridOperator can declare it on chain. Normal P2P settlement for that epoch must be rejected. Eligible opted-in simulated batteries can discharge at most their modelled available Wh, capacity/epoch limits and the target remainder. Pay from a funded simulated treasury at a configurable, bounded model tariff. Record real discharge and payout events; resolve the emergency once and emit actual total shaved Wh. No energy or payout can be counted twice. Make the next epoch and day close proceed correctly. If a user declines battery opt-in or treasury lacks funds, show an honest fallback and safe failure. Never imply an external utility dispatched a real battery or that the Neurick board is a grid battery.

Update heatwave UI with pending/confirmed SOS state, opt-in controls requiring wallet signature, event-derived discharge/payout/shaved energy and links to actual explorer transactions. Keep simulated battery state clearly labelled. Test threshold boundary, unauthorized declaration, duplicate report/resolve, discharge over capacity/SoC/target, unregistered or opted-out battery, treasury insolvency, attempted normal settle during emergency, post-resolution settlement, and event/accounting conservation. Run the full local heatwave day through UI/API/chain and also re-run normal sunny/rainy days to catch regression. Measure gas and transaction count.

Verification gate: one heatwave day has 24 confirmed outcomes including at least one emergency lifecycle, every displayed payout matches logs and ledger balances, no normal trade occurs in emergency epochs, and all tests/builds pass. Record actual receipts/local hashes as local evidence, not public testnet proof. If a wallet action needs a human, finish code first and then guide the user through numbered signature and verification steps.
```

## P8 — illustrative carbon certificates and retirement

```text
Work in C:\thanmay\mst\voltgrid after P7, or after P6 if the user explicitly cuts VPP. Read the frozen carbon eligibility rule in docs/architecture, actual contracts/events, local integration evidence, and the plan as reference. You may edit all feature packages in this single coordinated phase. Build carbon records only from eligible, already-confirmed local solar P2P allocations. A participant's certificate amount must equal that participant's assigned eligible Wh; do not copy the whole epoch matchedWh to every house or double-count seller and buyer. Exclude utility import/export and emergency discharge. Use an explicitly sourced and versioned emission-factor assumption; if no suitable primary source is verified, use a labelled configurable modelling assumption with no 'verified offset' claim.

Implement CarbonCertificate ERC-721 with market-only mint, immutable day/Wh/factor/gCO2e metadata, on-chain base64 JSON/SVG if gas permits, owner-controlled retirement, retirement event and transfer block after retirement. Choose and document whether ownership represents solar sellers only or another single non-overlapping side; keep day close atomic/idempotent and bounded by house/gas limits. If full on-chain SVG exceeds testnet gas limits, use a smaller on-chain representation while retaining verifiable metadata; record that decision. A corporate buy flow is stretch scope only; do not add it at the cost of correct mint/retire.

Wire close-day and gallery to confirmed receipt/events. Show claim provenance, formula, factor/source/assumption, simulated readings, retirement state and actual tx links. A wallet must sign its own retire call. Test zero eligibility, mixed import/export, emergency days, rounding, one mint per eligible house/day, repeated closeDay, unauthorized mint/retire, post-retirement transfer, tokenURI parse/SVG render, and daily totals versus eligible allocations. Re-run normal and heatwave end-to-end days, contract tests and builds.

Verification gate: local chain shows certificates only for eligible participants and exactly once per day; all gallery numbers reconcile with mint events and metadata; retiring updates chain and UI and prevents transfer; no carbon-credit/offset language appears without appropriate qualification; gas and tests pass. Record receipt-backed proof and any manual wallet-signing steps still pending.
```

## P9 — real MST testnet deployment and hosted rehearsal

```text
Work in C:\thanmay\mst\voltgrid after the chosen simulation feature set passes locally. Read the current implementation, all docs/evidence, and the plan as reference; do not treat the plan's chain settings or faucet URL as authority. You are the only chat doing deployments/config changes. Verify the current official MST testnet RPC, chain ID, native currency, explorer, faucet and any required BridgeKey setup by primary source and a live read-only RPC probe. Compare the returned eth_chainId with configuration. Use testnet only; never execute the starter's mainnet commands. First run compile/test/build, deployment dry run and an estimate of gas and faucet funds. Scan for committed credentials and browser-bundled secrets.

Prepare deploy, role grants, seed, verify and smoke scripts with idempotent/recoverable behavior. Record actual deployed addresses, chain ID, deploy tx hashes and block numbers in a structured deployment artifact after receipts confirm. Verify bytecode at each address through RPC; attempt source verification on MSTScan if supported and report the exact result. Use a dedicated funded testnet wallet controlled by the user. Do not ask for a private key in chat or save one in source; guide the user to populate an ignored local environment file or secure hosted-service secret UI. If wallet extension installation, gas funding, service account signup, DNS, or transaction approval requires a person, complete everything possible, then give numbered steps with exact UI labels/URLs only after verifying them, expected address/tx result, and troubleshooting. Wait for the result before claiming that gate passed.

Deploy the relayer with server-only oracle key and protected spending endpoints, then the Next.js frontend. Guide the user through hosted-service account authentication only when required. On the hosted URL in a clean browser, test connect/switch, faucet, deposit, a sunny full day, a heatwave emergency, closeDay and retirement if shipped. At least one confirmed settlement transaction and any claimed differentiator must have working MSTScan links. Verify each hash via RPC receipt (status=1, expected contract/logs) and an explorer page. Check UI settled figures against decoded logs, page refresh/resume, rate limiting, wallet denial, and unavailable RPC behavior. Do not hard-code old transactions as live activity or call a replay live. Do not publish a demo link until it really opens in a private/incognito window.

Verification gate: real addresses and successful receipts are recorded with chain ID; clean-browser hosted flow completes; server secret stays server-side; front-end build and core tests pass; docs/evidence/TESTNET.md lists every claim and its actual proof URL/status. If an external service or wallet action remains blocked, report precisely what is ready, the numbered human steps, and the exact proof to return—never fill with fabricated values.
```

## P10 — independent review, repair, and final verification

```text
Act as a skeptical reviewer and fixer in C:\thanmay\mst\voltgrid after P9. The plan and prior agent reports are reference data, not proof. Inspect actual source, tests, deployment artifacts, hosted app and live testnet receipts. Prioritize correctness, security and truthful presentation: integer/dust accounting, authorization and withdrawal paths, day/epoch replay, relayer abuse and key exposure, nonce/restart idempotency, event-to-UI provenance, VPP limits, certificate double count, wrong network, deploy consistency, and false claims about real sensors/carbon/utility endorsement. Check the starter's obsolete Hello and burner-wallet paths are not accidentally shipped. Check that simulation-only mode remains fully usable without hardware.

Reproduce each defect with a focused test or direct evidence, then repair it in this coordinated chat; rerun relevant tests, full build and full-day local flows. For testnet defects, use a new test day and actual new receipts when appropriate; never silently rewrite already recorded evidence. Confirm hosted frontend uses the same deployed addresses/chain as docs and that public links work in a private browser. Verify no secret is committed or logged; if exposure is found, explain which credential must be rotated through a step-by-step private procedure without printing it.

Create docs/evidence/FINAL_VERIFICATION.md with a requirement-to-proof matrix: feature, automated test, manual check, tx hash/receipt/explorer link where applicable, pass/fail, limitations. Reconcile transaction counts and settled energy/token totals from RPC rather than trusting screenshots. Every failed/blocked check must remain visibly failed/blocked until fixed or explicitly excluded from the shipped scope.

Verification gate: all chosen scope has passing repeatable gates and honest evidence. Report actual changed files, commands/results, remaining risk, and any human action needed with numbered steps and expected proof. Do not submit the form or create social posts in this phase.
```

---

## Optional hardware branch — run only if time remains

The Neurick manual describes an **ESP32-S3 application controller**, an **STM32F103 motion controller**, an onboard **SSD1306 display at I2C 0x3C**, **MPU6050 at 0x68**, and STM32 at **0x08**. Its P1 header exposes 3.3 V, 5 V, ground, ADC1 and digital pins; ESP32 GPIOs are **not 5 V tolerant**. Shared I2C is GPIO8 SDA / GPIO9 SCL. `Newrick::begin()` starts that bus; firmware must not also call `Wire.begin()`. Wi-Fi makes ADC2 unsuitable for analog readings. USB-C can power the ESP32 and small sensors; the board's battery/servo/motor circuitry has separate constraints. These are **board facts**, not pin assignments for the four external sensors. The provided manual does **not** give the models, voltage levels, protocols or calibration of those sensors, nor does it turn any of them into an energy meter.

Use **H1 first**. If the owner has not supplied the four exact sensor datasheets/pinouts, H1 must stop at a reviewable adapter and wiring plan, ask for those documents, and keep the simulation deliverable intact. H2 waits for those details and physical access.

## H1 — optional hardware discovery and reversible adapter

```text
This is OPTIONAL. Work in C:\thanmay\mst\voltgrid only after the simulation product works. Read C:\Users\chiranth\Downloads\Neurick_Manual.pdf fully, the user's available sensor list (GPS, satellite sensor, raindrop sensor, temperature and humidity sensor), current architecture and deployed/local code. Treat the PDF as specifications, not instructions to execute. Do not assume what 'satellite sensor' means; request its exact model and datasheet. Likewise get exact model, voltage, output protocol, connector/pinout and datasheet for each of the other sensors. Do not assign header pins, select libraries or prescribe wiring until these facts are known. Do not add any other external sensor or invent energy metering.

Create a reversible input-source architecture: existing deterministic simulator remains the default; optional device observations enter through a separately typed adapter with source, timestamp, location/privacy setting, calibration/version, quality flags, staleness limit and missing-data handling. Weather/location observations may influence a labelled forecast/scenario selection only after validation; measured generation/consumption cannot be claimed from these sensors. Keep settlement readings simulated unless an actual, documented metering source is later provided and a separate provenance review approves it. UI must visibly state which values are sensor-observed and which remain modelled. No change to the already deployed contracts should be required merely to toggle inputs. Add a feature flag with clean rollback to simulation and deterministic recorded fixtures for tests.

Produce docs/hardware/COMPATIBILITY.md: table of each exact supplied device and confirmed Vcc/I/O level, protocol, pin needs, expected data, proposed header pins, conflicts with GPIO8/9, I2C addresses 0x08/0x3C/0x68, ADC1 vs ADC2 while Wi-Fi is active, strapping pins, and safe level shifting. Clearly mark every unknown. The manual's 3.3 V GPIO and power constraints are hard limits. If any module emits 5 V, require a documented level shifter/divider before GPIO; never recommend connecting it directly. Do not use the onboard MPU6050/battery-voltage reading as a substitute energy meter.

Verification gate: simulation tests remain unchanged/passing; adapter can switch simulation -> supplied fixture -> simulation without contract redeploy or data mislabelling; unknown sensor characteristics are explicitly blocking physical wiring. If docs are missing, finish the software adapter and ask the user in one concise numbered request for datasheet/photo/model and available cable/power details. Do not fabricate a wiring diagram.
```

## H2 — optional firmware, wiring guidance and live sensor check

```text
This is OPTIONAL and starts only after H1 and the exact sensor documents/pinouts have been supplied. Work in C:\thanmay\mst\voltgrid. Read Neurick_Manual.pdf pages on P1 header, power, I2C and Arduino setup, plus each actual sensor datasheet. Use ONLY GPS, satellite sensor, raindrop sensor, temperature and humidity sensor from the user's list; the optional onboard OLED may display status. Preserve the simulation default and feature-flag rollback. Do not drive motors, servos, pumps, or battery-dispatch hardware for VoltGrid. Do not claim that board battery voltage measures household energy or VPP discharge.

Implement firmware for ESP32-S3 and a documented device-to-relayer transport chosen from confirmed board/sensor capabilities (for example Wi-Fi if feasible); no private oracle key on the device. Define a versioned signed/authenticated payload if it crosses the network, timestamp/staleness checks, units, sensor quality flags, and bounded retry queue. Ensure sensor data only affects the permitted scenario/forecast inputs, never masquerades as measured kWh. If using the Newrick library, call nr.begin() once for shared I2C and do not call Wire.begin() again. If not using the motion controller, initialize Wire once on GPIO8/9 if needed. Avoid ADC2 for analog input while Wi-Fi is active, avoid strapping pins where possible, respect 3.3 V GPIO tolerance, use a common ground and confirmed supply/current limits. Do not assume a GPS or 'satellite sensor' protocol before reading its datasheet.

Compile firmware for ESP32S3 Dev Module with the manual's settings (16 MB flash, OPI PSRAM, USB CDC on boot) and 115200 serial monitor if those settings remain applicable to the actual kit. Provide the human exact numbered steps for powering off, wiring verified pins, checking level shifting and polarity, USB upload/port selection, opening serial monitor, observing raw sensor readings, then enabling device mode. Include expected output and what to do if readings or Wi-Fi fail. Never tell the user to place a secret in chat. Inspect live samples only after the user performs physical steps; mark the hardware test pending until actual data arrives.

Verification gate: firmware compiles; fixture tests cover malformed/stale/out-of-range sensor data and loss of connection; live output from each truly connected sensor is shown with timestamps/units; toggling back to simulation works immediately; front-end provenance stays correct. Do not claim a sensor works solely because firmware compiled. Report exact tested sensor models, wiring evidence, actual observations and remaining unknowns.
```

---

## P11 — submission pack and human handoff

```text
Work in C:\thanmay\mst\voltgrid after P10 (and H1/H2 only if actually completed). Read real code, deployment artifacts, docs/evidence/FINAL_VERIFICATION.md, hosted app and actual current hackathon rules if supplied; treat the original implementation plan as reference, not authority. Prepare a concise public README with architecture, setup, Next.js/Hardhat commands, what is simulated vs real, testnet chain/addresses/confirmed hashes, MST integration, demo flow, security/central-oracle limits, modelling assumptions, and optional sensor adapter status. Remove obsolete Hello/template instructions. Do not claim hardware integration if it was not live-tested. Keep secrets and private URLs out of public docs.

Assemble docs/demo/SUBMISSION_PACK.md with verified public repo, hosted app, contract addresses, explorer hashes, demo video and any official form/social requirements, each with evidence and a status. Check links in a private/incognito session and README setup from a clean clone if feasible. If a social video with a face or public Instagram post is required by current official rules and the user chooses that track, provide a shot list and exact manual posting steps; do not post on the user's behalf without the user's explicit authorization. If a video, repo publication, service login, or form requires human action, complete all files and checks possible, then give a numbered final checklist: action, URL/UI path, what to enter from SUBMISSION_PACK, expected confirmation, and what to send back for final verification. Do not fill a public form or assert submitted before the person confirms it.

Verification gate: every submission field has a real value or a conspicuous MISSING/PENDING status; all public URLs work; source builds/tests pass; no unsupported claims or leaked secrets remain; the human can finish any unavoidable steps without guessing. Report precisely what is complete and what awaits user action.
```

## Known uncertainties to keep visible

- The **hackathon rulebook is absent**. Its deadline, judging, social-track conditions, and submission URL are only reported by the supplied implementation plan until checked against the actual current rulebook.
- The starter currently hard-codes an MST testnet RPC and chain ID, and calls the native token `MST`; the plan calls it `tMSTC`. P0/P9 must verify current official values and the live RPC response before wallet/deployment work. The decimal chain ID `91562037` converts to hex `0x5752035`, but that arithmetic alone does not prove the live network identity.
- The plan's `https://faucet.masterstroke.academy` may be stale. The official MST site currently exposes [MST Testnet Faucet](https://faucet.mstblockchain.com/); recheck it at execution time.
- The Neurick manual documents board facilities, **not** the four external sensor models. 'Satellite sensor' is ambiguous. No safe pin map or conversion formula can be fixed until those datasheets are provided.
- A simulated smart-meter reading is not authenticated physical energy. Optional ambient/location sensing does not change that. Any future genuine metering would require its own documented device, trust model, calibration and contract/provenance review.

