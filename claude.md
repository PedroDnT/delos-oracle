# DELOS - Brazilian Macro Oracle Platform

> AI-assisted development tracking for ANBIMA tokenized securities pilot

## Project Overview

A **Brazilian Macro Data Oracle Platform** providing on-chain access to BCB (Banco Central do Brasil) macroeconomic indicators for tokenized debentures. Built for ANBIMA's tokenized securities pilot program.

**Key Value Proposition**: Chainlink-compatible oracle delivering IPCA, CDI, SELIC, PTAX, IGPM, and TR rates for DeFi and tokenized securities applications.

---

## Current Status: ~65% Complete

### Phase 1: Oracle Infrastructure (COMPLETE)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| BrazilianMacroOracle.sol | ✅ Done | `contracts/contracts/` | 577 lines, 33/33 tests passing |
| BCB Client | ✅ Done | `backend/bcb_client.py` | 784 lines, async/sync support |
| Oracle Updater | ✅ Done | `backend/oracle_updater.py` | 431 lines, Web3 integration |
| Oracle Tests | ✅ Done | `contracts/test/` | Full coverage |

**Deployed**: Arbitrum Sepolia - `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe`

### Phase 2: Tokenized Debentures (IN PROGRESS)

| Component | Status | Priority | Notes |
|-----------|--------|----------|-------|
| BrazilianDebenture.sol | ✅ Done | HIGH | 900+ lines, ANBIMA-compliant |
| RestrictedToken.sol | ⚠️ Integrated | HIGH | ERC-1404 in BrazilianDebenture |
| DebentureFactory.sol | ❌ Empty | MEDIUM | Deployment templates |
| Debenture Tests | ✅ Done | HIGH | 61/61 tests passing |
| MockERC20.sol | ✅ Done | - | Test helper for payment token |

### Phase 3: Backend Services (PARTIAL)

| Component | Status | Priority | Effort |
|-----------|--------|----------|--------|
| scheduler.py | ❌ Empty | MEDIUM | 1 day |
| api.py | ❌ Empty | MEDIUM | 1.5 days |
| Health monitoring | ❌ Planned | LOW | 0.5 days |

### Phase 4: Frontend (NOT STARTED)

| Component | Status | Priority |
|-----------|--------|----------|
| Next.js scaffold | ❌ Empty | MEDIUM |
| Oracle dashboard | ❌ Planned | MEDIUM |
| Debenture issuance UI | ❌ Planned | MEDIUM |
| Portfolio management | ❌ Planned | LOW |

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
│  │RestrictedToken │──│BrazilianDeben- │──│DebentureFactory  │  │
│  │   (ERC-1404)   │  │     ture       │  │                  │  │
│  │   ✅ (inline)  │  │      ✅        │  │       ❌         │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                          │
│  Oracle Dashboard │ Issuance UI │ Portfolio │  ❌ Not Started   │
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

1. **RestrictedToken.sol**
   - ERC20 with transfer restrictions
   - Whitelist/blacklist logic
   - KYC compliance hooks
   - Pause mechanism

2. **BrazilianDebenture.sol**
   - Inherit RestrictedToken
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
python bcb_client.py              # Test BCB API
python oracle_updater.py status   # Check on-chain state
python oracle_updater.py sync-all # Update all rates
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

## Files Modified This Session

| File | Action | Description |
|------|--------|-------------|
| `claude.md` | Created/Updated | This tracking document |
| `BrazilianDebenture.sol` | Improved | Oracle interface, batch claims, ERC-165 |
| `hardhat.config.ts` | Updated | Added viaIR for compilation |
| `BrazilianDebenture.test.ts` | Created | 61 comprehensive tests |
| `mocks/MockERC20.sol` | Created | Test helper for payment token |

---

## Next Session Recommendations

1. **Implement DebentureFactory.sol** - Standardized deployment templates
2. **Backend scheduler.py** - Automated oracle updates
3. **Backend api.py** - REST endpoints for rate queries
4. **Integration tests** - End-to-end oracle → debenture flow
5. **Deploy BrazilianDebenture to testnet** - With mock payment token
