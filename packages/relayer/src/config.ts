import path from "node:path";
import type { Address, RelayerConfig } from "./types";

const DEFAULT_LOCAL_RPC = "http://127.0.0.1:8545";
const DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required relayer configuration: ${name}`);
  return value;
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Invalid relayer configuration: ${name}`);
  }
  return value;
}

function bool(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`Invalid relayer configuration: ${name}`);
}

function address(name: string, value: string): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`Invalid relayer configuration: ${name}`);
  }
  return value as Address;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayerConfig {
  const mode = (env.RELAYER_MODE || "production") as "local" | "production";
  if (mode !== "local" && mode !== "production") throw new Error("RELAYER_MODE must be local or production");

  const rpcUrl = env.MST_RPC_URL?.trim() || (mode === "local" ? DEFAULT_LOCAL_RPC : "");
  const chainId = integer(env, "MST_CHAIN_ID", mode === "local" ? 31337 : 0, 1, Number.MAX_SAFE_INTEGER);
  const marketAddress = address("MARKET_ADDRESS", required(env, "MARKET_ADDRESS"));
  const oraclePrivateKey = required(env, "ORACLE_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(oraclePrivateKey)) throw new Error("Invalid relayer configuration: ORACLE_PRIVATE_KEY");
  if (!rpcUrl) throw new Error("Missing required relayer configuration: MST_RPC_URL");

  const allowedOrigins = (env.RELAYER_ALLOWED_ORIGINS || (mode === "local" ? DEFAULT_ORIGINS.join(",") : ""))
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (mode === "production" && allowedOrigins.length === 0) throw new Error("Missing required relayer configuration: RELAYER_ALLOWED_ORIGINS");
  const adminSecret = mode === "production" ? required(env, "RELAYER_ADMIN_SECRET") : (env.RELAYER_ADMIN_SECRET || "local-admin-only");
  const authSecret = mode === "production" ? required(env, "RELAYER_AUTH_SECRET") : (env.RELAYER_AUTH_SECRET || "local-auth-only");

  return Object.freeze({
    mode,
    rpcUrl,
    chainId,
    marketAddress,
    oraclePrivateKey,
    dataPath: path.resolve(env.RELAYER_DATA_PATH || path.join("data", "relayer.json")),
    allowedOrigins: Object.freeze(allowedOrigins),
    adminSecret,
    authSecret,
    transformerCapacityWh: integer(env, "RELAYER_TRANSFORMER_CAPACITY_WH", 10_000, 1, Number.MAX_SAFE_INTEGER),
    emergencyTariffMicro: integer(env, "RELAYER_EMERGENCY_TARIFF_MICRO", 7_500_000, 2_500_000, 8_000_000),
    trustProxy: bool(env, "RELAYER_TRUST_PROXY", false),
    requireOrigin: mode === "production",
    maxBodyBytes: integer(env, "RELAYER_MAX_BODY_BYTES", 65_536, 1_024, 1_048_576),
    sessionTtlMs: 15 * 60 * 1_000,
    receiptTimeoutMs: integer(env, "RELAYER_RECEIPT_TIMEOUT_MS", 30_000, 100, 300_000),
    receiptPollMs: integer(env, "RELAYER_RECEIPT_POLL_MS", 250, 25, 10_000),
    eventLookbackBlocks: integer(env, "RELAYER_EVENT_LOOKBACK_BLOCKS", 10_000, 1, 100_000),
    maxActionsPerSession: integer(env, "RELAYER_MAX_ACTIONS_PER_SESSION", 30, 1, 100),
    maxActionsPerIp: integer(env, "RELAYER_MAX_ACTIONS_PER_IP", 60, 1, 200),
    maxAuthPerIp: integer(env, "RELAYER_MAX_AUTH_PER_IP", 20, 1, 100),
  });
}
