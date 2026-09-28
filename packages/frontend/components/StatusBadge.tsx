export type DataStatus =
  | "preview simulation"
  | "submitted / pending"
  | "confirmed on-chain"
  | "unavailable";

export function StatusBadge({ status }: { status: DataStatus }) {
  return <span className={`status-badge status-${status.replaceAll(" ", "-").replaceAll("/", "-")}`}>{status}</span>;
}
