# DELOS - Brazilian Macro Oracle Blueprint

> Explorational implementation of on-chain macroeconomic data and tokenized debentures for Brazil

[![Arbitrum Sepolia](https://img.shields.io/badge/Arbitrum-Sepolia-blue)](https://sepolia.arbiscan.io/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-orange)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.22.17-yellow)](https://hardhat.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.9+-green)](https://python.org/)

---

## Overview

**DELOS** is a technical blueprint exploring how ANBIMA's tokenized securities pilot could leverage blockchain infrastructure:

- **On-Chain Macro Oracle**: BCB (Banco Central do Brasil) rates deployed to Arbitrum Sepolia testnet
- **Tokenized Debentures**: ERC-20/ERC-1404 compliant debentures with IPCA/CDI indexation
- **Clone Factory**: Gas-efficient deployment using EIP-1167 (6.7KB per instance)
- **Backend Services**: Runnable Python code demonstrating automated rate updates
- **Frontend Demo**: Next.js 14 interface for interacting with deployed contracts

**Status**: Explorational blueprint with testnet deployment. Not production-ready.

---

## 🚀 Quick Start

### Run Complete Demo

```bash
# Clone repository
git clone https://github.com/PedroDnT/delos-oracle.git
cd delos-oracle

# Install dependencies
cd contracts && npm install && cd ..
cd frontend && npm install && cd ..
cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ..

# Run complete demonstration
cd contracts
npx hardhat run scripts/demo-complete.ts --network arbitrumSepolia
```

This will demonstrate:
1. ✅ Oracle rate queries (IPCA, CDI, SELIC, PTAX, IGP-M, TR)
2. ✅ Debenture creation via Factory
3. ✅ Token distribution and KYC whitelist
4. ✅ Coupon calculation and payment
5. ✅ Transfer restrictions (ERC-1404)

**Full documentation**: [DEMO-GUIDE.md](./DEMO-GUIDE.md)

---

## 🌐 Live Deployment

**Frontend (Vercel)**: [https://frontend-deloslabs.vercel.app](https://frontend-deloslabs.vercel.app)

- Next.js 14 static site hosted on Vercel
- RainbowKit wallet integration
- Connected to Arbitrum Sepolia testnet
- Real-time oracle data dashboard

**Backend API Documentation**: See [DEPLOYMENT.md](./docs/DEPLOYMENT.md) for Railway backend setup

---

## 📦 Deployed Contracts

### Arbitrum Sepolia Testnet

| Contract | Address | Explorer |
|----------|---------|----------|
| **BrazilianMacroOracle** | `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe` | [View](https://sepolia.arbiscan.io/address/0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe) |
| **DebentureImplementation** | `0x8856dd1f536169B8A82D8DA5476F9765b768f51D` | [View](https://sepolia.arbiscan.io/address/0x8856dd1f536169B8A82D8DA5476F9765b768f51D) |
| **DebentureCloneFactory** | `0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f` | [View](https://sepolia.arbiscan.io/address/0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f) |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BCB API Data Sources                      │
│  (IPCA, CDI, SELIC, PTAX, IGP-M, TR)                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend (Python FastAPI + APScheduler)          │
│  • BCB Client (httpx, retry logic, validation)              │
│  • Oracle Updater (Web3, batch updates)                     │
│  • Scheduler (daily/monthly jobs)                           │
│  • REST API (10 endpoints)                                  │
│  • SQLite (data versioning, anomaly detection)              │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           Smart Contracts (Solidity 0.8.28)                 │
│  ┌────────────────────────────────────────────┐             │
│  │      BrazilianMacroOracle                  │             │
│  │  • 6 rates (8 decimal precision)           │             │
│  │  • Chainlink AggregatorV3 compatible       │             │
│  │  • Circuit breakers & validation           │             │
│  └────────────────────────────────────────────┘             │
│                      │                                       │
│                      ▼                                       │
│  ┌────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │Debenture   │◄─│ BrazilianDeben-  │◄─│DebentureClone- │  │
│  │Implement.  │  │ tureCloneable    │  │Factory (6.7KB) │  │
│  │(ERC-1404)  │  │  (EIP-1167)      │  │                │  │
│  └────────────┘  └──────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│        Frontend (Next.js 14 + RainbowKit + wagmi)           │
│  • Oracle Dashboard (real-time rates)                       │
│  • Debenture Issuance UI (validation, confirmation)         │
│  • Portfolio Management (balances, coupons, history)        │
└─────────────────────────────────────────────────────────────┘
```

---

## What's Implemented

### Smart Contracts (Deployed to Arbitrum Sepolia)

**BrazilianMacroOracle** - `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe`
- 6 Brazilian macro rates (IPCA, CDI, SELIC, PTAX, IGP-M, TR)
- Chainlink AggregatorV3 compatible interface
- 8-decimal precision with circuit breakers
- Manually updated to demonstrate functionality

**DebentureCloneFactory** - `0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f`
- EIP-1167 minimal proxy pattern (~6.7KB per debenture vs ~500KB traditional)
- Registry of all created debentures
- Deployed implementation at `0x8856dd1f536169B8A82D8DA5476F9765b768f51D`

**BrazilianDebentureCloneable** (Implementation)
- ERC-20 + ERC-1404 transfer restrictions
- 5 rate types (PRE, DI_SPREAD, DI_PERCENT, IPCA_SPREAD, IGPM_SPREAD)
- 3 amortization schedules (BULLET, PERCENT_VNE, PERCENT_VNA)
- Coupon calculation using oracle rates
- KYC whitelist enforcement

### Backend Services (Runnable Code)

Located in `/backend`, demonstrates:
- **BCB Client**: Fetches rates from Banco Central API with retry logic
- **Oracle Updater**: Web3 integration for on-chain updates
- **Scheduler**: APScheduler jobs for daily/monthly rate updates (not deployed)
- **REST API**: FastAPI with 10 endpoints for rate queries (not deployed)
- **Data Store**: SQLite versioning and anomaly detection (not deployed)

### Frontend (Next.js 14)

Located in `/frontend`, provides:
- Oracle dashboard displaying current rates
- Debenture issuance interface with validation
- Portfolio management for viewing positions
- RainbowKit wallet connection

**Note**: Backend services are runnable locally but not deployed. Oracle updates on testnet were done manually to demonstrate the update flow.

---

## 📊 Supported Rates

| Rate | BCB Series | Type | Update Frequency |
|------|-----------|------|-----------------|
| **IPCA** | 433 | Inflation % | Monthly (10th) |
| **CDI** | 12 | Interest % | Daily (19:00 BRT) |
| **SELIC** | 432 | Interest % | Daily (19:00 BRT) |
| **PTAX** | 1 | FX (BRL/USD) | Daily (19:00 BRT) |
| **IGP-M** | 189 | Inflation % | Monthly (10th) |
| **TR** | 226 | Interest % | Daily (19:00 BRT) |

**Encoding**: `4.50%` → `450000000` (8 decimals)

---

## 💻 Usage Examples

### 1. Query Oracle Rates

```javascript
const oracle = await ethers.getContractAt(
  "BrazilianMacroOracle",
  "0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe"
);

// Get IPCA
const ipca = await oracle.getIPCA();
console.log("IPCA:", ethers.formatUnits(ipca.value, 8), "%");

// Chainlink compatible
const latestRound = await oracle.latestRoundData();
console.log("Latest rate:", ethers.formatUnits(latestRound.answer, 8));
```

### 2. Create Debenture via Factory

```javascript
const factory = await ethers.getContractAt(
  "DebentureCloneFactory",
  "0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f"
);

const tx = await factory.createDebenture(
  "Debenture 2025",           // name
  "DEB25",                    // symbol
  issuerAddress,              // issuer
  oracleAddress,              // oracle
  paymentTokenAddress,        // payment token (USDC/BRL)
  ethers.parseUnits("1000000", 6), // 1M tokens
  maturityTimestamp,          // maturity date
  3,                          // IPCA_SPREAD
  ethers.parseUnits("6.5", 6), // IPCA + 6.5%
  30 * 24 * 60 * 60,         // Monthly coupons
  0,                          // BULLET amortization
  true                        // Early redemption allowed
);

const receipt = await tx.wait();
// Debenture address in DebentureCreated event
```

### 3. Record and Pay Coupons

```javascript
const debenture = await ethers.getContractAt("BrazilianDebentureCloneable", debentureAddress);

// Record coupon (issuer only)
await debenture.recordCoupon(Date.now() / 1000);

// Calculate coupon value
const couponValue = await debenture.calculateCouponValue(investorAddress, 0);

// Pay coupon
await paymentToken.approve(debentureAddress, couponValue);
await debenture.payCoupon(investorAddress, 0);
```

---

## 🛠️ Development Setup

### Prerequisites

- Node.js 18+
- Python 3.9+
- Hardhat
- Arbitrum Sepolia RPC URL & Private Key

### Smart Contracts

```bash
cd contracts
npm install

# Compile
npx hardhat compile

# Test (94 tests passing)
npx hardhat test

# Deploy
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Test BCB client
python bcb_client.py

# Run scheduler
python scheduler.py start

# Run API server
python api.py  # http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install

# Development
npm run dev  # http://localhost:3000

# Build
npm run build
npm start
```

---

## Documentation

### Getting Started
- **[DEMO-GUIDE.md](./DEMO-GUIDE.md)** - Complete demonstration walkthrough
- **[DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md)** - How to deploy contracts to testnet

### Technical Reference
- **[docs/TECHNICAL_DOCUMENTATION.md](./docs/TECHNICAL_DOCUMENTATION.md)** - Architecture and implementation details
- **[docs/API_REFERENCE.md](./docs/API_REFERENCE.md)** - Backend REST API endpoints
- **[docs/SMART_CONTRACTS.md](./docs/SMART_CONTRACTS.md)** - Contract interfaces and functions
- **[docs/DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md)** - Development setup and workflow

### Conceptual Documents
- **[ECONOMICS.md](./ECONOMICS.md)** - *Conceptual* economic model for tokenized debentures
- **[WORKFLOWS.md](./WORKFLOWS.md)** - *Proposed* user workflows and journeys
- **[FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md)** - Ideas for production implementation
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System design decisions

*Note: Documents marked "conceptual" or "proposed" describe potential production implementations, not current functionality.*

---

## 🧪 Testing

### Smart Contract Tests

```bash
cd contracts
npx hardhat test

# Coverage
npx hardhat coverage
```

**Test Results**: 94/94 passing
- Oracle: 33 tests (rate updates, bounds, Chainlink compatibility)
- Debentures: 61 tests (ERC-1404, coupons, amortization, special conditions)

### Backend Tests

```bash
cd backend
pytest
```

---

## Security & Limitations

### Current Status

⚠️ **This is an explorational blueprint - NOT audited and NOT production-ready.**

**Implemented Security Features:**
- Circuit breakers for oracle rate bounds validation
- ERC-1404 transfer restrictions with whitelist enforcement
- Access control using OpenZeppelin's `Ownable2Step`
- Reentrancy guards on payment functions

**Known Limitations:**
1. **Single oracle updater** - First-party oracle model (no decentralization)
2. **No multi-sig governance** - Admin functions controlled by single EOA
3. **Testnet only** - Deployed to Arbitrum Sepolia, not production networks
4. **Manual oracle updates** - Backend scheduler exists but not running continuously
5. **No formal audit** - Smart contracts have not undergone professional security review
6. **Limited testing scope** - 94 unit tests cover core functionality but not all edge cases

### Production Considerations

For a production implementation, the following would be required:
- Professional smart contract audit by reputable firm
- Decentralized oracle network (e.g., Chainlink nodes, multiple data sources)
- Multi-sig governance with timelock for admin operations
- Comprehensive integration testing with real BCB data
- Legal framework for compliance (KYC/AML, securities regulations)
- Continuous monitoring and incident response procedures

---

## 🌐 API Endpoints

### REST API (Backend)

```
GET  /health                      - Health check
GET  /rates                       - All current rates
GET  /rates/{type}                - Specific rate (IPCA, CDI, etc.)
GET  /rates/{type}/history        - Historical data
POST /sync                        - Manual sync trigger
GET  /scheduler/jobs              - Scheduled jobs
GET  /bcb/latest/{type}           - Direct BCB fetch
GET  /anomalies                   - Detected anomalies
```

**Swagger UI**: http://localhost:8000/docs

---

## Technical Features

### Oracle Contract
- 6 Brazilian macro rates stored on-chain (IPCA, CDI, SELIC, PTAX, IGP-M, TR)
- Chainlink `AggregatorV3Interface` compatibility for DeFi integration
- 8-decimal precision encoding
- Circuit breakers with min/max bounds per rate type
- Batch update function for gas efficiency

### Debenture Contracts
- ERC-20 standard token functionality
- ERC-1404 transfer restrictions for regulatory compliance
- 5 indexation types: fixed rate (PRE), CDI-based, IPCA-based, IGP-M-based
- 3 amortization schedules: bullet, percentage of nominal value, percentage of updated value
- Configurable coupon frequencies (monthly, quarterly, semi-annual, annual)
- Early redemption and repactuation support
- On-chain KYC whitelist management

### Factory Pattern
- EIP-1167 minimal proxy reduces deployment cost by ~98%
- On-chain registry of all created debentures
- Queryable by issuer address
- Implementation contract upgradable via new deployments

### Backend (Demonstration Code)
- Automated job scheduling with APScheduler
- Retry logic with exponential backoff for BCB API
- Statistical anomaly detection (value spikes, stale data)
- SQLite data versioning for historical queries
- RESTful API with OpenAPI/Swagger documentation

---

## 🚀 Deployment

### Production Deployment Guide

Deploy the complete DELOS system to production:

**Backend (Railway)**: Python FastAPI + APScheduler for automated rate updates
- Always-on cron jobs (19:00 BRT daily, 10th monthly)
- Persistent SQLite database
- ~$5/month cost

**Frontend (Vercel)**: Next.js 14 static site
- Free tier unlimited
- Automatic HTTPS
- Global CDN

**Deployment Time**: ~30-45 minutes

For complete step-by-step instructions, see: [DEPLOYMENT.md](./docs/DEPLOYMENT.md)

**Quick Deploy:**
```bash
# Backend to Railway
cd backend
npm install -g @railway/cli
railway init
railway up

# Frontend to Vercel
cd frontend
npm install -g vercel
vercel --prod
```

**Deployment files created:**
- `backend/Procfile` - Railway process definition
- `backend/railway.json` - Health checks and restart policies
- `backend/.railwayignore` - Deployment exclusions
- `frontend/.env.production` - Production environment variables
- `frontend/vercel.json` - Vercel configuration

**Monitoring**: Built-in health checks at `/health` endpoint. Recommended: UptimeRobot for uptime monitoring.

---

## Contributing

This is an explorational blueprint demonstrating tokenized securities infrastructure for Brazil.

Contributions welcome:
1. Open an issue for bugs or suggestions
2. Submit PRs for improvements
3. Fork for your own experiments

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) file

---

## Acknowledgments

**Inspiration & Standards:**
- ANBIMA's tokenized securities pilot program provided use case context
- Banco Central do Brasil (BCB) provides public macroeconomic data API
- Chainlink's AggregatorV3Interface used for oracle compatibility
- OpenZeppelin libraries for secure contract patterns
- Arbitrum for L2 testnet infrastructure

**Built as a technical exploration, not an official implementation.**

---

## Support

- **Demo Guide**: Step-by-step in [DEMO-GUIDE.md](./DEMO-GUIDE.md)
- **GitHub Issues**: https://github.com/PedroDnT/delos-oracle/issues

---

**DELOS** - Exploring blockchain infrastructure for Brazilian tokenized securities
