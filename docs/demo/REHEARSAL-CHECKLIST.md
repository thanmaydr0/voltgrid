# Clean-browser rehearsal checklist

Run this from a fresh browser profile or private window. Use a separate test wallet. Do not paste private keys, recovery phrases, or hosted secrets into the repository, screen recording, form, or chat.

## Before opening the app

- [ ] Human owner confirms the current MST network, faucet, explorer, and developer-doc URLs from an official source. The URLs in the plan and supplied guide are recheck items.
- [ ] Human owner confirms the current hackathon deadline and time zone. The supplied guide has no date.
- [ ] All deployed addresses, hashes, hosted URL, and video URL are real values copied from artifacts, not this document's `UNVERIFIED` slots.
- [ ] The selected build commit is recorded: `[UNVERIFIED - paste public commit URL]`.
- [ ] Browser recording has no unrelated wallet tabs, seed phrases, API keys, or account details visible.

## Browser and wallet

- [ ] Open `[UNVERIFIED - paste hosted VoltGrid URL]` in the clean profile.
- [ ] Confirm the page shows the simulation notice and a clear pending/confirmed/error state.
- [ ] Install or select the wallet the team actually tested. Call it BridgeKey only if its actual provider metadata was observed.
- [ ] Connect the wallet and confirm the displayed chain is the current MST Testnet chain.
- [ ] If prompted to add or switch networks, read the wallet dialog and manually approve it.
- [ ] Fund the demo wallet manually from the currently confirmed faucet if needed; record the faucet result separately. Do not claim funding was successful until the balance or receipt is visible.
- [ ] Sign only the intended testnet transactions: faucet action if applicable, VLT deposit, opt-in, emergency action if the flow requires a user signature, and certificate retirement if shipped.
- [ ] For each signature, wait for a receipt with status `1` before calling it confirmed.

## Normal day

- [ ] Choose a scenario and record the seed/model version shown by the app.
- [ ] Verify the UI labels readings as `simulation` or `model preview` before settlement.
- [ ] Start the day only once; record the actual day ID from the response/log.
- [ ] Advance one normal epoch.
- [ ] Check that the confirmed price, matched/exported/imported Wh, fees, and balances are sourced from decoded events.
- [ ] Open the exact explorer link from the UI and compare the event fields with the dashboard.
- [ ] If the forecast toggle is used, confirm it is presented as optional and bounded; otherwise leave it off.
- [ ] Do not call an animation or a pending transaction a settled result.

## Heatwave / emergency

- [ ] Select heatwave only if the deployed contract and frontend support E-08.
- [ ] Show the stress condition as modelled.
- [ ] Confirm normal P2P is not settled during the emergency hour.
- [ ] Confirm opted-in battery entries, target, delivered Wh, payout, and resolved/unmet status from receipts/logs.
- [ ] Open the emergency explorer links in the clean profile.
- [ ] Say “modelled emergency response,” not “physical grid saved.”

## Day close / certificate

- [ ] Run this only if the certificate extension is deployed and E-09 is verified.
- [ ] Show the configurable factor and `illustrative` label.
- [ ] Open the actual mint and retire receipts.
- [ ] Do not say “verified offset,” “carbon credit,” or “government certificate.”

## Closeout

- [ ] Export or save screenshots with timestamps and feature IDs E-01 through E-15 as applicable.
- [ ] Record every actual address, hash, block, decoded event, and explorer URL in the evidence record.
- [ ] Repeat the hosted run in a second clean browser or have a second person independently open the links.
- [ ] If any proof beat fails, mark it `UNVERIFIED` and remove it from the spoken pitch.
- [ ] Close or revoke temporary sessions and do not leave wallet funding or secrets in the browser recording.
