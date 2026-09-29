"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeEventLog, formatUnits, isAddress, parseUnits, type Address, type Hash, type Hex } from "viem";
import { useAccount, useBlockNumber, usePublicClient, useReadContract, useReadContracts, useWatchContractEvent, useWriteContract } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConnectButton } from "@/components/ConnectButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { NetworkWarning } from "@/components/NetworkWarning";
import { mstTestnet } from "@/lib/chains";
import { contractAddresses, hasContractAddresses } from "@/lib/addresses";
import { makeSimulationSnapshot } from "@/lib/simulation";
import { planAutoSend, type AutoSendPlan, type AutoSendPolicy, type AutoSendReading } from "@/lib/auto-send";
import { VOLT_GRID_MARKET_ABI, VOLT_TOKEN_ABI } from "voltgrid-shared";
import { describeWalletError, errorText, explorerTransactionUrl, reconcileReceipt, transactionIsInFlight, type WalletTransactionState } from "@/components/wallet/transaction";

type ReceiptLike = {
  readonly status?: string;
  readonly blockNumber?: bigint;
  readonly logs: readonly { readonly address: string; readonly data: `0x${string}`; readonly topics: readonly `0x${string}`[] }[];
};

type LiveTransfer = Readonly<{
  hash: Hash;
  sender: Address;
  receiver: Address;
  amountWei: bigint;
  status: "pending" | "confirmed" | "unknown" | "reverted";
  blockNumber?: bigint;
}>;

const DEFAULT_POLICY: AutoSendPolicy = {
  minimumSupplierSurplusWh: 500,
  minimumNeighbourNeedWh: 300,
  reserveWh: 200,
  maximumTransferWh: 1_000,
  priceMicroVltPerKwh: 5_000_000,
};

function transferMatches(receipt: ReceiptLike, tokenAddress: Address, sender: Address, recipient: Address, amountWei: bigint) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== tokenAddress.toLowerCase() || log.topics.length === 0) continue;
    try {
      const decoded = decodeEventLog({ abi: VOLT_TOKEN_ABI, data: log.data, topics: log.topics as unknown as [Hex, ...Hex[]], eventName: "Transfer" }) as unknown as { args: { from?: string; to?: string; value?: bigint } };
      if (decoded.args.from?.toLowerCase() === sender.toLowerCase() && decoded.args.to?.toLowerCase() === recipient.toLowerCase() && decoded.args.value === amountWei) return true;
    } catch {
      // Ignore unrelated token logs.
    }
  }
  return false;
}

function TxNotice({ tx, onReconcile }: { readonly tx?: WalletTransactionState; readonly onReconcile: () => void }) {
  if (!tx) return null;
  const label = tx.stage === "wallet" ? `${tx.label}: waiting for your wallet…` : tx.stage === "receipt" ? `${tx.label}: waiting for a successful receipt…` : tx.message ?? `${tx.label}: ${tx.stage}`;
  return <div className="rounded-lg border border-border bg-background/60 p-4" role="status" aria-live="polite"><p className="font-semibold">{label}</p>{tx.hash && <p className="mt-2 break-all text-xs text-muted-foreground">Hash: <code>{tx.hash}</code></p>}{tx.hash && <a className="mt-2 inline-block text-sm underline" href={explorerTransactionUrl(tx.hash, mstTestnet.blockExplorers.default.url)} target="_blank" rel="noreferrer">Open transaction in MSTScan</a>}{tx.hash && tx.stage === "unknown" && <Button className="mt-3" size="sm" variant="outline" onClick={onReconcile}>Reconcile this hash</Button>}{tx.technical && tx.stage !== "wallet" && <details className="mt-3 text-xs text-muted-foreground"><summary>Technical details</summary><pre className="mt-2 whitespace-pre-wrap break-words">{tx.technical}</pre></details>}</div>;
}

function numberValue(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function planForSnapshot(
  snapshot: ReturnType<typeof makeSimulationSnapshot>,
  address: Address,
  registeredAddresses: readonly Address[],
  policy: AutoSendPolicy,
): AutoSendPlan | null {
  const supplierOutput = snapshot.output.readings.find((reading) => reading.house.toLowerCase() === address.toLowerCase());
  if (!supplierOutput) return null;
  const supplierReading: AutoSendReading = { address, generationWh: supplierOutput.generationWh, consumptionWh: supplierOutput.consumptionWh };
  const modelNeighbours = snapshot.output.readings.filter((reading) => reading.house.toLowerCase() !== address.toLowerCase());
  const neighbours: AutoSendReading[] = registeredAddresses.map((gridAddress, index) => {
    const model = modelNeighbours[index % Math.max(modelNeighbours.length, 1)];
    return { address: gridAddress, generationWh: model?.generationWh ?? 0, consumptionWh: model?.consumptionWh ?? 0 };
  });
  const priceMicro = snapshot.output.previewPriceMicroVltPerKwh ?? policy.priceMicroVltPerKwh;
  return planAutoSend(supplierReading, neighbours, { ...policy, priceMicroVltPerKwh: priceMicro });
}

export function AutoSendView() {
  const { address, chainId, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: mstTestnet.id });
  const [scenario, setScenario] = useState<"sunny" | "rainy" | "heatwave">("sunny");
  const [hour, setHour] = useState(12);
  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  const [monitoring, setMonitoring] = useState(false);
  const [demoPrepared, setDemoPrepared] = useState(false);
  const [tx, setTx] = useState<WalletTransactionState>();
  const [liveTransfers, setLiveTransfers] = useState<readonly LiveTransfer[]>([]);
  const verificationRef = useRef<((receipt: ReceiptLike) => Promise<void>) | null>(null);

  const tokenAddress = contractAddresses.token;
  const marketAddress = contractAddresses.market;
  const onTestnet = chainId === mstTestnet.id;
  const configured = Boolean(hasContractAddresses && tokenAddress && marketAddress);
  const readsEnabled = Boolean(configured && isConnected && address && onTestnet);
  const busy = transactionIsInFlight(tx?.stage);

  const decimals = useReadContract({ address: tokenAddress, abi: VOLT_TOKEN_ABI, functionName: "decimals", chainId: mstTestnet.id, query: { enabled: configured } });
  const symbol = useReadContract({ address: tokenAddress, abi: VOLT_TOKEN_ABI, functionName: "symbol", chainId: mstTestnet.id, query: { enabled: configured } });
  const balance = useReadContract({ address: tokenAddress, abi: VOLT_TOKEN_ABI, functionName: "balanceOf", args: address ? [address] : undefined, chainId: mstTestnet.id, query: { enabled: readsEnabled } });
  const house = useReadContract({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "houses", args: address ? [address] : undefined, chainId: mstTestnet.id, query: { enabled: readsEnabled } });
  const gridHouses = useReadContract({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "getHouses", chainId: mstTestnet.id, query: { enabled: readsEnabled } });
  const { data: blockNumber } = useBlockNumber({ chainId: mstTestnet.id, watch: true, query: { enabled: readsEnabled } });

  const decimalsData = (decimals as unknown as { data?: unknown }).data;
  const symbolData = (symbol as unknown as { data?: unknown }).data;
  const decimalsValue = typeof decimalsData === "number" ? decimalsData : typeof decimalsData === "bigint" ? Number(decimalsData) : undefined;
  const displayedSymbol = typeof symbolData === "string" ? symbolData : "VLT";
  const balanceValue = typeof balance.data === "bigint" ? balance.data : undefined;
  const houseData = Array.isArray(house.data) ? house.data : undefined;
  const viewerHasSolar = houseData?.[1] === true;
  const viewerHasBattery = houseData?.[2] === true;
  const viewerBatteryCapacityWh = typeof houseData?.[3] === "number" ? houseData[3] : typeof houseData?.[3] === "bigint" ? Number(houseData[3]) : 0;
  const registeredAddresses = useMemo(() => Array.isArray(gridHouses.data)
    ? gridHouses.data.filter((item): item is Address => typeof item === "string" && isAddress(item) && item.toLowerCase() !== address?.toLowerCase())
    : [], [address, gridHouses.data]);
  const neighbourBalanceContracts = useMemo(() => registeredAddresses.map((neighbour) => ({ address: tokenAddress, abi: VOLT_TOKEN_ABI, functionName: "balanceOf" as const, args: [neighbour] as const })), [registeredAddresses, tokenAddress]);
  const neighbourBalances = useReadContracts({ contracts: neighbourBalanceContracts, chainId: mstTestnet.id, query: { enabled: Boolean(readsEnabled && tokenAddress && neighbourBalanceContracts.length > 0) } });
  const snapshot = useMemo(() => address && readsEnabled ? makeSimulationSnapshot(scenario, "auto-send-preview", hour, false, address, undefined, { hasSolar: viewerHasSolar, hasBattery: viewerHasBattery, batteryCapacityWh: viewerBatteryCapacityWh }) : null, [address, hour, readsEnabled, scenario, viewerBatteryCapacityWh, viewerHasBattery, viewerHasSolar]);
  const policyKey = `${policy.minimumSupplierSurplusWh}:${policy.minimumNeighbourNeedWh}:${policy.reserveWh}:${policy.maximumTransferWh}:${policy.priceMicroVltPerKwh}`;
  const plan = useMemo(() => {
    if (!snapshot || !address) return null;
    return planForSnapshot(snapshot, address, registeredAddresses, policy);
  }, [address, policy, registeredAddresses, snapshot]);
  const demoOpportunity = useMemo(() => {
    if (!address || !readsEnabled || registeredAddresses.length === 0) return null;
    const scenarios = ["sunny", "rainy", "heatwave"] as const;
    for (const demoScenario of scenarios) {
      for (let demoHour = 0; demoHour < 24; demoHour += 1) {
        const demoSnapshot = makeSimulationSnapshot(demoScenario, "hackathon-fast-demo", demoHour, false, address, undefined, { hasSolar: viewerHasSolar, hasBattery: viewerHasBattery, batteryCapacityWh: viewerBatteryCapacityWh });
        const demoPlan = planForSnapshot(demoSnapshot, address, registeredAddresses, policy);
        if (demoPlan?.selected) return { scenario: demoScenario, hour: demoHour, plan: demoPlan };
      }
    }
    return null;
  }, [address, policy, readsEnabled, registeredAddresses, viewerBatteryCapacityWh, viewerHasBattery, viewerHasSolar]);
  const selected = plan?.selected ?? null;
  const selectedAmountWei = selected && decimalsValue !== undefined ? parseUnits((selected.amountMicroVlt / 1_000_000).toFixed(6), decimalsValue) : undefined;
  const hasEnoughBalance = Boolean(selectedAmountWei && balanceValue !== undefined && balanceValue >= selectedAmountWei);
  const canSend = Boolean(readsEnabled && publicClient && tokenAddress && address && selected && selectedAmountWei && hasEnoughBalance && !busy);

  function neighbourBalanceAt(index: number) {
    const result = neighbourBalances.data?.[index];
    if (!result || typeof result !== "object" || !("result" in result) || typeof result.result !== "bigint") return undefined;
    return result.result;
  }

  async function refreshReads() {
    const results = await Promise.all([balance.refetch(), house.refetch(), gridHouses.refetch(), neighbourBalances.refetch()]);
    if (results.some((result) => result.isError)) throw new Error("Grid state refresh unavailable; keep the transaction hash and reconcile it.");
  }

  function recordLiveTransfer(transfer: LiveTransfer) {
    setLiveTransfers((current) => [transfer, ...current.filter((item) => item.hash !== transfer.hash)].slice(0, 12));
  }

  function updateLiveTransfer(hash: Hash, update: Pick<LiveTransfer, "status" | "blockNumber">) {
    setLiveTransfers((current) => current.map((item) => item.hash === hash ? { ...item, ...update } : item));
  }

  useEffect(() => {
    setLiveTransfers([]);
  }, [address]);

  useEffect(() => {
    if (blockNumber === undefined || !readsEnabled) return;
    void refreshReads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber, readsEnabled]);

  useWatchContractEvent({
    address: tokenAddress,
    abi: VOLT_TOKEN_ABI,
    eventName: "Transfer",
    chainId: mstTestnet.id,
    enabled: Boolean(readsEnabled && tokenAddress),
    onLogs: (logs) => {
      for (const log of logs) {
        const transferLog = log as unknown as { args?: { from?: string; to?: string; value?: bigint }; transactionHash?: Hash; blockNumber?: bigint };
        const sender = transferLog.args?.from;
        const receiver = transferLog.args?.to;
        if (!address || !sender || !receiver || !transferLog.args?.value || !transferLog.transactionHash) continue;
        if (sender.toLowerCase() !== address.toLowerCase() && receiver.toLowerCase() !== address.toLowerCase()) continue;
        if (!isAddress(sender) || !isAddress(receiver)) continue;
        recordLiveTransfer({ hash: transferLog.transactionHash, sender, receiver, amountWei: transferLog.args.value, status: "confirmed", blockNumber: transferLog.blockNumber });
      }
      void refreshReads();
    },
  });

  async function confirmHash(hash: Hash, label: string, verify: (receipt: ReceiptLike) => Promise<void>) {
    if (!publicClient) {
      updateLiveTransfer(hash, { status: "unknown" });
      setTx({ kind: "transfer", label, stage: "unknown", hash, message: "The receipt client is unavailable. Keep this hash and reconcile it when RPC is available.", technical: "No configured MST Testnet public client" });
      return;
    }
    setTx({ kind: "transfer", label, stage: "receipt", hash });
    const result = await reconcileReceipt(hash, () => publicClient.waitForTransactionReceipt({ hash }) as unknown as Promise<ReceiptLike>, verify);
    if (result.stage === "reverted") {
      updateLiveTransfer(hash, { status: "reverted", blockNumber: result.receipt?.blockNumber });
      const friendly = describeWalletError(new Error("Transaction receipt status was reverted"));
      setTx({ kind: "transfer", label, stage: "reverted", hash, message: friendly.message, technical: friendly.technical });
      return;
    }
    if (result.stage === "unknown") {
      updateLiveTransfer(hash, { status: "unknown", blockNumber: result.receipt?.blockNumber });
      const friendly = describeWalletError(result.error);
      setTx({ kind: "transfer", label, stage: "unknown", hash, message: friendly.message, technical: friendly.technical ?? errorText(result.error) });
      return;
    }
    try {
      updateLiveTransfer(hash, { status: "confirmed", blockNumber: result.receipt?.blockNumber });
      await refreshReads();
      setTx({ kind: "transfer", label, stage: "confirmed", hash, message: `${label}: confirmed and the supplier balance was refreshed.` });
    } catch (error) {
      const friendly = describeWalletError(error);
      setTx({ kind: "transfer", label, stage: "unknown", hash, message: friendly.message, technical: friendly.technical ?? errorText(error) });
    }
  }

  async function sendSelected() {
    if (!canSend || !address || !tokenAddress || !selected || !selectedAmountWei) return;
    const sender = address;
    const recipient = selected.recipient;
    const label = `Auto-send ${formatUnits(selectedAmountWei, decimalsValue ?? 18)} ${displayedSymbol} to neighbour`;
    const verify = async (receipt: ReceiptLike) => {
      if (!transferMatches(receipt, tokenAddress, sender, recipient, selectedAmountWei)) throw new Error("Expected VLT Transfer event was not found for the algorithm-selected neighbour and amount.");
    };
    verificationRef.current = verify;
    setTx({ kind: "transfer", label, stage: "wallet" });
    try {
      const hash = await writeContractAsync({ address: tokenAddress, abi: VOLT_TOKEN_ABI, functionName: "transfer", args: [recipient, selectedAmountWei], chainId: mstTestnet.id });
      recordLiveTransfer({ hash, sender, receiver: recipient, amountWei: selectedAmountWei, status: "pending" });
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

  function prepareHackathonDemo() {
    if (!demoOpportunity) return;
    setScenario(demoOpportunity.scenario);
    setHour(demoOpportunity.hour);
    setMonitoring(true);
    setDemoPrepared(true);
  }

  const supplier = snapshot && address ? snapshot.output.readings.find((reading) => reading.house.toLowerCase() === address.toLowerCase()) : undefined;
  const supplierSurplus = supplier ? Math.max(supplier.generationWh - supplier.consumptionWh, 0) : 0;
  const supplierDeficit = supplier ? Math.max(supplier.consumptionWh - supplier.generationWh, 0) : 0;
  const demoIsReady = Boolean(demoPrepared && demoOpportunity && demoOpportunity.scenario === scenario && demoOpportunity.hour === hour);

  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <Badge variant={readsEnabled ? "default" : "outline"}>{monitoring ? "Auto-send monitoring on" : readsEnabled ? "MST Testnet reads ready" : "Wallet setup needed"}</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Auto-send power support</h1>
        <p className="max-w-3xl text-muted-foreground">The algorithm watches modelled supplier surplus and neighbour need, selects the most needy registered house, and prepares a VLT transfer without asking you to choose a neighbour each time.</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Connection and network</CardTitle><CardDescription>Automatic selection still uses the connected wallet as the supplier and runs on MST Testnet.</CardDescription></CardHeader>
        <CardContent className="space-y-4"><div className="flex flex-wrap items-center gap-3"><ConnectButton /><NetworkSwitcher /></div><NetworkWarning /><p className="break-all text-sm text-muted-foreground">Supplier wallet: {address ?? "Not connected"}</p><p className="text-sm text-muted-foreground">Registered neighbour houses found: {registeredAddresses.length}</p></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Automatic dispatch policy</CardTitle><CardDescription>The supplier sends only its surplus above the reserve. The transfer is capped so one neighbour cannot consume the whole available surplus.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-2 text-sm"><span>Scenario</span><select className="flex h-10 rounded-md border border-input bg-background px-3 text-sm" value={scenario} onChange={(event) => setScenario(event.target.value as typeof scenario)} disabled={busy}><option value="sunny">Sunny</option><option value="rainy">Rainy</option><option value="heatwave">Heatwave</option></select></label>
            <label className="grid gap-2 text-sm"><span>Model hour: {String(hour).padStart(2, "0")}</span><input type="range" min="0" max="23" value={hour} onChange={(event) => setHour(Number(event.target.value))} disabled={busy} /></label>
            <label className="grid gap-2 text-sm"><span>Minimum supplier surplus (Wh)</span><Input inputMode="numeric" value={policy.minimumSupplierSurplusWh} onChange={(event) => setPolicy((current) => ({ ...current, minimumSupplierSurplusWh: numberValue(event.target.value, current.minimumSupplierSurplusWh) }))} disabled={busy} /></label>
            <label className="grid gap-2 text-sm"><span>Minimum neighbour need (Wh)</span><Input inputMode="numeric" value={policy.minimumNeighbourNeedWh} onChange={(event) => setPolicy((current) => ({ ...current, minimumNeighbourNeedWh: numberValue(event.target.value, current.minimumNeighbourNeedWh) }))} disabled={busy} /></label>
            <label className="grid gap-2 text-sm"><span>Supplier reserve (Wh)</span><Input inputMode="numeric" value={policy.reserveWh} onChange={(event) => setPolicy((current) => ({ ...current, reserveWh: numberValue(event.target.value, current.reserveWh) }))} disabled={busy} /></label>
            <label className="grid gap-2 text-sm"><span>Maximum per send (Wh)</span><Input inputMode="numeric" value={policy.maximumTransferWh} onChange={(event) => setPolicy((current) => ({ ...current, maximumTransferWh: numberValue(event.target.value, current.maximumTransferWh) }))} disabled={busy} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-3"><Button variant={monitoring ? "secondary" : "default"} onClick={() => setMonitoring((current) => !current)} disabled={!readsEnabled || busy}>{monitoring ? "Pause auto-send monitoring" : "Start auto-send monitoring"}</Button><span className="text-xs text-muted-foreground">Policy key: {policyKey}</span></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Hackathon fast demo</CardTitle><CardDescription>Finds an eligible simulated surplus/need moment immediately, then sends a real VLT transfer from the connected main wallet to the algorithm-selected neighbour.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {demoOpportunity ? <p className="text-sm leading-6 text-muted-foreground">Fastest eligible run found at <strong className="text-foreground">{demoOpportunity.scenario}, hour {String(demoOpportunity.hour).padStart(2, "0")}</strong>. Recipient: <code className="break-all">{demoOpportunity.plan.selected?.recipient}</code>. Amount: {(demoOpportunity.plan.selected!.amountMicroVlt / 1_000_000).toFixed(6)} {displayedSymbol}.</p> : <p className="text-sm leading-6 text-muted-foreground">No demo opportunity is available yet. Connect a registered solar supplier wallet and make sure at least one other grid house is registered.</p>}
          <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={prepareHackathonDemo} disabled={!demoOpportunity || busy}>{demoIsReady ? "Demo prepared" : "Prepare fastest demo"}</Button><Button onClick={() => void sendSelected()} disabled={!demoIsReady || !canSend}>{hasEnoughBalance ? "Run real VLT demo transfer" : "Insufficient VLT balance"}</Button></div>
          <p className="text-xs text-muted-foreground">The simulation does not wait for a 24-hour clock. The second button uses the real token contract; the wallet signature and one MST Testnet receipt are still required.</p>
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]" aria-label="Automatic dispatch decision">
        <Card><CardHeader><CardTitle>Algorithm decision</CardTitle><CardDescription>Current modelled supplier reading at hour {String(hour).padStart(2, "0")}.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-border p-4"><span className="text-xs text-muted-foreground">Generation</span><p className="mt-1 font-semibold">{supplier?.generationWh.toLocaleString("en-IN") ?? "Unavailable"} Wh</p></div><div className="rounded-md border border-border p-4"><span className="text-xs text-muted-foreground">Consumption</span><p className="mt-1 font-semibold">{supplier?.consumptionWh.toLocaleString("en-IN") ?? "Unavailable"} Wh</p></div><div className="rounded-md border border-border p-4"><span className="text-xs text-muted-foreground">Surplus / need</span><p className="mt-1 font-semibold">{supplier ? supplierSurplus > 0 ? `+${supplierSurplus.toLocaleString("en-IN")} Wh` : `-${supplierDeficit.toLocaleString("en-IN")} Wh` : "Unavailable"}</p></div></div>{!supplier && <p className="text-sm text-muted-foreground">Connect a registered supplier wallet to run the decision.</p>}{supplier && !plan?.selected && <p className="text-sm text-muted-foreground">No eligible neighbour right now. The supplier must clear the surplus threshold and at least one neighbour must clear the need threshold.</p>}{selected && <div className="rounded-md border border-primary/40 bg-primary/10 p-4"><p className="font-semibold">Selected neighbour: <code className="break-all">{selected.recipient}</code></p><p className="mt-2 text-sm text-muted-foreground">Send {selected.transferableWh.toLocaleString("en-IN")} Wh of modelled support, valued at {(selected.amountMicroVlt / 1_000_000).toFixed(6)} {displayedSymbol}.</p><Button className="mt-4" onClick={() => void sendSelected()} disabled={!canSend}>{hasEnoughBalance ? "Approve selected auto-send" : "Insufficient VLT balance"}</Button></div>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Supplier funding</CardTitle><CardDescription>Direct VLT transfers use the wallet balance. They do not use the separate market balance.</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold">{balanceValue === undefined ? "Unavailable" : `${formatUnits(balanceValue, decimalsValue ?? 18)} ${displayedSymbol}`}</p><p className="mt-2 text-sm text-muted-foreground">If the balance is unavailable, connect on MST Testnet. You may claim demo VLT on the <Link className="underline" href="/wallet">Wallet</Link> page.</p></CardContent></Card>
      </section>

      <Card><CardHeader><CardTitle>Neighbour need queue</CardTitle><CardDescription>Registered houses are scored by modelled deficit. The highest eligible need is selected first.</CardDescription></CardHeader><CardContent>{plan?.candidates.length ? <div className="overflow-x-auto"><table className="w-full min-w-[42rem] border-collapse text-left text-xs"><thead><tr className="text-muted-foreground"><th className="border-b border-border p-2">Neighbour</th><th className="border-b border-border p-2">Need</th><th className="border-b border-border p-2">Eligible send</th><th className="border-b border-border p-2">Priority</th></tr></thead><tbody>{plan.candidates.map((candidate, index) => <tr key={candidate.recipient}><td className="break-all border-b border-border p-2">{candidate.recipient}</td><td className="border-b border-border p-2">{candidate.neighbourNeedWh.toLocaleString("en-IN")} Wh</td><td className="border-b border-border p-2">{candidate.transferableWh.toLocaleString("en-IN")} Wh</td><td className="border-b border-border p-2">{index === 0 ? "selected" : "next"}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No neighbour currently meets the need threshold.</p>}<p className="mt-4 text-xs text-muted-foreground">Model source: sim-core deterministic preview. These readings do not measure physical meters or dispatch real electricity.</p></CardContent></Card>

      <Card>
        <CardHeader><CardTitle>Live neighbour VLT balances</CardTitle><CardDescription>Every registered grid neighbour’s wallet balance is read directly from the VLT token contract.</CardDescription></CardHeader>
        <CardContent>
          {registeredAddresses.length === 0 ? <p className="text-sm text-muted-foreground">No other registered grid houses are available.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[40rem] border-collapse text-left text-xs"><thead><tr className="text-muted-foreground"><th className="border-b border-border p-2">Neighbour wallet</th><th className="border-b border-border p-2">Live wallet VLT</th><th className="border-b border-border p-2">Read status</th></tr></thead><tbody>{registeredAddresses.map((neighbour, index) => { const value = neighbourBalanceAt(index); return <tr key={neighbour}><td className="break-all border-b border-border p-2">{neighbour}</td><td className="border-b border-border p-2 font-semibold">{value === undefined ? "Unavailable" : `${formatUnits(value, decimalsValue ?? 18)} ${displayedSymbol}`}</td><td className="border-b border-border p-2">{value === undefined ? "waiting / unavailable" : "live"}</td></tr>; })}</tbody></table></div>}
          <p className="mt-4 text-xs text-muted-foreground">Balances refresh on new MST Testnet blocks and immediately after observed VLT Transfer events, including auto-send transfers.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Live transfer tracker</CardTitle><CardDescription>Transfers involving the connected supplier are captured from the VLT Transfer event as soon as the chain reports them.</CardDescription></CardHeader>
        <CardContent>
          {liveTransfers.length === 0 ? <p className="text-sm text-muted-foreground">No transfer hash observed yet. Start monitoring and approve an eligible auto-send to see the sender, receiver, status, and hash here.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[58rem] border-collapse text-left text-xs"><thead><tr className="text-muted-foreground"><th className="border-b border-border p-2">Status</th><th className="border-b border-border p-2">Sender</th><th className="border-b border-border p-2">Receiver</th><th className="border-b border-border p-2">Amount</th><th className="border-b border-border p-2">Block</th><th className="border-b border-border p-2">Transaction hash</th></tr></thead><tbody>{liveTransfers.map((transfer) => <tr key={transfer.hash}><td className="border-b border-border p-2">{transfer.status}</td><td className="break-all border-b border-border p-2">{transfer.sender}</td><td className="break-all border-b border-border p-2">{transfer.receiver}</td><td className="border-b border-border p-2">{formatUnits(transfer.amountWei, decimalsValue ?? 18)} {displayedSymbol}</td><td className="border-b border-border p-2">{transfer.blockNumber?.toString() ?? "pending"}</td><td className="break-all border-b border-border p-2"><a className="underline" href={explorerTransactionUrl(transfer.hash, mstTestnet.blockExplorers.default.url)} target="_blank" rel="noreferrer">{transfer.hash}</a></td></tr>)}</tbody></table></div>}
          <p className="mt-4 text-xs text-muted-foreground">Live source: confirmed VLT Transfer events plus new-block balance refreshes. The list keeps the latest 12 relevant transfers for this connected wallet.</p>
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Wallet boundary</CardTitle><CardDescription>Automatic selection cannot silently spend tokens from a browser wallet.</CardDescription></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">This route removes manual neighbour selection and calculates the recipient and amount automatically. The selected VLT transfer still opens the connected wallet for an explicit signature. Fully unattended on-chain sending would require a separately authorized relayer or automation contract.</p></CardContent></Card>

      <TxNotice tx={tx} onReconcile={() => void reconcile()} />
    </main>
  );
}
