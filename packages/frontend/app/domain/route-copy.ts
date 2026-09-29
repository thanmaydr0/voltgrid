import type { ActionStatus } from "../../lib/relayer";

export function actionStatusCopy(status: ActionStatus): string {
  switch (status) {
    case "pending": return "Submitted; the receipt is not confirmed yet.";
    case "confirmed": return "Confirmed by the expected receipt event.";
    case "reverted": return "Reverted; no settled value is asserted.";
    case "unknown": return "Unknown; reconcile the existing transaction before retrying.";
  }
}

export function stateTone(status: ActionStatus): "preview simulation" | "submitted / pending" | "confirmed on-chain" | "unavailable" {
  if (status === "confirmed") return "confirmed on-chain";
  if (status === "pending") return "submitted / pending";
  if (status === "reverted" || status === "unknown") return "unavailable";
  return "preview simulation";
}
