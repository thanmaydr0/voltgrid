# P2 simulator handoff

Status: complete for the frozen v1 simulator gate.

## Scope and changed files

Only the P2-owned paths were changed:

- `packages/sim-core/package.json`
- `packages/sim-core/tsconfig.json`
- `packages/sim-core/tsconfig.test.json`
- `packages/sim-core/src/index.ts`
- `packages/sim-core/test/sim-core.test.ts`
- `packages/sim-core/fixtures/golden.json`
- `docs/coordination/P2-handoff.md`

No contract, frontend, relayer, shared package, root configuration, lockfile, or frozen architecture document was edited. No package was installed, committed, or deployed.

## Exported API

The package exports the frozen simulator surface and deterministic helpers:

- `simulateEpoch(input: SimInput): SimOutput`
- `simulateDay(input: SimDayInput): readonly SimOutput[]` and alias `generateDay`
- `createDefaultHouses(options?)`, `DEFAULT_HOUSES`
- `createDefaultSimulationInput(options)`
- `previewPriceMicroVltPerKwh(surplusWh, deficitWh, params?)`, aliases `previewPrice` and `calculatePricePreview`
- `emergencyDischarges(output, targetWh?)`
- `SimulationInputAdapter<TObservation>`: reserved adapter seam for future observations; the default simulator never calls it and its output cannot become household Wh
- Types `Scenario`, `HouseKind`, `HouseConfig`, `SimInput`, `SimDayInput`, `SimOutput`, `Reading`, `Discharge`, `ModelledWeather`, `BatteryState`, `PricingParams`, `SimulationUnits`, `DayId`, `Address`
- Constants for `MODEL_VERSION`, house/reading/emergency bounds, transformer default, frozen tariffs/curve, threshold, `SIMULATION_UNITS`, and `DEFAULT_PRICING_PARAMS`

`SimOutput` keeps every field in `INTERFACE.md` and adds `dayId`, `units`, modelled `weather`, detailed `batteryState`, and ABI-shaped `eligibleEmergencyDischargeWh`. The top-level immutable provenance fields are `source: "simulation"`, `scenario`, `seed`, `modelVersion`, `dayId`, and `epochIndex`. `readings` remain ordered registration-order `Reading` records; emergency candidates can be converted to frozen `Discharge` records with `emergencyDischarges`.

## Model behavior

- Exactly eight inspectable default houses are provided: three solar+battery, one solar-only, two EV, and two regular consumers. `createDefaultHouses({ viewerAddress })` appends an optional ninth connected-user house without changing the eight-house defaults.
- Sunny, rainy, and heatwave scenarios use explicit integer weather fields (`irradianceBps`, `cloudCoverBps`, `temperatureC`, `humidityBps`, `precipitationBps`) labelled `source: "modelled"`. They are not GPS, satellite, rain, temperature, or humidity sensor readings.
- Solar bell curve, profile load, EV evening charging, regular evening load, heatwave cooling load, weather variation, initial battery SoC, battery charging/discharging, and conservative emergency eligibility are all deterministic from `seed`, `scenario`, `epochIndex`, and the house map.
- All household generation/consumption and battery state values are whole Wh. Input validation rejects unsupported model/scenario/kind values, malformed or zero addresses, duplicate addresses (case-insensitive), invalid hours, non-integers, impossible capacities, invalid transformer capacities, bad day IDs, and mismatched `hour`/`epochIndex`.
- Stress is `floor(totalConsumptionWh * 10,000 / transformerCapacityWh)`. `emergencyProposed` is strictly `stressBps > 9,500`; the target is the excess over the 95% threshold and is bounded by `1,600,000 Wh`.
- `previewPriceMicroVltPerKwh` exactly follows the frozen integer curve: ratio is `floor(deficitWh * 10,000 / surplusWh)`, multipliers are 6,000 / 10,000 / 14,000 BPS with integer interpolation, and the result is clamped to the frozen floor/base/cap. It returns `null` when no P2P Wh exists; the on-chain `EpochSettled.priceMicro` representation for that case is `0`.
- Output objects, nested records, arrays, units, and modelled weather are frozen. There is no `Math.random`, `Date.now`, network, filesystem, or ambient clock/random source in the simulation path. If no day ID is supplied, a stable deterministic model day ID is derived; the relayer must pass its persisted chain day ID for the chain lifecycle described in the freeze.

## Verification

Commands were run from `C:\thanmay\mst\voltgrid` using the installed local Node/npm path. npm printed the existing `.npmrc` `link-workspace-packages` warning; no install was run.

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run typecheck --workspace=voltgrid-sim-core
```

Passed (`tsc --noEmit`).

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test --workspace=voltgrid-sim-core
```

Passed: 11/11 tests. Coverage includes repeated serialization for all scenarios, seed/scenario changes, optional viewer/EV input, 24 ordered epochs, night generation, battery SoC/candidate bounds, strict overload triggering, frozen pricing boundaries, invalid/duplicate inputs, immutable records, and `Reading`/`Discharge` field compatibility.

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build --workspace=voltgrid-sim-core
```

Passed (`tsc`). The generated local `packages/sim-core/dist` output was removed after verification; the package build emits its public source at `dist/index.js` and `dist/index.d.ts` as declared by the manifest.

Independent-process determinism check:

```powershell
$simScript = "const s=require('./packages/sim-core/src'); const o=s.simulateEpoch({modelVersion:1,scenario:process.argv[1],seed:'independent-seed',epochIndex:12,houses:s.DEFAULT_HOUSES,transformerCapacityWh:s.DEFAULT_TRANSFORMER_CAPACITY_WH,viewerEvCharging:false}); process.stdout.write(JSON.stringify(o));"
foreach ($scenario in @('sunny','rainy','heatwave')) {
  $first = (& node --require ts-node/register -e $simScript $scenario)
  $second = (& node --require ts-node/register -e $simScript $scenario)
  if ($first -cne $second) { throw "serialization mismatch for $scenario" }
}
```

Passed in two separate Node processes per scenario: sunny 2,426 bytes, rainy 2,428 bytes, heatwave 2,442 bytes, with byte-for-byte equality each time.

Representative frozen-gate observations from `fixtures/golden.json`: sunny noon (`golden-seed`, epoch 12) produces `18,104 Wh` generation versus `8,034 Wh` consumption and `3,000,000` micro-VLT/kWh preview price; heatwave epoch 19 produces `18,775 bps` stress, `9,275 Wh` proposed target, and no P2P price because there is no supply.

## P5/P6 integration notes and request

The root npm workspace already uses `packages/*`, so the new package is discoverable by the current npm CLI (`--workspace=voltgrid-sim-core` passed). The root `package-lock.json` was intentionally not updated in P2. P6 must reconcile the new package manifest and lockfile with the normal workspace install before cross-package integration. If the integration environment does not honor the existing wildcard, P6 should register `packages/sim-core` in the root workspace configuration; P2 did not edit root config.

The relayer should persist the run's scenario, seed, house map, and chain-generated day ID, pass that day ID into each `SimInput`, and use `readings` only as the oracle's regenerated model preview. The adapter seam is intentionally metadata-only until a future trusted observation design is approved; no sensor adapter is implemented here.
