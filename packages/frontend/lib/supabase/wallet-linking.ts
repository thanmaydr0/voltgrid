/**
 * Integration seam for the future verified-wallet flow.
 *
 * This app currently has no safe owner-side route that can issue and consume a
 * single-use wallet challenge without changing the wallet/relayer track. Do not
 * insert a copied profile address into linked_wallets. Prompt 3 must supply a
 * same-origin server adapter that creates a short-lived nonce, binds it to the
 * verified Supabase user and normalized chain/address, verifies the EIP-191
 * signature server-side, atomically consumes the nonce, and only then writes a
 * linked_wallets row. The Supabase Auth session must never replace relayer
 * wallet authorization.
 */
export type WalletLinkChallenge = Readonly<{
  challengeId: string;
  walletAddress: `0x${string}`;
  chainId: number;
  message: string;
  expiresAtISO: string;
}>;

export interface VerifiedWalletLinkAdapter {
  createChallenge(input: { walletAddress: `0x${string}`; chainId: number }): Promise<WalletLinkChallenge>;
  verifyChallenge(input: { challengeId: string; signature: `0x${string}` }): Promise<void>;
  unlinkWallet(input: { walletAddress: `0x${string}`; chainId: number }): Promise<void>;
}
