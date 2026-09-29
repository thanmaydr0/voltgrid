"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import {
  clearRelayerSession,
  createChallenge,
  readRelayerSession,
  RelayerRequestError,
  storeRelayerSession,
  verifyChallenge,
  type StoredRelayerSession,
} from "@/lib/relayer";

export function useRelayerSession() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [session, setSession] = useState<StoredRelayerSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = readRelayerSession();
    if (address && stored?.address.toLowerCase() === address.toLowerCase()) {
      setSession(stored);
    } else {
      setSession(null);
    }
    if (address && stored && stored.address.toLowerCase() !== address.toLowerCase()) {
      clearRelayerSession();
    }
  }, [address]);

  const authenticate = useCallback(async (force = false): Promise<string> => {
    if (!address) throw new Error("Connect a wallet before starting a real day.");
    if (force) {
      clearRelayerSession();
      setSession(null);
    }
    const stored = force ? null : readRelayerSession();
    if (stored?.address.toLowerCase() === address.toLowerCase()) {
      setSession(stored);
      return stored.accessToken;
    }
    if (stored) clearRelayerSession();
    setError(null);
    setIsAuthenticating(true);
    try {
      const challenge = await createChallenge(address);
      const signature = await signMessageAsync({ message: challenge.message });
      const verified = await verifyChallenge(address, challenge.message, signature);
      const renewed = { ...verified, address };
      storeRelayerSession(renewed);
      setSession(renewed);
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

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
    const token = await authenticate();
    try {
      return await operation(token);
    } catch (cause) {
      if (!(cause instanceof RelayerRequestError) || cause.status !== 401) throw cause;
      // Relayer sessions are in memory; a service restart invalidates the browser's stored token.
      const renewedToken = await authenticate(true);
      return operation(renewedToken);
    }
  }, [authenticate]);

  const logout = useCallback(() => {
    clearRelayerSession();
    setSession(null);
  }, []);

  return { address, session, isAuthenticating, error, authenticate, withSession, logout };
}
