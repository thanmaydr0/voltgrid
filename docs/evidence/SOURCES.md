# Sources, numeric assumptions, and verification status

Checked: 28 September 2026 (Asia/Calcutta). This table distinguishes local reference material, current read-only observations, and claims that still need a human-supplied source. URLs in this file are research links only; none was used to submit a form, fund a wallet, post socially, or deploy a contract.

## Source table

| Source ID | Source | What it supports | Result and allowed wording |
|---|---|---|---|
| S-01 | `C:\Users\chiranth\Downloads\VOLTGRID_IMPLEMENTATION_PLAN.md` | Product intent, proposed phases, pitch corrections, and planned submission fields. | Reference material only. Its faucet, RPC, deadline, prizes, social criteria, and form URL are recheck items, not instructions or current proof. |
| S-02 | `C:\Users\chiranth\Downloads\Neurick_Manual.pdf` | Board architecture, ESP32-S3/STM32 split, I2C, GPIO, battery/motor/sensor handling. | Reference material only. It does not document a household energy meter or VoltGrid integration. Do not infer measured Wh or an attested oracle from it. |
| S-03 | `C:\Users\chiranth\Downloads\BUILDATHON GUIDE .docx.pdf` | Supplied hackathon guide: five technical requirements, strong BridgeKey recommendation, working product/on-chain proof preference, integrity rule, compulsory final form, and separate Social Award. | Present and read on this task. These are confirmed as statements in the supplied PDF, but current organizer status, deadline, and any later amendment remain `UNVERIFIED`. The plan's extra prize counts are not confirmed by this PDF. |
| S-04 | [`https://docs.mstblockchain.com/`](https://docs.mstblockchain.com/) and the SDK/Vibe Kit/MCP paths named in the supplied guide | Official MST developer documentation requested for current verification. | Web reader could not access the docs, and a direct HTTP check returned status 500 on 28 Sep 2026. SDK, Vibe Kit, MCP, provider, and official network-configuration claims remain `UNVERIFIED`; do not cite the plan as if it verified them. |
| S-05 | [`https://testnetrpc.mstblockchain.com`](https://testnetrpc.mstblockchain.com) | Current read-only connectivity observation. | Direct JSON-RPC returned `eth_chainId = 0x5752035`, `net_version = 91562037`, and a current block number on 28 Sep 2026. This verifies only the observed RPC response, not deployment, compiler compatibility, faucet limits, or a permanent network guarantee. |
| S-06 | [`https://faucet.masterstroke.academy/`](https://faucet.masterstroke.academy/) | Faucet URL printed in the supplied guide and plan. | Direct HEAD returned HTTP 200, but no claim/funding action was made and limits were not tested. Treat URL, eligibility, and limits as `UNVERIFIED` until a human checks current official instructions. |
| S-07 | [`https://faucet.mstblockchain.com/`](https://faucet.mstblockchain.com/) | Current official-looking MST Testnet Faucet page found during independent check. | Page returned HTTP 200 and showed an address field and `Get Your MSTC`; successful funding and rate limits were not tested. Do not silently substitute it for the guide URL without human confirmation. |
| S-08 | [`https://testnet.mstscan.com/`](https://testnet.mstscan.com/) | Testnet explorer destination. | Direct HEAD returned HTTP 200. No VoltGrid transaction exists in this evidence set; every future explorer URL is `UNVERIFIED` until opened from a real receipt. |
| S-09 | [`https://forms.gle/fkkVbfiwKmbL3BFp9`](https://forms.gle/fkkVbfiwKmbL3BFp9) | Final form URL printed in the supplied guide. | No form was opened or submitted. Current form ownership, fields, deadline, and accessibility are `UNVERIFIED`; a human must recheck before any manual submission. |
| S-10 | [`https://mstblockchain.com/`](https://mstblockchain.com/) | Current public MST website discoverability. | Use only for general ecosystem attribution. It does not verify VoltGrid, a hackathon deadline, an endorsement, a tariff, an emissions factor, or a deployment. |

## Numeric tariff and emissions source table

The following numbers appear in the plan and architecture as a demo model. They are intentionally not presented as Indian utility tariffs, government incentives, certified emissions data, or live MST facts.

| Number used in the demo model | Intended meaning | Source status | Safe pitch wording |
|---|---|---|---|
| ₹2.50/kWh | Modelled feed-in reference | `UNVERIFIED` as any real-world tariff; value is from S-01 and the frozen architecture only | “The demo model uses a configurable ₹2.50/kWh feed-in reference.” |
| ₹8.00/kWh | Modelled retail reference | `UNVERIFIED` as any real-world tariff; value is from S-01 and the frozen architecture only | “The demo model uses a configurable ₹8.00/kWh retail reference.” |
| ₹3.00 / ₹5.00 / ₹7.00 per kWh | Modelled P2P floor/base/cap | `UNVERIFIED` as any market tariff; on-chain parameter bounds/defaults are repository design values | “The algorithmic curve is configured with a ₹3/₹5/₹7 model band in this run.” |
| ₹0.42/kWh | Modelled wheeling-fee parameter | `UNVERIFIED` as a real fee; no official tariff source supplied | “The demo has a configurable wheeling-fee assumption; it is not a quoted utility charge.” |
| ₹7.50/kWh / 3x feed-in | Modelled emergency payout default | `UNVERIFIED` as any government or market premium; no official source supplied | “The emergency payout is a configurable demo parameter.” Never say “government premium.” |
| 700 gCO2e/kWh | Placeholder grid factor | `UNVERIFIED`; no current official CEA/baseline source was supplied or verified | “The UI shows an illustrative factor that must be replaced or sourced before any emissions claim.” |
| 1 VLT = ₹1 | Internal demo conversion | Model convention only; not an exchange rate or legal tender claim | “VLT is a simulated accounting unit in the demo.” |

### Rule for future numeric claims

Before a pitch quotes a tariff, fee, or emissions factor as anything other than a configurable demo assumption, add the issuing authority, document title/version/date, exact page or section, retrieval date, and a public URL to this table. Until then, label every number `modelling assumption` in the UI, script, and Q&A.

## Event and rule claims still provisional

- The supplied PDF confirms a compulsory final submission form and says Social Award eligibility includes a public 30-second video, face/team member on camera, Instagram posting, two named mentions, MST mention, and form submission. It does **not** make Social Award participation a requirement for the main technical track. Current rules and deadline are still `UNVERIFIED`.
- The supplied PDF does not state the deadline or time zone. The plan's “submit before the hackathon deadline” is not a date. Mark deadline and prize-count claims `UNVERIFIED` until an organizer source is supplied.
- BridgeKey is strongly recommended in the supplied PDF. Actual browser provider metadata and signing behavior are still `UNVERIFIED`.
- No current MST official developer-doc page was readable in this environment. No SDK API, Vibe Kit feature, MCP credential, compiler setting, or wallet-provider contract should be claimed as verified from the plan.
