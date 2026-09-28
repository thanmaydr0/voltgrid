export type ScenarioValue = "sunny" | "rainy" | "heatwave";

/** Local adapter for the frozen frontend provenance contract in INTERFACE.md. */
export type Provenance =
  | { kind: "model-preview"; modelVersion: 1; scenario: ScenarioValue; seed: string; epochIndex: number }
  | { kind: "sensor-observation"; deviceId: string; observedAt: string; quality: "valid" | "stale" | "invalid" }
  | { kind: "chain-pending"; chainId: 91562037; dayId: string; txHash?: string }
  | { kind: "chain-confirmed"; chainId: 91562037; dayId: string; txHash: string; blockNumber: string; logIndex: number }
  | { kind: "unavailable"; reason: string };
