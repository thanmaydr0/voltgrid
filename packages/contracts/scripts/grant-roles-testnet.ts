import hre from "hardhat";
import { getAddress, Wallet } from "ethers";
import {
  assertMstTestnet,
  normalizeAddress,
  privateKeyEnv,
  readTestnetDeployment,
  receiptRecord,
  sendRecoverableTransaction,
  withTestnetAdminLock,
  writeTestnetDeployment,
} from "./lib/testnetDeployment";

async function grantIfMissing(contract: any, roleName: string, target: string, artifactKey: string, deployment: Awaited<ReturnType<typeof readTestnetDeployment>>) {
  const role: string = await contract[roleName]();
  const hadRole = await contract.hasRole(role, target);
  const previous = deployment.transactions.roleGrants?.[artifactKey];
  const data = contract.interface.encodeFunctionData("grantRole", [role, target]);
  const result = await sendRecoverableTransaction({
    provider: hre.ethers.provider,
    signer: contract.runner,
    action: `grant:${artifactKey}`,
    request: { to: contract.target, data },
    isApplied: () => contract.hasRole(role, target),
    onConfirmed: async (receipt) => {
      const confirmed = await receiptRecord(receipt, `${roleName} grant`);
      deployment.transactions.roleGrants ??= {};
      deployment.transactions.roleGrants[artifactKey] = { target, status: "confirmed", tx: confirmed };
      await writeTestnetDeployment(deployment);
    },
  });
  if (result) return deployment.transactions.roleGrants![artifactKey];
  if (previous?.status === "confirmed") return previous;
  return { target, status: hadRole ? "already-held" as const : "confirmed" as const };
}

async function main() {
  await withTestnetAdminLock(async () => {
    const deployment = await readTestnetDeployment();
    await assertMstTestnet(hre.ethers.provider);
    const deployerKey = privateKeyEnv("MST_TESTNET_DEPLOYER_PRIVATE_KEY");
    const oracleWallet = new Wallet(privateKeyEnv("ORACLE_PRIVATE_KEY"));
    const [deployer] = await hre.ethers.getSigners();
    const deployerAddress = getAddress(await deployer.getAddress());
    if (deployerAddress.toLowerCase() !== deployment.deployerAddress.toLowerCase()) throw new Error("Signer is not the recorded deployment admin");
    if (deployerAddress === getAddress(oracleWallet.address)) throw new Error("Oracle key must be distinct from the deployment admin key");
    if (process.env.ORACLE_ADDRESS && getAddress(process.env.ORACLE_ADDRESS) !== getAddress(oracleWallet.address)) throw new Error("ORACLE_ADDRESS does not match ORACLE_PRIVATE_KEY");
    if (!deployerKey) throw new Error("MST_TESTNET_DEPLOYER_PRIVATE_KEY is required");

    const market = await hre.ethers.getContractAt("VoltGridMarket", deployment.contracts.VoltGridMarket!.address, deployer);
    const token = await hre.ethers.getContractAt("VoltToken", deployment.contracts.VoltToken!.address, deployer);
    if (getAddress(await market.owner()) !== deployerAddress) throw new Error("Recorded deployer is no longer the market owner");

    deployment.transactions.roleGrants ??= {};
    const oracleAddress = normalizeAddress(oracleWallet.address, "ORACLE_PRIVATE_KEY address");
    const records = [
      [market, "ORACLE_ROLE", oracleAddress, "market.ORACLE_ROLE"],
      [market, "GRID_OPERATOR_ROLE", oracleAddress, "market.GRID_OPERATOR_ROLE"],
      [market, "REGISTRAR_ROLE", deployerAddress, "market.REGISTRAR_ROLE"],
      [market, "SEEDER_ROLE", deployerAddress, "market.SEEDER_ROLE"],
      [token, "MINTER_ROLE", deployerAddress, "token.MINTER_ROLE"],
    ] as const;

    for (const [contract, role, target, key] of records) {
      const record = await grantIfMissing(contract, role, target, key, deployment);
      deployment.transactions.roleGrants ??= {};
      if (record.status !== "confirmed" || !record.tx) deployment.transactions.roleGrants[key] = record;
      await writeTestnetDeployment(deployment);
      process.stdout.write(`${key} ${record.status} target=${target}${record.tx ? ` tx=${record.tx.hash} block=${record.tx.blockNumber}` : ""}\n`);
    }
    process.stdout.write("Role configuration is confirmed on MST Testnet. No secrets were printed.\n");
  });
}

main().catch((error) => {
  process.stderr.write(`MST Testnet role setup stopped safely: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
