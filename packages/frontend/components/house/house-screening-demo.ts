import type { Address, Hex } from "viem";

export const HOUSE_SCREENING_DEMO_ABI = [
  {
    type: "function",
    name: "mintDemoScreening",
    stateMutability: "nonpayable",
    inputs: [
      { name: "documentCommitment", type: "bytes32" },
      { name: "signalFlags", type: "uint8" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "credentialTokenOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "screeningData",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{
      name: "screening",
      type: "tuple",
      components: [
        { name: "documentCommitment", type: "bytes32" },
        { name: "signalFlags", type: "uint8" },
        { name: "issuedAt", type: "uint64" },
      ],
    }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "uri", type: "string" }],
  },
  {
    type: "event",
    name: "HouseScreeningDemoMinted",
    anonymous: false,
    inputs: [
      { indexed: true, name: "account", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: true, name: "documentCommitment", type: "bytes32" },
      { indexed: false, name: "signalFlags", type: "uint8" },
    ],
  },
] as const;

export type HouseScreeningDraft = Readonly<{
  documentCommitment: Hex;
  commitmentSalt: Hex;
  signalFlags: number;
}>;

export type HouseScreeningReceipt = Readonly<{
  readonly account: Address;
  readonly tokenId: bigint;
  readonly documentCommitment: Hex;
  readonly signalFlags: number;
}>;

export type HouseScreeningChainData = Readonly<{
  readonly documentCommitment: Hex;
  readonly signalFlags: number;
}>;

export function screeningSignalLabels(flags: number): string[] {
  return [
    (flags & 1) !== 0 ? "solar/net-metering clue" : undefined,
    (flags & 2) !== 0 ? "exported-energy clue" : undefined,
    (flags & 4) !== 0 ? "net/imported-units clue" : undefined,
  ].filter((label): label is string => Boolean(label));
}

export function confirmedScreeningRecordMatches(input: Readonly<{
  receiptStatus: "success" | "reverted";
  expectedAccount: Address;
  event?: HouseScreeningReceipt;
  owner?: Address;
  tokenPointer?: bigint;
  chainData?: HouseScreeningChainData;
  draft: HouseScreeningDraft;
}>): boolean {
  const { receiptStatus, expectedAccount, event, owner, tokenPointer, chainData, draft } = input;
  if (receiptStatus !== "success" || !event || !owner || tokenPointer === undefined || !chainData) return false;
  const account = expectedAccount.toLowerCase();
  const commitment = draft.documentCommitment.toLowerCase();
  return event.account.toLowerCase() === account &&
    owner.toLowerCase() === account &&
    event.tokenId === tokenPointer &&
    event.documentCommitment.toLowerCase() === commitment &&
    chainData.documentCommitment.toLowerCase() === commitment &&
    event.signalFlags === draft.signalFlags &&
    chainData.signalFlags === draft.signalFlags;
}
