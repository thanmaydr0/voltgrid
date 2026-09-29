import { decodeEventLog, type Address, type Hex } from "viem";

/** Exact bounds from VoltGridMarket.MAX_HOUSES and MAX_READING_WH. */
export const MAX_HOUSES = 16;
export const MAX_BATTERY_CAPACITY_WH = 100_000;

// The shared browser ABI is frozen without this event, so this exact fragment
// is sourced from packages/contracts/artifacts/contracts/VoltGridMarket.sol/
// VoltGridMarket.json and the P1 Solidity declaration. If a configured
// deployment omits HouseRegistered(address,bool,bool,uint32), this route fails
// closed at receipt verification instead of inventing a confirmation.
export const HOUSE_REGISTERED_EVENT_ABI = [
  {
    type: "event",
    name: "HouseRegistered",
    anonymous: false,
    inputs: [
      { indexed: true, name: "house", type: "address" },
      { indexed: false, name: "hasSolar", type: "bool" },
      { indexed: false, name: "hasBattery", type: "bool" },
      { indexed: false, name: "batteryCapacityWh", type: "uint32" },
    ],
  },
] as const;

export interface HouseDeclaration {
  readonly hasSolar: boolean;
  readonly hasBattery: boolean;
  readonly batteryCapacityWh: number;
}

export interface HouseSnapshot {
  readonly exists: boolean;
  readonly hasSolar: boolean;
  readonly hasBattery: boolean;
  readonly batteryCapacityWh: number;
  readonly batteryOptedIn: boolean;
  readonly registrationIndex: number;
}

/** Existing solar houses can issue a screening demo credential without re-registering. */
export function shouldShowExistingSolarHouseDemoMint(input: Readonly<{
  address?: string;
  house?: HouseSnapshot;
  hasScreeningDraft: boolean;
}>): boolean {
  return Boolean(input.address && input.house?.exists && input.house.hasSolar && input.hasScreeningDraft);
}

export interface DaySnapshot {
  readonly active: boolean;
  readonly id: string;
  readonly nextEpoch: number;
}

export interface ReceiptLogLike {
  readonly address: string;
  readonly data: string;
  readonly topics: readonly string[];
}

export interface RegistrationEvent {
  readonly house: Address;
  readonly hasSolar: boolean;
  readonly hasBattery: boolean;
  readonly batteryCapacityWh: number;
}

export function parseHouseSnapshot(data: unknown): HouseSnapshot | undefined {
  if (!Array.isArray(data) || data.length < 6) return undefined;
  const [exists, hasSolar, hasBattery, batteryCapacityWh, batteryOptedIn, registrationIndex] = data;
  if (typeof batteryCapacityWh !== "bigint" && typeof batteryCapacityWh !== "number") return undefined;
  if (typeof registrationIndex !== "bigint" && typeof registrationIndex !== "number") return undefined;
  return {
    exists: Boolean(exists),
    hasSolar: Boolean(hasSolar),
    hasBattery: Boolean(hasBattery),
    batteryCapacityWh: Number(batteryCapacityWh),
    batteryOptedIn: Boolean(batteryOptedIn),
    registrationIndex: Number(registrationIndex),
  };
}

export function parseDaySnapshot(data: unknown): DaySnapshot | undefined {
  if (!Array.isArray(data) || data.length < 5 || typeof data[1] !== "string") return undefined;
  const nextEpoch = data[4];
  if (typeof nextEpoch !== "bigint" && typeof nextEpoch !== "number") return undefined;
  return { active: Boolean(data[0]), id: data[1], nextEpoch: Number(nextEpoch) };
}

export function normalizeBatteryCapacity(hasBattery: boolean, value: string | number): number | undefined {
  if (!hasBattery) return 0;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return undefined;
  const capacity = Number(text);
  if (!Number.isSafeInteger(capacity) || capacity <= 0 || capacity > MAX_BATTERY_CAPACITY_WH) return undefined;
  return capacity;
}

export function validateDeclaration(declaration: HouseDeclaration): string | undefined {
  if (!declaration.hasBattery && declaration.batteryCapacityWh !== 0) {
    return "Battery capacity must be zero when battery is off.";
  }
  if (declaration.hasBattery && (declaration.batteryCapacityWh <= 0 || declaration.batteryCapacityWh > MAX_BATTERY_CAPACITY_WH || !Number.isInteger(declaration.batteryCapacityWh))) {
    return "Choose a positive integer capacity from 1 to 100,000 Wh when battery is on.";
  }
  return undefined;
}

export function declarationMatchesEvent(declaration: HouseDeclaration, event: RegistrationEvent, account: string): boolean {
  return event.house.toLowerCase() === account.toLowerCase()
    && event.hasSolar === declaration.hasSolar
    && event.hasBattery === declaration.hasBattery
    && event.batteryCapacityWh === declaration.batteryCapacityWh;
}

export function findHouseRegisteredEvent(
  logs: readonly ReceiptLogLike[],
  expectedMarket: string,
  expectedAccount: string,
): RegistrationEvent | undefined {
  for (const log of logs) {
    if (log.address.toLowerCase() !== expectedMarket.toLowerCase() || log.topics.length === 0) continue;
    try {
      const decoded = decodeEventLog({
        abi: HOUSE_REGISTERED_EVENT_ABI,
        data: log.data as Hex,
        topics: log.topics as unknown as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "HouseRegistered") continue;
      const args = decoded.args;
      if (args.house.toLowerCase() !== expectedAccount.toLowerCase()) continue;
      return {
        house: args.house,
        hasSolar: args.hasSolar,
        hasBattery: args.hasBattery,
        batteryCapacityWh: Number(args.batteryCapacityWh),
      };
    } catch {
      // Other logs and logs from an older ABI are intentionally ignored.
    }
  }
  return undefined;
}

export interface RegistrationReadinessInput {
  readonly isConnected: boolean;
  readonly address?: string;
  readonly chainId?: number;
  readonly expectedChainId: number;
  readonly marketConfigured: boolean;
  readonly marketReadKnown: boolean;
  readonly treasury?: string;
  readonly treasuryReadKnown: boolean;
  readonly dayReadKnown: boolean;
  readonly dayActive?: boolean;
  readonly houseReadKnown: boolean;
  readonly house?: HouseSnapshot;
  readonly capacityReadKnown: boolean;
  readonly houseCount?: number;
  readonly declarationValid: boolean;
}

export interface RegistrationReadiness {
  readonly canSign: boolean;
  readonly isTreasury: boolean;
  readonly reason: string;
}

export function getRegistrationReadiness(input: RegistrationReadinessInput): RegistrationReadiness {
  const isTreasury = Boolean(input.address && input.treasury && input.address.toLowerCase() === input.treasury.toLowerCase());
  if (!input.isConnected || !input.address) return { canSign: false, isTreasury, reason: "Connect the wallet that will own this household." };
  if (input.chainId !== input.expectedChainId) return { canSign: false, isTreasury, reason: `Switch to the configured chain (${input.expectedChainId}) before signing.` };
  if (!input.marketConfigured || !input.marketReadKnown) return { canSign: false, isTreasury, reason: "The configured market contract is not verified or its RPC read is unavailable." };
  if (!input.treasuryReadKnown || !input.dayReadKnown || !input.houseReadKnown || !input.capacityReadKnown) return { canSign: false, isTreasury, reason: "Waiting for all market reads. Unknown state is not treated as unregistered." };
  if (isTreasury) return { canSign: false, isTreasury, reason: "This account is the market treasury and cannot be a household. Connect a different wallet." };
  if (input.house?.exists) return { canSign: false, isTreasury, reason: "This wallet is already registered. Registration is append-only." };
  if (input.dayActive) return { canSign: false, isTreasury, reason: "Registration is locked while the current market day is active." };
  if (typeof input.houseCount === "number" && input.houseCount >= MAX_HOUSES) return { canSign: false, isTreasury, reason: "The market house registry is full." };
  if (!input.declarationValid) return { canSign: false, isTreasury, reason: "Finish the declaration with a valid battery capacity." };
  return { canSign: true, isTreasury, reason: "All readiness checks passed. Review the declaration before opening the wallet." };
}
