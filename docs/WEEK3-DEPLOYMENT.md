# Complete Deployment Guide

## Overview

This guide covers deploying the entire Brazilian Tokenized Securities Platform from scratch to production.

**Components to Deploy**:
1. Smart Contracts (Oracle, Factory, Mock tokens)
2. Backend Service (Oracle updater)
3. Frontend Application

**Target Networks**:
- **Testnet**: Polygon Mumbai (development & testing)
- **Mainnet**: Polygon PoS (production)

---

## Prerequisites

### Required Accounts & Keys

1. **Blockchain Wallet**
   - MetaMask or similar
   - Funded with MATIC (Mumbai: use faucet, Mainnet: buy)
   - Export private key for deployment

2. **API Keys**
   ```
   PolygonScan API Key: https://polygonscan.com/apis
   WalletConnect Project ID: https://cloud.walletconnect.com/
   ```

3. **Deployment Platforms**
   - Railway.app account (backend)
   - Vercel account (frontend)
   - GitHub account (code hosting)

### Get Testnet MATIC

```bash
# Mumbai Faucet
https://faucet.polygon.technology/

# Alternative faucets
https://mumbaifaucet.com/
https://faucet.quicknode.com/polygon/mumbai
```

---

## Part 1: Smart Contract Deployment

### Step 1: Environment Setup

```bash
cd contracts
cp .env.example .env
```

**Edit `.env`**:
```bash
# Network RPC URLs
MUMBAI_RPC_URL=https://rpc-mumbai.maticvigil.com
POLYGON_RPC_URL=https://polygon-rpc.com

# Deployer private key (starts with 0x)
PRIVATE_KEY=0x...

# PolygonScan API key for verification
POLYGONSCAN_API_KEY=...
```

### Step 2: Compile Contracts

```bash
npm install
npx hardhat compile
```

**Expected Output**:
```
Compiling 15 files with 0.8.20
Compilation finished successfully
```

### Step 3: Run Tests

```bash
npx hardhat test
npx hardhat coverage
```

**Expected Coverage**: >90% for all contracts

### Step 4: Deploy Oracle

```bash
npx hardhat run scripts/deploy-oracle.ts --network mumbai
```

**Expected Output**:
```
Deploying BrazilianMacroOracle...
✅ Oracle deployed to: 0x1234...5678
Waiting for block confirmations...
✅ Confirmed!

Next steps:
1. Verify: npx hardhat verify --network mumbai 0x1234...5678
2. Save address for backend: ORACLE_ADDRESS=0x1234...5678
```

**Save this address!**

### Step 5: Verify Oracle

```bash
npx hardhat verify --network mumbai 0x1234...5678
```

**Expected Output**:
```
Successfully verified contract BrazilianMacroOracle
https://mumbai.polygonscan.com/address/0x1234...5678#code
```

### Step 6: Deploy Mock Payment Token (Testnet Only)

```bash
npx hardhat run scripts/deploy-mock-token.ts --network mumbai
```

**Script**: `scripts/deploy-mock-token.ts`
```typescript
const MockERC20 = await ethers.getContractFactory("MockERC20");
const token = await MockERC20.deploy("Mock Brazilian Real", "BRL");
await token.waitForDeployment();
console.log("Mock BRL:", await token.getAddress());
```

**Save this address!**

### Step 7: Deploy Factory

```bash
npx hardhat run scripts/deploy-factory.ts --network mumbai
```

**Script will prompt for**:
- Oracle address (from Step 4)
- Payment token address (from Step 6)

**Expected Output**:
```
Deploying DebentureFactory...
Oracle: 0x1234...5678
Payment Token: 0xabcd...ef01
✅ Factory deployed to: 0x9876...5432
```

**Save this address!**

### Step 8: Verify Factory

```bash
npx hardhat verify --network mumbai 0x9876...5432 \
  "0x1234...5678" \
  "0xabcd...ef01"
```

### Step 9: Grant Roles

**Create script**: `scripts/setup-roles.ts`

```typescript
async function main() {
  const oracleAddress = "0x1234...5678";
  const backendAddress = "0x..."; // Backend service address
  
  const oracle = await ethers.getContractAt(
    "BrazilianMacroOracle",
    oracleAddress
  );
  
  // Grant UPDATER_ROLE to backend service
  const UPDATER_ROLE = await oracle.UPDATER_ROLE();
  await oracle.grantRole(UPDATER_ROLE, backendAddress);
  
  console.log("✅ UPDATER_ROLE granted to:", backendAddress);
}
```

**Run**:
```bash
npx hardhat run scripts/setup-roles.ts --network mumbai
```

### Step 10: Initial Data Population

**Script**: `scripts/populate-initial-data.ts`

```typescript
async function main() {
  const oracle = await ethers.getContractAt(
    "BrazilianMacroOracle",
    "0x1234...5678"
  );
  
  // Populate with current data
  await oracle.updateRates(
    ["IPCA", "CDI", "SELIC", "PTAX"],
    [450, 1090, 1075, 5625],  // Example values
    [20241115, 20241126, 20241115, 20241126],
    ["BCB-433", "BCB-12", "BCB-432", "BCB-1"]
  );
  
  console.log("✅ Initial data populated");
}
```

---

## Part 2: Backend Service Deployment

### Step 1: Setup Repository

```bash
cd backend

# Initialize git if not already
git init
git add .
git commit -m "Initial backend commit"

# Push to GitHub
gh repo create brazilian-oracle-backend --private
git push -u origin main
```

### Step 2: Create Oracle ABI File

**Extract ABI from Hardhat**:
```bash
cd ../contracts
cat artifacts/contracts/BrazilianMacroOracle.sol/BrazilianMacroOracle.json \
  | jq .abi > ../backend/oracle_abi.json
```

**Or manually copy**:
```bash
# From Hardhat artifacts to backend/oracle_abi.json
```

### Step 3: Configure Railway

1. **Go to** https://railway.app
2. **New Project** → Deploy from GitHub
3. **Select** `brazilian-oracle-backend`
4. **Add Environment Variables**:

```bash
# Blockchain
RPC_URL=https://rpc-mumbai.maticvigil.com
ORACLE_ADDRESS=0x1234...5678
PRIVATE_KEY=0x...  # Service account key

# Optional
PORT=8000
LOG_LEVEL=INFO
```

5. **Create Services**:
   - **Web**: `uvicorn api:app --host 0.0.0.0 --port $PORT`
   - **Worker**: `python scheduler.py`

### Step 4: Deploy

```bash
# Railway will auto-deploy on push
git push origin main

# Or use CLI
railway up
```

### Step 5: Verify Deployment

```bash
# Check API health
curl https://your-app.railway.app/health

# Check rates endpoint
curl https://your-app.railway.app/rates

# Trigger manual sync
curl -X POST https://your-app.railway.app/sync
```

### Step 6: Monitor Logs

```bash
railway logs --service web
railway logs --service worker
```

**Check for**:
- Successful BCB API calls
- Blockchain transactions sent
- No error messages

---

## Part 3: Frontend Deployment

### Step 1: Configure Environment

```bash
cd frontend
cp .env.local.example .env.local
```

**Edit `.env.local`**:
```bash
# Contract Addresses
NEXT_PUBLIC_ORACLE_ADDRESS=0x1234...5678
NEXT_PUBLIC_FACTORY_ADDRESS=0x9876...5432

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_ID=...

# Network
NEXT_PUBLIC_CHAIN_ID=80001  # Mumbai
```

### Step 2: Test Locally

```bash
npm install
npm run dev
```

**Open**: http://localhost:3000

**Verify**:
- [ ] Oracle dashboard loads
- [ ] Rates display correctly
- [ ] Wallet connects
- [ ] Can navigate to issue page

### Step 3: Build for Production

```bash
npm run build
npm run start
```

**Check for**:
- No TypeScript errors
- No build warnings
- All pages load correctly

### Step 4: Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Configure environment variables in Vercel dashboard

# Deploy to production
vercel --prod
```

**OR** via Vercel Dashboard:
1. Go to https://vercel.com/new
2. Import from GitHub
3. Select `brazilian-oracle-frontend`
4. Add environment variables
5. Deploy

### Step 5: Verify Deployment

**Visit**: https://your-app.vercel.app

**Test Flow**:
1. Connect wallet (Mumbai network)
2. View oracle rates
3. Navigate to issue page
4. Fill form (don't submit yet)
5. Check portfolio page

---

## Part 4: End-to-End Testing

### Test 1: Oracle Data Flow

```bash
# 1. Trigger backend update
curl -X POST https://your-api.railway.app/sync

# 2. Check transaction on PolygonScan
# Visit: https://mumbai.polygonscan.com/address/0x...

# 3. Verify in frontend
# Open: https://your-app.vercel.app
# Rates should update
```

### Test 2: Issue Debenture

```bash
# 1. Connect wallet with Mumbai MATIC
# 2. Go to /issue
# 3. Fill form:
#    - Name: "Test Debenture IPCA+ 2026"
#    - Symbol: "TEST26"
#    - Face Value: 1000000
#    - Maturity: 2 years
#    - Spread: 5%
# 4. Submit transaction
# 5. Wait for confirmation
# 6. Verify on PolygonScan
# 7. Check debenture appears in list
```

### Test 3: Transfer with Restrictions

```bash
# 1. Find debenture on detail page
# 2. Try to transfer to address A (not whitelisted)
# 3. Transaction should revert
# 4. Call addToWhitelist(A)
# 5. Retry transfer
# 6. Should succeed
```

---

## Part 5: Mainnet Deployment

### Prerequisites

- [ ] All tests passing on Mumbai
- [ ] End-to-end flows verified
- [ ] Security audit completed (for production)
- [ ] Gas cost analysis done
- [ ] Documentation complete

### Step 1: Prepare Mainnet Wallet

```bash
# 1. Create new wallet for production
# 2. Fund with MATIC for deployments
#    ~5 MATIC should be sufficient
# 3. NEVER expose private key
# 4. Use hardware wallet if possible
```

### Step 2: Update Configuration

```bash
# contracts/.env
POLYGON_RPC_URL=https://polygon-rpc.com
PRIVATE_KEY=0x...  # Production key

# backend/.env (Railway)
RPC_URL=https://polygon-rpc.com
ORACLE_ADDRESS=<will update after deploy>

# frontend/.env.local
NEXT_PUBLIC_CHAIN_ID=137
```

### Step 3: Deploy Contracts

```bash
# Oracle
npx hardhat run scripts/deploy-oracle.ts --network polygon

# Factory
npx hardhat run scripts/deploy-factory.ts --network polygon

# Verify both on PolygonScan
```

### Step 4: Update Services

```bash
# Update Railway environment variables
railway variables set ORACLE_ADDRESS=0x...

# Update Vercel environment variables
vercel env add NEXT_PUBLIC_ORACLE_ADDRESS

# Redeploy both services
git push origin main
vercel --prod
```

### Step 5: Final Verification

```bash
# 1. Check all services running
# 2. Verify contract interactions
# 3. Test with small amounts first
# 4. Monitor for 24 hours
# 5. Document any issues
```

---

## Monitoring & Maintenance

### Daily Checks

```bash
# Backend health
curl https://api.railway.app/health

# Oracle data freshness
curl https://api.railway.app/rates/IPCA

# Check logs
railway logs --tail 100
```

### Weekly Maintenance

1. **Review Gas Usage**
   - Check backend wallet balance
   - Analyze transaction costs
   - Optimize if needed

2. **Data Accuracy**
   - Compare on-chain vs BCB
   - Verify all rates updating
   - Check for missed updates

3. **Security**
   - Review access logs
   - Check for unauthorized transactions
   - Rotate keys if needed

### Alerts Setup

**Create monitoring script**: `monitoring/alerts.py`

```python
import requests
import os

def check_oracle_health():
    response = requests.get(f"{API_URL}/health")
    if response.status_code != 200:
        send_alert("Oracle API down!")
    
    data = response.json()
    if data['updater_balance'] < 0.5:
        send_alert("Low MATIC balance!")

def check_data_freshness():
    response = requests.get(f"{API_URL}/rates/CDI")
    data = response.json()
    
    # Check if data is stale (>2 days old)
    if time.time() - data['timestamp'] > 172800:
        send_alert("Stale data detected!")

# Run every hour
schedule.every().hour.do(check_oracle_health)
schedule.every().hour.do(check_data_freshness)
```

---

## Troubleshooting

### Issue: Deployment Failing

```bash
# Check Node version
node --version  # Should be 18+

# Clear cache
rm -rf node_modules
npm install

# Check environment variables
env | grep NEXT_PUBLIC
```

### Issue: Backend Can't Update Oracle

```bash
# Verify UPDATER_ROLE granted
npx hardhat console --network mumbai
> const oracle = await ethers.getContractAt("BrazilianMacroOracle", "0x...")
> const UPDATER_ROLE = await oracle.UPDATER_ROLE()
> await oracle.hasRole(UPDATER_ROLE, "0x...")  # Backend address

# Check balance
> const balance = await ethers.provider.getBalance("0x...")
> ethers.formatEther(balance)
```

### Issue: Frontend Not Connecting

```typescript
// Check wagmi configuration
// Verify RainbowKit setup
// Clear browser cache
// Check network in MetaMask

// Debug with:
console.log("Config:", config);
console.log("Chain:", config.chains);
```

---

## Security Checklist

- [ ] Private keys never committed to git
- [ ] Environment variables secured
- [ ] Contract ownership verified
- [ ] Role assignments correct
- [ ] Backend wallet has limited permissions
- [ ] Rate limiting enabled on API
- [ ] HTTPS enabled on all services
- [ ] Regular security audits scheduled

---

## Cost Estimates

### Deployment Costs (Mumbai - Free)
- Oracle: ~0 MATIC (testnet)
- Factory: ~0 MATIC (testnet)
- Initial data: ~0 MATIC (testnet)

### Deployment Costs (Polygon Mainnet)
- Oracle: ~0.5 MATIC
- Factory: ~0.3 MATIC
- Initial data: ~0.2 MATIC
- **Total**: ~1 MATIC ($0.50 USD)

### Monthly Operating Costs
- **Backend (Railway)**: $5-10/month
- **Frontend (Vercel)**: Free (hobby) or $20/month (pro)
- **Oracle Updates**: ~$10-20/month in gas (daily updates)
- **Total**: ~$20-50/month

---

## Rollback Procedure

### If Deployment Fails

```bash
# 1. Don't panic
# 2. Check error messages
# 3. Verify all prerequisites met
# 4. Contact support if needed

# Rollback backend
railway rollback <deployment-id>

# Rollback frontend
vercel rollback <deployment-url>

# Contracts can't rollback
# Deploy new version if needed
```

---

**Next**: See `API.md` for complete API reference