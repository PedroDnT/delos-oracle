import { expect } from "chai";
import { network } from "hardhat";
import type {
  HardhatEthers,
  HardhatEthersSigner,
} from "@nomicfoundation/hardhat-ethers/types";
import type { NetworkHelpers } from "@nomicfoundation/hardhat-network-helpers/types";

/**
 * Tests for the EIP-1167 clone path: DebentureCloneFactory plus the
 * BrazilianDebentureCloneable instances it deploys. The clone tests double as
 * coverage for the cloneable implementation — initialization, the
 * re-initialization guard, and the ERC-1404 transfer restrictions.
 */
describe("DebentureCloneFactory", function () {
  let ethers: HardhatEthers;
  let time: NetworkHelpers["time"];
  let implementation: any; // BrazilianDebentureCloneable
  let factory: any; // DebentureCloneFactory
  let oracle: any;
  let paymentToken: any;
  let owner: HardhatEthersSigner;
  let issuer: HardhatEthersSigner;
  let trustee: HardhatEthersSigner;
  let investor: HardhatEthersSigner;

  const PRECISION_PU = 10n ** 6n;
  const VNE = 1000n * PRECISION_PU;
  const TOTAL_UNITS = 500n;

  const AmortizationType = { PERCENT_VNE: 0, PERCENT_VNA: 1, FIXED_VALUE: 2 };
  const RateType = { PRE: 0, DI_SPREAD: 1, DI_PERCENT: 2, IPCA_SPREAD: 3, IGPM_SPREAD: 4 };

  async function makeTerms(isin: string, overrides: Record<string, unknown> = {}) {
    const now = await time.latest();
    return {
      vne: VNE,
      totalSupplyUnits: TOTAL_UNITS,
      issueDate: now,
      maturityDate: now + 365 * 24 * 60 * 60,
      anniversaryDay: 15,
      lockUpEndDate: now, // no lock-up so transfer tests exercise the whitelist path
      rateType: RateType.IPCA_SPREAD,
      fixedRate: 500n,
      percentDI: 100,
      couponFrequencyDays: 180n,
      amortType: AmortizationType.PERCENT_VNE,
      isinCode: isin,
      cetipCode: "TEST11",
      series: "1a Serie",
      hasRepactuacao: false,
      hasEarlyRedemption: true,
      comboId: ethers.ZeroHash,
      ...overrides,
    };
  }

  async function createClone(isin: string) {
    await factory
      .connect(issuer)
      .createDebenture("Clone Deb", "CDEB", await makeTerms(isin), ethers.ZeroAddress, trustee.address);
    const addr = await factory.debenturesByISIN(isin);
    return ethers.getContractAt("BrazilianDebentureCloneable", addr);
  }

  before(async function () {
    const connection = await network.getOrCreate();
    ethers = connection.ethers;
    time = connection.networkHelpers.time;
  });

  beforeEach(async function () {
    [owner, issuer, trustee, investor] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("BrazilianMacroOracle");
    oracle = await Oracle.deploy();
    await oracle.waitForDeployment();

    const MockToken = await ethers.getContractFactory("MockERC20");
    paymentToken = await MockToken.deploy("Brazilian Real Stablecoin", "BRZ", 6);
    await paymentToken.waitForDeployment();

    const Implementation = await ethers.getContractFactory("BrazilianDebentureCloneable");
    implementation = await Implementation.deploy();
    await implementation.waitForDeployment();

    const Factory = await ethers.getContractFactory("DebentureCloneFactory");
    factory = await Factory.deploy(
      await implementation.getAddress(),
      await oracle.getAddress(),
      await paymentToken.getAddress()
    );
    await factory.waitForDeployment();

    // issuer creates the clones in most tests
    await factory.setAuthorizedIssuer(issuer.address, true);
  });

  describe("construction", function () {
    it("Should reject zero implementation and zero oracle", async function () {
      const Factory = await ethers.getContractFactory("DebentureCloneFactory");
      await expect(
        Factory.deploy(ethers.ZeroAddress, await oracle.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid implementation");
      await expect(
        Factory.deploy(await implementation.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid oracle");
    });

    it("Should auto-authorize the owner as an issuer", async function () {
      expect(await factory.authorizedIssuers(owner.address)).to.be.true;
    });

    it("Should keep the implementation itself uninitializable", async function () {
      // _disableInitializers() in the constructor must lock the implementation,
      // otherwise anyone could initialize it and act as its issuer.
      await expect(
        implementation.initialize(
          "X",
          "X",
          await makeTerms("BRIMPL000001"),
          await oracle.getAddress(),
          await paymentToken.getAddress(),
          issuer.address,
          trustee.address
        )
      ).to.be.revertedWithCustomError(implementation, "InvalidInitialization");
    });
  });

  describe("issuer authorization", function () {
    it("Should reject clone creation from unauthorized callers", async function () {
      await expect(
        factory
          .connect(investor)
          .createDebenture("X", "X", await makeTerms("BRCLON000001"), ethers.ZeroAddress, trustee.address)
      ).to.be.revertedWith("Not authorized issuer");
    });

    it("Should let only the owner grant and revoke authorization", async function () {
      await expect(
        factory.connect(investor).setAuthorizedIssuer(investor.address, true)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");

      await expect(factory.setAuthorizedIssuer(investor.address, true))
        .to.emit(factory, "IssuerAuthorized")
        .withArgs(investor.address, true);

      await factory.setAuthorizedIssuer(investor.address, false);
      expect(await factory.authorizedIssuers(investor.address)).to.be.false;
    });

    it("Should batch authorize issuers", async function () {
      await factory.batchAuthorizeIssuers([investor.address, trustee.address]);
      expect(await factory.authorizedIssuers(investor.address)).to.be.true;
      expect(await factory.authorizedIssuers(trustee.address)).to.be.true;
    });
  });

  describe("clone creation", function () {
    it("Should deploy an initialized clone distinct from the implementation", async function () {
      const clone = await createClone("BRCLON000002");

      expect(await clone.getAddress()).to.not.equal(await implementation.getAddress());
      expect(await clone.name()).to.equal("Clone Deb");
      expect(await clone.symbol()).to.equal("CDEB");
      expect(await clone.issuer()).to.equal(issuer.address);
      expect(await clone.trustee()).to.equal(trustee.address);
      expect(await clone.balanceOf(issuer.address)).to.equal(TOTAL_UNITS);
      expect(await clone.whitelist(issuer.address)).to.be.true;

      const stored = await clone.getTerms();
      expect(stored.isinCode).to.equal("BRCLON000002");
      expect(stored.vne).to.equal(VNE);
    });

    it("Should update every registry view and emit the creation event", async function () {
      await expect(
        factory
          .connect(issuer)
          .createDebenture("Clone Deb", "CDEB", await makeTerms("BRCLON000003"), ethers.ZeroAddress, trustee.address)
      ).to.emit(factory, "DebentureCreated");

      const addr = await factory.debenturesByISIN("BRCLON000003");
      expect(await factory.getTotalDebentures()).to.equal(1);
      expect(await factory.getAllDebentures()).to.deep.equal([addr]);
      expect(await factory.getIssuerDebentures(issuer.address)).to.deep.equal([addr]);
      expect(await factory.isinExists("BRCLON000003")).to.be.true;
      expect(await factory.isinExists("BRCLON999999")).to.be.false;

      const info = await factory.getDebentureInfo(0);
      expect(info.debentureAddress).to.equal(addr);
      expect(info.isinCode).to.equal("BRCLON000003");
      expect(info.vne).to.equal(VNE);
      expect(info.totalSupply).to.equal(TOTAL_UNITS);

      await expect(factory.getDebentureInfo(1)).to.be.revertedWith("Index out of bounds");
    });

    it("Should refuse to re-initialize a live clone", async function () {
      const clone = await createClone("BRCLON000004");
      await expect(
        clone
          .connect(investor)
          .initialize(
            "Hijack",
            "HJK",
            await makeTerms("BRCLON000004"),
            await oracle.getAddress(),
            await paymentToken.getAddress(),
            investor.address,
            investor.address
          )
      ).to.be.revertedWithCustomError(clone, "InvalidInitialization");
    });

    it("Should reject duplicate ISINs and invalid ISINs", async function () {
      await createClone("BRCLON000005");
      await expect(
        factory
          .connect(issuer)
          .createDebenture("X", "X", await makeTerms("BRCLON000005"), ethers.ZeroAddress, trustee.address)
      ).to.be.revertedWith("ISIN already exists");

      await expect(
        factory
          .connect(issuer)
          .createDebenture("X", "X", await makeTerms("SHORT"), ethers.ZeroAddress, trustee.address)
      ).to.be.revertedWith("Invalid ISIN code");
    });

    it("Should require a payment token when no default exists", async function () {
      const Factory = await ethers.getContractFactory("DebentureCloneFactory");
      const bare = await Factory.deploy(
        await implementation.getAddress(),
        await oracle.getAddress(),
        ethers.ZeroAddress
      );
      await expect(
        bare.createDebenture("X", "X", await makeTerms("BRCLON000006"), ethers.ZeroAddress, trustee.address)
      ).to.be.revertedWith("Payment token required");
    });

    it("Should default the trustee to the issuer when none is given", async function () {
      await factory
        .connect(issuer)
        .createDebenture("X", "X", await makeTerms("BRCLON000007"), ethers.ZeroAddress, ethers.ZeroAddress);
      const addr = await factory.debenturesByISIN("BRCLON000007");
      const clone = await ethers.getContractAt("BrazilianDebentureCloneable", addr);
      expect(await clone.trustee()).to.equal(issuer.address);
    });
  });

  describe("deterministic creation", function () {
    it("Should deploy at the predicted CREATE2 address", async function () {
      const salt = ethers.id("series-1");
      const predicted = await factory.predictDeterministicAddress(salt);

      await factory
        .connect(issuer)
        .createDeterministicDebenture(
          "Det Deb",
          "DDEB",
          await makeTerms("BRCLON000008"),
          ethers.ZeroAddress,
          trustee.address,
          salt
        );

      expect(await factory.debenturesByISIN("BRCLON000008")).to.equal(predicted);
    });

    it("Should reject reusing a salt", async function () {
      const salt = ethers.id("series-2");
      await factory
        .connect(issuer)
        .createDeterministicDebenture(
          "Det Deb",
          "DDEB",
          await makeTerms("BRCLON000009"),
          ethers.ZeroAddress,
          trustee.address,
          salt
        );
      await expect(
        factory
          .connect(issuer)
          .createDeterministicDebenture(
            "Det Deb 2",
            "DDB2",
            await makeTerms("BRCLON000010"),
            ethers.ZeroAddress,
            trustee.address,
            salt
          )
      ).to.be.revertedWithCustomError(factory, "FailedDeployment");
    });
  });

  describe("clone transfer restrictions (ERC-1404)", function () {
    it("Should block transfers to non-whitelisted accounts and allow after whitelisting", async function () {
      const clone = await createClone("BRCLON000011");

      await expect(
        clone.connect(issuer).transfer(investor.address, 10n)
      ).to.be.revertedWith("Sender or receiver not whitelisted");

      await clone.connect(issuer).addToWhitelist(investor.address);
      await clone.connect(issuer).transfer(investor.address, 10n);
      expect(await clone.balanceOf(investor.address)).to.equal(10n);
    });

    it("Should block blacklisted senders even when whitelisted", async function () {
      const clone = await createClone("BRCLON000012");
      await clone.connect(issuer).addToWhitelist(investor.address);
      await clone.connect(issuer).transfer(investor.address, 10n);

      await clone.connect(issuer).addToBlacklist(investor.address);
      await expect(
        clone.connect(investor).transfer(issuer.address, 1n)
      ).to.revert(ethers);
    });
  });

  describe("admin", function () {
    it("Should let only the owner update oracle and default token", async function () {
      await expect(
        factory.connect(investor).setOracle(investor.address)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      await expect(factory.setOracle(ethers.ZeroAddress)).to.be.revertedWith("Invalid oracle");

      await expect(factory.setOracle(investor.address))
        .to.emit(factory, "OracleUpdated");
      expect(await factory.oracle()).to.equal(investor.address);

      await expect(factory.setDefaultPaymentToken(investor.address))
        .to.emit(factory, "DefaultPaymentTokenUpdated");
      expect(await factory.defaultPaymentToken()).to.equal(investor.address);
    });
  });
});
