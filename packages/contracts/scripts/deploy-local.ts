import hre from "hardhat";
import {
  localDeploymentPath,
  writeLocalDeployment,
  type LocalContractDeployment,
} from "./lib/localDeployment";

async function waitForDeploymentReceipt(contract: any) {
  const deploymentTx = contract.deploymentTransaction();
  if (!deploymentTx) throw new Error("Deployment transaction was not created.");
  const receipt = await deploymentTx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Deployment receipt did not succeed.");
  return receipt;
}

async function main() {
  const [deployer, defaultTreasury] = await hre.ethers.getSigners();
  const treasuryAddress = process.env.TREASURY_ADDRESS || defaultTreasury.address;
  const oracleAddress = process.env.ORACLE_ADDRESS || deployer.address;
  const registrarAddress = process.env.REGISTRAR_ADDRESS || deployer.address;
  const seederAddress = process.env.SEEDER_ADDRESS || deployer.address;
  const gridOperatorAddress = process.env.GRID_OPERATOR_ADDRESS || deployer.address;

  const Token = await hre.ethers.getContractFactory("VoltToken");
  const token = await Token.deploy(deployer.address);
  const tokenReceipt = await waitForDeploymentReceipt(token);

  const Market = await hre.ethers.getContractFactory("VoltGridMarket");
  const market = await Market.deploy(await token.getAddress(), treasuryAddress);
  const marketReceipt = await waitForDeploymentReceipt(market);

  const Certificate = await hre.ethers.getContractFactory("CarbonCertificate");
  const certificate = await Certificate.deploy(await market.getAddress());
  const certificateReceipt = await waitForDeploymentReceipt(certificate);
  const bindingTx = await market.setCarbonCertificate(await certificate.getAddress());
  const bindingReceipt = await bindingTx.wait();
  if (!bindingReceipt || bindingReceipt.status !== 1) throw new Error("CarbonCertificate market binding failed.");

  const roles = [
    [await market.ORACLE_ROLE(), oracleAddress],
    [await market.REGISTRAR_ROLE(), registrarAddress],
    [await market.SEEDER_ROLE(), seederAddress],
    [await market.GRID_OPERATOR_ROLE(), gridOperatorAddress],
  ] as const;
  for (const [role, account] of roles) {
    if (account.toLowerCase() !== deployer.address.toLowerCase()) {
      const tx = await market.grantRole(role, account);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error(`Role grant failed for ${account}`);
    }
  }

  const network = await hre.ethers.provider.getNetwork();
  const contracts: Record<string, LocalContractDeployment> = {
    VoltToken: {
      address: await token.getAddress(),
      deployTxHash: tokenReceipt.hash,
      blockNumber: tokenReceipt.blockNumber.toString(),
      constructorArguments: [deployer.address],
    },
    VoltGridMarket: {
      address: await market.getAddress(),
      deployTxHash: marketReceipt.hash,
      blockNumber: marketReceipt.blockNumber.toString(),
      constructorArguments: [await token.getAddress(), treasuryAddress],
    },
    CarbonCertificate: {
      address: await certificate.getAddress(),
      deployTxHash: certificateReceipt.hash,
      blockNumber: certificateReceipt.blockNumber.toString(),
      constructorArguments: [await market.getAddress()],
    },
  };
  writeLocalDeployment({
    schemaVersion: 1,
    network: hre.network.name,
    chainId: network.chainId.toString(),
    contracts,
  });

  console.log(`Deployed ${hre.network.name} chain ${network.chainId}:`);
  for (const [name, deployment] of Object.entries(contracts)) {
    console.log(`${name}=${deployment.address}`);
    console.log(`${name}.deployTx=${deployment.deployTxHash} block=${deployment.blockNumber}`);
  }
  console.log(`VoltGridMarket.setCarbonCertificate tx=${bindingReceipt.hash} block=${bindingReceipt.blockNumber}`);
  console.log(`Local deployment artifact: ${localDeploymentPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
