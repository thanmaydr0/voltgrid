"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { useRelayerSession } from "@/hooks/useRelayerSession";
import { getEvents, RelayerRequestError } from "@/lib/relayer";
import { mstTestnet } from "@/lib/chains";
import { normalizeConfirmedActivity, type ConfirmedActivity } from "@/app/domain/route-models";
import { actionStatusCopy } from "@/app/domain/route-copy";
import { useAccount } from "wagmi";

type ActivityStatus = "idle" | "loading" | "ready" | "session-needed" | "empty" | "error";

function sameActivity(left: ConfirmedActivity, right: ConfirmedActivity) {
  return left.txHash.toLowerCase() === right.txHash.toLowerCase() && left.logIndex === right.logIndex;
}

export function ActivityView() {
  const { address } = useAccount();
  const { session, logout } = useRelayerSession();
  const [status, setStatus] = useState<ActivityStatus>("idle");
  const [events, setEvents] = useState<readonly ConfirmedActivity[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    if (!address || !session?.accessToken) {
      setStatus(address ? "session-needed" : "idle");
      setMessage(address ? "Authorize this wallet before reading bounded event history." : "Connect and authorize a wallet for confirmed activity.");
      return;
    }
    setStatus("loading"); setMessage(null);
    try {
      const page = await getEvents(session.accessToken, cursor, 25);
      const normalized = page.events.map((event) => normalizeConfirmedActivity(event)).filter((event): event is ConfirmedActivity => Boolean(event));
      setEvents((current) => {
        const combined = cursor ? [...current, ...normalized] : normalized;
        return combined.filter((event, index, all) => all.findIndex((candidate) => sameActivity(candidate, event)) === index);
      });
      setNextCursor(page.nextCursor);
      setStatus(normalized.length > 0 || cursor ? "ready" : "empty");
    } catch (cause) {
      if (cause instanceof RelayerRequestError && cause.status === 401) {
        logout();
        setStatus("session-needed");
        setMessage("Wallet authorization expired. Sign a new wallet challenge to continue.");
      } else {
        setStatus("error");
        setMessage(cause instanceof Error ? cause.message : "Confirmed activity could not be read.");
      }
    }
  }, [address, logout, session?.accessToken]);

  useEffect(() => {
    if (session?.accessToken && address) void load();
    else {
      setEvents([]);
      setNextCursor(undefined);
      setStatus(address ? "session-needed" : "idle");
      setMessage(address ? "Authorize this wallet before reading bounded event history." : null);
    }
  }, [address, load, session?.accessToken]);

  return <main id="main-content" className="dashboard-shell !pt-8 sm:!pt-12">
    <header className="mb-5 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">VoltGrid / activity</p><h1 className="!mb-2 !max-w-3xl !text-4xl sm:!text-5xl">A bounded trail of confirmed events.</h1><p className="!mb-0 !max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">Activity is decoded from relayer/chain event records. Preview epochs, modelled stress and cached browser state never appear here.</p></div><StatusBadge status={status === "ready" ? "confirmed on-chain" : "unavailable"} /></header>
    <section className="card mb-4 !p-4 sm:!p-5"><div className="card-heading"><div><p className="eyebrow">Read boundary</p><h2>Confirmed event history</h2></div><StatusBadge status="confirmed on-chain" /></div><p className="card-copy">The relayer returns at most 25 records per page. Each row must include an actual transaction hash before it is shown. Status is always confirmed on-chain because this endpoint lists decoded chain events, not browser previews.</p>{status === "session-needed" && <p className="mb-3 text-sm text-[var(--ink-soft)]" role="status">{message} <Link className="text-[var(--mint)]" href="/play#connect-wallet">Authorize in Play</Link>.</p>}{status === "error" && <p className="inline-error" role="alert">{message}</p>}{status === "empty" && <p className="empty-state">No confirmed events were returned for this authorized session.</p>}<button className="button button-quiet" onClick={() => void load()} disabled={status === "loading" || !session}>{status === "loading" ? "Reading events…" : "Refresh history"}</button></section>
    {events.length > 0 && <section className="card !p-4 sm:!p-5" aria-labelledby="activity-list-title"><div className="card-heading"><div><p className="eyebrow">Page {nextCursor ? "in progress" : "complete"}</p><h2 id="activity-list-title">{events.length} confirmed event{events.length === 1 ? "" : "s"}</h2></div><StatusBadge status="confirmed on-chain" /></div><ol className="m-0 grid list-none gap-2 p-0">{events.map((event) => <li key={`${event.txHash}-${event.logIndex ?? "unknown"}`} className="grid gap-2 border-b border-[var(--line)] py-3 sm:grid-cols-[minmax(10rem,.7fr)_minmax(0,1fr)_auto] sm:items-center"><div><strong className="text-sm">{event.name}</strong><span className="mt-1 block text-xs text-[var(--ink-faint)]">confirmed on-chain · {actionStatusCopy("confirmed")}</span></div><div className="min-w-0 text-xs text-[var(--ink-soft)]"><span className="block break-all">{event.dayId ? `day ${event.dayId}` : "day not included in event args"}</span><span>{event.epochIndex === undefined ? "day-level event" : `epoch ${String(event.epochIndex).padStart(2, "0")}`}{event.blockNumber === undefined ? "" : ` · block ${event.blockNumber}`}{event.logIndex === undefined ? "" : ` · log ${event.logIndex}`}</span></div><a className="break-all text-xs text-[var(--mint)]" href={`${mstTestnet.blockExplorers.default.url}/tx/${event.txHash}`} target="_blank" rel="noreferrer">{event.txHash}</a></li>)}</ol>{nextCursor && <button className="button button-primary mt-4" onClick={() => void load(nextCursor)} disabled={status === "loading"}>{status === "loading" ? "Loading next page…" : "Load next page"}</button>}<p className="assumption">Only actual hashes returned by the relayer are linked. No transaction hash is generated in the browser.</p></section>}
  </main>;
}
