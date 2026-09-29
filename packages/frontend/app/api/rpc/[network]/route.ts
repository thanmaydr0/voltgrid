import { NextRequest, NextResponse } from "next/server";

const TESTNET_RPC_URL = "https://testnetrpc.mstblockchain.com";
const MAX_BODY_BYTES = 64 * 1024;
const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getBalance",
  "eth_getCode",
  "eth_getLogs",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "net_version",
]);

function rpcError(message: string, status: number) {
  return NextResponse.json({ jsonrpc: "2.0", error: { code: -32600, message } }, { status });
}

/**
 * Bounded, testnet-only read proxy. Wallet-signed writes still go through the
 * user's EIP-1193 provider and never pass through this route.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ network: string }> }) {
  if ((await params).network !== "testnet") return rpcError("Only MST Testnet reads are available.", 404);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return rpcError("RPC request is too large.", 413);

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return rpcError("RPC request is too large.", 413);

  let payload: { method?: string; jsonrpc?: string; id?: string | number | null };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    return rpcError("RPC request must be valid JSON.", 400);
  }

  if (!payload || Array.isArray(payload) || !payload.method || !ALLOWED_METHODS.has(payload.method)) {
    return rpcError("RPC method is not allowed by the frontend read proxy.", 403);
  }

  try {
    const upstream = await fetch(TESTNET_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
    const data = await upstream.text();
    return new NextResponse(data, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return rpcError("MST Testnet RPC is unavailable.", 502);
  }
}
