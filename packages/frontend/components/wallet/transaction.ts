import { formatUnits } from "viem";

export type WalletTransactionStage =
  | "wallet"
  | "receipt"
  | "confirmed"
  | "unknown"
  | "reverted"
  | "error";

export type WalletTransactionKind = "faucet" | "approve" | "deposit" | "withdraw" | "battery-opt-in" | "transfer";

export interface WalletTransactionState {
  readonly kind: WalletTransactionKind;
  readonly label: string;
  readonly stage: WalletTransactionStage;
  readonly hash?: `0x${string}`;
  readonly message?: string;
  readonly technical?: string;
}

export function transactionIsInFlight(stage: WalletTransactionStage | undefined): boolean {
  return stage === "wallet" || stage === "receipt";
}

export async function reconcileReceipt<T extends { readonly status?: string }>(
  hash: `0x${string}`,
  waitForReceipt: () => Promise<T>,
  verify: (receipt: T) => Promise<void>,
): Promise<{ readonly stage: "confirmed" | "unknown" | "reverted"; readonly hash: `0x${string}`; readonly receipt?: T; readonly error?: unknown }> {
  try {
    const receipt = await waitForReceipt();
    if (receipt.status === "reverted") return { stage: "reverted", hash, receipt };
    if (!receiptWasSuccessful(receipt)) return { stage: "unknown", hash, receipt, error: new Error("Receipt status is unknown; it is not safe to resubmit.") };
    await verify(receipt);
    return { stage: "confirmed", hash, receipt };
  } catch (error) {
    return { stage: "unknown", hash, error };
  }
}

export type WalletErrorKind =
  | "treasury"
  | "already-registered"
  | "active-day"
  | "full-registry"
  | "invalid-capacity"
  | "wrong-chain"
  | "user-denied"
  | "reverted"
  | "rpc-unavailable"
  | "event-mismatch"
  | "unknown";

export interface FriendlyWalletError {
  readonly kind: WalletErrorKind;
  readonly message: string;
  readonly technical?: string;
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown wallet or RPC error";
  }
}

export function describeWalletError(error: unknown): FriendlyWalletError {
  const technical = errorText(error);
  const lower = technical.toLowerCase();

  if (/user rejected|user denied|rejected the request|denied transaction|action_rejected/.test(lower)) {
    return { kind: "user-denied", message: "The wallet signature was declined. No transaction was submitted.", technical };
  }
  if (/treasurycannotbehouse|treasury cannot be a house|treasury.*house/.test(lower)) {
    return { kind: "treasury", message: "The market treasury cannot be registered as a household. Connect a different wallet.", technical };
  }
  if (/housealreadyregistered|already registered|alreadyregistered/.test(lower)) {
    return { kind: "already-registered", message: "This wallet is already registered. Registration is append-only; use the existing house.", technical };
  }
  if (/registrationfrozen|active day|day is active|registration.*lock/.test(lower)) {
    return { kind: "active-day", message: "Registration and battery-consent changes are locked while a market day is active. Wait for it to close.", technical };
  }
  if (/houselimitreached|house limit|full registry|capacity reached/.test(lower)) {
    return { kind: "full-registry", message: "The house registry is full. No further household can be added to this market.", technical };
  }
  if (/invalidbatteryconfiguration|invalid capacity|battery.*capacity/.test(lower)) {
    return { kind: "invalid-capacity", message: "Battery capacity must be a positive integer Wh value no greater than 100,000 when battery is selected, or zero when it is off.", technical };
  }
  if (/wrong chain|chainid|chain id|network/.test(lower)) {
    return { kind: "wrong-chain", message: "Switch the connected wallet to MST Testnet before signing.", technical };
  }
  if (/timeout|timed out|network|rpc|transport|failed to fetch|unavailable|could not fetch/.test(lower)) {
    return { kind: "rpc-unavailable", message: "The RPC or receipt service is unavailable. Keep the hash and reconcile it before trying again.", technical };
  }
  if (/revert|execution reverted|transaction failed|status.*reverted/.test(lower)) {
    return { kind: "reverted", message: "The transaction was mined but reverted. No on-chain state change was confirmed.", technical };
  }
  if (/event mismatch|expected.*event|house.*event/.test(lower)) {
    return { kind: "event-mismatch", message: "The receipt did not contain the expected contract event for this account. State is not marked confirmed.", technical };
  }
  return { kind: "unknown", message: "The wallet action could not be confirmed. Keep any returned hash and reconcile it safely.", technical };
}

export function receiptWasSuccessful(receipt: { readonly status?: string }): boolean {
  return receipt.status === "success";
}

export function formatVlt(value: unknown, decimals: number | undefined, symbol = "VLT"): string {
  if (typeof value !== "bigint" || decimals === undefined) return "Unavailable";
  try {
    return `${formatUnits(value, decimals)} ${symbol}`;
  } catch {
    return "Unavailable";
  }
}

export function explorerTransactionUrl(hash: `0x${string}`, explorerUrl: string): string {
  return `${explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}
