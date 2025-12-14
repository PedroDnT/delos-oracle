# DELOS Developer Guide

## Quick Start

This guide will help you set up the DELOS development environment and run the full stack locally.

### Prerequisites

- **Node.js**: v18 or higher
- **Python**: v3.10 or higher
- **Git**: Latest version
- **Wallet**: MetaMask or similar with Arbitrum Sepolia ETH

### Repository Structure

```
delos-oracle/
├── contracts/          # Solidity smart contracts (Hardhat)
│   ├── contracts/      # Contract source files
│   ├── scripts/        # Deployment scripts
│   ├── test/           # Contract tests
│   └── artifacts/      # Compiled ABIs
├── backend/            # Python backend services
│   ├── api.py          # FastAPI REST server
│   ├── bcb_client.py   # BCB API client
│   ├── oracle_updater.py # Web3 oracle integration
│   ├── scheduler.py    # APScheduler automation
│   └── services/       # Data store, anomaly detection
├── frontend/           # Next.js 14 application
│   ├── app/            # App Router pages
│   ├── components/     # React components
│   └── lib/            # Utilities and config
└── docs/               # Documentation
```

---

## 1. Clone Repository

```bash
git clone https://github.com/your-org/delos-oracle.git
cd delos-oracle
```

---

## 2. Smart Contracts Setup

### Install Dependencies

```bash
cd contracts
npm install
```

### Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Your wallet private key (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# RPC URLs
ARBITRUM_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc

# Deployed contract addresses (after deployment)
ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
```

### Compile Contracts

```bash
npx hardhat compile
```

### Run Tests

```bash
# Run all tests
npx hardhat test

# Run with coverage
npx hardhat coverage

# Run specific test file
npx hardhat test test/BrazilianMacroOracle.test.ts
```

### Deploy to Arbitrum Sepolia

```bash
# Deploy oracle
npx hardhat run scripts/deploy.ts --network arbitrumSepolia

# Deploy debenture factory
npx hardhat run scripts/deploy-clone-factory.ts --network arbitrumSepolia
```

### Verify Contracts

```bash
npx hardhat verify --network arbitrumSepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

---

## 3. Backend Setup

### Create Virtual Environment

```bash
cd backend
python -m venv venv

# Activate (Linux/macOS)
source venv/bin/activate

# Activate (Windows)
venv\Scripts\activate
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Oracle Contract
ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
PRIVATE_KEY=your_private_key_here
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=*

# Scheduler (BRT timezone)
DAILY_UPDATE_HOUR=19
DAILY_UPDATE_MINUTE=0
MONTHLY_UPDATE_DAY=10

# Anomaly Detection
ANOMALY_STD_THRESHOLD=3.0
ANOMALY_LOOKBACK_DAYS=30
ANOMALY_VELOCITY_THRESHOLD=0.5

# Database
DATABASE_PATH=data/rates.db

# Logging
LOG_LEVEL=INFO
LOG_JSON_FORMAT=false
```

### Test BCB Client

```bash
python bcb_client.py
```

Expected output:
```
BCB CLIENT - Brazilian Macro Oracle Data Fetcher
======================================================================
Rate   |    Raw Value | Chainlink (8 dec)  |  Basis Pts |         Date | Source
-------------------------------------------------------------------------------------
IPCA   |       0.5600% |         56,000,000 |      5,600 |   01/11/2024 | BCB-433
CDI    |      10.9000% |      1,090,000,000 |    109,000 |   26/11/2024 | BCB-12
...
```

### Test Oracle Connection

```bash
python oracle_updater.py status
```

### Run API Server

```bash
# Development mode
uvicorn api:app --reload --host 0.0.0.0 --port 8000

# Or using the script
python api.py
```

Access:
- API: http://localhost:8000
- Swagger Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Run Scheduler (Optional)

In a separate terminal:
```bash
cd backend
source venv/bin/activate
python scheduler.py start
```

---

## 4. Frontend Setup

### Install Dependencies

```bash
cd frontend
npm install
```

### Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
NEXT_PUBLIC_FACTORY_ADDRESS=0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
```

### Run Development Server

```bash
npm run dev
```

Access: http://localhost:3000

### Build for Production

```bash
npm run build
npm start
```

---

## 5. Full Stack Development

### Terminal Layout

Run these in separate terminals:

**Terminal 1: Backend API**
```bash
cd backend && source venv/bin/activate && python api.py
```

**Terminal 2: Scheduler (Optional)**
```bash
cd backend && source venv/bin/activate && python scheduler.py start
```

**Terminal 3: Frontend**
```bash
cd frontend && npm run dev
```

### Workflow

1. Make changes to contracts, backend, or frontend
2. If contracts changed:
   - Run `npx hardhat compile`
   - Run `npx hardhat test`
   - Deploy if needed
   - Update addresses in environment files
3. If backend changed:
   - Restart API server
4. If frontend changed:
   - Next.js hot-reloads automatically

---

## 6. Testing

### Smart Contract Tests

```bash
cd contracts

# Run all tests
npx hardhat test

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run specific test
npx hardhat test test/BrazilianMacroOracle.test.ts

# Generate coverage report
npx hardhat coverage
```

### Backend Testing

```bash
cd backend
source venv/bin/activate

# Test BCB client
python bcb_client.py

# Test oracle connection
python oracle_updater.py status

# Test sync functionality
python oracle_updater.py check
python oracle_updater.py sync --rate CDI

# Test scheduler
python scheduler.py status
python scheduler.py run-once --rates CDI,SELIC

# Test API endpoints
curl http://localhost:8000/health
curl http://localhost:8000/rates
curl http://localhost:8000/rates/CDI
```

### Frontend Testing

```bash
cd frontend

# Type checking
npm run type-check

# Linting
npm run lint
```

---

## 7. Common Development Tasks

### Adding a New Rate Type

1. **Backend** (`bcb_client.py`):
```python
class RateType(str, Enum):
    # ... existing rates
    NEW_RATE = "NEW_RATE"

RATE_CONFIGS[RateType.NEW_RATE] = RateConfig(
    bcb_series=XXX,           # BCB series code
    description="...",
    decimals=8,
    heartbeat_seconds=2 * 24 * 3600,
    min_value=0,
    max_value=50_00000000,
    is_percentage=True,
    update_frequency="daily"
)
```

2. **Smart Contract** (`BrazilianMacroOracle.sol`):
```solidity
constructor() {
    // ... existing rates
    _addRate(
        "NEW_RATE",
        "New Rate - Description",
        "Full description",
        CHAINLINK_DECIMALS,
        2 days,
        0,
        50_00000000
    );
}
```

3. **Frontend** (`contracts.ts`):
```typescript
export enum RateType {
    // ... existing rates
    NEW_RATE = 'NEW_RATE',
}
```

### Updating Oracle Data Manually

```bash
cd backend
source venv/bin/activate

# Sync all rates
python oracle_updater.py sync-all

# Sync specific rate
python oracle_updater.py sync --rate IPCA

# Force update (bypass same-date check)
python oracle_updater.py sync-all --force
```

### Checking Contract State

```bash
# Get current rates
python oracle_updater.py status

# Check which rates need updates
python oracle_updater.py check

# Check account balance
python oracle_updater.py balance
```

### Database Operations

```bash
# View database stats via API
curl http://localhost:8000/stats

# View recent anomalies
curl http://localhost:8000/anomalies

# The SQLite database is at: backend/data/rates.db
sqlite3 backend/data/rates.db ".tables"
```

---

## 8. Debugging

### Smart Contract Debugging

```javascript
// In Hardhat tests, use console.log
import "hardhat/console.sol";

function updateRate(...) {
    console.log("Rate type:", rateType);
    console.log("Answer:", answer);
}
```

### Backend Debugging

```python
# Enable debug logging
LOG_LEVEL=DEBUG python api.py

# Or in code
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Frontend Debugging

```typescript
// Use React DevTools and browser console
console.log('Contract address:', CONTRACTS.oracle.address);

// Check wagmi state
import { useAccount, useChainId } from 'wagmi';
const { address, isConnected } = useAccount();
const chainId = useChainId();
```

### Common Issues

#### "Rate not found in oracle"
- Ensure oracle has been populated with data
- Run `python oracle_updater.py sync-all`

#### "Transaction reverted: SameDateUpdate"
- The rate was already updated for this BCB date
- Use `--force` flag or wait for new BCB data

#### "Not authorized issuer"
- Factory requires authorization to create debentures
- Owner must call `setAuthorizedIssuer(address, true)`

#### "BCB API timeout"
- BCB API may be slow; retry with increased timeout
- Check `bcb_api_timeout` in config

#### Frontend "Failed to load rates"
- Ensure backend API is running
- Check `NEXT_PUBLIC_BACKEND_API_URL` in `.env.local`
- Verify CORS configuration

---

## 9. Code Style

### Solidity

- Follow Solidity Style Guide
- Use custom errors instead of require strings
- Use NatSpec comments for functions
- Run Slither for static analysis

### Python

- Follow PEP 8
- Use type hints
- Use async/await for I/O operations
- Format with Black

### TypeScript

- Use TypeScript strict mode
- Define explicit types
- Use ESLint + Prettier

---

## 10. Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Contract addresses updated
- [ ] API endpoints accessible
- [ ] Frontend builds without errors

### Smart Contracts

- [ ] Compile fresh: `npx hardhat compile`
- [ ] Run tests: `npx hardhat test`
- [ ] Deploy: `npx hardhat run scripts/deploy.ts --network arbitrumSepolia`
- [ ] Verify on Arbiscan
- [ ] Update addresses in all configs

### Backend

- [ ] Test BCB connection: `python bcb_client.py`
- [ ] Test oracle connection: `python oracle_updater.py status`
- [ ] Sync initial data: `python oracle_updater.py sync-all`
- [ ] Start API server
- [ ] (Optional) Start scheduler

### Frontend

- [ ] Update contract addresses in `.env.local`
- [ ] Build: `npm run build`
- [ ] Deploy to hosting service

---

## 11. Environment Variables Reference

### contracts/.env

```env
PRIVATE_KEY=                        # Required: Wallet private key
ARBITRUM_SEPOLIA_RPC=               # Optional: Custom RPC URL
ORACLE_ADDRESS=                     # Set after deployment
ETHERSCAN_API_KEY=                  # Optional: For verification
```

### backend/.env

```env
# Required
ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
PRIVATE_KEY=your_private_key

# Optional (with defaults)
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
BCB_API_TIMEOUT=30.0
BCB_MAX_RETRIES=3
DAILY_UPDATE_HOUR=19
DAILY_UPDATE_MINUTE=0
MONTHLY_UPDATE_DAY=10
ANOMALY_STD_THRESHOLD=3.0
ANOMALY_LOOKBACK_DAYS=30
DATABASE_PATH=data/rates.db
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=*
LOG_LEVEL=INFO
LOG_JSON_FORMAT=false
```

### frontend/.env.local

```env
NEXT_PUBLIC_ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
NEXT_PUBLIC_FACTORY_ADDRESS=0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
```

---

## 12. Useful Commands Reference

### Contracts

```bash
npx hardhat compile                    # Compile contracts
npx hardhat test                       # Run tests
npx hardhat coverage                   # Coverage report
npx hardhat run scripts/deploy.ts --network arbitrumSepolia  # Deploy
npx hardhat verify --network arbitrumSepolia <ADDRESS>       # Verify
npx hardhat console --network arbitrumSepolia                # Interactive console
```

### Backend

```bash
python bcb_client.py                   # Test BCB client
python oracle_updater.py status        # View oracle state
python oracle_updater.py check         # Check for updates needed
python oracle_updater.py sync-all      # Sync all rates
python scheduler.py start              # Run scheduler daemon
python scheduler.py run-once           # Manual update
python api.py                          # Run API server
uvicorn api:app --reload               # API with hot reload
```

### Frontend

```bash
npm run dev                            # Development server
npm run build                          # Production build
npm start                              # Start production
npm run lint                           # Run linter
npm run type-check                     # TypeScript check
```

### API Testing

```bash
curl http://localhost:8000/health
curl http://localhost:8000/rates
curl http://localhost:8000/rates/CDI
curl http://localhost:8000/rates/IPCA/history?days=30
curl -X POST http://localhost:8000/sync
curl http://localhost:8000/scheduler/jobs
curl http://localhost:8000/anomalies
curl http://localhost:8000/stats
```

---

## Support

For issues and questions:
1. Check existing documentation in `/docs`
2. Review CLAUDE.md for project context
3. Open an issue on the repository
