import assert from "node:assert/strict";
import test from "node:test";
import { confirmedScreeningRecordMatches, isDemoScreeningPass, screeningSignalFlags, screeningSignalLabels, type HouseScreeningDraft, type HouseScreeningReceipt } from "../components/house/house-screening-demo";
import type { Hex } from "viem";

const wallet = "0x1111111111111111111111111111111111111111" as const;
const otherWallet = "0x2222222222222222222222222222222222222222" as const;
const commitment = ("0x" + "ab".repeat(32)) as Hex;
const draft: HouseScreeningDraft = {
  documentCommitment: commitment,
  commitmentSalt: ("0x" + "cd".repeat(32)) as Hex,
  signalFlags: 3,
};
const event: HouseScreeningReceipt = {
  account: wallet,
  tokenId: BigInt(7),
  documentCommitment: commitment,
  signalFlags: 3,
};

test("OCR clue flags render only the categories actually recorded", () => {
  assert.deepEqual(screeningSignalLabels(3), ["solar/net-metering clue", "exported-energy clue"]);
  assert.deepEqual(screeningSignalLabels(4), ["net/imported-units clue"]);
  assert.deepEqual(screeningSignalLabels(0), []);
});

test("one real OCR clue is enough for a clearly-labeled testnet demo screening pass", () => {
  assert.equal(screeningSignalFlags(["solar"]), 1);
  assert.equal(isDemoScreeningPass(screeningSignalFlags(["solar"])), true);
  assert.equal(isDemoScreeningPass(screeningSignalFlags(["export"])), true);
  assert.equal(isDemoScreeningPass(screeningSignalFlags([])), false);
  assert.equal(isDemoScreeningPass(8), false);
});

test("a screening credential is confirmed only when receipt, event and fresh chain data agree", () => {
  const matching = { receiptStatus: "success" as const, expectedAccount: wallet, event, owner: wallet, tokenPointer: BigInt(7), chainData: { documentCommitment: commitment, signalFlags: 3 }, draft };
  assert.equal(confirmedScreeningRecordMatches(matching), true);
  assert.equal(confirmedScreeningRecordMatches({ ...matching, receiptStatus: "reverted" }), false);
  assert.equal(confirmedScreeningRecordMatches({ ...matching, owner: otherWallet }), false);
  assert.equal(confirmedScreeningRecordMatches({ ...matching, tokenPointer: BigInt(8) }), false);
  assert.equal(confirmedScreeningRecordMatches({ ...matching, chainData: { documentCommitment: commitment, signalFlags: 1 } }), false);
  assert.equal(confirmedScreeningRecordMatches({ ...matching, event: undefined }), false);
});
