import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Interface, Wallet } from "ethers";
import { test } from "node:test";
import { AuthManager } from "../src/auth";
import { MARKET_ABI } from "../src/abi";
import { EthersChainClient, type ChainClient, type ReconciledAction } from "../src/chain";
import { loadConfig } from "../src/config";
import { HttpError } from "../src/errors";
import { type HttpRequest, type HttpResponse, RelayerHttpRouter } from "../src/http";
import { RelayerService } from "../src/service";
import { JsonRunStore, MemoryRunStore } from "../src/store";
import type {
  Address,
  ChainReceipt,
  DecodedEvent,
  Discharge,
  EventPage,
  OnChainDay,
  OnChainHouse,
  Reading,
  RelayerConfig,
  SubmittedTransaction,
} from "../src/types";

const ORIGIN = "http://localhost:3000";
const MARKET = "0x0000000000000000000000000000000000001000" as Address;
const UUID = (number: number) => `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;

test("production requires a positive chain ID and probes the RPC instead of trusting static network config", async () => {
  const env = {
    RELAYER_MODE: "production",
    MST_RPC_URL: "http://127.0.0.1:8545",
    MARKET_ADDRESS: MARKET,
    ORACLE_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    RELAYER_ALLOWED_ORIGINS: ORIGIN,
    RELAYER_ADMIN_SECRET: "admin-test-secret",
    RELAYER_AUTH_SECRET: "auth-test-secret",
  };
  assert.throws(() => loadConfig(env), /MST_CHAIN_ID/);
  assert.throws(() => loadConfig({ ...env, MST_CHAIN_ID: "0" }), /MST_CHAIN_ID/);
  const configured = loadConfig({ ...env, MST_CHAIN_ID: "91562037" });
  const chain = new EthersChainClient(configured);
  Object.defineProperty(chain.provider, "send", { value: async (method: string) => {
    assert.equal(method, "eth_chainId");
    return "0x1";
  } });
  assert.equal(await chain.getChainId(), 1);
});

function config(overrides: Partial<RelayerConfig> = {}): RelayerConfig {
  return Object.freeze({
    mode: "local",
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 31337,
    marketAddress: MARKET,
    oraclePrivateKey: `0x${"11".repeat(32)}`,
    dataPath: join(tmpdir(), "voltgrid-relayer-test.json"),
    allowedOrigins: [ORIGIN],
    adminSecret: "admin-test-secret",
    authSecret: "auth-test-secret",
    transformerCapacityWh: 100_000,
    emergencyTariffMicro: 7_500_000,
    trustProxy: false,
    requireOrigin: false,
    maxBodyBytes: 65_536,
    sessionTtlMs: 900_000,
    receiptTimeoutMs: 80,
    receiptPollMs: 10,
    eventLookbackBlocks: 100,
    maxActionsPerSession: 40,
    maxActionsPerIp: 80,
    maxAuthPerIp: 20,
    ...overrides,
  });
}

class FakeChain implements ChainClient {
  readonly marketAddress = MARKET;
  readonly iface = new Interface(MARKET_ABI);
  readonly sent: string[] = [];
  readonly receipts = new Map<string, ChainReceipt>();
  readonly used = new Set<string>();
  chainId = 31337;
  treasuryBalance = 1_000_000_000_000_000_000_000n;
  batteriesOptedIn = false;
  private emergencyTargets = new Map<number, number>();
  timeoutAction: "settle" | "start" | undefined;
  revertAction: "settle" | undefined;
  private sequence = 0;
  private active = false;
  private nextEpoch = 0;

  async getChainId(): Promise<number> { return this.chainId; }

  async getRegisteredHouses(): Promise<readonly OnChainHouse[]> {
    return Object.freeze(Array.from({ length: 8 }, (_, index) => Object.freeze({
      address: `0x${(0x2000 + index).toString(16).padStart(40, "0")}` as Address,
      hasSolar: index < 4,
      hasBattery: index < 3,
      batteryCapacityWh: index < 3 ? 6_000 : 0,
      batteryOptedIn: this.batteriesOptedIn,
      registrationIndex: index,
    })));
  }

  async getTreasuryBalance(): Promise<bigint> { return this.treasuryBalance; }

  async getCurrentDay(): Promise<OnChainDay> {
    return Object.freeze({
      active: this.active,
      id: (this.active ? [...this.used][this.used.size - 1] : `0x${"00".repeat(32)}`) as `0x${string}`,
      inputDigest: `0x${"00".repeat(32)}`,
      modelVersion: 1,
      nextEpoch: this.nextEpoch,
      emergencyActive: false,
      emergencyReported: false,
      emergencyTargetWh: 0,
      emergencyTariffMicro: 0,
    });
  }

  async isDayIdUsed(dayId: string): Promise<boolean> { return this.used.has(dayId.toLowerCase()); }

  private eventReceipt(name: string, args: readonly unknown[], status = 1, extra: readonly Readonly<{ name: string; args: readonly unknown[] }>[] = []): SubmittedTransaction {
    const hash = `0x${(this.sequence + 1).toString(16).padStart(64, "0")}`;
    this.sequence += 1;
    const fragment = this.iface.getEvent(name);
    if (!fragment) throw new Error(`missing fake event ${name}`);
    const encodedLogs = [
      ...extra.map((item) => {
        const extraFragment = this.iface.getEvent(item.name);
        if (!extraFragment) throw new Error(`missing fake event ${item.name}`);
        return this.iface.encodeEventLog(extraFragment, item.args);
      }),
      this.iface.encodeEventLog(fragment, args),
    ];
    const receipt: ChainReceipt = Object.freeze({
      hash,
      status,
      blockNumber: this.sequence,
      logs: Object.freeze(encodedLogs.map((encoded, index) => Object.freeze({ address: MARKET, topics: Object.freeze([...encoded.topics]), data: encoded.data, index }))),
    });
    this.receipts.set(hash, receipt);
    return Object.freeze({ hash, nonce: this.sequence - 1 });
  }

  async sendStartDay(dayId: string, inputDigest: string, modelVersion: number): Promise<SubmittedTransaction> {
    this.sent.push("start");
    if (this.timeoutAction === "start") return Object.freeze({ hash: `0x${"aa".repeat(32)}`, nonce: this.sequence++ });
    const submitted = this.eventReceipt("DayStarted", [dayId, inputDigest, modelVersion]);
    if (this.receipts.has(submitted.hash)) { this.active = true; this.used.add(dayId.toLowerCase()); }
    return submitted;
  }

  async sendSettleEpoch(dayId: string, epochIndex: number, readings: readonly Reading[]): Promise<SubmittedTransaction> {
    this.sent.push(`settle:${epochIndex}`);
    if (this.timeoutAction === "settle") return Object.freeze({ hash: `0x${"bb".repeat(32)}`, nonce: this.sequence++ });
    const totalSurplus = readings.reduce((sum, reading) => sum + Math.max(reading.generationWh - reading.consumptionWh, 0), 0);
    const totalDeficit = readings.reduce((sum, reading) => sum + Math.max(reading.consumptionWh - reading.generationWh, 0), 0);
    const submitted = this.eventReceipt("EpochSettled", [dayId, epochIndex, totalSurplus && totalDeficit ? 5_000_000 : 0, Math.min(totalSurplus, totalDeficit), totalSurplus > totalDeficit ? totalSurplus - totalDeficit : 0, totalDeficit > totalSurplus ? totalDeficit - totalSurplus : 0, "0"], this.revertAction === "settle" ? 0 : 1);
    return submitted;
  }

  async sendDeclareEmergency(dayId: string, epochIndex: number, targetWh: number, tariffMicro: number): Promise<SubmittedTransaction> {
    this.sent.push(`declare:${epochIndex}`);
    this.emergencyTargets.set(epochIndex, targetWh);
    return this.eventReceipt("EmergencyDeclared", [dayId, epochIndex, targetWh, tariffMicro]);
  }

  async sendReportDischarge(_dayId: string, epochIndex: number, _discharges: readonly Discharge[]): Promise<SubmittedTransaction> {
    this.sent.push(`report:${epochIndex}`);
    return this.eventReceipt("EmergencyReportRecorded", [_dayId, epochIndex, 0, "0", 0]);
  }

  async sendResolveEmergency(dayId: string, epochIndex: number): Promise<SubmittedTransaction> {
    this.sent.push(`resolve:${epochIndex}`);
    return this.eventReceipt("EmergencyResolved", [dayId, epochIndex, this.emergencyTargets.get(epochIndex) ?? 1, 0, "0"]);
  }

  async sendCloseDay(dayId: string): Promise<SubmittedTransaction> {
    this.sent.push("close");
    const result = this.eventReceipt("DayClosed", [dayId], 1, [{ name: "CarbonFactorApplied", args: [dayId, 700, 1] }]);
    this.active = false;
    return result;
  }

  async getReceipt(txHash: string): Promise<ChainReceipt | null> { return this.receipts.get(txHash) || null; }

  decodeReceipt(receipt: ChainReceipt): readonly DecodedEvent[] {
    return Object.freeze(receipt.logs.flatMap((log) => {
      const parsed = this.iface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed) return [];
      const args: Record<string, string | number | boolean> = {};
      parsed.fragment.inputs.forEach((input, index) => {
        const value = parsed.args[index] as unknown;
        args[input.name] = typeof value === "bigint" ? value.toString() : value as string | number | boolean;
      });
      return [Object.freeze({ name: parsed.name, args: Object.freeze(args), transactionHash: receipt.hash, blockNumber: receipt.blockNumber, logIndex: log.index, address: MARKET })];
    }));
  }

  async reconcileAction(action: "start" | "settle" | "declareEmergency" | "reportDischarge" | "resolveEmergency" | "closeDay", _dayId: string, _epochIndex: number): Promise<ReconciledAction | null> {
    const event = action === "start" ? "DayStarted" : action === "settle" ? "EpochSettled" : action === "declareEmergency" ? "EmergencyDeclared" : action === "reportDischarge" ? "EmergencyReportRecorded" : action === "resolveEmergency" ? "EmergencyResolved" : "DayClosed";
    for (const receipt of this.receipts.values()) {
      const events = this.decodeReceipt(receipt);
      if (events.some((item) => item.name === event)) return Object.freeze({ receipt, events });
    }
    return null;
  }

  async listEvents(_cursor: string | undefined, _limit: number): Promise<EventPage> { return Object.freeze({ events: Object.freeze([]) }); }
}

function request(method: string, pathname: string, body: unknown, token?: string, ip = "127.0.0.1"): HttpRequest {
  return Object.freeze({
    method,
    pathname,
    query: new URLSearchParams(),
    headers: Object.freeze({ origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}) }),
    body,
    ip,
  });
}

async function makeService(fake = new FakeChain(), overrides: Partial<RelayerConfig> = {}) {
  const runtimeConfig = config(overrides);
  const store = new MemoryRunStore();
  const auth = new AuthManager(runtimeConfig);
  const service = new RelayerService(runtimeConfig, fake, store, auth);
  await service.init();
  return { fake, store, auth, service, router: new RelayerHttpRouter(service, runtimeConfig) };
}

type SigningWallet = Readonly<{ address: string; signMessage(message: string): Promise<string> }>;

async function authenticate(router: RelayerHttpRouter, wallet: SigningWallet, ip = "127.0.0.1"): Promise<string> {
  const challengeResponse = await router.dispatch(request("POST", "/v1/auth/challenge", { address: wallet.address }, undefined, ip));
  assert.equal(challengeResponse.status, 200);
  const challenge = challengeResponse.body as { message: string };
  const signature = await wallet.signMessage(challenge.message);
  const verifyResponse = await router.dispatch(request("POST", "/v1/auth/verify", { address: wallet.address, message: challenge.message, signature }, undefined, ip));
  assert.equal(verifyResponse.status, 200);
  return (verifyResponse.body as { accessToken: string }).accessToken;
}

test("valid authenticated day sequence confirms 24 receipt-derived normal outcomes", async () => {
  const { fake, router } = await makeService();
  const wallet = Wallet.createRandom();
  const token = await authenticate(router, wallet);
  const created = await router.dispatch(request("POST", "/v1/days", { clientRunId: UUID(1), scenario: "sunny", seed: "sequence", viewerEvCharging: false }, token));
  assert.equal(created.status, 201);
  const dayId = (created.body as { dayId: string }).dayId;
  for (let epoch = 0; epoch < 24; epoch += 1) {
    const result = await router.dispatch(request("POST", `/v1/days/${dayId}/epochs/${epoch}/advance`, { clientRequestId: UUID(epoch + 2) }, token));
    assert.equal(result.status, 200);
    const outcome = result.body as { status: string; kind: string; metrics?: { matchedWh?: number } };
    assert.equal(outcome.status, "confirmed");
    assert.equal(outcome.kind, "normal");
    assert.equal(typeof outcome.metrics?.matchedWh, "number");
  }
  assert.equal(fake.sent.filter((entry) => entry.startsWith("settle:")).length, 24);
});

test("heatwave emergencies resolve honestly when users decline or treasury lacks funds", async () => {
  for (const scenario of [
    { optedIn: false, treasuryBalance: 1_000_000_000_000_000_000_000n, expected: "no-opted-in-battery" as const, base: 650 },
    { optedIn: true, treasuryBalance: 0n, expected: "treasury-underfunded" as const, base: 700 },
  ]) {
    const fake = new FakeChain();
    fake.batteriesOptedIn = scenario.optedIn;
    fake.treasuryBalance = scenario.treasuryBalance;
    // Force the first modelled hour to the emergency path so the underfunded
    // branch is evaluated while the seeded batteries still have initial SoC.
    const { router } = await makeService(fake, { transformerCapacityWh: 1_000 });
    const token = await authenticate(router, Wallet.createRandom());
    const created = await router.dispatch(request("POST", "/v1/days", {
      clientRunId: UUID(scenario.base), scenario: "heatwave", seed: `fallback-${scenario.base}`, viewerEvCharging: false,
    }, token));
    const dayId = (created.body as { dayId: string }).dayId;
    let observedEmergency = false;
    for (let epoch = 0; epoch < 24; epoch += 1) {
      const response = await router.dispatch(request("POST", `/v1/days/${dayId}/epochs/${epoch}/advance`, { clientRequestId: UUID(scenario.base + epoch + 1) }, token));
      const outcome = response.body as { status: string; kind: string; fallbackReason?: string; metrics?: { shavedWh?: number; payoutWei?: string; discharges?: readonly unknown[] } };
      assert.equal(outcome.status, "confirmed");
      if (outcome.kind !== "emergency") continue;
      observedEmergency = true;
      assert.equal(outcome.fallbackReason, scenario.expected);
      assert.equal(outcome.metrics?.shavedWh, 0);
      assert.equal(outcome.metrics?.payoutWei, "0");
      assert.deepEqual(outcome.metrics?.discharges, []);
      break;
    }
    assert.ok(observedEmergency, "heatwave fixture should exercise the fallback path");
  }
});

test("duplicate and concurrent advance calls do not submit a second transaction", async () => {
  const { fake, router } = await makeService();
  const token = await authenticate(router, Wallet.createRandom());
  const created = await router.dispatch(request("POST", "/v1/days", { clientRunId: UUID(20), scenario: "sunny", seed: "duplicate", viewerEvCharging: false }, token));
  const dayId = (created.body as { dayId: string }).dayId;
  const concurrent = await Promise.all([
    router.dispatch(request("POST", `/v1/days/${dayId}/epochs/0/advance`, { clientRequestId: UUID(21) }, token)),
    router.dispatch(request("POST", `/v1/days/${dayId}/epochs/0/advance`, { clientRequestId: UUID(21) }, token)),
  ]);
  assert.equal(concurrent[0].status, 200);
  assert.equal(concurrent[1].status, 200);
  assert.equal(fake.sent.filter((entry) => entry === "settle:0").length, 1);
  const duplicate = await router.dispatch(request("POST", `/v1/days/${dayId}/epochs/0/advance`, { clientRequestId: UUID(22) }, token));
  assert.equal(duplicate.status, 200);
  assert.equal(fake.sent.filter((entry) => entry === "settle:0").length, 1);
});

test("out-of-order, forged readings, and unauthenticated calls are rejected", async () => {
  const { router } = await makeService();
  const noAuth = await router.dispatch(request("POST", "/v1/days", { clientRunId: UUID(30), scenario: "sunny", seed: "x", viewerEvCharging: false }));
  assert.equal(noAuth.status, 401);
  const token = await authenticate(router, Wallet.createRandom());
  const created = await router.dispatch(request("POST", "/v1/days", { clientRunId: UUID(31), scenario: "sunny", seed: "x", viewerEvCharging: false }, token));
  const dayId = (created.body as { dayId: string }).dayId;
  const forged = await router.dispatch(request("POST", `/v1/days/${dayId}/epochs/0/advance`, { clientRequestId: UUID(32), readings: [{ house: "0x0000000000000000000000000000000000000001", generationWh: 1, consumptionWh: 1 }] }, token));
  assert.equal(forged.status, 400);
  const outOfOrder = await router.dispatch(request("POST", `/v1/days/${dayId}/epochs/2/advance`, { clientRequestId: UUID(33) }, token));
  assert.equal(outOfOrder.status, 409);
  assert.equal((outOfOrder.body as { code: string }).code, "OUT_OF_ORDER");
});

test("quota exhaustion and wrong-chain configuration fail closed", async () => {
  const { router } = await makeService(new FakeChain(), { maxActionsPerSession: 1 });
  const token = await authenticate(router, Wallet.createRandom());
  const created = await router.dispatch(request("POST", "/v1/days", { clientRunId: UUID(40), scenario: "sunny", seed: "quota", viewerEvCharging: false }, token));
  const dayId = (created.body as { dayId: string }).dayId;
  const exhausted = await router.dispatch(request("POST", `/v1/days/${dayId}/epochs/0/advance`, { clientRequestId: UUID(41) }, token));
  assert.equal(exhausted.status, 429);

  const wrongChain = new FakeChain();
  wrongChain.chainId = 1;
  const wrongConfig = config();
  const wrongStore = new MemoryRunStore();
  const wrongAuth = new AuthManager(wrongConfig);
  const wrongService = new RelayerService(wrongConfig, wrongChain, wrongStore, wrongAuth);
  const wrongRouter = new RelayerHttpRouter(wrongService, wrongConfig);
  const health = await wrongRouter.dispatch(request("GET", "/healthz", undefined));
  assert.equal(health.status, 409);
  assert.equal((health.body as { code: string }).code, "WRONG_CHAIN");
});

test("RPC timeout becomes unknown and a reverted receipt becomes reverted without retry", async () => {
  const timeoutChain = new FakeChain();
  timeoutChain.timeoutAction = "settle";
  const timeoutService = await makeService(timeoutChain, { receiptTimeoutMs: 50, receiptPollMs: 10 });
  const timeoutToken = await authenticate(timeoutService.router, Wallet.createRandom());
  const timeoutDay = await timeoutService.router.dispatch(request("POST", "/v1/days", { clientRunId: UUID(50), scenario: "sunny", seed: "timeout", viewerEvCharging: false }, timeoutToken));
  const timeoutId = (timeoutDay.body as { dayId: string }).dayId;
  const unknown = await timeoutService.router.dispatch(request("POST", `/v1/days/${timeoutId}/epochs/0/advance`, { clientRequestId: UUID(51) }, timeoutToken));
  assert.equal(unknown.status, 202);
  assert.equal((unknown.body as { status: string }).status, "unknown");
  const retry = await timeoutService.router.dispatch(request("POST", `/v1/days/${timeoutId}/epochs/0/advance`, { clientRequestId: UUID(52) }, timeoutToken));
  assert.equal((retry.body as { status: string }).status, "unknown");
  assert.equal(timeoutChain.sent.filter((entry) => entry === "settle:0").length, 1);

  const revertChain = new FakeChain();
  revertChain.revertAction = "settle";
  const revertService = await makeService(revertChain);
  const revertToken = await authenticate(revertService.router, Wallet.createRandom());
  const revertDay = await revertService.router.dispatch(request("POST", "/v1/days", { clientRunId: UUID(60), scenario: "sunny", seed: "revert", viewerEvCharging: false }, revertToken));
  const revertId = (revertDay.body as { dayId: string }).dayId;
  const reverted = await revertService.router.dispatch(request("POST", `/v1/days/${revertId}/epochs/0/advance`, { clientRequestId: UUID(61) }, revertToken));
  assert.equal(reverted.status, 409);
  assert.equal((reverted.body as { status: string }).status, "reverted");
});

test("durable restart recovery reconciles a mined receipt without sending twice", async () => {
  const directory = await mkdtemp(join(tmpdir(), "voltgrid-relayer-restart-"));
  const path = join(directory, "state.json");
  try {
    const fake = new FakeChain();
    const firstConfig = config({ dataPath: path });
    const firstStore = new JsonRunStore(path);
    const firstAuth = new AuthManager(firstConfig);
    const first = new RelayerService(firstConfig, fake, firstStore, firstAuth);
    await first.init();
    const wallet = Wallet.createRandom();
    const context = { address: wallet.address as Address, token: "test", origin: ORIGIN, ip: "127.0.0.1" };
    const created = await first.createDay({ clientRunId: UUID(70), scenario: "sunny", seed: "restart", viewerEvCharging: false }, context);
    const day = created.day;
    const action = firstStore.snapshot().actions[`${day.dayId.toLowerCase()}|0|settle`];
    assert.equal(action, undefined);
    const simulated = await first.advance(day.dayId, 0, UUID(71), context);
    assert.equal(simulated.status, "confirmed");
    const stored = firstStore.snapshot().actions[`${day.dayId.toLowerCase()}|0|settle`];
    assert.ok(stored);
    await firstStore.saveAction(Object.freeze({ ...stored, status: "pending", updatedAt: Date.now() }));
    await firstStore.saveDay(Object.freeze({ ...day, status: "active", nextEpoch: 0 }));

    const secondStore = new JsonRunStore(path);
    const secondAuth = new AuthManager(firstConfig);
    const second = new RelayerService(firstConfig, fake, secondStore, secondAuth);
    await second.init();
    const recovered = await second.advance(day.dayId, 0, UUID(72), context);
    assert.equal(recovered.status, "confirmed");
    assert.equal(fake.sent.filter((entry) => entry === "settle:0").length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
