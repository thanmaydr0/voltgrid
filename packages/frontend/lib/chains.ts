import { defineChain } from "viem";

export const mstTestnet = defineChain({
  id: 91562037,
  name: "MST Testnet",
  nativeCurrency: { name: "MST Testnet Coin", symbol: "tMSTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnetrpc.mstblockchain.com"] },
  },
  blockExplorers: {
    default: { name: "MSTScan", url: "https://testnet.mstscan.com" },
  },
  testnet: true,
});
