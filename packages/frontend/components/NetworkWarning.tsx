"use client";

import { useAccount } from "wagmi";
import { mstTestnet } from "@/lib/chains";

export function NetworkWarning() {
  const { chainId, isConnected } = useAccount();

  if (!isConnected || !chainId || chainId === mstTestnet.id) {
    return null;
  }

  return (
    <p className="network-warning" role="alert">
      Your wallet is connected to chain {chainId}, not MST Testnet ({mstTestnet.id}).
      Use “Add / switch to MST Testnet” before signing any VoltGrid transaction.
    </p>
  );
}
