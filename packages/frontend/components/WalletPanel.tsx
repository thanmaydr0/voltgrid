"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { NetworkWarning } from "@/components/NetworkWarning";
import { StatusBadge } from "@/components/StatusBadge";
import { mstTestnet } from "@/lib/chains";
import { contractAddresses, hasContractAddresses } from "@/lib/addresses";
import { VOLT_GRID_MARKET_ABI } from "voltgrid-shared";

export function WalletPanel() {
  const { address, chainId, isConnected } = useAccount();
  const marketAddress = contractAddresses.market;
  const enabled = Boolean(hasContractAddresses && marketAddress && isConnected && address && chainId === mstTestnet.id);
  const house = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "houses",
    args: address ? [address] : undefined,
    chainId: mstTestnet.id,
    query: { enabled },
  });
  const houseData = Array.isArray(house.data) ? house.data : undefined;
  const houseKnown = houseData !== undefined;
  const registered = Boolean(houseData?.[0]);

  return (
    <section className="card wallet-card" aria-labelledby="wallet-title">
      <div className="card-heading">
        <div><p className="eyebrow">Wallet & network</p><h2 id="wallet-title">Bring your own signer</h2></div>
        <StatusBadge status="unavailable" />
      </div>
      <p className="card-copy">The overview only summarizes wallet state. Open the dedicated wallet and house routes for explicit, receipt-verified actions.</p>
      <div className="wallet-identity"><span className="identity-label">Connection</span><code>{address ?? "Disconnected"}</code></div>
      <div className="wallet-actions"><ConnectButton /><NetworkSwitcher /></div>
      <NetworkWarning />
      {!hasContractAddresses && <div className="empty-state">Verified token and market addresses are not configured; chain actions stay unavailable.</div>}
      {hasContractAddresses && <div className="wallet-balances" aria-live="polite"><div><span>Network</span><strong>{chainId === mstTestnet.id ? "MST Testnet" : "Switch required"}</strong></div><div><span>House read</span><strong>{!isConnected ? "Connect wallet" : house.isLoading ? "Reading…" : house.isError || !houseKnown ? "Unavailable" : registered ? "Registered" : "Not registered"}</strong></div></div>}
      {enabled && !registered && <p className="wallet-detail">House registration is a separate declaration and review flow. Unknown RPC reads are not treated as unregistered.</p>}
      <div className="wallet-capabilities"><Link className="button button-primary" href="/wallet">Open wallet</Link><Link className="button" href={registered ? "/house" : "/house/register"}>{registered ? "View house" : "Register a house"}</Link></div>
    </section>
  );
}
