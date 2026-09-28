# P1 contracts handoff

Status: **P1 local gate passed** on 28 September 2026. This handoff records
the implementation and local evidence for P6/P9. The localhost addresses and
hashes below are ephemeral Hardhat-node evidence only; they are not MST
Testnet deployment data.

## Owned files changed

- `packages/contracts/contracts/VoltToken.sol`
- `packages/contracts/contracts/VoltGridMarket.sol`
- `packages/contracts/contracts/mocks/ReentrantToken.sol` (test-only)
- `packages/contracts/test/VoltGridMarket.test.ts`
- `packages/contracts/scripts/deploy-local.ts`
- `packages/contracts/scripts/seed.ts`
- `packages/contracts/scripts/smoke-tx.ts`
- `packages/contracts/scripts/lib/localDeployment.ts`
- Removed the unused starter `deploy.ts`, `verify.ts`, `deploy.config.ts`, and
  `scripts/lib/writeDeployment.ts` so there is no package-level mainnet path or
  writer that can overwrite `packages/shared` during parallel work.
- `packages/contracts/hardhat.config.ts`
- `packages/contracts/package.json`

The starter deployment writer that overwrites `packages/shared/src/contracts.ts`
was not run. Local deployment writes only
`packages/contracts/deployments/local.json`; P6 owns shared ABI/address exports.

## Frozen callable surface

No frozen interface signature was changed. The constructor arguments are
`VoltToken(address admin)` and `VoltGridMarket(address settlementToken, address treasury)`.

`VoltToken` exposes:

```text
mint(address to, uint256 amountWei)
faucet()
lastFaucetAt(address) -> uint256
FAUCET_AMOUNT() -> uint256          // 100 VLT
FAUCET_COOLDOWN() -> uint256        // 1 day
MINTER_ROLE() -> bytes32
```

`VoltGridMarket` exposes the frozen functions:

```text
registerHouse(bool hasSolar, bool hasBattery, uint32 batteryCapacityWh)
registerHouseFor(address house, bool hasSolar, bool hasBattery, uint32 batteryCapacityWh)
deposit(uint256 amountWei)
depositFor(address house, uint256 amountWei)
withdraw(uint256 amountWei)
fundTreasury(uint256 amountWei)
withdrawTreasury(uint256 amountWei)
setBatteryOptIn(bool optedIn)
setPricingParams(uint64 floorMicro, uint64 baseMicro, uint64 capMicro, uint64 feeMicro)
startDay(bytes32 dayId, bytes32 inputDigest, uint32 modelVersion)
settleEpoch(bytes32 dayId, uint8 epochIndex, Reading[] readings)
closeDay(bytes32 dayId)
declareEmergency(bytes32 dayId, uint8 epochIndex, uint32 targetWh, uint64 tariffMicro)
reportDischarge(bytes32 dayId, uint8 epochIndex, Discharge[] discharges)
resolveEmergency(bytes32 dayId, uint8 epochIndex)
```

The token additionally emits `FaucetClaimed(address indexed account,
uint256 amountWei, uint256 nextAvailableAt)`. In the market events, indexed
fields are the address/day/epoch fields marked `indexed` in the Solidity
declarations: `dayId` (and `epochIndex` where present), house/payer/buyer/
seller/treasury as applicable. This preserves receipt filtering while keeping
the frozen field order.

The implementation also provides these read helpers for simulator/frontend
preview and P6 integration:

```text
previewPrice(uint256 totalSurplusWh, uint256 totalDeficitWh) -> uint64
houseCount() -> uint256
getHouses() -> address[]
totalInternalBalance() -> uint256
internalBalance(address) -> uint256
houses(address) -> House
currentDay() -> Day
treasury() -> address
settlementToken() -> address
```

Roles are `ORACLE_ROLE`, `REGISTRAR_ROLE`, `SEEDER_ROLE`,
`GRID_OPERATOR_ROLE`, plus OpenZeppelin `DEFAULT_ADMIN_ROLE`; pricing is
`Ownable`-restricted. The deployer initially receives all market roles and
the token `MINTER_ROLE`. `depositFor` and `fundTreasury` pull only from the
caller’s allowance. Withdrawals decrement internal balances before
`SafeERC20.safeTransfer`, and all ERC-20 entry points are reentrancy guarded.

## Required events

The following event names and field order match `docs/architecture/INTERFACE.md`:

```text
HouseRegistered(address house, bool hasSolar, bool hasBattery, uint32 batteryCapacityWh)
Deposited(address payer, address house, uint256 amountWei)
Withdrawn(address house, uint256 amountWei)
TreasuryFunded(address payer, uint256 amountWei)
TreasuryWithdrawn(address treasury, uint256 amountWei)
BatteryOptInChanged(address house, bool optedIn)
PricingParamsChanged(uint64 floorMicro, uint64 baseMicro, uint64 capMicro, uint64 feeMicro)
DayStarted(bytes32 dayId, bytes32 inputDigest, uint32 modelVersion)
TradeSettled(bytes32 dayId, uint8 epochIndex, address seller, address buyer, uint32 wh, uint64 priceMicro, uint256 grossWei, uint256 feeWei)
GridExportSettled(bytes32 dayId, uint8 epochIndex, address seller, uint32 wh, uint256 amountWei)
GridImportSettled(bytes32 dayId, uint8 epochIndex, address buyer, uint32 wh, uint256 amountWei)
EpochSettled(bytes32 dayId, uint8 epochIndex, uint64 priceMicro, uint32 matchedWh, uint32 exportedWh, uint32 importedWh, uint256 feesWei)
EmergencyDeclared(bytes32 dayId, uint8 epochIndex, uint32 targetWh, uint64 tariffMicro)
BatteryDischarged(bytes32 dayId, uint8 epochIndex, address house, uint32 deliveredWh, uint256 payoutWei)
EmergencyResolved(bytes32 dayId, uint8 epochIndex, uint32 targetWh, uint32 shavedWh, uint256 payoutWei)
DayClosed(bytes32 dayId)
```

`TradeSettled` is emitted only for positive integer-Wh pair flows. Hamilton
largest-remainder quotas are calculated separately for sellers and buyers,
with registration-order tie breaks, then paired in registration order. There
is no energy dust credit to the treasury. Money uses the exact formula
`amountWei = wh * priceMicroVltPerKwh * 1e9`; internal VLT moves are explicit
buyer debit / seller net credit / treasury fee credit, or treasury export/import
transitions. Unsolicited token transfers remain custody surplus, not ledger
credits.

## Day and emergency behavior

`startDay` consumes a never-before-used nonzero `dayId`; an active day fixes
the price parameters and freezes registration. Epochs must be finalized in
order `0..23`. A normal epoch calls `settleEpoch`. An emergency declares the
next open epoch, blocks normal settlement, optionally accepts one discharge
batch, and `resolveEmergency` advances the same epoch counter without any
`TradeSettled` event. A day can therefore continue after an emergency outcome.
`closeDay` requires all 24 outcomes and currently only seals accounting.

CarbonCertificate, certificate minting, retirement, and a product-level VPP
workflow are not shipped in P1. The emergency accounting path exists only to
preserve the day state machine and must not be presented as completed VPP or
carbon functionality.

## Generated artifacts

From the repository root, after dependencies are already installed:

```powershell
$env:PATH='C:\Program Files\nodejs;'+$env:PATH
& 'C:\Program Files\nodejs\npm.cmd' run compile --workspace contracts
```

Hardhat writes ABI/bytecode artifacts to:

```text
C:\thanmay\mst\voltgrid\packages\contracts\artifacts\contracts\VoltToken.sol\VoltToken.json
C:\thanmay\mst\voltgrid\packages\contracts\artifacts\contracts\VoltGridMarket.sol\VoltGridMarket.json
```

TypeChain output is under
`C:\thanmay\mst\voltgrid\packages\contracts\typechain-types`.
P6 should export only the required ABI fragments from these generated
artifacts into `packages/shared` and must not copy the ephemeral local
deployment record as testnet evidence.

## Commands and actual results

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run compile --workspace contracts
# PASS: Hardhat compile; 18 Solidity files compiled on the initial build.

& 'C:\Program Files\nodejs\npm.cmd' run test --workspace contracts
# PASS: 15 tests.

& 'C:\Program Files\nodejs\npm.cmd' run lint --workspace contracts
# PASS: 0 errors, 3 warnings (starter Hello global import and two immutable
#       naming warnings for public immutable settlementToken/treasury).
```

Local receipt proof used a fresh Hardhat node (`chainId 31337`):

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec --workspace contracts hardhat node
& 'C:\Program Files\nodejs\npm.cmd' run deploy:local --workspace contracts
& 'C:\Program Files\nodejs\npm.cmd' run seed:local --workspace contracts
& 'C:\Program Files\nodejs\npm.cmd' run smoke:local --workspace contracts
```

The successful run produced:

```text
VoltToken       0x5FbDB2315678afecb367f032d93F642f64180aa3
deploy tx       0x570e8d25a95a38f0e2a0e816d5075c6a730f652cd63ba1387c34545874b1e63e  block 1
VoltGridMarket  0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
deploy tx       0xc830bb466184a8cbe7720240c42c4ac201a8ffaac35f34b8fec64d44d5e4a62f  block 2
DayStarted      0x17bdcf23028fb3573c16fe0ba3c2efe47c92ff637f7e9ae931b2a4ba314f292c  block 38
EpochSettled    0x6c13969d869e83b096b4b46445d2688ef4ad675c370ac1478d777e7c5c0bbaee  block 39
```

The smoke script decoded four `TradeSettled` events and one
`EpochSettled`: `matchedWh=400`, `priceMicro=5000000`,
`exportedWh=0`, `importedWh=0`, `feesWei=168000000000000000`.
It checked exact `totalInternalBalance` and market token custody before and
after; both were `10000000000000000000000` wei. These are local-only values,
not public deployment evidence.

Gas estimates from the focused test’s worst-case settlement shape:

| Registered houses | `settleEpoch` gas | 70% of observed 55,000,000 testnet block limit |
|---:|---:|---:|
| 9 | 343,746 | 38,500,000 |
| 16 | 475,501 | 38,500,000 |

Both are below the local safety threshold. The 55,000,000 block limit is the
P0 read-only observation from 28 September 2026, not a deployment guarantee;
P9 must re-read the live limit and estimate again before sending a testnet
transaction.

## P6/P9 coordination items

1. Export the generated ABIs and typed addresses in `packages/shared` only
   after a confirmed testnet deployment. Do not invoke the starter writer
   during parallel work.
2. Keep `dayId` generation and replay/resume persistence in the relayer. A
   replay must use a new day ID; a resume must reuse the existing one.
3. The local deploy script accepts `TREASURY_ADDRESS`, `ORACLE_ADDRESS`,
   `REGISTRAR_ADDRESS`, `SEEDER_ADDRESS`, and `GRID_OPERATOR_ADDRESS`; the
   testnet operator must supply real role addresses and confirm receipts.
4. `deploy:testnet` writes a package-local deployment record and does not
   claim testnet success. P9 must add only real receipt data to the shared
   deployment evidence format and must never use the root/mainnet starter
   command.
5. `viaIR: true` is required by the current bounded settlement implementation
   to avoid Solidity legacy stack-too-deep compilation. P9 must confirm the
   resulting bytecode/opcodes execute on MST Testnet before claiming compiler
   compatibility.
6. `closeDay` is intentionally accounting-only in P1. Adding CarbonCertificate
   later changes deployment scope and requires P6 ABI/deployment coordination;
   do not add certificate fields to the current shared ABI as if deployed.
