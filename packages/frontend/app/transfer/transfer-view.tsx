"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeEventLog, isAddress, parseUnits, type Address, type Hash, type Hex } from "viem";
import { useAccount, useBlockNumber, usePublicClient, useReadContract, useWatchContractEvent, useWriteContract } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConnectButton } from "@/components/ConnectButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { NetworkWarning } from "@/components/NetworkWarning";
import { mstTestnet } from "@/lib/chains";
import { contractAddresses, hasContractAddresses } from "@/lib/addresses";
import { VOLT_GRID_MARKET_ABI, VOLT_TOKEN_ABI } from "voltgrid-shared";
import {
  describeWalletError,
  errorText,
  explorerTransactionUrl,
  formatVlt,
  reconcileReceipt,
  transactionIsInFlight,
  type WalletTransactionState,
} from "@/components/wallet/transaction";

type ReceiptLike = {
  readonly status?: string;
  readonly logs: readonly {
    readonly address: string;
    readonly data: `0x${string}`;
    readonly topics: readonly `0x${string}`[];
  }[];
};

function transferEventMatches(
  receipt: ReceiptLike,
  tokenAddress: Address,
  sender: Address,
  recipient: Address,
  amountWei: bigint,
) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== tokenAddress.toLowerCase() || log.topics.length === 0) continue;
    try {
      const decoded = decodeEventLog({
        abi: VOLT_TOKEN_ABI,
        data: log.data,
        topics: log.topics as unknown as [Hex, ...Hex[]],
        eventName: "Transfer",
      }) as unknown as { args: { from?: string; to?: string; value?: bigint } };
      if (
        decoded.args.from?.toLowerCase() === sender.toLowerCase() &&
        decoded.args.to?.toLowerCase() === recipient.toLowerCase() &&
        decoded.args.value === amountWei
      ) return true;
    } catch {
      // Ignore unrelated logs and only confirm the expected token transfer.
    }
  }
  return false;
}

function TransferNotice({
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
    <div className="rounded-lg border border-border bg-background/60 p-4" role="status" aria-live="polite">
      <p className="font-semibold">{label}</p>
      {tx.hash && <p className="mt-2 break-all text-xs text-muted-foreground">Hash: <code>{tx.hash}</code></p>}
      {tx.hash && <a className="mt-2 inline-block text-sm underline" href={explorerTransactionUrl(tx.hash, mstTestnet.blockExplorers.default.url)} target="_blank" rel="noreferrer">Open transaction in MSTScan</a>}
      {canReconcile && <Button className="mt-3" size="sm" variant="outline" onClick={onReconcile}>Reconcile this hash</Button>}
      {tx.technical && tx.stage !== "wallet" && <details className="mt-3 text-xs text-muted-foreground"><summary>Technical details</summary><pre className="mt-2 whitespace-pre-wrap break-words">{tx.technical}</pre></details>}
    </div>
  );
}

export function TransferView() {
  const { address, chainId, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: mstTestnet.id });
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1");
  const [tx, setTx] = useState<WalletTransactionState>();
  const verificationRef = useRef<((receipt: ReceiptLike) => Promise<void>) | null>(null);

  const tokenAddress = contractAddresses.token;
  const marketAddress = contractAddresses.market;
  const onTestnet = chainId === mstTestnet.id;
  const configured = Boolean(hasContractAddresses && tokenAddress && marketAddress);
  const readsEnabled = Boolean(configured && isConnected && address && onTestnet);
  const recipientAddress = isAddress(recipient.trim()) ? recipient.trim() as Address : undefined;
  const busy = transactionIsInFlight(tx?.stage);

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
  const senderBalance = useReadContract({
    address: tokenAddress,
    abi: VOLT_TOKEN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: mstTestnet.id,
    query: { enabled: readsEnabled },
  });
  const recipientBalance = useReadContract({
    address: tokenAddress,
    abi: VOLT_TOKEN_ABI,
    functionName: "balanceOf",
    args: recipientAddress ? [recipientAddress] : undefined,
    chainId: mstTestnet.id,
    query: { enabled: Boolean(readsEnabled && recipientAddress) },
  });
  const recipientHouse = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "houses",
    args: recipientAddress ? [recipientAddress] : undefined,
    chainId: mstTestnet.id,
    query: { enabled: Boolean(readsEnabled && recipientAddress) },
  });
  const gridHouses = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "getHouses",
    chainId: mstTestnet.id,
    query: { enabled: readsEnabled },
  });
  const { data: blockNumber } = useBlockNumber({
    chainId: mstTestnet.id,
    watch: true,
    query: { enabled: readsEnabled },
  });

  const decimalsData = (decimals as unknown as { data?: unknown }).data;
  const symbolData = (symbol as unknown as { data?: unknown }).data;
  const decimalsValue = typeof decimalsData === "number" ? decimalsData : typeof decimalsData === "bigint" ? Number(decimalsData) : undefined;
  const displayedSymbol = typeof symbolData === "string" ? symbolData : "VLT";
  const amountWei = useMemo(() => {
    if (!amount.trim() || decimalsValue === undefined) return undefined;
    try {
      const parsed = parseUnits(amount.trim(), decimalsValue);
      return parsed > BigInt(0) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }, [amount, decimalsValue]);
  const housesData = (gridHouses as unknown as { data?: unknown }).data;
  const registeredNeighbors = Array.isArray(housesData)
    ? housesData.filter((house): house is Address => typeof house === "string" && house.toLowerCase() !== address?.toLowerCase())
    : [];
  const recipientHouseData = (recipientHouse as unknown as { data?: unknown }).data;
  const recipientIsRegistered = Array.isArray(recipientHouseData) && recipientHouseData[0] === true;
  const sameAccount = Boolean(address && recipientAddress && address.toLowerCase() === recipientAddress.toLowerCase());
  const recipientReady = Boolean(recipientAddress && recipientIsRegistered && !sameAccount);
  const actionEnabled = Boolean(readsEnabled && publicClient && tokenAddress && amountWei && recipientReady && !busy);
  const amountLabel = amountWei ? formatVlt(amountWei, decimalsValue, displayedSymbol) : "Enter a positive amount";

  async function refreshBalances() {
    const results = await Promise.all([senderBalance.refetch(), recipientBalance.refetch()]);
    if (results.some((result) => result.isError)) throw new Error("Balance refresh unavailable; keep the transaction hash and reconcile it.");
  }

  useEffect(() => {
    if (blockNumber === undefined || !readsEnabled) return;
    void refreshBalances();
    // A new block is the chain-level signal that a confirmed transfer may have changed either balance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber, readsEnabled]);

  useWatchContractEvent({
    address: tokenAddress,
    abi: VOLT_TOKEN_ABI,
    eventName: "Transfer",
    chainId: mstTestnet.id,
    enabled: Boolean(readsEnabled && tokenAddress),
    onLogs: () => {
      void refreshBalances();
    },
  });

  async function confirmHash(hash: Hash, label: string, verify: (receipt: ReceiptLike) => Promise<void>) {
    if (!publicClient) {
      setTx({ kind: "transfer", label, stage: "unknown", hash, message: "The receipt client is unavailable. Keep this hash and reconcile it when RPC is available.", technical: "No configured MST Testnet public client" });
      return;
    }
    setTx({ kind: "transfer", label, stage: "receipt", hash });
    const result = await reconcileReceipt(hash, () => publicClient.waitForTransactionReceipt({ hash }) as unknown as Promise<ReceiptLike>, verify);
    if (result.stage === "reverted") {
      const friendly = describeWalletError(new Error("Transaction receipt status was reverted"));
      setTx({ kind: "transfer", label, stage: "reverted", hash, message: friendly.message, technical: friendly.technical });
      return;
    }
    if (result.stage === "unknown") {
      const friendly = describeWalletError(result.error);
      setTx({ kind: "transfer", label, stage: "unknown", hash, message: friendly.message, technical: friendly.technical ?? errorText(result.error) });
      return;
    }
    try {
      await refreshBalances();
      setTx({ kind: "transfer", label, stage: "confirmed", hash, message: `${label}: confirmed and both grid balances were refreshed.` });
    } catch (error) {
      const friendly = describeWalletError(error);
      setTx({ kind: "transfer", label, stage: "unknown", hash, message: friendly.message, technical: friendly.technical ?? errorText(error) });
    }
  }

  async function sendTransfer() {
    if (!actionEnabled || !address || !recipientAddress || !tokenAddress || !amountWei) return;
    const sender = address;
    const destination = recipientAddress;
    const label = `Send ${formatVlt(amountWei, decimalsValue, displayedSymbol)} to neighbour`;
    const verify = async (receipt: ReceiptLike) => {
      if (!transferEventMatches(receipt, tokenAddress, sender, destination, amountWei)) {
        throw new Error("Expected VLT Transfer event was not found for this sender, recipient, and amount.");
      }
    };
    verificationRef.current = verify;
    setTx({ kind: "transfer", label, stage: "wallet" });
    try {
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: VOLT_TOKEN_ABI,
        functionName: "transfer",
        args: [destination, amountWei],
        chainId: mstTestnet.id,
      });
      await confirmHash(hash, label, verify);
    } catch (error) {
      const friendly = describeWalletError(error);
      setTx({ kind: "transfer", label, stage: "error", message: friendly.message, technical: friendly.technical });
    }
  }

  async function reconcile() {
    if (!tx?.hash || tx.stage !== "unknown" || !verificationRef.current || busy) return;
    await confirmHash(tx.hash, tx.label, verificationRef.current);
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <Badge variant={readsEnabled ? "default" : "outline"}>{readsEnabled ? "MST Testnet reads ready" : "Wallet setup needed"}</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Send VLT to a neighbour</h1>
        <p className="max-w-3xl text-muted-foreground">Transfer VLT directly between registered grid houses. The sender signs the transfer, and both balances refresh from the chain when the receipt and Transfer event are confirmed.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Connection and network</CardTitle>
          <CardDescription>P2P transfers use the connected wallet and the configured VLT token on MST Testnet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><ConnectButton /><NetworkSwitcher /></div>
          <NetworkWarning />
          <p className="break-all text-sm text-muted-foreground">Sender: {address ?? "Not connected"}</p>
          <p className="text-sm text-muted-foreground">Required chain: MST Testnet ({mstTestnet.id}) · native gas: tMSTC</p>
          {!tokenAddress && <p className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">The configured VLT token address is unavailable, so no transfer signature can be opened.</p>}
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2" aria-label="Peer balances">
        <Card>
          <CardHeader><CardTitle>Sender balance</CardTitle><CardDescription>Your current on-chain VLT balance.</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{formatVlt(senderBalance.data, decimalsValue, displayedSymbol)}</p><p className="mt-2 text-xs text-muted-foreground">Updated on new MST Testnet blocks and VLT transfer events.</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Neighbour balance</CardTitle><CardDescription>The recipient’s live on-chain VLT balance.</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{recipientAddress ? formatVlt(recipientBalance.data, decimalsValue, displayedSymbol) : "Enter a wallet address"}</p><p className="mt-2 text-xs text-muted-foreground">This is read directly from the recipient address; the recipient does not need to connect here.</p></CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader><CardTitle>Transfer between grid houses</CardTitle><CardDescription>Choose a registered neighbour, enter the amount, then approve one wallet transaction. No token approval step is needed for a direct transfer.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {registeredNeighbors.length > 0 && <label className="grid max-w-2xl gap-2 text-sm font-medium" htmlFor="grid-neighbor"><span>Registered grid neighbours</span><select id="grid-neighbor" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" value={registeredNeighbors.includes(recipientAddress as Address) ? recipientAddress : ""} onChange={(event) => setRecipient(event.target.value)} disabled={busy}><option value="">Choose a neighbour</option>{registeredNeighbors.map((house) => <option key={house} value={house}>{house}</option>)}</select></label>}
          <label className="grid max-w-2xl gap-2 text-sm font-medium" htmlFor="recipient-address"><span>Recipient wallet address</span><Input id="recipient-address" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" disabled={busy} aria-describedby="recipient-help" /><span id="recipient-help" className="text-xs font-normal text-muted-foreground">The recipient must be a registered house in this VoltGrid market.</span></label>
          {recipientAddress && !sameAccount && !recipientIsRegistered && <p className="text-sm text-muted-foreground" role="status">This address is not currently registered as a grid house.</p>}
          {sameAccount && <p className="text-sm text-muted-foreground" role="alert">Choose a different wallet address. A house cannot transfer to itself.</p>}
          <div className="max-w-sm space-y-2"><label className="text-sm font-medium" htmlFor="transfer-amount">Amount ({displayedSymbol})</label><Input id="transfer-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} aria-describedby="transfer-amount-help" /><p id="transfer-amount-help" className="text-xs text-muted-foreground">Transfer amount: {amountLabel}</p></div>
          <Button onClick={() => void sendTransfer()} disabled={!actionEnabled}>Send VLT</Button>
          {!readsEnabled && <p className="text-sm text-muted-foreground">Connect a wallet on MST Testnet to send or monitor a grid transfer. See the <Link className="underline" href="/wallet">Wallet</Link> page for setup.</p>}
        </CardContent>
      </Card>

      <TransferNotice tx={tx} onReconcile={() => void reconcile()} />
    </main>
  );
}
