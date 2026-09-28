import hre from "hardhat";
import { getAddress, Wallet } from "ethers";
import {
  assertMstTestnet,
  privateKeyEnv,
  readTestnetDeployment,
  receiptRecord,
  sendRecoverableTransaction,
  withTestnetAdminLock,
  writeTestnetDeployment,
} from "./lib/testnetDeployment";

async function revokeIfHeld(contract: any, roleName: string, target: string, key: string, deployment: Awaited<ReturnType<typeof readTestnetDeployment>>, admin: any) {
  const role = await contract[roleName]();
  const hadRole = await contract.hasRole(role, target);
  const previous = deployment.transactions.roleRevocations?.[key];
  const data = contract.interface.encodeFunctionData("revokeRole", [role, target]);
  const receipt = await sendRecoverableTransaction({
    provider: hre.ethers.provider,
    signer: admin,
    action: `revoke:${key}`,
    request: { to: contract.target, data },
    isApplied: async () => !(await contract.hasRole(role, target)),
    onConfirmed: async (confirmedReceipt) => {
      const tx = await receiptRecord(confirmedReceipt, `${roleName} revocation`);
      deployment.transactions.roleRevocations ??= {};
      deployment.transactions.roleRevocations[key] = { target, status: "confirmed", tx };
      await writeTestnetDeployment(deployment);
    },
  });
  if (receipt) return deployment.transactions.roleRevocations![key];
  if (previous?.status === "confirmed") return previous;
  return { target, status: hadRole ? "confirmed" as const : "already-revoked" as const };
}

async function main() {
  await withTestnetAdminLock(async () => {
    const deployment = await readTestnetDeployment();
    await assertMstTestnet(hre.ethers.provider);
    privateKeyEnv("MST_TESTNET_DEPLOYER_PRIVATE_KEY");
    const oracle = new Wallet(privateKeyEnv("ORACLE_PRIVATE_KEY"));
    const [admin] = await hre.ethers.getSigners();
    const adminAddress = getAddress(await admin.getAddress());
    const oracleAddress = getAddress(oracle.address);
    if (adminAddress.toLowerCase() !== deployment.deployerAddress.toLowerCase()) throw new Error("Signer is not the recorded deployment admin");
    if (adminAddress === oracleAddress) throw new Error("Oracle signer must remain separate from the deployer/admin signer");
    if (process.env.ORACLE_ADDRESS && getAddress(process.env.ORACLE_ADDRESS) !== oracleAddress) throw new Error("ORACLE_ADDRESS does not match ORACLE_PRIVATE_KEY");

    const market = await hre.ethers.getContractAt("VoltGridMarket", deployment.contracts.VoltGridMarket!.address, admin);
    const token = await hre.ethers.getContractAt("VoltToken", deployment.contracts.VoltToken!.address, admin);
    if (!(await market.hasRole(await market.ORACLE_ROLE(), oracleAddress))) throw new Error("Oracle does not have ORACLE_ROLE; run grant-roles:testnet first");
    if (!(await market.hasRole(await market.GRID_OPERATOR_ROLE(), oracleAddress))) throw new Error("Oracle does not have GRID_OPERATOR_ROLE; emergency demonstrations would fail closed");
    if ((await market.currentDay()).active) throw new Error("Do not change roles during an active day");
    const houses = await market.getHouses();
    if (houses.length !== 8) throw new Error("Seed and verify the eight deterministic households before lockdown");
    for (const house of houses) {
      if ((await market.internalBalance(house)) < hre.ethers.parseEther("1000")) throw new Error("Seed house balances before revoking the deployer roles");
    }
    if ((await market.internalBalance(await market.treasury())) < hre.ethers.parseEther("2000")) throw new Error("Fund simulated treasury before revoking the deployer roles");

    deployment.transactions.roleRevocations ??= {};
    const changes = [
      [market, "ORACLE_ROLE", adminAddress, "market.ORACLE_ROLE.deployer"],
      [market, "GRID_OPERATOR_ROLE", adminAddress, "market.GRID_OPERATOR_ROLE.deployer"],
      [market, "REGISTRAR_ROLE", adminAddress, "market.REGISTRAR_ROLE.deployer"],
      [market, "SEEDER_ROLE", adminAddress, "market.SEEDER_ROLE.deployer"],
      [token, "MINTER_ROLE", adminAddress, "token.MINTER_ROLE.deployer"],
    ] as const;
    for (const [contract, role, target, key] of changes) {
      const record = await revokeIfHeld(contract, role, target, key, deployment, admin);
      if (record.status !== "confirmed" || !record.tx) deployment.transactions.roleRevocations[key] = record;
      await writeTestnetDeployment(deployment);
      process.stdout.write(`${key} ${record.status}${record.tx ? ` tx=${record.tx.hash} block=${record.tx.blockNumber}` : ""}\n`);
    }
    if (!(await market.hasRole(await market.DEFAULT_ADMIN_ROLE(), adminAddress))) throw new Error("Admin role unexpectedly absent after lockdown");
    if (!(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), adminAddress))) throw new Error("Token admin role unexpectedly absent after lockdown");
    process.stdout.write(`Operational roles are held by the separate server-side oracle ${oracleAddress}; deployer retains admin/ownership only.\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`MST Testnet role lockdown stopped safely: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
