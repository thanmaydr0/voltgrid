import fs from "node:fs/promises";
import hre from "hardhat";
import { ContractFactory, formatEther, getCreateAddress, Wallet } from "ethers";
import {
  assertMstTestnet,
  MST_TESTNET_CHAIN_ID,
  MST_TESTNET_EXPLORER,
  MST_TESTNET_RPC,
  TESTNET_DEPLOYMENT_PATH,
  readTestnetDeployment,
  type TestnetDeployment,
} from "./lib/testnetDeployment";

const FALLBACK_FROM = "0x0000000000000000000000000000000000000001";

async function artifact(file: string) {
  return JSON.parse(await fs.readFile(file, "utf8")) as { abi: unknown[]; bytecode: string };
}

async function main() {
  await assertMstTestnet(hre.ethers.provider);
  const network = await hre.ethers.provider.getNetwork();
  const block = await hre.ethers.provider.getBlock("latest");
  const fee = await hre.ethers.provider.getFeeData();
  if (!block || !fee.gasPrice) throw new Error("Latest block or gas price is unavailable");

  const deployerKey = process.env.MST_TESTNET_DEPLOYER_PRIVATE_KEY;
  const deployerAddress = deployerKey ? new Wallet(deployerKey).address : FALLBACK_FROM;
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployerAddress;
  const startNonce = deployerKey ? await hre.ethers.provider.getTransactionCount(deployerAddress, "pending") : 0;
  const addresses = [0, 1, 2, 3].map((offset) => getCreateAddress({ from: deployerAddress, nonce: startNonce + offset }));
  const artifactExists = await fs.stat(TESTNET_DEPLOYMENT_PATH).then(() => true).catch(() => false);
  const existingDeployment: TestnetDeployment | undefined = artifactExists ? await readTestnetDeployment() : undefined;
  const jobs: Array<{ name: string; file: string; args: unknown[] }> = existingDeployment ? [] : [
    {
      name: "VoltToken",
      file: "artifacts/contracts/VoltToken.sol/VoltToken.json",
      args: [deployerAddress],
    },
    {
      name: "VoltGridMarket",
      file: "artifacts/contracts/VoltGridMarket.sol/VoltGridMarket.json",
      args: [addresses[0], treasuryAddress],
    },
    {
      name: "CarbonCertificate",
      file: "artifacts/contracts/CarbonCertificate.sol/CarbonCertificate.json",
      args: [addresses[1]],
    },
  ];
  const unestimatedContracts: string[] = [];
  if (existingDeployment?.contracts.HouseScreeningDemoCertificateV2 || existingDeployment?.houseScreeningRuleVersion === 2) {
    // The current demo contract version is already present; preflight remains read-only.
  } else if (existingDeployment?.contracts.VoltGridMarket) {
    jobs.push({
      name: existingDeployment.contracts.HouseScreeningDemoCertificate ? "HouseScreeningDemoCertificateV2" : "HouseScreeningDemoCertificate",
      file: "artifacts/contracts/HouseScreeningDemoCertificate.sol/HouseScreeningDemoCertificate.json",
      args: [existingDeployment.contracts.VoltGridMarket.address],
    });
  } else {
    const estimateMarket = process.env.NEXT_PUBLIC_VOLT_MARKET_ADDRESS;
    const estimateMarketCode = estimateMarket ? await hre.ethers.provider.getCode(estimateMarket).catch(() => "0x") : "0x";
    if (estimateMarket && estimateMarketCode !== "0x") {
      jobs.push({
        name: "HouseScreeningDemoCertificate",
        file: "artifacts/contracts/HouseScreeningDemoCertificate.sol/HouseScreeningDemoCertificate.json",
        args: [estimateMarket],
      });
    } else {
      unestimatedContracts.push("HouseScreeningDemoCertificate (constructor gas estimate requires a market address with deployed code)");
    }
  }

  let totalGas = 0n;
  const estimates: Array<{ contract: string; gas: string; nativeAtCurrentPrice: string }> = [];
  for (const job of jobs) {
    const compiled = await artifact(job.file);
    const factory = new ContractFactory(compiled.abi as never[], compiled.bytecode, hre.ethers.provider);
    const request = await factory.getDeployTransaction(...job.args);
    const gas = await hre.ethers.provider.estimateGas({
      from: deployerAddress,
      data: request.data,
      value: request.value ?? 0n,
    });
    totalGas += gas;
    estimates.push({
      contract: job.name,
      gas: gas.toString(),
      nativeAtCurrentPrice: formatEther(gas * fee.gasPrice),
    });
  }
  const bufferedGas = totalGas * 150n / 100n;
  const report: Record<string, unknown> = {
    mode: existingDeployment?.contracts.HouseScreeningDemoCertificateV2 || existingDeployment?.houseScreeningRuleVersion === 2
      ? "read-only preflight; complete testnet artifact found; no deployment transaction planned"
      : "read-only deployment preflight; no transaction broadcast",
    rpcHost: new URL(process.env.MST_RPC_URL || MST_TESTNET_RPC).host,
    configuredChainId: Number(process.env.MST_CHAIN_ID || MST_TESTNET_CHAIN_ID),
    observedChainId: network.chainId.toString(),
    latestBlock: block.number,
    latestBlockGasLimit: block.gasLimit.toString(),
    observedGasPriceWei: fee.gasPrice.toString(),
    explorer: MST_TESTNET_EXPLORER,
    currencyLabel: "Official site/faucet use MSTC; a distinct testnet wallet ticker is not published in accessible first-party docs. Repository tMSTC label remains provisional.",
    deployerAddress: deployerKey ? deployerAddress : "not configured; estimate uses a non-funded placeholder sender",
    contracts: estimates,
    unestimatedContracts,
    totalDeploymentGas: totalGas.toString(),
    bufferedDeploymentGas50Percent: bufferedGas.toString(),
    bufferedDeploymentNativeAtCurrentPrice: formatEther(bufferedGas * fee.gasPrice),
    measuredLocalHeatwaveDayGas: "6064577",
    note: "Testnet estimate is initcode-only. An unestimated contract is excluded from the gas total. It does not include role grants, VLT seeding, or user/relayer day transactions. Do not use as the final funding threshold; rerun with funded deployer/oracle keys to include balance checks.",
  };
  if (deployerKey) {
    const balance = await hre.ethers.provider.getBalance(deployerAddress);
    report.deployerNativeBalanceWei = balance.toString();
    report.deployerCoversBufferedContractCreation = balance >= bufferedGas * fee.gasPrice;
  }
  const oracleKey = process.env.ORACLE_PRIVATE_KEY;
  if (oracleKey) {
    const oracleAddress = new Wallet(oracleKey).address;
    const balance = await hre.ethers.provider.getBalance(oracleAddress);
    report.oracleAddress = oracleAddress;
    report.oracleNativeBalanceWei = balance.toString();
    report.oracleCoversBufferedLocalHeatwaveRun = balance >= 9_096_866n * fee.gasPrice;
  } else {
    report.oracleNativeBalance = "not checked: ORACLE_PRIVATE_KEY is not configured";
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`MST Testnet preflight failed closed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
