import type { Address } from "viem";

export type AutoSendReading = Readonly<{
  address: Address;
  generationWh: number;
  consumptionWh: number;
}>;

export type AutoSendPolicy = Readonly<{
  minimumSupplierSurplusWh: number;
  minimumNeighbourNeedWh: number;
  reserveWh: number;
  maximumTransferWh: number;
  priceMicroVltPerKwh: number;
}>;

export type AutoSendCandidate = Readonly<{
  recipient: Address;
  supplierSurplusWh: number;
  neighbourNeedWh: number;
  transferableWh: number;
  amountMicroVlt: number;
}>;

export type AutoSendPlan = Readonly<{
  supplierSurplusWh: number;
  candidates: readonly AutoSendCandidate[];
  selected: AutoSendCandidate | null;
}>;

function surplus(reading: AutoSendReading) {
  return Math.max(reading.generationWh - reading.consumptionWh, 0);
}

function need(reading: AutoSendReading) {
  return Math.max(reading.consumptionWh - reading.generationWh, 0);
}

/**
 * Selects the largest eligible neighbour need that the supplier can cover
 * while keeping its configured Wh reserve. The output is a proposal only;
 * the wallet still has to sign the eventual VLT transfer.
 */
export function planAutoSend(
  supplier: AutoSendReading,
  neighbours: readonly AutoSendReading[],
  policy: AutoSendPolicy,
): AutoSendPlan {
  const supplierSurplusWh = surplus(supplier);
  const availableWh = Math.max(supplierSurplusWh - policy.reserveWh, 0);
  if (
    supplierSurplusWh < policy.minimumSupplierSurplusWh ||
    availableWh <= 0 ||
    policy.maximumTransferWh <= 0 ||
    policy.priceMicroVltPerKwh <= 0
  ) {
    return { supplierSurplusWh, candidates: [], selected: null };
  }

  const candidates = neighbours
    .map((neighbour) => {
      const neighbourNeedWh = need(neighbour);
      const transferableWh = Math.min(availableWh, neighbourNeedWh, policy.maximumTransferWh);
      return {
        recipient: neighbour.address,
        supplierSurplusWh,
        neighbourNeedWh,
        transferableWh,
        // Wh × micro-VLT/kWh ÷ 1000 Wh/kWh = micro-VLT.
        amountMicroVlt: Math.floor((transferableWh * policy.priceMicroVltPerKwh) / 1000),
      };
    })
    .filter((candidate) => candidate.neighbourNeedWh >= policy.minimumNeighbourNeedWh && candidate.transferableWh > 0 && candidate.amountMicroVlt > 0)
    .sort((left, right) => right.neighbourNeedWh - left.neighbourNeedWh || right.transferableWh - left.transferableWh || left.recipient.localeCompare(right.recipient));

  return { supplierSurplusWh, candidates, selected: candidates[0] ?? null };
}
