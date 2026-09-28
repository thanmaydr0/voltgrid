import { AuthManager } from "./auth";
import { type ChainClient } from "./chain";
import type { ActionStatus, AuthContext, ChainAction, CreateDayInput, DayRecord, EpochOutcome, RelayerConfig, DayId } from "./types";
import type { RunStore } from "./store";
export declare class RelayerService {
    readonly config: RelayerConfig;
    readonly chain: ChainClient;
    readonly store: RunStore;
    readonly auth: AuthManager;
    private readonly clock;
    private readonly submissions;
    private readonly inFlight;
    constructor(config: RelayerConfig, chain: ChainClient, store: RunStore, auth: AuthManager, clock?: () => number);
    init(): Promise<void>;
    assertChain(): Promise<void>;
    private getDay;
    private actionsFor;
    private outcome;
    private actionResult;
    private finishReconciled;
    private finishReceipt;
    private waitForAction;
    private runAction;
    private simulatedEpoch;
    createDay(raw: CreateDayInput, context: AuthContext): Promise<Readonly<{
        day: DayRecord;
        action: ChainAction;
    }>>;
    advance(dayIdValue: string, epochIndex: number, clientRequestIdValue: string, context: AuthContext): Promise<EpochOutcome>;
    getDayState(dayIdValue: string, context: AuthContext): Promise<Readonly<{
        day: DayRecord;
        outcomes: readonly EpochOutcome[];
        closeAction: ChainAction | null;
    }>>;
    getCurrentDay(context: AuthContext): Promise<Readonly<{
        day: DayRecord | null;
        outcomes: readonly EpochOutcome[];
        closeAction: ChainAction | null;
    }>>;
    getEpoch(dayIdValue: string, epochIndex: number, context: AuthContext): Promise<EpochOutcome>;
    closeDay(dayIdValue: string, clientRequestIdValue: string, context: AuthContext): Promise<Readonly<{
        dayId: DayId;
        status: ActionStatus;
        actions: readonly ChainAction[];
        closeAction: ChainAction;
    }>>;
    resetDemo(scope: "sessions" | "state", adminSecret: string | undefined): Promise<Readonly<{
        reset: string;
    }>>;
}
