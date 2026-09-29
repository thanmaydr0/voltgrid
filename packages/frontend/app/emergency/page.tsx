import type { Metadata } from "next";
import { EmergencyView } from "./emergency-view";

export const metadata: Metadata = { title: "Grid Emergency | VoltGrid" };

export default function EmergencyPage() {
  return <EmergencyView />;
}
