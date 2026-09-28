import hre from "hardhat";
import fs from "node:fs/promises";
import { getAddress, getCreateAddress, keccak256, Wallet } from "ethers";
import {
  assertMstTestnet,
  MST_TESTNET_CHAIN_ID,
  MST_TESTNET_EXPLORER,
  normalizeAddress,
  privateKeyEnv,
  receiptRecord,
  TESTNET_DEPLOYMENT_PATH,
  TESTNET_JOURNAL_PATH,
  withTestnetAdminLock,
  writeJsonAtomic,
  writeTestnetDeployment,
  waitForTestnetReceipt,
  type TestnetContractRecord,
  type TestnetDeployment,
} from "./lib/testnetDeployment";

type DeploymentIntent = {
  state: "prepared" | "submitted" | "confirmed" | "reverted";
  nonce: number;
  startBlock: number;
  expectedAddress: string;
  constructorArguments: unknown[];
  txHash?: string;
  blockNumber?: string;
  gasUsed?: string;
  runtimeCodeHash?: string;
};

type CallIntent = {
  state: "prepared" | "submitted" | "confirmed" | "reverted";
  nonce: number;
  startBlock: number;
  to: string;
  data: string;
  txHash?: string;
  blockNumber?: string;
  gasUsed?: string;
};

type DeploymentJournal = {
  schemaVersion: 1;
  chainId: number;
  deployerAddress: string;
  treasuryAddress: string;
  contracts: Partial<Record<"VoltToken" | "VoltGridMarket" | "CarbonCertificate", DeploymentIntent>>;
  certificateBinding?: CallIntent;
};

const CONTRACT_NAMES = ["VoltToken", "VoltGridMarket", "CarbonCertificate"] as const;

async function saveJournal(journal: DeploymentJournal): Promise<void> {
  await writeJsonAtomic(TESTNET_JOURNAL_PATH, journal);
}

async function transactionForNonce(
  provider: typeof hre.ethers.provider,
  from: string,
  nonce: number,
  startBlock: number,
  expectedTo?: string,
  expectedData?: string,
): Promise<{ hash: string; blockNumber: number } | undefined> {
  const latest = await provider.getTransactionCount(from, "latest");
  const pending = await provider.getTransactionCount(from, "pending");
  if (latest <= nonce) {
    if (pending > nonce) throw new Error(`Nonce ${nonce} is pending without a recoverable hash; refusing to submit another transaction`);
    return undefined;
  }
  const tip = await provider.getBlockNumber();
  if (tip - startBlock > 500) throw new Error("Pending deployment recovery exceeded the 500-block journal search window");
  for (let height = startBlock; height <= tip; height += 1) {
    const block = await provider.getBlock(height, true);
    for (const tx of block?.prefetchedTransactions ?? []) {
      if (tx.from.toLowerCase() !== from.toLowerCase() || tx.nonce !== nonce) continue;
      if (expectedTo !== undefined && (tx.to || "").toLowerCase() !== expectedTo.toLowerCase()) continue;
      if (expectedData !== undefined && tx.data.toLowerCase() !== expectedData.toLowerCase()) continue;
      return { hash: tx.hash, blockNumber: height };
    }
  }
  throw new Error(`Nonce ${nonce} was consumed but its transaction could not be reconciled; refusing to deploy again`);
}

async function deployContract(
  name: (typeof CONTRACT_NAMES)[number],
  factory: Awaited<ReturnType<typeof hre.ethers.getContractFactory>>,
  args: unknown[],
  journal: DeploymentJournal,
  provider: typeof hre.ethers.provider,
  deployerAddress: string,
): Promise<TestnetContractRecord> {
  let intent = journal.contracts[name];
  if (intent?.state === "reverted") {
    if (process.env.MST_RETRY_REVERTED_DEPLOY !== "true") throw new Error(`${name} deployment reverted; inspect it, then explicitly set MST_RETRY_REVERTED_DEPLOY=true to retry`);
    delete journal.contracts[name];
    intent = undefined;
    await saveJournal(journal);
  }

  if (!intent) {
    const latest = await provider.getTransactionCount(deployerAddress, "latest");
    const pending = await provider.getTransactionCount(deployerAddress, "pending");
    if (pending !== latest) throw new Error("Deployer has an unrelated pending transaction; wait for it before deployment");
    intent = {
      state: "prepared",
      nonce: pending,
      startBlock: await provider.getBlockNumber(),
      expectedAddress: getCreateAddress({ from: deployerAddress, nonce: pending }),
      constructorArguments: args,
    };
    journal.contracts[name] = intent;
    await saveJournal(journal);
  } else if (JSON.stringify(intent.constructorArguments) !== JSON.stringify(args)) {
    throw new Error(`${name} resume arguments differ from its durable deployment journal`);
  }

  if (intent.state === "prepared") {
    const found = await transactionForNonce(provider, deployerAddress, intent.nonce, intent.startBlock);
    if (found) {
      intent.txHash = found.hash;
      intent.state = "submitted";
      await saveJournal(journal);
    } else {
      const unsigned = await factory.getDeployTransaction(...args);
      const estimate = await provider.estimateGas({ from: deployerAddress, data: unsigned.data, value: unsigned.value ?? 0n });
      const gasLimit = estimate * 125n / 100n;
      const deployed = await factory.deploy(...args, { nonce: intent.nonce, gasLimit });
      const tx = deployed.deploymentTransaction();
      if (!tx) throw new Error(`${name} did not return a deployment transaction`);
      intent.txHash = tx.hash;
      intent.state = "submitted";
      await saveJournal(journal);
    }
  }

  if (!intent.txHash) throw new Error(`${name} deployment journal has no recoverable transaction hash`);
  const receipt = await waitForTestnetReceipt(provider, intent.txHash, name);
  if (receipt.status !== 1) {
    intent.state = "reverted";
    await saveJournal(journal);
    throw new Error(`${name} reverted in block ${receipt.blockNumber}; inspect it, then explicitly set MST_RETRY_REVERTED_DEPLOY=true to retry`);
  }
  if (!receipt.contractAddress || getAddress(receipt.contractAddress) !== getAddress(intent.expectedAddress)) {
    throw new Error(`${name} confirmed at an address different from its nonce-derived address`);
  }
  const code = await provider.getCode(receipt.contractAddress);
  if (code === "0x") throw new Error(`${name} receipt succeeded but no runtime bytecode is readable`);
  intent.state = "confirmed";
  intent.blockNumber = receipt.blockNumber.toString();
  intent.gasUsed = receipt.gasUsed.toString();
  intent.runtimeCodeHash = keccak256(code);
  await saveJournal(journal);
  return Object.freeze({
    address: receipt.contractAddress,
    deployTxHash: receipt.hash,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    runtimeCodeHash: keccak256(code),
    constructorArguments: Object.freeze([...args]),
  });
}

async function bindCertificate(
  market: Awaited<ReturnType<typeof hre.ethers.getContractAt>>,
  marketAddress: string,
  certificateAddress: string,
  journal: DeploymentJournal,
  provider: typeof hre.ethers.provider,
  deployerAddress: string,
) {
  const bound = getAddress(await market.carbonCertificate());
  if (bound === getAddress(certificateAddress)) {
    const intent = journal.certificateBinding;
    if (intent?.txHash) {
      const receipt = await waitForTestnetReceipt(provider, intent.txHash, "certificate binding");
      if (receipt.status !== 1) {
        intent.state = "reverted";
        await saveJournal(journal);
        throw new Error(`Certificate binding reverted in block ${receipt.blockNumber}; do not retry without inspecting the cause`);
      }
      intent.state = "confirmed";
      intent.blockNumber = receipt.blockNumber.toString();
      intent.gasUsed = receipt.gasUsed.toString();
      await saveJournal(journal);
      return { hash: receipt.hash, blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), certificateAddress };
    }
    if (intent?.state === "prepared") {
      const found = await transactionForNonce(provider, deployerAddress, intent.nonce, intent.startBlock, marketAddress, intent.data);
      if (!found) throw new Error("Market binding is already visible but its prepared transaction is not recoverable; inspect the account nonce");
      intent.txHash = found.hash;
      intent.state = "submitted";
      await saveJournal(journal);
      const receipt = await waitForTestnetReceipt(provider, found.hash, "certificate binding");
      if (receipt.status !== 1) {
        intent.state = "reverted";
        await saveJournal(journal);
        throw new Error(`Certificate binding reverted in block ${receipt.blockNumber}; do not retry without inspecting the cause`);
      }
      intent.state = "confirmed";
      intent.blockNumber = receipt.blockNumber.toString();
      intent.gasUsed = receipt.gasUsed.toString();
      await saveJournal(journal);
      return { hash: receipt.hash, blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), certificateAddress };
    }
    throw new Error("Certificate was bound before this deployment journal recorded the operation; refusing unverifiable adoption");
  }
  if (bound !== getAddress("0x0000000000000000000000000000000000000000")) {
    throw new Error(`Market is already bound to a different certificate address (${bound})`);
  }

  let intent = journal.certificateBinding;
  if (!intent) {
    const call = market.interface.encodeFunctionData("setCarbonCertificate", [certificateAddress]);
    const nonce = await provider.getTransactionCount(deployerAddress, "pending");
    const latest = await provider.getTransactionCount(deployerAddress, "latest");
    if (nonce !== latest) throw new Error("Deployer has an unrelated pending transaction before certificate binding");
    intent = { state: "prepared", nonce, startBlock: await provider.getBlockNumber(), to: marketAddress, data: call };
    journal.certificateBinding = intent;
    await saveJournal(journal);
  }
  if (intent.state === "reverted") throw new Error("Certificate binding reverted; no automatic rebroadcast is allowed");
  if (intent.state === "prepared") {
    const found = await transactionForNonce(provider, deployerAddress, intent.nonce, intent.startBlock, marketAddress, intent.data);
    if (found) {
      intent.txHash = found.hash;
      intent.state = "submitted";
      await saveJournal(journal);
    } else {
      const estimate = await provider.estimateGas({ from: deployerAddress, to: marketAddress, data: intent.data });
      const tx = await market.setCarbonCertificate(certificateAddress, { nonce: intent.nonce, gasLimit: estimate * 125n / 100n });
      intent.txHash = tx.hash;
      intent.state = "submitted";
      await saveJournal(journal);
    }
  }
  if (!intent.txHash) throw new Error("Certificate binding is pending without a transaction hash");
  const receipt = await waitForTestnetReceipt(provider, intent.txHash, "certificate binding");
  if (receipt.status !== 1) {
    intent.state = "reverted";
    await saveJournal(journal);
    throw new Error(`Certificate binding reverted in block ${receipt.blockNumber}; do not retry without inspecting the cause`);
  }
  if (getAddress(await market.carbonCertificate()) !== getAddress(certificateAddress)) throw new Error("Binding receipt confirmed but market state does not match");
  intent.state = "confirmed";
  intent.blockNumber = receipt.blockNumber.toString();
  intent.gasUsed = receipt.gasUsed.toString();
  await saveJournal(journal);
  return { hash: receipt.hash, blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), certificateAddress };
}

async function main() {
  await withTestnetAdminLock(async () => {
    // Validate names and key/address agreement before a signer or contract factory can send.
    const deployerKey = privateKeyEnv("MST_TESTNET_DEPLOYER_PRIVATE_KEY");
    const oracleWallet = new Wallet(privateKeyEnv("ORACLE_PRIVATE_KEY"));
    const [deployer] = await hre.ethers.getSigners();
    if (!deployer) throw new Error("MST_TESTNET_DEPLOYER_PRIVATE_KEY is required for the testnet network");
    const deployerAddress = getAddress(await deployer.getAddress());
    if (deployerAddress === getAddress(oracleWallet.address)) throw new Error("Use separate deployer and server-side oracle accounts");
    if (process.env.ORACLE_ADDRESS && getAddress(process.env.ORACLE_ADDRESS) !== getAddress(oracleWallet.address)) {
      throw new Error("ORACLE_ADDRESS does not match the address derived from ORACLE_PRIVATE_KEY");
    }
    if (process.env.MST_TESTNET_DEPLOYER_PRIVATE_KEY !== deployerKey) throw new Error("Deployer key configuration changed during startup");
    await assertMstTestnet(hre.ethers.provider);

    const existingArtifact = await fs.stat(TESTNET_DEPLOYMENT_PATH).then(() => true).catch(() => false);
    if (existingArtifact) {
      const artifact = JSON.parse(await fs.readFile(TESTNET_DEPLOYMENT_PATH, "utf8")) as TestnetDeployment;
      if (artifact.chainId !== MST_TESTNET_CHAIN_ID || artifact.deployerAddress.toLowerCase() !== deployerAddress.toLowerCase()) {
        throw new Error("An existing testnet artifact belongs to a different chain/deployer; refusing overwrite");
      }
      for (const name of CONTRACT_NAMES) {
        const record = artifact.contracts[name];
        if (!record) throw new Error(`Existing testnet artifact is incomplete (${name}); use the journaled resume flow, not a redeploy`);
        const code = await hre.ethers.provider.getCode(record.address);
        if (code === "0x" || keccak256(code).toLowerCase() !== record.runtimeCodeHash.toLowerCase()) {
          throw new Error(`Existing ${name} artifact does not match current on-chain bytecode`);
        }
      }
      process.stdout.write("MST Testnet deployment already exists and bytecode checks pass; no transaction sent.\n");
      return;
    }

    const treasuryAddress = normalizeAddress(process.env.TREASURY_ADDRESS || deployerAddress, "TREASURY_ADDRESS");
    const journal = (await (async () => {
      try { return JSON.parse(await fs.readFile(TESTNET_JOURNAL_PATH, "utf8")) as DeploymentJournal; }
      catch (error) {
        if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          return {
            schemaVersion: 1 as const,
            chainId: MST_TESTNET_CHAIN_ID,
            deployerAddress,
            treasuryAddress,
            contracts: {},
          } satisfies DeploymentJournal;
        }
        throw error;
      }
    })());
    if (journal.schemaVersion !== 1 || journal.chainId !== MST_TESTNET_CHAIN_ID || journal.deployerAddress.toLowerCase() !== deployerAddress.toLowerCase() || journal.treasuryAddress.toLowerCase() !== treasuryAddress.toLowerCase()) {
      throw new Error("Existing testnet deployment journal has different chain/deployer/treasury configuration");
    }

    const Token = await hre.ethers.getContractFactory("VoltToken", deployer);
    const token = await deployContract("VoltToken", Token, [deployerAddress], journal, hre.ethers.provider, deployerAddress);
    const Market = await hre.ethers.getContractFactory("VoltGridMarket", deployer);
    const market = await deployContract("VoltGridMarket", Market, [token.address, treasuryAddress], journal, hre.ethers.provider, deployerAddress);
    const Certificate = await hre.ethers.getContractFactory("CarbonCertificate", deployer);
    const certificate = await deployContract("CarbonCertificate", Certificate, [market.address], journal, hre.ethers.provider, deployerAddress);

    const marketContract = await hre.ethers.getContractAt("VoltGridMarket", market.address, deployer);
    const binding = await bindCertificate(marketContract, market.address, certificate.address, journal, hre.ethers.provider, deployerAddress);
    const deployment: TestnetDeployment = {
      schemaVersion: 1,
      network: "mst-testnet",
      chainId: MST_TESTNET_CHAIN_ID,
      explorerBaseUrl: MST_TESTNET_EXPLORER,
      deployerAddress,
      treasuryAddress,
      compiler: { version: "0.8.20", evmVersion: "paris", optimizerRuns: 200, viaIR: true },
      contracts: { VoltToken: token, VoltGridMarket: market, CarbonCertificate: certificate },
      transactions: {
        certificateBinding: {
          hash: binding.hash,
          blockNumber: binding.blockNumber,
          gasUsed: binding.gasUsed,
          certificateAddress: binding.certificateAddress,
        },
      },
    };
    await writeTestnetDeployment(deployment);
    await fs.unlink(TESTNET_JOURNAL_PATH).catch(() => undefined);
    process.stdout.write(`Confirmed MST Testnet deployment artifact: ${TESTNET_DEPLOYMENT_PATH}\n`);
    for (const name of CONTRACT_NAMES) {
      const record = deployment.contracts[name]!;
      process.stdout.write(`${name} ${record.address} tx=${record.deployTxHash} block=${record.blockNumber} gas=${record.gasUsed}\n`);
    }
    process.stdout.write(`CarbonCertificate binding tx=${binding.hash} block=${binding.blockNumber}\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`MST Testnet deployment stopped safely: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
