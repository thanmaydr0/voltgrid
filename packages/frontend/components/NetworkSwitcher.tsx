"use client";

import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { mstTestnet } from "@/lib/chains";

export function NetworkSwitcher() {
  const { chainId, isConnected } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  if (!isConnected || chainId === mstTestnet.id) return null;

  const switchError = error?.message ?? dismissedError;

  return (
    <div className="network-action">
      <button
        className="button button-warning"
        disabled={isPending}
        onClick={() => {
          setDismissedError(null);
          try {
            switchChain({ chainId: mstTestnet.id });
          } catch (err) {
            setDismissedError(err instanceof Error ? err.message : "Network switch failed.");
          }
        }}
      >
        {isPending ? "Waiting for wallet…" : "Add / switch to MST Testnet"}
      </button>
      {switchError && <p className="inline-error" role="alert">{switchError}</p>}
    </div>
  );
}
