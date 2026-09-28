"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import {
  clearRelayerSession,
  createChallenge,
  readStoredRelayerSession,
  storeRelayerSession,
  verifyChallenge,
  type StoredRelayerSession,
} from "@/lib/relayer";

export function useRelayerSession() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [session, setSession] = useState<StoredRelayerSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(readStoredRelayerSession());
  }, []);

  useEffect(() => {
    if (!isConnected) {
      setSession(null);
      clearRelayerSession();
    }
  }, [isConnected]);

  const authenticate = useCallback(async (): Promise<string> => {
    if (!address) throw new Error("Connect a wallet before starting a real day.");
    const stored = readStoredRelayerSession();
    if (stored) {
      setSession(stored);
      return stored.accessToken;
    }
    setError(null);
    setIsAuthenticating(true);
    try {
      const challenge = await createChallenge(address);
      const signature = await signMessageAsync({ message: challenge.message });
      const verified = await verifyChallenge(address, challenge.message, signature);
      storeRelayerSession(verified);
      setSession(verified);
      return verified.accessToken;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Wallet authorization was not completed.";
      const friendly = /user rejected|denied|cancel/i.test(message) ? "Wallet signature was denied; no relayer action was submitted." : message;
      setError(friendly);
      throw new Error(friendly);
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, signMessageAsync]);

  const logout = useCallback(() => {
    clearRelayerSession();
    setSession(null);
  }, []);

  return { address, session, isAuthenticating, error, authenticate, logout };
}
