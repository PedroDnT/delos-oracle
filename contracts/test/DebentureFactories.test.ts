import { expect } from "chai";
import { network } from "hardhat";
import type { BrazilianMacroOracle } from "../typechain-types";
import type {
  HardhatEthers,
  HardhatEthersSigner,
} from "@nomicfoundation/hardhat-ethers/types";
import type { NetworkHelpers } from "@nomicfoundation/hardhat-network-helpers/types";

/**
 * Tests for the two full-deployment factories: SimpleDebentureRegistry and
 * DebentureFactory. Both deploy complete BrazilianDebenture contracts, so the
 * tests also verify the deployed instances came up correctly (roles, mint,
 * whitelist), not just that the factory bookkeeping updated.
 */
describe("Debenture factories (full deployment)", function () {
  let ethers: HardhatEthers;
  let time: NetworkHelpers["time"];
  let oracle: BrazilianMacroOracle;
  let paymentToken: any; // MockERC20
  let owner: HardhatEthersSigner;
  let issuer: HardhatEthersSigner;
  let trustee: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;

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
      lockUpEndDate: now + 30 * 24 * 60 * 60,
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

  before(async function () {
    const connection = await network.getOrCreate();
    ethers = connection.ethers;
    time = connection.networkHelpers.time;
  });

  beforeEach(async function () {
    [owner, issuer, trustee, outsider] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("BrazilianMacroOracle");
    oracle = (await Oracle.deploy()) as unknown as BrazilianMacroOracle;
    await oracle.waitForDeployment();

    const MockToken = await ethers.getContractFactory("MockERC20");
    paymentToken = await MockToken.deploy("Brazilian Real Stablecoin", "BRZ", 6);
    await paymentToken.waitForDeployment();
  });

  // ==========================================================================
  // SimpleDebentureRegistry
  // ==========================================================================

  describe("SimpleDebentureRegistry", function () {
    let registry: any;

    beforeEach(async function () {
      const Registry = await ethers.getContractFactory("SimpleDebentureRegistry");
      registry = await Registry.deploy(
        await oracle.getAddress(),
        await paymentToken.getAddress()
      );
      await registry.waitForDeployment();
    });

    it("Should reject a zero oracle address at construction", async function () {
      const Registry = await ethers.getContractFactory("SimpleDebentureRegistry");
      await expect(
        Registry.deploy(ethers.ZeroAddress, await paymentToken.getAddress())
      ).to.be.revertedWith("Invalid oracle address");
    });

    it("Should deploy and register a debenture, minting supply to the caller", async function () {
      const terms = await makeTerms("BRTEST000001");
      await expect(
        registry
          .connect(issuer)
          .createDebenture("Test Deb", "TDEB", terms, ethers.ZeroAddress, trustee.address)
      ).to.emit(registry, "DebentureCreated");

      const addr = await registry.debenturesByISIN("BRTEST000001");
      expect(addr).to.not.equal(ethers.ZeroAddress);
      expect(await registry.getTotalDebentures()).to.equal(1);
      expect(await registry.getAllDebentures()).to.deep.equal([addr]);
      expect(await registry.getIssuerDebentures(issuer.address)).to.deep.equal([addr]);

      // The deployed instance is real and belongs to the caller
      const debenture = await ethers.getContractAt("BrazilianDebenture", addr);
      expect(await debenture.balanceOf(issuer.address)).to.equal(TOTAL_UNITS);
      expect(await debenture.issuer()).to.equal(issuer.address);
      expect(await debenture.trustee()).to.equal(trustee.address);
    });

    it("Should fall back to the default payment token when none is given", async function () {
      const terms = await makeTerms("BRTEST000002");
      await registry
        .connect(issuer)
        .createDebenture("Test Deb", "TDEB", terms, ethers.ZeroAddress, trustee.address);

      const addr = await registry.debenturesByISIN("BRTEST000002");
      const debenture = await ethers.getContractAt("BrazilianDebenture", addr);
      expect(await debenture.paymentToken()).to.equal(await paymentToken.getAddress());
    });

    it("Should reject an ISIN that is not 12 characters", async function () {
      const terms = await makeTerms("SHORT");
      await expect(
        registry
          .connect(issuer)
          .createDebenture("Test Deb", "TDEB", terms, ethers.ZeroAddress, trustee.address)
      ).to.be.revertedWith("Invalid ISIN code");
    });

    it("Should reject a duplicate ISIN", async function () {
      const terms = await makeTerms("BRTEST000003");
      await registry
        .connect(issuer)
        .createDebenture("Test Deb", "TDEB", terms, ethers.ZeroAddress, trustee.address);
      await expect(
        registry
          .connect(outsider)
          .createDebenture("Other", "OTH", terms, ethers.ZeroAddress, trustee.address)
      ).to.be.revertedWith("ISIN already exists");
    });

    it("Should let only the owner register an externally deployed debenture", async function () {
      await expect(
        registry
          .connect(outsider)
          .registerDebenture(outsider.address, "BRTEST000004", issuer.address)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");

      await expect(
        registry.registerDebenture(outsider.address, "BRTEST000004", issuer.address)
      ).to.emit(registry, "DebentureRegistered");
      expect(await registry.debenturesByISIN("BRTEST000004")).to.equal(outsider.address);

      // The same ISIN cannot be registered twice
      await expect(
        registry.registerDebenture(outsider.address, "BRTEST000004", issuer.address)
      ).to.be.revertedWith("ISIN already registered");
    });
  });

  // ==========================================================================
  // DebentureFactory
  // ==========================================================================

  describe("DebentureFactory", function () {
    let factory: any;

    beforeEach(async function () {
      const Factory = await ethers.getContractFactory("DebentureFactory");
      factory = await Factory.deploy(
        await oracle.getAddress(),
        await paymentToken.getAddress()
      );
      await factory.waitForDeployment();
    });

    it("Should reject a zero oracle address at construction", async function () {
      const Factory = await ethers.getContractFactory("DebentureFactory");
      await expect(
        Factory.deploy(ethers.ZeroAddress, await paymentToken.getAddress())
      ).to.be.revertedWith("Invalid oracle");
    });

    it("Should create a debenture and index it in every registry view", async function () {
      const terms = await makeTerms("BRFACT000001");
      await factory
        .connect(issuer)
        .createDebenture("Factory Deb", "FDEB", terms, ethers.ZeroAddress, trustee.address);

      const addr = await factory.getDebentureByISIN("BRFACT000001");
      expect(addr).to.not.equal(ethers.ZeroAddress);
      expect(await factory.getDebentureCount()).to.equal(1);
      expect(await factory.getDebentureAtIndex(0)).to.equal(addr);
      expect(await factory.getIssuerDebentures(issuer.address)).to.deep.equal([addr]);

      const debenture = await ethers.getContractAt("BrazilianDebenture", addr);
      expect(await debenture.balanceOf(issuer.address)).to.equal(TOTAL_UNITS);
    });

    it("Should reject invalid inputs", async function () {
      const terms = await makeTerms("BRFACT000002");
      await expect(
        factory.createDebenture("", "FDEB", terms, ethers.ZeroAddress, trustee.address)
      ).to.be.revertedWith("Invalid name");
      await expect(
        factory.createDebenture("Factory Deb", "", terms, ethers.ZeroAddress, trustee.address)
      ).to.be.revertedWith("Invalid symbol");

      const badIsin = await makeTerms("SHORT");
      await expect(
        factory.createDebenture("Factory Deb", "FDEB", badIsin, ethers.ZeroAddress, trustee.address)
      ).to.be.revertedWith("Invalid ISIN code");
    });

    it("Should reject a duplicate ISIN", async function () {
      const terms = await makeTerms("BRFACT000003");
      await factory.createDebenture("A", "A", terms, ethers.ZeroAddress, trustee.address);
      await expect(
        factory.createDebenture("B", "B", terms, ethers.ZeroAddress, trustee.address)
      ).to.be.revertedWith("ISIN already issued");
    });

    it("Should require a payment token when no default exists", async function () {
      const Factory = await ethers.getContractFactory("DebentureFactory");
      const bare = await Factory.deploy(await oracle.getAddress(), ethers.ZeroAddress);
      const terms = await makeTerms("BRFACT000004");
      await expect(
        bare.createDebenture("A", "A", terms, ethers.ZeroAddress, trustee.address)
      ).to.be.revertedWith("No payment token specified");
    });

    it("Should index out of bounds on getDebentureAtIndex", async function () {
      await expect(factory.getDebentureAtIndex(0)).to.be.revertedWith("Index out of bounds");
    });

    describe("templates", function () {
      it("Should let only the owner manage templates", async function () {
        await expect(
          factory
            .connect(outsider)
            .upsertTemplate("std-180", "Standard", "Semiannual", 180, AmortizationType.PERCENT_VNE)
        ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");

        await factory.upsertTemplate("std-180", "Standard", "Semiannual", 180, AmortizationType.PERCENT_VNE);
        expect(await factory.getTemplateCount()).to.equal(1);
        expect(await factory.getAllTemplateIds()).to.deep.equal(["std-180"]);

        const template = await factory.getTemplate("std-180");
        expect(template.couponFrequencyDays).to.equal(180);
        expect(template.isActive).to.be.true;
      });

      it("Should apply template coupon frequency and amortization type", async function () {
        await factory.upsertTemplate("std-126", "Standard", "126d", 126, AmortizationType.PERCENT_VNA);

        // Deliberately different values in the terms; the template must win.
        const terms = await makeTerms("BRFACT000005", {
          couponFrequencyDays: 999n,
          amortType: AmortizationType.FIXED_VALUE,
        });
        await factory
          .connect(issuer)
          .createDebentureFromTemplate("std-126", "Templated", "TPL", terms, ethers.ZeroAddress);

        const addr = await factory.getDebentureByISIN("BRFACT000005");
        const debenture = await ethers.getContractAt("BrazilianDebenture", addr);
        const stored = await debenture.getTerms();
        expect(stored.couponFrequencyDays).to.equal(126);
        expect(stored.amortType).to.equal(AmortizationType.PERCENT_VNA);
      });

      it("Should refuse creation from a deactivated template until reactivated", async function () {
        await factory.upsertTemplate("std-180", "Standard", "Semiannual", 180, AmortizationType.PERCENT_VNE);
        await factory.deactivateTemplate("std-180");

        const terms = await makeTerms("BRFACT000006");
        await expect(
          factory.createDebentureFromTemplate("std-180", "T", "T", terms, ethers.ZeroAddress)
        ).to.be.revertedWith("Invalid or inactive template");

        await factory.reactivateTemplate("std-180");
        await factory.createDebentureFromTemplate("std-180", "T", "T", terms, ethers.ZeroAddress);
        expect(await factory.getDebentureCount()).to.equal(1);
      });
    });

    describe("admin", function () {
      it("Should let only the owner update oracle and default token, rejecting zero", async function () {
        await expect(
          factory.connect(outsider).setOracle(outsider.address)
        ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
        await expect(factory.setOracle(ethers.ZeroAddress)).to.be.revertedWith("Invalid oracle");
        await expect(factory.setDefaultPaymentToken(ethers.ZeroAddress)).to.be.revertedWith(
          "Invalid payment token"
        );

        await factory.setOracle(outsider.address);
        expect(await factory.oracle()).to.equal(outsider.address);
      });
    });
  });
});
