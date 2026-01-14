# DELOS Oracle Production Deployment Guide

Complete guide for deploying DELOS Oracle to production with Railway (backend) and Vercel (frontend).

**Deployment Time**: 30-45 minutes
**Cost**: ~$5/month after free trial
**Prerequisites**: Railway account, Vercel account, ETH on Arbitrum Sepolia

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Backend Deployment (Railway)](#backend-deployment-railway)
4. [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
5. [Configuration](#configuration)
6. [Verification](#verification)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)

---

## Overview

### Architecture

```
User → Vercel (Frontend) → Railway (Backend + APScheduler) → [BCB API + Arbitrum]
                                      ↓
                               SQLite (persistent volume)
```

### What Gets Deployed

**Backend (Railway)**:
- Python FastAPI REST API
- APScheduler for automated cron jobs
- SQLite database with persistent volume
- Always-on process (no cold starts)

**Frontend (Vercel)**:
- Next.js 14 static site
- RainbowKit wallet integration
- API calls to Railway backend
- Global CDN distribution

### Cron Job Schedule

The backend runs automated rate updates:

| Job | Schedule | Purpose |
|-----|----------|---------|
| Daily Rates | 19:00 BRT (22:00 UTC), Mon-Fri | Update CDI, SELIC, PTAX, TR |
| Monthly Rates | 10th of month, 10:00 BRT | Update IPCA, IGPM |
| Stale Check | Every 4 hours | Alert on stale rates |

---

## Prerequisites

### Accounts Needed

1. **Railway Account** (free tier available)
   - Sign up: https://railway.app/
   - Free tier: $5 credit (~20 days of continuous operation)

2. **Vercel Account** (free tier available)
   - Sign up: https://vercel.com/
   - Free tier: Unlimited for hobby projects

3. **Testnet ETH**
   - Your deployer account needs ETH on Arbitrum Sepolia
   - Faucet: https://faucet.quicknode.com/arbitrum/sepolia

### Required Information

Before starting, have these ready:
- Private key for oracle updater account (with ETH on Arbitrum Sepolia)
- Oracle contract address: `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe`
- Factory contract address: `0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f`

---

## Backend Deployment (Railway)

### Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### Step 2: Prepare Configuration Files

The following files are already created in the repository:

**`backend/Procfile`**: Tells Railway how to start the app
```
web: uvicorn api:app --host 0.0.0.0 --port $PORT
```

**`backend/railway.json`**: Health checks and restart policies
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "uvicorn api:app --host 0.0.0.0 --port $PORT",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**`backend/.railwayignore`**: Excludes unnecessary files
```
__pycache__/
*.pyc
.env
.env.local
tests/
docs/
```

### Step 3: Initialize Railway Project

```bash
cd backend
railway init
railway link  # Link to new project
```

Follow the prompts to create a new project.

### Step 4: Create Persistent Volume

Railway needs a persistent volume for the SQLite database:

**Via CLI:**
```bash
railway volume create --name delos-data --mount-path /data
```

**Via Dashboard:**
1. Go to Railway dashboard
2. Select your project
3. Go to "Volumes" tab
4. Create volume:
   - Name: `delos-data`
   - Mount path: `/data`

### Step 5: Set Environment Variables

**Via CLI:**
```bash
railway variables set ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
railway variables set PRIVATE_KEY=<your-private-key>
railway variables set RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
railway variables set DATABASE_PATH=/data/rates.db
railway variables set CORS_ORIGINS=*
railway variables set LOG_LEVEL=INFO
railway variables set LOG_JSON_FORMAT=true
```

**Via Dashboard:**
1. Go to Railway dashboard
2. Select your project
3. Go to "Variables" tab
4. Add each variable

**Complete Environment Variables List:**

```bash
# Required
ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
PRIVATE_KEY=<deployer-private-key>
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Database
DATABASE_PATH=/data/rates.db

# API
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=*  # Update after Vercel deployment

# Scheduler
DAILY_UPDATE_HOUR=19
DAILY_UPDATE_MINUTE=0
MONTHLY_UPDATE_DAY=10

# Logging
LOG_LEVEL=INFO
LOG_JSON_FORMAT=true
```

### Step 6: Deploy to Railway

```bash
railway up
```

This will:
1. Build the Python application
2. Install dependencies from `requirements.txt`
3. Start the FastAPI server
4. Initialize the scheduler

### Step 7: Get Railway URL

```bash
railway status
```

Note the public URL, format: `https://[project-name].up.railway.app`

### Step 8: Verify Backend Deployment

Test the deployed backend:

```bash
# Health check
curl https://[project-name].up.railway.app/health

# Expected response:
# {
#   "status": "healthy",
#   "scheduler_running": true,
#   "bcb_api": true,
#   "oracle_connection": true
# }

# Check scheduler jobs
curl https://[project-name].up.railway.app/scheduler/jobs

# Expected: 3 jobs (daily_rates, monthly_rates, stale_check)

# Query rates
curl https://[project-name].up.railway.app/rates

# Expected: Array of 6 rates
```

---

## Frontend Deployment (Vercel)

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
vercel login
```

### Step 2: Update Production Environment

The file `frontend/.env.production` is already created. Update the Railway URL:

```env
NEXT_PUBLIC_CHAIN_ID=421614
NEXT_PUBLIC_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
NEXT_PUBLIC_ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
NEXT_PUBLIC_FACTORY_ADDRESS=0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f
NEXT_PUBLIC_BACKEND_API_URL=https://[project-name].up.railway.app
```

Replace `[project-name]` with your actual Railway project name.

### Step 3: Deploy to Vercel

```bash
cd frontend

# First deployment (interactive)
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Your username
# - Link to existing project? No
# - Project name? delos-oracle
# - In which directory is your code located? ./
# - Override settings? No
```

### Step 4: Set Environment Variables in Vercel

**Via Dashboard:**
1. Go to https://vercel.com/
2. Select your project
3. Go to Settings → Environment Variables
4. Add all variables from `.env.production`
5. Set environment: Production, Preview, Development

**Via CLI:**
```bash
vercel env add NEXT_PUBLIC_BACKEND_API_URL production
# Enter: https://[project-name].up.railway.app

vercel env add NEXT_PUBLIC_ORACLE_ADDRESS production
# Enter: 0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe

# Repeat for all NEXT_PUBLIC_* variables
```

### Step 5: Production Deployment

```bash
vercel --prod
```

### Step 6: Get Vercel Domain

```bash
vercel inspect
```

Note the domain, format: `https://delos-oracle.vercel.app` (or similar)

---

## Configuration

### Update CORS Settings

Now that you have the Vercel domain, update the Railway backend CORS:

```bash
railway variables set CORS_ORIGINS=https://delos-oracle.vercel.app,https://*.vercel.app
```

Or via Railway Dashboard → Variables → Update `CORS_ORIGINS`

### Verify CORS

1. Open frontend in browser: `https://delos-oracle.vercel.app`
2. Open browser DevTools → Network tab
3. Test API calls (navigate to oracle dashboard)
4. Verify no CORS errors appear

---

## Verification

### Backend Health Check

```bash
curl https://[project-name].up.railway.app/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "scheduler_running": true,
  "bcb_api": true,
  "oracle_connection": true,
  "version": "1.0.0"
}
```

### Scheduler Status

```bash
curl https://[project-name].up.railway.app/scheduler/jobs
```

**Expected Response:**
```json
[
  {
    "id": "daily_rates",
    "name": "Daily Rate Update (CDI, SELIC, PTAX, TR)",
    "next_run": "2026-01-15T22:00:00-03:00",
    "pending": false
  },
  {
    "id": "monthly_rates",
    "name": "Monthly Rate Update (IPCA, IGPM)",
    "next_run": "2026-02-10T10:00:00-03:00",
    "pending": false
  },
  {
    "id": "stale_check",
    "name": "Stale Data Check",
    "next_run": "2026-01-14T20:00:00-03:00",
    "pending": false
  }
]
```

### Frontend Verification

1. Visit `https://delos-oracle.vercel.app`
2. Check console for errors (F12 → Console)
3. Test wallet connection (Connect Wallet button)
4. Navigate to Oracle dashboard
5. Verify 6 rates are displayed
6. Check Network tab shows successful API calls to Railway

### Deployment Checklist

- [ ] Backend health check returns `healthy`
- [ ] Scheduler shows 3 jobs configured
- [ ] Frontend loads without errors
- [ ] Wallet connection works
- [ ] Oracle dashboard displays rates
- [ ] No CORS errors in console
- [ ] Backend API calls succeed
- [ ] Links to Arbiscan work

---

## Monitoring

### Health Check Monitoring (Recommended)

Set up external monitoring with **UptimeRobot** (free):

1. Create account: https://uptimerobot.com/
2. Add HTTP monitor:
   - Name: "DELOS Backend Health"
   - URL: `https://[project-name].up.railway.app/health`
   - Type: Keyword
   - Keyword: `healthy`
   - Interval: 5 minutes
3. Configure email/SMS alerts

### Railway Dashboard

Monitor at: https://railway.app/project/{project-id}

**Metrics to watch:**
- CPU usage (expect <5% idle, spikes during cron)
- Memory usage (expect ~100-200MB)
- Service uptime (should be 100%)
- Deployment logs (real-time)

### Vercel Dashboard

Monitor at: https://vercel.com/{username}/delos-oracle

**Metrics to watch:**
- Build status
- Deployment history
- Analytics (page views, performance)

### View Logs

**Railway:**
```bash
railway logs --tail 100

# Filter for scheduler
railway logs --tail 100 | grep -i "scheduler"

# Filter for errors
railway logs --tail 100 | grep -i "error"
```

**Vercel:**
```bash
vercel logs

# Follow logs in real-time
vercel logs --follow
```

### Check Scheduler Runs

After 24 hours, verify cron jobs are executing:

```bash
# Check recent scheduler runs
curl https://[project-name].up.railway.app/scheduler/runs?limit=5

# Should show recent executions with status="completed"
```

---

## Troubleshooting

### Scheduler Not Running

**Symptoms:** Health check shows `scheduler_running: false`

**Solution:**
```bash
# Check logs
railway logs | grep -i "scheduler"

# Expected: "Scheduler started" and "Scheduler jobs configured"

# If missing, verify:
# 1. DATABASE_PATH=/data/rates.db
# 2. /data volume is mounted
# 3. Service hasn't crashed
```

### Database Not Persisting

**Symptoms:** Data lost after Railway restart

**Solution:**
```bash
# Verify volume is mounted
railway run ls -la /data

# Expected: Directory exists and is writable

# Check Railway dashboard → Volumes tab
# Ensure volume is linked to service
```

### CORS Errors

**Symptoms:** Frontend shows "CORS policy" errors in console

**Solution:**
```bash
# Verify CORS setting
railway variables | grep CORS_ORIGINS

# Should include Vercel domain
# Update if needed:
railway variables set CORS_ORIGINS=https://delos-oracle.vercel.app,https://*.vercel.app
```

### Transaction Failures

**Symptoms:** Manual sync fails, or cron jobs fail to update oracle

**Solution:**
```bash
# 1. Check account has ETH on Arbitrum Sepolia
# Faucet: https://faucet.quicknode.com/arbitrum/sepolia

# 2. Check logs for specific errors
railway logs | grep -i "error"

# 3. Verify private key is correct
railway variables | grep PRIVATE_KEY

# 4. Check RPC is responding
curl https://sepolia-rollup.arbitrum.io/rpc
```

### Railway Service Crashes

**Symptoms:** Service shows as "stopped" in dashboard

**Solution:**
```bash
# View crash logs
railway logs --tail 200

# Common causes:
# 1. Missing environment variables
# 2. Database path incorrect
# 3. Port binding issue (should use $PORT)
# 4. Out of memory

# Restart service
railway up --detach
```

### Vercel Build Fails

**Symptoms:** Deployment fails with build errors

**Solution:**
```bash
# Check build logs in Vercel dashboard

# Common causes:
# 1. Missing environment variables
# 2. TypeScript errors
# 3. Dependency issues

# Test build locally first:
cd frontend
npm run build

# If successful, redeploy:
vercel --prod
```

---

## Cost Breakdown

### Railway

**Free Tier:**
- $5 credit included
- ~500 execution hours
- Covers ~20 days of continuous operation

**After Free Tier:**
- Hobby plan: $5/month
- Storage: ~$0.17/month (1GB)
- **Total: ~$5.17/month**

### Vercel

**Free Tier:**
- Unlimited static deployments
- 100GB bandwidth/month
- This project typically uses 1-5GB/month
- **Cost: $0**

### Total Cost

**First month**: $0-5 (if Railway free credit covers full month: $0)
**Ongoing**: ~$5.17/month

---

## Next Steps

### Post-Deployment

1. **Set up monitoring**
   - Configure UptimeRobot health checks
   - Set up email alerts

2. **Wait 24-48 hours**
   - Verify cron jobs execute successfully
   - Check scheduler runs log
   - Monitor for any errors

3. **Document URLs**
   - Add deployment URLs to README
   - Update documentation with production links

4. **Optional enhancements**
   - Set up database backup automation
   - Configure Slack webhook for job alerts
   - Add custom domain for backend

### Database Backups

**Manual backup:**
```bash
railway run sqlite3 /data/rates.db .dump > backup.sql

# Store in GitHub or cloud storage
```

**Automated backups:**
- Railway provides automatic volume snapshots (weekly)
- Access via Railway dashboard → Volumes → Snapshots

---

## Summary

You've successfully deployed the DELOS Oracle system to production:

✅ Backend running on Railway with automated cron jobs
✅ Frontend hosted on Vercel with global CDN
✅ Persistent database for historical rate data
✅ Health monitoring and alerting configured
✅ Cost-effective deployment (~$5/month)

**Production URLs:**
- Frontend: `https://delos-oracle.vercel.app`
- Backend: `https://[project-name].up.railway.app`
- API Docs: `https://[project-name].up.railway.app/docs`

**Cron Schedule:**
- Daily rates: 19:00 BRT (Mon-Fri)
- Monthly rates: 10th of month
- Stale checks: Every 4 hours

For questions or issues, see: https://github.com/PedroDnT/delos-oracle/issues
