import type { AuthContext, RelayerConfig } from "./types";
export declare class AuthManager {
    private readonly config;
    private readonly now;
    private readonly challenges;
    private readonly sessions;
    constructor(config: RelayerConfig, now?: () => number);
    createChallenge(rawAddress: unknown, origin: string, ip: string): Readonly<{
        nonce: string;
        message: string;
        expiresAt: number;
    }>;
    verify(rawAddress: unknown, message: unknown, signature: unknown, origin: string, ip: string): Readonly<{
        accessToken: string;
        expiresAt: number;
    }>;
    requireSession(rawToken: string | undefined, origin: string, ip: string): AuthContext;
    reset(): void;
    verifyAdmin(provided: string | undefined): void;
}
