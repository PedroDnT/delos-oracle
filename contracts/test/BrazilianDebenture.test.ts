import { expect } from "chai";
import { ethers } from "hardhat";
import { BrazilianDebenture, BrazilianMacroOracle } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("BrazilianDebenture", function () {
  let debenture: BrazilianDebenture;
  let oracle: BrazilianMacroOracle;
  let paymentToken: any; // MockERC20
  let issuer: SignerWithAddress;
  let trustee: SignerWithAddress;
  let investor1: SignerWithAddress;
  let investor2: SignerWithAddress;
  let nonWhitelisted: SignerWithAddress;

  // Precision constants
  const PRECISION_PU = 10n ** 6n;      // 6 decimals for PU
  const PRECISION_RATE = 10n ** 4n;    // 4 decimals for rates (basis points)
  const ORACLE_PRECISION = 10n ** 8n;  // 8 decimals for oracle

  // Test values
  const VNE = 1000n * PRECISION_PU;           // 1000 BRL per unit
  const TOTAL_UNITS = 1000n;                   // 1000 debenture units
  const FIXED_RATE = 500n;                     // 5% spread (500 basis points)
  const COUPON_FREQUENCY = 180n;               // 180 days (semiannual)

  // Rate types enum values
  const RateType = {
    PRE: 0,
    DI_SPREAD: 1,
    DI_PERCENT: 2,
    IPCA_SPREAD: 3,
    IGPM_SPREAD: 4
  };

  const AmortizationType = {
    PERCENT_VNE: 0,
    PERCENT_VNA: 1,
    FIXED_VALUE: 2
  };

  const DebentureStatus = {
    ACTIVE: 0,
    MATURED: 1,
    DEFAULTED: 2,
    EARLY_REDEEMED: 3,
    REPACTUATED: 4
  };

  // Helper to create default terms
  async function createDefaultTerms(rateType: number = RateType.IPCA_SPREAD) {
    const now = await time.latest();
    const maturity = now + 365 * 24 * 60 * 60; // 1 year
    const lockUpEnd = now + 30 * 24 * 60 * 60; // 30 days lock-up

    return {
      vne: VNE,
      totalSupplyUnits: TOTAL_UNITS,
      issueDate: now,
      maturityDate: maturity,
      anniversaryDay: 15,
      lockUpEndDate: lockUpEnd,
      rateType: rateType,
      fixedRate: FIXED_RATE,
      percentDI: 100, // 100% of DI for DI_PERCENT type
      couponFrequencyDays: COUPON_FREQUENCY,
      amortType: AmortizationType.PERCENT_VNE,
      isinCode: "BRPETRDBS001",
      cetipCode: "PETR11",
      series: "1a Serie",
      hasRepactuacao: false,
      hasEarlyRedemption: true,
      comboId: ethers.ZeroHash
    };
  }

  // Deploy mock ERC20 for payments
  async function deployMockToken() {
    const MockToken = await ethers.getContractFactory("MockERC20");
    const token = await MockToken.deploy("Brazilian Real Stablecoin", "BRZ", 6);
    await token.waitForDeployment();
    return token;
  }

  beforeEach(async function () {
    [issuer, trustee, investor1, investor2, nonWhitelisted] = await ethers.getSigners();

    // Deploy oracle
    const Oracle = await ethers.getContractFactory("BrazilianMacroOracle");
    oracle = await Oracle.deploy() as unknown as BrazilianMacroOracle;
    await oracle.waitForDeployment();

    // Deploy mock payment token
    paymentToken = await deployMockToken();

    // Setup oracle with initial rates
    await oracle.updateRate("IPCA", 450000000n, 20241115, "BCB-433"); // 4.5%
    await oracle.updateRate("CDI", 1090000000n, 20241115, "BCB-12");  // 10.9%
    await oracle.updateRate("IGPM", 380000000n, 20241115, "BCB-189"); // 3.8%

    // Create default terms
    const terms = await createDefaultTerms();

    // Deploy debenture
    const Debenture = await ethers.getContractFactory("BrazilianDebenture");
    debenture = await Debenture.deploy(
      "Petrobras Debenture 2025 1S",
      "PETR25-1",
      terms,
      await oracle.getAddress(),
      await paymentToken.getAddress(),
      issuer.address,
      trustee.address
    ) as unknown as BrazilianDebenture;
    await debenture.waitForDeployment();

    // Mint payment tokens to issuer for coupon payments
    await paymentToken.mint(issuer.address, 10000000n * PRECISION_PU);
  });

  describe("Initialization", function () {
    it("Should initialize with correct terms", async function () {
      const terms = await debenture.getTerms();
      expect(terms.vne).to.equal(VNE);
      expect(terms.totalSupplyUnits).to.equal(TOTAL_UNITS);
      expect(terms.rateType).to.equal(RateType.IPCA_SPREAD);
      expect(terms.fixedRate).to.equal(FIXED_RATE);
    });

    it("Should mint all tokens to issuer", async function () {
      expect(await debenture.balanceOf(issuer.address)).to.equal(TOTAL_UNITS);
      expect(await debenture.totalSupply()).to.equal(TOTAL_UNITS);
    });

    it("Should set issuer with correct roles", async function () {
      const ADMIN_ROLE = await debenture.ADMIN_ROLE();
      const ISSUER_ROLE = await debenture.ISSUER_ROLE();
      const WHITELIST_ADMIN_ROLE = await debenture.WHITELIST_ADMIN_ROLE();

      expect(await debenture.hasRole(ADMIN_ROLE, issuer.address)).to.be.true;
      expect(await debenture.hasRole(ISSUER_ROLE, issuer.address)).to.be.true;
      expect(await debenture.hasRole(WHITELIST_ADMIN_ROLE, issuer.address)).to.be.true;
    });

    it("Should set trustee with correct roles", async function () {
      const TRUSTEE_ROLE = await debenture.TRUSTEE_ROLE();
      const WHITELIST_ADMIN_ROLE = await debenture.WHITELIST_ADMIN_ROLE();

      expect(await debenture.hasRole(TRUSTEE_ROLE, trustee.address)).to.be.true;
      expect(await debenture.hasRole(WHITELIST_ADMIN_ROLE, trustee.address)).to.be.true;
    });

    it("Should whitelist issuer and trustee by default", async function () {
      expect(await debenture.isWhitelisted(issuer.address)).to.be.true;
      expect(await debenture.isWhitelisted(trustee.address)).to.be.true;
    });

    it("Should initialize VNA equal to VNE", async function () {
      const vnaRecord = await debenture.getVNARecord();
      expect(vnaRecord.value).to.equal(VNE);
    });

    it("Should start with ACTIVE status", async function () {
      expect(await debenture.status()).to.equal(DebentureStatus.ACTIVE);
    });

    it("Should have 6 decimals", async function () {
      expect(await debenture.decimals()).to.equal(6);
    });

    it("Should emit DebentureIssued event", async function () {
      const terms = await createDefaultTerms();
      const Debenture = await ethers.getContractFactory("BrazilianDebenture");

      const newDebenture = await Debenture.deploy(
        "Test Debenture",
        "TEST",
        terms,
        await oracle.getAddress(),
        await paymentToken.getAddress(),
        issuer.address,
        trustee.address
      );

      // Check deployment transaction emitted event
      const receipt = await newDebenture.deploymentTransaction()?.wait();
      const events = receipt?.logs || [];
      const debentureIssuedTopic = newDebenture.interface.getEvent("DebentureIssued")?.topicHash;
      const hasEvent = events.some(log => log.topics[0] === debentureIssuedTopic);
      expect(hasEvent).to.be.true;
    });
  });

  describe("ERC-1404 Transfer Restrictions", function () {
    beforeEach(async function () {
      // Whitelist investor1
      await debenture.connect(issuer).addToWhitelist(investor1.address);
      // Fast forward past lock-up period
      await time.increase(31 * 24 * 60 * 60);
    });

    it("Should allow transfer between whitelisted addresses", async function () {
      await debenture.connect(issuer).transfer(investor1.address, 100n);
      expect(await debenture.balanceOf(investor1.address)).to.equal(100n);
    });

    it("Should reject transfer to non-whitelisted address", async function () {
      await expect(
        debenture.connect(issuer).transfer(nonWhitelisted.address, 100n)
      ).to.be.revertedWith("Address not whitelisted");
    });

    it("Should reject transfer from non-whitelisted address", async function () {
      // Transfer to investor1 first
      await debenture.connect(issuer).transfer(investor1.address, 100n);
      // Remove investor1 from whitelist
      await debenture.connect(issuer).removeFromWhitelist(investor1.address);
      // Whitelist investor2
      await debenture.connect(issuer).addToWhitelist(investor2.address);

      await expect(
        debenture.connect(investor1).transfer(investor2.address, 50n)
      ).to.be.revertedWith("Address not whitelisted");
    });

    it("Should reject transfer when paused", async function () {
      await debenture.connect(issuer).pause();

      await expect(
        debenture.connect(issuer).transfer(investor1.address, 100n)
      ).to.be.revertedWith("Transfers paused");
    });

    it("Should reject transfer involving blacklisted address", async function () {
      await debenture.connect(trustee).addToBlacklist(investor1.address);

      await expect(
        debenture.connect(issuer).transfer(investor1.address, 100n)
      ).to.be.revertedWith("Address blacklisted");
    });

    it("Should enforce lock-up period", async function () {
      // Deploy new debenture with fresh lock-up
      const terms = await createDefaultTerms();
      const Debenture = await ethers.getContractFactory("BrazilianDebenture");
      const newDebenture = await Debenture.deploy(
        "Test Lock-up",
        "LOCK",
        terms,
        await oracle.getAddress(),
        await paymentToken.getAddress(),
        issuer.address,
        trustee.address
      );
      await newDebenture.waitForDeployment();

      // Whitelist investor1
      await newDebenture.connect(issuer).addToWhitelist(investor1.address);
      // Transfer from issuer to investor1 (issuer exempt from lock-up)
      await newDebenture.connect(issuer).transfer(investor1.address, 100n);

      // Whitelist investor2
      await newDebenture.connect(issuer).addToWhitelist(investor2.address);

      // investor1 should not be able to transfer during lock-up
      await expect(
        newDebenture.connect(investor1).transfer(investor2.address, 50n)
      ).to.be.revertedWith("Lock-up period active");
    });

    it("Should return correct restriction codes", async function () {
      expect(
        await debenture.detectTransferRestriction(issuer.address, investor1.address, 100n)
      ).to.equal(0); // SUCCESS

      expect(
        await debenture.detectTransferRestriction(issuer.address, nonWhitelisted.address, 100n)
      ).to.equal(1); // NOT_WHITELISTED
    });

    it("Should return correct messages for restriction codes", async function () {
      expect(await debenture.messageForTransferRestriction(0)).to.equal("Success");
      expect(await debenture.messageForTransferRestriction(1)).to.equal("Address not whitelisted");
      expect(await debenture.messageForTransferRestriction(2)).to.equal("Transfers paused");
      expect(await debenture.messageForTransferRestriction(3)).to.equal("Address blacklisted");
      expect(await debenture.messageForTransferRestriction(4)).to.equal("Lock-up period active");
    });
  });

  describe("Whitelist Management", function () {
    it("Should allow WHITELIST_ADMIN to add addresses", async function () {
      await debenture.connect(issuer).addToWhitelist(investor1.address);
      expect(await debenture.isWhitelisted(investor1.address)).to.be.true;
    });

    it("Should allow WHITELIST_ADMIN to remove addresses", async function () {
      await debenture.connect(issuer).addToWhitelist(investor1.address);
      await debenture.connect(issuer).removeFromWhitelist(investor1.address);
      expect(await debenture.isWhitelisted(investor1.address)).to.be.false;
    });

    it("Should allow batch whitelisting", async function () {
      await debenture.connect(issuer).batchWhitelist([
        investor1.address,
        investor2.address
      ]);
      expect(await debenture.isWhitelisted(investor1.address)).to.be.true;
      expect(await debenture.isWhitelisted(investor2.address)).to.be.true;
    });

    it("Should emit WhitelistUpdated events", async function () {
      await expect(debenture.connect(issuer).addToWhitelist(investor1.address))
        .to.emit(debenture, "WhitelistUpdated")
        .withArgs(investor1.address, true);
    });

    it("Should allow trustee to manage blacklist", async function () {
      await debenture.connect(trustee).addToBlacklist(investor1.address);
      expect(await debenture.isBlacklisted(investor1.address)).to.be.true;

      await debenture.connect(trustee).removeFromBlacklist(investor1.address);
      expect(await debenture.isBlacklisted(investor1.address)).to.be.false;
    });

    it("Should reject non-admin whitelist operations", async function () {
      await expect(
        debenture.connect(investor1).addToWhitelist(investor2.address)
      ).to.be.reverted;
    });
  });

  describe("Amortization Schedule", function () {
    it("Should allow issuer to set amortization schedule", async function () {
      const terms = await debenture.getTerms();
      const issueDate = Number(terms.issueDate);
      const maturityDate = Number(terms.maturityDate);

      // Create dates within the debenture's lifetime
      const midPoint = issueDate + Math.floor((maturityDate - issueDate) / 2);
      const dates = [midPoint, maturityDate];
      const percentages = [5000n, 5000n]; // 50% + 50% = 100%

      await debenture.connect(issuer).setAmortizationSchedule(dates, percentages);

      const schedule = await debenture.getAmortizationSchedule();
      expect(schedule.length).to.equal(2);
      expect(schedule[0].percentage).to.equal(5000n);
      expect(schedule[1].percentage).to.equal(5000n);
    });

    it("Should reject schedule that doesn't sum to 100%", async function () {
      const terms = await debenture.getTerms();
      const maturityDate = Number(terms.maturityDate);
      const dates = [maturityDate - 100]; // Just before maturity
      const percentages = [5000n]; // Only 50%

      await expect(
        debenture.connect(issuer).setAmortizationSchedule(dates, percentages)
      ).to.be.revertedWith("Total must be 100%");
    });

    it("Should reject setting schedule twice", async function () {
      const terms = await debenture.getTerms();
      const maturityDate = Number(terms.maturityDate);
      const dates = [maturityDate];
      const percentages = [10000n]; // 100%

      await debenture.connect(issuer).setAmortizationSchedule(dates, percentages);

      await expect(
        debenture.connect(issuer).setAmortizationSchedule(dates, percentages)
      ).to.be.revertedWith("Schedule already set");
    });

    it("Should reject dates after maturity", async function () {
      const terms = await debenture.getTerms();
      const dates = [Number(terms.maturityDate) + 1];
      const percentages = [10000n];

      await expect(
        debenture.connect(issuer).setAmortizationSchedule(dates, percentages)
      ).to.be.revertedWith("Date after maturity");
    });
  });

  describe("Coupon Calculation", function () {
    it("Should calculate coupon for IPCA_SPREAD type", async function () {
      const [amount, rateUsed] = await debenture.calculateNextCoupon();

      // IPCA (4.5%) + Spread (5%) = 9.5% annual
      // For 180 days: 9.5% * 180/252 H 6.79%
      // Amount per unit: 1000 * 6.79% H 67.86
      expect(amount).to.be.gt(0);
      expect(rateUsed).to.be.gt(0);
    });

    it("Should get current VNA", async function () {
      const vna = await debenture.getCurrentVNA();
      expect(vna).to.equal(VNE);
    });

    it("Should get PU PAR", async function () {
      const puPar = await debenture.getPUPar();
      // At issuance, PU PAR H VNA (no accrued interest yet)
      expect(puPar).to.be.gte(VNE);
    });
  });

  describe("Coupon Recording", function () {
    beforeEach(async function () {
      // Fast forward past first coupon date
      await time.increase(181 * 24 * 60 * 60);
    });

    it("Should allow anyone to record coupon calculation when due", async function () {
      await expect(debenture.connect(investor1).recordCouponCalculation())
        .to.emit(debenture, "CouponCalculated");

      expect(await debenture.getCouponCount()).to.equal(1);
    });

    it("Should reject recording before due date", async function () {
      // Deploy fresh debenture
      const terms = await createDefaultTerms();
      const Debenture = await ethers.getContractFactory("BrazilianDebenture");
      const newDebenture = await Debenture.deploy(
        "Test",
        "TEST",
        terms,
        await oracle.getAddress(),
        await paymentToken.getAddress(),
        issuer.address,
        trustee.address
      );

      await expect(
        newDebenture.recordCouponCalculation()
      ).to.be.revertedWith("Coupon not due yet");
    });

    it("Should store coupon payment record correctly", async function () {
      await debenture.recordCouponCalculation();

      const coupon = await debenture.getCouponPayment(0);
      expect(coupon.calculated).to.be.true;
      expect(coupon.paid).to.be.false;
      expect(coupon.couponAmount).to.be.gt(0);
    });
  });

  describe("Coupon Payment", function () {
    beforeEach(async function () {
      // Setup: whitelist investor, transfer tokens, record coupon
      await debenture.connect(issuer).addToWhitelist(investor1.address);
      await time.increase(31 * 24 * 60 * 60); // Past lock-up
      await debenture.connect(issuer).transfer(investor1.address, 500n);

      await time.increase(150 * 24 * 60 * 60); // Past coupon date
      await debenture.recordCouponCalculation();

      // Approve payment token for coupon payment
      await paymentToken.connect(issuer).approve(
        await debenture.getAddress(),
        10000000n * PRECISION_PU
      );
    });

    it("Should allow issuer to pay coupon", async function () {
      await expect(debenture.connect(issuer).payCoupon(0))
        .to.emit(debenture, "CouponPaid");

      const coupon = await debenture.getCouponPayment(0);
      expect(coupon.paid).to.be.true;
    });

    it("Should allow investor to claim coupon after payment", async function () {
      await debenture.connect(issuer).payCoupon(0);

      const balanceBefore = await paymentToken.balanceOf(investor1.address);
      await debenture.connect(investor1).claimCoupon(0);
      const balanceAfter = await paymentToken.balanceOf(investor1.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should reject claim before payment", async function () {
      await expect(
        debenture.connect(investor1).claimCoupon(0)
      ).to.be.revertedWith("Coupon not paid yet");
    });

    it("Should reject double claim", async function () {
      await debenture.connect(issuer).payCoupon(0);
      await debenture.connect(investor1).claimCoupon(0);

      await expect(
        debenture.connect(investor1).claimCoupon(0)
      ).to.be.revertedWith("Already claimed");
    });

    it("Should reject claim with zero balance", async function () {
      await debenture.connect(issuer).payCoupon(0);

      await expect(
        debenture.connect(investor2).claimCoupon(0)
      ).to.be.revertedWith("No balance");
    });
  });

  describe("Batch Coupon Claiming", function () {
    beforeEach(async function () {
      // Setup multiple coupons
      await debenture.connect(issuer).addToWhitelist(investor1.address);
      await time.increase(31 * 24 * 60 * 60);
      await debenture.connect(issuer).transfer(investor1.address, 500n);

      // Record and pay first coupon
      await time.increase(150 * 24 * 60 * 60);
      await debenture.recordCouponCalculation();
      await paymentToken.connect(issuer).approve(
        await debenture.getAddress(),
        10000000n * PRECISION_PU
      );
      await debenture.connect(issuer).payCoupon(0);

      // Record and pay second coupon
      await time.increase(180 * 24 * 60 * 60);
      await debenture.recordCouponCalculation();
      await debenture.connect(issuer).payCoupon(1);
    });

    it("Should claim all pending coupons in one transaction", async function () {
      const balanceBefore = await paymentToken.balanceOf(investor1.address);

      await debenture.connect(investor1).claimAllCoupons();

      const balanceAfter = await paymentToken.balanceOf(investor1.address);
      expect(balanceAfter).to.be.gt(balanceBefore);

      // Check both coupons are now claimed
      expect(await debenture.claimedCoupons(investor1.address)).to.equal(2);
    });

    it("Should return total amount claimed", async function () {
      const tx = await debenture.connect(investor1).claimAllCoupons();
      const receipt = await tx.wait();

      // Verify multiple CouponClaimed events were emitted
      const events = receipt?.logs.filter(
        log => log.topics[0] === debenture.interface.getEvent("CouponClaimed")?.topicHash
      );
      expect(events?.length).to.equal(2);
    });

    it("Should get pending claims info", async function () {
      const [pendingAmount, pendingCount] = await debenture.getPendingClaims(investor1.address);

      expect(pendingCount).to.equal(2);
      expect(pendingAmount).to.be.gt(0);
    });

    it("Should reject if no coupons to claim", async function () {
      await debenture.connect(investor1).claimAllCoupons();

      await expect(
        debenture.connect(investor1).claimAllCoupons()
      ).to.be.revertedWith("No coupons to claim");
    });
  });

  describe("Special Conditions", function () {
    describe("Maturity", function () {
      it("Should allow marking as matured after maturity date", async function () {
        const terms = await debenture.getTerms();
        await time.increaseTo(Number(terms.maturityDate) + 1);

        await expect(debenture.mature())
          .to.emit(debenture, "StatusChanged")
          .withArgs(DebentureStatus.ACTIVE, DebentureStatus.MATURED, await time.latest() + 1);

        expect(await debenture.status()).to.equal(DebentureStatus.MATURED);
      });

      it("Should reject maturity before date", async function () {
        await expect(debenture.mature())
          .to.be.revertedWith("Not yet matured");
      });
    });

    describe("Default Declaration", function () {
      it("Should allow trustee to declare default", async function () {
        await expect(debenture.connect(trustee).declareDefault())
          .to.emit(debenture, "StatusChanged");

        expect(await debenture.status()).to.equal(DebentureStatus.DEFAULTED);
      });

      it("Should reject default declaration from non-trustee", async function () {
        await expect(
          debenture.connect(issuer).declareDefault()
        ).to.be.reverted;
      });
    });

    describe("Early Redemption", function () {
      it("Should allow issuer to execute early redemption", async function () {
        await paymentToken.connect(issuer).approve(
          await debenture.getAddress(),
          10000000n * PRECISION_PU
        );

        const redemptionPrice = VNE; // 1000 per unit

        await expect(
          debenture.connect(issuer).executeEarlyRedemption(redemptionPrice)
        ).to.emit(debenture, "EarlyRedemptionExecuted");

        expect(await debenture.status()).to.equal(DebentureStatus.EARLY_REDEEMED);
      });

      it("Should reject early redemption if not allowed in terms", async function () {
        // Deploy debenture without early redemption
        const terms = await createDefaultTerms();
        terms.hasEarlyRedemption = false;

        const Debenture = await ethers.getContractFactory("BrazilianDebenture");
        const newDebenture = await Debenture.deploy(
          "No Early Redemption",
          "NOER",
          terms,
          await oracle.getAddress(),
          await paymentToken.getAddress(),
          issuer.address,
          trustee.address
        );

        await paymentToken.connect(issuer).approve(
          await newDebenture.getAddress(),
          10000000n * PRECISION_PU
        );

        await expect(
          newDebenture.connect(issuer).executeEarlyRedemption(VNE)
        ).to.be.revertedWith("Early redemption not allowed");
      });
    });

    describe("Repactuation", function () {
      beforeEach(async function () {
        // Deploy debenture with repactuation allowed
        const terms = await createDefaultTerms();
        terms.hasRepactuacao = true;

        const Debenture = await ethers.getContractFactory("BrazilianDebenture");
        debenture = await Debenture.deploy(
          "With Repactuation",
          "REPAC",
          terms,
          await oracle.getAddress(),
          await paymentToken.getAddress(),
          issuer.address,
          trustee.address
        ) as unknown as BrazilianDebenture;
      });

      it("Should allow trustee to execute repactuation", async function () {
        const newRate = 600n; // 6% new spread

        await expect(
          debenture.connect(trustee).executeRepactuation(newRate)
        ).to.emit(debenture, "RepactuationExecuted")
          .withArgs(newRate, await time.latest() + 1);

        const terms = await debenture.getTerms();
        expect(terms.fixedRate).to.equal(newRate);
      });
    });
  });

  describe("Admin Functions", function () {
    it("Should allow admin to pause", async function () {
      await debenture.connect(issuer).pause();
      expect(await debenture.paused()).to.be.true;
    });

    it("Should allow admin to unpause", async function () {
      await debenture.connect(issuer).pause();
      await debenture.connect(issuer).unpause();
      expect(await debenture.paused()).to.be.false;
    });

    it("Should allow admin to change oracle", async function () {
      // Deploy new oracle
      const Oracle = await ethers.getContractFactory("BrazilianMacroOracle");
      const newOracle = await Oracle.deploy();

      await debenture.connect(issuer).setOracle(await newOracle.getAddress());
      expect(await debenture.oracle()).to.equal(await newOracle.getAddress());
    });

    it("Should reject zero address for oracle", async function () {
      await expect(
        debenture.connect(issuer).setOracle(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid oracle");
    });
  });

  describe("ERC-165 Interface Detection", function () {
    it("Should support ERC-1404 interface", async function () {
      // ERC-1404 interface ID: 0xaf1e6ec2
      expect(await debenture.supportsInterface("0xaf1e6ec2")).to.be.true;
    });

    it("Should support IERC20 interface", async function () {
      // Calculate IERC20 interface ID
      const ierc20InterfaceId = "0x36372b07";
      expect(await debenture.supportsInterface(ierc20InterfaceId)).to.be.true;
    });

    it("Should support AccessControl interface", async function () {
      // AccessControl interface ID
      const accessControlInterfaceId = "0x7965db0b";
      expect(await debenture.supportsInterface(accessControlInterfaceId)).to.be.true;
    });
  });

  describe("View Functions", function () {
    it("Should return terms correctly", async function () {
      const terms = await debenture.getTerms();
      expect(terms.isinCode).to.equal("BRPETRDBS001");
      expect(terms.cetipCode).to.equal("PETR11");
    });

    it("Should return VNA record correctly", async function () {
      const vnaRecord = await debenture.getVNARecord();
      expect(vnaRecord.value).to.equal(VNE);
      expect(vnaRecord.accumulatedFactor).to.equal(10n ** 8n);
    });

    it("Should return coupon count", async function () {
      expect(await debenture.getCouponCount()).to.equal(0);
    });
  });

  describe("DI-Indexed Debentures", function () {
    let diDebenture: BrazilianDebenture;

    beforeEach(async function () {
      const terms = await createDefaultTerms(RateType.DI_SPREAD);

      const Debenture = await ethers.getContractFactory("BrazilianDebenture");
      diDebenture = await Debenture.deploy(
        "DI Debenture",
        "DI-DEB",
        terms,
        await oracle.getAddress(),
        await paymentToken.getAddress(),
        issuer.address,
        trustee.address
      ) as unknown as BrazilianDebenture;
    });

    it("Should initialize with DI factor of 1e9", async function () {
      expect(await diDebenture.accumulatedDIFactor()).to.equal(10n ** 9n);
    });

    it("Should allow admin to update DI factor", async function () {
      // Update with 10.9% DI rate (in basis points * 100 for 4 decimal precision)
      await diDebenture.connect(issuer).updateDIFactor(1090n);

      const newFactor = await diDebenture.accumulatedDIFactor();
      expect(newFactor).to.be.gt(10n ** 9n);
    });
  });
});

// MockERC20 contract for testing
// This should be in a separate file in production
