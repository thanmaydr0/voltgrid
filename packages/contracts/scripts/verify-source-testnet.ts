import hre from "hardhat";
import {
  assertMstTestnet,
  readTestnetDeployment,
} from "./lib/testnetDeployment";

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown explorer verification error";
  return message
    .replace(/([?&](?:apikey|api_key|key)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/0x[0-9a-fA-F]{64}/g, "[REDACTED_HEX_32]");
}

async function main() {
  const deployment = await readTestnetDeployment();
  await assertMstTestnet(hre.ethers.provider);
  const argsByName: Record<string, unknown[]> = {
    VoltToken: [deployment.deployerAddress],
    VoltGridMarket: [deployment.contracts.VoltToken!.address, deployment.treasuryAddress],
    CarbonCertificate: [deployment.contracts.VoltGridMarket!.address],
  };
  let failures = 0;
  for (const name of ["VoltToken", "VoltGridMarket", "CarbonCertificate"] as const) {
    const record = deployment.contracts[name];
    if (!record) throw new Error(`Deployment artifact is missing ${name}`);
    try {
      await hre.run("verify:verify", { address: record.address, constructorArguments: argsByName[name] });
      process.stdout.write(`${name}: source verification accepted for ${record.address}\n`);
    } catch (error) {
      const message = safeMessage(error);
      if (/already verified|already been verified/i.test(message)) {
        process.stdout.write(`${name}: explorer reports source already verified (${message})\n`);
      } else {
        failures += 1;
        process.stderr.write(`${name}: source verification not confirmed: ${message}\n`);
      }
    }
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`MSTScan source verification did not complete: ${safeMessage(error)}\n`);
  process.exitCode = 1;
});
