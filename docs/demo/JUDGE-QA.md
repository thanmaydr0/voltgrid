# Judge Q&A

These answers are deliberately narrow. They are safe only when the related evidence-ledger row is verified; otherwise say that the feature is planned or unverified.

## What is real and what is simulated?

The meter readings, households, weather/scenario changes, feeder stress, battery availability, and treasury are simulated/modelled. A transaction submitted to MST Testnet is real only after its receipt has status `1` and its expected events decode correctly. The UI must distinguish preview, pending, confirmed, reverted, and unknown states.

## Why use a blockchain instead of a database?

VoltGrid is testing whether a shared settlement record is useful when participants should inspect the same contract-controlled balances, price bounds, fee rules, and retirement state. The claim is about the settlement workflow, not that a blockchain solves physical metering, utility operations, or regulation. The current oracle is trusted for simulated inputs.

## Is this AI pricing?

No. The core is an auditable algorithmic supply/demand curve with hard floor, base, and cap parameters. An optional forecasting layer may nudge the base inside those limits. Do not call the core “AI pricing.”

## Are the meters or Neurick sensors real?

Not in this product snapshot. The Neurick manual describes a robotics board, its controllers, I2C devices, GPIO, battery monitoring, encoders, motors, and audio. It does not establish household energy measurement. VoltGrid uses deterministic simulated readings until a separately reviewed meter adapter exists.

## Is the treasury a utility or DISCOM account?

No. The treasury is a simulated address/ledger participant in the demo model. VoltGrid does not claim utility, government, or DISCOM endorsement, partnership, approval, or authority to collect a real tariff.

## Are the ₹2.50, ₹8.00, ₹0.42, or 700 gCO2e/kWh numbers official?

No. They are configurable modelling assumptions from the plan/architecture. The numeric source table records them as unverified external facts. Until an authoritative source is added, they must be labelled as demo assumptions and not described as current tariffs, fees, government incentives, or a current emissions baseline.

## Is the carbon feature a verified offset or credit?

No. If shipped, it is an illustrative, oracle-derived avoided-emissions record based on matched simulated Wh and a configurable factor. It is not a verified carbon offset, credit, certificate of environmental attribute, or regulatory instrument.

## Can the oracle lie?

In v1, the oracle is a role-restricted trusted relayer. The contract can enforce registration, ordering, bounds, balances, and duplicate prevention; it cannot prove that simulated readings came from a physical meter. A future path is signed meter data and then attested infrastructure, but that is not shipped proof.

## Why is MST meaningful here?

The intended MST action is contract settlement and state transition across a simulated day, with event logs driving the UI. A wallet connection or isolated transaction is not enough. Point to the actual `EpochSettled`, fee/balance, emergency, or certificate events only after the receipt evidence has been checked.

## Is the emergency mode a real grid response?

No. It is a simulated heatwave scenario and an on-chain contract workflow for opting-in model batteries, reporting a bounded discharge, and resolving the hour. It is not a physical feeder control signal and does not prove that a real grid was stabilized.

## Is this legal or approved for Indian energy markets?

We are not making a legal or regulatory claim. Any production pilot would need the applicable utility, market, consumer-protection, data, and regulatory review. The demo's treasury and tariffs are model constructs.

## Why not say BridgeKey is integrated?

The supplied guide strongly recommends BridgeKey. The actual provider metadata and signing behavior must be observed in the browser before making a BridgeKey-specific claim. Until then, say “an injected EIP-1193 wallet” and mark BridgeKey-specific evidence unverified.

## What is the Social Track requirement?

The supplied guide describes Social Award eligibility separately from the main technical awards. A face-camera Instagram video and named mentions are conditional on choosing that award and on the current rules still requiring them. Do not tell judges the team must enter the Social Track unless the current organizer rules are confirmed and the team has chosen it.

## How do you prove you did not fake a deployment?

Show the deployed address from a successful receipt, verify the bytecode and expected event logs against the current commit, open the exact MSTScan link in a clean browser, and keep the raw capture record. Never use a hard-coded hash or a placeholder that resembles a hash.
