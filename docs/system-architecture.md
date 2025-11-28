# System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│  - Oracle Dashboard                                              │
│  - Debenture Issuance Interface                                 │
│  - Portfolio Management                                          │
└───────────────┬─────────────────────────────────────────────────┘
                │
                │ (Web3 via wagmi/viem)
                │
┌───────────────▼─────────────────────────────────────────────────┐
│                    Blockchain Layer (Polygon)                    │
│                                                                   │
│  ┌──────────────────────┐      ┌────────────────────────────┐  │
│  │ BrazilianMacroOracle │◄─────┤   Backend Service          │  │
│  │  - IPCA, CDI rates   │      │   - BCB API integration    │  │
│  │  - Historical data   │      │   - Automated updates      │  │
│  │  - Access control    │      │   - Monitoring             │  │
│  └──────────┬───────────┘      └────────────────────────────┘  │
│             │                                                    │
│             │ (reads rates)                                      │
│             │                                                    │
│  ┌──────────▼───────────┐      ┌────────────────────────────┐  │
│  │  DebentureFactory    │─────►│  BrazilianDebenture (many) │  │
│  │  - Deploy debentures │      │  - IPCA+/CDI+ indexation   │  │
│  │  - Registry          │      │  - Coupon payments         │  │
│  └──────────────────────┘      │  - Transfer restrictions   │  │
│                                 └────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
                │
                │ (data source)
                │
┌───────────────▼─────────────────────────────────────────────────┐
│              Banco Central do Brasil API                         │
│  https://api.bcb.gov.br/dados/serie/bcdata.sgs                  │
└─────────────────────────────────────────────────────────────────┘
```

## Oracle Architecture

### Trust Model: First-Party Oracle

The oracle uses a **trusted updater model** where authorized backend services fetch data from official sources (Banco Central do Brasil) and update on-chain storage.

```
┌─────────────────────┐
│   BCB Official API  │
│   (Public, Free)    │
└──────────┬──────────┘
           │ HTTPS
           ▼
┌─────────────────────┐
│  Backend Service    │
│  - Fetches data     │
│  - Validates ranges │
│  - Signs txs        │
└──────────┬──────────┘
           │ Web3 (signed transactions)
           ▼
┌─────────────────────┐
│  Oracle Contract    │
│  - Stores on-chain  │
│  - Access control   │
│  - Public reads     │
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Debenture Contract │
│  (reads rates)      │
└─────────────────────┘
```

**Characteristics**:
- **Centralized Updates**: Backend service has UPDATER_ROLE
- **Transparent**: All updates recorded on-chain with source attribution
- **Auditable**: Historical data preserved, events emitted
- **Public Access**: Anyone can read rates (no permission needed)

**Trade-offs**:
- ✅ Simple implementation
- ✅ Low operational cost
- ✅ Fast updates
- ✅ Direct control during pilot
- ❌ Single point of failure (backend)
- ❌ Requires trust in updater

**Rationale for Pilot**: This model is appropriate for ANBIMA's controlled testing environment where technical feasibility is being demonstrated. Decentralization can be added in Phase 2 if market demand justifies the complexity.

### 1. Smart Contracts Layer

#### BrazilianMacroOracle
**Purpose**: Store and serve Brazilian economic indicators on-chain

**Key Functions**:
```solidity
getRate(string rateType) → (value, timestamp, lastUpdated)
updateRate(string rateType, uint256 value, uint256 date, string source)
getRecentHistory(string rateType, uint256 count)
```

**State Variables**:
- `mapping(string => RateData) currentRates` - Current rate values
- `mapping(string => RateData[]) rateHistory` - Historical data (max 365 entries)
- `mapping(string => RateMetadata) rateMetadata` - Rate configuration

**Access Control**:
- `ADMIN_ROLE` - Can add new rates, pause oracle
- `UPDATER_ROLE` - Can update rate values
- Public read access for all rates

**Data Flow**:
1. Backend fetches data from BCB API
2. Backend calls `updateRate()` with new data
3. Smart contract emits `RateUpdated` event
4. Other contracts read via `getRate()`

#### BrazilianDebenture (ERC-1404)
**Purpose**: Represent tokenized corporate bonds with Brazilian conventions

**Key Functions**:
```solidity
calculateNextCoupon() → (amount, rateUsed)
recordCouponCalculation()
payCoupon(uint256 paymentIndex)
claimCoupon(uint256 paymentIndex)
mature()
redeem(uint256 amount)
```

**State Variables**:
- `DebentureTerms terms` - Face value, rates, dates, issuer
- `DebentureStatus status` - ACTIVE, MATURED, DEFAULTED, REDEEMED
- `CouponPayment[] couponPayments` - Payment history
- `mapping(address => bool) whitelist` - KYC compliance

**Coupon Calculation Logic**:
```
For IPCA+:
1. Fetch IPCA rate from oracle (e.g., 450 basis points = 4.5%)
2. Add spread (e.g., 500 basis points = 5%)
3. Total rate = 950 basis points (9.5%)
4. Coupon = principal × (rate/10000) × (days/252)

For CDI+:
Same logic but using CDI rate instead of IPCA
```

**Transfer Restrictions (ERC-1404)**:
- Code 0: SUCCESS
- Code 1: NOT_WHITELISTED (recipient not KYC'd)
- Code 2: TRANSFER_PAUSED (global pause active)
- Code 3: EXCEEDS_MAX_BALANCE (regulatory limit)
- Code 4: LOCK_PERIOD_ACTIVE (lock-up not expired)

#### DebentureFactory
**Purpose**: Standardized deployment and registry

**Key Functions**:
```solidity
createSimpleIPCADebenture(...) → address
createDebenture(DebentureTerms, ...) → address
getIssuerDebentures(address) → address[]
```

**Registry**:
- `address[] allDebentures` - All deployed debentures
- `mapping(address => bool) isDebenture` - Validation
- `mapping(address => address[]) issuerDebentures` - By issuer

### 2. Backend Service Layer

#### BCB Client (`bcb_client.py`)
**Purpose**: Interface with Banco Central do Brasil API

**Endpoints Used**:
```
IPCA: https://api.bcb.gov.br/dados/serie/bcdata.sgs/433/dados/ultimos/1
CDI:  https://api.bcb.gov.br/dados/serie/bcdata.sgs/12/dados/ultimos/1
SELIC: https://api.bcb.gov.br/dados/serie/bcdata.sgs/432/dados/ultimos/1
PTAX: https://api.bcb.gov.br/dados/serie/bcdata.sgs/1/dados/ultimos/1
```

**Data Transformation**:
```python
BCB Response: {"data": "15/11/2024", "valor": "4.50"}
              ↓
Oracle Format: {
  "value": 450,        # basis points
  "date": 20241115,    # YYYYMMDD
  "source": "BCB-433"
}
```

#### Oracle Updater (`oracle_updater.py`)
**Purpose**: Update on-chain oracle with fresh data

**Process**:
1. Fetch latest rates from BCB
2. Validate data (range checks)
3. Build blockchain transaction
4. Sign with private key
5. Send to network
6. Wait for confirmation
7. Log result

**Update Strategy**:
- **Batch updates** for gas efficiency (update 4 rates in 1 tx)
- **Idempotent** - safe to retry
- **Error handling** - continues on individual rate failure

#### Scheduler (`scheduler.py`)
**Purpose**: Automated, time-based updates

**Schedule**:
- **Daily at 19:00 BRT**: Update CDI and PTAX
- **11th of month at 10:00**: Check for IPCA update
- **Every 6 hours**: Health check

**Monitoring**:
- Account balance warnings
- Stale data detection
- Update success/failure logging

#### REST API (`api.py`)
**Purpose**: HTTP interface to oracle data

**Endpoints**:
```
GET  /health                      # System status
GET  /rates                       # List supported rates
GET  /rates/{rate_type}           # Current rate
GET  /rates/{rate_type}/history   # Historical data
GET  /bcb/{rate_type}             # Direct BCB data (no cache)
POST /sync                        # Trigger manual update
```

### 3. Frontend Layer

#### Technology Choices

**Next.js 14 (App Router)**:
- Server-side rendering for SEO
- API routes for backend integration
- File-based routing
- Built-in optimization

**wagmi + viem + RainbowKit**:
- Type-safe contract interactions
- Wallet connection handling
- Transaction management
- Network switching

**Component Structure**:
```
app/
├── page.tsx                    # Home/Oracle dashboard
├── issue/page.tsx              # Issue new debenture
├── debenture/[address]/page.tsx # Debenture details
└── portfolio/page.tsx          # User portfolio

components/
├── ui/                         # Base components (Button, Card, etc.)
├── OracleDashboard.tsx        # Oracle rate display
├── OracleRateCard.tsx         # Individual rate card
├── IssueDebentureForm.tsx     # Issuance form
├── DebentureList.tsx          # List of debentures
├── DebentureCard.tsx          # Debenture preview
└── DebentureDetails.tsx       # Full debenture view
```

## Data Flow Examples

### Example 1: Oracle Update
```
1. Scheduler triggers at 19:00 BRT
2. BCBClient.fetch_latest("CDI") → API call
3. BCB returns: {"data": "26/11/2024", "valor": "10.90"}
4. Transform: value=1090, date=20241126, source="BCB-12"
5. OracleUpdater.update_single_rate("CDI", 1090, 20241126, "BCB-12")
6. Sign transaction with private key
7. Send to Polygon network
8. Wait for block confirmation
9. Oracle emits RateUpdated event
10. Frontend automatically refreshes (wagmi watch: true)
```

### Example 2: Debenture Issuance
```
1. User fills form:
   - faceValue: 1000000 BRL
   - maturityYears: 2
   - spread: 500 (5%)
   - name: "Empresa XYZ IPCA+ 2026"

2. Frontend calls DebentureFactory.createSimpleIPCADebenture()
3. Factory deploys new BrazilianDebenture contract
4. Constructor:
   - Mints tokens to issuer
   - Sets up terms (IPCA+, 5% spread, 2 year maturity)
   - Whitelists issuer and trustee
   - Calculates first coupon date (issueDate + 180 days)
5. Factory emits DebentureCreated event
6. Frontend redirects to debenture detail page
```

### Example 3: Coupon Payment
```
1. Time reaches nextCouponDate (180 days after issue)
2. Anyone calls debenture.recordCouponCalculation()
3. Contract:
   - Calls oracle.getRate("IPCA") → 450 (4.5%)
   - Adds spread: 450 + 500 = 950 (9.5%)
   - Calculates: 1M × 9.5% × (180/252) = ~67,857 BRL
   - Stores CouponPayment{amount: 67857, isPaid: false}
   - Emits CouponCalculated event
   - Updates nextCouponDate += 180 days

4. Issuer approves payment token: approve(debenture, 67857)
5. Issuer calls debenture.payCoupon(0)
6. Contract:
   - Transfers 67857 payment tokens from issuer to contract
   - Marks coupon as paid
   - Emits CouponPaid event

7. Investors call debenture.claimCoupon(0)
8. Contract:
   - Calculates investor share: (67857 × balance) / totalSupply
   - Transfers share to investor
```

## Security Considerations

### Smart Contracts
- **Access Control**: OpenZeppelin's AccessControl for role management
- **Reentrancy**: ReentrancyGuard on payment functions
- **Integer Overflow**: Solidity 0.8+ built-in checks
- **Transfer Restrictions**: ERC-1404 compliance prevents unauthorized transfers
- **Pausability**: Emergency pause for oracle and transfers

### Backend
- **Private Key Security**: Stored in environment variables, never logged
- **API Authentication**: Rate limiting on endpoints
- **Data Validation**: Range checks before on-chain updates
- **Error Handling**: Graceful degradation, no crashes

### Frontend
- **Web3 Security**: RainbowKit wallet best practices
- **Transaction Signing**: User confirmation required
- **Data Display**: Read-only view of sensitive data
- **Input Validation**: Client-side checks before submission

## Scalability

### Gas Optimization
- **Batch Updates**: Update multiple rates in one transaction
- **History Pruning**: Cap at 365 entries per rate
- **Efficient Storage**: Pack data in structs
- **View Functions**: Extensive use of view/pure for reads

### Performance
- **Frontend**: Static generation where possible, caching
- **Backend**: Connection pooling, async operations
- **Blockchain**: Polygon for low gas fees and fast confirmations

## Monitoring & Observability

### Metrics to Track
- Oracle update frequency and success rate
- Gas costs per operation
- Backend API response times
- Frontend page load times
- Number of debentures issued
- Total value locked

### Logging
- All oracle updates logged with timestamp
- Transaction hashes stored for audit trail
- Error conditions logged with context
- Health check results

### Alerts
- Low balance warnings
- Failed oracle updates
- Stale data detection
- Smart contract events

## Disaster Recovery

### Oracle Failure
- Manual update capability via API
- Multiple updater addresses (backup keys)
- Emergency pause mechanism
- Historical data preserved on-chain

### Contract Bugs
- Pausable contracts
- Admin override capabilities (trustee role)
- Upgrade path via new factory deployments
- Emergency rescue functions for trapped funds

## Future Enhancements

### Phase 2 Features
- Additional rate types (IGPM, TR, USD)
- Multi-chain deployment (Ethereum, other L2s)
- Decentralized updater network (multi-sig or oracle network integration)
- Premium features (historical data API, SLA guarantees)

### Advanced Debenture Features
- Complex amortization schedules
- Guarantees and collateral management
- Secondary market trading
- Yield farming / liquidity mining

---

**Read Next**: `WEEK1-ORACLE.md` for implementation details