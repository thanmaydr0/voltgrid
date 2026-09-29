import type { Metadata } from "next";
import { MarketView } from "./market-view";

export const metadata: Metadata = { title: "Energy Market | VoltGrid" };

export default function MarketPage() {
  return <MarketView />;
}
