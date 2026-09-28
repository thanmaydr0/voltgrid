import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { once } from "node:events";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContractFactory, JsonRpcProvider, NonceManager, Wallet, parseEther, getAddress } from "ethers";
import { test } from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { AuthManager } from "../src/auth";
import { EthersChainClient } from "../src/chain";
import { RelayerService } from "../src/service";
import { createNodeServer, RelayerHttpRouter } from "../src/http";
import { JsonRunStore } from "../src/store";
import type { Address, ChainAction, RelayerConfig } from "../src/types";
import { simCore } from "../src/simulator";

const runExecFile = promisify(execFile);
const ROOT = join(__dirname, "..", "..", "..");
const CONTRACTS = join(ROOT, "packages", "contracts");
const MARKET = "0x0000000000000000000000000000000000001000" as Address;
const ORACLE_KEY_PATTERN = /Private Key:\s*(0x[0-9a-fA-F]{64})/g;

function uuid(number: number): string {
  return `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
}

async function callApi(baseUrl: string, method: string, pathname: string, body?: unknown, token?: string) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      origin: "http://localhost:3000",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return Object.freeze({ status: response.status, body: await response.json() as unknown });
}

function runtimeConfig(path: string, marketAddress: Address, oraclePrivateKey: string, transformerCapacityWh = 100_000): RelayerConfig {
  return Object.freeze({
    mode: "local",
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 31337,
    marketAddress,
    oraclePrivateKey,
    dataPath: path,
    allowedOrigins: ["http://localhost:3000"],
    adminSecret: "local-integration-admin",
    authSecret: "local-integration-auth",
    transformerCapacityWh,
    emergencyTariffMicro: 7_500_000,
    trustProxy: false,
    requireOrigin: false,
    maxBodyBytes: 65_536,
    sessionTtlMs: 900_000,
    receiptTimeoutMs: 10_000,
    receiptPollMs: 50,
    eventLookbackBlocks: 10_000,
    maxActionsPerSession: 40,
    maxActionsPerIp: 80,
    maxAuthPerIp: 20,
  });
}

async function startHardhatNode(): Promise<{ process: ChildProcess; privateKeys: string[] }> {
  const cli = join(ROOT, "node_modules", "hardhat", "internal", "cli", "cli.js");
  const child = spawn(process.execPath, [cli, "node", "--hostname", "127.0.0.1"], { cwd: CONTRACTS, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  const started = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Hardhat node did not start in time")), 20_000);
    const inspect = () => {
      if (stdout.includes("Started HTTP and WebSocket JSON-RPC server") && [...stdout.matchAll(ORACLE_KEY_PATTERN)].length >= 2) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); inspect(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code) => {
      if (code !== null && code !== 0) { clearTimeout(timeout); reject(new Error(`Hardhat node exited with code ${code}`)); }
    });
  });
  await started;
  const privateKeys = [...stdout.matchAll(ORACLE_KEY_PATTERN)].map((match) => match[1]);
  if (privateKeys.length < 2) throw new Error("Hardhat node did not expose local test accounts");
  void stderr;
  return { process: child, privateKeys };
}

async function deployAndSeed(provider: JsonRpcProvider, privateKeys: readonly string[], batteryCapacityWh = 1_000, batteriesOptedIn = false): Promise<{ market: Address; certificate: Address; oracle: Wallet; marketContract: any; certificateContract: any; tokenContract: any; houses: string[]; treasury: string }> {
  const oracle = new Wallet(privateKeys[0], provider);
  const deployer = new NonceManager(oracle);
  const deployerAddress = await deployer.getAddress();
  // Keep the treasury separate from the eight registered household accounts.
  const treasurySigner = await provider.getSigner(9);
  const treasury = await treasurySigner.getAddress();
  const tokenArtifact = JSON.parse(await readFile(join(CONTRACTS, "artifacts", "contracts", "VoltToken.sol", "VoltToken.json"), "utf8")) as { abi: unknown[]; bytecode: string };
  const marketArtifact = JSON.parse(await readFile(join(CONTRACTS, "artifacts", "contracts", "VoltGridMarket.sol", "VoltGridMarket.json"), "utf8")) as { abi: unknown[]; bytecode: string };
  const certificateArtifact = JSON.parse(await readFile(join(CONTRACTS, "artifacts", "contracts", "CarbonCertificate.sol", "CarbonCertificate.json"), "utf8")) as { abi: unknown[]; bytecode: string };
  const token: any = await new ContractFactory(tokenArtifact.abi as any, tokenArtifact.bytecode, deployer).deploy(deployerAddress);
  await token.waitForDeployment();
  const market: any = await new ContractFactory(marketArtifact.abi as any, marketArtifact.bytecode, deployer).deploy(await token.getAddress(), treasury);
  await market.waitForDeployment();
  const certificate: any = await new ContractFactory(certificateArtifact.abi as any, certificateArtifact.bytecode, deployer).deploy(await market.getAddress());
  await certificate.waitForDeployment();
  await (await market.setCarbonCertificate(await certificate.getAddress())).wait();

  const houses: string[] = [];
  for (let index = 1; index <= 8; index += 1) houses.push(await (await provider.getSigner(index)).getAddress());
  for (let index = 0; index < houses.length; index += 1) {
    await (await market.registerHouseFor(houses[index], index % 2 === 0, index % 4 === 0, index % 4 === 0 ? batteryCapacityWh : 0)).wait();
    if (batteriesOptedIn && index % 4 === 0) {
      await (await market.connect(await provider.getSigner(index + 1)).setBatteryOptIn(true)).wait();
    }
  }
  const seedAmount = parseEther("1000");
  const treasuryAmount = parseEther("2000");
  await (await token.mint(deployerAddress, seedAmount * BigInt(houses.length) + treasuryAmount)).wait();
  await (await token.approve(await market.getAddress(), seedAmount * BigInt(houses.length) + treasuryAmount)).wait();
  for (const house of houses) await (await market.depositFor(house, seedAmount)).wait();
  await (await market.fundTreasury(treasuryAmount)).wait();
  return {
    market: getAddress(await market.getAddress()) as Address,
    certificate: getAddress(await certificate.getAddress()) as Address,
    oracle,
    marketContract: market,
    certificateContract: certificate,
    tokenContract: token,
    houses,
    treasury,
  };
}

async function assertCarbonClose(
  chain: EthersChainClient,
  marketContract: any,
  certificateContract: any,
  dayId: string,
  closeAction: ChainAction,
) {
  assert.equal(closeAction.status, "confirmed");
  assert.ok(closeAction.txHash);
  assert.ok(closeAction.blockNumber);
  assert.ok(closeAction.metrics && "certificates" in closeAction.metrics);
  const metrics = closeAction.metrics as {
    factorGPerKwh: number;
    factorVersion: number;
    totalEligibleWh: number;
    totalAvoidedMgCo2e: string;
    certificates: readonly { dayId: string; tokenId: string; solarSeller: string; eligibleWh: number; factorGPerKwh: number; factorVersion: number; avoidedMgCo2e: string; txHash: string; blockNumber: number }[];
  };
  const expected = new Map<string, number>();
  let matchedTotal = 0;
  let cursor: string | undefined;
  do {
    const page = await chain.listEvents(cursor, 100);
    for (const event of page.events) {
      if (String(event.args.dayId ?? "").toLowerCase() !== dayId.toLowerCase()) continue;
      if (event.name === "TradeSettled") {
        const seller = String(event.args.seller).toLowerCase();
        const wh = Number(event.args.wh);
        expected.set(seller, (expected.get(seller) ?? 0) + wh);
        matchedTotal += wh;
      }
    }
    cursor = page.nextCursor;
  } while (cursor);

  const actual = new Map(metrics.certificates.map((item) => [item.solarSeller.toLowerCase(), item.eligibleWh]));
  assert.deepEqual([...actual.entries()].sort(), [...expected.entries()].filter(([, wh]) => wh > 0).sort());
  assert.equal(metrics.totalEligibleWh, matchedTotal);
  assert.equal(metrics.factorGPerKwh, 700);
  assert.equal(metrics.factorVersion, 1);
  assert.equal(BigInt(metrics.totalAvoidedMgCo2e), BigInt(matchedTotal) * 700n);
  console.log(`P8 local carbon deployment chain=31337 market=${await marketContract.getAddress()} certificate=${await certificateContract.getAddress()} day=${dayId}`);
  const closeReceipt = await chain.getReceipt(closeAction.txHash);
  assert.equal(closeReceipt?.status, 1);
  const closeEvents = chain.decodeReceipt(closeReceipt!);
  const mintLogs = closeEvents.filter((item) => item.name === "CertificateMinted");
  assert.equal(mintLogs.length, metrics.certificates.length);
  for (const record of metrics.certificates) {
    assert.equal(record.dayId.toLowerCase(), dayId.toLowerCase());
    assert.equal(record.factorGPerKwh, 700);
    assert.equal(record.factorVersion, 1);
    assert.equal(record.avoidedMgCo2e, String(record.eligibleWh * 700));
    assert.equal(record.txHash, closeAction.txHash);
    assert.equal(record.blockNumber, Number(closeAction.blockNumber));
    assert.equal(Number(await marketContract.eligibleWh(dayId, record.solarSeller)), record.eligibleWh);
    assert.equal(await marketContract.certificateMintedForDay(dayId, record.solarSeller), true);
    assert.equal(await certificateContract.ownerOf(record.tokenId), record.solarSeller);
    const metadata = await certificateContract.certificateData(record.tokenId);
    assert.equal(metadata.dayId.toLowerCase(), dayId.toLowerCase());
    assert.equal(Number(metadata.eligibleWh), record.eligibleWh);
    assert.equal(Number(metadata.factorGPerKwh), record.factorGPerKwh);
    assert.equal(Number(metadata.factorVersion), record.factorVersion);
    assert.equal(metadata.avoidedMgCo2e, BigInt(record.avoidedMgCo2e));
    const uri = await certificateContract.tokenURI(record.tokenId) as string;
    const json = JSON.parse(Buffer.from(uri.slice("data:application/json;base64,".length), "base64").toString("utf8")) as { image: string; attributes: Array<{ trait_type: string; value: string | number }> };
    assert.ok(json.image.startsWith("data:image/svg+xml;base64,"));
    const svg = Buffer.from(json.image.slice("data:image/svg+xml;base64,".length), "base64").toString("utf8");
    assert.ok(svg.includes(`${record.eligibleWh} Wh eligible`));
    assert.ok(json.attributes.some((item) => item.trait_type === "factorVersion" && item.value === record.factorVersion));
    console.log(`P8 local receipt CertificateMinted day=${dayId} token=${record.tokenId} seller=${record.solarSeller} eligibleWh=${record.eligibleWh} factor=${record.factorGPerKwh} factorVersion=${record.factorVersion} avoidedMgCo2e=${record.avoidedMgCo2e} block=${record.blockNumber} tx=${record.txHash}`);
  }
  return metrics;
}

test("local Hardhat integration confirms full sunny and rainy days from true receipts", { timeout: 120_000 }, async () => {
  const node = await startHardhatNode();
  let provider: JsonRpcProvider | undefined;
  let directory: string | undefined;
  try {
    provider = new JsonRpcProvider("http://127.0.0.1:8545", 31337, { staticNetwork: true });
    const deployed = await deployAndSeed(provider, node.privateKeys);
    directory = await mkdtemp(join(tmpdir(), "voltgrid-relayer-local-"));
    const statePath = join(directory, "relayer.json");
    const config = runtimeConfig(statePath, deployed.market, node.privateKeys[0]);
    const chain = new EthersChainClient(config);
    const store = new JsonRunStore(statePath);
    const auth = new AuthManager(config);
    const service = new RelayerService(config, chain, store, auth);
    await service.init();
    const context = Object.freeze({ address: getAddress(deployed.oracle.address) as Address, token: "local-test", origin: "http://localhost:3000", ip: "127.0.0.1" });
    const initialLedger = await deployed.marketContract.totalInternalBalance();
    async function assertLedgerConservation(expectedTotal: bigint) {
      const houseLedgers = await Promise.all(deployed.houses.map((house) => deployed.marketContract.internalBalance(house)));
      const treasuryLedger = await deployed.marketContract.internalBalance(deployed.treasury);
      const custody = await deployed.tokenContract.balanceOf(deployed.market);
      assert.equal(houseLedgers.reduce((sum: bigint, value: bigint) => sum + value, 0n) + treasuryLedger, expectedTotal);
      assert.equal(custody, expectedTotal);
      assert.ok(treasuryLedger >= 0n);
      return { houseLedgers, treasuryLedger };
    }
    const created = await service.createDay({ clientRunId: uuid(1), scenario: "sunny", seed: "local-integration", viewerEvCharging: false }, context);
    assert.equal(created.action.status, "confirmed");
    assert.ok(created.action.txHash);

    for (let epoch = 0; epoch < 24; epoch += 1) {
      const outcome = await service.advance(created.day.dayId, epoch, uuid(epoch + 2), context);
      assert.equal(outcome.status, "confirmed");
      assert.equal(outcome.kind, "normal");
      assert.equal(outcome.actions.length, 1);
      assert.ok(outcome.actions[0].txHash);
      assert.ok(outcome.actions[0].blockNumber);
      assert.equal(outcome.actions[0].contractAddress?.toLowerCase(), deployed.market.toLowerCase());
      assert.equal(typeof outcome.metrics?.matchedWh, "number");
      if (epoch === 0) {
        const transaction: any = await provider.getTransaction(outcome.actions[0].txHash!);
        assert.ok(transaction?.data);
        const decoded: any = deployed.marketContract.interface.decodeFunctionData("settleEpoch", transaction.data);
        const expected = simCore.simulateEpoch({ modelVersion: 1, scenario: "sunny", seed: "local-integration", dayId: created.day.dayId, epochIndex: 0, houses: created.day.houses, transformerCapacityWh: created.day.transformerCapacityWh, viewerEvCharging: false });
        assert.deepEqual(decoded[2].map((reading: any) => [reading.house.toLowerCase(), Number(reading.generationWh), Number(reading.consumptionWh)]), expected.readings.map((reading) => [reading.house.toLowerCase(), reading.generationWh, reading.consumptionWh]));
      }
    }

    const closed = await service.closeDay(created.day.dayId, uuid(100), context);
    assert.equal(closed.status, "confirmed");
    assert.equal((await chain.getCurrentDay()).active, false);
    const tokenCountAfterClose = await deployed.certificateContract.nextTokenId();
    const [closeRetryA, closeRetryB] = await Promise.all([
      service.closeDay(created.day.dayId, uuid(8_001), context),
      service.closeDay(created.day.dayId, uuid(8_002), context),
    ]);
    assert.equal(closeRetryA.closeAction.txHash, closed.closeAction.txHash);
    assert.equal(closeRetryB.closeAction.txHash, closed.closeAction.txHash);
    assert.equal(await deployed.certificateContract.nextTokenId(), tokenCountAfterClose);
    const firstCarbon = await assertCarbonClose(chain, deployed.marketContract, deployed.certificateContract, created.day.dayId, closed.closeAction);
    const firstCloseReceipt = await provider.getTransactionReceipt(closed.closeAction.txHash!);
    if (firstCarbon.certificates.length > 0) {
      const record = firstCarbon.certificates[0];
      const sellerIndex = deployed.houses.findIndex((house) => house.toLowerCase() === record.solarSeller.toLowerCase());
      assert.ok(sellerIndex >= 0);
      const signer = await provider.getSigner(sellerIndex + 1);
      const retireTx = await deployed.certificateContract.connect(signer).retire(record.tokenId);
      const retireReceipt = await retireTx.wait();
      assert.equal(retireReceipt?.status, 1);
      const retiredEvent = retireReceipt!.logs.map((log: any) => {
        try { return deployed.certificateContract.interface.parseLog(log); } catch { return null; }
      }).find((event: any) => event?.name === "CertificateRetired");
      assert.equal(retiredEvent?.args.owner.toLowerCase(), record.solarSeller.toLowerCase());
      assert.equal(await deployed.certificateContract.retired(record.tokenId), true);
      console.log(`P8 local receipt action=retire token=${record.tokenId} status=confirmed block=${retireReceipt!.blockNumber} tx=${retireReceipt!.hash}`);
    }
    assert.equal(await deployed.marketContract.totalInternalBalance(), initialLedger);
    const firstLedger = await assertLedgerConservation(initialLedger);
    assert.equal(firstLedger.houseLedgers.length, 8);

    const second = await service.createDay({ clientRunId: uuid(200), scenario: "rainy", seed: "local-integration-rainy-day", viewerEvCharging: false }, context);
    assert.equal(second.action.status, "confirmed");
    assert.notEqual(second.day.dayId.toLowerCase(), created.day.dayId.toLowerCase());
    for (let epoch = 0; epoch < 24; epoch += 1) {
      const outcome = await service.advance(second.day.dayId, epoch, uuid(epoch + 202), context);
      assert.equal(outcome.status, "confirmed");
      assert.equal(outcome.kind, "normal");
    }
    const secondClosed = await service.closeDay(second.day.dayId, uuid(300), context);
    assert.equal(secondClosed.status, "confirmed");
    const secondCarbon = await assertCarbonClose(chain, deployed.marketContract, deployed.certificateContract, second.day.dayId, secondClosed.closeAction);
    const secondCloseReceipt = await provider.getTransactionReceipt(secondClosed.closeAction.txHash!);
    const recoveredService = new RelayerService(config, chain, new JsonRunStore(statePath), new AuthManager(config));
    await recoveredService.init();
    const recoveredCurrent = await recoveredService.getCurrentDay(context);
    assert.equal(recoveredCurrent.day?.dayId, second.day.dayId);
    assert.equal(recoveredCurrent.closeAction?.txHash, secondClosed.closeAction.txHash);
    assert.equal((recoveredCurrent.closeAction?.metrics as { certificates: readonly unknown[] }).certificates.length, secondCarbon.certificates.length);
    assert.equal(await deployed.marketContract.totalInternalBalance(), initialLedger);
    const secondLedger = await assertLedgerConservation(initialLedger);
    assert.equal(secondLedger.houseLedgers.length, 8);
    console.log(`P8 local receipt action=closeDay day=${created.day.dayId} status=confirmed block=${closed.closeAction.blockNumber} tx=${closed.closeAction.txHash} minted=${firstCarbon.certificates.length} eligibleWh=${firstCarbon.totalEligibleWh} avoidedMgCo2e=${firstCarbon.totalAvoidedMgCo2e} gas=${firstCloseReceipt?.gasUsed}`);
    console.log(`P8 local receipt action=closeDay day=${second.day.dayId} status=confirmed block=${secondClosed.closeAction.blockNumber} tx=${secondClosed.closeAction.txHash} minted=${secondCarbon.certificates.length} eligibleWh=${secondCarbon.totalEligibleWh} avoidedMgCo2e=${secondCarbon.totalAvoidedMgCo2e} gas=${secondCloseReceipt?.gasUsed}`);

    let cursor: string | undefined;
    const events: string[] = [];
    do {
      const page = await chain.listEvents(cursor, 100);
      events.push(...page.events.map((event) => event.name));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(events.filter((name) => name === "EpochSettled").length, 48);
    assert.equal(events.filter((name) => name === "EmergencyResolved").length, 0);

    const duplicate = await service.advance(created.day.dayId, 0, uuid(101), context);
    assert.equal(duplicate.status, "confirmed");
    let afterCursor: string | undefined;
    const after: string[] = [];
    do {
      const page = await chain.listEvents(afterCursor, 100);
      after.push(...page.events.map((event) => event.name));
      afterCursor = page.nextCursor;
    } while (afterCursor);
    assert.equal(after.filter((name) => name === "EpochSettled").length, 48);
    assert.equal(after.filter((name) => name === "DayStarted").length, 2);
    assert.equal(after.filter((name) => name === "DayClosed").length, 2);
  } finally {
    provider?.destroy();
    node.process.kill();
    // The test state is intentionally outside the repository and disposable.
    // Keep the local integration run from leaving credentials or state behind.
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

test("local Hardhat heatwave resolves every epoch with receipt-reconciled battery payouts", { timeout: 120_000 }, async () => {
  const node = await startHardhatNode();
  let provider: JsonRpcProvider | undefined;
  let directory: string | undefined;
  let apiServer: ReturnType<typeof createNodeServer> | undefined;
  try {
    provider = new JsonRpcProvider("http://127.0.0.1:8545", 31337, { staticNetwork: true });
    const deployed = await deployAndSeed(provider, node.privateKeys, 6_000, true);
    directory = await mkdtemp(join(tmpdir(), "voltgrid-relayer-heatwave-"));
    const statePath = join(directory, "relayer.json");
    const config = runtimeConfig(statePath, deployed.market, node.privateKeys[0], 18_500);
    const chain = new EthersChainClient(config);
    const service = new RelayerService(config, chain, new JsonRunStore(statePath), new AuthManager(config));
    await service.init();
    const router = new RelayerHttpRouter(service, config);
    apiServer = createNodeServer(router);
    apiServer.listen(0, "127.0.0.1");
    await once(apiServer, "listening");
    const boundAddress = apiServer.address();
    assert.ok(boundAddress && typeof boundAddress !== "string");
    const apiUrl = `http://127.0.0.1:${boundAddress.port}`;
    const challenge = await callApi(apiUrl, "POST", "/v1/auth/challenge", { address: deployed.oracle.address });
    assert.equal(challenge.status, 200);
    const message = (challenge.body as { message: string }).message;
    const signature = await deployed.oracle.signMessage(message);
    const verified = await callApi(apiUrl, "POST", "/v1/auth/verify", { address: deployed.oracle.address, message, signature });
    assert.equal(verified.status, 200);
    const token = (verified.body as { accessToken: string }).accessToken;
    const startResponse = await callApi(apiUrl, "POST", "/v1/days", {
      clientRunId: uuid(401), scenario: "heatwave", seed: "local-heatwave-emergency", viewerEvCharging: false,
    }, token);
    assert.equal(startResponse.status, 201);
    const started = startResponse.body as { dayId: string; status: string; actions: readonly { status: string; txHash?: string; blockNumber?: number }[] };
    assert.equal(started.status, "confirmed");
    const startReceipt = await provider.getTransactionReceipt(started.actions[0].txHash!);
    assert.equal(startReceipt?.status, 1);
    const initialTreasury = await deployed.marketContract.internalBalance(deployed.treasury);
    const initialHouseBalances = new Map<string, bigint>();
    for (const house of deployed.houses) initialHouseBalances.set(house.toLowerCase(), await deployed.marketContract.internalBalance(house));
    let confirmedTransactions = 1;
    let measuredGas = startReceipt!.gasUsed;
    let emergencyEpochs = 0;
    let paidDispatchEpochs = 0;
    const outcomes: Array<{ status: string; kind: string; epochIndex: number; actions: readonly { action: string; status: string; txHash?: string; blockNumber?: number; contractAddress?: string }[]; metrics?: { discharges?: readonly { house: string; deliveredWh: number; payoutWei: string }[]; payoutWei?: string; shavedWh?: number; targetWh?: number; tariffMicroVltPerKwh?: number } }> = [];

    for (let epoch = 0; epoch < 24; epoch += 1) {
      const before = new Map<string, bigint>();
      for (const house of deployed.houses) before.set(house.toLowerCase(), await deployed.marketContract.internalBalance(house));
      const treasuryBefore = await deployed.marketContract.internalBalance(deployed.treasury);
      const advanceResponse = await callApi(apiUrl, "POST", `/v1/days/${started.dayId}/epochs/${epoch}/advance`, { clientRequestId: uuid(epoch + 402) }, token);
      assert.equal(advanceResponse.status, 200);
      const outcome = advanceResponse.body as (typeof outcomes)[number];
      assert.equal(outcome.status, "confirmed", `epoch ${epoch} should be confirmed: ${JSON.stringify(outcome)}`);
      assert.equal(outcome.epochIndex, epoch);
      outcomes.push(outcome);
      confirmedTransactions += outcome.actions.length;
      if (outcome.kind === "emergency") {
        emergencyEpochs += 1;
        assert.deepEqual(outcome.actions.map((action) => action.action), ["declareEmergency", "reportDischarge", "resolveEmergency"]);
        assert.ok(outcome.actions.every((action) => action.status === "confirmed" && action.txHash && action.blockNumber));
        assert.ok(outcome.actions.every((action) => action.contractAddress?.toLowerCase() === deployed.market.toLowerCase()));
        const payoutByHouse = new Map((outcome.metrics?.discharges ?? []).map((item) => [item.house.toLowerCase(), BigInt(item.payoutWei)]));
        const totalPayout = [...payoutByHouse.values()].reduce((sum, value) => sum + value, 0n);
        const totalDelivered = (outcome.metrics?.discharges ?? []).reduce((sum, item) => sum + item.deliveredWh, 0);
        assert.equal(outcome.metrics?.payoutWei, totalPayout.toString());
        assert.equal(outcome.metrics?.shavedWh, totalDelivered);
        if (totalDelivered > 0) paidDispatchEpochs += 1;
        for (const house of deployed.houses) {
          const current = await deployed.marketContract.internalBalance(house);
          assert.equal(current - before.get(house.toLowerCase())!, payoutByHouse.get(house.toLowerCase()) ?? 0n,
            `epoch ${epoch} battery payout ledger for ${house}`);
        }
        assert.equal(await deployed.marketContract.internalBalance(deployed.treasury), treasuryBefore - totalPayout,
          `epoch ${epoch} simulated treasury debit`);
        const actionReceipts = await Promise.all(outcome.actions.map((action) => provider!.getTransactionReceipt(action.txHash!)));
        for (const receipt of actionReceipts) {
          assert.equal(receipt?.status, 1);
          measuredGas += receipt!.gasUsed;
        }
      } else {
        assert.equal(outcome.actions.length, 1);
        assert.equal(outcome.actions[0].action, "settle");
        const normalReceipt: Awaited<ReturnType<JsonRpcProvider["getTransactionReceipt"]>> = await provider.getTransactionReceipt(outcome.actions[0].txHash!);
        assert.equal(normalReceipt?.status, 1);
        measuredGas += normalReceipt!.gasUsed;
      }
    }

    assert.equal(outcomes.length, 24);
    assert.ok(emergencyEpochs > 0, "heatwave should cross the frozen emergency threshold");
    assert.ok(paidDispatchEpochs > 0, "at least one opted-in modelled battery should be paid");
    const closeResponse = await callApi(apiUrl, "POST", `/v1/days/${started.dayId}/close`, { clientRequestId: uuid(450) }, token);
    assert.equal(closeResponse.status, 200);
    const closed = closeResponse.body as { status: string; actions: readonly ChainAction[]; closeAction: ChainAction };
    assert.equal(closed.status, "confirmed");
    assert.equal(closed.actions.length, 1);
    const closeReceipt = await provider.getTransactionReceipt(closed.actions[0].txHash!);
    assert.equal(closeReceipt?.status, 1);
    const heatwaveCarbon = await assertCarbonClose(chain, deployed.marketContract, deployed.certificateContract, started.dayId, closed.closeAction);
    confirmedTransactions += closed.actions.length;
    measuredGas += closeReceipt!.gasUsed;
    assert.equal(await deployed.marketContract.totalInternalBalance(), initialTreasury + [...initialHouseBalances.values()].reduce((sum, value) => sum + value, 0n));
    // Normal imports/exports/trading also move the treasury ledger. Emergency
    // debits are checked against the exact per-epoch delta above and against
    // the corresponding receipt events below.
    for (const outcome of outcomes.filter((item) => item.kind === "emergency")) {
      const [duplicate, concurrentRetry] = await Promise.all([
        callApi(apiUrl, "POST", `/v1/days/${started.dayId}/epochs/${outcome.epochIndex}/advance`, { clientRequestId: uuid(outcome.epochIndex + 500) }, token),
        callApi(apiUrl, "POST", `/v1/days/${started.dayId}/epochs/${outcome.epochIndex}/advance`, { clientRequestId: uuid(outcome.epochIndex + 600) }, token),
      ]);
      assert.equal(duplicate.status, 200);
      const duplicateOutcome = duplicate.body as (typeof outcomes)[number];
      const retryOutcome = concurrentRetry.body as (typeof outcomes)[number];
      assert.equal(duplicateOutcome.status, "confirmed");
      assert.equal(retryOutcome.status, "confirmed");
      assert.deepEqual(retryOutcome.actions.map((action) => action.txHash), outcome.actions.map((action) => action.txHash));
      assert.equal(Number((await deployed.marketContract.currentDay()).nextEpoch), 24);
    }

    let cursor: string | undefined;
    const events: Array<{ name: string; args: Readonly<Record<string, string | number | boolean>> }> = [];
    do {
      const query = new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) });
      const response = await callApi(apiUrl, "GET", `/v1/events?${query.toString()}`, undefined, token);
      assert.equal(response.status, 200);
      const page = response.body as { events: typeof events; nextCursor?: string };
      events.push(...page.events.filter((event) => String(event.args.dayId ?? "").toLowerCase() === started.dayId.toLowerCase()));
      cursor = page.nextCursor;
    } while (cursor);
    const resolved = events.filter((event) => event.name === "EmergencyResolved");
    const reported = events.filter((event) => event.name === "EmergencyReportRecorded");
    const settled = events.filter((event) => event.name === "EpochSettled");
    const batteryLogs = events.filter((event) => event.name === "BatteryDischarged");
    const emergencyIndexes = new Set(resolved.map((event) => Number(event.args.epochIndex)));
    assert.equal(resolved.length + settled.length, 24);
    const finalIndexes = [...resolved, ...settled].map((event) => Number(event.args.epochIndex)).sort((left, right) => left - right);
    assert.deepEqual(finalIndexes, Array.from({ length: 24 }, (_, index) => index));
    assert.equal(reported.length, resolved.length);
    assert.equal(events.filter((event) => event.name === "TradeSettled" && emergencyIndexes.has(Number(event.args.epochIndex))).length, 0);
    for (const event of resolved) {
      const epoch = Number(event.args.epochIndex);
      const matching = batteryLogs.filter((item) => Number(item.args.epochIndex) === epoch);
      const delivered = matching.reduce((sum, item) => sum + Number(item.args.deliveredWh), 0);
      const payout = matching.reduce((sum, item) => sum + BigInt(String(item.args.payoutWei)), 0n).toString();
      assert.equal(Number(event.args.shavedWh), delivered);
      assert.equal(String(event.args.payoutWei), payout);
      assert.equal(outcomes[epoch].metrics?.targetWh, Number(event.args.targetWh));
      const outcome = outcomes[epoch];
      assert.equal(outcome.metrics?.shavedWh, delivered);
      assert.equal(outcome.metrics?.payoutWei, payout);
    }
    const finalHouses = await Promise.all(deployed.houses.map((house) => deployed.marketContract.internalBalance(house)));
    const finalInternalBalance = await deployed.marketContract.totalInternalBalance();
    assert.equal(finalInternalBalance, finalHouses.reduce((sum: bigint, value: bigint) => sum + value, 0n) + await deployed.marketContract.internalBalance(deployed.treasury));
    assert.equal(await deployed.tokenContract.balanceOf(deployed.market), finalInternalBalance);
    assert.ok([...initialHouseBalances.entries()].every(([, balance]) => balance >= 0n));
    console.log(`P7 heatwave day ${started.dayId}: chainId=31337 contract=${deployed.market} 24 outcomes, ${emergencyEpochs} emergencies, ${paidDispatchEpochs} positive-dispatch epochs, ${confirmedTransactions} submitted transactions, ${measuredGas} gas`);
    console.log(`P7 local receipt action=start status=confirmed block=${started.actions[0].blockNumber} tx=${started.actions[0].txHash}`);
    for (const outcome of outcomes) {
      for (const action of outcome.actions) {
        console.log(`P7 local receipt epoch=${outcome.epochIndex} kind=${outcome.kind} action=${action.action} status=${action.status} block=${action.blockNumber} tx=${action.txHash}`);
      }
    }
    console.log(`P8 local receipt action=closeDay day=${started.dayId} status=confirmed block=${closed.closeAction.blockNumber} tx=${closed.closeAction.txHash} minted=${heatwaveCarbon.certificates.length} eligibleWh=${heatwaveCarbon.totalEligibleWh} avoidedMgCo2e=${heatwaveCarbon.totalAvoidedMgCo2e} gas=${closeReceipt!.gasUsed}`);
  } finally {
    if (apiServer?.listening) await new Promise<void>((resolve) => apiServer!.close(() => resolve()));
    provider?.destroy();
    node.process.kill();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});
