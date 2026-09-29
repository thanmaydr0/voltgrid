"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { decodeEventLog, parseUnits, type Hash, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConnectButton } from "@/components/ConnectButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { NetworkWarning } from "@/components/NetworkWarning";
import { parseHouseSnapshot } from "@/components/house/registration";
import { mstTestnet } from "@/lib/chains";
import { contractAddresses, hasContractAddresses } from "@/lib/addresses";
import { VOLT_GRID_MARKET_ABI, VOLT_TOKEN_ABI } from "voltgrid-shared";
import {
  describeWalletError,
  errorText,
  explorerTransactionUrl,
  formatVlt,
  reconcileReceipt,
  type WalletTransactionKind,
  transactionIsInFlight,
  type WalletTransactionState,
} from "./transaction";

type ReceiptLike = {
  readonly status?: string;
  readonly logs: readonly { readonly address: string; readonly data: `0x${string}`; readonly topics: readonly `0x${string}`[] }[];
};

const APPROVAL_EVENT_ABI = [
  {
    type: "event",
    name: "Approval",
    anonymous: false,
    inputs: [
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "spender", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

function receiptHasEvent(
  receipt: ReceiptLike,
  abi: readonly unknown[],
  eventName: string,
  expectedAddress: string,
  predicate: (args: Record<string, unknown>) => boolean,
): boolean {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== expectedAddress.toLowerCase() || log.topics.length === 0) continue;
    try {
      const decoded = decodeEventLog({ abi: abi as never, data: log.data, topics: log.topics as unknown as [Hex, ...Hex[]] }) as unknown as {
        eventName: string;
        args: Record<string, unknown>;
      };
      if (decoded.eventName === eventName && predicate(decoded.args)) return true;
    } catch {
      // A receipt can contain unrelated logs. Only the expected contract event confirms the action.
    }
  }
  return false;
}

function addressArg(args: Record<string, unknown>, name: string): string | undefined {
  return typeof args[name] === "string" ? args[name] : undefined;
}

function bigintArg(args: Record<string, unknown>, name: string): bigint | undefined {
  return typeof args[name] === "bigint" ? args[name] : undefined;
}

function TransactionNotice({
  tx,
  onReconcile,
}: {
  readonly tx?: WalletTransactionState;
  readonly onReconcile: () => void;
}) {
  if (!tx) return null;
  const label = tx.stage === "wallet"
    ? `${tx.label}: waiting for your wallet…`
    : tx.stage === "receipt"
      ? `${tx.label}: waiting for a successful receipt…`
      : tx.message ?? `${tx.label}: ${tx.stage}`;
  const canReconcile = Boolean(tx.hash && tx.stage === "unknown");
  return (
    <div className="mt-4 rounded-lg border border-border bg-background/60 p-4" role="status" aria-live="polite">
      <p className="font-semibold">{label}</p>
      {tx.hash && (
        <p className="mt-2 break-all text-xs text-muted-foreground">
          Hash: <code>{tx.hash}</code>
        </p>
      )}
      {tx.hash && (
        <a className="mt-2 inline-block text-sm underline" href={explorerTransactionUrl(tx.hash, mstTestnet.blockExplorers.default.url)} target="_blank" rel="noreferrer">
          Open real transaction in MSTScan
        </a>
      )}
      {canReconcile && (
        <Button className="mt-3" size="sm" variant="outline" onClick={onReconcile}>
          Reconcile this hash
        </Button>
      )}
      {tx.technical && tx.stage !== "wallet" && (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary>Technical details</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{tx.technical}</pre>
        </details>
      )}
    </div>
  );
}

export function WalletFeature() {
  const { address, chainId, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: mstTestnet.id });
  const [amount, setAmount] = useState("10");
  const [tx, setTx] = useState<WalletTransactionState>();
  const verificationRef = useRef<((receipt: ReceiptLike) => Promise<void>) | null>(null);

  const tokenAddress = contractAddresses.token;
  const marketAddress = contractAddresses.market;
  const onTestnet = chainId === mstTestnet.id;
  const configured = Boolean(hasContractAddresses && tokenAddress && marketAddress);
  const readsEnabled = Boolean(configured && isConnected && address && onTestnet);
  const actionEnabled = Boolean(readsEnabled && publicClient && !transactionIsInFlight(tx?.stage));

  const decimals = useReadContract({
    address: tokenAddress,
    abi: VOLT_TOKEN_ABI,
    functionName: "decimals",
    chainId: mstTestnet.id,
    query: { enabled: configured },
  });
  const symbol = useReadContract({
    address: tokenAddress,
    abi: VOLT_TOKEN_ABI,
    functionName: "symbol",
    chainId: mstTestnet.id,
    query: { enabled: configured },
  });
  const tokenBalance = useReadContract({
    address: tokenAddress,
    abi: VOLT_TOKEN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: mstTestnet.id,
    query: { enabled: readsEnabled },
  });
  const internalBalance = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "internalBalance",
    args: address ? [address] : undefined,
    chainId: mstTestnet.id,
    query: { enabled: readsEnabled },
  });
  const allowance = useReadContract({
    address: tokenAddress,
    abi: VOLT_TOKEN_ABI,
    functionName: "allowance",
    args: address && marketAddress ? [address, marketAddress] : undefined,
    chainId: mstTestnet.id,
    query: { enabled: readsEnabled },
  });
  const house = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "houses",
    args: address ? [address] : undefined,
    chainId: mstTestnet.id,
    query: { enabled: readsEnabled },
  });
  const currentDay = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "currentDay",
    chainId: mstTestnet.id,
    query: { enabled: readsEnabled },
  });

  const houseSnapshot = parseHouseSnapshot(house.data);
  const dayActive = Array.isArray(currentDay.data) ? Boolean(currentDay.data[0]) : undefined;
  const decimalsData = (decimals as unknown as { data?: unknown }).data;
  const symbolData = (symbol as unknown as { data?: unknown }).data;
  const allowanceData = (allowance as unknown as { data?: unknown }).data;
  const decimalsValue = typeof decimalsData === "number" ? decimalsData : typeof decimalsData === "bigint" ? Number(decimalsData) : undefined;
  const amountWei = useMemo(() => {
    if (!amount.trim() || decimalsValue === undefined) return undefined;
    try {
      const parsed = parseUnits(amount.trim(), decimalsValue);
      return parsed > BigInt(0) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }, [amount, decimalsValue]);
  const displayedSymbol = typeof symbolData === "string" ? symbolData : "VLT";
  const allowanceValue = typeof allowanceData === "bigint" ? allowanceData : undefined;
  const busy = transactionIsInFlight(tx?.stage);

  async function refreshReads() {
    const results = await Promise.all([
      tokenBalance.refetch(),
      internalBalance.refetch(),
      allowance.refetch(),
      house.refetch(),
      currentDay.refetch(),
    ]);
    if (results.some((result) => result.isError)) throw new Error("RPC follow-up read unavailable; keep the transaction hash and reconcile it.");
  }

  async function confirmHash(hash: Hash, kind: WalletTransactionKind, label: string, verify: (receipt: ReceiptLike) => Promise<void>) {
    if (!publicClient) {
      setTx({ kind, label, stage: "unknown", hash, message: "The receipt client is unavailable. Keep this hash and reconcile it when RPC is available.", technical: "No configured MST Testnet public client" });
      return;
    }
    setTx({ kind, label, stage: "receipt", hash });
    const result = await reconcileReceipt(hash, () => publicClient.waitForTransactionReceipt({ hash }) as unknown as Promise<ReceiptLike>, verify);
    if (result.stage === "reverted") {
      const friendly = describeWalletError(new Error("Transaction receipt status was reverted"));
      setTx({ kind, label, stage: "reverted", hash, message: friendly.message, technical: friendly.technical });
      return;
    }
    if (result.stage === "unknown") {
      const friendly = describeWalletError(result.error);
      setTx({ kind, label, stage: "unknown", hash, message: friendly.message, technical: friendly.technical ?? errorText(result.error) });
      return;
    }
    try {
      await refreshReads();
      setTx({ kind, label, stage: "confirmed", hash, message: `${label}: successful receipt verified and resulting state re-read.` });
    } catch (error) {
      const friendly = describeWalletError(error);
      setTx({ kind, label, stage: "unknown", hash, message: friendly.message, technical: friendly.technical ?? errorText(error) });
    }
  }

  async function runTransaction(
    kind: WalletTransactionKind,
    label: string,
    send: () => Promise<Hash>,
    verify: (receipt: ReceiptLike) => Promise<void>,
  ) {
    if (!actionEnabled || !address) return;
    verificationRef.current = verify;
    setTx({ kind, label, stage: "wallet" });
    try {
      const hash = await send();
      await confirmHash(hash, kind, label, verify);
    } catch (error) {
      const friendly = describeWalletError(error);
      setTx({ kind, label, stage: "error", message: friendly.message, technical: friendly.technical });
    }
  }

  async function reconcile() {
    if (!tx?.hash || tx.stage !== "unknown" || !verificationRef.current || busy) return;
    await confirmHash(tx.hash, tx.kind, tx.label, verificationRef.current);
  }

  const requireAddresses = Boolean(tokenAddress && marketAddress);
  const amountLabel = amountWei ? formatVlt(amountWei, decimalsValue, displayedSymbol) : "Enter a positive amount";

  async function claimFaucet() {
    if (!tokenAddress || !address) return;
    await runTransaction("faucet", "VLT faucet", () => writeContractAsync({ address: tokenAddress, abi: VOLT_TOKEN_ABI, functionName: "faucet", chainId: mstTestnet.id }), async (receipt) => {
      const found = receiptHasEvent(receipt, VOLT_TOKEN_ABI, "FaucetClaimed", tokenAddress, (args) => addressArg(args, "account")?.toLowerCase() === address.toLowerCase());
      if (!found) throw new Error("Expected FaucetClaimed event from the configured token was not found.");
      const refreshed = await tokenBalance.refetch();
      if (refreshed.isError || typeof refreshed.data !== "bigint") throw new Error("Faucet receipt succeeded, but token balance could not be re-read.");
    });
  }

  async function approve() {
    if (!tokenAddress || !marketAddress || !amountWei) return;
    await runTransaction("approve", "VLT approval", () => writeContractAsync({ address: tokenAddress, abi: VOLT_TOKEN_ABI, functionName: "approve", args: [marketAddress, amountWei], chainId: mstTestnet.id }), async (receipt) => {
      const found = receiptHasEvent(receipt, APPROVAL_EVENT_ABI, "Approval", tokenAddress, (args) => addressArg(args, "owner")?.toLowerCase() === address?.toLowerCase() && addressArg(args, "spender")?.toLowerCase() === marketAddress.toLowerCase() && bigintArg(args, "value") === amountWei);
      if (!found) throw new Error("Expected ERC-20 Approval event from the configured token was not found or did not match the market and amount.");
      const refreshed = await allowance.refetch();
      if (receipt.status !== "success" || refreshed.isError || typeof refreshed.data !== "bigint" || refreshed.data < amountWei) {
        throw new Error("Approval receipt succeeded, but the market allowance did not re-read at the requested amount.");
      }
    });
  }

  async function deposit() {
    if (!marketAddress || !tokenAddress || !address || !amountWei) return;
    await runTransaction("deposit", "Market deposit", () => writeContractAsync({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "deposit", args: [amountWei], chainId: mstTestnet.id }), async (receipt) => {
      const found = receiptHasEvent(receipt, VOLT_GRID_MARKET_ABI, "Deposited", marketAddress, (args) => addressArg(args, "payer")?.toLowerCase() === address.toLowerCase() && addressArg(args, "house")?.toLowerCase() === address.toLowerCase() && bigintArg(args, "amountWei") === amountWei);
      if (!found) throw new Error("Expected Deposited event from the configured market was not found or did not match this account and amount.");
      const refreshed = await internalBalance.refetch();
      if (refreshed.isError || typeof refreshed.data !== "bigint") throw new Error("Deposit receipt succeeded, but market balance could not be re-read.");
    });
  }

  async function withdraw() {
    if (!marketAddress || !address || !amountWei) return;
    await runTransaction("withdraw", "Market withdrawal", () => writeContractAsync({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "withdraw", args: [amountWei], chainId: mstTestnet.id }), async (receipt) => {
      const found = receiptHasEvent(receipt, VOLT_GRID_MARKET_ABI, "Withdrawn", marketAddress, (args) => addressArg(args, "house")?.toLowerCase() === address.toLowerCase() && bigintArg(args, "amountWei") === amountWei);
      if (!found) throw new Error("Expected Withdrawn event from the configured market was not found or did not match this account and amount.");
      const refreshed = await internalBalance.refetch();
      if (refreshed.isError || typeof refreshed.data !== "bigint") throw new Error("Withdrawal receipt succeeded, but market balance could not be re-read.");
    });
  }

  async function changeBatteryConsent() {
    if (!marketAddress || !address || !houseSnapshot?.exists || !houseSnapshot.hasBattery || dayActive === true) return;
    const optedIn = !houseSnapshot.batteryOptedIn;
    await runTransaction("battery-opt-in", optedIn ? "Battery dispatch consent" : "Battery dispatch opt-out", () => writeContractAsync({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "setBatteryOptIn", args: [optedIn], chainId: mstTestnet.id }), async (receipt) => {
      const found = receiptHasEvent(receipt, VOLT_GRID_MARKET_ABI, "BatteryOptInChanged", marketAddress, (args) => addressArg(args, "house")?.toLowerCase() === address.toLowerCase() && args.optedIn === optedIn);
      if (!found) throw new Error("Expected BatteryOptInChanged event from the configured market was not found or did not match this account.");
      const refreshed = await house.refetch();
      const next = parseHouseSnapshot(refreshed.data);
      if (refreshed.isError || !next || next.batteryOptedIn !== optedIn) throw new Error("Battery consent receipt succeeded, but house state could not be re-read to the requested value.");
    });
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <Badge variant={readsEnabled ? "default" : "outline"}>{readsEnabled ? "MST Testnet reads ready" : "Wallet setup needed"}</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Wallet</h1>
        <p className="max-w-3xl text-muted-foreground">Connect a wallet to inspect VLT and market balances. Every state-changing action opens that wallet for an explicit signature; this page never stores or creates private keys.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Connection and network</CardTitle>
          <CardDescription>Reads and writes are tied to the connected account and the configured MST Testnet market.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><ConnectButton /><NetworkSwitcher /></div>
          <NetworkWarning />
          <p className="break-all text-sm text-muted-foreground">Account: {address ?? "Not connected"}</p>
          <p className="text-sm text-muted-foreground">Required chain: MST Testnet ({mstTestnet.id}) · native gas: tMSTC</p>
          {!requireAddresses && <p className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">Wallet actions are unavailable until the configured token and market addresses point to verified contracts. No signature can be opened from this state.</p>}
          {requireAddresses && <p className="break-all text-xs text-muted-foreground">Token: {tokenAddress} · Market: {marketAddress}</p>}
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]" aria-label="Wallet balances and actions">
        <Card>
          <CardHeader><CardTitle>Balances and allowance</CardTitle><CardDescription>Values are read from the configured contracts. Unknown RPC reads remain unavailable.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3" aria-live="polite">
            <div className="rounded-md border border-border p-4"><span className="text-xs text-muted-foreground">Wallet {displayedSymbol}</span><p className="mt-1 break-words font-semibold">{formatVlt(tokenBalance.data, decimalsValue, displayedSymbol)}</p></div>
            <div className="rounded-md border border-border p-4"><span className="text-xs text-muted-foreground">Market balance</span><p className="mt-1 break-words font-semibold">{formatVlt(internalBalance.data, decimalsValue, displayedSymbol)}</p></div>
            <div className="rounded-md border border-border p-4"><span className="text-xs text-muted-foreground">Allowance to market</span><p className="mt-1 break-words font-semibold">{formatVlt(allowanceData, decimalsValue, displayedSymbol)}</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>VLT faucet</CardTitle><CardDescription>The contract enforces its own amount and cooldown. A claim is confirmed only after FaucetClaimed and a balance re-read.</CardDescription></CardHeader>
          <CardContent><Button onClick={() => void claimFaucet()} disabled={!actionEnabled || !tokenAddress}>Claim VLT</Button></CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader><CardTitle>Approve, then deposit or withdraw</CardTitle><CardDescription>Approval and deposit are separate wallet-signed stages. Deposit is available only for an on-chain registered house.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="max-w-sm space-y-2"><label className="text-sm font-medium" htmlFor="wallet-amount">Amount ({displayedSymbol})</label><Input id="wallet-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} aria-describedby="wallet-amount-help" /><p id="wallet-amount-help" className="text-xs text-muted-foreground">Transaction amount: {amountLabel}</p></div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void approve()} disabled={!actionEnabled || !amountWei || !tokenAddress || !marketAddress}>Approve {displayedSymbol}</Button>
            <Button variant="outline" onClick={() => void deposit()} disabled={!actionEnabled || !amountWei || !marketAddress || !houseSnapshot?.exists || allowanceValue === undefined || (amountWei !== undefined && allowanceValue < amountWei)}>Deposit to market</Button>
            <Button variant="outline" onClick={() => void withdraw()} disabled={!actionEnabled || !amountWei || !marketAddress || !houseSnapshot?.exists}>Withdraw from market</Button>
          </div>
          {!houseSnapshot?.exists && readsEnabled && <p className="text-sm text-muted-foreground">Register a house before depositing or withdrawing market balance. Registration is separate at <Link className="underline" href="/house/register">/house/register</Link>.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Battery dispatch consent</CardTitle><CardDescription>Registration never implies emergency dispatch consent. This is a separate, reversible wallet-signed action and is locked during an active day.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{houseSnapshot?.hasBattery ? houseSnapshot.batteryOptedIn ? "Current state: opted in" : "Current state: not opted in" : readsEnabled ? "Current state: no battery declared" : "Current state: unavailable"}</p>
          <Button variant="outline" onClick={() => void changeBatteryConsent()} disabled={!actionEnabled || !houseSnapshot?.exists || !houseSnapshot.hasBattery || dayActive === true}>{houseSnapshot?.batteryOptedIn ? "Withdraw battery consent" : "Opt in to battery dispatch"}</Button>
          {dayActive === true && <p className="text-sm text-muted-foreground">The current day is active; the contract locks consent changes until it closes.</p>}
          <p className="text-xs text-muted-foreground">This consent enables only the contract’s simulated emergency path. It does not measure physical battery state or dispatch a real utility.</p>
        </CardContent>
      </Card>

      <TransactionNotice tx={tx} onReconcile={() => void reconcile()} />
    </main>
  );
}
