# DELOS Oracle Frontend

Modern Next.js 14 frontend for the Brazilian Macro Oracle Platform with tokenized debentures.

## Features

- 📊 **Oracle Dashboard** - Real-time Brazilian macroeconomic indicators (IPCA, CDI, SELIC, PTAX, IGPM, TR)
- 🏦 **Debenture Issuance** - Create new tokenized debentures with oracle-indexed rates
- 💼 **Portfolio Management** - View all debentures and your holdings
- 🔐 **Web3 Integration** - Connect wallet via RainbowKit (MetaMask, WalletConnect, etc.)
- ⚡ **Real-time Updates** - Auto-refresh rates every minute
- 🎨 **Modern UI** - Clean, responsive design with Tailwind CSS

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Web3**: wagmi + viem + RainbowKit
- **State**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts
- **HTTP**: Axios

## Prerequisites

- Node.js 18+ installed
- MetaMask or compatible wallet
- Arbitrum Sepolia testnet ETH
- Backend API running (see `backend/` directory)

## Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure Environment

The `.env.local` file should already be configured:

```bash
# Network Configuration
NEXT_PUBLIC_CHAIN_ID=421614
NEXT_PUBLIC_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Smart Contract Addresses
NEXT_PUBLIC_ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
NEXT_PUBLIC_FACTORY_ADDRESS=<deployed_factory_address>

# Backend API
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000

# Optional: WalletConnect Project ID (for production)
# NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

**IMPORTANT**: Update `NEXT_PUBLIC_FACTORY_ADDRESS` after deploying the DebentureFactory contract.

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Connect Wallet

1. Click "Connect Wallet" in the top right
2. Select your wallet (MetaMask recommended)
3. Approve the connection
4. Switch to Arbitrum Sepolia network if prompted

### 5. Get Testnet ETH

You'll need Arbitrum Sepolia ETH to interact with contracts:

- [Alchemy Faucet](https://www.alchemy.com/faucets/arbitrum-sepolia)
- [QuickNode Faucet](https://faucet.quicknode.com/arbitrum/sepolia)
- [Chainstack Faucet](https://faucet.chainstack.com/arbitrum-sepolia-faucet)

---

## Project Structure

```
frontend/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with nav and RainbowKit
│   ├── page.tsx                 # Home page (Oracle Dashboard)
│   ├── issue/
│   │   └── page.tsx            # Debenture issuance page
│   ├── portfolio/
│   │   └── page.tsx            # Portfolio page
│   ├── globals.css             # Global styles
│   └── providers.tsx           # Web3 and query providers
│
├── components/                  # React components
│   ├── oracle/
│   │   ├── RateDashboard.tsx   # Main dashboard component
│   │   └── RateCard.tsx        # Individual rate card
│   └── debenture/
│       ├── IssueForm.tsx       # Debenture creation form
│       └── PortfolioList.tsx   # Holdings list
│
├── lib/                         # Utility libraries
│   ├── wagmi.ts                # wagmi configuration
│   ├── contracts.ts            # Contract ABIs and addresses
│   └── api.ts                  # Backend API client
│
├── public/                      # Static assets
├── next.config.ts               # Next.js configuration
├── tsconfig.json                # TypeScript configuration
├── tailwind.config.ts           # Tailwind CSS configuration
└── package.json                 # Dependencies
```

---

## Pages

### 1. Oracle Dashboard (`/`)

Displays all 6 Brazilian macroeconomic rates:

- **IPCA** - Consumer Price Index (monthly inflation)
- **CDI** - Interbank Deposit Certificate rate
- **SELIC** - Central Bank base interest rate
- **PTAX** - BRL/USD exchange rate
- **IGPM** - General Market Price Index
- **TR** - Reference Rate

Features:
- Auto-refresh every 60 seconds
- Visual indicators for stale data
- Real-time timestamps
- Color-coded cards

### 2. Issue Debenture (`/issue`)

Create new tokenized debentures with:

- Debenture name and symbol
- ISIN code (12 characters)
- VNE (face value) and total supply
- Maturity period (1-30 years)
- Rate type (PRE, DI+, %DI, IPCA+, IGPM+)
- Spread/fixed rate

Transaction flow:
1. Fill form with debenture details
2. Click "Create Debenture"
3. Approve transaction in wallet
4. Wait for confirmation
5. View on Arbiscan

### 3. Portfolio (`/portfolio`)

View all issued debentures:

- List of all debentures from factory
- Your holdings highlighted in green
- Contract addresses and links
- Total supply information
- Direct Arbiscan links

---

## Development

### Build for Production

```bash
npm run build
npm run start
```

### Type Checking

```bash
npx tsc --noEmit
```

### Linting

```bash
npm run lint
```

---

## Common Issues

### Issue: "Cannot connect to backend API"

**Solution**:
```bash
# Verify backend is running
curl http://localhost:8000/health

# If not running, start it:
cd ../backend
source venv/bin/activate
python api.py
```

### Issue: "Wrong network" error

**Solution**:
1. Open MetaMask
2. Click network dropdown
3. Select "Arbitrum Sepolia"
4. If not available, add manually:
   - Network Name: Arbitrum Sepolia
   - RPC URL: https://sepolia-rollup.arbitrum.io/rpc
   - Chain ID: 421614
   - Currency: ETH
   - Block Explorer: https://sepolia.arbiscan.io

### Issue: "Factory address is zero address"

**Solution**:
```bash
# Deploy the factory first (see contracts/ directory)
cd ../contracts
npx hardhat run scripts/deploy-factory.ts --network arbitrumSepolia

# Copy the deployed address and update frontend/.env.local
# NEXT_PUBLIC_FACTORY_ADDRESS=0x...
```

### Issue: "Insufficient funds" when creating debenture

**Solution**:
- Get testnet ETH from faucets (see Quick Start section)
- Ensure you have at least 0.01 ETH for gas

### Issue: Build errors with wagmi/viem

**Solution**:
```bash
# Clear cache and reinstall
rm -rf .next node_modules
npm install
npm run dev
```

---

## Environment Variables

All environment variables must be prefixed with `NEXT_PUBLIC_` to be available in the browser:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NEXT_PUBLIC_CHAIN_ID` | Arbitrum Sepolia chain ID | Yes | 421614 |
| `NEXT_PUBLIC_RPC_URL` | RPC endpoint | Yes | https://sepolia-rollup.arbitrum.io/rpc |
| `NEXT_PUBLIC_ORACLE_ADDRESS` | Oracle contract address | Yes | 0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | Factory contract address | Yes | Must set after deployment |
| `NEXT_PUBLIC_BACKEND_API_URL` | Backend API URL | Yes | http://localhost:8000 |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID | No | 'demo' |

---

## Deployment

### Vercel (Recommended)

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Add frontend"
   git push origin main
   ```

2. **Deploy to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Import repository
   - Add environment variables
   - Deploy

3. **Configure Environment**:
   - Set all `NEXT_PUBLIC_*` variables
   - Update `NEXT_PUBLIC_BACKEND_API_URL` to production API
   - Deploy

### Manual Deployment

```bash
# Build
npm run build

# Test production build locally
npm run start

# Deploy build folder to hosting provider
```

---

## Testing Locally

### 1. Test Oracle Dashboard

1. Start backend API: `cd backend && python api.py`
2. Start frontend: `npm run dev`
3. Visit http://localhost:3000
4. Verify all 6 rates display
5. Check auto-refresh works (wait 1 minute)

### 2. Test Debenture Issuance

1. Connect wallet (top right)
2. Go to `/issue`
3. Fill form with test data
4. Click "Create Debenture"
5. Approve in MetaMask
6. Wait for confirmation
7. Check transaction on Arbiscan

### 3. Test Portfolio

1. Ensure wallet connected
2. Go to `/portfolio`
3. Verify all debentures listed
4. Check your holdings highlighted
5. Click Arbiscan links

---

## Production Checklist

- [ ] DebentureFactory deployed and address updated
- [ ] Backend API running and accessible
- [ ] Environment variables configured
- [ ] WalletConnect Project ID set (optional)
- [ ] Build succeeds without errors
- [ ] All pages load correctly
- [ ] Wallet connection works
- [ ] Oracle dashboard displays rates
- [ ] Debenture issuance creates transactions
- [ ] Portfolio shows holdings
- [ ] Links to Arbiscan work

---

## API Integration

The frontend consumes the backend REST API:

```typescript
// Get all rates
const { data } = await ratesAPI.getAll()
// Returns: RateData[]

// Get specific rate
const { data } = await ratesAPI.getRate('CDI')
// Returns: RateData

// Get rate history
const { data } = await ratesAPI.getHistory('IPCA', 30)
// Returns: { rate_type: string, data: RateHistoryItem[] }

// Trigger manual sync
const { data } = await ratesAPI.sync()
// Returns: SyncResponse
```

See `lib/api.ts` for complete API client.

---

## Smart Contract Integration

Contracts are integrated via wagmi hooks:

```typescript
// Read contract data
const { data } = useReadContract({
  address: CONTRACTS.oracle.address,
  abi: CONTRACTS.oracle.abi,
  functionName: 'getRate',
  args: ['CDI'],
})

// Write to contract
const { writeContract } = useWriteContract()
writeContract({
  address: CONTRACTS.factory.address,
  abi: CONTRACTS.factory.abi,
  functionName: 'createDebenture',
  args: [...],
})
```

See `lib/contracts.ts` for contract configuration.

---

## Support

For issues or questions:

1. Check this README
2. Review error messages in browser console
3. Verify backend API is running
4. Check wallet connection and network
5. Ensure sufficient testnet ETH

---

## License

MIT

---

**Happy Building! 🚀**
