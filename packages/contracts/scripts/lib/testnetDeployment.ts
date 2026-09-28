import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { randomBytes } from "node:crypto";
import { getAddress, keccak256, type TransactionReceipt } from "ethers";
import type { Provider, Signer, TransactionRequest } from "ethers";

export const MST_TESTNET_CHAIN_ID = 91_562_037;
export const MST_TESTNET_RPC = "https://testnetrpc.mstblockchain.com";
export const MST_TESTNET_EXPLORER = "https://testnet.mstscan.com";
export const TESTNET_DEPLOYER_KEY_NAME = "MST_TESTNET_DEPLOYER_PRIVATE_KEY";
export const TESTNET_DEPLOYMENT_PATH = path.resolve(__dirname, "../../deployments/testnet.json");
export const TESTNET_JOURNAL_PATH = path.resolve(__dirname, "../../deployments/testnet.pending.json");
export const TESTNET_TX_JOURNAL_PATH = path.resolve(__dirname, "../../deployments/testnet-tx.pending.json");
export const TESTNET_LOCK_PATH = path.resolve(__dirname, "../../deployments/testnet-admin.lock");

export type ConfirmedTx = Readonly<{
  hash: string;
  blockNumber: string;
  gasUsed: string;
}>;

export type TestnetContractRecord = Readonly<{
  address: string;
  deployTxHash: string;
  blockNumber: string;
  gasUsed: string;
  runtimeCodeHash: string;
  constructorArguments: readonly unknown[];
}>;

export type TestnetDeployment = {
  schemaVersion: 1;
  network: "mst-testnet";
  chainId: number;
  explorerBaseUrl: string;
  deployerAddress: string;
  treasuryAddress: string;
  compiler: Readonly<{ version: "0.8.20"; evmVersion: "paris"; optimizerRuns: 200; viaIR: true }>;
  contracts: Partial<Record<"VoltToken" | "VoltGridMarket" | "CarbonCertificate", TestnetContractRecord>>;
  transactions: {
    certificateBinding?: ConfirmedTx & { certificateAddress: string; observedAfterRestart?: boolean };
    roleGrants?: Record<string, { target: string; status: "confirmed" | "already-held"; tx?: ConfirmedTx }>;
    roleRevocations?: Record<string, { target: string; status: "confirmed" | "already-revoked"; tx?: ConfirmedTx }>;
    seedReceipts?: Array<{ label: string; tx: ConfirmedTx }>;
    smokeRun?: Record<string, unknown>;
  };
};

export function normalizeAddress(value: string, label: string): string {
  try {
    const normalized = getAddress(value);
    if (/^0x0{40}$/i.test(normalized)) throw new Error("zero address");
    return normalized;
  } catch {
    throw new Error(`${label} must be a nonzero EVM address`);
  }
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function privateKeyEnv(name: string): string {
  const value = requiredEnv(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} is not a valid 32-byte private key`);
  return value;
}

export async function assertMstTestnet(provider: Provider): Promise<void> {
  const configured = process.env.MST_CHAIN_ID?.trim();
  if (configured && (!/^\d+$/.test(configured) || Number(configured) !== MST_TESTNET_CHAIN_ID)) {
    throw new Error(`MST_CHAIN_ID must equal ${MST_TESTNET_CHAIN_ID}`);
  }
  let chainId: bigint;
  try {
    chainId = (await provider.getNetwork()).chainId;
  } catch {
    throw new Error("MST Testnet RPC identity probe failed; no transaction was sent");
  }
  if (chainId !== BigInt(MST_TESTNET_CHAIN_ID)) {
    throw new Error(`Refusing non-MST-Testnet RPC: eth_chainId was ${chainId.toString()}`);
  }
}

export async function receiptRecord(receipt: TransactionReceipt | null, label: string): Promise<ConfirmedTx> {
  if (!receipt) throw new Error(`${label} has no transaction receipt`);
  if (receipt.status !== 1) throw new Error(`${label} receipt status was not successful`);
  return Object.freeze({
    hash: receipt.hash,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
  });
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await fs.rename(temporary, filePath);
}

export async function readJsonIfPresent<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function readTestnetDeployment(): Promise<TestnetDeployment> {
  const deployment = await readJsonIfPresent<TestnetDeployment>(TESTNET_DEPLOYMENT_PATH);
  if (!deployment) throw new Error(`No confirmed MST Testnet deployment artifact at ${TESTNET_DEPLOYMENT_PATH}`);
  if (deployment.schemaVersion !== 1 || deployment.network !== "mst-testnet" || deployment.chainId !== MST_TESTNET_CHAIN_ID) {
    throw new Error("Testnet deployment artifact schema/network mismatch");
  }
  return deployment;
}

export async function writeTestnetDeployment(deployment: TestnetDeployment): Promise<void> {
  if (deployment.network !== "mst-testnet" || deployment.chainId !== MST_TESTNET_CHAIN_ID) {
    throw new Error("Refusing to write a non-MST-Testnet deployment artifact");
  }
  await writeJsonAtomic(TESTNET_DEPLOYMENT_PATH, deployment);
}

export async function assertRuntimeCode(provider: Provider, record: TestnetContractRecord, label: string): Promise<string> {
  const code = await provider.getCode(record.address);
  if (code === "0x") throw new Error(`${label} has no bytecode at ${record.address}`);
  const codeHash = keccak256(code);
  if (record.runtimeCodeHash && codeHash.toLowerCase() !== record.runtimeCodeHash.toLowerCase()) {
    throw new Error(`${label} bytecode hash does not match the deployment artifact`);
  }
  return codeHash;
}

export async function waitForTestnetReceipt(
  provider: Provider,
  hash: string,
  label: string,
  options: Readonly<{ timeoutMs?: number; pollIntervalMs?: number }> = {},
): Promise<TransactionReceipt> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.MST_TESTNET_RECEIPT_TIMEOUT_MS || "120000");
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) {
    throw new Error("MST_TESTNET_RECEIPT_TIMEOUT_MS must be 1000..600000");
  }
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 10000) {
    throw new Error("Receipt polling interval must be 1..10000ms");
  }

  const deadline = performance.now() + timeoutMs;
  while (true) {
    const receipt = await provider.getTransactionReceipt(hash);
    if (receipt) return receipt;

    const remainingMs = deadline - performance.now();
    if (remainingMs <= 0) {
      throw new Error(`${label} receipt is still unavailable (${hash}); its journal remains intact. Retry the same command to reconcile; do not resubmit.`);
    }
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

export async function getLegacyTestnetGasPrice(provider: Provider): Promise<bigint> {
  const gasPrice = (await provider.getFeeData()).gasPrice;
  if (gasPrice === null || gasPrice <= 0n) {
    throw new Error("MST Testnet RPC did not provide a usable legacy gas price");
  }
  return gasPrice;
}

export function canSkipAppliedAdminAction(pendingAction: string, currentAction: string, alreadyApplied: boolean): boolean {
  return alreadyApplied && pendingAction !== currentAction;
}

type PendingTransactionJournal = {
  schemaVersion: 1;
  chainId: number;
  from: string;
  action: string;
  nonce: number;
  startBlock: number;
  to: string;
  data: string;
  value: string;
  gasLimit?: string;
  hash?: string;
  state: "prepared" | "submitted" | "reverted";
};

async function findByNonce(
  provider: Provider,
  from: string,
  nonce: number,
  startBlock: number,
  to: string,
  data: string,
): Promise<string | undefined> {
  const latest = await provider.getTransactionCount(from, "latest");
  const pending = await provider.getTransactionCount(from, "pending");
  if (latest <= nonce) {
    if (pending > nonce) throw new Error(`Transaction nonce ${nonce} remains pending without a hash; refusing another send`);
    return undefined;
  }
  const tip = await provider.getBlockNumber();
  if (tip - startBlock > 500) throw new Error("Pending transaction recovery exceeded the 500-block search window");
  for (let height = startBlock; height <= tip; height += 1) {
    const block = await provider.getBlock(height, true);
    for (const tx of block?.prefetchedTransactions ?? []) {
      if (tx.from.toLowerCase() === from.toLowerCase() && tx.nonce === nonce && (tx.to || "").toLowerCase() === to.toLowerCase() && tx.data.toLowerCase() === data.toLowerCase()) return tx.hash;
    }
  }
  throw new Error(`Account nonce ${nonce} was consumed but the transaction could not be matched; refusing to continue`);
}

export async function sendRecoverableTransaction(options: {
  provider: Provider;
  signer: Signer;
  action: string;
  request: TransactionRequest;
  isApplied: () => Promise<boolean>;
  onConfirmed: (receipt: TransactionReceipt) => Promise<void>;
}): Promise<TransactionReceipt | undefined> {
  const { provider, signer, action, request, isApplied, onConfirmed } = options;
  const from = getAddress(await signer.getAddress());
  if (!request.to || !request.data) throw new Error(`${action} must be a contract call with a destination and calldata`);
  const to = getAddress(request.to.toString());
  const data = request.data.toString();
  const value = (request.value ?? 0n).toString();
  let pending = await readJsonIfPresent<PendingTransactionJournal>(TESTNET_TX_JOURNAL_PATH);
  const alreadyApplied = await isApplied();

  // A journal may belong to a later operation in a sequence. Skip earlier
  // operations only when their on-chain state proves they already completed.
  if (pending && canSkipAppliedAdminAction(pending.action, action, alreadyApplied)) return undefined;

  if (!pending) {
    if (alreadyApplied) return undefined;
    const latest = await provider.getTransactionCount(from, "latest");
    const nonce = await provider.getTransactionCount(from, "pending");
    if (nonce !== latest) throw new Error("Admin account has an unrelated pending transaction; reconcile it before continuing");
    pending = {
      schemaVersion: 1,
      chainId: MST_TESTNET_CHAIN_ID,
      from,
      action,
      nonce,
      startBlock: await provider.getBlockNumber(),
      to,
      data,
      value,
      state: "prepared",
    };
    await writeJsonAtomic(TESTNET_TX_JOURNAL_PATH, pending);
  } else if (
    pending.schemaVersion !== 1 || pending.chainId !== MST_TESTNET_CHAIN_ID ||
    pending.from.toLowerCase() !== from.toLowerCase() || pending.action !== action ||
    pending.to.toLowerCase() !== to.toLowerCase() || pending.data.toLowerCase() !== data.toLowerCase() || pending.value !== value
  ) {
    throw new Error(`A recoverable admin transaction is pending (${pending.action}); resume that exact operation first`);
  }

  if (pending.state === "reverted") {
    if (process.env.MST_RETRY_REVERTED_TESTNET_ACTION !== "true") throw new Error(`${action} previously reverted; inspect the cause, then set MST_RETRY_REVERTED_TESTNET_ACTION=true to retry`);
    await fs.unlink(TESTNET_TX_JOURNAL_PATH);
    return sendRecoverableTransaction(options);
  }

  if (!pending.hash) {
    const recoveredHash = await findByNonce(provider, from, pending.nonce, pending.startBlock, to, data);
    if (recoveredHash) {
      pending.hash = recoveredHash;
      pending.state = "submitted";
      await writeJsonAtomic(TESTNET_TX_JOURNAL_PATH, pending);
    } else {
      const estimate = await provider.estimateGas({ ...request, from, nonce: pending.nonce });
      if (request.maxFeePerGas !== undefined || request.maxPriorityFeePerGas !== undefined) {
        throw new Error(`${action} must not mix legacy gasPrice with EIP-1559 fee caps`);
      }
      const gasPrice = request.gasPrice ?? await getLegacyTestnetGasPrice(provider);
      const tx = await signer.sendTransaction({
        ...request,
        to,
        data,
        value: BigInt(value),
        nonce: pending.nonce,
        gasLimit: request.gasLimit ?? estimate * 125n / 100n,
        gasPrice,
      });
      pending.hash = tx.hash;
      pending.state = "submitted";
      await writeJsonAtomic(TESTNET_TX_JOURNAL_PATH, pending);
    }
  }

  const receipt = await waitForTestnetReceipt(provider, pending.hash, action);
  if (receipt.status !== 1) {
    pending.state = "reverted";
    await writeJsonAtomic(TESTNET_TX_JOURNAL_PATH, pending);
    throw new Error(`${action} reverted in block ${receipt.blockNumber}; no automatic retry was made`);
  }
  if (!(await isApplied())) throw new Error(`${action} receipt succeeded but its expected on-chain state is absent`);
  await onConfirmed(receipt);
  await fs.unlink(TESTNET_TX_JOURNAL_PATH).catch(() => undefined);
  return receipt;
}

export async function withTestnetAdminLock<T>(operation: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(TESTNET_LOCK_PATH), { recursive: true });
  let handle;
  try {
    handle = await fs.open(TESTNET_LOCK_PATH, "wx", 0o600);
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || (error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const raw = await fs.readFile(TESTNET_LOCK_PATH, "utf8").catch(() => "");
    const pid = Number(raw.trim());
    let alive = Number.isSafeInteger(pid) && pid > 0;
    if (alive) {
      try { process.kill(pid, 0); } catch { alive = false; }
    }
    if (alive) throw new Error("Another VoltGrid testnet admin script is active");
    await fs.unlink(TESTNET_LOCK_PATH).catch(() => undefined);
    handle = await fs.open(TESTNET_LOCK_PATH, "wx", 0o600);
  }
  await handle.writeFile(`${process.pid}\n`);
  await handle.close();
  try {
    return await operation();
  } finally {
    await fs.unlink(TESTNET_LOCK_PATH).catch(() => undefined);
  }
}
