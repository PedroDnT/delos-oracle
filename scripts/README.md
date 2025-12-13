# DELOS Platform Demonstration Scripts

This directory contains demonstration scripts showing the complete DELOS platform in action.

## Interactive Web Visualization

A beautiful, animated web interface showing the complete flow from BCB API to coupon payments.

**Open in browser:**
```bash
open delos-demo.html
```

**Features:**
- ✨ Animated step-by-step flow
- 📊 Real contract addresses and data
- 🎨 Beautiful dark theme UI
- ⏯️  Play/pause/reset controls
- 📱 Responsive design

## Terminal Demo Script

An interactive terminal demonstration with rich formatting and animations.

### Installation

```bash
# Install demo dependencies
pip install -r requirements-demo.txt
```

### Prerequisites

1. **Set Private Key** (required for on-chain operations):
   ```bash
   export PRIVATE_KEY="your_private_key_here"
   ```

2. **Ensure you have testnet ETH** on Arbitrum Sepolia:
   - Get ETH from [Arbitrum Sepolia Faucet](https://faucet.arbitrum.io/)
   - Check balance: [Arbiscan Sepolia](https://sepolia.arbiscan.io/)

### Run the Demo

```bash
# Make script executable
chmod +x demo-flow.py

# Run interactive demo
python demo-flow.py
```

## What The Demo Does

### Step 1: Fetch BCB Rates
- Retrieves 6 macroeconomic indicators from Banco Central do Brasil
- Shows: IPCA, CDI, SELIC, PTAX, IGPM, TR

### Step 2: Update Oracle
- Queries current on-chain oracle state
- Displays rates stored in BrazilianMacroOracle contract
- Shows Arbitrum Sepolia deployment details

### Step 3: Create Debenture
- Deploys a minimal proxy clone via DebentureCloneFactory
- Uses EIP-1167 pattern (only ~45 bytes!)
- Creates: "Petrobras IPCA+ 2026" debenture
  - VNE: R$ 1,000 per unit
  - Supply: 10,000 units
  - Total: R$ 10,000,000
  - Rate: IPCA + 5.00%
  - Maturity: 2 years

### Step 4: Record Coupon
- Records semi-annual coupon payment
- Calculates payment based on VNE and rate
- Makes claimable via claimAllCoupons()

### Step 5: Summary
- Displays complete platform status
- Shows all deployed contract addresses
- Provides next steps and links

## Example Output

```
    ██████╗ ███████╗██╗      ██████╗ ███████╗
    ██╔══██╗██╔════╝██║     ██╔═══██╗██╔════╝
    ██║  ██║█████╗  ██║     ██║   ██║███████╗
    ██║  ██║██╔══╝  ██║     ██║   ██║╚════██║
    ██████╔╝███████╗███████╗╚██████╔╝███████║
    ╚═════╝ ╚══════╝╚══════╝ ╚═════╝ ╚══════╝

    Brazilian Macro Oracle Platform
    Live Demonstration - Arbitrum Sepolia

STEP 1: Fetching rates from Banco Central do Brasil
╭──────────── BCB Rates Retrieved ────────────╮
│  Rate  │   Value   │      Description        │
├────────┼───────────┼─────────────────────────┤
│  IPCA  │   4.50%   │ Consumer Price Index    │
│  CDI   │  11.15%   │ Interbank Deposit Rate  │
│  SELIC │  11.25%   │ Central Bank Target     │
│  PTAX  │   5.95    │ USD/BRL Exchange Rate   │
│  IGPM  │   0.47%   │ General Market Price    │
│  TR    │   0.09%   │ Reference Rate          │
╰─────────────────────────────────────────────╯

STEP 2: Updating Oracle on Arbitrum Sepolia
...

✓ Demo Complete! 🎉
```

## Deployed Contracts

| Contract | Address |
|----------|---------|
| Oracle | `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe` |
| Factory | `0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f` |
| Implementation | `0x8856dd1f536169B8A82D8DA5476F9765b768f51D` |

All contracts verified on [Arbiscan](https://sepolia.arbiscan.io).

## Troubleshooting

### "Cannot connect to RPC"
- Check internet connection
- Verify RPC URL is accessible: https://sepolia-rollup.arbitrum.io/rpc

### "PRIVATE_KEY not set"
- Export your private key: `export PRIVATE_KEY="0x..."`
- Or add to contracts/.env file

### "Insufficient funds"
- Get testnet ETH from Arbitrum Sepolia faucet
- Minimum recommended: 0.01 ETH

### "ISIN already exists"
- Each demo run tries to create the same ISIN
- The script will detect and use existing debenture
- Or change ISIN in the script

## Next Steps

After running the demo:

1. **View on Arbiscan**:
   - Check transaction history
   - Verify contract interactions
   - Read emitted events

2. **Interact via Frontend**:
   ```bash
   cd ../frontend
   npm run dev
   # Visit http://localhost:3000
   ```

3. **Claim Coupons**:
   ```javascript
   // In Hardhat console
   const debenture = await ethers.getContractAt(
     "BrazilianDebentureCloneable",
     "YOUR_DEBENTURE_ADDRESS"
   )
   await debenture.claimAllCoupons()
   ```

4. **View Portfolio**:
   - Go to http://localhost:3000/portfolio
   - See all your debentures
   - Check balances and coupons

## Learn More

- [DEPLOYMENT-GUIDE.md](../DEPLOYMENT-GUIDE.md) - Complete deployment guide
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
- [CLAUDE.md](../CLAUDE.md) - Development tracking

---

*DELOS Platform - December 2024*
