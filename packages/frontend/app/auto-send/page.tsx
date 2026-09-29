import type { Metadata } from "next";
import { AutoSendView } from "./auto-send-view";

export const metadata: Metadata = {
  title: "Auto-send | VoltGrid",
  description: "Algorithmic VLT dispatch proposals for neighbours who need power.",
};

export default function AutoSendPage() {
  return <AutoSendView />;
}
