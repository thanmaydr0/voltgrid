"use client";

import { useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { NetworkWarning } from "@/components/NetworkWarning";
import { StatusBadge } from "@/components/StatusBadge";
import { useProviderDiscovery } from "@/hooks/useProviderDiscovery";
import { mstTestnet } from "@/lib/chains";
import { contractAddresses, hasContractAddresses } from "@/lib/addresses";
import { VOLT_GRID_MARKET_ABI, VOLT_TOKEN_ABI } from "voltgrid-shared";

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "The wallet action was not completed.";
  return /user rejected|user denied|rejected the request/i.test(message)
    ? "The wallet signature was declined. No transaction was submitted."
    : message.length > 180 ? "The wallet or RPC did not complete this action." : message;
}

function ExplorerLink({ hash }: { hash?: `0x${string}` }) {
  if (!hash) return null;
  return <a className="wallet-tx" href={`${mstTestnet.blockExplorers.default.url}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction {hash.slice(0, 10)}…</a>;
}

export function WalletPanel() {
  const { address, chainId, isConnected } = useAccount();
  const { providerNames, bridgeKeyDetected } = useProviderDiscovery();
  const publicClient = usePublicClient({ chainId: mstTestnet.id });
  const { writeContractAsync } = useWriteContract();
  const [amount, setAmount] = useState("10");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastHash, setLastHash] = useState<`0x${string}`>();
  const onTestnet = chainId === mstTestnet.id;
  const enabled = Boolean(isConnected && address && onTestnet && hasContractAddresses && publicClient);
  const tokenAddress = contractAddresses.token;
  const marketAddress = contractAddresses.market;

  const tokenBalance = useReadContract({
    address: tokenAddress,
    abi: VOLT_TOKEN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: mstTestnet.id,
    query: { enabled },
  });
  const internalBalance = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "internalBalance",
    args: address ? [address] : undefined,
    chainId: mstTestnet.id,
    query: { enabled },
  });
  const allowance = useReadContract({
    address: tokenAddress,
    abi: VOLT_TOKEN_ABI,
    functionName: "allowance",
    args: address && marketAddress ? [address, marketAddress] : undefined,
    chainId: mstTestnet.id,
    query: { enabled },
  });
  const house = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "houses",
    args: address ? [address] : undefined,
    chainId: mstTestnet.id,
    query: { enabled },
  });
  const currentDay = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "currentDay",
    chainId: mstTestnet.id,
    query: { enabled },
  });
  const treasury = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "treasury",
    chainId: mstTestnet.id,
    query: { enabled },
  });
  const registered = Array.isArray(house.data) ? Boolean(house.data[0]) : false;
  const hasBattery = Array.isArray(house.data) ? Boolean(house.data[2]) : false;
  const batteryOptedIn = Array.isArray(house.data) ? Boolean(house.data[4]) : false;
  const dayActive = Array.isArray(currentDay.data) ? Boolean(currentDay.data[0]) : false;
  const isTreasuryWallet = Boolean(address && treasury.data && address.toLowerCase() === treasury.data.toLowerCase());
  const amountWei = useMemo(() => {
    try {
      if (!amount || Number(amount) <= 0) return undefined;
      return parseUnits(amount, 18);
    } catch {
      return undefined;
    }
  }, [amount]);

  async function runWrite(label: string, action: () => Promise<`0x${string}`>) {
    setError(null);
    setLastHash(undefined);
    setBusyLabel(label);
    try {
      const hash = await action();
      setLastHash(hash);
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      await Promise.all([tokenBalance.refetch(), internalBalance.refetch(), allowance.refetch(), house.refetch(), currentDay.refetch(), treasury.refetch()]);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyLabel(null);
    }
  }

  async function claimFaucet() {
    if (!tokenAddress) return;
    await runWrite("Waiting for faucet confirmation…", () => writeContractAsync({ address: tokenAddress, abi: VOLT_TOKEN_ABI, functionName: "faucet", chainId: mstTestnet.id }));
  }

  async function registerHouse() {
    if (!marketAddress) return;
    await runWrite("Waiting for house registration…", () => writeContractAsync({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "registerHouse", args: [true, true, 100_000], chainId: mstTestnet.id }));
  }

  async function approveAndDeposit() {
    if (!tokenAddress || !marketAddress || !amountWei) return;
    await runWrite("Waiting for approval…", async () => {
      const approvalHash = await writeContractAsync({ address: tokenAddress, abi: VOLT_TOKEN_ABI, functionName: "approve", args: [marketAddress, amountWei], chainId: mstTestnet.id });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      return writeContractAsync({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "deposit", args: [amountWei], chainId: mstTestnet.id });
    });
  }

  async function withdraw() {
    if (!marketAddress || !amountWei) return;
    await runWrite("Waiting for withdrawal…", () => writeContractAsync({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "withdraw", args: [amountWei], chainId: mstTestnet.id }));
  }

  async function setOptIn() {
    if (!marketAddress || !registered) return;
    await runWrite("Waiting for battery opt-in…", () => writeContractAsync({ address: marketAddress, abi: VOLT_GRID_MARKET_ABI, functionName: "setBatteryOptIn", args: [!batteryOptedIn], chainId: mstTestnet.id }));
  }

  const displayBalance = (value: unknown) => typeof value === "bigint" ? `${formatUnits(value, 18)} VLT` : "Unavailable";

  return (
    <section className="card wallet-card" aria-labelledby="wallet-title">
      <div className="card-heading">
        <div><p className="eyebrow">Wallet & network</p><h2 id="wallet-title">Bring your own signer</h2></div>
        <StatusBadge status={enabled ? "confirmed on-chain" : "unavailable"} />
      </div>
      <p className="card-copy">VoltGrid never creates, reveals, or stores a private key in the browser. Every write opens the connected wallet for human confirmation and waits for its receipt.</p>
      <div className="wallet-identity">
        <span className="identity-label">Connection</span>
        {isConnected && address ? <code>{address.slice(0, 10)}…{address.slice(-8)}</code> : <span>Disconnected</span>}
      </div>
      <div className="wallet-actions"><ConnectButton /><NetworkSwitcher /></div>
      <NetworkWarning />
      <div className={`network-state ${onTestnet ? "network-ready" : "network-idle"}`}>
        <span className="state-dot" aria-hidden="true" />
        {onTestnet ? "MST Testnet selected — wallet writes are available when contract addresses are configured." : "MST Testnet is required before signing any VoltGrid transaction."}
      </div>
      <p className="wallet-detail">Chain ID {mstTestnet.id} · native gas token tMSTC · explorer links appear only for actual hashes.</p>
      {!hasContractAddresses && <div className="empty-state">Wallet actions are unavailable until <code>NEXT_PUBLIC_VOLT_TOKEN_ADDRESS</code> and <code>NEXT_PUBLIC_VOLT_MARKET_ADDRESS</code> point to verified contracts.</div>}
      <div className="wallet-balances" aria-live="polite">
        <div><span>Wallet VLT</span><strong>{displayBalance(tokenBalance.data)}</strong></div>
        <div><span>Market balance</span><strong>{displayBalance(internalBalance.data)}</strong></div>
        <div><span>Allowance</span><strong>{displayBalance(allowance.data)}</strong></div>
      </div>
      <div className="wallet-amount"><label htmlFor="vlt-amount">VLT amount</label><input id="vlt-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!enabled || Boolean(busyLabel)} /></div>
      <div className="wallet-capabilities">
        <button className="button button-primary" disabled={!enabled || Boolean(busyLabel)} onClick={claimFaucet}>Claim VLT faucet</button>
        <button className="button" disabled={!enabled || registered || isTreasuryWallet || treasury.isPending || treasury.isError || Boolean(busyLabel)} onClick={registerHouse}>{registered ? "House registered" : isTreasuryWallet ? "Treasury cannot register as a house" : "Register my house"}</button>
        <button className="button" disabled={!enabled || !registered || !amountWei || Boolean(busyLabel)} onClick={approveAndDeposit}>Approve & deposit VLT</button>
        <button className="button" disabled={!enabled || !registered || !amountWei || Boolean(busyLabel)} onClick={withdraw}>Withdraw VLT</button>
        <button className="button" disabled={!enabled || !registered || !hasBattery || dayActive || Boolean(busyLabel)} onClick={setOptIn}>{!hasBattery ? "No simulated battery registered" : batteryOptedIn ? "Opt out battery" : "Opt in battery dispatch"}</button>
      </div>
      {isTreasuryWallet && <p className="wallet-detail" role="status">This wallet is the market treasury. The contract blocks the treasury account from registering as a household. Connect a different wallet to register a house.</p>}
      {enabled && treasury.isError && <p className="inline-error" role="alert">Could not verify the market treasury address. House registration is disabled until the chain read succeeds.</p>}
      {registered && hasBattery && <p className="wallet-detail" role="status">Battery dispatch consent is a wallet-signed simulated-model opt-in. {dayActive ? "The active day has snapshotted opt-in; changes unlock after it closes." : "Set or withdraw consent before starting a day."}</p>}
      {busyLabel && <p className="action-note" role="status">{busyLabel}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <ExplorerLink hash={lastHash} />
      <div className="provider-note">
        <strong>{bridgeKeyDetected ? "BridgeKey announced" : "BridgeKey route"}</strong>
        <span>{bridgeKeyDetected ? "Detected through standard EIP-6963 metadata; connect uses the generic wagmi injected connector." : providerNames.length > 0 ? `Detected providers: ${providerNames.join(", ")}. No BridgeKey-specific API is assumed.` : "BridgeKey’s public pages document custom EVM networks, not a proprietary page API. Install it or use another injected wallet; exact BridgeKey injection remains unverified here."}</span>
      </div>
    </section>
  );
}
