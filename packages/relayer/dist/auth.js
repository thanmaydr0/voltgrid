"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthManager = void 0;
const node_crypto_1 = require("node:crypto");
const ethers_1 = require("ethers");
const errors_1 = require("./errors");
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
function normalizeAddress(value) {
    if (typeof value !== "string" || !ADDRESS_PATTERN.test(value) || /^0x0{40}$/i.test(value)) {
        throw new errors_1.HttpError(400, "INVALID_INPUT", "address must be a non-zero EVM address", false);
    }
    try {
        return (0, ethers_1.getAddress)(value);
    }
    catch {
        throw new errors_1.HttpError(400, "INVALID_INPUT", "invalid EVM address", false);
    }
}
function hashToken(secret, token) {
    return (0, node_crypto_1.createHmac)("sha256", secret).update(token).digest("hex");
}
class AuthManager {
    constructor(config, now = () => Date.now()) {
        this.config = config;
        this.now = now;
        this.challenges = new Map();
        this.sessions = new Map();
    }
    createChallenge(rawAddress, origin, ip) {
        const address = normalizeAddress(rawAddress);
        const expiresAt = this.now() + 5 * 60000;
        const nonce = `0x${(0, node_crypto_1.randomBytes)(16).toString("hex")}`;
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
    verify(rawAddress, message, signature, origin, ip) {
        const address = normalizeAddress(rawAddress);
        if (typeof message !== "string" || typeof signature !== "string") {
            throw new errors_1.HttpError(400, "INVALID_INPUT", "message and signature are required", false);
        }
        const key = `${address.toLowerCase()}|${origin}|${ip}`;
        const challenge = this.challenges.get(key);
        if (!challenge || challenge.expiresAt < this.now() || challenge.message !== message) {
            throw new errors_1.HttpError(401, "UNAUTHORIZED", "challenge is missing, expired, or does not match this origin", false);
        }
        let recovered;
        try {
            recovered = (0, ethers_1.getAddress)((0, ethers_1.verifyMessage)(message, signature));
        }
        catch {
            throw new errors_1.HttpError(401, "UNAUTHORIZED", "signature verification failed", false);
        }
        if (recovered.toLowerCase() !== address.toLowerCase()) {
            throw new errors_1.HttpError(401, "UNAUTHORIZED", "signature address mismatch", false);
        }
        this.challenges.delete(key);
        const token = (0, node_crypto_1.randomBytes)(32).toString("hex");
        const expiresAt = this.now() + this.config.sessionTtlMs;
        this.sessions.set(hashToken(this.config.authSecret, token), { address, origin, tokenHash: hashToken(this.config.authSecret, token), expiresAt });
        return Object.freeze({ accessToken: token, expiresAt });
    }
    requireSession(rawToken, origin, ip) {
        if (!rawToken)
            throw new errors_1.HttpError(401, "UNAUTHORIZED", "bearer session required", false);
        const tokenHash = hashToken(this.config.authSecret, rawToken);
        const session = this.sessions.get(tokenHash);
        if (!session || session.expiresAt < this.now() || session.origin !== origin) {
            throw new errors_1.HttpError(401, "UNAUTHORIZED", "session is missing, expired, or origin-bound", false);
        }
        return Object.freeze({ address: session.address, token: rawToken, origin, ip });
    }
    reset() {
        this.challenges.clear();
        this.sessions.clear();
    }
    verifyAdmin(provided) {
        if (!provided)
            throw new errors_1.HttpError(401, "UNAUTHORIZED", "admin authorization required", false);
        const expected = Buffer.from(this.config.adminSecret);
        const actual = Buffer.from(provided);
        if (expected.length !== actual.length || !(0, node_crypto_1.timingSafeEqual)(expected, actual)) {
            throw new errors_1.HttpError(401, "UNAUTHORIZED", "admin authorization failed", false);
        }
    }
}
exports.AuthManager = AuthManager;
