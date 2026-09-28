# P7 grid-emergency local evidence

Date: 2026-09-28  
Workspace: `C:\thanmay\mst\voltgrid`  
Chain: ephemeral Hardhat `31337` (local only)  
Result: emergency state-machine and receipt/API integration passed. **These are not MST Testnet receipts, explorer proofs, or deployment claims.**

Command: `& 'C:\Program Files\nodejs\npm.cmd' run test:local --workspace=voltgrid-relayer` — PASS, 2/2 local integration tests (sunny/rainy normal days and the authenticated heatwave API/chain day).

## Run and accounting summary

The relayer integration started a fresh local Hardhat node, deployed the compiled VoltToken and VoltGridMarket test artifacts, seeded eight simulated houses and a simulated treasury, authenticated through the relayer challenge/verify HTTP routes using a local signer, then drove `/v1/days`, all 24 `/advance` calls, `/close`, `/v1/events`, and concurrent retries. The disposable node and JSON state were removed when the test ended.

| Field | Verified local result |
| --- | --- |
| Scenario / seed | `heatwave` / `local-heatwave-emergency` |
| Modelled transformer capacity | 18,500 Wh |
| Day ID | `0xa02cd15fdc4422f595266df6ccb68965d2981c50aa4aa5ae155a3ee67010f32a` |
| Market address (ephemeral) | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| Final outcomes | 24 confirmed: 18 `EpochSettled`, 6 `EmergencyResolved`; ordered indices 0–23 |
| Emergency lifecycle | epochs 17–22; each had confirmed declaration, report, and resolution receipts |
| Positive-dispatch epochs | epochs 17–19: 12,000 Wh total, 90 VLT total (90,000,000,000,000,000,000 wei) |
| Zero-discharge outcomes | epochs 20–22: explicit report event and honest 0 Wh / 0 payout resolution |
| Lifecycle transactions / gas | 38 confirmed transactions including day start/close; 5,030,551 gas summed from their receipts |
| Conservation | Per-emergency house credits and treasury debits matched receipt payout events; final internal ledgers summed to market ERC-20 custody |
| Emergency trade exclusion | No `TradeSettled` event occurred at any emergency epoch |
| Retry behavior | Two concurrent retries per emergency returned the original action hashes; final epoch count remained 24 |

The contract test also confirms a funded dispatch's event payout arithmetic, and the relayer tests exercise the zero-discharge path for an opted-out battery and an underfunded treasury. Empty reports emit `EmergencyReportRecorded`; resolution cannot proceed without a report.

## Local receipt hashes

These hashes and block numbers came directly from successful local receipts. They are intentionally not linked to a public explorer.

| Block | Outcome/action | Transaction hash |
| ---: | --- | --- |
| 24 | Day start | `0x133780cd1e9cbda8b79c837237ed4aab4c9e07bfad49455158b2eb5ed1bc3ee7` |
| 25 | Epoch 0 normal | `0x482f52387e28e6a4c70782527da1664d1d988ae2fa64753bc101b4cb3426b223` |
| 26 | Epoch 1 normal | `0x97e7d9c35815e57df73f209a18677cff6e3ad4a16a3e3c85541f43996da5faa3` |
| 27 | Epoch 2 normal | `0x88a2cccbc6f9eaa38c3cdb68fda615a6d0a3f9bea663c2d261281f6eac25800e` |
| 28 | Epoch 3 normal | `0x6528b8168cdd63c039f10d52a60e5fbfb595036e170155dfa07730536c7287aa` |
| 29 | Epoch 4 normal | `0xa80341798b257c56152b5127df0595561a5f50493fe72ff36ee3f1466f4481fa` |
| 30 | Epoch 5 normal | `0x462b8d264a72961e0ce6b89033bb78c7c10a20e009cba27d617052db89277897` |
| 31 | Epoch 6 normal | `0xd27660c80beb34a075cc14d34c298815dc5aed7530ee7cdf8e9ad411e36784f4` |
| 32 | Epoch 7 normal | `0x9258bace66fa6ea3f6994686a1cace634de8d0d6f0ea9ae84593f3bd94b1cb15` |
| 33 | Epoch 8 normal | `0x612a9996a1c17a1bff1513033cc421cd87f4ba356f43b206d87484839b2719e5` |
| 34 | Epoch 9 normal | `0x6e588220368b2989ea5a9613afe3fb8586bedce7194e505095b632858c501809` |
| 35 | Epoch 10 normal | `0x985ca545435cfcdf87fcc580aa0b2cf386b6a5b076fadafc6df113d384ffa53a` |
| 36 | Epoch 11 normal | `0xfe930850b5bd958abb4a91f85c5486499609095754c46c0b4b27596ba841c7f9` |
| 37 | Epoch 12 normal | `0xa00381f28a4df0c375eceac161e946612ed1a429fac238f1d210f11da7e926fa` |
| 38 | Epoch 13 normal | `0x42c2bea2aba012162546367fec28a3f37e95376d27f65e2eac30a49e984a2b5d` |
| 39 | Epoch 14 normal | `0x7aaf182c1bf51998c2d6c6be6648ebf3fa36ab3f2d909577e8087621921a8d86` |
| 40 | Epoch 15 normal | `0x9ce0a34b3cd4094de0fdabddf06afbb59d40d0e4512267a4009f4de67be44703` |
| 41 | Epoch 16 normal | `0x9d717b120a81c0328194dd061e1747da70fbefb1e296c381b32bee40d8c90cf6` |
| 42 | Epoch 17 declare | `0x084b01d5ec5bd5a4a259bda3016a6d77f320b053183c7e62b1b7917eae783053` |
| 43 | Epoch 17 report · 4,953 Wh · 37.1475 VLT | `0xac2c646dcc65ab1dfb42179c57bd0b937ccc3009feb58644bae5f0b5104fe95d` |
| 44 | Epoch 17 resolve | `0x5efe0452e79a619296729e8e11d5e004dbae53b80739c747c4862210c4e1f4c3` |
| 45 | Epoch 18 declare | `0xd65d52691b8f337f050af73feefe080fb40c2b2da87aa0318a30d532f8f5832f` |
| 46 | Epoch 18 report · 5,002 Wh · 37.515 VLT | `0xef78df58b77c8f3bc56bd3c02f77aece9dfbdbc8aceb97816a2cc70a33f6f249` |
| 47 | Epoch 18 resolve | `0x709f246cd61017b263ec1628d24940cd13938f9260e88a25e93d50e37ff72036` |
| 48 | Epoch 19 declare | `0xc5b21613595a7957cff26e3b6c229660540f97822fa8274cb31b31520f98ec27` |
| 49 | Epoch 19 report · 2,045 Wh · 15.3375 VLT | `0x24bfefb46e16606c579f43826937f3be27d98b94a8c121646145f8a95a0757a4` |
| 50 | Epoch 19 resolve | `0x8b3297a5a016731ac1ed10983dcfaacced0ae7d872cb9bfbb3ae418d022d13a8` |
| 51 | Epoch 20 declare | `0x8137505064eea24c796fedfb89c633804216dafcf3f79a9dde59fd8d36792312` |
| 52 | Epoch 20 empty report · 0 Wh | `0xe18dfb6edd6e0eeb31a99e50c863b18e19318a38acdbccff5ed58d5076b689cd` |
| 53 | Epoch 20 resolve · 0 Wh | `0x469f64ef4dbbaa94bcb04cb4abdfc8bb0cdbc6b68c0e5bd316d2eebbe9aa14ba` |
| 54 | Epoch 21 declare | `0xb7c5bca0016705b5d70b68d8350b0162b254d63c91714cc68eb5fe4455457a4c` |
| 55 | Epoch 21 empty report · 0 Wh | `0x4da35e970295e5e189242eec6ed7fcadf5cb2a538b469a33a0378a3badb740ab` |
| 56 | Epoch 21 resolve · 0 Wh | `0x58a7b4f6cc225f3d132016682fed471f4f5b0f18cb5e2f381c2f5d9a925eaccf` |
| 57 | Epoch 22 declare | `0xdd46cb6c8fe5c215826e618d72167943ccdfef88cf952f07a4f56bb738216252` |
| 58 | Epoch 22 empty report · 0 Wh | `0x27ecde587b36161ece1bc1ed23a55ae6b1a97d88f131db1f901970a23e81cbcc` |
| 59 | Epoch 22 resolve · 0 Wh | `0x6a9059eba5199eec6cf39f92346c57662285a622af835178b06cf2e6873aaa83` |
| 60 | Epoch 23 normal | `0x7a29757e3552a14b5a15cdccf48059c98d482dd985f332362f1bb4af94696364` |
| 61 | Day close | `0x682f6eab6d51a533b42ebeecf3acdca8e58569c646e6daf70b4235ea3a306e05` |

## UI and wallet boundary

The Next dashboard rendered in the in-app browser at `http://localhost:3001/`. Its accessibility tree showed the heatwave-capable scenario controls, preview-only SOS/battery values, disconnected/unavailable wallet state, disabled wallet actions without verified addresses, no hash, and no settled metric. The browser session had no injected wallet provider. Thus the UI safe-offline state and production build are verified, but a browser-driven signed wallet/opt-in/day run is **not verified**. The heatwave was driven through the actual authenticated local Node HTTP server and local chain, not through a connected browser extension.

