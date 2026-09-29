import type { Address } from "viem";

function configuredAddress(value: string | undefined): Address | undefined {
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value)) return undefined;
  return value as Address;
}

export const contractAddresses = {
  token: configuredAddress(process.env.NEXT_PUBLIC_VOLT_TOKEN_ADDRESS),
  market: configuredAddress(process.env.NEXT_PUBLIC_VOLT_MARKET_ADDRESS),
  certificate: configuredAddress(process.env.NEXT_PUBLIC_VOLT_CERTIFICATE_ADDRESS),
  // Confirmed additive deployment on MST Testnet (chain 91562037), never mainnet.
  houseScreeningDemo: configuredAddress(process.env.NEXT_PUBLIC_VOLT_HOUSE_SCREENING_DEMO_ADDRESS)
    ?? configuredAddress("0xe2A3e509B43aC4b1d3B7bD088985BbBa03Df7e6a"),
} as const;

export const hasContractAddresses = Boolean(contractAddresses.token && contractAddresses.market);
export const hasCertificateAddress = Boolean(contractAddresses.certificate);
export const hasHouseScreeningDemoAddress = Boolean(contractAddresses.houseScreeningDemo);
