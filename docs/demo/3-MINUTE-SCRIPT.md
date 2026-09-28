# VoltGrid three-minute demo script

Use this as a rehearsal script, not as a declaration that the product is already deployed. Replace a proof beat with the actual receipt and explorer link only after the corresponding row in [`../evidence/EVIDENCE-LEDGER.md`](../evidence/EVIDENCE-LEDGER.md) is verified. If a gate is still unverified, say so plainly and skip the claim.

## 0:00-0:30 - Problem

“A neighbourhood can have solar surplus in one home while another home is drawing power. VoltGrid explores a shared settlement layer for that mismatch. This is a demo model, not a utility tariff or an endorsement by a utility or government body.”

Show two simulated homes: one with surplus and one with deficit. If quoting numbers, say: “The screen uses configurable model references, not live tariff data.”

## 0:30-0:50 - Solution

“VoltGrid is a simulated neighbourhood energy market. A deterministic simulator creates household readings; an oracle relayer submits the next outcome; the MST contract records settlement, balances, and events; the dashboard renders confirmed logs. The meters and treasury are simulated. A successful MST receipt is real testnet activity.”

Point to the persistent notice: “Meters are simulated. Transactions are real on MST Testnet” — only if that notice is actually present and the related receipt is verified.

## 0:50-1:10 - Wallet and chain

“I connect an EIP-1193 wallet and switch to MST Testnet. The wallet prompt is manual. I approve the action, then wait for a successful receipt and open that exact transaction in the explorer.”

Show the network ID from the wallet and one real explorer link. Do not call the wallet BridgeKey unless its provider metadata was observed in this browser run. Do not display a private key.

## 1:10-1:45 - Sunny normal settlement

“For this epoch, pricing is algorithmic: it comes from the simulated demand-to-supply ratio and is clamped to the configured on-chain band. It is not generic AI pricing. An optional forecasting layer may nudge the base inside those hard bounds; it is off unless this run has a verified forecast transaction.”

Click “Play” or the equivalent control. Show flows only as they move from preview to confirmed. Open the receipt and point to the decoded `EpochSettled` and `TradeSettled` fields. Say “the UI shows confirmed logs” only if E-01, E-02, and E-07 are verified.

## 1:45-2:15 - Heatwave / VPP

“The heatwave button changes the simulated readings and proposes a feeder-stress event. The emergency path pauses normal P2P for that hour, pays opted-in model batteries for reported discharge, and resolves the hour on-chain. This demonstrates a contract workflow; it is not a physical grid dispatch or proof that the grid was saved.”

Show `EmergencyDeclared`, a discharge payout, and `EmergencyResolved` only after E-08 is verified. If there is no successful evidence, say: “This path is planned but not proven in this rehearsal.”

## 2:15-2:35 - Day close / emissions record

“If the certificate extension is shipped, day close creates an illustrative avoided-emissions record from matched simulated Wh and a configurable factor. It is not a verified carbon offset or carbon credit. Retire changes the on-chain state so this demo record cannot be reused in the same way.”

Show the factor label and the actual mint/retire receipts only after E-09 is verified. Otherwise omit this beat and show the day lifecycle state.

## 2:35-3:00 - Why MST and close

“The reason to use a chain here is the shared settlement record: participants can inspect who settled, what the contract emitted, and which state is confirmed without trusting a private dashboard database. The current version still has a trusted oracle and simulated meters; production would require real meter provenance, operational controls, and applicable regulatory review. The next proof points are the contract addresses, receipt set, hosted URL, and a clean-browser replay.”

Show only verified addresses and links. If any slot is pending, say: “That artifact is still unverified; we are not presenting it as proof.”

## Language guardrails

Say:

- “algorithmic pricing with an optional forecasting layer”;
- “simulated meters and simulated treasury”;
- “illustrative avoided-emissions record”;
- “real MST Testnet transaction” only after a successful receipt is checked;
- “modelled emergency response,” not “grid saved.”

Do not say:

- “AI pricing” as the core mechanism;
- “government/utility approved,” “endorsed,” “legal,” or “regulatory cleared”;
- “verified carbon offset,” “carbon credit,” or “carbon neutral”;
- a quoted tariff, fee, or emissions factor without the source table entry;
- “Social Track is required.” It is a separate optional award path unless current rules say otherwise and the team chooses it.
