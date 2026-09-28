import hre from "hardhat";
import fs from "node:fs/promises";
import path from "node:path";
import { getAddress, parseEther } from "ethers";
import {
  assertMstTestnet,
  normalizeAddress,
  privateKeyEnv,
  readJsonIfPresent,
  readTestnetDeployment,
  receiptRecord,
  sendRecoverableTransaction,
  withTestnetAdminLock,
  writeJsonAtomic,
  writeTestnetDeployment,
} from "./lib/testnetDeployment";

type SimHouse = Readonly<{
  address: string;
  hasSolar: boolean;
  hasBattery: boolean;
  batteryCapacityWh: number;
}>;
type SeedOperation = {
  id: string;
  label: string;
  kind: "register" | "mint" | "approve" | "deposit" | "fundTreasury";
  to: string;
  data: string;
  status?: "confirmed" | "observed";
  tx?: { hash: string; blockNumber: string; gasUsed: string };
  house?: SimHouse;
  account?: string;
  amount?: string;
  expectedBalance?: string;
};
type SeedPlan = {
  schemaVersion: 1;
  chainId: number;
  deployerAddress: string;
  marketAddress: string;
  tokenAddress: string;
  houses: readonly SimHouse[];
  operations: SeedOperation[];
};

const seedPlanPath = path.resolve(__dirname, "../deployments/testnet-seed.plan.json");
const HOUSE_VLT_TARGET = parseEther("1000");
const TREASURY_VLT_TARGET = parseEther("2000");
const simCore = require("voltgrid-sim-core") as { DEFAULT_HOUSES: readonly SimHouse[] };

function housePlan(): readonly SimHouse[] {
  const configured = (process.env.HOUSE_ADDRESSES || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (configured.length === 0) return simCore.DEFAULT_HOUSES;
  if (configured.length !== simCore.DEFAULT_HOUSES.length) throw new Error(`HOUSE_ADDRESSES must contain exactly ${simCore.DEFAULT_HOUSES.length} entries`);
  const seen = new Set<string>();
  return Object.freeze(simCore.DEFAULT_HOUSES.map((house, index) => {
    const address = normalizeAddress(configured[index], `HOUSE_ADDRESSES[${index}]`);
    const key = address.toLowerCase();
    if (seen.has(key)) throw new Error("HOUSE_ADDRESSES contains duplicate addresses");
    seen.add(key);
    return Object.freeze({ ...house, address });
  }));
}

function sameProfile(actual: any, expected: SimHouse): boolean {
  return Boolean(actual.exists) && actual.hasSolar === expected.hasSolar && actual.hasBattery === expected.hasBattery && Number(actual.batteryCapacityWh) === expected.batteryCapacityWh;
}

async function createPlan(
  deployment: Awaited<ReturnType<typeof readTestnetDeployment>>,
  market: any,
  token: any,
  deployerAddress: string,
  houses: readonly SimHouse[],
  marketAddress: string,
  tokenAddress: string,
): Promise<SeedPlan> {
  const current = (await market.getHouses()).map((address: string) => getAddress(address));
  if (current.length > houses.length) throw new Error(`Market already has ${current.length} houses; refusing to truncate or reorder`);
  const operations: SeedOperation[] = [];
  for (let index = 0; index < current.length; index += 1) {
    const expected = houses[index];
    if (current[index].toLowerCase() !== expected.address.toLowerCase()) throw new Error(`On-chain house order differs at index ${index}; refusing resequence`);
    if (!sameProfile(await market.houses(current[index]), expected)) throw new Error(`On-chain profile differs from sim-core default at index ${index}`);
  }
  for (let index = current.length; index < houses.length; index += 1) {
    const house = houses[index];
    const data = market.interface.encodeFunctionData("registerHouseFor", [house.address, house.hasSolar, house.hasBattery, house.batteryCapacityWh]);
    operations.push({ id: `register:${index}:${house.address.toLowerCase()}`, label: `register house ${index}`, kind: "register", to: marketAddress, data, house });
  }

  const treasury = getAddress(await market.treasury());
  if (houses.some((house) => house.address.toLowerCase() === treasury.toLowerCase())) throw new Error("Treasury address must not be one of the simulated household addresses");
  const targets = [
    ...houses.map((house) => ({ address: getAddress(house.address), target: HOUSE_VLT_TARGET, label: `house ${house.address}` })),
    { address: treasury, target: TREASURY_VLT_TARGET, label: "treasury" },
  ];
  const deficits: Array<{ address: string; amount: bigint; target: bigint; label: string }> = [];
  let totalDepositNeed = 0n;
  for (const target of targets) {
    const balance = await market.internalBalance(target.address);
    if (balance < target.target) {
      const amount = target.target - balance;
      totalDepositNeed += amount;
      deficits.push({ address: target.address, amount, target: target.target, label: target.label });
    }
  }

  if (totalDepositNeed > 0n) {
    const walletBalance = await token.balanceOf(deployerAddress);
    if (walletBalance < totalDepositNeed) {
      const amount = totalDepositNeed - walletBalance;
      operations.push({
        id: `mint:${deployerAddress.toLowerCase()}`,
        label: "mint VLT seed budget",
        kind: "mint",
        to: tokenAddress,
        data: token.interface.encodeFunctionData("mint", [deployerAddress, amount]),
        account: deployerAddress,
        amount: amount.toString(),
        expectedBalance: (walletBalance + amount).toString(),
      });
    }
    const allowance = await token.allowance(deployerAddress, marketAddress);
    if (allowance < totalDepositNeed) {
      operations.push({
        id: `approve:${marketAddress.toLowerCase()}`,
        label: "approve VLT seed budget",
        kind: "approve",
        to: tokenAddress,
        data: token.interface.encodeFunctionData("approve", [marketAddress, totalDepositNeed]),
        account: marketAddress,
        amount: totalDepositNeed.toString(),
      });
    }
    for (const deficit of deficits) {
      const isTreasury = deficit.address.toLowerCase() === treasury.toLowerCase();
      const kind = isTreasury ? "fundTreasury" : "deposit";
      const label = isTreasury ? "fund treasury" : `fund ${deficit.label}`;
      operations.push({
        id: `${kind}:${deficit.address.toLowerCase()}`,
        label,
        kind,
        to: marketAddress,
        data: isTreasury
          ? market.interface.encodeFunctionData("fundTreasury", [deficit.amount])
          : market.interface.encodeFunctionData("depositFor", [deficit.address, deficit.amount]),
        account: deficit.address,
        amount: deficit.amount.toString(),
        expectedBalance: deficit.target.toString(),
      });
    }
  }

  const plan: SeedPlan = {
    schemaVersion: 1,
    chainId: deployment.chainId,
    deployerAddress,
    marketAddress,
    tokenAddress,
    houses,
    operations,
  };
  await writeJsonAtomic(seedPlanPath, plan);
  return plan;
}

async function operationApplied(operation: SeedOperation, market: any, token: any, deployerAddress: string): Promise<boolean> {
  switch (operation.kind) {
    case "register": {
      const house = operation.house!;
      const state = await market.houses(house.address);
      return sameProfile(state, house);
    }
    case "mint":
      return (await token.balanceOf(operation.account)) >= BigInt(operation.expectedBalance!);
    case "approve":
      return (await token.allowance(deployerAddress, operation.account)) >= BigInt(operation.amount!);
    case "deposit":
    case "fundTreasury":
      return (await market.internalBalance(operation.account)) >= BigInt(operation.expectedBalance!);
  }
}

async function main() {
  await withTestnetAdminLock(async () => {
    const deployment = await readTestnetDeployment();
    await assertMstTestnet(hre.ethers.provider);
    privateKeyEnv("MST_TESTNET_DEPLOYER_PRIVATE_KEY");
    const [deployer] = await hre.ethers.getSigners();
    const deployerAddress = getAddress(await deployer.getAddress());
    if (deployerAddress.toLowerCase() !== deployment.deployerAddress.toLowerCase()) throw new Error("Signer is not the recorded deployment admin");
    const marketAddress = deployment.contracts.VoltGridMarket!.address;
    const tokenAddress = deployment.contracts.VoltToken!.address;
    const market = await hre.ethers.getContractAt("VoltGridMarket", marketAddress, deployer);
    const token = await hre.ethers.getContractAt("VoltToken", tokenAddress, deployer);
    if ((await market.currentDay()).active) throw new Error("A day is active; wait for confirmed close before seeding");

    let plan = await readJsonIfPresent<SeedPlan>(seedPlanPath);
    const houses = plan ? plan.houses : housePlan();
    if (plan && (plan.schemaVersion !== 1 || plan.chainId !== deployment.chainId || plan.deployerAddress.toLowerCase() !== deployerAddress.toLowerCase() || plan.marketAddress.toLowerCase() !== marketAddress.toLowerCase() || plan.tokenAddress.toLowerCase() !== tokenAddress.toLowerCase())) {
      throw new Error("Existing seed plan belongs to another deployment; refusing to reuse it");
    }
    const treasury = getAddress(await market.treasury());
    if (houses.some((house) => house.address.toLowerCase() === treasury.toLowerCase())) throw new Error("Treasury address must not be one of the simulated household addresses");

    const registrarRole = await market.REGISTRAR_ROLE();
    const seederRole = await market.SEEDER_ROLE();
    const minterRole = await token.MINTER_ROLE();
    if (!(await market.hasRole(registrarRole, deployerAddress))) throw new Error("Deployment admin lacks REGISTRAR_ROLE; run role setup before seed");
    if (!(await market.hasRole(seederRole, deployerAddress))) throw new Error("Deployment admin lacks SEEDER_ROLE; run seed before lockdown");
    if (!(await token.hasRole(minterRole, deployerAddress))) throw new Error("Deployment admin lacks token MINTER_ROLE; run seed before lockdown");

    if (!plan) plan = await createPlan(deployment, market, token, deployerAddress, houses, marketAddress, tokenAddress);
    for (const operation of plan.operations) {
      if (operation.status) continue;
      const applied = () => operationApplied(operation, market, token, deployerAddress);
      const receipt = await sendRecoverableTransaction({
        provider: hre.ethers.provider,
        signer: deployer,
        action: `seed:${operation.id}`,
        request: { to: operation.to, data: operation.data },
        isApplied: applied,
        onConfirmed: async (confirmedReceipt) => {
          const tx = await receiptRecord(confirmedReceipt, operation.label);
          operation.status = "confirmed";
          operation.tx = tx;
          deployment.transactions.seedReceipts ??= [];
          deployment.transactions.seedReceipts.push({ label: operation.label, tx });
          await writeTestnetDeployment(deployment);
          await writeJsonAtomic(seedPlanPath, plan!);
        },
      });
      if (!receipt) {
        operation.status = "observed";
        await writeJsonAtomic(seedPlanPath, plan!);
      }
      process.stdout.write(`${operation.label} ${receipt ? "confirmed" : "already applied"}${operation.tx ? ` tx=${operation.tx.hash} block=${operation.tx.blockNumber}` : ""}\n`);
    }

    const finalHouses = (await market.getHouses()).map((address: string) => getAddress(address));
    if (finalHouses.length !== houses.length) throw new Error(`Final on-chain household count ${finalHouses.length} differs from expected ${houses.length}`);
    for (let index = 0; index < houses.length; index += 1) {
      if (finalHouses[index].toLowerCase() !== houses[index].address.toLowerCase() || !sameProfile(await market.houses(finalHouses[index]), houses[index])) {
        throw new Error(`Final on-chain house map does not match sim-core at index ${index}`);
      }
      if ((await market.internalBalance(finalHouses[index])) < HOUSE_VLT_TARGET) throw new Error(`House ${index} is below its VLT seed target`);
    }
    if ((await market.internalBalance(treasury)) < TREASURY_VLT_TARGET) throw new Error("Simulated treasury is below its VLT seed target");
    const totalInternal = await market.totalInternalBalance();
    const custody = await token.balanceOf(marketAddress);
    if (totalInternal > custody) throw new Error("Market internal ledger exceeds ERC-20 custody");
    await fs.unlink(seedPlanPath).catch(() => undefined);
    process.stdout.write(`Seed verified: ${finalHouses.length} sim-core households; treasury=${treasury}; household target=1000 VLT; treasury target=2000 VLT; internal=${totalInternal}; custody=${custody}\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`MST Testnet seeding stopped safely: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
