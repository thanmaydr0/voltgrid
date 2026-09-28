"use client";

import { useEffect, useState } from "react";

type Eip6963Info = {
  name?: string;
  rdns?: string;
  uuid?: string;
};

type Eip6963Detail = {
  info?: Eip6963Info;
};

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

/**
 * Observes standard EIP-6963 announcements only. There is intentionally no
 * BridgeKey-specific global or proprietary API lookup here.
 */
export function useProviderDiscovery() {
  const [providerNames, setProviderNames] = useState<string[]>([]);
  const [hasInjectedProvider, setHasInjectedProvider] = useState(false);

  useEffect(() => {
    const announced = new Map<string, string>();
    const onProvider = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963Detail>).detail;
      const info = detail?.info;
      const identity = info?.uuid ?? info?.rdns ?? info?.name;
      if (!identity) return;
      announced.set(identity, info?.name ?? info?.rdns ?? "Injected wallet");
      setProviderNames(Array.from(announced.values()).sort());
    };

    window.addEventListener("eip6963:announceProvider", onProvider);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setHasInjectedProvider(Boolean(window.ethereum));

    return () => window.removeEventListener("eip6963:announceProvider", onProvider);
  }, []);

  return {
    providerNames,
    hasInjectedProvider,
    bridgeKeyDetected: providerNames.some((name) => /bridgekey/i.test(name)),
  };
}
