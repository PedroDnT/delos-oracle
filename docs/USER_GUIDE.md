# DELOS User Guide

## Introduction

DELOS is a Brazilian Macro Oracle Platform that provides on-chain access to Banco Central do Brasil (BCB) macroeconomic indicators for tokenized debentures. This guide explains how to use the DELOS frontend application.

---

## Accessing the Application

**URL:** http://localhost:3000 (development) or your deployed URL

**Supported Browsers:**
- Chrome (recommended)
- Firefox
- Safari
- Edge

**Wallet Requirements:**
- MetaMask or any WalletConnect-compatible wallet
- Some ETH on Arbitrum Sepolia for gas fees

---

## Connecting Your Wallet

1. Click the **Connect Wallet** button in the top right corner
2. Select your wallet provider (MetaMask, WalletConnect, etc.)
3. Approve the connection request in your wallet
4. Ensure you're connected to **Arbitrum Sepolia** network

If you're on the wrong network, the app will prompt you to switch.

### Getting Testnet ETH

For Arbitrum Sepolia testnet ETH:
1. Visit the Arbitrum Sepolia faucet
2. Enter your wallet address
3. Request testnet ETH (may require a small mainnet balance)

---

## Oracle Dashboard

### Overview

The dashboard displays real-time Brazilian macroeconomic indicators from the oracle contract.

### Rate Cards

Each rate is displayed in a card showing:
- **Rate Name**: IPCA, CDI, SELIC, PTAX, IGP-M, TR
- **Current Value**: The rate percentage or exchange rate
- **Last Updated**: When the rate was last updated on-chain
- **BCB Date**: The official BCB reference date
- **Status**: Whether the data is fresh or stale

### Understanding the Rates

| Rate | Description | Typical Range |
|------|-------------|---------------|
| **IPCA** | Consumer Price Index - Monthly inflation measure | -1% to 2% |
| **CDI** | Interbank Deposit Rate - Daily benchmark interest rate | 0% to 15% |
| **SELIC** | Central Bank Base Rate - Monetary policy target | 0% to 15% |
| **PTAX** | USD/BRL Exchange Rate - Official BCB rate | 3.0 to 7.0 |
| **IGP-M** | General Market Price Index - Monthly inflation | -1% to 2% |
| **TR** | Reference Rate - For savings accounts | 0% to 5% |

### Data Freshness

- **Green indicator**: Data is fresh and within expected update window
- **Yellow indicator**: Data is approaching staleness threshold
- **Red indicator**: Data is stale and may need attention

The dashboard auto-refreshes every 60 seconds.

---

## Issuing a Debenture

### Prerequisites

1. Connected wallet with Arbitrum Sepolia ETH
2. Authorization as an issuer (owner or authorized by factory)
3. A payment token deployed (for coupon distributions)

### Step-by-Step Guide

1. Navigate to **Issue Debenture** page (`/issue`)
2. Fill in the debenture details:

#### Basic Information

| Field | Description | Example |
|-------|-------------|---------|
| **Debenture Name** | Full name of the security | "Petrobras Debenture IPCA+ 2026" |
| **Symbol** | Short trading symbol (2-10 chars) | "PETR26" |
| **ISIN Code** | International Securities ID (12 chars) | "BRPETD000001" |

#### Financial Terms

| Field | Description | Example |
|-------|-------------|---------|
| **VNE (R$ per unit)** | Face value per unit | 1000.00 |
| **Total Supply** | Number of units to issue | 10000 |
| **Maturity (years)** | Time until maturity | 5 |

#### Rate Indexation

| Rate Type | Description | When to Use |
|-----------|-------------|-------------|
| **PRE (Fixed Rate)** | Fixed interest rate | When you want predictable returns |
| **DI + Spread** | CDI rate plus a spread | Floating rate with minimum yield |
| **% of DI** | Percentage of CDI | Pure floating rate exposure |
| **IPCA + Spread** | Inflation plus spread | Inflation-protected bonds |
| **IGP-M + Spread** | Market inflation plus spread | Alternative inflation index |

#### Spread/Rate

Enter the spread percentage (for indexed types) or fixed rate (for PRE type):
- Example: 5.00% spread for "IPCA + 5%"
- The value is stored with 4 decimal precision

3. Click **Create Debenture**
4. Confirm the transaction in your wallet
5. Wait for transaction confirmation

### After Creation

Upon successful creation:
- Transaction hash is displayed
- Link to view on Arbiscan
- New debenture address is shown
- You can create another or view portfolio

### Default Settings

The issuance form uses these defaults:
- **Coupon Frequency**: Semi-annual (180 days)
- **Amortization Type**: Percentage of VNE
- **Lock-up Period**: 30 days
- **Trustee**: Defaults to issuer address

---

## Portfolio Management

### Viewing Your Debentures

Navigate to **Portfolio** page (`/portfolio`) to see:
- All debentures you've issued
- Debentures you hold as an investor
- Key metrics for each debenture

### Debenture Details

Each debenture card shows:
- Name and symbol
- ISIN code
- Current status (Active, Matured, Defaulted, Redeemed)
- VNE and total supply
- Maturity date
- Rate type and spread
- Your holdings (if any)

### Actions

Depending on your role:

**As Issuer:**
- Record coupon payments
- Execute amortizations
- Manage whitelist
- Declare early redemption

**As Trustee:**
- Declare maturity
- Declare default

**As Holder:**
- View pending coupons
- Claim coupon payments
- Transfer tokens (if whitelisted)

---

## Whitelist Management

### Why Whitelisting?

DELOS debentures implement ERC-1404 transfer restrictions for regulatory compliance. Only whitelisted addresses can send or receive tokens.

### Adding to Whitelist

1. Navigate to debenture details
2. Click **Manage Whitelist**
3. Enter the address to whitelist
4. Click **Add to Whitelist**
5. Confirm transaction

### Batch Whitelisting

For multiple addresses:
1. Click **Batch Add**
2. Enter addresses (one per line or comma-separated)
3. Confirm transaction

### Removing from Whitelist

1. Find the address in the whitelist table
2. Click the remove button
3. Confirm transaction

### Transfer Restrictions

Transfers will fail if:
- Sender is not whitelisted
- Receiver is not whitelisted
- Either party is blacklisted
- Contract is paused
- Lock-up period is active

---

## Coupon Operations

### Recording a Coupon (Issuer)

1. Navigate to debenture details
2. Click **Record Coupon**
3. Enter:
   - PU per unit (payment per token)
   - Total amount (for verification)
4. Deposit payment tokens to the contract
5. Confirm transaction

### Claiming Coupons (Holder)

1. Navigate to your portfolio or debenture details
2. View pending claims
3. Click **Claim All Coupons** or claim individually
4. Confirm transaction
5. Tokens are transferred to your wallet

### Viewing Coupon History

- See all recorded coupons
- Check which coupons you've claimed
- View pending claims

---

## Transaction Guide

### Transaction States

| State | Description |
|-------|-------------|
| **Pending** | Transaction submitted, waiting for confirmation |
| **Confirming** | Transaction included in block, awaiting confirmations |
| **Confirmed** | Transaction fully confirmed |
| **Failed** | Transaction reverted |

### Common Transaction Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "User rejected" | You cancelled in wallet | Retry and approve |
| "Insufficient funds" | Not enough ETH for gas | Get more testnet ETH |
| "Not authorized" | Not an authorized issuer | Contact factory owner |
| "ISIN already exists" | Duplicate ISIN code | Use unique ISIN |
| "Transfer restricted" | Whitelist/blacklist issue | Check addresses |

### Gas Estimation

Typical gas costs on Arbitrum:
- Create Debenture: ~250,000 gas
- Add to Whitelist: ~50,000 gas
- Record Coupon: ~80,000 gas
- Claim Coupon: ~60,000 gas

---

## Understanding Rate Displays

### Percentage Rates (IPCA, CDI, SELIC, IGP-M, TR)

Displayed as percentages with 2 decimal places:
- Example: "10.90%" for CDI
- Example: "0.56%" for IPCA monthly

### Exchange Rates (PTAX)

Displayed as BRL per USD:
- Example: "5.81" means R$ 5.81 per US$ 1.00

### On-Chain Encoding

All values are stored with 8 decimal precision (Chainlink standard):
- 10.90% is stored as 1,090,000,000
- 5.81 is stored as 581,000,000

---

## Network Information

### Arbitrum Sepolia Testnet

| Parameter | Value |
|-----------|-------|
| Network Name | Arbitrum Sepolia |
| Chain ID | 421614 |
| Currency | ETH |
| Block Explorer | https://sepolia.arbiscan.io |
| RPC URL | https://sepolia-rollup.arbitrum.io/rpc |

### Adding Network to MetaMask

1. Open MetaMask
2. Click network dropdown
3. Click "Add Network"
4. Enter Arbitrum Sepolia details
5. Save and switch

---

## Troubleshooting

### Wallet Not Connecting

1. Refresh the page
2. Check if MetaMask is unlocked
3. Try disconnecting and reconnecting
4. Clear browser cache
5. Try a different browser

### Rates Not Loading

1. Check if backend API is running
2. Verify network connection
3. Check browser console for errors
4. Refresh the page

### Transaction Stuck

1. Check transaction on Arbiscan
2. If pending too long, try:
   - Increasing gas price
   - Speed up in MetaMask
   - Cancel and retry

### Wrong Network

1. Click network switcher in wallet
2. Select Arbitrum Sepolia
3. If not available, add the network manually

### Whitelist Issues

1. Verify both addresses are whitelisted
2. Check if contract is paused
3. Confirm lock-up period has ended
4. Ensure neither address is blacklisted

---

## Glossary

| Term | Definition |
|------|------------|
| **ANBIMA** | Brazilian Financial and Capital Markets Association |
| **BCB** | Banco Central do Brasil - Brazilian Central Bank |
| **CDI** | Certificado de Deposito Interbancario - Interbank deposit rate |
| **CETIP** | Brazilian securities clearing house |
| **Coupon** | Periodic interest payment on a debenture |
| **Debenture** | Debt security issued by corporations |
| **ERC-1404** | Token standard with transfer restrictions |
| **IGP-M** | Indice Geral de Precos do Mercado - Market price index |
| **IPCA** | Indice de Precos ao Consumidor Amplo - Consumer price index |
| **ISIN** | International Securities Identification Number |
| **Oracle** | Smart contract providing off-chain data on-chain |
| **PTAX** | Official USD/BRL exchange rate |
| **SELIC** | Brazilian base interest rate |
| **TR** | Taxa Referencial - Reference rate |
| **VNA** | Valor Nominal Atualizado - Updated face value |
| **VNE** | Valor Nominal de Emissao - Original face value |
| **Whitelist** | List of approved addresses for transfers |

---

## Security Best Practices

1. **Never share your private key** or seed phrase
2. **Verify transaction details** before confirming
3. **Use hardware wallets** for significant holdings
4. **Check contract addresses** match official deployments
5. **Be cautious of phishing** - verify URLs carefully

---

## Support

For assistance:
1. Check this documentation first
2. Review FAQ section below
3. Open an issue on GitHub
4. Contact the development team

---

## FAQ

### Q: Is this production-ready?

A: DELOS is currently deployed on Arbitrum Sepolia testnet for the ANBIMA tokenized securities pilot. Production deployment requires additional security audits and regulatory approvals.

### Q: How often are rates updated?

A: Daily rates (CDI, SELIC, PTAX, TR) are updated at 19:00 BRT on business days. Monthly rates (IPCA, IGP-M) are updated around the 10th of each month.

### Q: Can I use my own oracle for rates?

A: The contracts are designed to work with the DELOS oracle, but you can deploy your own BrazilianMacroOracle contract and point the factory to it.

### Q: What happens if a rate is stale?

A: The frontend indicates stale data with a warning. Debentures can still function with stale rates, but calculations may not reflect current market conditions.

### Q: How do I become an authorized issuer?

A: The factory owner must call `setAuthorizedIssuer(yourAddress, true)` to authorize your address for debenture creation.

### Q: Can I transfer debentures?

A: Yes, if both sender and receiver are whitelisted, the lock-up period has ended, and the contract is not paused.

### Q: What happens at maturity?

A: The trustee declares maturity, changing the debenture status. Final payments are then processed according to the debenture terms.

### Q: How are coupons calculated?

A: Coupon amounts are calculated based on the rate type, current oracle values, and the debenture terms. The issuer records the calculated PU per unit.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Dec 2024 | Initial release |
