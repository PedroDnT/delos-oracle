import { expect } from "chai";
import { ethers } from "hardhat";
import { BrazilianMacroOracle } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("BrazilianMacroOracle", function () {
  let oracle: BrazilianMacroOracle;
  let owner: SignerWithAddress;
  let updater: SignerWithAddress;
  let admin: SignerWithAddress;
  let user: SignerWithAddress;

  // Chainlink standard: 8 decimals
  const PRECISION = 10n ** 8n;
  
  // Helper to scale percentage to 8 decimals
  const toAnswer = (percent: number) => BigInt(Math.round(percent * 100_000_000));
  
  // Test values (8 decimals)
  const IPCA_4_50 = toAnswer(4.50);      // 450000000
  const CDI_10_90 = toAnswer(10.90);     // 1090000000
  const SELIC_13_75 = toAnswer(13.75);   // 1375000000
  const PTAX_5_81 = toAnswer(5.81);      // 581000000

  beforeEach(async function () {
    [owner, updater, admin, user] = await ethers.getSigners();
    
    const Oracle = await ethers.getContractFactory("BrazilianMacroOracle");
    oracle = await Oracle.deploy() as unknown as BrazilianMacroOracle;
    await oracle.waitForDeployment();
    
    // Grant roles
    const UPDATER_ROLE = await oracle.UPDATER_ROLE();
    const ADMIN_ROLE = await oracle.ADMIN_ROLE();
    await oracle.grantRole(UPDATER_ROLE, updater.address);
    await oracle.grantRole(ADMIN_ROLE, admin.address);
  });

  describe("Initialization", function () {
    it("Should initialize with 6 core Brazilian macro rates", async function () {
      const rates = await oracle.getSupportedRates();
      expect(rates).to.have.lengthOf(6);
      expect(rates).to.include("IPCA");
      expect(rates).to.include("CDI");
      expect(rates).to.include("SELIC");
      expect(rates).to.include("PTAX");
      expect(rates).to.include("IGPM");
      expect(rates).to.include("TR");
    });

    it("Should set owner as DEFAULT_ADMIN_ROLE, ADMIN_ROLE, and UPDATER_ROLE", async function () {
      const DEFAULT_ADMIN_ROLE = await oracle.DEFAULT_ADMIN_ROLE();
      const ADMIN_ROLE = await oracle.ADMIN_ROLE();
      const UPDATER_ROLE = await oracle.UPDATER_ROLE();
      
      expect(await oracle.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await oracle.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
      expect(await oracle.hasRole(UPDATER_ROLE, owner.address)).to.be.true;
    });

    it("Should have correct metadata for IPCA with 8 decimals", async function () {
      const metadata = await oracle.getRateMetadata("IPCA");
      expect(metadata.name).to.equal("IPCA - Indice de Precos ao Consumidor Amplo");
      expect(metadata.decimals).to.equal(8); // Chainlink standard
      expect(metadata.isActive).to.be.true;
    });

    it("Should have CHAINLINK_DECIMALS constant set to 8", async function () {
      const decimals = await oracle.CHAINLINK_DECIMALS();
      expect(decimals).to.equal(8);
    });

    it("Should have PRECISION constant set to 10^8", async function () {
      const precision = await oracle.PRECISION();
      expect(precision).to.equal(PRECISION);
    });
  });

  describe("Rate Updates (8 decimals)", function () {
    it("Should allow UPDATER_ROLE to update a single rate with 8 decimal precision", async function () {
      await expect(
        oracle.connect(updater).updateRate(
          "IPCA", 
          IPCA_4_50,     // 450000000 = 4.50%
          20241115,
          "BCB-433"
        )
      ).to.emit(oracle, "RateUpdated");

      const rate = await oracle.getRate("IPCA");
      expect(rate.answer).to.equal(IPCA_4_50);
      expect(rate.realWorldDate).to.equal(20241115);
    });

    it("Should reject updates from non-UPDATER accounts", async function () {
      await expect(
        oracle.connect(user).updateRate("IPCA", IPCA_4_50, 20241115, "BCB-433")
      ).to.be.reverted;
    });

    it("Should support batch updates for multiple rates", async function () {
      await oracle.connect(updater).batchUpdateRates(
        ["IPCA", "CDI", "SELIC"],
        [IPCA_4_50, CDI_10_90, SELIC_13_75],
        [20241115, 20241115, 20241115],
        ["BCB-433", "BCB-12", "BCB-432"]
      );

      const [ipcaAnswer] = await oracle.getRate("IPCA");
      const [cdiAnswer] = await oracle.getRate("CDI");
      const [selicAnswer] = await oracle.getRate("SELIC");
      
      expect(ipcaAnswer).to.equal(IPCA_4_50);
      expect(cdiAnswer).to.equal(CDI_10_90);
      expect(selicAnswer).to.equal(SELIC_13_75);
    });

    it("Should reject invalid dates (year < 1900)", async function () {
      await expect(
        oracle.connect(updater).updateRate("IPCA", IPCA_4_50, 18991231, "BCB-433")
      ).to.be.revertedWithCustomError(oracle, "InvalidDate");
    });

    it("Should reject invalid dates (month > 12)", async function () {
      await expect(
        oracle.connect(updater).updateRate("IPCA", IPCA_4_50, 20241315, "BCB-433")
      ).to.be.revertedWithCustomError(oracle, "InvalidDate");
    });

    it("Should reject updates for non-existent rate types", async function () {
      await expect(
        oracle.connect(updater).updateRate("INVALID", IPCA_4_50, 20241115, "BCB-999")
      ).to.be.revertedWithCustomError(oracle, "RateDoesNotExist");
    });

    it("Should reject updates when paused", async function () {
      await oracle.connect(admin).pause();
      
      await expect(
        oracle.connect(updater).updateRate("IPCA", IPCA_4_50, 20241115, "BCB-433")
      ).to.be.revertedWithCustomError(oracle, "EnforcedPause");
    });
  });

  describe("Same Date Handling", function () {
    it("Should reject single update if date is the same", async function () {
      // First update
      await oracle.connect(updater).updateRate("CDI", CDI_10_90, 20241115, "BCB-12");
      
      // Second update with same date should revert
      await expect(
        oracle.connect(updater).updateRate("CDI", toAnswer(11.00), 20241115, "BCB-12")
      ).to.be.revertedWithCustomError(oracle, "SameDateUpdate");
    });

    it("Should skip same-date rates in batch update without reverting", async function () {
      // First update
      await oracle.connect(updater).updateRate("CDI", CDI_10_90, 20241115, "BCB-12");
      
      // Batch update with mixed dates - should only update IPCA (new date)
      const tx = await oracle.connect(updater).batchUpdateRates(
        ["CDI", "IPCA"],
        [toAnswer(11.00), IPCA_4_50],
        [20241115, 20241116],  // CDI same date, IPCA new date
        ["BCB-12", "BCB-433"]
      );
      
      const receipt = await tx.wait();
      
      // CDI should remain unchanged (same date)
      const [cdiAnswer] = await oracle.getRate("CDI");
      expect(cdiAnswer).to.equal(CDI_10_90);
      
      // IPCA should be updated (new date)
      const [ipcaAnswer] = await oracle.getRate("IPCA");
      expect(ipcaAnswer).to.equal(IPCA_4_50);
    });

    it("Should return count of updated rates from batch", async function () {
      await oracle.connect(updater).updateRate("CDI", CDI_10_90, 20241115, "BCB-12");
      
      // Batch with 1 same-date (skip) and 2 new
      const result = await oracle.connect(updater).batchUpdateRates.staticCall(
        ["CDI", "IPCA", "SELIC"],
        [toAnswer(11.00), IPCA_4_50, SELIC_13_75],
        [20241115, 20241116, 20241116],
        ["BCB-12", "BCB-433", "BCB-432"]
      );
      
      expect(result).to.equal(2); // Only IPCA and SELIC updated
    });
  });

  describe("Circuit Breakers", function () {
    it("Should reject answer below minimum", async function () {
      // IPCA min is -10% = -1000000000
      await expect(
        oracle.connect(updater).updateRate("IPCA", toAnswer(-15), 20241115, "BCB-433")
      ).to.be.revertedWithCustomError(oracle, "AnswerBelowMin");
    });

    it("Should reject answer above maximum", async function () {
      // CDI max is 50% = 5000000000
      await expect(
        oracle.connect(updater).updateRate("CDI", toAnswer(60), 20241115, "BCB-12")
      ).to.be.revertedWithCustomError(oracle, "AnswerAboveMax");
    });

    it("Should allow admin to update bounds", async function () {
      await oracle.connect(admin).updateBounds("CDI", 0, toAnswer(100));
      
      // Now 60% should be accepted
      await expect(
        oracle.connect(updater).updateRate("CDI", toAnswer(60), 20241115, "BCB-12")
      ).to.emit(oracle, "RateUpdated");
    });

    it("Should skip out-of-bounds values in batch without reverting", async function () {
      const result = await oracle.connect(updater).batchUpdateRates.staticCall(
        ["CDI", "IPCA"],
        [toAnswer(60), IPCA_4_50],  // CDI out of bounds, IPCA valid
        [20241115, 20241115],
        ["BCB-12", "BCB-433"]
      );
      
      expect(result).to.equal(1); // Only IPCA updated
    });
  });

  describe("Historical Data", function () {
    beforeEach(async function () {
      // Add 3 historical updates for IPCA
      await oracle.connect(updater).updateRate("IPCA", toAnswer(4.00), 20241001, "BCB-433");
      await oracle.connect(updater).updateRate("IPCA", toAnswer(4.20), 20241015, "BCB-433");
      await oracle.connect(updater).updateRate("IPCA", toAnswer(4.50), 20241115, "BCB-433");
    });

    it("Should store history correctly", async function () {
      const history = await oracle.getRateHistory("IPCA", 0);
      expect(history).to.have.lengthOf(2);
    });

    it("Should return most recent history first", async function () {
      const history = await oracle.getRateHistory("IPCA", 0);
      expect(history[0].answer).to.equal(toAnswer(4.20));
      expect(history[1].answer).to.equal(toAnswer(4.00));
    });

    it("Should return full rate data with 8 decimal answer", async function () {
      const rateData = await oracle.getRateFull("IPCA");
      expect(rateData.answer).to.equal(toAnswer(4.50));
      expect(rateData.realWorldDate).to.equal(20241115);
      expect(rateData.source).to.equal("BCB-433");
    });
  });

  describe("Chainlink AggregatorV3Interface Compatibility", function () {
    beforeEach(async function () {
      await oracle.connect(updater).updateRate("CDI", CDI_10_90, 20241115, "BCB-12");
    });

    it("Should return latestRoundData with 8 decimal answer", async function () {
      const roundData = await oracle.latestRoundData("CDI");
      
      expect(roundData.roundId).to.be.greaterThan(0);
      expect(roundData.answer).to.equal(CDI_10_90); // 1090000000
      expect(roundData.startedAt).to.be.greaterThan(0);
      expect(roundData.updatedAt).to.be.greaterThan(0);
      expect(roundData.answeredInRound).to.equal(roundData.roundId);
    });

    it("Should return 8 decimals for all rates", async function () {
      for (const rate of ["IPCA", "CDI", "SELIC", "PTAX", "IGPM", "TR"]) {
        const decimals = await oracle.decimals(rate);
        expect(decimals).to.equal(8);
      }
    });

    it("Should return description for a rate", async function () {
      const desc = await oracle.description("CDI");
      expect(desc).to.equal("Interbank deposit rate, daily benchmark");
    });

    it("Should return version", async function () {
      const version = await oracle.version();
      expect(version).to.equal(1);
    });
  });

  describe("Helper Functions", function () {
    it("Should convert answer to percentage correctly", async function () {
      const [whole, fractional] = await oracle.answerToPercentage(CDI_10_90);
      expect(whole).to.equal(10);
      expect(fractional).to.equal(90000000); // 0.90 * 10^8
    });

    it("Should handle negative percentages", async function () {
      const negativeAnswer = toAnswer(-2.5);
      const [whole, fractional] = await oracle.answerToPercentage(negativeAnswer);
      expect(whole).to.equal(-2);
      expect(fractional).to.equal(50000000); // 0.5 * 10^8
    });
  });

  describe("Staleness Detection", function () {
    it("Should report fresh data as not stale", async function () {
      await oracle.connect(updater).updateRate("CDI", CDI_10_90, 20241115, "BCB-12");
      
      const isStale = await oracle.isRateStale("CDI");
      expect(isStale).to.be.false;
    });

    it("Should report rate as stale with no updates", async function () {
      const isStale = await oracle.isRateStale("IPCA");
      expect(isStale).to.be.true;
    });
  });

  describe("Rate Administration", function () {
    it("Should allow ADMIN_ROLE to add new rate types with 8 decimals", async function () {
      await expect(
        oracle.connect(admin).addRate(
          "TJLP",
          "TJLP - Taxa de Juros de Longo Prazo",
          "Long-term interest rate",
          8,           // decimals
          30 * 86400,  // heartbeat
          0,           // min
          toAnswer(30) // max
        )
      ).to.emit(oracle, "RateAdded");

      const metadata = await oracle.getRateMetadata("TJLP");
      expect(metadata.decimals).to.equal(8);
    });

    it("Should reject duplicate rate types", async function () {
      await expect(
        oracle.connect(admin).addRate("IPCA", "Dup", "Dup", 8, 86400, 0, toAnswer(100))
      ).to.be.revertedWithCustomError(oracle, "RateAlreadyExists");
    });

    it("Should allow deactivation and reject updates to deactivated rates", async function () {
      await oracle.connect(admin).deactivateRate("IPCA");
      
      await expect(
        oracle.connect(updater).updateRate("IPCA", IPCA_4_50, 20241115, "BCB-433")
      ).to.be.revertedWithCustomError(oracle, "RateNotActive");
    });
  });
});
