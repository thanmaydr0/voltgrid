import hre from "hardhat";
import { readLocalDeployment } from "./lib/localDeployment";

const WEI_PER_MICRO_WH = 1_000_000_000n;

function amount(wh: bigint, micro: bigint): bigint {
  return wh * micro * WEI_PER_MICRO_WH;
}

async function main() {
  const deployment = readLocalDeployment();
  const [deployer] = await hre.ethers.getSigners();
  const market = await hre.ethers.getContractAt("VoltGridMarket", deployment.contracts.VoltGridMarket.address);
  const token = await hre.ethers.getContractAt("VoltToken", deployment.contracts.VoltToken.address);
  const houses = await market.getHouses();
  if (houses.length < 2) throw new Error("Seed at least two houses before smoke-tx.");
  const day = await market.currentDay();
  if (day.active) throw new Error("A day is already active; use the relayer/state machine to resume it.");

  const dayId = hre.ethers.id(`local-smoke-${Date.now()}`);
  const readings = [];
  let totalSurplus = 0n;
  let totalDeficit = 0n;
  for (const house of houses) {
    const info = await market.houses(house);
    const generation = info.hasSolar ? 100 : 0;
    const consumption = info.hasSolar ? 0 : 100;
    readings.push([house, generation, consumption]);
    if (generation > consumption) totalSurplus += BigInt(generation - consumption);
    else totalDeficit += BigInt(consumption - generation);
  }

  const beforeInternal = await market.totalInternalBalance();
  const beforeCustody = await token.balanceOf(await market.getAddress());
  const startTx = await market.startDay(dayId, hre.ethers.id("local-smoke-input"), 1);
  const startReceipt = await startTx.wait();
  if (!startReceipt || startReceipt.status !== 1) throw new Error("Day start reverted");
  const settleTx = await market.settleEpoch(dayId, 0, readings);
  const receipt = await settleTx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Settlement receipt was not successful");

  const decoded = receipt.logs
    .map((log: any) => {
      try {
        return market.interface.parseLog({ topics: log.topics, data: log.data });
      } catch {
        return null;
      }
    })
    .filter((event: any): event is NonNullable<typeof event> => event !== null);
  const epoch = decoded.find((event: any) => event.name === "EpochSettled");
  if (!epoch) throw new Error("Confirmed receipt did not contain EpochSettled");
  const matched = totalSurplus < totalDeficit ? totalSurplus : totalDeficit;
  const expectedPrice = await market.previewPrice(totalSurplus, totalDeficit);
  if (
    epoch.args.priceMicro !== expectedPrice ||
    epoch.args.matchedWh !== matched ||
    epoch.args.exportedWh !== totalSurplus - matched ||
    epoch.args.importedWh !== totalDeficit - matched
  ) {
    throw new Error("Decoded EpochSettled event did not match exact expected totals");
  }
  if (await market.totalInternalBalance() !== beforeInternal) {
    throw new Error("Internal VLT conservation check failed");
  }
  if (await token.balanceOf(await market.getAddress()) !== beforeCustody) {
    throw new Error("Market token custody check failed");
  }

  console.log(`Confirmed DayStarted tx=${startReceipt.hash} block=${startReceipt.blockNumber}`);
  console.log(`Confirmed EpochSettled tx=${receipt.hash} block=${receipt.blockNumber}`);
  console.log(`Market=${await market.getAddress()} deployer=${deployer.address}`);
  for (const event of decoded) {
    console.log(`Decoded ${event.name}: ${JSON.stringify(event.args, (_, value) => typeof value === "bigint" ? value.toString() : value)}`);
  }
  console.log(`Exact expected: matchedWh=${matched} priceMicro=${expectedPrice.toString()}`);
  console.log(`Exact VLT custody=${beforeCustody.toString()} internal=${beforeInternal.toString()}`);
  console.log(`Example 100Wh at 5,000,000 micro = ${amount(100n, 5_000_000n).toString()} wei`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
