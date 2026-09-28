import type { DayId, DayRecord, StoredAction, StoredRequest, StoreState } from "./types";
export interface RunStore {
    init(): Promise<void>;
    lock<T>(operation: () => Promise<T>): Promise<T>;
    snapshot(): StoreState;
    saveDay(day: DayRecord): Promise<void>;
    saveAction(action: StoredAction): Promise<void>;
    saveRequest(request: StoredRequest): Promise<void>;
    deleteDay(dayId: DayId): Promise<void>;
    clearEphemeral(): Promise<void>;
    resetDurable(): Promise<void>;
}
declare abstract class BaseStore implements RunStore {
    protected state: StoreState;
    private readonly mutex;
    init(): Promise<void>;
    lock<T>(operation: () => Promise<T>): Promise<T>;
    snapshot(): StoreState;
    protected abstract persist(): Promise<void>;
    saveDay(day: DayRecord): Promise<void>;
    saveAction(action: StoredAction): Promise<void>;
    saveRequest(request: StoredRequest): Promise<void>;
    deleteDay(dayId: DayId): Promise<void>;
    clearEphemeral(): Promise<void>;
    resetDurable(): Promise<void>;
}
export declare class JsonRunStore extends BaseStore {
    private readonly filePath;
    constructor(filePath: string);
    init(): Promise<void>;
    protected persist(): Promise<void>;
}
export declare class MemoryRunStore extends BaseStore {
    protected persist(): Promise<void>;
}
export {};
