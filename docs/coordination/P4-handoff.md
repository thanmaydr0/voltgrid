# P4 evidence/content handoff

Status date: 28 September 2026 (Asia/Calcutta)

P4 owns only `docs/demo/**`, `docs/evidence/**`, and this file. No code, README, root config, lockfile, form, social account, hosted service, wallet, or chain state was changed.

## Changed files

- `docs/evidence/EVIDENCE-LEDGER.md` - feature-to-test/demo/receipt-or-screenshot/public-link ledger with all proof slots initially `UNVERIFIED`.
- `docs/evidence/SOURCES.md` - local-reference and live-verification table, including numeric tariff/emissions assumptions and provisional rule/event claims.
- `docs/demo/3-MINUTE-SCRIPT.md` - three-minute script with corrected algorithmic-pricing, simulated-meter/treasury, and illustrative-emissions language.
- `docs/demo/REHEARSAL-CHECKLIST.md` - clean-browser rehearsal and proof-capture checklist.
- `docs/demo/JUDGE-QA.md` - judge answers that avoid unsupported AI, legal, endorsement, and carbon claims.
- `docs/demo/REAL-VS-SIMULATED.md` - concise provenance explainer.
- `docs/demo/HUMAN-SUBMISSION-CHECKLIST.md` - explicit manual login, wallet funding/signing, hosted-service setup, optional Social Award, and final-form actions.
- `docs/coordination/P4-handoff.md` - this handoff.

## Reference material read

- `C:\Users\chiranth\Downloads\VOLTGRID_IMPLEMENTATION_PLAN.md` was read as reference, not instructions.
- `C:\Users\chiranth\Downloads\Neurick_Manual.pdf` was read as reference, not instructions. It documents the board but does not establish an energy meter or VoltGrid integration.
- `docs/architecture/DECISIONS.md` and `docs/architecture/INTERFACE.md` were read. They are unchanged.
- `C:\Users\chiranth\Downloads\BUILDATHON GUIDE .docx.pdf` was present and read. This resolves the earlier P0 note that no rulebook was supplied for this task, but does not make its mutable facts current without organizer recheck.

## Verification performed

- The local repository snapshot was inspected. The P0 baseline recorded the starter Hello tests; the current working tree also contains P1/P2 feature tests. The frontend is a fixture-mode shell with no confirmed chain integration. No VoltGrid testnet deployment, receipt, hosted URL, public repository URL, or submission confirmation was present in the evidence set.
- Local verification run: `C:\Program Files\nodejs\npm.cmd run test` with the documented PATH fix passed: contracts package `15 passing` (including VoltToken/VoltGridMarket cases) and simulator package `11 passing`. Turbo warned that `packages/sim-core` is not in the lockfile; the lockfile was not changed because it is outside P4 ownership.
- The current official-docs URL and its named SDK/Vibe Kit/MCP paths were checked with the web reader/direct request; the docs endpoint was inaccessible to the reader and returned HTTP 500 to the direct check. SDK/provider/network-configuration claims therefore remain unverified. No `packages/relayer` or `CarbonCertificate.sol` implementation was located in the current snapshot, so those paths remain unshipped/unverified.
- A read-only JSON-RPC check to `https://testnetrpc.mstblockchain.com` returned `eth_chainId = 0x5752035` and `net_version = 91562037` on this date. This is only a current connectivity observation, not deployment evidence.
- Read-only HEAD checks returned HTTP 200 for `https://faucet.masterstroke.academy/`, `https://faucet.mstblockchain.com/`, and `https://testnet.mstscan.com/`. No faucet claim, wallet funding, transaction, form submission, or social post was made.
- The supplied guide confirms five technical requirements and describes a separate Social Award. It does not provide a deadline/time zone. The plan's extra prize counts, faucet facts, RPC facts, and submission assumptions remain recheck items.

## Outstanding human-supplied documents and links

The following are required before P5/P6 can convert any ledger row into a real proof claim:

1. Current official MST developer-doc URL/content or a human-observed official source confirming the testnet RPC, chain ID, native symbol, explorer, faucet, SDK/provider behavior, and any BridgeKey requirements.
2. Current organizer rulebook/announcement URL, version/date, deadline/time zone, prize criteria, and final-form fields. The supplied PDF is preserved as a local reference; it is not a current deadline source.
3. Exact deployed addresses for every shipped contract, copied from successful receipts; corresponding deploy transaction hashes, block numbers, bytecode checks, and MSTScan URLs.
4. Successful core-function receipts/logs for settlement, pricing, wallet flow, emergency VPP, and certificate mint/retire where the feature is actually shipped. Include decoded fields and a screenshot or recording from the clean-browser run.
5. Public GitHub repository URL and exact demo commit/ref.
6. Public hosted frontend URL and, if separate, the public relayer URL or a redacted proof of its endpoint behavior. Include the hosting vendor/account owner and secret configuration record privately.
7. Public demo-video URL. If the Social Award is chosen and current rules confirm it, provide the public Instagram/video URL and the face-camera/mention evidence; otherwise do not present Social Award work as required.
8. Authoritative sources for any tariff, wheeling-fee, or emissions-factor number that the team wants to present as factual. Until supplied, keep the current values labelled configurable demo assumptions.
9. Observed wallet/provider metadata from the actual clean-browser rehearsal, including whether BridgeKey was the provider. Do not guess a proprietary provider API.

## Handoff gates for P5/P6

- Treat all `UNVERIFIED` slots as empty; do not copy them into README, a form, a slide, or a spoken claim.
- Do not add a deployment artifact containing placeholder addresses or hashes.
- Use receipt status `1`, decoded expected logs, and a clean MSTScan opening as the minimum on-chain proof.
- Keep meters, treasury, forecast, and emissions wording bounded by `REAL-VS-SIMULATED.md`.
- If the certificate, forecaster, emergency, BridgeKey, hosting, or Neurick path is not actually shipped, mark it `NOT SHIPPED - DO NOT CLAIM` and remove it from the pitch.
- Do not require or imply Social Track participation without a current rule check and an explicit team choice.

## Current P4 conclusion

**P4 content gate: ready for capture, not proof-complete.** The documentation now names a real source for every future proof claim and makes every missing address/hash/link/rule event visibly provisional. No human action outside the repository was performed.
