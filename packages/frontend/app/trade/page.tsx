import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "VLT Trade | VoltGrid",
  description: "VoltCredit market availability and trading status.",
};

export default function TradePage() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <Badge variant="outline">Market unavailable</Badge>
        <h1 className="text-3xl font-bold tracking-tight">VLT trade</h1>
        <p className="max-w-3xl text-muted-foreground">The repository token is VoltCredit (VLT). Its configured contract is a demo settlement token; this app has no verified VLT trading pair, candle feed, or buy/sell venue.</p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle>VLT market data</CardTitle><CardDescription>Current price and candlesticks require an identified, verifiable market source.</CardDescription></div>
            <Badge variant="outline">No verified feed</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border p-3"><dt className="text-xs text-muted-foreground">Current VLT price</dt><dd className="mt-1 text-base font-semibold">Unavailable</dd></div>
            <div className="rounded-md border border-border p-3"><dt className="text-xs text-muted-foreground">Pair / venue</dt><dd className="mt-1 break-words text-sm">Not configured</dd></div>
            <div className="rounded-md border border-border p-3"><dt className="text-xs text-muted-foreground">Trading</dt><dd className="mt-1 text-sm">Not enabled</dd></div>
          </dl>

          <section className="grid min-h-56 place-items-center rounded-lg border border-dashed border-border bg-background/50 p-5 text-center" aria-labelledby="candles-unavailable-title" aria-live="polite">
            <div className="max-w-lg space-y-2">
              <h2 id="candles-unavailable-title" className="text-lg font-semibold">Candlestick chart unavailable</h2>
              <p className="text-sm text-muted-foreground">A TradingView-style chart will appear only when VoltGrid is connected to an actual VLT market and its trustworthy OHLC data source. No sample candles or simulated prices are shown as token market data.</p>
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <Button disabled title="No verified VLT pair or trading integration is configured">Buy VLT</Button>
            <Button disabled variant="outline" title="No verified VLT pair or trading integration is configured">Sell VLT</Button>
            <Link href="/market" className={buttonVariants({ variant: "ghost" })}>View modelled energy market</Link>
          </div>
          <p className="mb-0 text-xs text-muted-foreground">The energy-market preview at /market is denominated in modelled ₹/kWh and is not a VLT exchange quote.</p>
        </CardContent>
      </Card>
    </main>
  );
}
