import type { Metadata } from "next";
import { TransferView } from "./transfer-view";

export const metadata: Metadata = {
  title: "Send VLT | VoltGrid",
  description: "Transfer VLT between registered VoltGrid neighbours.",
};

export default function TransferPage() {
  return <TransferView />;
}
