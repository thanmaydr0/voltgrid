import hre from "hardhat";
import { readLocalDeployment } from "./lib/localDeployment";

const VLT = hre.ethers.parseEther;

async function waitSuccessful(txOrPromise: any, label: string) {
  const tx = await txOrPromise;
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`${label} reverted`);
  console.log(`${label}: ${receipt.hash} block=${receipt.blockNumber}`);
}

async function main() {
  const deployment = readLocalDeployment();
  const [deployer, , , ...availableHouses] = await hre.ethers.getSigners();
  const token = await hre.ethers.getContractAt("VoltToken", deployment.contracts.VoltToken.address);
  const market = await hre.ethers.getContractAt("VoltGridMarket", deployment.contracts.VoltGridMarket.address);
  const count = Number(process.env.HOUSE_COUNT || "8");
  if (count < 1 || count > 16) throw new Error("HOUSE_COUNT must be between 1 and 16");

  const configured = (process.env.HOUSE_ADDRESSES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const houses = configured.length
    ? configured
    : availableHouses.slice(0, count).map((signer) => signer.address);
  if (houses.length !== count) {
    throw new Error(`Need ${count} house addresses; received ${houses.length}. Set HOUSE_ADDRESSES for remote seeding.`);
  }

  const registered = await market.getHouses();
  const existingCount = registered.length;
  if (existingCount > houses.length) {
    throw new Error(`Deployment already has ${existingCount} houses; requested ${houses.length}.`);
  }
  for (let i = 0; i < existingCount; i += 1) {
    if (registered[i].toLowerCase() !== houses[i].toLowerCase()) {
      throw new Error(`Registered house ${i} does not match HOUSE_ADDRESSES; refusing to resequence.`);
    }
  }

  const targetBalance = VLT("1000");
  for (let i = existingCount; i < houses.length; i += 1) {
    const hasSolar = i % 2 === 0;
    const hasBattery = i % 4 === 0;
    const capacity = hasBattery ? 1000 : 0;
    await waitSuccessful(
      market.registerHouseFor(houses[i], hasSolar, hasBattery, capacity),
      `register house ${i}`
    );
  }

  for (const house of houses) {
    const current = await market.internalBalance(house);
    if (current < targetBalance) {
      const delta = targetBalance - current;
      await waitSuccessful(token.mint(deployer.address, delta), `mint ${house}`);
      await waitSuccessful(token.approve(await market.getAddress(), delta), `approve ${house}`);
      await waitSuccessful(market.depositFor(house, delta), `deposit ${house}`);
    }
  }

  const treasury = await market.treasury();
  const currentTreasury = await market.internalBalance(treasury);
  if (currentTreasury < targetBalance * 2n) {
    const delta = targetBalance * 2n - currentTreasury;
    await waitSuccessful(token.mint(deployer.address, delta), "mint treasury funding");
    await waitSuccessful(token.approve(await market.getAddress(), delta), "approve treasury funding");
    await waitSuccessful(market.fundTreasury(delta), "fund treasury");
  }

  console.log(`Seeded ${houses.length} houses; treasury=${treasury}; chain=${deployment.chainId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
