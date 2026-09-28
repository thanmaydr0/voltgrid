import hre from "hardhat";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { concat, getAddress, getBytes, keccak256, toBeHex, toUtf8Bytes, Wallet } from "ethers";
import {
  assertMstTestnet,
  MST_TESTNET_CHAIN_ID,
  privateKeyEnv,
  readJsonIfPresent,
  readTestnetDeployment,
  receiptRecord,
  sendRecoverableTransaction,
  withTestnetAdminLock,
  writeJsonAtomic,
  writeTestnetDeployment,
} from "./lib/testnetDeployment";

type HouseConfig = Readonly<{ address: `0x${string}`; kind: string; hasSolar: boolean; hasBattery: boolean; batteryCapacityWh: number }>;
type SimOutput = Readonly<{
  epochIndex: number;
  readings: readonly Readonly<{ house: string; generationWh: number; consumptionWh: number }>[];
  emergencyProposed: boolean;
  totalGenerationWh: number;
  totalConsumptionWh: number;
  previewPriceMicroVltPerKwh: number | null;
}>;
type SmokePlan = {
  schemaVersion: 1;
  chainId: number;
  marketAddress: string;
  oracleAddress: string;
  dayId: string;
  inputDigest: string;
  seed: string;
  scenario: "sunny";
  transformerCapacityWh: number;
  houses: readonly HouseConfig[];
  start?: { hash: string; blockNumber: string; gasUsed: string };
  outcomes: Record<string, { hash: string; blockNumber: string; gasUsed: string; matchedWh: number; priceMicroVltPerKwh: number }>;
  close?: { hash: string; blockNumber: string; gasUsed: string; certificateCount: number };
};
type SimCoreModule = {
  simulateDay(input: Readonly<{
    modelVersion: 1;
    scenario: "sunny";
    seed: string;
    dayId: `0x${string}`;
    houses: readonly HouseConfig[];
    transformerCapacityWh: number;
    viewerEvCharging: false;
  }>): readonly SimOutput[];
};

const simCore = require("voltgrid-sim-core") as SimCoreModule;
const planPath = path.resolve(__dirname, "../deployments/testnet-smoke.plan.json");
const TRANSFORMER_CAPACITY_WH = 1_000_000;

function kindFor(index: number, house: any): string {
  if (house.hasBattery && house.hasSolar) return "solarBattery";
  if (house.hasSolar) return "solarOnly";
  if (house.hasBattery) return "viewer";
  if (index >= 8) return "viewer";
  return index % 2 === 0 ? "regular" : "ev";
}

function decodeMarketReceipt(market: any, receipt: any) {
  return receipt.logs.map((log: any) => {
    if (log.address.toLowerCase() !== market.target.toLowerCase()) return null;
    try { return market.interface.parseLog({ topics: log.topics, data: log.data }); } catch { return null; }
  }).filter(Boolean);
}

async function runSmoke() {
  const deployment = await readTestnetDeployment();
  await assertMstTestnet(hre.ethers.provider);
  const oracle = new Wallet(privateKeyEnv("ORACLE_PRIVATE_KEY"), hre.ethers.provider);
  const marketAddress = deployment.contracts.VoltGridMarket!.address;
  const market = await hre.ethers.getContractAt("VoltGridMarket", marketAddress, oracle);
  const oracleAddress = getAddress(oracle.address);
  if (process.env.ORACLE_ADDRESS && getAddress(process.env.ORACLE_ADDRESS) !== oracleAddress) throw new Error("ORACLE_ADDRESS does not match ORACLE_PRIVATE_KEY");
  if (!(await market.hasRole(await market.ORACLE_ROLE(), oracleAddress))) throw new Error("Oracle lacks ORACLE_ROLE");
  if (!(await market.hasRole(await market.GRID_OPERATOR_ROLE(), oracleAddress))) throw new Error("Oracle lacks GRID_OPERATOR_ROLE");

  if (deployment.transactions.smokeRun) {
    const prior = deployment.transactions.smokeRun as { dayId?: string; closeTxHash?: string; outcomeCount?: number; explorerUrl?: string };
    if (!prior.dayId || !prior.closeTxHash || prior.outcomeCount !== 24) throw new Error("Existing smoke-run artifact is incomplete; inspect it rather than starting a second day");
    const receipt = await hre.ethers.provider.getTransactionReceipt(prior.closeTxHash);
    if (!receipt || receipt.status !== 1) throw new Error("Recorded smoke close receipt no longer verifies");
    process.stdout.write(`Existing smoke day verified; no transaction sent. day=${prior.dayId} close=${prior.closeTxHash} explorer=${prior.explorerUrl}\n`);
    return;
  }

  const [registered] = await Promise.all([market.getHouses()]);
  if (registered.length !== 8) throw new Error(`Smoke expects exactly eight seeded houses, found ${registered.length}`);
  const houses: HouseConfig[] = [];
  for (let index = 0; index < registered.length; index += 1) {
    const address = getAddress(registered[index]);
    const state = await market.houses(address);
    if (!state.exists) throw new Error(`Registered house ${index} is not readable`);
    houses.push(Object.freeze({
      address: address as `0x${string}`,
      kind: kindFor(index, state),
      hasSolar: Boolean(state.hasSolar),
      hasBattery: Boolean(state.hasBattery),
      batteryCapacityWh: Number(state.batteryCapacityWh),
    }));
  }

  let plan = await readJsonIfPresent<SmokePlan>(planPath);
  if (plan && (plan.schemaVersion !== 1 || plan.chainId !== MST_TESTNET_CHAIN_ID || plan.marketAddress.toLowerCase() !== marketAddress.toLowerCase() || plan.oracleAddress.toLowerCase() !== oracleAddress.toLowerCase())) {
    throw new Error("Existing smoke plan belongs to another deployment/oracle; refusing to reuse it");
  }
  const currentDay = await market.currentDay();
  if (!plan) {
    if (currentDay.active) throw new Error("Another day is active; smoke will not collide with it");
    const dayId = keccak256(concat([toBeHex(BigInt(deployment.chainId), 32), getBytes(marketAddress), toUtf8Bytes(randomUUID())]));
    const seed = `p9-sunny-smoke-${randomUUID()}`;
    const inputDigest = keccak256(toUtf8Bytes(JSON.stringify({ modelVersion: 1, scenario: "sunny", seed, houses, transformerCapacityWh: TRANSFORMER_CAPACITY_WH, viewerEvCharging: false })));
    plan = {
      schemaVersion: 1,
      chainId: deployment.chainId,
      marketAddress,
      oracleAddress,
      dayId,
      inputDigest,
      seed,
      scenario: "sunny",
      transformerCapacityWh: TRANSFORMER_CAPACITY_WH,
      houses,
      outcomes: {},
    };
    await writeJsonAtomic(planPath, plan);
  }

  const outputs = simCore.simulateDay({
    modelVersion: 1,
    scenario: plan.scenario,
    seed: plan.seed,
    dayId: plan.dayId as `0x${string}`,
    houses: plan.houses,
    transformerCapacityWh: plan.transformerCapacityWh,
    viewerEvCharging: false,
  });
  if (outputs.length !== 24 || outputs.some((output, index) => output.epochIndex !== index || output.emergencyProposed)) {
    throw new Error("Smoke scenario is not exactly 24 non-emergency epochs; no day transaction was sent");
  }
  for (const output of outputs) {
    const totalSurplus = output.readings.reduce((sum, row) => sum + Math.max(0, row.generationWh - row.consumptionWh), 0);
    const totalDeficit = output.readings.reduce((sum, row) => sum + Math.max(0, row.consumptionWh - row.generationWh), 0);
    const preview = Number(await market.previewPrice(totalSurplus, totalDeficit));
    const expected = output.previewPriceMicroVltPerKwh ?? 0;
    if (preview !== expected) throw new Error(`On-chain price preview differs from sim-core at hour ${output.epochIndex}: ${preview} != ${expected}`);
  }

  if (!plan.start) {
    const data = market.interface.encodeFunctionData("startDay", [plan.dayId, plan.inputDigest, 1]);
    await sendRecoverableTransaction({
      provider: hre.ethers.provider,
      signer: oracle,
      action: "smoke:start",
      request: { to: marketAddress, data },
      isApplied: async () => Boolean(await market.usedDayIds(plan!.dayId)) && (await market.currentDay()).id.toLowerCase() === plan!.dayId.toLowerCase(),
      onConfirmed: async (receipt) => {
        const events = decodeMarketReceipt(market, receipt);
        if (!events.some((event: any) => event?.name === "DayStarted" && event.args.dayId.toLowerCase() === plan!.dayId.toLowerCase())) throw new Error("Start receipt lacks the expected DayStarted event");
        plan!.start = await receiptRecord(receipt, "smoke day start");
        await writeJsonAtomic(planPath, plan!);
      },
    });
    if (!plan.start) {
      const startBlock = Number(deployment.contracts.VoltGridMarket!.blockNumber);
      const starts = await market.queryFilter(market.filters.DayStarted(plan.dayId), startBlock, "latest");
      if (starts.length !== 1) throw new Error("Smoke day is active but its unique DayStarted receipt cannot be reconciled");
      const receipt = await hre.ethers.provider.getTransactionReceipt(starts[0].transactionHash);
      plan.start = await receiptRecord(receipt, "recovered smoke day start");
      await writeJsonAtomic(planPath, plan);
    }
  }
  const startedState = await market.currentDay();
  if (!startedState.active || startedState.id.toLowerCase() !== plan.dayId.toLowerCase()) throw new Error("Smoke day is not the currently active day; refusing to settle another day");

  for (let epoch = 0; epoch < 24; epoch += 1) {
    if (plan.outcomes[String(epoch)]) continue;
    const output = outputs[epoch];
    const readings = output.readings.map((row) => [row.house, row.generationWh, row.consumptionWh]);
    const data = market.interface.encodeFunctionData("settleEpoch", [plan.dayId, epoch, readings]);
    await sendRecoverableTransaction({
      provider: hre.ethers.provider,
      signer: oracle,
      action: `smoke:settle:${epoch}`,
      request: { to: marketAddress, data },
      isApplied: async () => {
        const state = await market.currentDay();
        return state.id.toLowerCase() === plan!.dayId.toLowerCase() && Number(state.nextEpoch) > epoch;
      },
      onConfirmed: async (receipt) => {
        const event = decodeMarketReceipt(market, receipt).find((item: any) => item?.name === "EpochSettled" && item.args.dayId.toLowerCase() === plan!.dayId.toLowerCase() && Number(item.args.epochIndex) === epoch) as any;
        if (!event) throw new Error(`Hour ${epoch} receipt lacks the expected EpochSettled log`);
        const metrics = {
          matchedWh: Number(event.args.matchedWh),
          priceMicroVltPerKwh: Number(event.args.priceMicro),
        };
        plan!.outcomes[String(epoch)] = { ...(await receiptRecord(receipt, `smoke epoch ${epoch}`)), ...metrics };
        await writeJsonAtomic(planPath, plan!);
      },
    });
    if (!plan.outcomes[String(epoch)]) {
      const startBlock = Number(deployment.contracts.VoltGridMarket!.blockNumber);
      const logs = await market.queryFilter(market.filters.EpochSettled(plan.dayId, epoch), startBlock, "latest");
      if (logs.length !== 1) throw new Error(`Hour ${epoch} advanced on chain but its unique EpochSettled receipt cannot be reconciled`);
      const receipt = await hre.ethers.provider.getTransactionReceipt(logs[0].transactionHash);
      if (!receipt || receipt.status !== 1) throw new Error(`Hour ${epoch} recovered receipt is missing or unsuccessful`);
      const event = decodeMarketReceipt(market, receipt).find((item: any) => item?.name === "EpochSettled" && item.args.dayId.toLowerCase() === plan!.dayId.toLowerCase() && Number(item.args.epochIndex) === epoch) as any;
      if (!event) throw new Error(`Hour ${epoch} recovered receipt lacks the expected EpochSettled log`);
      plan.outcomes[String(epoch)] = {
        ...(await receiptRecord(receipt, `recovered smoke epoch ${epoch}`)),
        matchedWh: Number(event.args.matchedWh),
        priceMicroVltPerKwh: Number(event.args.priceMicro),
      };
      await writeJsonAtomic(planPath, plan);
    }
  }

  if (Object.keys(plan.outcomes).length !== 24) throw new Error("Smoke did not record exactly 24 normal epoch receipts");
  if (!plan.close) {
    const data = market.interface.encodeFunctionData("closeDay", [plan.dayId]);
    await sendRecoverableTransaction({
      provider: hre.ethers.provider,
      signer: oracle,
      action: "smoke:close",
      request: { to: marketAddress, data },
      isApplied: async () => (await market.queryFilter(market.filters.DayClosed(plan!.dayId), 0, "latest")).length > 0,
      onConfirmed: async (receipt) => {
        const events = decodeMarketReceipt(market, receipt);
        if (!events.some((event: any) => event?.name === "DayClosed" && event.args.dayId.toLowerCase() === plan!.dayId.toLowerCase())) throw new Error("Close receipt lacks the expected DayClosed event");
        const certificateCount = events.filter((event: any) => event?.name === "CertificateMinted").length;
        plan!.close = { ...(await receiptRecord(receipt, "smoke day close")), certificateCount };
        await writeJsonAtomic(planPath, plan!);
      },
    });
    if (!plan.close) {
      const startBlock = Number(deployment.contracts.VoltGridMarket!.blockNumber);
      const logs = await market.queryFilter(market.filters.DayClosed(plan.dayId), startBlock, "latest");
      if (logs.length !== 1) throw new Error("Smoke day closed on chain but its unique DayClosed receipt cannot be reconciled");
      const receipt = await hre.ethers.provider.getTransactionReceipt(logs[0].transactionHash);
      if (!receipt || receipt.status !== 1) throw new Error("Recovered close receipt is missing or unsuccessful");
      const events = decodeMarketReceipt(market, receipt);
      if (!events.some((event: any) => event?.name === "DayClosed" && event.args.dayId.toLowerCase() === plan!.dayId.toLowerCase())) throw new Error("Recovered close receipt lacks the expected DayClosed log");
      const certificateCount = events.filter((event: any) => event?.name === "CertificateMinted").length;
      plan.close = { ...(await receiptRecord(receipt, "recovered smoke day close")), certificateCount };
      await writeJsonAtomic(planPath, plan);
    }
  }

  const gasUsed = BigInt(plan.start!.gasUsed) + Object.values(plan.outcomes).reduce((sum, item) => sum + BigInt(item.gasUsed), 0n) + BigInt(plan.close!.gasUsed);
  deployment.transactions.smokeRun = {
    dayId: plan.dayId,
    scenario: plan.scenario,
    seed: plan.seed,
    outcomeCount: 24,
    emergencyCount: 0,
    certificateCount: plan.close!.certificateCount,
    closeTxHash: plan.close!.hash,
    closeBlockNumber: plan.close!.blockNumber,
    gasUsed: gasUsed.toString(),
    epochTransactions: Object.values(plan.outcomes).map(({ hash, blockNumber, matchedWh, priceMicroVltPerKwh }) => ({ hash, blockNumber, matchedWh, priceMicroVltPerKwh })),
    explorerUrl: `${deployment.explorerBaseUrl}/tx/${plan.close!.hash}`,
  };
  await writeTestnetDeployment(deployment);
  await fs.unlink(planPath).catch(() => undefined);
  process.stdout.write(`Confirmed testnet smoke: day=${plan.dayId} scenario=sunny outcomes=24 emergencies=0 close=${plan.close!.hash} block=${plan.close!.blockNumber} gas=${gasUsed} explorer=${deployment.explorerBaseUrl}/tx/${plan.close!.hash}\n`);
}

async function main() {
  await withTestnetAdminLock(runSmoke);
}

main().catch((error) => {
  process.stderr.write(`MST Testnet smoke stopped safely: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
