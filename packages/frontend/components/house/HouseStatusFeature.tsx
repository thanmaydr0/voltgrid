"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NetworkWarning } from "@/components/NetworkWarning";
import { SolarCertificateEvidenceNotice } from "@/components/house/SolarCertificateEvidenceNotice";
import { parseDaySnapshot, parseHouseSnapshot } from "./registration";
import { mstTestnet } from "@/lib/chains";
import { contractAddresses } from "@/lib/addresses";
import { VOLT_GRID_MARKET_ABI } from "voltgrid-shared";

function ReadState({ loading, error, children }: { loading: boolean; error: boolean; children: React.ReactNode }) {
  if (loading) return <span className="text-sm text-muted-foreground">Reading from MST Testnet…</span>;
  if (error) return <span className="text-sm text-destructive">Unavailable — no registration conclusion is made.</span>;
  return <>{children}</>;
}

export function HouseStatusFeature() {
  const { address, chainId, isConnected } = useAccount();
  const marketAddress = contractAddresses.market;
  const configured = Boolean(marketAddress);
  const day = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "currentDay",
    chainId: mstTestnet.id,
    query: { enabled: configured },
  });
  const treasury = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "treasury",
    chainId: mstTestnet.id,
    query: { enabled: configured },
  });
  const houses = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "getHouses",
    chainId: mstTestnet.id,
    query: { enabled: configured },
  });
  const house = useReadContract({
    address: marketAddress,
    abi: VOLT_GRID_MARKET_ABI,
    functionName: "houses",
    args: address ? [address] : undefined,
    chainId: mstTestnet.id,
    query: { enabled: configured && Boolean(address) },
  });

  const daySnapshot = parseDaySnapshot(day.data);
  const houseSnapshot = parseHouseSnapshot(house.data);
  const houseCount = Array.isArray(houses.data) ? houses.data.length : undefined;
  const isTreasury = Boolean(address && typeof treasury.data === "string" && address.toLowerCase() === treasury.data.toLowerCase());
  const chainReady = chainId === mstTestnet.id;

  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <Badge variant={configured ? "default" : "outline"}>{configured ? "Market configured" : "Market unavailable"}</Badge>
        <h1 className="text-3xl font-bold tracking-tight">House status</h1>
        <p className="max-w-3xl text-muted-foreground">A read-only view of the configured market and the connected account’s on-chain house record. A failed or unknown read is never treated as “unregistered.”</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Market readiness</CardTitle><CardDescription>These values come from the configured market contract on MST Testnet.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-md border border-border p-4"><span className="text-xs text-muted-foreground">Market contract</span><p className="mt-2 break-all text-sm">{marketAddress ?? "Not configured"}</p></div>
          <div className="rounded-md border border-border p-4"><span className="text-xs text-muted-foreground">Treasury</span><p className="mt-2 break-all text-sm"><ReadState loading={treasury.isLoading} error={treasury.isError || (configured && treasury.data === undefined)}>{typeof treasury.data === "string" ? treasury.data : "Unavailable"}</ReadState></p></div>
          <div className="rounded-md border border-border p-4"><span className="text-xs text-muted-foreground">Registered houses</span><p className="mt-2 text-sm"><ReadState loading={houses.isLoading} error={houses.isError || (configured && houses.data === undefined)}>{houseCount === undefined ? "Unavailable" : `${houseCount} / 16`}</ReadState></p></div>
        </CardContent>
      </Card>

      <NetworkWarning />
      {!isConnected && <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">Connect a wallet to read its house record. Public market status remains available where the configured RPC responds.</p>}
      {isConnected && !chainReady && <p className="rounded-md border border-accent/40 bg-accent/10 p-4 text-sm">The connected wallet is on chain {chainId ?? "unknown"}. Switch to MST Testnet ({mstTestnet.id}) before using account-specific house actions.</p>}

      <Card>
        <CardHeader><CardTitle>Connected account</CardTitle><CardDescription>Account: <code className="break-all">{address ?? "Not connected"}</code></CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {!address ? <p className="text-sm text-muted-foreground">No account selected, so no house registration status can be asserted.</p> : <ReadState loading={house.isLoading} error={house.isError || house.data === undefined}>
            {houseSnapshot?.exists ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"><strong>Registered on-chain</strong><br />Registration index {houseSnapshot.registrationIndex}</p>
                <p className="rounded-md border border-border p-3 text-sm">Solar: {houseSnapshot.hasSolar ? "declared" : "not declared"}<br />Battery: {houseSnapshot.hasBattery ? `${houseSnapshot.batteryCapacityWh.toLocaleString()} Wh declared` : "not declared"}<br />Battery consent: {houseSnapshot.hasBattery ? houseSnapshot.batteryOptedIn ? "opted in" : "not opted in" : "not applicable"}</p>
              </div>
            ) : <p className="rounded-md border border-border p-3 text-sm">This account is not registered in the readable market state.</p>}
          </ReadState>}
          {address && !house.isLoading && !house.isError && houseSnapshot?.exists && houseSnapshot.hasSolar && <SolarCertificateEvidenceNotice compact />}
          {isTreasury && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">This connected account equals the market treasury. The contract cannot register the treasury as a household. Connect a different wallet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Current market day</CardTitle><CardDescription>Registration is append-only and the contract freezes it during an active day.</CardDescription></CardHeader>
        <CardContent><ReadState loading={day.isLoading} error={day.isError || (configured && day.data === undefined)}>{daySnapshot ? daySnapshot.active ? <p className="text-sm">Active day <code>{daySnapshot.id}</code>; next epoch {daySnapshot.nextEpoch}. New registration and consent changes are locked.</p> : <p className="text-sm">No active day. Registration can proceed after all readiness checks pass.</p> : <p className="text-sm text-muted-foreground">Current-day state is unavailable.</p>}</ReadState></CardContent>
      </Card>

      <div className="flex flex-wrap gap-3"><Link href="/house/register"><Button disabled={!configured}>Register a house</Button></Link><Link href="/wallet"><Button variant="outline">Open wallet</Button></Link></div>
    </main>
  );
}
