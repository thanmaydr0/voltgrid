import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main id="main-content" className="dashboard-shell" aria-label="Loading page">
      <Card className="grid gap-5 p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-2/3 max-w-xl" />
        <Skeleton className="h-28 w-full" />
        <span className="sr-only">Loading VoltGrid content…</span>
      </Card>
    </main>
  );
}
