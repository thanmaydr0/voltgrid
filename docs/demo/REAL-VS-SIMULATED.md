# What is real vs simulated

Use this short explainer beside the demo and in judge conversations.

| Surface | In the demo | Claim boundary |
|---|---|---|
| Household readings, solar generation, consumption, weather, EV load | Deterministic model output from a scenario, seed, model version, and epoch | Not a live meter, sensor measurement, oracle proof of physical energy, or user telemetry. |
| Price | Algorithmic curve from modelled supply/demand; optional forecaster may adjust the base inside contract bounds | Not generic AI pricing and not a published utility tariff. |
| VLT | Demo accounting token; architecture models 1 VLT as ₹1 for display | Not cash, legal tender, an exchange rate, or a claim about MSTC value. |
| Treasury | Simulated address and internal ledger participant | Not a utility, DISCOM, government, or endorsed payment account. |
| MST Testnet transaction | Real network action only after a successful receipt and expected decoded events | A pending, reverted, unknown, or invented hash is not proof. |
| Dashboard | Preview/pending/confirmed states, ideally driven by decoded receipts/logs | A visual animation alone is not evidence of settlement. |
| Emergency VPP | Contract workflow using modelled feeder stress and opted-in model batteries | Not physical dispatch, grid control, or proof that the grid was saved. |
| Avoided-emissions record | Illustrative calculation from matched simulated Wh and a configurable factor, if certificate code ships | Not a verified carbon offset, carbon credit, environmental attribute, or carbon-neutrality claim. |
| Neurick | Reference-only hardware manual; no integrated VoltGrid meter in this snapshot | Do not claim Neurick measured household energy. |
| Network/RPC/faucet/rules | Current read-only checks and supplied guide are tracked in `docs/evidence/SOURCES.md` | Mutable facts remain provisional until independently rechecked by a human from the official source. |

One-sentence version: **“The model and treasury are simulated; the contract receipts are real only when a successful MST Testnet transaction is independently verified.”**
