# 🌟 DELOS - Brazilian Macro Oracle Platform

> AI-powered platform for on-chain Brazilian macroeconomic data and tokenized debentures

[![Arbitrum Sepolia](https://img.shields.io/badge/Arbitrum-Sepolia-blue)](https://sepolia.arbiscan.io/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-orange)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.22.17-yellow)](https://hardhat.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.9+-green)](https://python.org/)

---

## 📖 Overview

**DELOS** is a comprehensive platform for Brazil's tokenized securities pilot program (ANBIMA), providing:

- 🔮 **On-Chain Macro Oracle**: Real-time BCB (Banco Central do Brasil) rates on Arbitrum Sepolia
- 💎 **Tokenized Debentures**: ERC-20 compliant debentures with IPCA/CDI indexation
- 🏭 **Clone Factory**: Gas-efficient debenture deployment using EIP-1167 (6.7KB)
- 🤖 **Automated Backend**: Scheduled rate updates and REST API
- 📱 **Modern Frontend**: Next.js 14 dashboard with RainbowKit wallet connection

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

## 📚 Documentation

- **[DEMO-GUIDE.md](./DEMO-GUIDE.md)** - Complete demonstration guide (Portuguese)
- **[CLAUDE.md](./CLAUDE.md)** - Full implementation tracking & architecture
- **[IMPLEMENTATION-COMPLETE.md](./IMPLEMENTATION-COMPLETE.md)** - Completion status
- **[scripts/README.md](./scripts/README.md)** - Deployment & interaction scripts

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

## 🔐 Security

### Audit Status

- ⚠️ **Not audited** - Pilot/demo implementation
- 🔒 Circuit breakers for oracle updates
- ✅ ERC-1404 transfer restrictions
- ✅ Access control (Ownable2Step)
- ✅ Reentrancy guards

### Known Limitations

1. Single oracle updater (first-party oracle)
2. No multi-sig for critical operations
3. Limited to Arbitrum Sepolia testnet

**Future**: Decentralized oracle network, multi-sig governance

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

## 🎯 Key Features

### Oracle
- ✅ 6 Brazilian macro rates on-chain
- ✅ Chainlink AggregatorV3 compatible
- ✅ 8-decimal precision
- ✅ Circuit breakers & bounds validation
- ✅ Batch updates for gas efficiency

### Debentures
- ✅ ERC-20 + ERC-1404 (transfer restrictions)
- ✅ 5 rate types: PRE, DI_SPREAD, DI_PERCENT, IPCA_SPREAD, IGPM_SPREAD
- ✅ 3 amortization types: BULLET, PERCENT_VNE, PERCENT_VNA
- ✅ Monthly/quarterly/semi-annual/annual coupons
- ✅ Early redemption & repactuation
- ✅ KYC whitelist

### Factory
- ✅ EIP-1167 minimal proxy (~6.7KB per debenture)
- ✅ Registry of all debentures
- ✅ Filter by issuer
- ✅ Gas-efficient deployment

### Backend
- ✅ Automated rate updates (APScheduler)
- ✅ Retry logic & error handling
- ✅ Anomaly detection
- ✅ SQLite data versioning
- ✅ RESTful API (FastAPI)

---

## 🤝 Contributing

This is a pilot implementation for ANBIMA's tokenized securities program.

For improvements or issues:
1. Open an issue on GitHub
2. Submit a pull request
3. Contact the development team

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) file

---

## 🙏 Acknowledgments

- **ANBIMA** - Tokenized securities pilot program
- **Banco Central do Brasil (BCB)** - Macroeconomic data API
- **Chainlink** - Oracle standard (AggregatorV3Interface)
- **OpenZeppelin** - Smart contract libraries
- **Arbitrum** - L2 scaling solution

---

## 📞 Support

- **Documentation**: Full docs in [CLAUDE.md](./CLAUDE.md)
- **Demo Guide**: Step-by-step in [DEMO-GUIDE.md](./DEMO-GUIDE.md)
- **GitHub Issues**: https://github.com/PedroDnT/delos-oracle/issues

---

<p align="center">
  <strong>Built with ❤️ for Brazil's tokenized securities future</strong>
</p>
