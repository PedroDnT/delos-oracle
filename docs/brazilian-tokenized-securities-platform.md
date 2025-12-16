# Brazilian Tokenized Securities Platform
## Complete Project Documentation for ANBIMA Pilot

---

## 📋 Executive Summary

**Project**: Brazilian Macro Data Oracle + Tokenized Debenture Platform  
**Target**: ANBIMA Tokenization Pilot Program 2025  
**Timeline**: 2 Weeks (14 Days)  
**Author**: Pedro Todescan

### Value Proposition
Build foundational infrastructure for Brazilian tokenized securities by creating:
1. **Brazilian Macro Oracle** - On-chain access to IPCA, CDI, SELIC, PTAX
2. **Tokenized Debenture Platform** - IPCA+/CDI+ corporate bonds with automated coupon payments

### Strategic Positioning
**"Truflation for Brazilian Macro Data"** - Specialized data feed provider complementing Chainlink ecosystem, not competing with it.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BRAZILIAN TOKENIZED SECURITIES                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐ │
│  │   BCB API    │────▶│   Backend    │────▶│   BrazilianMacroOracle   │ │
│  │ (Data Source)│     │   (Python)   │     │   (Smart Contract)       │ │
│  └──────────────┘     └──────────────┘     └─────────────┬────────────┘ │
│                                                          │              │
│                                                          ▼              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     DEBENTURE PLATFORM                           │  │
│  │  ┌────────────────┐  ┌───────────────────────────────────────┐   │  │
│  │  │ DebentureFactory│──▶│  BrazilianDebenture                  │   │  │
│  │  │                │  │  (ERC-20 + ERC-1404 integrated)       │   │  │
│  │  └────────────────┘  └───────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                          │              │
│                                                          ▼              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                       FRONTEND (Next.js)                         │  │
│  │     Oracle Dashboard  │  Issue Debentures  │  Investor Portal    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Project Structure

```
brazilian-oracle-platform/
├── contracts/                    # Smart Contracts (Solidity)
│   ├── contracts/
│   │   ├── BrazilianMacroOracle.sol
│   │   ├── BrazilianDebenture.sol (includes ERC-1404 restrictions)
│   │   └── DebentureFactory.sol
│   ├── test/
│   │   ├── BrazilianMacroOracle.test.ts
│   │   └── BrazilianDebenture.test.ts
│   ├── scripts/
│   │   └── deploy.ts
│   └── hardhat.config.ts
│
├── backend/                      # Oracle Service (Python)
│   ├── bcb_client.py            # BCB API integration
│   ├── oracle_updater.py        # Blockchain updater
│   ├── scheduler.py             # Automated updates
│   ├── api.py                   # REST API
│   └── requirements.txt
│
├── frontend/                     # Web Interface (Next.js)
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── hooks/
│   └── package.json
│
└── docs/                         # Documentation
    └── *.md
```

---

## 📊 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Blockchain** | Polygon (Mumbai/PoS) | L2 network - low fees, fast confirmations |
| **Contracts** | Solidity 0.8.20+ | Smart contract language |
| **Security** | OpenZeppelin | Battle-tested contract libraries |
| **Development** | Hardhat | Testing, deployment, verification |
| **Backend** | Python 3.10+ / FastAPI | Oracle service and API |
| **Web3** | web3.py | Blockchain interaction |
| **Data Source** | BCB API | Official Brazilian central bank data |
| **Frontend** | Next.js 14 + TypeScript | Web application |
| **Wallet** | RainbowKit + wagmi | Web3 wallet connection |
| **Hosting** | Railway (backend) + Vercel (frontend) | Cloud deployment |

---

## 🔄 Data Flow

### Oracle Update Flow
```
1. Scheduler triggers (daily 19:00 BRT for CDI, monthly for IPCA)
2. BCBClient.fetch_latest("CDI") → API call to BCB
3. BCB returns: {"data": "26/11/2024", "valor": "10.90"}
4. Transform: value=1090 (basis points), date=20241126, source="BCB-12"
5. OracleUpdater.update_single_rate("CDI", 1090, 20241126, "BCB-12")
6. Sign transaction with private key
7. Send to Polygon network
8. Wait for block confirmation
9. Oracle emits RateUpdated event
10. Frontend automatically refreshes
```

### Debenture Issuance Flow
```
1. Issuer fills form: faceValue=1M BRL, spread=5%, maturity=2 years
2. Frontend calls DebentureFactory.createSimpleIPCADebenture()
3. Factory deploys new BrazilianDebenture contract
4. Constructor mints tokens to issuer, sets terms, whitelists parties
5. Factory emits DebentureCreated event
6. Frontend shows new debenture
```

### Coupon Payment Flow
```
1. Time reaches nextCouponDate (user  days after issue)
2. Anyone calls debenture.recordCouponCalculation()
3. Contract calls oracle.getRate("IPCA") → 450 (4.5%)
4. Adds spread: 450 + 500 = 950 (9.5%)
5. Calculates: 1M × 9.5% × (180/252) ≈ 67,857 BRL
6. Stores CouponPayment, emits CouponCalculated
7. Issuer approves payment token, calls payCoupon(0)
8. Investors call claimCoupon(0) to receive their share
```

---

## 📅 Implementation Timeline

### Week 1: Oracle Infrastructure (Days 1-7)

| Day | Focus | Deliverables |
|-----|-------|--------------|
| **1** | Setup & Contract | Project structure, BrazilianMacroOracle.sol |
| **2** | Testing & Deploy | Unit tests, testnet deployment |
| **3** | BCB Client | Python BCB API integration |
| **4** | Oracle Updater | Web3 transaction service |
| **5** | REST API | FastAPI endpoints for oracle data |
| **6** | Deployment | Railway setup, automated scheduler |
| **7** | Documentation | API docs, integration tests |

### Week 2: Debenture Platform (Days 8-14)

| Day | Focus | Deliverables |
|-----|-------|--------------|
| **8** | Restricted Token | ERC-1404 base contract with whitelist |
| **9** | Debenture Contract | Full BrazilianDebenture.sol |
| **10** | Factory & Tests | DebentureFactory.sol, complete tests |
| **11** | Frontend Setup | Next.js project, Web3 integration |
| **12** | Oracle Dashboard | Rate display components |
| **13** | Debenture UI | Issuance forms, portfolio views |
| **14** | Integration & Polish | E2E testing, documentation, demo |

---

## 📜 Smart Contracts Specification

### 1. BrazilianMacroOracle

**Purpose**: On-chain storage for Brazilian macroeconomic indicators

```solidity
// Key Structures
struct RateData {
    uint256 value;           // Rate in basis points (450 = 4.50%)
    uint256 timestamp;       // Block timestamp when updated
    uint256 lastUpdated;     // Real-world date (YYYYMMDD format)
    string source;           // Data source ("BCB-433" for IPCA)
    address updater;         // Address that performed the update
}

struct RateMetadata {
    string name;             // "IPCA - Índice de Preços ao Consumidor"
    string description;      // Full description
    uint8 decimals;          // 2 for basis points
    uint256 updateFrequency; // Expected update frequency
    bool isActive;           // Whether maintained
}

// Key Functions
function updateRate(string rateType, uint256 value, uint256 realWorldDate, string source)
function getRate(string rateType) returns (uint256 value, uint256 timestamp, uint256 lastUpdated)
function getRateHistory(string rateType, uint256 count) returns (RateData[])

// Chainlink Compatibility
function latestRoundData() returns (uint80, int256, uint256, uint256, uint80)

// Access Control
ADMIN_ROLE: Add rates, pause, manage settings
UPDATER_ROLE: Update values (backend service)
```

**Supported Rates**:
| Rate | BCB Series | Update Frequency | Description |
|------|-----------|------------------|-------------|
| IPCA | 433 | Monthly (day ~11) | Consumer inflation index |
| CDI | 12 | Daily | Interbank deposit rate |
| SELIC | 432 | Daily | Central bank base rate |
| PTAX | 1 | Daily | USD/BRL official rate |
| IGPM | 189 | Monthly | General market price index |
| TR | 226 | Daily | Reference rate |

### 2. BrazilianDebenture (ERC-20 + ERC-1404)

**Purpose**: Transfer-restricted debenture token for regulated securities

**Note**: Originally planned as a separate RestrictedToken.sol contract, but ERC-1404 functionality is implemented directly in BrazilianDebenture.sol for better integration.

```solidity
// Transfer Restriction Codes
uint8 constant SUCCESS = 0;
uint8 constant NOT_WHITELISTED = 1;
uint8 constant PAUSED = 2;
uint8 constant BLACKLISTED = 3;

// Key Functions
function detectTransferRestriction(from, to, value) returns (uint8 code)
function messageForTransferRestriction(code) returns (string)
function addToWhitelist(address account)
function removeFromWhitelist(address account)
function addToBlacklist(address account)

// Roles
WHITELIST_ADMIN_ROLE: Manage investor whitelist
```

### 3. BrazilianDebenture

**Purpose**: Tokenized corporate bond with IPCA+/CDI+ indexation

```solidity
// Rate Types
enum RateType { PRE, IPCA_PLUS, CDI_PLUS }
enum DebentureStatus { ACTIVE, MATURED, DEFAULTED, REDEEMED }

// Terms Structure
struct DebentureTerms {
    uint256 faceValue;              // Face value in BRL (1e18 scaled)
    uint256 issueDate;              // Issue timestamp
    uint256 maturityDate;           // Maturity timestamp
    RateType rateType;              // PRE, IPCA+, or CDI+
    uint256 fixedRate;              // PRE rate or spread (basis points)
    uint256 couponFrequencyDays;    // 180 for semiannual
    uint256 amortizationPercent;    // 10000 = 100%
    address issuer;                 // Issuer address
    string isinCode;                // International identifier
    string series;                  // "1ª Série"
}

// Coupon Calculation (IPCA+ example)
// rate = oracle.getRate("IPCA") + terms.fixedRate
// amount = principal × (rate/10000) × (days/252)

// Key Functions
function calculateNextCoupon() returns (uint256 amount, uint256 rateUsed)
function recordCouponCalculation() // Anyone can call when due
function payCoupon(uint256 index) // Issuer pays
function claimCoupon(uint256 index) // Investors claim
function mature() // Mark as matured
function redeem(uint256 amount) // Redeem at maturity

// Events
event CouponCalculated(uint256 index, uint256 amount, uint256 rateUsed)
event CouponPaid(uint256 index, uint256 totalAmount)
event DebentureMatured(uint256 timestamp)
event DebentureRedeemed(address holder, uint256 amount)
```

**Gas Costs**:
| Operation | Estimated Gas |
|-----------|--------------|
| recordCouponCalculation | ~120,000 |
| payCoupon | ~150,000 |
| claimCoupon | ~80,000 |
| redeem | ~100,000 |
| transfer (whitelisted) | ~65,000 |

### 4. DebentureFactory

**Purpose**: Standardized deployment and registry

```solidity
// State
address public defaultOracle;
address public defaultPaymentToken;
address public defaultTrustee;
address[] public allDebentures;
mapping(address => address[]) public issuerDebentures;

// Key Functions
function createDebenture(terms, name, symbol) returns (address)
function createSimpleIPCADebenture(faceValue, maturityYears, spread, name) returns (address)
function createSimpleCDIDebenture(faceValue, maturityYears, spread, name) returns (address)
function getDebentureCount() returns (uint256)
function getIssuerDebentures(address) returns (address[])

// Events
event DebentureCreated(address indexed debenture, address indexed issuer, string name)
```

---

## 🐍 Backend Service Specification

### BCB API Client

**Endpoints**:
```python
BCB_SERIES = {
    "IPCA": 433,
    "CDI": 12,
    "SELIC": 432,
    "PTAX": 1,
    "IGPM": 189,
    "TR": 226
}

# API URL Format
f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series}/dados/ultimos/{count}?formato=json"
```

**Data Transformation**:
```python
# BCB returns: {"data": "26/11/2024", "valor": "10.90"}
# Transform to: {"value": 1090, "date": 20241126, "source": "BCB-12"}

def transform_rate(bcb_data, series_id):
    date_parts = bcb_data["data"].split("/")
    date_int = int(f"{date_parts[2]}{date_parts[1]}{date_parts[0]}")
    value_bps = int(float(bcb_data["valor"]) * 100)
    return {
        "value": value_bps,
        "date": date_int,
        "source": f"BCB-{series_id}"
    }
```

### REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API info |
| GET | `/health` | System health check |
| GET | `/rates` | List supported rates |
| GET | `/rates/{rate_type}` | Current rate data |
| GET | `/rates/{rate_type}/history` | Historical data |
| GET | `/bcb/{rate_type}` | Direct BCB data (bypass cache) |
| POST | `/sync` | Trigger manual update |

### Scheduler Configuration

```python
# Daily updates (CDI, SELIC, PTAX)
schedule.every().day.at("19:00").do(daily_update)

# Monthly updates (IPCA - around day 11)
schedule.every().day.at("10:00").do(check_monthly_update)

# Health checks
schedule.every(6).hours.do(health_check)
```

---

## 🎨 Frontend Components

```
frontend/src/
├── app/
│   ├── page.tsx              # Home/Dashboard
│   ├── oracle/page.tsx       # Oracle dashboard
│   ├── debentures/page.tsx   # Debenture list
│   ├── issue/page.tsx        # Issue new debenture
│   └── layout.tsx            # Root layout
├── components/
│   ├── WalletConnect.tsx     # RainbowKit integration
│   ├── OracleDashboard.tsx   # Rate displays
│   ├── OracleRateCard.tsx    # Individual rate card
│   ├── IssueDebentureForm.tsx # Issuance form
│   ├── DebentureList.tsx     # List view
│   ├── DebentureCard.tsx     # Preview card
│   └── DebentureDetails.tsx  # Full details
└── hooks/
    ├── useOracle.ts          # Oracle contract hooks
    └── useDebenture.ts       # Debenture contract hooks
```

---

## 🔐 Security Model

### Oracle Trust Model

**Current Model**: First-party oracle (centralized updater)

```
Trust Flow:
BCB (Government) → Backend (TEVA) → Oracle Contract → DeFi Users
```

**Mitigations**:
- All updates transparent and auditable on-chain
- Source attribution (BCB-XXX) for every update
- HTTPS connection to BCB API
- Range validation prevents obvious errors
- Pausable contract for emergencies
- Clear documentation of trust model

**Future Enhancements**:
1. Multi-signature updates (2-of-3)
2. Multiple data providers
3. Chainlink node operator integration

### Smart Contract Security

- AccessControl for role management
- ReentrancyGuard on payment functions
- Pausable for emergencies
- Input validation on all external calls
- Solidity 0.8+ overflow protection
- OpenZeppelin battle-tested contracts

---

## 🚀 Deployment Guide

### Testnet Deployment (Mumbai)

```bash
# 1. Deploy Oracle
cd contracts
npx hardhat run scripts/deploy-oracle.ts --network 
# Save address: ORACLE_ADDRESS

# 2. Verify Oracle
npx hardhat verify --network mumbai $ORACLE_ADDRESS

# 3. Deploy Factory
npx hardhat run scripts/deploy-factory.ts --network mumbai
# Save address: FACTORY_ADDRESS

# 4. Setup Backend
cd ../backend
# Configure .env with contract addresses
railway up

# 5. Deploy Frontend
cd ../frontend
vercel --prod
```

### Environment Variables

```bash
# contracts/.env
POLYGON_MUMBAI_RPC=https://rpc-mumbai.maticvigil.com
PRIVATE_KEY=0x...
POLYGONSCAN_API_KEY=...

# backend/.env
RPC_URL=https://rpc-mumbai.maticvigil.com
ORACLE_ADDRESS=0x...
PRIVATE_KEY=0x... # Backend service key
PORT=8000

# frontend/.env
NEXT_PUBLIC_ORACLE_ADDRESS=0x...
NEXT_PUBLIC_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=80001
```

---

## 📈 Chainlink Integration Roadmap

### Phase 1: Chainlink-Compatible Interface (Now)
```solidity
// Implement AggregatorV3Interface
function latestRoundData() external view returns (
    uint80 roundId,
    int256 answer,
    uint256 startedAt,
    uint256 updatedAt,
    uint80 answeredInRound
)
```

### Phase 2: ACE Integration (Year 1-2)
- Automated KYC/AML verification
- Identity binding for compliance
- On-chain compliance checks

### Phase 3: DTA Integration (Year 2-3)
- Digital Transfer Agent functionality
- Automated corporate actions
- Regulatory reporting

### Phase 4: Node Operator (Year 3+)
- Official Chainlink node operator
- Direct LINK earning from ecosystem
- Broader data distribution

---

## 🎯 Success Metrics

### Technical
- Oracle uptime > 99%
- < 1 hour data staleness for daily rates
- < 24 hours for monthly rates
- All transactions confirmed within 30 seconds
- Test coverage > 90%

### Business
- Successful ANBIMA pilot participation
- At least 1 demo debenture issued
- Documentation complete for regulator review
- Clear path to production deployment

---

## 📝 What This Demonstrates to ANBIMA

1. ✅ **Understanding of Brazilian debenture mechanics** (IPCA+, CDI+ conventions)
2. ✅ **End-to-end tokenization** (issuance through payment)
3. ✅ **Regulatory awareness** (KYC whitelist, trustee roles)
4. ✅ **Oracle integration** with trusted Brazilian sources
5. ✅ **Practical approach** (acknowledgment of legal limitations)

### Explicit Scope Limitations (Acknowledged)

| Not Included | Why | Future Path |
|--------------|-----|-------------|
| Legal structure | Requires CVM registration | Parallel legal process |
| Real custody | Requires licensed custodian | Integrate with providers |
| Fiat settlement | Requires DREX or stablecoin | Wait for DREX launch |
| Full compliance | CVM 400 requires full audit | Production phase |

---

## 🚦 Quick Start Commands

```bash
# Clone and setup
git clone <repo>
cd brazilian-oracle-platform

# Contracts
cd contracts
npm install
npx hardhat test
npx hardhat run scripts/deploy.ts --network mumbai

# Backend
cd ../backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn api:app --reload

# Frontend
cd ../frontend
npm install
npm run dev
```

---

## 📚 References

- **BCB API Docs**: https://dadosabertos.bcb.gov.br/
- **OpenZeppelin Contracts**: https://docs.openzeppelin.com/contracts
- **Hardhat**: https://hardhat.org/docs
- **Polygon Mumbai**: https://mumbai.polygonscan.com/
- **ANBIMA Pilot**: https://anbi.ma/GTPiloto
- **ERC-1404**: https://erc1404.org/

---

*Last Updated: November 2024*  
*Version: 1.0*  
*Status: Ready for Implementation*
