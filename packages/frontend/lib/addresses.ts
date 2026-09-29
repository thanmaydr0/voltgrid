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
  // One-clue demo rule v2 is a confirmed additive MST Testnet deployment, never mainnet.
  houseScreeningDemo: configuredAddress(process.env.NEXT_PUBLIC_VOLT_HOUSE_SCREENING_DEMO_ADDRESS)
    ?? configuredAddress("0xC4b5f5b51BB763d7447FA7f883bbC777aacd3994"),
} as const;

export const hasContractAddresses = Boolean(contractAddresses.token && contractAddresses.market);
export const hasCertificateAddress = Boolean(contractAddresses.certificate);
export const hasHouseScreeningDemoAddress = Boolean(contractAddresses.houseScreeningDemo);
