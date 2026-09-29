"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main-content" className="dashboard-shell">
      <Card role="alert" className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>We could not load this VoltGrid view</CardTitle>
          <CardDescription>Your wallet, chain data, and saved references have not been changed by this screen.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={reset}>Try again</Button>
          <Link className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm" href="/">Return to overview</Link>
        </CardContent>
      </Card>
    </main>
  );
}
