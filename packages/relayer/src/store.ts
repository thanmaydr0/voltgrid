import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { DayId, DayRecord, StoredAction, StoredRequest, StoreState } from "./types";

const EMPTY_STATE: StoreState = Object.freeze({ schemaVersion: 1, days: {}, actions: {}, requests: {} });

class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const prior = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try { return await operation(); } finally { release(); }
  }
}

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

abstract class BaseStore implements RunStore {
  protected state: StoreState = EMPTY_STATE;
  private readonly mutex = new AsyncMutex();

  async init(): Promise<void> { return; }
  async lock<T>(operation: () => Promise<T>): Promise<T> { return this.mutex.run(operation); }
  snapshot(): StoreState { return this.state; }

  protected abstract persist(): Promise<void>;

  async saveDay(day: DayRecord): Promise<void> {
    this.state = Object.freeze({ ...this.state, days: Object.freeze({ ...this.state.days, [day.dayId]: day }) });
    await this.persist();
  }

  async saveAction(action: StoredAction): Promise<void> {
    this.state = Object.freeze({ ...this.state, actions: Object.freeze({ ...this.state.actions, [action.key]: action }) });
    await this.persist();
  }

  async saveRequest(request: StoredRequest): Promise<void> {
    this.state = Object.freeze({ ...this.state, requests: Object.freeze({ ...this.state.requests, [request.clientRequestId]: request }) });
    await this.persist();
  }

  async deleteDay(dayId: DayId): Promise<void> {
    const days = { ...this.state.days };
    delete days[dayId];
    const actions = { ...this.state.actions };
    for (const [key, action] of Object.entries(actions)) if (action.dayId === dayId) delete actions[key];
    this.state = Object.freeze({ ...this.state, days: Object.freeze(days), actions: Object.freeze(actions) });
    await this.persist();
  }

  async clearEphemeral(): Promise<void> { return; }

  async resetDurable(): Promise<void> {
    const active = Object.values(this.state.days).some((day) => day.status === "active" || day.status === "starting");
    if (active) throw new Error("cannot reset while a day is active");
    this.state = EMPTY_STATE;
    await this.persist();
  }
}

export class JsonRunStore extends BaseStore {
  constructor(private readonly filePath: string) { super(); }

  override async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoreState;
      if (parsed.schemaVersion !== 1 || !parsed.days || !parsed.actions || !parsed.requests) throw new Error("invalid store schema");
      this.state = Object.freeze(parsed);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined;
      if (code !== "ENOENT") throw error;
      this.state = EMPTY_STATE;
      await this.persist();
    }
  }

  protected async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(this.state, null, 2) + "\n", { mode: 0o600 });
    await fs.rename(temporary, this.filePath);
  }
}

export class MemoryRunStore extends BaseStore {
  protected async persist(): Promise<void> { return; }
}
