import { expect } from "chai";
import { ethers } from "hardhat";

const VLT = ethers.parseEther;
const MICRO = 1_000_000n;
const WEI_PER_MICRO_WH = 1_000_000_000n;

type Fixture = Awaited<ReturnType<typeof deployFixture>>;
type TestSigner = Awaited<ReturnType<typeof ethers.getSigners>>[number];

async function deployFixture() {
  const signers = await ethers.getSigners();
  const [owner, oracle, registrar, seeder, treasury, attacker] = signers;

  const Token = await ethers.getContractFactory("VoltToken");
  const token = await Token.deploy(owner.address);
  await token.waitForDeployment();

  const Market = await ethers.getContractFactory("VoltGridMarket");
  const market = await Market.deploy(await token.getAddress(), treasury.address);
  await market.waitForDeployment();

  const Certificate = await ethers.getContractFactory("CarbonCertificate");
  const certificate = await Certificate.deploy(await market.getAddress());
  await certificate.waitForDeployment();
  await market.connect(owner).setCarbonCertificate(await certificate.getAddress());

  await market.connect(owner).grantRole(await market.ORACLE_ROLE(), oracle.address);
  await market.connect(owner).grantRole(await market.REGISTRAR_ROLE(), registrar.address);
  await market.connect(owner).grantRole(await market.SEEDER_ROLE(), seeder.address);
  await market.connect(owner).grantRole(await market.GRID_OPERATOR_ROLE(), owner.address);

  return { signers, owner, oracle, registrar, seeder, treasury, attacker, token, market, certificate };
}

async function registerHouse(
  fixture: Fixture,
  house: TestSigner,
  hasSolar = false,
  hasBattery = false,
  batteryCapacityWh = 0
) {
  await fixture.market
    .connect(fixture.registrar)
    .registerHouseFor(house.address, hasSolar, hasBattery, batteryCapacityWh);
}

async function mintTo(fixture: Fixture, account: TestSigner, amount: bigint) {
  await fixture.token.connect(fixture.owner).mint(account.address, amount);
}

async function depositFor(fixture: Fixture, payer: TestSigner, house: TestSigner, amount: bigint) {
  await mintTo(fixture, payer, amount);
  await fixture.token.connect(payer).approve(await fixture.market.getAddress(), amount);
  await fixture.market.connect(fixture.seeder).depositFor(house.address, amount);
}

async function fundTreasury(fixture: Fixture, amount: bigint) {
  await mintTo(fixture, fixture.owner, amount);
  await fixture.token.connect(fixture.owner).approve(await fixture.market.getAddress(), amount);
  await fixture.market.connect(fixture.owner).fundTreasury(amount);
}

async function startDay(fixture: Fixture, label: string) {
  const dayId = ethers.id(label);
  await fixture.market.connect(fixture.oracle).startDay(dayId, ethers.id(`${label}-input`), 1);
  return dayId;
}

function amount(wh: bigint, micro: bigint): bigint {
  return wh * micro * WEI_PER_MICRO_WH;
}

describe("VoltToken", () => {
  it("restricts minting and rate-limits the fixed demo faucet", async () => {
    const [owner, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("VoltToken");
    const token = await Token.deploy(owner.address);
    await token.waitForDeployment();

    await expect(token.connect(other).mint(other.address, VLT("1")))
      .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    await expect(token.connect(other).faucet()).to.emit(token, "FaucetClaimed");
    expect(await token.balanceOf(other.address)).to.equal(VLT("100"));
    await expect(token.connect(other).faucet()).to.be.revertedWithCustomError(
      token,
      "FaucetCooldown"
    );
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);
    await token.connect(other).faucet();
    expect(await token.balanceOf(other.address)).to.equal(VLT("200"));
  });
});

describe("VoltGridMarket", () => {
  it("handles the frozen worked allocation with exact token conservation", async () => {
    const fixture = await deployFixture();
    const { market, oracle, token } = fixture;
    const [, , , , , , sellerA, sellerB, buyerC, buyerD] = fixture.signers;
    await registerHouse(fixture, sellerA, true);
    await registerHouse(fixture, sellerB, true);
    await registerHouse(fixture, buyerC);
    await registerHouse(fixture, buyerD);
    await depositFor(fixture, fixture.seeder, buyerC, VLT("100"));
    await depositFor(fixture, fixture.seeder, buyerD, VLT("100"));
    await fundTreasury(fixture, VLT("100"));
    const before = await market.totalInternalBalance();
    const custodyBefore = await token.balanceOf(await market.getAddress());
    const dayId = await startDay(fixture, "worked-allocation");

    const tx = await market.connect(oracle).settleEpoch(dayId, 0, [
      [sellerA.address, 3, 0],
      [sellerB.address, 2, 0],
      [buyerC.address, 0, 4],
      [buyerD.address, 0, 3],
    ]);
    await expect(tx)
      .to.emit(market, "TradeSettled")
      .withArgs(dayId, 0, sellerA.address, buyerC.address, 3, 5_800_000, amount(3n, 5_800_000n), amount(3n, 420_000n));
    await expect(tx)
      .to.emit(market, "TradeSettled")
      .withArgs(dayId, 0, sellerB.address, buyerD.address, 2, 5_800_000, amount(2n, 5_800_000n), amount(2n, 420_000n));
    await expect(tx)
      .to.emit(market, "GridImportSettled")
      .withArgs(dayId, 0, buyerC.address, 1, amount(1n, 8_000_000n));
    await expect(tx)
      .to.emit(market, "GridImportSettled")
      .withArgs(dayId, 0, buyerD.address, 1, amount(1n, 8_000_000n));
    await expect(tx).to.emit(market, "EpochSettled").withArgs(
      dayId,
      0,
      5_800_000,
      5,
      0,
      2,
      amount(5n, 420_000n)
    );

    const sellerAGross = amount(3n, 5_800_000n);
    const sellerBGross = amount(2n, 5_800_000n);
    expect(await market.internalBalance(sellerA.address)).to.equal(
      sellerAGross - amount(3n, 420_000n)
    );
    expect(await market.internalBalance(sellerB.address)).to.equal(
      sellerBGross - amount(2n, 420_000n)
    );
    expect(await market.internalBalance(buyerC.address)).to.equal(
      VLT("100") - sellerAGross - amount(1n, 8_000_000n)
    );
    expect(await market.internalBalance(buyerD.address)).to.equal(
      VLT("100") - sellerBGross - amount(1n, 8_000_000n)
    );
    expect(await market.internalBalance(fixture.treasury.address)).to.equal(
      VLT("100") + amount(5n, 420_000n) + amount(2n, 8_000_000n)
    );
    expect(await market.totalInternalBalance()).to.equal(before);
    expect(await token.balanceOf(await market.getAddress())).to.equal(custodyBefore);
  });

  it("does not treat unsolicited token transfers as ledger credits", async () => {
    const fixture = await deployFixture();
    const { market, token, owner } = fixture;
    const [, , , , , , house] = fixture.signers;
    await registerHouse(fixture, house);
    await mintTo(fixture, owner, VLT("1"));
    await token.connect(owner).transfer(await market.getAddress(), VLT("1"));
    expect(await market.internalBalance(house.address)).to.equal(0);
    expect(await market.totalInternalBalance()).to.equal(0);
    expect(await token.balanceOf(await market.getAddress())).to.equal(VLT("1"));
  });

  it("rejects zero deposits and makes depositFor debit only the seeder", async () => {
    const fixture = await deployFixture();
    const { market, seeder, attacker, token } = fixture;
    const [, , , , , , house] = fixture.signers;
    await registerHouse(fixture, house);
    await expect(market.connect(attacker).registerHouseFor(attacker.address, false, false, 0))
      .to.be.revertedWithCustomError(market, "AccessControlUnauthorizedAccount");
    await expect(market.connect(house).deposit(0)).to.be.revertedWithCustomError(
      market,
      "InvalidAmount"
    );
    await expect(market.connect(attacker).depositFor(house.address, VLT("1")))
      .to.be.revertedWithCustomError(market, "AccessControlUnauthorizedAccount");

    await mintTo(fixture, seeder, VLT("4"));
    await token.connect(seeder).approve(await market.getAddress(), VLT("4"));
    const seederBefore = await token.balanceOf(seeder.address);
    await market.connect(seeder).depositFor(house.address, VLT("4"));
    expect(await token.balanceOf(seeder.address)).to.equal(seederBefore - VLT("4"));
    expect(await market.internalBalance(house.address)).to.equal(VLT("4"));
  });

  it("uses the fixed-point floor, interpolation and cap rules", async () => {
    const fixture = await deployFixture();
    const { market, owner, attacker } = fixture;
    await expect(market.connect(attacker).setPricingParams(3_000_000, 5_000_000, 7_000_000, 420_000))
      .to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    expect(await market.previewPrice(1000, 0)).to.equal(0);
    expect(await market.previewPrice(0, 1000)).to.equal(0);
    expect(await market.previewPrice(1000, 500)).to.equal(3n * MICRO);
    expect(await market.previewPrice(1000, 1000)).to.equal(5n * MICRO);
    expect(await market.previewPrice(1000, 1500)).to.equal(6n * MICRO);
    expect(await market.previewPrice(1000, 2000)).to.equal(7n * MICRO);
    await expect(market.connect(owner).setPricingParams(4_000_000, 4_500_000, 6_000_000, 100_000))
      .to.emit(market, "PricingParamsChanged");
    expect(await market.previewPrice(1000, 1000)).to.equal(4_500_000);
    expect(await market.previewPrice(1000, 2000)).to.equal(6_000_000);
  });

  it("settles zero-supply and zero-demand epochs without inventing a P2P price", async () => {
    const fixture = await deployFixture();
    const { market, oracle } = fixture;
    const [, , , , , , solar, consumer] = fixture.signers;
    await registerHouse(fixture, solar, true);
    await registerHouse(fixture, consumer);
    await depositFor(fixture, fixture.seeder, consumer, VLT("20"));
    await fundTreasury(fixture, VLT("20"));
    const dayId = await startDay(fixture, "zero-epochs");

    await expect(
      market.connect(oracle).settleEpoch(dayId, 0, [
        [solar.address, 0, 0],
        [consumer.address, 0, 0],
      ])
    ).to.emit(market, "EpochSettled").withArgs(dayId, 0, 0, 0, 0, 0, 0);
    await expect(
      market.connect(oracle).settleEpoch(dayId, 1, [
        [solar.address, 10, 0],
        [consumer.address, 0, 0],
      ])
    ).to.emit(market, "EpochSettled").withArgs(dayId, 1, 0, 0, 10, 0, 0);
  });

  it("handles a one-Wh Hamilton tie deterministically", async () => {
    const fixture = await deployFixture();
    const { market, oracle } = fixture;
    const [, , , , , , firstSeller, secondSeller, buyer] = fixture.signers;
    await registerHouse(fixture, firstSeller, true);
    await registerHouse(fixture, secondSeller, true);
    await registerHouse(fixture, buyer);
    await depositFor(fixture, fixture.seeder, buyer, VLT("10"));
    await fundTreasury(fixture, VLT("10"));
    const dayId = await startDay(fixture, "tiny-wh");

    const tx = await market.connect(oracle).settleEpoch(dayId, 0, [
      [firstSeller.address, 1, 0],
      [secondSeller.address, 1, 0],
      [buyer.address, 0, 1],
    ]);
    await expect(tx).to.emit(market, "TradeSettled").withArgs(
      dayId,
      0,
      firstSeller.address,
      buyer.address,
      1,
      3_000_000,
      amount(1n, 3_000_000n),
      amount(1n, 420_000n)
    );
    await expect(tx)
      .to.emit(market, "GridExportSettled")
      .withArgs(dayId, 0, secondSeller.address, 1, amount(1n, 2_500_000n));
    expect(await market.internalBalance(secondSeller.address)).to.equal(
      amount(1n, 2_500_000n)
    );
  });

  it("reverts atomically for underfunded buyers and treasury exports", async () => {
    const buyerFixture = await deployFixture();
    const { market: buyerMarket, oracle: buyerOracle } = buyerFixture;
    const [, , , , , , seller, buyer] = buyerFixture.signers;
    await registerHouse(buyerFixture, seller, true);
    await registerHouse(buyerFixture, buyer);
    const buyerDay = await startDay(buyerFixture, "underfunded-buyer");
    await expect(
      buyerMarket.connect(buyerOracle).settleEpoch(buyerDay, 0, [
        [seller.address, 10, 0],
        [buyer.address, 0, 10],
      ])
    ).to.be.revertedWithCustomError(buyerMarket, "InsufficientInternalBalance");
    expect((await buyerMarket.currentDay()).nextEpoch).to.equal(0);

    const treasuryFixture = await deployFixture();
    const { market: treasuryMarket, oracle: treasuryOracle } = treasuryFixture;
    const [, , , , , , exportSeller, exportBuyer] = treasuryFixture.signers;
    await registerHouse(treasuryFixture, exportSeller, true);
    await registerHouse(treasuryFixture, exportBuyer);
    await depositFor(treasuryFixture, treasuryFixture.seeder, exportBuyer, VLT("1"));
    const treasuryDay = await startDay(treasuryFixture, "underfunded-treasury");
    await expect(
      treasuryMarket.connect(treasuryOracle).settleEpoch(treasuryDay, 0, [
        [exportSeller.address, 10, 0],
        [exportBuyer.address, 0, 0],
      ])
    ).to.be.revertedWithCustomError(treasuryMarket, "InsufficientInternalBalance");
    expect((await treasuryMarket.currentDay()).nextEpoch).to.equal(0);
  });

  it("enforces roles, ordering, replay protection and day boundaries", async () => {
    const fixture = await deployFixture();
    const { market, attacker, oracle, owner, registrar } = fixture;
    const [, , , , , , house] = fixture.signers;
    await registerHouse(fixture, house);
    const dayId = ethers.id("boundary-day");
    await expect(market.connect(attacker).startDay(dayId, ethers.ZeroHash, 1))
      .to.be.revertedWithCustomError(market, "AccessControlUnauthorizedAccount");
    await startDay(fixture, "boundary-day");
    await expect(market.connect(registrar).registerHouseFor(attacker.address, false, false, 0))
      .to.be.revertedWithCustomError(market, "RegistrationFrozen");
    await expect(market.connect(owner).setPricingParams(3_000_000, 5_000_000, 7_000_000, 420_000))
      .to.be.revertedWithCustomError(market, "RegistrationFrozen");
    await expect(
      market.connect(attacker).settleEpoch(dayId, 0, [[house.address, 0, 0]])
    ).to.be.revertedWithCustomError(market, "AccessControlUnauthorizedAccount");
    await expect(
      market.connect(oracle).settleEpoch(dayId, 1, [[house.address, 0, 0]])
    ).to.be.revertedWithCustomError(market, "InvalidEpoch");
    await market.connect(oracle).settleEpoch(dayId, 0, [[house.address, 0, 0]]);
    await expect(
      market.connect(oracle).settleEpoch(dayId, 0, [[house.address, 0, 0]])
    ).to.be.revertedWithCustomError(market, "InvalidEpoch");

    for (let epoch = 1; epoch < 24; epoch += 1) {
      await market.connect(oracle).settleEpoch(dayId, epoch, [[house.address, 0, 0]]);
    }
    await expect(market.connect(oracle).closeDay(dayId)).to.emit(market, "DayClosed");
    await expect(market.connect(oracle).closeDay(dayId)).to.be.revertedWithCustomError(
      market,
      "NoActiveDay"
    );
    await expect(market.connect(oracle).startDay(dayId, ethers.ZeroHash, 1))
      .to.be.revertedWithCustomError(market, "DayIdAlreadyUsed");
    await market.connect(oracle).startDay(ethers.id("boundary-day-2"), ethers.ZeroHash, 1);
  });

  it("advances an emergency as a distinct outcome and resumes normal settlement", async () => {
    const fixture = await deployFixture();
    const { market, oracle, owner } = fixture;
    const [, , , , , , battery, buyer] = fixture.signers;
    await registerHouse(fixture, battery, false, true, 100);
    await registerHouse(fixture, buyer);
    await market.connect(battery).setBatteryOptIn(true);
    await depositFor(fixture, fixture.seeder, buyer, VLT("20"));
    await fundTreasury(fixture, VLT("20"));
    const dayId = await startDay(fixture, "emergency-day");
    await market.connect(owner).declareEmergency(dayId, 0, 50, 7_500_000);
    await expect(
      market.connect(oracle).settleEpoch(dayId, 0, [
        [battery.address, 0, 0],
        [buyer.address, 0, 1],
      ])
    ).to.be.revertedWithCustomError(market, "EmergencyInProgress");
    const payout = amount(20n, 7_500_000n);
    await expect(
      market.connect(oracle).reportDischarge(dayId, 0, [[battery.address, 20]])
    ).to.emit(market, "BatteryDischarged").withArgs(dayId, 0, battery.address, 20, payout)
      .and.to.emit(market, "EmergencyReportRecorded").withArgs(dayId, 0, 20, payout, 1);
    await expect(market.connect(owner).resolveEmergency(dayId, 0))
      .to.emit(market, "EmergencyResolved")
      .withArgs(dayId, 0, 50, 20, payout);
    expect((await market.currentDay()).nextEpoch).to.equal(1);
    expect(await market.internalBalance(battery.address)).to.equal(payout);

    const normalTx = await market.connect(oracle).settleEpoch(dayId, 1, [
      [battery.address, 0, 0],
      [buyer.address, 0, 1],
    ]);
    await expect(normalTx).to.emit(market, "GridImportSettled");
  });

  it("requires an authorized declaration and an explicit zero-discharge report before resolution", async () => {
    const fixture = await deployFixture();
    const { market, oracle, owner, attacker } = fixture;
    const battery = fixture.signers[6];
    await registerHouse(fixture, battery, true, true, 500);
    const dayId = await startDay(fixture, "emergency-zero-fallback");

    await expect(market.connect(attacker).declareEmergency(dayId, 0, 1, 7_500_000))
      .to.be.revertedWithCustomError(market, "AccessControlUnauthorizedAccount");
    await expect(market.connect(owner).declareEmergency(dayId, 0, 0, 7_500_000))
      .to.be.revertedWithCustomError(market, "InvalidEmergencyTarget");
    await expect(market.connect(owner).declareEmergency(dayId, 0, 1, 2_499_999))
      .to.be.revertedWithCustomError(market, "InvalidEmergencyTariff");
    await expect(market.connect(owner).declareEmergency(dayId, 0, 1, 8_000_001))
      .to.be.revertedWithCustomError(market, "InvalidEmergencyTariff");
    await market.connect(owner).declareEmergency(dayId, 0, 1, 2_500_000);
    await expect(market.connect(battery).setBatteryOptIn(true))
      .to.be.revertedWithCustomError(market, "RegistrationFrozen");
    await expect(market.connect(owner).resolveEmergency(dayId, 0))
      .to.be.revertedWithCustomError(market, "EmergencyNotReported");
    await expect(market.connect(oracle).reportDischarge(dayId, 0, []))
      .to.emit(market, "EmergencyReportRecorded").withArgs(dayId, 0, 0, 0, 0);
    await expect(market.connect(oracle).reportDischarge(dayId, 0, []))
      .to.be.revertedWithCustomError(market, "EmergencyAlreadyReported");
    await expect(market.connect(owner).resolveEmergency(dayId, 0))
      .to.emit(market, "EmergencyResolved").withArgs(dayId, 0, 1, 0, 0);
    await expect(market.connect(owner).resolveEmergency(dayId, 0))
      .to.be.revertedWithCustomError(market, "InvalidEpoch").withArgs(1, 0);
    expect((await market.currentDay()).nextEpoch).to.equal(1);
  });

  it("bounds emergency discharges by eligibility, capacity, target, uniqueness and safely handles treasury insolvency", async () => {
    const fixture = await deployFixture();
    const { market, oracle, owner, treasury } = fixture;
    const battery = fixture.signers[6];
    const optedOut = fixture.signers[7];
    const unregistered = fixture.signers[10];
    await registerHouse(fixture, battery, true, true, 20);
    await registerHouse(fixture, optedOut, true, true, 20);
    await market.connect(battery).setBatteryOptIn(true);
    await fundTreasury(fixture, VLT("0.01"));
    const dayId = await startDay(fixture, "emergency-bounds");
    await market.connect(owner).declareEmergency(dayId, 0, 10, 7_500_000);

    await expect(market.connect(oracle).reportDischarge(dayId, 0, [[unregistered.address, 1]]))
      .to.be.revertedWithCustomError(market, "BatteryNotEligible");
    await expect(market.connect(oracle).reportDischarge(dayId, 0, [[optedOut.address, 1]]))
      .to.be.revertedWithCustomError(market, "BatteryNotEligible");
    await expect(market.connect(oracle).reportDischarge(dayId, 0, [[battery.address, 21]]))
      .to.be.revertedWithCustomError(market, "DischargeExceedsCapacity");
    await expect(market.connect(oracle).reportDischarge(dayId, 0, [[battery.address, 11]]))
      .to.be.revertedWithCustomError(market, "DischargeExceedsTarget");
    await expect(market.connect(oracle).reportDischarge(dayId, 0, [[battery.address, 1], [battery.address, 1]]))
      .to.be.revertedWithCustomError(market, "DuplicateDischarge");

    await expect(market.connect(oracle).reportDischarge(dayId, 0, [[battery.address, 10]]))
      .to.be.revertedWithCustomError(market, "InsufficientInternalBalance");
    expect(await market.internalBalance(battery.address)).to.equal(0);
    expect(await market.emergencyDeliveredByHouse(dayId, battery.address)).to.equal(0);
    await expect(market.connect(oracle).reportDischarge(dayId, 0, []))
      .to.emit(market, "EmergencyReportRecorded").withArgs(dayId, 0, 0, 0, 0);
    await expect(market.connect(owner).resolveEmergency(dayId, 0))
      .to.emit(market, "EmergencyResolved").withArgs(dayId, 0, 10, 0, 0);
    expect(await market.internalBalance(treasury.address)).to.equal(VLT("0.01"));
  });

  it("applies each opted-in battery's discharge budget cumulatively across emergency epochs", async () => {
    const fixture = await deployFixture();
    const { market, oracle, owner } = fixture;
    const battery = fixture.signers[6];
    await registerHouse(fixture, battery, true, true, 20);
    await market.connect(battery).setBatteryOptIn(true);
    await fundTreasury(fixture, VLT("1"));
    const dayId = await startDay(fixture, "emergency-cumulative-cap");

    await market.connect(owner).declareEmergency(dayId, 0, 20, 7_500_000);
    await market.connect(oracle).reportDischarge(dayId, 0, [[battery.address, 15]]);
    await market.connect(owner).resolveEmergency(dayId, 0);
    expect(await market.emergencyDeliveredByHouse(dayId, battery.address)).to.equal(15);

    await market.connect(owner).declareEmergency(dayId, 1, 10, 7_500_000);
    await expect(market.connect(oracle).reportDischarge(dayId, 1, [[battery.address, 6]]))
      .to.be.revertedWithCustomError(market, "DischargeExceedsCapacity");
    await expect(market.connect(oracle).reportDischarge(dayId, 1, [[battery.address, 5]]))
      .to.emit(market, "BatteryDischarged").withArgs(dayId, 1, battery.address, 5, amount(5n, 7_500_000n));
    await market.connect(owner).resolveEmergency(dayId, 1);
    expect(await market.emergencyDeliveredByHouse(dayId, battery.address)).to.equal(20);
    expect(await market.internalBalance(battery.address)).to.equal(amount(20n, 7_500_000n));
  });

  it("blocks reentrant token callbacks during deposit", async () => {
    const [owner, attacker] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("ReentrantToken");
    const token = await Token.deploy();
    await token.waitForDeployment();
    const Market = await ethers.getContractFactory("VoltGridMarket");
    const market = await Market.deploy(await token.getAddress(), owner.address);
    await market.waitForDeployment();
    await market.connect(attacker).registerHouse(false, false, 0);
    await token.mint(attacker.address, VLT("2"));
    await token.connect(attacker).approve(await market.getAddress(), VLT("1"));
    await token.configureCallback(await market.getAddress(), 1, true);
    await expect(market.connect(attacker).deposit(VLT("1"))).to.be.revertedWithCustomError(
      market,
      "ReentrancyGuardReentrantCall"
    );
    expect(await market.totalInternalBalance()).to.equal(0);
  });

  it("keeps the worst-case nine and 16-house settlement inside the local gas budget", async () => {
    const signers = await ethers.getSigners();
    const measurements: Array<[number, bigint]> = [];
    for (const houseCount of [9, 16]) {
      const owner = signers[0];
      const oracle = signers[1];
      const treasury = signers[2];
      const houses = signers.slice(3, 3 + houseCount);
      const Token = await ethers.getContractFactory("VoltToken");
      const token = await Token.deploy(owner.address);
      await token.waitForDeployment();
      const Market = await ethers.getContractFactory("VoltGridMarket");
      const market = await Market.deploy(await token.getAddress(), treasury.address);
      await market.waitForDeployment();
      const Certificate = await ethers.getContractFactory("CarbonCertificate");
      const certificate = await Certificate.deploy(await market.getAddress());
      await certificate.waitForDeployment();
      await market.connect(owner).setCarbonCertificate(await certificate.getAddress());
      await market.connect(owner).grantRole(await market.ORACLE_ROLE(), oracle.address);

      for (let i = 0; i < houses.length; i += 1) {
        await market.connect(owner).registerHouseFor(
          houses[i].address,
          i % 2 === 0,
          false,
          0
        );
        if (i % 2 === 1) {
          await token.connect(owner).mint(owner.address, VLT("10"));
          await token.connect(owner).approve(await market.getAddress(), VLT("10"));
          await market.connect(owner).grantRole(await market.SEEDER_ROLE(), owner.address);
          await market.connect(owner).depositFor(houses[i].address, VLT("10"));
        }
      }
      await token.connect(owner).mint(owner.address, VLT("10"));
      await token.connect(owner).approve(await market.getAddress(), VLT("10"));
      await market.connect(owner).fundTreasury(VLT("10"));
      if (houseCount === 16) {
        await expect(market.connect(owner).registerHouseFor(signers[19].address, false, false, 0))
          .to.be.revertedWithCustomError(market, "HouseLimitReached");
      }
      const dayId = ethers.id(`gas-${houseCount}`);
      await market.connect(oracle).startDay(dayId, ethers.ZeroHash, 1);
      const readings = houses.map((house, i) => [
        house.address,
        i % 2 === 0 ? 100 : 0,
        i % 2 === 0 ? 0 : 100,
      ]);
      const gas = await market.connect(oracle).settleEpoch.estimateGas(dayId, 0, readings);
      measurements.push([houseCount, gas]);
      expect(gas).to.be.lessThan(38_500_000n); // <70% of the 55m P0 observation.
    }
    for (const [houseCount, gas] of measurements) {
      console.log(`gas settleEpoch ${houseCount} houses: ${gas.toString()}`);
    }
  });
});

describe("P8 CarbonCertificate", () => {
  it("mints exactly seller-side matched Wh at atomic day close and excludes exports, imports and emergency delivery", async () => {
    const fixture = await deployFixture();
    const { market, oracle, owner, certificate } = fixture;
    const [, , , , , , sellerA, sellerB, buyer] = fixture.signers;
    await registerHouse(fixture, sellerA, true);
    await registerHouse(fixture, sellerB, true);
    await registerHouse(fixture, buyer);
    await depositFor(fixture, fixture.seeder, sellerA, VLT("10"));
    await depositFor(fixture, fixture.seeder, buyer, VLT("100"));
    await fundTreasury(fixture, VLT("100"));
    await market.connect(owner).setCarbonFactor(800, 2);
    const dayId = await startDay(fixture, "carbon-eligibility-day");

    await market.connect(oracle).settleEpoch(dayId, 0, [
      [sellerA.address, 4, 0],
      [sellerB.address, 2, 0],
      [buyer.address, 0, 4],
    ]);
    expect(await market.eligibleWh(dayId, sellerA.address)).to.equal(3);
    expect(await market.eligibleWh(dayId, sellerB.address)).to.equal(1);
    expect(await market.eligibleWh(dayId, buyer.address)).to.equal(0);

    await market.connect(owner).declareEmergency(dayId, 1, 50, 7_500_000);
    await market.connect(oracle).reportDischarge(dayId, 1, []);
    await market.connect(owner).resolveEmergency(dayId, 1);
    await market.connect(oracle).settleEpoch(dayId, 2, [
      [sellerA.address, 0, 5],
      [sellerB.address, 0, 0],
      [buyer.address, 0, 1],
    ]);
    await market.connect(oracle).settleEpoch(dayId, 3, [
      [sellerA.address, 7, 0],
      [sellerB.address, 0, 0],
      [buyer.address, 0, 0],
    ]);
    for (let epoch = 4; epoch < 24; epoch += 1) {
      await market.connect(oracle).settleEpoch(dayId, epoch, [
        [sellerA.address, 0, 0], [sellerB.address, 0, 0], [buyer.address, 0, 0],
      ]);
    }

    const close = await market.connect(oracle).closeDay(dayId);
    await expect(close).to.emit(market, "CertificateMinted").withArgs(dayId, sellerA.address, 1, 3, 800, 2_400);
    await expect(close).to.emit(market, "CertificateMinted").withArgs(dayId, sellerB.address, 2, 1, 800, 800);
    await expect(close).to.emit(market, "CarbonFactorApplied").withArgs(dayId, 800, 2);
    expect(await certificate.balanceOf(sellerA.address)).to.equal(1);
    expect(await certificate.balanceOf(sellerB.address)).to.equal(1);
    expect(await certificate.balanceOf(buyer.address)).to.equal(0);
    expect(await market.certificateMintedForDay(dayId, sellerA.address)).to.equal(true);
    expect(await market.certificateMintedForDay(dayId, sellerB.address)).to.equal(true);
    expect(await certificate.mintedForDay(dayId, sellerA.address)).to.equal(true);
    await expect(market.connect(oracle).closeDay(dayId)).to.be.revertedWithCustomError(market, "NoActiveDay");
  });

  it("keeps zero-eligibility days certificate-free", async () => {
    const fixture = await deployFixture();
    const { market, oracle, certificate } = fixture;
    const [, , , , , , seller, buyer] = fixture.signers;
    await registerHouse(fixture, seller, true);
    await registerHouse(fixture, buyer);
    const dayId = await startDay(fixture, "carbon-zero-eligibility");
    for (let epoch = 0; epoch < 24; epoch += 1) {
      await market.connect(oracle).settleEpoch(dayId, epoch, [[seller.address, 0, 0], [buyer.address, 0, 0]]);
    }
    const tx = await market.connect(oracle).closeDay(dayId);
    const receipt = await tx.wait();
    expect(receipt?.logs.filter((log) => {
      try { return market.interface.parseLog(log)?.name === "CertificateMinted"; } catch { return false; }
    })).to.have.length(0);
    expect(await certificate.nextTokenId()).to.equal(1);
  });

  it("closes a maximum-size day with 15 seller certificates inside the local gas budget", async () => {
    const fixture = await deployFixture();
    const { market, oracle, owner, certificate } = fixture;
    const sellers = fixture.signers.slice(5, 20);
    for (const seller of sellers) await registerHouse(fixture, seller, true);
    await registerHouse(fixture, owner);
    await depositFor(fixture, fixture.seeder, owner, VLT("10"));
    await fundTreasury(fixture, VLT("10"));
    const dayId = await startDay(fixture, "carbon-maximum-close");
    const firstReadings = [
      ...sellers.map((seller) => [seller.address, 1, 0]),
      [owner.address, 0, sellers.length],
    ];
    await market.connect(oracle).settleEpoch(dayId, 0, firstReadings);
    for (let epoch = 1; epoch < 24; epoch += 1) {
      await market.connect(oracle).settleEpoch(dayId, epoch, [
        ...sellers.map((seller) => [seller.address, 0, 0]),
        [owner.address, 0, 0],
      ]);
    }
    const tx = await market.connect(oracle).closeDay(dayId);
    const receipt = await tx.wait();
    expect(receipt?.status).to.equal(1);
    const minted = receipt!.logs.filter((log) => {
      try { return market.interface.parseLog(log)?.name === "CertificateMinted"; } catch { return false; }
    });
    expect(minted).to.have.length(15);
    expect(await certificate.nextTokenId()).to.equal(16);
    expect(receipt!.gasUsed).to.be.lessThan(10_000_000n);
    console.log(`gas closeDay 16 houses / 15 certificates: ${receipt!.gasUsed.toString()}`);
  });

  it("enforces market-only mint, owner-only irreversible retirement, and emits parseable on-chain JSON/SVG", async () => {
    const fixture = await deployFixture();
    const { market, oracle, certificate, attacker } = fixture;
    const [, , , , , , seller, buyer] = fixture.signers;
    await registerHouse(fixture, seller, true);
    await registerHouse(fixture, buyer);
    await depositFor(fixture, fixture.seeder, buyer, VLT("10"));
    await fundTreasury(fixture, VLT("10"));
    await expect(certificate.connect(seller).mint(seller.address, ethers.id("fake-day"), 1, 700, 1))
      .to.be.revertedWithCustomError(certificate, "OnlyMarket");
    const dayId = await startDay(fixture, "carbon-uri-retirement");
    await market.connect(oracle).settleEpoch(dayId, 0, [[seller.address, 10, 0], [buyer.address, 0, 10]]);
    for (let epoch = 1; epoch < 24; epoch += 1) {
      await market.connect(oracle).settleEpoch(dayId, epoch, [[seller.address, 0, 0], [buyer.address, 0, 0]]);
    }
    await market.connect(oracle).closeDay(dayId);

    const raw = await certificate.tokenURI(1);
    const json = JSON.parse(Buffer.from(raw.slice("data:application/json;base64,".length), "base64").toString("utf8")) as {
      description: string;
      image: string;
      attributes: Array<{ trait_type: string; value: string | number | boolean }>;
      properties: { formula: string; factorSource: string; retired: boolean };
    };
    const svg = Buffer.from(json.image.slice("data:image/svg+xml;base64,".length), "base64").toString("utf8");
    expect(json.description).to.contain("Not a verified carbon offset");
    expect(json.properties.formula).to.equal("eligibleWh * factorGPerKwh = avoidedMgCo2e");
    expect(json.properties.factorSource).to.contain("no primary emissions source verified");
    expect(svg).to.contain("10 Wh eligible");
    expect(svg).to.contain("NOT A VERIFIED OFFSET");
    const data = await certificate.certificateData(1);
    expect(data.dayId).to.equal(dayId);
    expect(data.eligibleWh).to.equal(10);
    expect(data.factorGPerKwh).to.equal(700);
    expect(data.factorVersion).to.equal(1);
    expect(data.avoidedMgCo2e).to.equal(7_000);

    await expect(certificate.connect(attacker).retire(1)).to.be.revertedWithCustomError(certificate, "NotTokenOwner");
    await certificate.connect(seller).approve(attacker.address, 1);
    await expect(certificate.connect(attacker).retire(1)).to.be.revertedWithCustomError(certificate, "NotTokenOwner");
    await expect(certificate.connect(seller).retire(1))
      .to.emit(certificate, "CertificateRetired").withArgs(1, seller.address);
    expect(await certificate.retired(1)).to.equal(true);
    await expect(certificate.connect(seller).transferFrom(seller.address, buyer.address, 1))
      .to.be.revertedWithCustomError(certificate, "RetiredTokenCannotTransfer");
    await expect(certificate.connect(seller).retire(1)).to.be.revertedWithCustomError(certificate, "AlreadyRetired");
    const retiredJson = JSON.parse(Buffer.from((await certificate.tokenURI(1)).slice("data:application/json;base64,".length), "base64").toString("utf8"));
    expect(retiredJson.properties.retired).to.equal(true);
  });

  it("snapshots factor changes for future days and rejects unauthorized or mid-day updates", async () => {
    const fixture = await deployFixture();
    const { market, owner, attacker, oracle, certificate } = fixture;
    const [, , , , , , seller] = fixture.signers;
    await registerHouse(fixture, seller, true);
    await expect(market.connect(attacker).setCarbonFactor(800, 2))
      .to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    await market.connect(owner).setCarbonFactor(900, 2);
    await expect(market.connect(owner).setCarbonFactor(2_001, 2)).to.be.revertedWithCustomError(market, "InvalidCarbonFactor");
    const dayId = await startDay(fixture, "carbon-factor-snapshot");
    await expect(market.connect(owner).setCarbonFactor(1_000, 3)).to.be.revertedWithCustomError(market, "RegistrationFrozen");
    for (let epoch = 0; epoch < 24; epoch += 1) {
      await market.connect(oracle).settleEpoch(dayId, epoch, [[seller.address, 0, 0]]);
    }
    await market.connect(oracle).closeDay(dayId);
    expect(await certificate.nextTokenId()).to.equal(1);
    expect(await market.carbonFactorGPerKwh()).to.equal(900);
    expect(await market.carbonFactorVersion()).to.equal(2);
  });
});
