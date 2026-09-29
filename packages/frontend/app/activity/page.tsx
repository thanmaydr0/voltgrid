import type { Metadata } from "next";
import { ActivityView } from "./activity-view";

export const metadata: Metadata = { title: "Activity | VoltGrid" };

export default function ActivityPage() {
  return <ActivityView />;
}
