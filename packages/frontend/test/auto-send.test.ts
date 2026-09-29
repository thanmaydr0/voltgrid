import assert from "node:assert/strict";
import { test } from "node:test";
import { planAutoSend, type AutoSendPolicy, type AutoSendReading } from "../lib/auto-send";

const policy: AutoSendPolicy = {
  minimumSupplierSurplusWh: 500,
  minimumNeighbourNeedWh: 300,
  reserveWh: 200,
  maximumTransferWh: 1_000,
  priceMicroVltPerKwh: 5_000_000,
};

const supplier: AutoSendReading = {
  address: "0x0000000000000000000000000000000000000001",
  generationWh: 2_000,
  consumptionWh: 500,
};

test("auto-send preserves supplier reserve and selects the largest neighbour need", () => {
  const plan = planAutoSend(supplier, [
    { address: "0x0000000000000000000000000000000000000002", generationWh: 100, consumptionWh: 700 },
    { address: "0x0000000000000000000000000000000000000003", generationWh: 0, consumptionWh: 1_800 },
  ], policy);

  assert.equal(plan.supplierSurplusWh, 1_500);
  assert.equal(plan.selected?.recipient, "0x0000000000000000000000000000000000000003");
  assert.equal(plan.selected?.transferableWh, 1_000);
  assert.equal(plan.selected?.amountMicroVlt, 5_000_000);
});

test("auto-send returns no candidate when supplier surplus is below the threshold", () => {
  const plan = planAutoSend({ ...supplier, generationWh: 800 }, [], policy);
  assert.equal(plan.supplierSurplusWh, 300);
  assert.equal(plan.selected, null);
});

test("auto-send filters neighbours below the need threshold", () => {
  const plan = planAutoSend(supplier, [
    { address: "0x0000000000000000000000000000000000000002", generationWh: 100, consumptionWh: 300 },
  ], policy);
  assert.equal(plan.candidates.length, 0);
  assert.equal(plan.selected, null);
});
