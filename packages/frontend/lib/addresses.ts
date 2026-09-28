import type { Address } from "viem";

function configuredAddress(name: string): Address | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value)) return undefined;
  return value as Address;
}

export const contractAddresses = {
  token: configuredAddress("NEXT_PUBLIC_VOLT_TOKEN_ADDRESS"),
  market: configuredAddress("NEXT_PUBLIC_VOLT_MARKET_ADDRESS"),
  certificate: configuredAddress("NEXT_PUBLIC_VOLT_CERTIFICATE_ADDRESS"),
} as const;

export const hasContractAddresses = Boolean(contractAddresses.token && contractAddresses.market);
export const hasCertificateAddress = Boolean(contractAddresses.certificate);
