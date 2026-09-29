import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import {
  HOUSE_REGISTERED_EVENT_ABI,
  findHouseRegisteredEvent,
  getRegistrationReadiness,
  normalizeBatteryCapacity,
  validateDeclaration,
  type HouseDeclaration,
} from "../components/house/registration";
import { describeWalletError, receiptWasSuccessful, reconcileReceipt, transactionIsInFlight } from "../components/wallet/transaction";

const baseReadiness = {
  isConnected: true,
  address: "0x0000000000000000000000000000000000000011",
  chainId: 91562037,
  expectedChainId: 91562037,
  marketConfigured: true,
  marketReadKnown: true,
  treasury: "0x0000000000000000000000000000000000000022",
  treasuryReadKnown: true,
  dayReadKnown: true,
  dayActive: false,
  houseReadKnown: true,
  house: { exists: false, hasSolar: false, hasBattery: false, batteryCapacityWh: 0, batteryOptedIn: false, registrationIndex: 0 },
  capacityReadKnown: true,
  houseCount: 1,
  declarationValid: true,
} as const;

test("non-treasury readiness enables only after every read is known", () => {
  assert.equal(getRegistrationReadiness(baseReadiness).canSign, true);
  assert.equal(getRegistrationReadiness({ ...baseReadiness, treasuryReadKnown: false }).canSign, false);
  assert.match(getRegistrationReadiness({ ...baseReadiness, houseReadKnown: false }).reason, /Unknown state/);
});

test("known treasury is blocked before signature and tells the user to change wallet", () => {
  const result = getRegistrationReadiness({ ...baseReadiness, treasury: baseReadiness.address });
  assert.equal(result.isTreasury, true);
  assert.equal(result.canSign, false);
  assert.match(result.reason, /treasury/i);
  assert.match(result.reason, /different wallet/i);
});

test("registration declaration follows the exact contract battery rules", () => {
  const noBattery: HouseDeclaration = { hasSolar: true, hasBattery: false, batteryCapacityWh: 0 };
  assert.equal(validateDeclaration(noBattery), undefined);
  assert.equal(validateDeclaration({ ...noBattery, batteryCapacityWh: 1 }), "Battery capacity must be zero when battery is off.");
  assert.equal(validateDeclaration({ hasSolar: false, hasBattery: true, batteryCapacityWh: 0 })?.includes("positive integer"), true);
  assert.equal(validateDeclaration({ hasSolar: false, hasBattery: true, batteryCapacityWh: 100_000 }), undefined);
  assert.equal(validateDeclaration({ hasSolar: false, hasBattery: true, batteryCapacityWh: 100_001 })?.includes("100,000"), true);
  assert.equal(normalizeBatteryCapacity(false, "999"), 0);
  assert.equal(normalizeBatteryCapacity(true, "100000"), 100_000);
  assert.equal(normalizeBatteryCapacity(true, "1.5"), undefined);
});

test("known registration and active-day/full-registry states stay blocked", () => {
  assert.match(getRegistrationReadiness({ ...baseReadiness, house: { ...baseReadiness.house, exists: true } }).reason, /already registered/i);
  assert.match(getRegistrationReadiness({ ...baseReadiness, dayActive: true }).reason, /active/i);
  assert.match(getRegistrationReadiness({ ...baseReadiness, houseCount: 16 }).reason, /full/i);
});

test("registration verification accepts only the expected market/account event", () => {
  const account = "0x0000000000000000000000000000000000000011" as const;
  const market = "0x0000000000000000000000000000000000000033" as const;
  const topics = encodeEventTopics({ abi: HOUSE_REGISTERED_EVENT_ABI, eventName: "HouseRegistered", args: { house: account } });
  const data = encodeAbiParameters([{ type: "bool" }, { type: "bool" }, { type: "uint32" }], [true, true, 750]);
  const event = findHouseRegisteredEvent([{ address: market, data, topics: topics as unknown as readonly string[] }], market, account);
  assert.deepEqual(event, { house: account, hasSolar: true, hasBattery: true, batteryCapacityWh: 750 });
  assert.equal(findHouseRegisteredEvent([{ address: "0x0000000000000000000000000000000000000044", data, topics: topics as unknown as readonly string[] }], market, account), undefined);
});

test("wallet error mapping distinguishes denial, revert and unknown receipt recovery", () => {
  assert.equal(describeWalletError(new Error("User rejected the request")).kind, "user-denied");
  assert.equal(describeWalletError(new Error("execution reverted: TreasuryCannotBeHouse")).kind, "treasury");
  assert.equal(describeWalletError(new Error("RPC timeout while waiting for receipt")).kind, "rpc-unavailable");
  assert.equal(receiptWasSuccessful({ status: "success" }), true);
  assert.equal(receiptWasSuccessful({ status: "reverted" }), false);
});

test("unknown receipt preserves the original hash and never resubmits", async () => {
  const hash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
  let verificationCalls = 0;
  const result = await reconcileReceipt(hash, async () => { throw new Error("RPC timeout"); }, async () => { verificationCalls += 1; });
  assert.equal(result.stage, "unknown");
  assert.equal(result.hash, hash);
  assert.equal(verificationCalls, 0);
});

test("receipt reconciliation rejects reverted status and duplicate action stages are in flight", async () => {
  const hash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
  const result = await reconcileReceipt(hash, async () => ({ status: "reverted" as const }), async () => { throw new Error("must not verify reverted receipt"); });
  assert.equal(result.stage, "reverted");
  assert.equal(transactionIsInFlight("wallet"), true);
  assert.equal(transactionIsInFlight("receipt"), true);
  assert.equal(transactionIsInFlight("confirmed"), false);
});

test("an incomplete receipt status is unknown rather than treated as a revert", async () => {
  const hash = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
  const result = await reconcileReceipt(hash, async () => ({}), async () => undefined);
  assert.equal(result.stage, "unknown");
  assert.equal(result.hash, hash);
});
