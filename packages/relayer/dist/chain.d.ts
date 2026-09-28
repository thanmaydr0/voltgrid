import { Contract, Interface, JsonRpcProvider } from "ethers";
import type { Address, ChainReceipt, DecodedEvent, Discharge, EventPage, OnChainDay, OnChainHouse, Reading, RelayerConfig, SubmittedTransaction } from "./types";
export type ReconciledAction = Readonly<{
    receipt: ChainReceipt;
    events: readonly DecodedEvent[];
}>;
export interface ChainClient {
    readonly marketAddress: Address;
    getChainId(): Promise<number>;
    getRegisteredHouses(): Promise<readonly OnChainHouse[]>;
    getTreasuryBalance(): Promise<bigint>;
    getCurrentDay(): Promise<OnChainDay>;
    isDayIdUsed(dayId: string): Promise<boolean>;
    sendStartDay(dayId: string, inputDigest: string, modelVersion: number): Promise<SubmittedTransaction>;
    sendSettleEpoch(dayId: string, epochIndex: number, readings: readonly Reading[]): Promise<SubmittedTransaction>;
    sendDeclareEmergency(dayId: string, epochIndex: number, targetWh: number, tariffMicro: number): Promise<SubmittedTransaction>;
    sendReportDischarge(dayId: string, epochIndex: number, discharges: readonly Discharge[]): Promise<SubmittedTransaction>;
    sendResolveEmergency(dayId: string, epochIndex: number): Promise<SubmittedTransaction>;
    sendCloseDay(dayId: string): Promise<SubmittedTransaction>;
    getReceipt(txHash: string): Promise<ChainReceipt | null>;
    decodeReceipt(receipt: ChainReceipt): readonly DecodedEvent[];
    reconcileAction(action: "start" | "settle" | "declareEmergency" | "reportDischarge" | "resolveEmergency" | "closeDay", dayId: string, epochIndex: number): Promise<ReconciledAction | null>;
    listEvents(cursor: string | undefined, limit: number): Promise<EventPage>;
}
export declare class EthersChainClient implements ChainClient {
    private readonly config;
    readonly marketAddress: Address;
    readonly provider: JsonRpcProvider;
    readonly market: Contract;
    readonly iface: Interface;
    private readonly wallet;
    constructor(config: RelayerConfig);
    getChainId(): Promise<number>;
    getRegisteredHouses(): Promise<readonly OnChainHouse[]>;
    getTreasuryBalance(): Promise<bigint>;
    getCurrentDay(): Promise<OnChainDay>;
    isDayIdUsed(dayId: string): Promise<boolean>;
    private latestBlockNumber;
    private send;
    sendStartDay(dayId: string, inputDigest: string, modelVersion: number): Promise<SubmittedTransaction>;
    sendSettleEpoch(dayId: string, epochIndex: number, readings: readonly Reading[]): Promise<SubmittedTransaction>;
    sendDeclareEmergency(dayId: string, epochIndex: number, targetWh: number, tariffMicro: number): Promise<SubmittedTransaction>;
    sendReportDischarge(dayId: string, epochIndex: number, discharges: readonly Discharge[]): Promise<SubmittedTransaction>;
    sendResolveEmergency(dayId: string, epochIndex: number): Promise<SubmittedTransaction>;
    sendCloseDay(dayId: string): Promise<SubmittedTransaction>;
    getReceipt(txHash: string): Promise<ChainReceipt | null>;
    decodeReceipt(receipt: ChainReceipt): readonly DecodedEvent[];
    reconcileAction(action: "start" | "settle" | "declareEmergency" | "reportDischarge" | "resolveEmergency" | "closeDay", dayId: string, epochIndex: number): Promise<ReconciledAction | null>;
    listEvents(cursor: string | undefined, limit: number): Promise<EventPage>;
}
export declare function eventMetrics(events: readonly DecodedEvent[], name: "EpochSettled" | "EmergencyDeclared" | "EmergencyReportRecorded" | "EmergencyResolved" | "DayClosed"): Record<string, unknown> | undefined;
export declare function eventNames(events: readonly DecodedEvent[]): readonly string[];
export declare function digestInput(value: unknown): string;
