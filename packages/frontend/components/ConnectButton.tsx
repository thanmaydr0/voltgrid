"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useProviderDiscovery } from "@/hooks/useProviderDiscovery";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { bridgeKeyDetected, hasInjectedProvider } = useProviderDiscovery();
  const [error, setError] = useState<string | null>(null);

  if (isConnected && address) {
    return (
      <div className="connect-control">
        <span className="wallet-address">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <button className="button button-quiet" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  const injectedConnector = connectors.find((connector) => connector.id === "injected");
  const availableConnector = injectedConnector ?? connectors[0];

  async function handleConnect() {
    setError(null);
    if (!availableConnector) {
      setError("No wallet connector is available. Install BridgeKey or another EIP-1193 browser wallet.");
      return;
    }

    try {
      await connect({ connector: availableConnector });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The wallet connection was not completed.");
    }
  }

  return (
    <div className="connect-control">
      <button className="button button-primary" onClick={handleConnect} disabled={isPending}>
        {isPending ? "Waiting for wallet…" : "Connect wallet"}
      </button>
      <span className="connect-hint">
        {bridgeKeyDetected
          ? "BridgeKey announced an EIP-6963 provider"
          : hasInjectedProvider
            ? "Injected EIP-1193 wallet detected"
            : "BridgeKey-specific injection not verified"}
      </span>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
