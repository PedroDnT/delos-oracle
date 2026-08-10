# DELOS Platform - Business Workflows & User Journeys

> **⚠️ PROPOSED WORKFLOWS**: This document describes hypothetical user journeys for a production implementation. The current implementation is an explorational blueprint demonstrating technical capabilities on testnet.

**Version:** 1.0.0
**Last Updated:** December 15, 2024
**Purpose:** Proposed end-to-end workflows for potential platform participants

---

## Table of Contents

1. [Overview](#overview)
2. [Actor Definitions](#actor-definitions)
3. [Issuer Workflows](#issuer-workflows)
4. [Investor Workflows](#investor-workflows)
5. [DeFi Protocol Workflows](#defi-protocol-workflows)
6. [Platform Operator Workflows](#platform-operator-workflows)
7. [State Transition Diagrams](#state-transition-diagrams)
8. [Error Handling](#error-handling)

---

## Overview

This document provides comprehensive workflows for all DELOS platform interactions. Each workflow includes:
- **Step-by-step process**
- **On-chain vs off-chain actions**
- **Gas costs**
- **Time estimates**
- **Error scenarios**

**Legend:**
- 🌐 On-chain action (requires gas)
- 💻 Off-chain action (frontend/backend)
- 📋 Manual/human action
- ⏱️ Automated action (scheduler)

---

## Actor Definitions

| Actor | Role | Capabilities | Examples |
|-------|------|--------------|----------|
| **Issuer** | Debenture creator | Deploy, manage, pay coupons | Petrobras, Vale, Itaú |
| **Investor** | Token holder | Buy, hold, claim coupons, sell | Retail investors, funds |
| **Trustee** | Fiduciary agent | Monitor compliance, protect investors | Oliveira Trust, Pentágono |
| **Oracle Updater** | Data provider | Fetch BCB rates, update oracle | DELOS backend (future: network) |
| **DeFi Protocol** | Oracle consumer | Query rates, build products | Lending protocols, DEXs |
| **Whitelist Admin** | KYC manager | Approve/reject investors | Issuer, custodian, exchange |
| **Platform Admin** | System operator | Emergency controls, upgrades | DELOS team (future: DAO) |

---

## Issuer Workflows

### Workflow 1: Create and Issue Debenture

**Goal:** Launch a new tokenized debenture
**Duration:** 2-5 days (including preparation)
**Total Cost:** ~$50-100 (gas + fees)

#### Phase 1: Preparation (Off-Chain) 📋

**Step 1.1: Design Debenture Terms**
```
📋 Issuer determines:
   ├── Total issuance amount (e.g., R$ 10 million)
   ├── Unit value (VNE): e.g., R$ 1,000 per token
   ├── Total units: 10,000 tokens
   ├── Maturity: 2 years
   ├── Rate structure: IPCA + 5.00% spread
   ├── Coupon frequency: Semi-annual (every 180 days)
   ├── Amortization: Bullet (100% at maturity)
   └── Special clauses: Early redemption, repactuation

⏱️ Duration: 1-2 days
💰 Cost: Legal review ($2,000-5,000)
```

**Step 1.2: Generate Unique Identifiers**
```
📋 Issuer creates:
   ├── ISIN code: BR + Issuer (6 chars) + Unique (5 digits) = 12 chars
   │   Example: BRPETR000001
   ├── CETIP code: Simplified identifier (e.g., PETR26)
   └── Series: "1ª Série"

⏱️ Duration: 1 hour
💰 Cost: $0
```

**Step 1.3: Prepare Legal Documentation**
```
📋 Issuer prepares:
   ├── Deed of issue (escritura de emissão)
   ├── Indenture (contrato)
   ├── Prospectus
   ├── Credit rating report (if applicable)
   └── CVM registration (if required)

⏱️ Duration: 1-3 days
💰 Cost: $5,000-20,000 (lawyers, CVM fees)
```

#### Phase 2: On-Chain Deployment 🌐

**Step 2.1: Connect Wallet**
```
💻 Issuer:
   ├── Opens delos.finance/issue
   ├── Connects wallet (MetaMask, WalletConnect)
   ├── Confirms wallet has sufficient ETH for gas (~$50)
   └── Wallet address becomes issuer address

⏱️ Duration: 2 minutes
💰 Cost: $0
```

**Step 2.2: Fill Debenture Creation Form**
```
💻 Issuer inputs:
   ┌─────────────────────────────────────────────────┐
   │ BASIC INFORMATION                                │
   ├─────────────────────────────────────────────────┤
   │ Name: Petrobras IPCA+ 2026                      │
   │ Symbol: PETR26                                   │
   │ ISIN: BRPETR000001                              │
   │ CETIP Code: PETR26                              │
   │ Series: 1ª Série                                │
   ├─────────────────────────────────────────────────┤
   │ FINANCIAL TERMS                                  │
   ├─────────────────────────────────────────────────┤
   │ VNE (per unit): R$ 1,000.00                     │
   │ Total Units: 10,000                             │
   │ Total Value: R$ 10,000,000.00                   │
   │ Issue Date: 2024-12-15 (today)                  │
   │ Maturity Date: 2026-12-15 (2 years)             │
   ├─────────────────────────────────────────────────┤
   │ RATE STRUCTURE                                   │
   ├─────────────────────────────────────────────────┤
   │ Index: [IPCA_SPREAD ▼]                          │
   │ Spread: 5.00% p.a.                              │
   │ Anniversary Day: 15 (for IPCA calculations)     │
   ├─────────────────────────────────────────────────┤
   │ PAYMENT TERMS                                    │
   ├─────────────────────────────────────────────────┤
   │ Coupon Frequency: Semi-annual (180 days)        │
   │ Amortization Type: Bullet (100% at maturity)    │
   │ Lock-up Period: 30 days                         │
   ├─────────────────────────────────────────────────┤
   │ ADVANCED OPTIONS                                 │
   ├─────────────────────────────────────────────────┤
   │ ☑ Allow Early Redemption                        │
   │ ☐ Allow Repactuation                            │
   │ Payment Token: [Default Factory Token ▼]        │
   │ Trustee: [Same as Issuer ▼]                     │
   └─────────────────────────────────────────────────┘

⏱️ Duration: 10-15 minutes
💰 Cost: $0
```

**Step 2.3: Review and Deploy**
```
💻 Frontend validates:
   ├── ISIN format (12 characters)
   ├── VNE > 0
   ├── Total units > 0
   ├── Maturity > Issue date
   ├── Spread reasonable (0-50%)
   └── Anniversary day valid (1-31)

💻 Frontend shows summary:
   ┌─────────────────────────────────────────────────┐
   │ DEPLOYMENT SUMMARY                               │
   ├─────────────────────────────────────────────────┤
   │ Total Value: R$ 10,000,000                      │
   │ Tokens Minted: 10,000 PETR26                    │
   │ Receiver: 0x1234...5678 (your address)          │
   │ Gas Estimate: ~$15                              │
   │                                                  │
   │ [Cancel]  [Confirm and Deploy ✓]               │
   └─────────────────────────────────────────────────┘

📋 Issuer clicks "Confirm and Deploy"

🌐 Transaction sent to DebentureCloneFactory.createDebenture()

⏱️ Duration: 1 minute (form) + 30 seconds (tx confirmation)
💰 Cost: ~$10-15 gas
```

**Step 2.4: Deployment Confirmation**
```
🌐 On-chain events:
   ├── Factory creates minimal proxy clone (~45 bytes)
   ├── Clone initialized with terms
   ├── 10,000 PETR26 tokens minted to issuer
   ├── Debenture registered in factory registry
   └── DebentureCreated event emitted

💻 Frontend shows:
   ┌─────────────────────────────────────────────────┐
   │ ✅ DEBENTURE CREATED SUCCESSFULLY!              │
   ├─────────────────────────────────────────────────┤
   │ Name: Petrobras IPCA+ 2026                      │
   │ Address: 0xabcd...ef01                          │
   │ Tx Hash: 0x7890...1234                          │
   │ Block: 12,345,678                               │
   │ Gas Used: 450,000 (~$12.50)                     │
   │                                                  │
   │ Your balance: 10,000 PETR26                     │
   │                                                  │
   │ [View on Explorer] [Manage Debenture]          │
   └─────────────────────────────────────────────────┘

⏱️ Duration: 10-30 seconds
💰 Cost: Included in previous step
```

#### Phase 3: Investor Onboarding 📋🌐

**Step 3.1: Collect KYC from Investors**
```
📋 Issuer:
   ├── Shares investment opportunity (off-chain)
   ├── Collects investor interest
   ├── Sends KYC forms (CPF, address, income, etc.)
   ├── Verifies documents
   └── Approves qualified investors

💻 Future: Automated KYC via integration

⏱️ Duration: 2-7 days per investor
💰 Cost: KYC provider fees ($10-50 per investor)
```

**Step 3.2: Whitelist Approved Investors**
```
💻 Issuer accesses debenture management page:
   ┌─────────────────────────────────────────────────┐
   │ DEBENTURE MANAGEMENT - PETR26                    │
   ├─────────────────────────────────────────────────┤
   │ [Overview] [Investors] [Coupons] [Settings]     │
   ├─────────────────────────────────────────────────┤
   │ WHITELIST MANAGEMENT                             │
   ├─────────────────────────────────────────────────┤
   │ Add Investor:                                    │
   │ Address: [0x...]                     [Add ✓]    │
   │                                                  │
   │ OR Batch Add (CSV):                             │
   │ [Upload CSV] (format: address,name,email)       │
   │                                                  │
   │ Current Whitelist (15 investors):               │
   │ ├─ 0x1111... João Silva         [Remove]       │
   │ ├─ 0x2222... Maria Santos       [Remove]       │
   │ └─ 0x3333... Pedro Costa        [Remove]       │
   └─────────────────────────────────────────────────┘

🌐 Calls debenture.addToWhitelist(address) for each investor

⏱️ Duration: 1-2 minutes per investor (or batch)
💰 Cost: ~$1-2 gas per investor
```

**Step 3.3: Distribute Tokens**
```
💻 Issuer distributes tokens:

   Option A: Direct Transfer
   ├── Calls debenture.transfer(investor, amount)
   └── Gas: ~$2-3 per transfer

   Option B: Claim Portal
   ├── Investors claim tokens themselves
   ├── Issuer approves claim list
   └── Gas paid by investors

   Option C: Airdrop (Future)
   ├── Batch transfer to multiple addresses
   └── Gas: ~$20-30 for 100 investors

🌐 ERC-20 transfer events

⏱️ Duration: 5-30 minutes (depending on method)
💰 Cost: $2-3 per investor (Option A)
```

---

### Workflow 2: Record and Pay Coupons

**Goal:** Calculate and distribute semi-annual coupon payments
**Frequency:** Every 180 days
**Total Cost:** ~$50-200 (depending on number of investors)

#### Phase 1: Coupon Calculation ⏱️🌐

**Step 1.1: Oracle Fetches IPCA Rate**
```
⏱️ Automated (10th of month, 19:00 BRT):
   ├── Backend BCB Client fetches IPCA from BCB API
   ├── Validates rate (within bounds)
   ├── Oracle Updater signs transaction
   └── Calls oracle.updateRate("IPCA", value, date)

🌐 IPCA rate now available on-chain

Example: IPCA = 4.50% annual → 450,000,000 (8 decimals)

⏱️ Duration: 1 minute
💰 Cost: ~$2 gas (paid by platform)
```

**Step 1.2: Debenture Queries Oracle**
```
🌐 Anyone can call debenture.calculateCouponPreview():
   ├── Queries oracle.getRate("IPCA")
   ├── Returns: (4.50%, timestamp, 20241110)
   ├── Calculates coupon: VNA × (IPCA + Spread) × (Days / 252)
   │   Example: 1000 × (0.045 + 0.05) × (180 / 252) = R$ 67.86 per unit
   └── Returns estimated coupon amount

💻 Frontend displays:
   "Estimated coupon: R$ 67.86 per unit"
   "Total for 10,000 units: R$ 678,600"

⏱️ Duration: Instant (read-only)
💰 Cost: ~$0.50 gas
```

#### Phase 2: Coupon Recording 🌐

**Step 2.1: Issuer Records Coupon**
```
💻 Issuer accesses "Coupons" tab:
   ┌─────────────────────────────────────────────────┐
   │ COUPON MANAGEMENT                                │
   ├─────────────────────────────────────────────────┤
   │ Next Coupon Due: 2025-06-15 (in 45 days)       │
   │ Estimated Amount: R$ 678,600                    │
   │                                                  │
   │ [Record Coupon Now]                             │
   └─────────────────────────────────────────────────┘

📋 Issuer clicks "Record Coupon Now"

🌐 Calls debenture.recordCoupon():
   ├── Fetches current IPCA from oracle
   ├── Calculates PU per unit
   ├── Records in couponRecords array
   ├── Emits CouponRecorded event
   └── Investors can now claim

⏱️ Duration: 1 minute
💰 Cost: ~$5 gas
```

#### Phase 3: Coupon Payment 🌐

**Option A: Issuer Pays All (Recommended)**

**Step 3.1: Issuer Approves Payment Token**
```
💻 Issuer:
   ├── Checks total coupon amount: R$ 678,600
   ├── Ensures USDC/BRZ balance sufficient
   └── Approves debenture contract to spend USDC

🌐 Calls paymentToken.approve(debenture, 678600 * 10^6)

⏱️ Duration: 1 minute
💰 Cost: ~$1 gas
```

**Step 3.2: Issuer Pays All Investors**
```
💻 Issuer clicks "Pay All Coupons":
   ┌─────────────────────────────────────────────────┐
   │ PAY ALL INVESTORS                                │
   ├─────────────────────────────────────────────────┤
   │ Investors: 15                                    │
   │ Total Amount: R$ 678,600                        │
   │ Payment Token: USDC                             │
   │ Estimated Gas: ~$45 (15 × $3)                   │
   │                                                  │
   │ This will pay all 15 investors automatically.   │
   │                                                  │
   │ [Cancel] [Confirm Payment ✓]                   │
   └─────────────────────────────────────────────────┘

🌐 Calls debenture.payAllCoupons(couponIndex):
   ├── Loops through all token holders
   ├── Calculates each investor's share
   ├── Transfers payment token to each
   └── Marks coupon as paid

⏱️ Duration: 2-5 minutes
💰 Cost: ~$3 per investor × 15 = $45
```

**Option B: Investors Claim Individually**

**Step 3.1: Investor Checks Pending Coupons**
```
💻 Investor visits delos.finance/portfolio:
   ┌─────────────────────────────────────────────────┐
   │ YOUR PORTFOLIO                                   │
   ├─────────────────────────────────────────────────┤
   │ PETR26 - Petrobras IPCA+ 2026                   │
   │ Balance: 500 units                              │
   │ Current Value: R$ 500,000                       │
   │                                                  │
   │ 💰 PENDING COUPONS: 1                           │
   │ ├─ Coupon #0: R$ 33,930 (500 units × R$ 67.86) │
   │ │  Record Date: 2024-12-15                      │
   │ │  [Claim Now ✓]                                │
   │                                                  │
   │ [Claim All Coupons]                             │
   └─────────────────────────────────────────────────┘

⏱️ Duration: Instant (read-only)
💰 Cost: $0
```

**Step 3.2: Investor Claims Coupon**
```
📋 Investor clicks "Claim Now"

🌐 Calls debenture.claimCoupon(0):
   ├── Verifies investor has balance at record date
   ├── Calculates investor's share
   ├── Transfers payment token to investor
   ├── Marks coupon as claimed for this investor
   └── Emits CouponClaimed event

💻 Frontend shows:
   "✅ Claimed R$ 33,930 successfully!"

⏱️ Duration: 30 seconds
💰 Cost: ~$2-3 gas (paid by investor)
```

---

### Workflow 3: Maturity and Redemption

**Goal:** Final payment and debenture closure
**Duration:** 1-2 days
**Total Cost:** ~$100-500

**Step 1: Final Coupon**
```
⏱️ On maturity date:
   ├── Issue final coupon (same as Workflow 2)
   └── Investors claim or issuer pays

⏱️ Duration: Same as regular coupon
💰 Cost: Same as regular coupon
```

**Step 2: Principal Repayment**
```
🌐 Issuer calls debenture.executeAmortization(finalIndex):
   ├── Calculates total principal (VNA × units)
   ├── Transfers payment token to all holders
   ├── Burns all tokens (balance → 0)
   └── Sets status = MATURED

💻 Investors receive final principal payment

⏱️ Duration: 5-10 minutes
💰 Cost: ~$5-10 per investor
```

**Step 3: Debenture Closure**
```
🌐 Debenture contract state:
   ├── Status: MATURED
   ├── Total Supply: 0
   ├── All coupons claimed
   └── Contract effectively frozen

💻 Frontend shows:
   "This debenture has matured and is now closed."

⏱️ Duration: Instant
💰 Cost: $0
```

---

## Investor Workflows

### Workflow 4: Invest in Primary Issuance

**Goal:** Purchase newly issued debenture tokens
**Duration:** 3-7 days
**Total Cost:** Investment amount + KYC ($10-50)

**Step 1: Discovery**
```
💻 Investor:
   ├── Browses delos.finance/explore
   ├── Filters by: Rate type, maturity, issuer
   ├── Views debenture details
   └── Decides to invest

📋 Example view:
   ┌─────────────────────────────────────────────────┐
   │ PETR26 - Petrobras IPCA+ 2026                   │
   ├─────────────────────────────────────────────────┤
   │ Issuer: Petrobras S.A.                          │
   │ Rating: AAA (Fitch)                             │
   │ Rate: IPCA + 5.00% p.a.                         │
   │ Maturity: 2026-12-15 (2 years)                  │
   │ VNE: R$ 1,000 per unit                          │
   │ Available: 8,000 units (of 10,000)              │
   │                                                  │
   │ [Request Investment]                            │
   └─────────────────────────────────────────────────┘

⏱️ Duration: 10-30 minutes (research)
💰 Cost: $0
```

**Step 2: KYC Submission**
```
📋 Investor clicks "Request Investment":
   ├── Frontend redirects to KYC portal
   ├── Investor submits:
   │   ├── Full name, CPF, address
   │   ├── Income proof
   │   ├── Proof of residence
   │   ├── Wallet address
   │   └── Investment amount desired
   └── KYC provider validates (1-3 days)

⏱️ Duration: 30 minutes (submission) + 1-3 days (approval)
💰 Cost: KYC fee ($10-50)
```

**Step 3: Whitelisting**
```
📋 Issuer reviews KYC results:
   ├── Approves qualified investor
   └── Adds to whitelist (see Workflow 1, Step 3.2)

🌐 Investor's address added to whitelist

💻 Investor receives email:
   "You have been approved for PETR26 investment!"

⏱️ Duration: Included in KYC approval
💰 Cost: $0 (paid by issuer)
```

**Step 4: Purchase Tokens**
```
💻 Investor:
   ├── Receives transfer from issuer OR
   ├── Purchases on primary market OR
   └── Receives airdrop

🌐 ERC-20 transfer event

💻 Investor's wallet now shows PETR26 balance

⏱️ Duration: Instant (on-chain)
💰 Cost: Depends on purchase method
```

---

### Workflow 5: Trade on Secondary Market

**Goal:** Buy or sell debenture tokens on secondary market
**Duration:** Minutes to hours
**Total Cost:** Gas + DEX fees

**Step 1: Listing (Seller)**
```
💻 Seller (current token holder):
   ├── Opens Uniswap or compatible DEX
   ├── Selects PETR26 token
   ├── Sets price (e.g., 1 PETR26 = 1,050 USDC)
   │   (Above VNE due to accrued interest)
   └── Lists for sale

⏱️ Duration: 2-3 minutes
💰 Cost: ~$3-5 gas (approval + listing)
```

**Step 2: Purchase (Buyer)**
```
📋 Buyer MUST be whitelisted first!
   ├── Complete KYC (see Workflow 4, Step 2)
   └── Get whitelisted by issuer

💻 Buyer:
   ├── Opens DEX
   ├── Finds PETR26 listing
   ├── Executes swap: 1,050 USDC → 1 PETR26
   └── Transfer succeeds (ERC-1404 checks whitelist)

🌐 Transfer event
   ├── debenture.transfer() called by DEX
   ├── detectTransferRestriction() checks whitelist
   ├── Buyer is whitelisted ✅
   └── Transfer succeeds

⏱️ Duration: 1-2 minutes
💰 Cost: ~$5-10 gas + DEX fees (0.3%)
```

**Error Scenario: Not Whitelisted**
```
💻 Non-whitelisted buyer attempts purchase:

🌐 debenture.transfer() reverts:
   ├── detectTransferRestriction() returns NOT_WHITELISTED (code 1)
   └── Transaction fails

💻 Error message:
   "Transfer failed: Recipient not whitelisted. Please complete KYC."

⏱️ Duration: Instant failure
💰 Cost: ~$2 gas (failed transaction)
```

---

## DeFi Protocol Workflows

### Workflow 6: Integrate DELOS Oracle

**Goal:** Use Brazilian macro rates in DeFi protocol
**Duration:** 1-3 hours (development) + ongoing queries
**Total Cost:** ~$0.50 per query

**Step 1: Contract Integration**
```
💻 DeFi developer:
   ├── Imports IBrazilianMacroOracle interface
   ├── Stores oracle address in contract
   └── Implements rate query function

Example:
```solidity
import "./IBrazilianMacroOracle.sol";

contract BrazilianStablecoin {
    IBrazilianMacroOracle public oracle;

    constructor(address _oracle) {
        oracle = IBrazilianMacroOracle(_oracle);
    }

    function getCurrentIPCA() public view returns (int256) {
        (int256 rate, uint256 timestamp, uint256 date) =
            oracle.getRate("IPCA");
        require(block.timestamp - timestamp < 48 hours, "Stale");
        return rate;
    }
}
```

⏱️ Duration: 1-2 hours
💰 Cost: $0 (development)
```

**Step 2: Query Oracle**
```
🌐 Protocol calls oracle.getRate("IPCA"):
   ├── Returns: (450000000, 1702328400, 20241110)
   │   ├── Rate: 4.50% (450000000 / 10^8)
   │   ├── Timestamp: 1702328400 (Unix)
   │   └── Real-world date: 2024-11-10
   └── Protocol uses rate in calculations

⏱️ Duration: Instant (on-chain read)
💰 Cost: ~$0.50 gas
```

**Step 3: Monitor Rate Updates**
```
💻 Protocol subscribes to RateUpdated events:

🌐 Event: RateUpdated("IPCA", 455000000, 20241210, ...)
   ├── Protocol detects rate change
   ├── Triggers rebalance logic
   └── Adjusts protocol parameters

⏱️ Duration: Real-time
💰 Cost: $0 (listening to events)
```

---

## Platform Operator Workflows

### Workflow 7: Daily Oracle Updates

**Goal:** Keep on-chain rates fresh and accurate
**Frequency:** Daily (19:00 BRT) for CDI, SELIC, PTAX, TR; Monthly (10th) for IPCA, IGP-M
**Total Cost:** ~$50-100/month

**Step 1: Scheduled Trigger**
```
⏱️ APScheduler triggers at 19:00 BRT:
   ├── Scheduler.py cron job executes
   └── Calls OracleUpdater.update_daily_rates()

⏱️ Duration: Instant
💰 Cost: $0
```

**Step 2: Fetch Rates from BCB**
```
💻 BCB Client:
   ├── Parallel async requests to BCB API:
   │   ├── GET /dados/serie/12/dados/ultimos/1   (CDI)
   │   ├── GET /dados/serie/432/dados/ultimos/1  (SELIC)
   │   ├── GET /dados/serie/1/dados/ultimos/1    (PTAX)
   │   └── GET /dados/serie/226/dados/ultimos/1  (TR)
   ├── Receives responses (JSON)
   ├── Validates format
   ├── Normalizes to 8 decimals
   └── Returns rate objects

Example response:
{
  "CDI": {"value": 11.15, "date": "2024-12-14"},
  "SELIC": {"value": 11.25, "date": "2024-12-14"},
  "PTAX": {"value": 5.95, "date": "2024-12-14"},
  "TR": {"value": 0.09, "date": "2024-12-14"}
}

⏱️ Duration: 2-5 seconds
💰 Cost: $0 (BCB API is free)
```

**Step 3: Validate and Detect Anomalies**
```
💻 Anomaly Detector:
   ├── Checks each rate against bounds:
   │   ├── CDI: 0% - 50% ✅
   │   ├── SELIC: 0% - 50% ✅
   │   └── PTAX: 1.0 - 15.0 ✅
   ├── Calculates Z-score vs. historical average
   ├── Checks velocity (rate of change)
   └── Flags if anomalous

If anomaly detected:
   ├── Alert operator via email/Slack
   └── Optionally skip update (manual review)

⏱️ Duration: 1 second
💰 Cost: $0
```

**Step 4: Update On-Chain**
```
💻 Oracle Updater builds transaction:
   ├── Prepares rate arrays for batch update
   ├── Signs transaction with oracle updater private key
   └── Sends to oracle.batchUpdateRates()

🌐 Transaction sent to Arbitrum Sepolia:
   ├── Gas price: Check current network conditions
   ├── Gas limit: 500,000 (for 4 rates)
   └── Nonce: Get from account

🌐 Oracle contract:
   ├── Validates caller has UPDATER_ROLE ✅
   ├── For each rate:
   │   ├── Validates against min/max bounds ✅
   │   ├── Checks if newer than existing ✅
   │   ├── Updates currentRates mapping
   │   ├── Appends to rateHistory
   │   └── Emits RateUpdated event
   └── Transaction succeeds ✅

💻 Backend logs to SQLite:
   ├── Timestamp, rates, tx hash
   └── Success status

⏱️ Duration: 30 seconds (tx confirmation)
💰 Cost: ~$5-10 gas
```

**Step 5: Error Handling**
```
💻 If BCB API fails:
   ├── Retry with exponential backoff (3 attempts)
   │   ├── Attempt 1: Immediate
   │   ├── Attempt 2: +5 seconds
   │   └── Attempt 3: +15 seconds
   ├── If all fail: Send alert
   └── Previous rates remain valid

💻 If transaction fails:
   ├── Check gas price (may need increase)
   ├── Check nonce (may be stale)
   ├── Retry once with higher gas
   └── If still fails: Send critical alert

⏱️ Duration: +20-30 seconds for retries
💰 Cost: +$2-5 for retries
```

---

## State Transition Diagrams

### Debenture Lifecycle States

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEBENTURE STATE MACHINE                       │
└─────────────────────────────────────────────────────────────────┘

    [Created] ──────────────┐
        │                   │
        │ initialize()      │
        ▼                   │
    [ACTIVE] ◄──────────────┘
        │
        │
        ├──► recordCoupon() ──► [Coupon Recorded] ──► payCoupon()
        │                              │
        │                              └──► [Coupon Paid]
        │
        ├──► executeAmortization() ──► [Amortization Executed]
        │
        ├──► pause() ──► [PAUSED]
        │                   │
        │                   └──► unpause() ──► [ACTIVE]
        │
        ├──► (maturityDate reached) ──► executeAmortization()
        │                                       │
        │                                       ▼
        │                                   [MATURED]
        │
        ├──► default() ──► [DEFAULTED]
        │
        └──► repactuate() ──► [REPACTUATED]

TERMINAL STATES (no further transitions):
- MATURED
- DEFAULTED
```

### Coupon Payment States

```
┌─────────────────────────────────────────────────────────────────┐
│                     COUPON STATE MACHINE                         │
└─────────────────────────────────────────────────────────────────┘

    [No Coupon]
        │
        │ recordCoupon()
        ▼
    [Recorded, Not Distributed]
        │
        ├──► Issuer pays all ──► payCoupon(all) ──► [Fully Paid]
        │
        └──► Investors claim ──► claimCoupon(index)
                                    │
                                    ├──► Some claimed ──► [Partially Paid]
                                    │                          │
                                    │                          └──► More claim
                                    │                                  │
                                    └──────────────────────────────────┘
                                                                       │
                                                                       ▼
                                                                  [Fully Paid]
```

### Transfer Restriction Flow (ERC-1404)

```
┌─────────────────────────────────────────────────────────────────┐
│                 ERC-1404 TRANSFER VALIDATION                     │
└─────────────────────────────────────────────────────────────────┘

transfer(from, to, amount)
    │
    ├──► detectTransferRestriction(from, to, amount)
    │         │
    │         ├──► Check paused? ──YES──► RETURN CODE 2 (PAUSED)
    │         │         │
    │         │         NO
    │         │         │
    │         ├──► Check sender whitelisted? ──NO──► RETURN CODE 1
    │         │         │
    │         │        YES
    │         │         │
    │         ├──► Check recipient whitelisted? ──NO──► RETURN CODE 1
    │         │         │
    │         │        YES
    │         │         │
    │         ├──► Check sender blacklisted? ──YES──► RETURN CODE 3
    │         │         │
    │         │         NO
    │         │         │
    │         ├──► Check recipient blacklisted? ──YES──► RETURN CODE 3
    │         │         │
    │         │         NO
    │         │         │
    │         ├──► Check lock-up expired? ──NO──► RETURN CODE 4
    │         │         │
    │         │        YES
    │         │         │
    │         └──► RETURN CODE 0 (SUCCESS)
    │
    ├──► Code = 0? ──YES──► Execute transfer ──► EMIT Transfer()
    │         │
    │         NO
    │         │
    └──► REVERT with message
```

---

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| **NOT_WHITELISTED** | Recipient not KYC'd | Complete KYC, get whitelisted |
| **PAUSED** | Debenture paused | Wait for unpause or contact issuer |
| **BLACKLISTED** | Address blacklisted | Contact issuer (likely fraud) |
| **LOCK_UP_PERIOD** | Lock-up not expired | Wait until lockUpEndDate |
| **INSUFFICIENT_BALANCE** | Not enough tokens | Reduce transfer amount |
| **Stale Oracle Data** | Oracle not updated recently | Wait for next update or alert operator |
| **ISIN_ALREADY_EXISTS** | Duplicate ISIN | Use unique ISIN code |
| **ONLY_ISSUER** | Caller not authorized | Use issuer address |

---

## Conclusion

This document provides comprehensive workflows for all DELOS platform interactions. Each workflow is designed to be:
- **User-friendly**: Clear step-by-step processes
- **Gas-efficient**: Minimal on-chain transactions
- **Compliant**: Built-in KYC/AML checks
- **Transparent**: All actions verifiable on-chain

**For More Information:**
- [Architecture](./ARCHITECTURE.md) - System architecture

---

*Last Updated: December 15, 2024*
*Version: 1.0.0*
