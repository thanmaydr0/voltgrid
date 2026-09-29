import { expect } from "chai";
import { ethers } from "hardhat";

describe("HouseScreeningDemoCertificate", () => {
  async function deploy() {
    const [owner, solarHouse, ordinaryHouse, recipient] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("VoltToken");
    const token = await Token.deploy(owner.address);
    await token.waitForDeployment();
    const Market = await ethers.getContractFactory("VoltGridMarket");
    const market = await Market.deploy(await token.getAddress(), owner.address);
    await market.waitForDeployment();
    const DemoCertificate = await ethers.getContractFactory("HouseScreeningDemoCertificate");
    const certificate = await DemoCertificate.deploy(await market.getAddress());
    await certificate.waitForDeployment();
    return { owner, solarHouse, ordinaryHouse, recipient, market, certificate };
  }

  it("mints one non-transferable testnet demo record to a registered solar wallet", async () => {
    const { solarHouse, recipient, market, certificate } = await deploy();
    await market.connect(solarHouse).registerHouse(true, false, 0);
    const commitment = ethers.id("salted-local-bill-commitment");
    const flags = 3;

    await expect(certificate.connect(solarHouse).mintDemoScreening(commitment, flags))
      .to.emit(certificate, "HouseScreeningDemoMinted")
      .withArgs(solarHouse.address, 1, commitment, flags);

    expect(await certificate.ownerOf(1)).to.equal(solarHouse.address);
    expect(await certificate.credentialTokenOf(solarHouse.address)).to.equal(1);
    const record = await certificate.screeningData(1);
    expect(record.documentCommitment).to.equal(commitment);
    expect(record.signalFlags).to.equal(flags);

    const tokenUri = await certificate.tokenURI(1);
    const metadata = JSON.parse(Buffer.from(tokenUri.split(",")[1], "base64").toString("utf8"));
    expect(metadata.description).to.contain("MST TESTNET DEMO ONLY");
    expect(metadata.description.toLowerCase()).to.contain("not an official government");
    expect(metadata.attributes.find((attribute: { trait_type: string }) => attribute.trait_type === "officialVerification").value).to.equal(false);

    await expect(certificate.connect(solarHouse).transferFrom(solarHouse.address, recipient.address, 1))
      .to.be.revertedWithCustomError(certificate, "NonTransferableDemoCredential");
    await expect(certificate.connect(solarHouse).mintDemoScreening(ethers.id("another"), flags))
      .to.be.revertedWithCustomError(certificate, "CredentialAlreadyIssued");
  });

  it("rejects unregistered houses, non-solar declarations, empty or unsupported OCR flags", async () => {
    const { ordinaryHouse, solarHouse, market, certificate } = await deploy();
    const commitment = ethers.id("bill");
    await expect(certificate.connect(ordinaryHouse).mintDemoScreening(commitment, 3))
      .to.be.revertedWithCustomError(certificate, "HouseNotRegistered");

    await market.connect(ordinaryHouse).registerHouse(false, false, 0);
    await expect(certificate.connect(ordinaryHouse).mintDemoScreening(commitment, 3))
      .to.be.revertedWithCustomError(certificate, "SolarNotDeclared");

    await market.connect(solarHouse).registerHouse(true, false, 0);
    await expect(certificate.connect(solarHouse).mintDemoScreening(commitment, 0))
      .to.be.revertedWithCustomError(certificate, "InvalidScreeningData");
    await expect(certificate.connect(solarHouse).mintDemoScreening(commitment, 0xff))
      .to.be.revertedWithCustomError(certificate, "InvalidScreeningData");
  });

  it("accepts one actual matched OCR clue as a demo pass without inventing additional signal flags", async () => {
    const { solarHouse, market, certificate } = await deploy();
    await market.connect(solarHouse).registerHouse(true, false, 0);
    const commitment = ethers.id("single-solar-clue");
    await expect(certificate.connect(solarHouse).mintDemoScreening(commitment, 1))
      .to.emit(certificate, "HouseScreeningDemoMinted")
      .withArgs(solarHouse.address, 1, commitment, 1);
    expect((await certificate.screeningData(1)).signalFlags).to.equal(1);
  });

  it("rejects a zero market address and an address without contract code", async () => {
    const Certificate = await ethers.getContractFactory("HouseScreeningDemoCertificate");
    await expect(Certificate.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(Certificate, "ZeroAddress");
    const [, eoa] = await ethers.getSigners();
    await expect(Certificate.deploy(eoa.address)).to.be.revertedWithCustomError(Certificate, "InvalidMarket");
  });
});
