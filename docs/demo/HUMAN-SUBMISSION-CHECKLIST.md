# Human submission checklist

This checklist names manual actions. The agent must not log in, sign wallet transactions, fund wallets, create hosted accounts, post socially, or submit the final form on the team's behalf. Complete only after the current official rules and deadline are confirmed.

## 1. Confirm rules and ownership

- [ ] **Account login:** a human signs in to the organizer's current official announcement/rulebook source and confirms the current event name, track, deadline, time zone, prize criteria, technical requirements, and any amendments.
- [ ] **Rulebook record:** record the exact source URL, document title/version/date, and retrieval time in `docs/evidence/SOURCES.md`.
- [ ] **Social decision:** explicitly choose whether to pursue the separate Social Award. Do not assume it is required for the main technical track.
- [ ] **Team owner:** name the human responsible for wallet, hosting, evidence, video, and form actions in the private team plan; do not put personal secrets in this repository.

## 2. Wallet funding and signing

- [ ] **Wallet account setup:** a human installs/selects the tested EIP-1193 wallet and creates or imports a dedicated testnet account using the wallet's secure flow.
- [ ] **MST network setup:** a human verifies the current official MST Testnet chain ID, RPC, symbol, and explorer; adds/switches the network in the wallet; and records the observed provider metadata.
- [ ] **Faucet funding:** a human opens the currently confirmed faucet, enters only the dedicated public testnet address, and checks the resulting balance/receipt. Do not use a plan URL without rechecking it.
- [ ] **Deployment wallet funding:** a human funds the dedicated deployer/oracle account as required and stores any key only in the ignored local environment or the chosen hosted secret manager.
- [ ] **Wallet signing:** a human approves the intended deposit, opt-in, certificate-retire, or other user actions, checking the destination, chain, amount, and function before every signature.
- [ ] **Receipt verification:** a human records the real hash, status, block, decoded logs, contract address, and clean-browser MSTScan link for every proof transaction.

## 3. Hosted-service account setup

- [ ] **Hosting account login:** a human creates/signs into the selected frontend and relayer hosting account. The provider is not prescribed by this document.
- [ ] **Repository connection:** a human connects the intended public repository and exact commit/ref; confirm the build does not use local-only data or secrets.
- [ ] **Environment configuration:** a human enters RPC, deployment, relayer, wallet, and auth secrets into the provider's secret manager. Never commit them, paste them into logs, or put them in a screenshot.
- [ ] **Service configuration:** a human configures the public frontend URL, relayer URL/origin allowlist, persistence/nonce behavior, rate limits, and logs appropriate to the chosen provider.
- [ ] **Deployment check:** a human opens the hosted app in a fresh browser, checks the public URL, and records `[UNVERIFIED - paste real hosted URL after clean-browser pass]` only after the service is live and the ledger rows are captured.

## 4. Evidence and demo capture

- [ ] **Clean-browser rehearsal:** follow [`REHEARSAL-CHECKLIST.md`](REHEARSAL-CHECKLIST.md) using a fresh profile.
- [ ] **Evidence ledger update:** fill each real address/hash/receipt/log/screenshot slot in `docs/evidence/EVIDENCE-LEDGER.md`; leave every unsupported row `UNVERIFIED`.
- [ ] **Public link check:** have a second human open the repository, hosted app, explorer links, and video link without credentials or a local network.
- [ ] **Video recording:** a human records the demo only after the spoken claims match verified ledger rows. Use the real video URL later: `[UNVERIFIED - paste public demo video URL after upload]`.

## 5. Optional Social Award path

Complete this section only if the team chooses the separate Social Award and a current official rule check confirms the conditions:

- [ ] **Face-camera video:** a human records the required face/team-member segment, if still required by the current rules.
- [ ] **Social account login:** a human signs in to the team's public Instagram account and reviews the post before publishing.
- [ ] **Social post:** a human posts the public video, includes the current required MST and partner mentions, and says the project is being built on MST Blockchain. Do not post from this task.
- [ ] **Social URL:** record `[UNVERIFIED - paste public Instagram/video URL only after the post is live]`.
- [ ] **Social form field:** a human enters the real social URL in the form only if the current form asks for it and the team chose the award.

## 6. Final submission form

- [ ] **Form login:** a human opens the current official final submission form and signs in if required.
- [ ] **Form fields:** paste the real public GitHub URL, shipped contract address(es), at least one verified transaction hash/URL, hosted demo URL, and demo video URL. Do not paste placeholders.
- [ ] **Final review:** a second human opens every pasted link in a clean browser and checks that it is public, matches the current commit/deployment, and does not expose secrets.
- [ ] **Manual submit:** the designated human submits the form before the confirmed deadline and saves the confirmation screen/email. This task does not submit it.
- [ ] **Submission record:** record the submission timestamp, confirmation artifact location, and final rulebook source in the private team record. Do not invent a public proof link.

## Current unresolved slots

- Contract addresses: `[UNVERIFIED - real deployed address required]`
- Transaction hashes and receipts: `[UNVERIFIED - real successful receipt required]`
- Public GitHub URL: `[UNVERIFIED - public repository URL required]`
- Hosted app URL: `[UNVERIFIED - clean-browser public URL required]`
- Demo video URL: `[UNVERIFIED - public video URL required]`
- Social video URL, only if chosen: `[UNVERIFIED - public Instagram/video URL required]`
- Current deadline/time zone: `[UNVERIFIED - organizer source required]`
- Current form URL/fields: `[UNVERIFIED - organizer source required]`
