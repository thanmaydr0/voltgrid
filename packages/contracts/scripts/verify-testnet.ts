import hre from "hardhat";
import { getAddress, keccak256 } from "ethers";
import {
  assertMstTestnet,
  assertRuntimeCode,
  MST_TESTNET_EXPLORER,
  privateKeyEnv,
  readTestnetDeployment,
} from "./lib/testnetDeployment";

async function main() {
  const deployment = await readTestnetDeployment();
  await assertMstTestnet(hre.ethers.provider);
  privateKeyEnv("MST_TESTNET_DEPLOYER_PRIVATE_KEY");
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = getAddress(await deployer.getAddress());
  if (deployerAddress.toLowerCase() !== deployment.deployerAddress.toLowerCase()) throw new Error("Configured signer differs from deployment artifact admin");

  for (const name of ["VoltToken", "VoltGridMarket", "CarbonCertificate"] as const) {
    const record = deployment.contracts[name];
    if (!record) throw new Error(`Deployment artifact is missing ${name}`);
    const receipt = await hre.ethers.provider.getTransactionReceipt(record.deployTxHash);
    if (!receipt || receipt.status !== 1 || getAddress(receipt.contractAddress || "0x0000000000000000000000000000000000000000") !== getAddress(record.address) || receipt.blockNumber.toString() !== record.blockNumber) {
      throw new Error(`${name} deployment receipt does not match the artifact`);
    }
    const codeHash = await assertRuntimeCode(hre.ethers.provider, record, name);
    process.stdout.write(`${name}: receipt=success block=${record.blockNumber} address=${record.address} runtimeCodeHash=${codeHash} explorer=${MST_TESTNET_EXPLORER}/address/${record.address}\n`);
  }

  const tokenRecord = deployment.contracts.VoltToken!;
  const marketRecord = deployment.contracts.VoltGridMarket!;
  const certificateRecord = deployment.contracts.CarbonCertificate!;
  const token = await hre.ethers.getContractAt("VoltToken", tokenRecord.address);
  const market = await hre.ethers.getContractAt("VoltGridMarket", marketRecord.address);
  const certificate = await hre.ethers.getContractAt("CarbonCertificate", certificateRecord.address);
  if (await token.name() !== "VoltCredit" || await token.symbol() !== "VLT" || await token.decimals() !== 18n) throw new Error("VoltToken metadata differs from the expected ABI/state");
  if (getAddress(await market.settlementToken()) !== getAddress(tokenRecord.address)) throw new Error("Market settlement-token address mismatch");
  if (getAddress(await market.treasury()) !== getAddress(deployment.treasuryAddress)) throw new Error("Market treasury address mismatch");
  if (getAddress(await certificate.market()) !== getAddress(marketRecord.address)) throw new Error("Certificate immutable market address mismatch");
  if (getAddress(await market.carbonCertificate()) !== getAddress(certificateRecord.address)) throw new Error("Market/certificate binding mismatch");
  const marketDeployReceipt = await hre.ethers.provider.getTransactionReceipt(marketRecord.deployTxHash);
  const marketCode = await hre.ethers.provider.getCode(marketRecord.address);
  if (keccak256(marketCode).toLowerCase() !== marketRecord.runtimeCodeHash.toLowerCase()) throw new Error("Market code hash changed after the direct check");

  const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY;
  if (oraclePrivateKey) {
    const { Wallet } = await import("ethers");
    const oracle = new Wallet(oraclePrivateKey);
    for (const roleName of ["ORACLE_ROLE", "GRID_OPERATOR_ROLE"] as const) {
      const role = await market[roleName]();
      if (!(await market.hasRole(role, oracle.address))) throw new Error(`Configured oracle lacks ${roleName}`);
    }
  }
  process.stdout.write(`Constructor/state checks: PASS; chainId=${deployment.chainId}; deployer=${deployerAddress}; treasury=${deployment.treasuryAddress}; market deployment gas=${marketDeployReceipt?.gasUsed.toString()}\n`);
}

main().catch((error) => {
  process.stderr.write(`MST Testnet verification failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
