# DELOS Platform - Complete Deployment Guide

> Brazilian Macro Oracle for Tokenized Securities on Arbitrum Sepolia

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Architecture Deep Dive](#architecture-deep-dive)
3. [Deployed Contracts](#deployed-contracts)
4. [The Clone Factory Pattern](#the-clone-factory-pattern)
5. [How to Use](#how-to-use)
6. [Frontend Guide](#frontend-guide)
7. [Backend Services](#backend-services)
8. [API Reference](#api-reference)

---

## Platform Overview

DELOS is a **Brazilian Macro Data Oracle Platform** that brings Central Bank of Brazil (BCB) economic indicators on-chain for tokenized debentures (corporate bonds).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐       │
│   │   BCB API   │ ──────▶ │   Backend   │ ──────▶ │   Oracle    │       │
│   │ (6 Rates)   │         │  (Python)   │         │ (Solidity)  │       │
│   └─────────────┘         └─────────────┘         └──────┬──────┘       │
│                                                          │              │
│                                                          ▼              │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐       │
│   │  Frontend   │ ◀────── │   Factory   │ ◀────── │ Debentures  │       │
│   │  (Next.js)  │         │  (Clones)   │         │ (ERC-1404)  │       │
│   └─────────────┘         └─────────────┘         └─────────────┘       │
│                                                                          │
│                        ARBITRUM SEPOLIA TESTNET                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Supported Economic Rates

| Rate | Description | Source | Update Frequency |
|------|-------------|--------|------------------|
| **IPCA** | Consumer Price Index | BCB Series 433 | Monthly |
| **CDI** | Interbank Deposit Rate | BCB Series 12 | Daily |
| **SELIC** | Central Bank Target Rate | BCB Series 432 | Daily |
| **PTAX** | USD/BRL Exchange Rate | BCB Series 1 | Daily |
| **IGPM** | General Market Price Index | BCB Series 189 | Monthly |
| **TR** | Reference Rate | BCB Series 226 | Daily |

---

## Architecture Deep Dive

### Layer 1: Data Source (BCB API)

```
Central Bank of Brazil
        │
        │  HTTP/JSON
        ▼
┌───────────────────┐
│   bcb_client.py   │  ← Fetches rates with retry logic
│   - fetch_rate()  │
│   - validate()    │
│   - parallel()    │
└───────────────────┘
```

### Layer 2: Backend Services (Python)

```
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND SERVICES                         │
├─────────────────┬─────────────────┬─────────────────────────┤
│                 │                 │                         │
│  bcb_client.py  │  scheduler.py   │  oracle_updater.py      │
│  ─────────────  │  ────────────   │  ─────────────────      │
│  Fetches from   │  APScheduler    │  Web3 integration       │
│  BCB API        │  daily/monthly  │  pushes to chain        │
│                 │  jobs           │                         │
├─────────────────┴─────────────────┴─────────────────────────┤
│                                                              │
│  api.py (FastAPI)          │  services/                     │
│  ─────────────────         │  ─────────                     │
│  REST endpoints            │  data_store.py (SQLite)        │
│  /rates, /health           │  anomaly_detector.py           │
│  /sync, /scheduler         │                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Layer 3: Smart Contracts (Solidity)

```
┌─────────────────────────────────────────────────────────────┐
│                    SMART CONTRACTS                           │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              BrazilianMacroOracle                      │  │
│  │              ─────────────────────                     │  │
│  │  • Chainlink AggregatorV3 compatible                  │  │
│  │  • 8 decimal precision                                │  │
│  │  • 6 rate types with bounds checking                  │  │
│  │  • Stale data detection                               │  │
│  │                                                        │  │
│  │  Address: 0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe  │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────┐    ┌──────────────────────────────┐  │
│  │ Implementation   │    │    DebentureCloneFactory     │  │
│  │ (17.5 KB)        │◀───│    ──────────────────────    │  │
│  │                  │    │    • Creates clones          │  │
│  │ BrazilianDeben-  │    │    • Only 6.7 KB!            │  │
│  │ tureCloneable    │    │    • Tracks all debentures   │  │
│  │                  │    │    • Authorized issuers      │  │
│  │ 0x8856dd1f...    │    │    0x946ca8D4...             │  │
│  └──────────────────┘    └──────────────────────────────┘  │
│                                    │                        │
│                                    ▼                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Debenture Clones (~45 bytes each)        │  │
│  │              ─────────────────────────────────        │  │
│  │                                                        │  │
│  │    Clone 1        Clone 2        Clone 3     ...      │  │
│  │   ┌──────┐       ┌──────┐       ┌──────┐              │  │
│  │   │ ISIN │       │ ISIN │       │ ISIN │              │  │
│  │   │ #001 │       │ #002 │       │ #003 │              │  │
│  │   └──┬───┘       └──┬───┘       └──┬───┘              │  │
│  │      │              │              │                   │  │
│  │      └──────────────┴──────────────┘                   │  │
│  │                     │                                  │  │
│  │                     ▼                                  │  │
│  │         All point to Implementation                    │  │
│  │         (delegatecall pattern)                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Layer 4: Frontend (Next.js 14)

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND                                │
│                                                              │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│   │   Oracle    │  │   Issue     │  │  Portfolio  │        │
│   │  Dashboard  │  │  Debenture  │  │    View     │        │
│   │     /       │  │   /issue    │  │  /portfolio │        │
│   └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                              │
│   Technologies:                                              │
│   • Next.js 14 (App Router)                                 │
│   • TypeScript                                               │
│   • Tailwind CSS                                             │
│   • RainbowKit + wagmi (Web3)                               │
│   • TanStack Query (Data fetching)                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployed Contracts

### Arbitrum Sepolia (Chain ID: 421614)

| Contract | Address | Size | Verified |
|----------|---------|------|----------|
| **BrazilianMacroOracle** | `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe` | 13.5 KB | ✅ |
| **BrazilianDebentureCloneable** | `0x8856dd1f536169B8A82D8DA5476F9765b768f51D` | 17.5 KB | ✅ |
| **DebentureCloneFactory** | `0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f` | 6.7 KB | ✅ |

### Arbiscan Links

- [Oracle Contract](https://sepolia.arbiscan.io/address/0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe#code)
- [Implementation Contract](https://sepolia.arbiscan.io/address/0x8856dd1f536169B8A82D8DA5476F9765b768f51D#code)
- [Factory Contract](https://sepolia.arbiscan.io/address/0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f#code)

---

## The Clone Factory Pattern

### Why We Use EIP-1167 Minimal Proxies

Ethereum has a **24 KB contract size limit**. Our original factory was 29 KB because it included the full debenture bytecode for deployment.

```
PROBLEM: Original Factory
─────────────────────────

┌────────────────────────────────────┐
│         DebentureFactory           │
│         (29,590 bytes)             │  ← TOO BIG!
│                                    │
│  • Full BrazilianDebenture code   │
│  • All deployment logic           │
│  • Registry mappings              │
│                                    │
│  ❌ Cannot deploy (>24KB)          │
└────────────────────────────────────┘


SOLUTION: Clone Pattern (EIP-1167)
──────────────────────────────────

┌────────────────────┐     ┌────────────────────┐
│   Implementation   │     │ DebentureClone-    │
│   (17,586 bytes)   │     │ Factory            │
│                    │     │ (6,691 bytes)      │
│   Deployed ONCE    │◀────│                    │
│   Contains all     │     │ Creates tiny       │
│   debenture logic  │     │ proxy clones       │
│                    │     │                    │
│   ✅ Under limit   │     │ ✅ Under limit     │
└────────────────────┘     └────────────────────┘
         ▲
         │  delegatecall
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌───▼───┐
│Clone 1│ │Clone 2│  ...  Each clone is only ~45 bytes!
│(45 B) │ │(45 B) │
└───────┘ └───────┘
```

### Cost Comparison

| Deployment Method | Contract Size | Gas Cost | Status |
|-------------------|---------------|----------|--------|
| Full Contract | 21,279 bytes | ~3,000,000 gas | ❌ Expensive |
| **Clone (EIP-1167)** | **45 bytes** | **~45,000 gas** | ✅ **98% savings** |

### How Clones Work

```solidity
// The clone is just a tiny bytecode that delegates all calls:
//
// PUSH20 <implementation_address>
// DELEGATECALL
//
// All storage is in the clone, but code runs from implementation
```

---

## How to Use

### 1. Start Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# Run API server
python api.py
# → http://localhost:8000/docs
```

### 2. Start Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### 3. Create a Debenture

```
┌─────────────────────────────────────────────────────────────┐
│                    ISSUANCE FLOW                             │
│                                                              │
│   1. Connect Wallet (RainbowKit)                            │
│      └─▶ MetaMask, WalletConnect, etc.                      │
│                                                              │
│   2. Fill Debenture Form                                    │
│      ├─▶ Name: "Petrobras IPCA+ 2026"                       │
│      ├─▶ Symbol: "PETR26"                                   │
│      ├─▶ ISIN: "BRPETR000001" (12 chars)                    │
│      ├─▶ VNE: 1000 (R$ per unit)                            │
│      ├─▶ Total Supply: 10000 units                          │
│      ├─▶ Maturity: 2 years                                  │
│      ├─▶ Rate Type: IPCA + Spread                           │
│      └─▶ Spread: 5.00%                                      │
│                                                              │
│   3. Submit Transaction                                     │
│      └─▶ Calls factory.createDebenture(...)                 │
│                                                              │
│   4. Clone Deployed!                                        │
│      └─▶ New debenture address returned                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4. Interact with Debenture

```javascript
// Read debenture info
const terms = await debenture.getTerms()
const vna = await debenture.getVNA()

// Whitelist management (ISSUER/TRUSTEE only)
await debenture.addToWhitelist(investorAddress)

// Transfer tokens (requires whitelist)
await debenture.transfer(to, amount)

// Claim coupons
await debenture.claimAllCoupons()
```

---

## Frontend Guide

### Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `RateDashboard` | View all 6 oracle rates in real-time |
| `/issue` | `IssueForm` | Create new debentures |
| `/portfolio` | `PortfolioList` | View all debentures from factory |

### Environment Variables

```bash
# frontend/.env.local

# Required
NEXT_PUBLIC_CHAIN_ID=421614
NEXT_PUBLIC_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
NEXT_PUBLIC_ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
NEXT_PUBLIC_FACTORY_ADDRESS=0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000

# Optional
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

---

## Backend Services

### Directory Structure

```
backend/
├── api.py                 # FastAPI REST server
├── bcb_client.py          # BCB API client
├── oracle_updater.py      # Web3 oracle updates
├── scheduler.py           # APScheduler jobs
├── config.py              # Pydantic settings
├── logging_config.py      # Structured logging
├── requirements.txt       # Dependencies
└── services/
    ├── data_store.py      # SQLite persistence
    └── anomaly_detector.py # Rate anomaly detection
```

### Scheduler Jobs

```
┌─────────────────────────────────────────────────────────────┐
│                    SCHEDULED JOBS                            │
│                                                              │
│   Daily (19:00 BRT)                                         │
│   ─────────────────                                         │
│   • CDI rate update                                         │
│   • SELIC rate update                                       │
│   • PTAX rate update                                        │
│   • TR rate update                                          │
│                                                              │
│   Monthly (10th, 10:00 BRT)                                 │
│   ────────────────────────                                  │
│   • IPCA rate update                                        │
│   • IGPM rate update                                        │
│                                                              │
│   Every 4 Hours                                             │
│   ──────────────                                            │
│   • Stale data check                                        │
│   • Anomaly detection                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/rates` | All current rates from oracle |
| GET | `/rates/{type}` | Specific rate (CDI, IPCA, etc.) |
| GET | `/rates/{type}/history` | Historical rates |
| POST | `/sync` | Manual sync trigger |
| GET | `/scheduler/jobs` | View scheduled jobs |
| GET | `/scheduler/runs` | View recent job runs |
| GET | `/bcb/latest/{type}` | Direct BCB fetch |
| GET | `/anomalies` | View detected anomalies |
| GET | `/stats` | Database statistics |

### Example Response

```json
// GET /rates/CDI
{
  "rate_type": "CDI",
  "raw_value": 11.15,
  "real_world_date": 20241211,
  "timestamp": 1702339200,
  "is_stale": false
}
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    DELOS QUICK REFERENCE                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  CONTRACTS (Arbitrum Sepolia)                               │
│  ─────────────────────────────                              │
│  Oracle:         0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe │
│  Implementation: 0x8856dd1f536169B8A82D8DA5476F9765b768f51D │
│  Factory:        0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f │
│                                                              │
│  COMMANDS                                                    │
│  ────────                                                   │
│  Backend:   cd backend && python api.py                     │
│  Frontend:  cd frontend && npm run dev                      │
│  Deploy:    npx hardhat run scripts/deploy-clone-factory.ts │
│                                                              │
│  RATE TYPES                                                  │
│  ──────────                                                 │
│  PRE         → Fixed rate (prefixado)                       │
│  DI_SPREAD   → DI + spread (e.g., DI + 2%)                  │
│  DI_PERCENT  → % of DI (e.g., 100% CDI)                     │
│  IPCA_SPREAD → IPCA + spread (e.g., IPCA + 5%)              │
│  IGPM_SPREAD → IGPM + spread                                │
│                                                              │
│  PRECISION                                                   │
│  ─────────                                                  │
│  Oracle:    8 decimals (Chainlink standard)                 │
│  VNE/VNA:   6 decimals                                      │
│  Rates:     4 decimals (basis points)                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Reference

### Smart Contracts

| File | Description |
|------|-------------|
| `contracts/contracts/BrazilianMacroOracle.sol` | Oracle with 6 rate types |
| `contracts/contracts/BrazilianDebentureCloneable.sol` | Initializable debenture implementation |
| `contracts/contracts/DebentureCloneFactory.sol` | EIP-1167 clone factory |
| `contracts/contracts/BrazilianDebenture.sol` | Original debenture (constructor-based) |
| `contracts/scripts/deploy-clone-factory.ts` | Deployment script |

### Frontend

| File | Description |
|------|-------------|
| `frontend/app/page.tsx` | Oracle dashboard |
| `frontend/app/issue/page.tsx` | Debenture issuance |
| `frontend/app/portfolio/page.tsx` | Portfolio view |
| `frontend/lib/contracts.ts` | Contract ABIs and addresses |
| `frontend/lib/wagmi.ts` | Web3 configuration |
| `frontend/components/oracle/RateDashboard.tsx` | Rate cards grid |
| `frontend/components/debenture/IssueForm.tsx` | Issuance form |

### Backend

| File | Description |
|------|-------------|
| `backend/api.py` | FastAPI REST server |
| `backend/bcb_client.py` | BCB API client |
| `backend/oracle_updater.py` | Web3 updates |
| `backend/scheduler.py` | Job scheduling |
| `backend/services/data_store.py` | SQLite storage |
| `backend/services/anomaly_detector.py` | Anomaly detection |

---

## Support

- **Repository Issues**: [GitHub Issues](https://github.com/your-repo/delos-oracle/issues)
- **ANBIMA Reference**: [Metodologia de Precificacao](https://www.anbima.com.br)
- **Arbitrum Docs**: [docs.arbitrum.io](https://docs.arbitrum.io)

---

*Generated by DELOS Platform - December 2024*
