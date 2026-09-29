import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main id="main-content" className="dashboard-shell">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>That VoltGrid page is not available</CardTitle>
          <CardDescription>This address may be out of date. The overview remains available, including the current simulator and wallet panel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/" className={buttonVariants({ variant: "default" })}>Go to overview</Link>
        </CardContent>
      </Card>
    </main>
  );
}
