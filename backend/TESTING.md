# Backend Testing Guide - DELOS Oracle Platform

## Overview

This guide provides step-by-step instructions for manually testing all backend services of the DELOS Brazilian Macro Oracle platform.

## Prerequisites

- Python 3.9+ installed
- Access to Arbitrum Sepolia RPC
- Deployer private key with ETH balance
- Oracle contract deployed at: `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe`

---

## Quick Start

```bash
# 1. Setup virtual environment
cd backend
python -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp ../contracts/.env .env
# Or create new .env (see Configuration section)

# 4. Test BCB client
python bcb_client.py

# 5. Test Oracle connection
python oracle_updater.py status

# 6. Run API server
python api.py

# 7. Run scheduler (one-time update)
python scheduler.py run-once
```

---

## Configuration

### Environment Variables

Create a `.env` file in the `backend/` directory:

```bash
# Blockchain Configuration (REQUIRED)
ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
PRIVATE_KEY=<your_private_key_here>
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# BCB API Configuration
BCB_API_TIMEOUT=30.0
BCB_MAX_RETRIES=3
BCB_RETRY_BASE_DELAY=1.0
BCB_RETRY_MAX_DELAY=60.0

# Scheduler Configuration (BRT = UTC-3)
DAILY_UPDATE_HOUR=19
DAILY_UPDATE_MINUTE=0
MONTHLY_UPDATE_DAY=10

# Anomaly Detection
ANOMALY_STD_THRESHOLD=3.0
ANOMALY_LOOKBACK_DAYS=30
ANOMALY_VELOCITY_THRESHOLD=0.5

# Database
DATABASE_PATH=data/rates.db

# API Server
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=*

# Logging
LOG_LEVEL=INFO
LOG_JSON_FORMAT=false
```

**Note**: You can copy settings from `../contracts/.env` as a starting point.

---

## Manual Testing Checklist

### ✅ Test 1: BCB Client - Fetch Rates

**Purpose**: Verify connection to BCB API and rate parsing

```bash
python -c "
from bcb_client import BCBClient
import asyncio

async def test():
    client = BCBClient()

    # Test single rate
    cdi = await client.fetch_rate('CDI')
    print(f'CDI: {cdi.raw_value}% on {cdi.real_world_date}')
    print(f'Scaled answer: {cdi.answer}')

    # Test all rates
    all_rates = await client.fetch_all_latest_parallel()
    for rate_type, rate_data in all_rates.items():
        print(f'{rate_type}: {rate_data.raw_value}%')

asyncio.run(test())
"
```

**Expected Output**:
```
CDI: 10.90% on 20241210
Scaled answer: 1090000000
CDI: 10.90%
SELIC: 10.75%
IPCA: 4.50%
PTAX: 5.625
IGPM: 3.20%
TR: 0.15%
```

**Troubleshooting**:
- `Connection timeout`: BCB API may be slow, increase `BCB_API_TIMEOUT`
- `Rate not found`: BCB may not publish data on weekends/holidays
- `Invalid date`: BCB returns YYYYMMDD format, verify parsing

---

### ✅ Test 2: Oracle Updater - Blockchain Connection

**Purpose**: Verify Web3 connection and contract interaction

```bash
# Check connection
python oracle_updater.py status

# Check account balance
python oracle_updater.py balance

# Check what needs updating
python oracle_updater.py check
```

**Expected Output (status)**:
```
=== Oracle Status ===
Contract: 0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
Network: Arbitrum Sepolia (421614)

Current Rates:
  CDI:    10.90% (date: 20241210, updated: 2 hours ago)
  SELIC:  10.75% (date: 20241210, updated: 2 hours ago)
  IPCA:    4.50% (date: 20241115, updated: 25 days ago)
  PTAX:    5.625 (date: 20241210, updated: 2 hours ago)
  IGPM:    3.20% (date: 20241115, updated: 25 days ago)
  TR:      0.15% (date: 20241210, updated: 2 hours ago)
```

**Expected Output (balance)**:
```
Account: 0x1234...5678
Balance: 0.05 ETH
```

**Troubleshooting**:
- `Connection refused`: Check `RPC_URL` is correct
- `Invalid address`: Verify `ORACLE_ADDRESS` matches deployed contract
- `Insufficient funds`: Top up deployer account with Arbitrum Sepolia ETH

---

### ✅ Test 3: Data Store - SQLite Database

**Purpose**: Verify database initialization and CRUD operations

```bash
python -c "
from services.data_store import DataStore
import asyncio

async def test():
    store = DataStore('data/test_rates.db')
    await store.initialize()

    # Get stats
    stats = await store.get_stats()
    print(f'Database statistics: {stats}')

    # Check tables exist
    print('✓ Database initialized successfully')

asyncio.run(test())
"
```

**Expected Output**:
```
Database statistics: {
  'rates': 0,
  'oracle_updates': 0,
  'anomalies': 0,
  'scheduler_runs': 0
}
✓ Database initialized successfully
```

**Verify Tables**:
```bash
sqlite3 data/rates.db ".tables"
# Expected: anomalies  oracle_updates  rates  scheduler_runs
```

---

### ✅ Test 4: Anomaly Detector

**Purpose**: Verify statistical anomaly detection

```bash
python -c "
from services.anomaly_detector import AnomalyDetector

detector = AnomalyDetector()

# Test value spike (should detect)
result1 = detector.detect_value_anomaly(
    current_value=15.0,
    historical_values=[10.0, 10.2, 10.1, 10.3, 10.0]
)
print(f'Value spike: {result1.is_anomaly}, Z-score: {result1.z_score:.2f}')

# Test normal value (should not detect)
result2 = detector.detect_value_anomaly(
    current_value=10.2,
    historical_values=[10.0, 10.2, 10.1, 10.3, 10.0]
)
print(f'Normal value: {result2.is_anomaly}, Z-score: {result2.z_score:.2f}')
"
```

**Expected Output**:
```
Value spike: True, Z-score: 37.50
Normal value: False, Z-score: 0.50
```

---

### ✅ Test 5: API Server - REST Endpoints

**Terminal 1**: Start API server
```bash
python api.py
```

**Expected Output**:
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

**Terminal 2**: Test endpoints

```bash
# Health check
curl http://localhost:8000/health

# Expected: {"status":"healthy","bcb_api":true,"oracle_connection":true,...}

# Get all rates
curl http://localhost:8000/rates | jq

# Expected: [{"rate_type":"CDI","raw_value":10.9,...},...]

# Get specific rate
curl http://localhost:8000/rates/CDI | jq

# Expected: {"rate_type":"CDI","raw_value":10.9,...}

# Get rate history (requires data in database)
curl http://localhost:8000/rates/CDI/history?days=30 | jq

# Trigger manual sync (costs gas!)
curl -X POST http://localhost:8000/sync

# Get anomalies
curl http://localhost:8000/anomalies | jq

# Get database stats
curl http://localhost:8000/stats | jq
```

**Swagger UI**: Visit `http://localhost:8000/docs` for interactive API documentation

---

### ✅ Test 6: Scheduler - One-Time Update

**Purpose**: Run a full update cycle without starting the daemon

```bash
# Update all rates
python scheduler.py run-once

# Update specific rates only
python scheduler.py run-once --rates CDI,SELIC
```

**Expected Output**:
```
[INFO] Starting one-time rate update
[INFO] Fetching rates from BCB...
[INFO] Fetched CDI: 10.90%
[INFO] Fetched SELIC: 10.75%
[INFO] Fetched IPCA: 4.50%
[INFO] Fetched PTAX: 5.625
[INFO] Fetched IGPM: 3.20%
[INFO] Fetched TR: 0.15%
[INFO] Storing rates in database...
[INFO] Updating oracle on-chain...
[INFO] Transaction sent: 0xabc123...
[INFO] Waiting for confirmation...
[INFO] ✓ Transaction confirmed!
[INFO] Updated 6 rates, skipped 0
```

**Verify**:
```bash
# Check transaction on Arbiscan
# Visit: https://sepolia.arbiscan.io/tx/0xabc123...

# Check database was updated
sqlite3 data/rates.db "SELECT * FROM oracle_updates ORDER BY timestamp DESC LIMIT 5;"
```

---

### ✅ Test 7: Scheduler - View Jobs

**Purpose**: View scheduled jobs and their next run times

```bash
python scheduler.py status
```

**Expected Output**:
```
=== Scheduler Status ===

Scheduled Jobs:
  daily_rates      Next run: 2024-12-12 19:00:00 BRT (in 5h 30m)
  monthly_rates    Next run: 2025-01-10 10:00:00 BRT (in 29 days)
  stale_check      Next run: 2024-12-12 18:00:00 BRT (in 1h 30m)

Recent Runs (last 5):
  2024-12-12 13:45 | daily_rates   | completed | 6 updated, 0 skipped
  2024-12-12 10:00 | stale_check   | completed | no issues
  2024-12-11 19:00 | daily_rates   | completed | 4 updated, 2 skipped
```

---

### ✅ Test 8: Integration Test - End-to-End

**Purpose**: Test full flow from BCB → Database → Oracle

```bash
python -c "
import asyncio
from bcb_client import BCBClient
from oracle_updater import OracleUpdater
from services.data_store import DataStore
from config import settings

async def test_e2e():
    print('=== End-to-End Integration Test ===\n')

    # 1. Fetch from BCB
    print('1. Fetching from BCB...')
    bcb = BCBClient()
    rate = await bcb.fetch_rate('CDI')
    print(f'   ✓ CDI: {rate.raw_value}% on {rate.real_world_date}\n')

    # 2. Store in database
    print('2. Storing in database...')
    store = DataStore()
    await store.initialize()
    await store.store_rate(rate)
    latest = await store.get_latest_rate('CDI')
    print(f'   ✓ Stored: {latest[\"raw_value\"]}%\n')

    # 3. Read from oracle (no write to save gas)
    print('3. Reading from oracle...')
    updater = OracleUpdater(
        rpc_url=settings.rpc_url,
        contract_address=settings.oracle_address,
        private_key=settings.private_key
    )
    current = await updater.get_current_rate('CDI')
    print(f'   ✓ On-chain: {current[\"value_percent\"]}%\n')

    print('=== Integration Test Passed ✓ ===')

asyncio.run(test_e2e())
"
```

**Expected Output**:
```
=== End-to-End Integration Test ===

1. Fetching from BCB...
   ✓ CDI: 10.90% on 20241210

2. Storing in database...
   ✓ Stored: 10.9%

3. Reading from oracle...
   ✓ On-chain: 10.90%

=== Integration Test Passed ✓ ===
```

---

## Common Issues & Solutions

### Issue: "Connection refused" when testing oracle

**Solution**:
```bash
# Verify RPC URL is accessible
curl -X POST https://sepolia-rollup.arbitrum.io/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'

# Expected: {"jsonrpc":"2.0","id":1,"result":"0x66eee"}
# (0x66eee = 421614 = Arbitrum Sepolia chain ID)
```

### Issue: "Insufficient funds" when updating oracle

**Solution**:
```bash
# Check balance
python oracle_updater.py balance

# If < 0.01 ETH, get testnet ETH from:
# https://faucet.quicknode.com/arbitrum/sepolia
# https://www.alchemy.com/faucets/arbitrum-sepolia
```

### Issue: "Rate not found" from BCB

**Reason**: BCB doesn't publish data on weekends, holidays, or before 18:00 BRT

**Solution**: Try different rate types or wait for business day

### Issue: Database locked error

**Reason**: SQLite doesn't support multiple simultaneous writers

**Solution**: Stop all running processes accessing the database, then retry

### Issue: Import errors for services

**Solution**:
```bash
# Ensure you're in backend/ directory and venv is activated
pwd  # Should show .../backend
which python  # Should show .../backend/venv/bin/python

# If not, reactivate:
source venv/bin/activate
```

---

## Testing Checklist Summary

- [ ] BCB client fetches all 6 rates successfully
- [ ] Oracle updater connects to Arbitrum Sepolia
- [ ] Database tables created (rates, oracle_updates, anomalies, scheduler_runs)
- [ ] API /health endpoint returns healthy status
- [ ] API /rates endpoint returns all 6 rates
- [ ] Scheduler runs one update cycle successfully
- [ ] Anomaly detection catches value spikes
- [ ] Transaction appears on Arbiscan after sync
- [ ] Database contains rate history after updates
- [ ] Account balance sufficient for updates (> 0.01 ETH)

---

## Production Deployment Notes

When deploying to production:

1. **Use JSON logging**: Set `LOG_JSON_FORMAT=true`
2. **Set timezone**: Export `TZ=America/Sao_Paulo`
3. **Run API with workers**: `uvicorn api:app --host 0.0.0.0 --port 8000 --workers 4`
4. **Run scheduler as daemon**: Use systemd, supervisor, or Docker
5. **Monitor gas prices**: Set up alerts when balance < 0.1 ETH
6. **Configure alerting**: Set `SLACK_WEBHOOK_URL` or email notifications
7. **Use production RPC**: Consider Alchemy or Infura for reliability
8. **Enable rate limiting**: Protect API endpoints from abuse
9. **Backup database**: Regular backups of `data/rates.db`
10. **Monitor anomalies**: Check `/anomalies` endpoint daily

---

## Additional Resources

- **BCB API Documentation**: https://www3.bcb.gov.br/sgspub/
- **Arbitrum Sepolia Faucets**: Multiple faucets available (see Insufficient funds section)
- **Arbiscan Explorer**: https://sepolia.arbiscan.io/
- **Oracle Contract**: `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe`
- **FastAPI Docs**: Automatic at `http://localhost:8000/docs`

---

## Support

For issues or questions:
1. Check this guide first
2. Review error messages in logs
3. Verify environment configuration
4. Check network connectivity and RPC access
5. Ensure sufficient ETH balance for gas

**Happy Testing! 🚀**
