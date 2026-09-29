"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useRelayerSession } from "@/hooks/useRelayerSession";
import { getCurrentDay, RelayerRequestError, type ApiEnvelope, type ChainAction, type EpochOutcome, type RelayerDay } from "@/lib/relayer";
import { getDay } from "@/lib/relayer";
import { useAppServices } from "@/lib/services/provider";
import { stateFromDayResponse, type PlayDayState } from "./route-models";

export type ReceiptDayStatus = "idle" | "loading" | "ready" | "session-needed" | "empty" | "error";

export type ReceiptDayResult = Readonly<{
  status: ReceiptDayStatus;
  state: PlayDayState | null;
  message: string | null;
  refresh: () => Promise<void>;
}>;

type CurrentDayResponse = {
  day: RelayerDay | null;
  outcomes: readonly EpochOutcome[];
  closeAction: ChainAction | null;
} & ApiEnvelope;

export function useReceiptDay(): ReceiptDayResult {
  const { address } = useAccount();
  const { session, logout } = useRelayerSession();
  const services = useAppServices();
  const [status, setStatus] = useState<ReceiptDayStatus>("idle");
  const [state, setState] = useState<PlayDayState | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address || !session?.accessToken) {
      setState(null);
      setStatus(address ? "session-needed" : "idle");
      setMessage(address ? "Authorize this wallet to read its relayer day." : "Connect and authorize a wallet for receipt-backed day data.");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const response = await getCurrentDay(session.accessToken) as CurrentDayResponse;
      if (response.day && response.day.ownerAddress.toLowerCase() !== address.toLowerCase()) {
        setState(null);
        setStatus("error");
        setMessage("The relayer returned a day for a different wallet; it was not attached to this view.");
        return;
      }
      let nextState = response.day ? stateFromDayResponse({ ...response, day: response.day }) : null;
      if (!nextState) {
        const saved = await services.data.listSavedDays();
        if (saved.status === "ok") {
          for (const reference of saved.data) {
            try {
              const restored = await getDay(reference.dayId, session.accessToken);
              if (restored.day.ownerAddress.toLowerCase() !== address.toLowerCase()) continue;
              nextState = stateFromDayResponse(restored);
              break;
            } catch {
              // A stale saved pointer is not allowed to hide the empty state.
            }
          }
        }
      }
      if (!nextState) {
        setState(null);
        setStatus("empty");
        setMessage("No active or saved relayer day is available for this wallet.");
        return;
      }
      setState(nextState);
      setStatus("ready");
    } catch (cause) {
      if (cause instanceof RelayerRequestError && cause.status === 401) {
        logout();
        setStatus("session-needed");
        setMessage("Wallet authorization expired. Sign a new wallet challenge to continue.");
      } else {
        setStatus("error");
        setMessage(cause instanceof Error ? cause.message : "The relayer day could not be read.");
      }
    }
  }, [address, logout, services.data, session?.accessToken]);

  useEffect(() => {
    if (session?.accessToken && address) void refresh();
    else {
      setState(null);
      setStatus(address ? "session-needed" : "idle");
      setMessage(address ? "Authorize this wallet to read its relayer day." : null);
    }
  }, [address, refresh, session?.accessToken]);

  return { status, state, message, refresh };
}
