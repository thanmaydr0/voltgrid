import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import type { Address, AuthContext, RelayerConfig } from "./types";
import { HttpError } from "./errors";

type Challenge = Readonly<{ address: Address; origin: string; ip: string; message: string; expiresAt: number }>;
type Session = Readonly<{ address: Address; origin: string; tokenHash: string; expiresAt: number }>;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

function normalizeAddress(value: unknown): Address {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value) || /^0x0{40}$/i.test(value)) {
    throw new HttpError(400, "INVALID_INPUT", "address must be a non-zero EVM address", false);
  }
  try { return getAddress(value) as Address; } catch { throw new HttpError(400, "INVALID_INPUT", "invalid EVM address", false); }
}

function hashToken(secret: string, token: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export class AuthManager {
  private readonly challenges = new Map<string, Challenge>();
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly config: RelayerConfig, private readonly now: () => number = () => Date.now()) {}

  createChallenge(rawAddress: unknown, origin: string, ip: string): Readonly<{ nonce: string; message: string; expiresAt: number }> {
    const address = normalizeAddress(rawAddress);
    const expiresAt = this.now() + 5 * 60_000;
    const nonce = `0x${randomBytes(16).toString("hex")}`;
    const message = [
      "VoltGrid demo authorization",
      `Domain: ${origin}`,
      `Address: ${address}`,
      `Chain ID: ${this.config.chainId}`,
      `Nonce: ${nonce}`,
      `Expires At: ${expiresAt}`,
    ].join("\n");
    this.challenges.set(`${address.toLowerCase()}|${origin}|${ip}`, { address, origin, ip, message, expiresAt });
    return Object.freeze({ nonce, message, expiresAt });
  }

  verify(rawAddress: unknown, message: unknown, signature: unknown, origin: string, ip: string): Readonly<{ accessToken: string; expiresAt: number }> {
    const address = normalizeAddress(rawAddress);
    if (typeof message !== "string" || typeof signature !== "string") {
      throw new HttpError(400, "INVALID_INPUT", "message and signature are required", false);
    }
    const key = `${address.toLowerCase()}|${origin}|${ip}`;
    const challenge = this.challenges.get(key);
    if (!challenge || challenge.expiresAt < this.now() || challenge.message !== message) {
      throw new HttpError(401, "UNAUTHORIZED", "challenge is missing, expired, or does not match this origin", false);
    }
    let recovered: string;
    try { recovered = getAddress(verifyMessage(message, signature)); } catch {
      throw new HttpError(401, "UNAUTHORIZED", "signature verification failed", false);
    }
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      throw new HttpError(401, "UNAUTHORIZED", "signature address mismatch", false);
    }
    this.challenges.delete(key);
    const token = randomBytes(32).toString("hex");
    const expiresAt = this.now() + this.config.sessionTtlMs;
    this.sessions.set(hashToken(this.config.authSecret, token), { address, origin, tokenHash: hashToken(this.config.authSecret, token), expiresAt });
    return Object.freeze({ accessToken: token, expiresAt });
  }

  requireSession(rawToken: string | undefined, origin: string, ip: string): AuthContext {
    if (!rawToken) throw new HttpError(401, "UNAUTHORIZED", "bearer session required", false);
    const tokenHash = hashToken(this.config.authSecret, rawToken);
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt < this.now() || session.origin !== origin) {
      throw new HttpError(401, "UNAUTHORIZED", "session is missing, expired, or origin-bound", false);
    }
    return Object.freeze({ address: session.address, token: rawToken, origin, ip });
  }

  reset(): void {
    this.challenges.clear();
    this.sessions.clear();
  }

  verifyAdmin(provided: string | undefined): void {
    if (!provided) throw new HttpError(401, "UNAUTHORIZED", "admin authorization required", false);
    const expected = Buffer.from(this.config.adminSecret);
    const actual = Buffer.from(provided);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new HttpError(401, "UNAUTHORIZED", "admin authorization failed", false);
    }
  }
}
