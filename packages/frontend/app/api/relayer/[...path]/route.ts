import { NextRequest, NextResponse } from "next/server";

const MAX_BODY_BYTES = 64 * 1024;

function upstreamBase(): string {
  return process.env.RELAYER_URL || "http://127.0.0.1:8787";
}

async function forward(request: NextRequest, path: string[]) {
  const target = new URL(path.join("/"), `${upstreamBase().replace(/\/$/, "")}/`);
  target.search = new URL(request.url).search;
  const body = request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS" ? undefined : await request.text();
  if (body && new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return NextResponse.json({ code: "INVALID_INPUT", message: "request body too large" }, { status: 413 });
  const headers = new Headers();
  for (const name of ["authorization", "content-type", "x-admin-secret"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("origin", request.headers.get("origin") || new URL(request.url).origin);
  try {
    const response = await fetch(target, { method: request.method, headers, body, cache: "no-store" });
    const text = await response.text();
    return new NextResponse(text, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json" } });
  } catch {
    return NextResponse.json({ code: "RPC_UNAVAILABLE", message: "relayer is unavailable", retryable: true }, { status: 503 });
  }
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  return forward(request, context.params.path);
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  return forward(request, context.params.path);
}

export async function OPTIONS(request: NextRequest, context: { params: { path: string[] } }) {
  return forward(request, context.params.path);
}
