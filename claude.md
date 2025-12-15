# DELOS - Brazilian Macro Oracle Platform

> AI-assisted development tracking for ANBIMA tokenized securities pilot

## Project Overview

A **Brazilian Macro Data Oracle Platform** providing on-chain access to BCB (Banco Central do Brasil) macroeconomic indicators for tokenized debentures. Built for ANBIMA's tokenized securities pilot program.

**Key Value Proposition**: Chainlink-compatible oracle delivering IPCA, CDI, SELIC, PTAX, IGPM, and TR rates for DeFi and tokenized securities applications.

---

## Current Status: 95% Complete ✅

### Phase 1: Oracle Infrastructure (COMPLETE)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| BrazilianMacroOracle.sol | ✅ Done | `contracts/contracts/` | 577 lines, 33/33 tests passing |
| BCB Client | ✅ Enhanced | `backend/bcb_client.py` | 850+ lines, parallel fetch, retry, validation |
| Oracle Updater | ✅ Done | `backend/oracle_updater.py` | 431 lines, Web3 integration |
| Oracle Tests | ✅ Done | `contracts/test/` | Full coverage |

**Deployed**: Arbitrum Sepolia - `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe`

### Phase 2: Tokenized Debentures (COMPLETE)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| BrazilianDebentureCloneable.sol | ✅ Done | `contracts/contracts/` | Initializable version for Clone pattern |
| DebentureCloneFactory.sol | ✅ Done | `contracts/contracts/` | EIP-1167 minimal proxy factory (6.7KB) |
| BrazilianDebenture.sol | ✅ Done | `contracts/contracts/` | 900+ lines, ANBIMA-compliant |
| Debenture Tests | ✅ Done | `contracts/test/` | 61/61 tests passing |
| MockERC20.sol | ✅ Done | `contracts/mocks/` | Test helper for payment token |

**Deployed on Arbitrum Sepolia:**
- Implementation: `0x8856dd1f536169B8A82D8DA5476F9765b768f51D`
- Factory: `0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f`

### Phase 3: Backend Services (COMPLETE)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| config.py | ✅ Done | `backend/` | Pydantic settings management |
| logging_config.py | ✅ Done | `backend/` | Structured JSON logging |
| scheduler.py | ✅ Done | `backend/` | APScheduler, daily/monthly jobs |
| api.py | ✅ Done | `backend/` | FastAPI, 10 REST endpoints |
| services/data_store.py | ✅ Done | `backend/services/` | SQLite data versioning |
| services/anomaly_detector.py | ✅ Done | `backend/services/` | Statistical anomaly detection |

### Phase 4: Frontend (COMPLETE)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Next.js 14 App | ✅ Done | `frontend/` | Modern React with App Router |
| Oracle Dashboard | ✅ Done | `frontend/app/page.tsx` | Real-time rate display |
| Debenture Issuance UI | ✅ Done | `frontend/app/issue/` | Full form with validation |
| Portfolio Management | ✅ Done | `frontend/app/portfolio/` | View all debentures |
| RainbowKit + wagmi | ✅ Done | `frontend/lib/wagmi.ts` | Wallet connection |
| Tailwind CSS | ✅ Done | `frontend/tailwind.config.ts` | Modern styling |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                              │
│  BCB API (Series: 433, 12, 432, 1, 189, 226)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Python)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ BCB Client  │──│   Updater   │──│  Scheduler  │             │
│  │  (httpx)    │  │   (web3)    │  │(APScheduler)│             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                          │                                       │
│                   ┌──────┴──────┐                                │
│                   │  REST API   │                                │
│                   │  (FastAPI)  │                                │
│                   └─────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SMART CONTRACTS (Solidity)                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              BrazilianMacroOracle ✅                      │   │
│  │  • 6 rates (IPCA, CDI, SELIC, PTAX, IGPM, TR)           │   │
│  │  • Chainlink AggregatorV3 compatible                     │   │
│  │  • 8 decimal precision                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ Debenture      │──│BrazilianDeben- │──│DebentureClone-   │  │
│  │ Cloneable ✅   │  │tureCloneable   │  │Factory ✅        │  │
│  │(Implementation)│  │  (EIP-1167)    │  │ (6.7KB factory)  │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js 14)                       │
│  Oracle Dashboard ✅ │ Issuance UI ✅ │ Portfolio ✅  │ Done!   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Supported Rates

| Rate | BCB Series | Type | Frequency | Bounds |
|------|-----------|------|-----------|--------|
| IPCA | 433 | Inflation % | Monthly | -10% to 100% |
| CDI | 12 | Interest % | Daily | 0% to 50% |
| SELIC | 432 | Interest % | Daily | 0% to 50% |
| PTAX | 1 | FX (BRL/USD) | Daily | 1.0 to 15.0 |
| IGPM | 189 | Inflation % | Monthly | -10% to 100% |
| TR | 226 | Interest % | Daily | 0% to 50% |

**Value Encoding**: `4.50%` → `450000000` (4.5 × 10^8)
**Date Format**: `YYYYMMDD` (e.g., `20241126`)

---

## Implementation Roadmap

### Immediate Priority (Week 1)

1. **RestrictedToken.sol** - ✅ **Implemented directly in debenture contracts**
   - Originally planned as separate contract, but functionality integrated into BrazilianDebenture.sol
   - ERC-1404 transfer restrictions implemented
   - Whitelist/blacklist logic included
   - KYC compliance hooks integrated
   - Pause mechanism implemented
   - Note: Empty RestrictedToken.sol file removed (not needed)

2. **BrazilianDebenture.sol** - ✅ **Complete**
   - Implements ERC-20 + ERC-1404 directly (transfer restrictions built-in)
   - Oracle integration for rate lookups
   - Coupon calculation (IPCA+ or CDI+)
   - Payment distribution
   - Maturity handling

3. **DebentureFactory.sol**
   - Deploy new debentures
   - Template configurations
   - Registry of all issuances

### Secondary Priority (Week 2)

4. **scheduler.py**
   - APScheduler setup
   - Daily updates at 19:00 BRT (CDI, PTAX, SELIC)
   - Monthly updates (IPCA, IGPM, TR)
   - Error notifications

5. **api.py**
   - FastAPI endpoints
   - `/rates`, `/rates/{type}`, `/rates/{type}/history`
   - `/health`, `/sync`

### Later Priority (Week 3+)

6. **Frontend**
   - Next.js + RainbowKit
   - Oracle dashboard
   - Debenture issuance wizard
   - Portfolio view

---

## Key Design Decisions

### 1. Chainlink Compatibility
- **Why**: DeFi interoperability
- **How**: 8 decimals, `AggregatorV3Interface`

### 2. First-Party Oracle
- **Why**: Appropriate for pilot, demonstrable trust
- **Future**: Multi-sig → decentralized

### 3. Batch Updates
- **Why**: Gas efficiency
- **How**: `batchUpdateRates()` skips same-date entries

### 4. Circuit Breakers
- **Why**: Prevent erroneous updates
- **How**: Min/max bounds per rate type

### 5. ERC-1404 Transfer Restrictions
- **Why**: Regulatory compliance
- **How**: Whitelist checks on every transfer

---

## Commands Reference

### Smart Contracts
```bash
cd contracts
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```

### Backend
```bash
cd backend

# Setup virtual environment (first time)
python -m venv venv
source venv/bin/activate          # On macOS/Linux
# venv\Scripts\activate           # On Windows

# Install dependencies
pip install -r requirements.txt

# BCB Client
python bcb_client.py              # Test BCB API

# Oracle Updater
python oracle_updater.py status   # Check on-chain state
python oracle_updater.py sync-all # Update all rates

# Scheduler
python scheduler.py start         # Run scheduler daemon
python scheduler.py run-once      # Manual update (all rates)
python scheduler.py run-once --rates CDI,SELIC  # Specific rates
python scheduler.py status        # Show job schedule

# REST API
python api.py                     # Run API server (port 8000)
uvicorn api:app --reload          # Development mode
```

### API Endpoints
```
GET  /health              - Health check
GET  /rates               - All current rates from oracle
GET  /rates/{type}        - Specific rate
GET  /rates/{type}/history - Historical rates from SQLite
POST /sync                - Manual sync trigger
GET  /scheduler/jobs      - View scheduled jobs
GET  /scheduler/runs      - View recent job runs
GET  /bcb/latest/{type}   - Direct BCB fetch (bypass oracle)
GET  /anomalies           - View detected anomalies
GET  /stats               - Database statistics
```

---

## Session Log

### 2024-11-27 - Initial Analysis
- Explored full codebase structure
- Documented current implementation status
- Created this tracking document
- **Finding**: Oracle infrastructure complete, debenture contracts empty

### 2024-11-27 - BrazilianDebenture Review & Improvements
- User implemented full `BrazilianDebenture.sol` (900+ lines)
- **Fixes applied**:
  - Fixed oracle interface mismatch (int256 vs uint256 for signed rates)
  - Fixed precision conversion (oracle 8 decimals → debenture 6 decimals)
  - Added `claimAllCoupons()` batch function for gas efficiency
  - Added `getPendingClaims()` view function
  - Added ERC-165 `supportsInterface()` for ERC-1404 detection
  - Enabled `viaIR` in hardhat config for stack-too-deep fix
- **Decisions confirmed**:
  - KYC: On-chain whitelist only
  - Coupon frequency: Variable (parameter in contract)
  - Amortization: Supported (PERCENT_VNE, PERCENT_VNA, FIXED_VALUE)
  - Rate types: All supported (PRE, DI_SPREAD, DI_PERCENT, IPCA_SPREAD, IGPM_SPREAD)

### 2024-11-27 - Comprehensive Test Suite
- Created `BrazilianDebenture.test.ts` with 61 tests covering:
  - Initialization (9 tests)
  - ERC-1404 Transfer Restrictions (8 tests)
  - Whitelist Management (6 tests)
  - Amortization Schedule (4 tests)
  - Coupon Calculation (3 tests)
  - Coupon Recording (3 tests)
  - Coupon Payment (5 tests)
  - Batch Coupon Claiming (4 tests)
  - Special Conditions: Maturity, Default, Early Redemption, Repactuation (7 tests)
  - Admin Functions (4 tests)
  - ERC-165 Interface Detection (3 tests)
  - View Functions (3 tests)
  - DI-Indexed Debentures (2 tests)
- Created `MockERC20.sol` for payment token testing
- **Total tests**: 94 passing (33 oracle + 61 debenture)

### 2024-12-08 - Factory Deployment Status
- **Fixed**: `NEXT_PUBLIC_FACTORY_ADDRESS` empty string bug in `frontend/.env.local`
  - Empty string would cast to invalid `0x` address causing runtime failures
  - Set to zero address placeholder with TODO comment
- **Verified**: DebentureFactory contract exists but has NOT been deployed
  - Contract code exists: `contracts/contracts/DebentureFactory.sol`
  - Deployment script missing: `scripts/deploy-factory.ts` does not exist
  - Environment variable set to placeholder: `0x0000000000000000000000000000000000000000`
  - Oracle deployed: `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe` on Arbitrum Sepolia
  - Factory needs deployment script and deployment to Arbitrum Sepolia before use

### 2024-12-08 - Backend Services Implementation
- **Implemented full backend service layer** based on AI/ML code review findings:
  - `config.py` - Pydantic settings management with environment variable support
  - `logging_config.py` - Structured JSON logging for production observability
  - `scheduler.py` - APScheduler-based automation with:
    - Daily updates at 19:00 BRT (CDI, SELIC, PTAX, TR)
    - Monthly updates on 10th at 10:00 BRT (IPCA, IGPM)
    - Stale data checks every 4 hours
    - Retry logic with exponential backoff
  - `api.py` - FastAPI REST API with 10 endpoints for rate queries
  - `services/data_store.py` - SQLite data versioning with 4 tables:
    - rates (historical BCB data)
    - oracle_updates (blockchain tx logs)
    - anomalies (detected anomalies)
    - scheduler_runs (job execution history)
  - `services/anomaly_detector.py` - Statistical anomaly detection:
    - Value spikes (>3 std devs from mean)
    - Stale data (exceeds heartbeat)
    - Velocity anomalies (>50% daily change)
- **Enhanced bcb_client.py**:
  - Added `fetch_all_latest_parallel()` for concurrent fetching
  - Added `fetch_with_retry()` with exponential backoff
  - Added `validate_response_structure()` for input validation
- **Updated requirements.txt** with new dependencies:
  - aiosqlite for async SQLite
  - pydantic-settings for configuration

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Coupon frequency | Variable - set per debenture |
| Whitelist management | On-chain only |
| Amortization | Full support with 3 types |
| Rate indexation | All 5 types supported |

## Remaining Questions

1. **Grace periods**: How long to wait for late coupon payments?
2. **Default triggers**: Automatic vs trustee-declared?
3. **Partial redemption**: Support early partial buybacks?

---

## Files Modified This Session (2024-12-08)

| File | Action | Description |
|------|--------|-------------|
| `backend/config.py` | Created | Pydantic settings management |
| `backend/logging_config.py` | Created | Structured JSON logging |
| `backend/scheduler.py` | Created | APScheduler automation |
| `backend/api.py` | Created | FastAPI REST API (10 endpoints) |
| `backend/services/__init__.py` | Created | Services package init |
| `backend/services/data_store.py` | Created | SQLite data versioning |
| `backend/services/anomaly_detector.py` | Created | Statistical anomaly detection |
| `backend/bcb_client.py` | Enhanced | Parallel fetch, retry, validation |
| `backend/requirements.txt` | Updated | Added aiosqlite, pydantic-settings |
| `CLAUDE.md` | Updated | Progress documentation |

---

## Next Steps

### Immediate (High Priority)
1. **Setup backend venv** - Create and activate virtual environment, install dependencies
2. **Test backend services** - Verify scheduler, API, and data store work correctly
3. **Deploy DebentureFactory** - Create deployment script and deploy to Arbitrum Sepolia

### Short Term (Medium Priority)
4. **Backend unit tests** - Add pytest tests for scheduler, API, data_store, anomaly_detector
5. **Integration tests** - End-to-end oracle → debenture flow
6. **Deploy BrazilianDebenture to testnet** - With mock payment token

### Later (Lower Priority)
7. **Frontend implementation** - Oracle dashboard and debenture issuance UI
8. **Production deployment** - Docker containerization, CI/CD pipeline
9. **Monitoring & Alerting** - Slack/email notifications for anomalies and failures

---

## Quick Start (Backend)

```bash
# 1. Navigate to backend
cd backend

# 2. Create and activate virtual environment
python -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set environment variables (copy from contracts/.env or create new)
export ORACLE_ADDRESS="0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe"
export PRIVATE_KEY="your_private_key"
export ARBITRUM_SEPOLIA_RPC="https://sepolia-rollup.arbitrum.io/rpc"

# 5. Test BCB client
python bcb_client.py

# 6. Run API server
python api.py
# Visit http://localhost:8000/docs for Swagger UI

# 7. Run scheduler (in separate terminal)
python scheduler.py start
```
