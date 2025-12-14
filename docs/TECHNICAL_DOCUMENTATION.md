# DELOS - Brazilian Macro Oracle Platform

## Technical Documentation

**Version:** 1.0.0
**Last Updated:** December 2024
**Author:** DELOS Team
**Network:** Arbitrum Sepolia (Testnet)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Smart Contracts](#3-smart-contracts)
   - [BrazilianMacroOracle](#31-brazilianmacrooracle)
   - [DebentureCloneFactory](#32-debentureclonefactory)
   - [BrazilianDebentureCloneable](#33-braziliandebenturecoloneable)
4. [Backend Services](#4-backend-services)
   - [REST API Reference](#41-rest-api-reference)
   - [BCB Client](#42-bcb-client)
   - [Oracle Updater](#43-oracle-updater)
   - [Scheduler](#44-scheduler)
   - [Data Store](#45-data-store)
   - [Anomaly Detector](#46-anomaly-detector)
5. [Frontend Application](#5-frontend-application)
6. [Developer Guide](#6-developer-guide)
7. [Deployment Guide](#7-deployment-guide)
8. [Integration Examples](#8-integration-examples)
9. [Troubleshooting](#9-troubleshooting)
10. [Appendices](#10-appendices)

---

## 1. Executive Summary

DELOS is a Brazilian Macro Data Oracle Platform providing on-chain access to Banco Central do Brasil (BCB) macroeconomic indicators for tokenized debentures. Built for ANBIMA's tokenized securities pilot program, the platform delivers Chainlink-compatible oracle feeds for:

- **IPCA** - Consumer Price Index (Inflation)
- **CDI** - Interbank Deposit Certificate Rate
- **SELIC** - Central Bank Base Interest Rate
- **PTAX** - USD/BRL Exchange Rate
- **IGP-M** - General Market Price Index
- **TR** - Reference Rate

### Key Value Propositions

1. **Chainlink Compatibility**: 8-decimal precision feeds compatible with existing DeFi infrastructure
2. **Regulatory Compliance**: ERC-1404 transfer restrictions for KYC/AML compliance
3. **Gas Efficiency**: EIP-1167 minimal proxy pattern reduces deployment costs by 98%
4. **Brazilian Market Focus**: Native support for Brazilian fixed-income conventions

### Deployed Contracts (Arbitrum Sepolia)

| Contract | Address | Purpose |
|----------|---------|---------|
| BrazilianMacroOracle | `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe` | Rate feed oracle |
| BrazilianDebentureCloneable (Implementation) | `0x8856dd1f536169B8A82D8DA5476F9765b768f51D` | Debenture implementation |
| DebentureCloneFactory | `0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f` | Debenture factory |

---

## 2. Architecture Overview

### System Architecture Diagram

```
+----------------------------------------------------------+
|                     DATA SOURCES                          |
|  BCB API (api.bcb.gov.br/dados/serie/bcdata.sgs.*)       |
|  Series: 433(IPCA), 12(CDI), 432(SELIC), 1(PTAX),        |
|          189(IGPM), 226(TR)                               |
+----------------------------------------------------------+
                            |
                            v
+----------------------------------------------------------+
|                   BACKEND (Python)                        |
|  +-------------+  +-------------+  +----------------+     |
|  | BCB Client  |->| Scheduler   |->| Oracle Updater |     |
|  | (httpx)     |  | (APScheduler)|  | (web3.py)     |     |
|  +-------------+  +-------------+  +----------------+     |
|         |                                 |               |
|         v                                 v               |
|  +-------------+  +---------------+  +----------+        |
|  | Data Store  |  | Anomaly       |  | REST API |        |
|  | (SQLite)    |  | Detector      |  | (FastAPI)|        |
|  +-------------+  +---------------+  +----------+        |
+----------------------------------------------------------+
                            |
                            v
+----------------------------------------------------------+
|              SMART CONTRACTS (Solidity 0.8.20)           |
|  +---------------------------------------------------+   |
|  |            BrazilianMacroOracle                    |   |
|  |  - 6 rate types with circuit breakers             |   |
|  |  - Chainlink AggregatorV3Interface compatible     |   |
|  |  - Role-based access (ADMIN, UPDATER)             |   |
|  +---------------------------------------------------+   |
|                          |                               |
|                          v                               |
|  +---------------------------+  +--------------------+   |
|  | BrazilianDebentureCloneable|<-| DebentureCloneFactory |
|  | - ERC-20 + ERC-1404       |  | - EIP-1167 clones  |   |
|  | - Coupon distribution     |  | - ISIN registry    |   |
|  | - Oracle integration      |  | - Issuer auth      |   |
|  +---------------------------+  +--------------------+   |
+----------------------------------------------------------+
                            |
                            v
+----------------------------------------------------------+
|                FRONTEND (Next.js 14)                      |
|  +---------------+  +---------------+  +--------------+   |
|  | Rate Dashboard|  | Issue Form    |  | Portfolio    |   |
|  | (Real-time)   |  | (Debentures)  |  | Management   |   |
|  +---------------+  +---------------+  +--------------+   |
|                                                          |
|  RainbowKit + wagmi + TanStack Query                     |
+----------------------------------------------------------+
```

### Data Flow

1. **BCB Data Fetching**: The scheduler triggers BCB API calls at configured intervals
2. **Anomaly Detection**: New values are checked for statistical anomalies
3. **Oracle Update**: Valid data is submitted to the blockchain via Web3
4. **On-Chain Storage**: Oracle stores rates with 8-decimal Chainlink precision
5. **Debenture Calculation**: Debentures query oracle for rate-indexed calculations
6. **Frontend Display**: React app polls API/blockchain for real-time updates

### Component Relationships

```
bcb_client.py
    |
    +-> fetch_latest(RateType) -> RateData
    |
    +-> fetch_all_latest_parallel() -> Dict[RateType, RateData]

oracle_updater.py
    |
    +-> OracleUpdater(rpc_url, contract_address, private_key)
    |
    +-> sync_rate(RateType) -> UpdateResult
    |
    +-> sync_all_rates() -> UpdateResult

scheduler.py
    |
    +-> RateScheduler(settings, data_store, anomaly_detector)
    |
    +-> Daily updates: 19:00 BRT (CDI, SELIC, PTAX, TR)
    |
    +-> Monthly updates: 10th at 10:00 BRT (IPCA, IGPM)

api.py
    |
    +-> GET /rates -> All current oracle rates
    |
    +-> GET /rates/{type} -> Specific rate
    |
    +-> POST /sync -> Manual sync trigger
```

---

## 3. Smart Contracts

### 3.1 BrazilianMacroOracle

**Location:** `/contracts/contracts/BrazilianMacroOracle.sol`
**Deployed:** `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe`
**Size:** 577 lines | 33 tests passing

#### Purpose

On-chain storage for Brazilian macroeconomic indicators with Chainlink AggregatorV3Interface compatibility.

#### Value Encoding (Chainlink Standard - 8 decimals)

```
4.50% interest rate  -> 450000000   (4.5 x 10^8)
10.90% CDI rate      -> 1090000000  (10.9 x 10^8)
5.81 BRL/USD         -> 581000000   (5.81 x 10^8)
```

#### Supported Rates

| Rate | BCB Series | Type | Heartbeat | Min | Max |
|------|-----------|------|-----------|-----|-----|
| IPCA | 433 | Inflation % | 35 days | -10% | 100% |
| CDI | 12 | Interest Rate | 2 days | 0% | 50% |
| SELIC | 432 | Interest Rate | 2 days | 0% | 50% |
| PTAX | 1 | FX Rate | 2 days | 1.0 | 15.0 |
| IGPM | 189 | Inflation % | 35 days | -10% | 100% |
| TR | 226 | Interest Rate | 2 days | 0% | 50% |

#### Contract Interface

```solidity
// Constants
uint8 public constant CHAINLINK_DECIMALS = 8;
uint256 public constant PRECISION = 10 ** 8;

// Roles
bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

// Structs
struct RateData {
    int256 answer;          // Rate scaled by 10^8 (signed for negative)
    uint256 timestamp;      // Block timestamp
    uint256 realWorldDate;  // BCB date (YYYYMMDD format)
    string source;          // Data source (e.g., "BCB-433")
    address updater;        // Updater address
}

struct RateMetadata {
    string name;
    string description;
    uint8 decimals;
    uint256 heartbeat;
    int256 minAnswer;
    int256 maxAnswer;
    bool isActive;
}
```

#### Key Functions

```solidity
// Update a single rate
function updateRate(
    string calldata rateType,
    int256 answer,
    uint256 realWorldDate,
    string calldata source
) external onlyRole(UPDATER_ROLE) whenNotPaused;

// Batch update multiple rates
function batchUpdateRates(
    string[] calldata rateTypes,
    int256[] calldata answers,
    uint256[] calldata realWorldDates,
    string[] calldata sources
) external onlyRole(UPDATER_ROLE) whenNotPaused returns (uint256 updated);

// Get current rate
function getRate(string calldata rateType)
    external view
    returns (int256 answer, uint256 timestamp, uint256 realWorldDate);

// Chainlink-compatible interface
function latestRoundData(string calldata rateType)
    external view
    returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );

// Check staleness
function isRateStale(string calldata rateType) external view returns (bool);
```

#### Events

```solidity
event RateUpdated(
    string indexed rateType,
    int256 answer,
    uint256 realWorldDate,
    string source,
    address indexed updater,
    uint256 timestamp
);

event RateAdded(string indexed rateType, string name, uint8 decimals, uint256 heartbeat);
event RateDeactivated(string indexed rateType);
event RateReactivated(string indexed rateType);
```

#### Errors

```solidity
error RateDoesNotExist(string rateType);
error RateAlreadyExists(string rateType);
error InvalidDate();
error RateNotActive(string rateType);
error EmptyRateType();
error AnswerBelowMin(string rateType, int256 answer, int256 min);
error AnswerAboveMax(string rateType, int256 answer, int256 max);
error SameDateUpdate(string rateType, uint256 date);
error ArrayLengthMismatch();
```

#### Usage Example

```javascript
// JavaScript/ethers.js example
const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);

// Get CDI rate
const [answer, timestamp, realWorldDate] = await oracle.getRate("CDI");
const cdiPercent = Number(answer) / 1e8; // Convert from 8 decimals
console.log(`CDI: ${cdiPercent}%`);

// Chainlink-compatible call
const roundData = await oracle.latestRoundData("IPCA");
console.log(`IPCA: ${Number(roundData.answer) / 1e8}%`);
```

---

### 3.2 DebentureCloneFactory

**Location:** `/contracts/contracts/DebentureCloneFactory.sol`
**Deployed:** `0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f`

#### Purpose

Factory contract for gas-efficient deployment of Brazilian debentures using the EIP-1167 minimal proxy pattern.

#### Benefits of Clone Pattern

| Aspect | Full Deployment | Clone Deployment |
|--------|-----------------|------------------|
| Bytecode Size | ~29KB | ~45 bytes |
| Gas Cost | ~3M gas | ~45K gas |
| Savings | - | ~98% |

#### Contract Interface

```solidity
// State Variables
address public immutable implementation;
address public oracle;
address public defaultPaymentToken;
address[] public allDebentures;
mapping(string => address) public debenturesByISIN;
mapping(address => address[]) public issuerDebentures;
mapping(address => bool) public authorizedIssuers;

// Events
event DebentureCreated(
    address indexed debentureAddress,
    string indexed isinCode,
    string name,
    string symbol,
    address indexed issuer,
    uint256 vne,
    uint256 totalSupply
);
event IssuerAuthorized(address indexed issuer, bool authorized);
event OracleUpdated(address indexed oldOracle, address indexed newOracle);
```

#### Key Functions

```solidity
// Create a new debenture
function createDebenture(
    string calldata name,
    string calldata symbol,
    BrazilianDebentureCloneable.DebentureTerms calldata terms,
    address paymentToken,
    address trustee
) external onlyAuthorizedIssuer returns (address debentureAddress);

// Create with deterministic address (CREATE2)
function createDeterministicDebenture(
    string calldata name,
    string calldata symbol,
    BrazilianDebentureCloneable.DebentureTerms calldata terms,
    address paymentToken,
    address trustee,
    bytes32 salt
) external onlyAuthorizedIssuer returns (address debentureAddress);

// Predict deterministic address
function predictDeterministicAddress(bytes32 salt) external view returns (address);

// Admin functions
function setAuthorizedIssuer(address issuer, bool authorized) external onlyOwner;
function batchAuthorizeIssuers(address[] calldata issuers) external onlyOwner;
function setOracle(address _oracle) external onlyOwner;

// View functions
function getAllDebentures() external view returns (address[] memory);
function getIssuerDebentures(address issuer) external view returns (address[] memory);
function getTotalDebentures() external view returns (uint256);
function isinExists(string calldata isinCode) external view returns (bool);
```

#### Usage Example

```javascript
// Create a new IPCA+ debenture
const terms = {
  vne: ethers.parseUnits("1000", 6), // R$ 1,000.00 per unit
  totalSupplyUnits: 1000n,
  issueDate: BigInt(Math.floor(Date.now() / 1000)),
  maturityDate: BigInt(Math.floor(Date.now() / 1000) + 2 * 365 * 86400),
  anniversaryDay: 15,
  lockUpEndDate: BigInt(Math.floor(Date.now() / 1000) + 30 * 86400),
  rateType: 3, // IPCA_SPREAD
  fixedRate: 50000n, // 5% spread (4 decimals)
  percentDI: 100,
  couponFrequencyDays: 180n,
  amortType: 0, // PERCENT_VNE
  isinCode: "BRTEST000001",
  cetipCode: "",
  series: "1a Serie",
  hasRepactuacao: false,
  hasEarlyRedemption: false,
  comboId: ethers.ZeroHash,
};

const tx = await factory.createDebenture(
  "Test Debenture IPCA+ 2026",
  "TEST26",
  terms,
  paymentTokenAddress,
  trusteeAddress
);
const receipt = await tx.wait();
```

---

### 3.3 BrazilianDebentureCloneable

**Location:** `/contracts/contracts/BrazilianDebentureCloneable.sol`
**Implementation:** `0x8856dd1f536169B8A82D8DA5476F9765b768f51D`

#### Purpose

Cloneable ERC-20 token representing Brazilian debentures with ERC-1404 transfer restrictions, oracle integration for rate indexation, and coupon distribution.

#### Standards Compliance

- **ERC-20**: Token standard
- **ERC-1404**: Transfer restrictions
- **ERC-165**: Interface detection
- **OpenZeppelin**: AccessControl, ReentrancyGuard, Pausable, Initializable

#### Rate Types

```solidity
enum RateType {
    PRE,          // Fixed rate
    DI_SPREAD,    // DI + spread
    DI_PERCENT,   // Percentage of DI
    IPCA_SPREAD,  // IPCA + spread
    IGPM_SPREAD   // IGP-M + spread
}
```

#### Transfer Restriction Codes (ERC-1404)

```solidity
uint8 public constant SUCCESS = 0;
uint8 public constant NOT_WHITELISTED = 1;
uint8 public constant PAUSED = 2;
uint8 public constant BLACKLISTED = 3;
uint8 public constant LOCK_UP_PERIOD = 4;
```

#### Structs

```solidity
struct DebentureTerms {
    uint256 vne;                    // Valor Nominal de Emissao (6 decimals)
    uint256 totalSupplyUnits;       // Number of units issued
    uint256 issueDate;              // Emission date timestamp
    uint256 maturityDate;           // Maturity date timestamp
    uint8 anniversaryDay;           // Day for IPCA anniversary (1-31)
    uint256 lockUpEndDate;          // Lock-up period end timestamp
    RateType rateType;              // Indexation type
    uint256 fixedRate;              // Fixed rate or spread (4 decimals)
    uint8 percentDI;                // % of DI if DI_PERCENT type
    uint256 couponFrequencyDays;    // Days between coupon payments
    AmortizationType amortType;     // Amortization calculation basis
    string isinCode;                // ISIN code (12 chars)
    string cetipCode;               // CETIP/B3 code
    string series;                  // Series identifier
    bool hasRepactuacao;            // Has repactuation clause
    bool hasEarlyRedemption;        // Has early redemption clause
    bytes32 comboId;                // Combo series identifier
}

struct VNARecord {
    uint256 value;                  // Current VNA value (6 decimals)
    uint256 lastUpdateDate;         // Last update timestamp
    uint256 lastIndexValue;         // Last IPCA/IGPM index value
    uint256 accumulatedFactor;      // Factor C accumulation (8 decimals)
}

struct CouponRecord {
    uint256 date;                   // Record date
    uint256 puPerUnit;              // PU per unit at record date
    uint256 totalAmount;            // Total coupon amount
    bool distributed;               // Whether distributed
}
```

#### Key Functions

```solidity
// Initialize (called by factory)
function initialize(
    string memory initName,
    string memory initSymbol,
    DebentureTerms memory initTerms,
    address initOracle,
    address initPaymentToken,
    address initIssuer,
    address initTrustee
) external initializer;

// ERC-1404 Transfer Restrictions
function detectTransferRestriction(address from, address to, uint256)
    public view returns (uint8);
function messageForTransferRestriction(uint8 restrictionCode)
    public pure returns (string memory);

// Whitelist Management
function addToWhitelist(address account) external onlyRole(WHITELIST_ADMIN_ROLE);
function removeFromWhitelist(address account) external onlyRole(WHITELIST_ADMIN_ROLE);
function batchAddToWhitelist(address[] calldata accounts) external;

// Coupon Operations
function recordCoupon(uint256 puPerUnit, uint256 totalAmount) external onlyRole(ISSUER_ROLE);
function claimCoupon(uint256 couponIndex) external nonReentrant;
function claimAllCoupons() external nonReentrant;

// Amortization
function setAmortizationSchedule(AmortizationSchedule[] calldata schedule) external;
function executeAmortization(uint256 scheduleIndex) external onlyRole(ISSUER_ROLE);

// Status Management
function declareMaturity() external onlyRole(TRUSTEE_ROLE);
function declareDefault() external onlyRole(TRUSTEE_ROLE);
function earlyRedemption() external onlyRole(ISSUER_ROLE);

// View Functions
function getTerms() external view returns (DebentureTerms memory);
function getVNA() external view returns (VNARecord memory);
function getPendingClaims(address holder) external view returns (uint256[] memory);
```

#### Events

```solidity
event DebentureInitialized(string indexed isinCode, uint256 vne, uint256 totalSupply, RateType rateType);
event WhitelistUpdated(address indexed account, bool status);
event BlacklistUpdated(address indexed account, bool status);
event CouponRecorded(uint256 indexed couponIndex, uint256 puPerUnit, uint256 totalAmount);
event CouponClaimed(address indexed holder, uint256 indexed couponIndex, uint256 amount);
event AmortizationExecuted(uint256 indexed scheduleIndex, uint256 amount);
event VNAUpdated(uint256 newValue, uint256 indexValue, uint256 factor);
event StatusChanged(DebentureStatus oldStatus, DebentureStatus newStatus);
```

---

## 4. Backend Services

### 4.1 REST API Reference

**Location:** `/backend/api.py`
**Framework:** FastAPI
**Base URL:** `http://localhost:8000`
**Documentation:** `http://localhost:8000/docs` (Swagger UI)

#### Endpoints

##### Health

```
GET /health
```

Check system health status.

**Response:**
```json
{
  "status": "healthy",
  "bcb_api": true,
  "oracle_connection": true,
  "scheduler_running": true,
  "last_update": null,
  "version": "1.0.0"
}
```

##### Rates

```
GET /rates
```

Get all current rates from the oracle contract.

**Response:**
```json
[
  {
    "rate_type": "CDI",
    "answer": 1090000000,
    "raw_value": 10.9,
    "real_world_date": 20241126,
    "timestamp": 1732636800,
    "source": "BCB-12",
    "is_stale": false,
    "heartbeat_seconds": 172800
  }
]
```

```
GET /rates/{rate_type}
```

Get a specific rate from the oracle contract.

**Parameters:**
- `rate_type`: Rate type (IPCA, CDI, SELIC, PTAX, IGPM, TR)

**Response:**
```json
{
  "rate_type": "IPCA",
  "answer": 56000000,
  "raw_value": 0.56,
  "real_world_date": 20241101,
  "timestamp": 1732636800,
  "source": "BCB-433",
  "is_stale": false,
  "heartbeat_seconds": 3024000
}
```

```
GET /rates/{rate_type}/history
```

Get historical rates from local storage.

**Query Parameters:**
- `days`: Number of days of history (1-365, default: 30)

**Response:**
```json
{
  "rate_type": "CDI",
  "history": [...],
  "count": 30
}
```

##### Sync

```
POST /sync
```

Manually trigger rate synchronization.

**Query Parameters:**
- `rate_type`: Specific rate to sync (optional)
- `force`: Force update even if same date (default: false)

**Response:**
```json
{
  "success": true,
  "rates_updated": 4,
  "rates_skipped": 2,
  "rates_failed": 0,
  "anomalies_detected": 0,
  "tx_hash": "0x...",
  "error": null
}
```

##### Scheduler

```
GET /scheduler/jobs
```

Get all scheduled jobs and their next run times.

**Response:**
```json
[
  {
    "id": "daily_rates",
    "name": "Daily Rate Update (CDI, SELIC, PTAX, TR)",
    "next_run": "2024-11-27T19:00:00-03:00",
    "trigger": "cron[hour='19', minute='0', day_of_week='mon-fri']"
  }
]
```

```
GET /scheduler/runs
```

Get recent scheduler job runs.

**Query Parameters:**
- `limit`: Number of runs to return (1-100, default: 20)

##### BCB Direct

```
GET /bcb/latest/{rate_type}
```

Fetch latest rate directly from BCB API (bypass oracle).

**Response:**
```json
{
  "rate_type": "CDI",
  "answer": 1090000000,
  "raw_value": 10.9,
  "real_world_date": 20241126,
  "real_world_date_str": "26/11/2024",
  "source": "BCB-12",
  "description": "CDI - Interbank Deposit Rate",
  "timestamp": "2024-11-26T00:00:00"
}
```

##### Anomalies

```
GET /anomalies
```

Get detected anomalies from the database.

**Query Parameters:**
- `rate_type`: Filter by rate type (optional)
- `days`: Number of days to look back (1-90, default: 7)
- `limit`: Maximum records to return (1-500, default: 100)

##### Stats

```
GET /stats
```

Get database statistics.

**Response:**
```json
{
  "rates_count": 180,
  "oracle_updates_count": 30,
  "anomalies_count": 2,
  "scheduler_runs_count": 15,
  "database_path": "data/rates.db"
}
```

---

### 4.2 BCB Client

**Location:** `/backend/bcb_client.py`
**Size:** 850+ lines

#### Purpose

Asynchronous client for fetching macroeconomic data from Banco Central do Brasil's open data API with Chainlink-compatible value encoding.

#### API Endpoints

```
Base URL: https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series}/dados

Series Codes:
- IPCA: 433
- CDI: 12
- SELIC: 432
- PTAX: 1
- IGP-M: 189
- TR: 226
```

#### Classes

##### RateType

```python
class RateType(str, Enum):
    IPCA = "IPCA"   # Monthly inflation
    CDI = "CDI"     # Daily interbank rate
    SELIC = "SELIC" # Central bank target rate
    PTAX = "PTAX"   # USD/BRL exchange rate
    IGPM = "IGPM"   # Monthly market price index
    TR = "TR"       # Reference rate
```

##### RateConfig

```python
@dataclass(frozen=True)
class RateConfig:
    bcb_series: int           # BCB API series code
    description: str          # Human-readable description
    decimals: int             # Chainlink decimals (always 8)
    heartbeat_seconds: int    # Max expected time between updates
    min_value: int            # Circuit breaker minimum (scaled)
    max_value: int            # Circuit breaker maximum (scaled)
    is_percentage: bool       # True if value is a percentage
    update_frequency: str     # "daily" or "monthly"
```

##### RateData

```python
@dataclass
class RateData:
    rate_type: RateType
    answer: int              # Chainlink-compatible: scaled by 10^8
    raw_value: float         # Original BCB value
    decimals: int            # Always 8
    real_world_date: int     # YYYYMMDD format
    real_world_date_str: str # Original BCB date string
    timestamp: datetime      # Python datetime
    source: str              # "BCB-{series_code}"
    description: str         # Rate description

    @property
    def answer_as_percentage(self) -> float:
        """Convert answer back to percentage."""
        return self.answer / CHAINLINK_PRECISION

    @property
    def answer_as_basis_points(self) -> int:
        """Convert to basis points (1 bp = 0.01%)."""
        return self.answer // (10 ** 6)
```

##### BCBClient

```python
class BCBClient:
    BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series}/dados"
    TIMEOUT = 30.0

    async def fetch_latest(self, rate_type: RateType) -> RateData:
        """Fetch the most recent value for a rate."""

    async def fetch_history(self, rate_type: RateType, count: int = 10) -> List[RateData]:
        """Fetch historical values for a rate."""

    async def fetch_all_latest_parallel(
        self,
        rate_types: Optional[List[RateType]] = None
    ) -> Dict[RateType, RateData]:
        """Fetch latest values for multiple rates in parallel."""

    async def fetch_with_retry(
        self,
        rate_type: RateType,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0
    ) -> RateData:
        """Fetch with exponential backoff retry."""

    async def health_check(self) -> bool:
        """Check if BCB API is accessible."""
```

#### Usage Example

```python
async with BCBClient() as client:
    # Get latest CDI rate
    cdi = await client.fetch_latest(RateType.CDI)
    print(f"CDI: {cdi.raw_value}% -> {cdi.answer} (8 decimals)")

    # Get all rates in parallel
    rates = await client.fetch_all_latest_parallel()
    for rate_type, data in rates.items():
        print(f"{rate_type.value}: {data.raw_value}")
```

---

### 4.3 Oracle Updater

**Location:** `/backend/oracle_updater.py`
**Size:** 431 lines

#### Purpose

Web3 integration for updating the BrazilianMacroOracle contract on Arbitrum Sepolia.

#### Class: OracleUpdater

```python
class OracleUpdater:
    def __init__(
        self,
        rpc_url: Optional[str] = None,        # Default: ARBITRUM_SEPOLIA_RPC
        contract_address: Optional[str] = None, # Default: ORACLE_ADDRESS
        private_key: Optional[str] = None       # Default: PRIVATE_KEY
    ):
        """Initialize with Web3 connection and contract ABI."""

    async def check_connection(self) -> bool:
        """Verify connection to the blockchain."""

    async def get_balance(self) -> float:
        """Get updater account balance in ETH."""

    async def get_current_rate(self, rate_type: str) -> Optional[Dict]:
        """Get current rate from oracle contract."""

    async def get_all_current_rates(self) -> Dict[str, Dict]:
        """Get all current rates from oracle."""

    async def check_needs_update(self, rate_data: RateData) -> Tuple[bool, str]:
        """Check if a rate needs updating based on date."""

    async def sync_rate(self, rate_type: RateType, force: bool = False) -> UpdateResult:
        """Fetch from BCB and update a single rate."""

    async def sync_all_rates(self, force: bool = False) -> UpdateResult:
        """Batch update all rates using batchUpdateRates()."""
```

#### UpdateResult

```python
@dataclass
class UpdateResult:
    success: bool
    rates_updated: int = 0
    rates_skipped: int = 0
    tx_hash: Optional[str] = None
    block: Optional[int] = None
    gas_used: Optional[int] = None
    error: Optional[str] = None
    details: Optional[Dict] = None
```

#### CLI Usage

```bash
# Check on-chain state
python oracle_updater.py status

# Check account balance
python oracle_updater.py balance

# Check which rates need updates
python oracle_updater.py check

# Sync a single rate
python oracle_updater.py sync --rate CDI

# Sync all rates
python oracle_updater.py sync-all

# Force update (ignore same-date check)
python oracle_updater.py sync-all --force
```

---

### 4.4 Scheduler

**Location:** `/backend/scheduler.py`
**Size:** 531 lines
**Framework:** APScheduler

#### Purpose

Automated BCB data fetching and oracle updates with configurable schedules.

#### Schedule

| Job | Schedule | Rates | Timezone |
|-----|----------|-------|----------|
| Daily Update | 19:00 Mon-Fri | CDI, SELIC, PTAX, TR | BRT |
| Monthly Update | 10th at 10:00 | IPCA, IGPM | BRT |
| Stale Check | Every 4 hours | All | BRT |

#### Class: RateScheduler

```python
class RateScheduler:
    def __init__(
        self,
        settings: Optional[Settings] = None,
        data_store: Optional[DataStore] = None,
        anomaly_detector: Optional[AnomalyDetector] = None,
    ):
        """Initialize scheduler with dependencies."""

    def setup_jobs(self) -> None:
        """Configure scheduled jobs."""

    async def update_daily_rates(self) -> Dict[str, Any]:
        """Update daily rates (CDI, SELIC, PTAX, TR)."""

    async def update_monthly_rates(self) -> Dict[str, Any]:
        """Update monthly rates (IPCA, IGPM)."""

    async def update_all_rates(self) -> Dict[str, Any]:
        """Update all rates (manual trigger)."""

    async def check_stale_rates(self) -> Dict[str, bool]:
        """Check for stale data and log alerts."""

    async def start(self) -> None:
        """Start the scheduler."""

    async def stop(self) -> None:
        """Gracefully stop the scheduler."""

    def get_jobs(self) -> List[Dict[str, Any]]:
        """Get all scheduled jobs."""
```

#### CLI Usage

```bash
# Run scheduler daemon
python scheduler.py start

# Manual update (all rates)
python scheduler.py run-once

# Update specific rates
python scheduler.py run-once --rates CDI,SELIC

# Show job schedule
python scheduler.py status

# JSON output
python scheduler.py status --json
```

---

### 4.5 Data Store

**Location:** `/backend/services/data_store.py`

#### Purpose

SQLite-based persistence for rate history, anomaly logs, and update tracking.

#### Database Schema

```sql
-- Rate data fetched from BCB
CREATE TABLE rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate_type TEXT NOT NULL,
    answer INTEGER NOT NULL,
    raw_value REAL NOT NULL,
    real_world_date INTEGER NOT NULL,
    bcb_timestamp DATETIME NOT NULL,
    fetch_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT NOT NULL,
    UNIQUE(rate_type, real_world_date)
);

-- Oracle blockchain transactions
CREATE TABLE oracle_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate_type TEXT NOT NULL,
    tx_hash TEXT,
    block_number INTEGER,
    gas_used INTEGER,
    status TEXT NOT NULL,
    error_message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Detected anomalies
CREATE TABLE anomalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate_type TEXT NOT NULL,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    anomaly_type TEXT NOT NULL,
    current_value REAL,
    expected_range_low REAL,
    expected_range_high REAL,
    std_devs REAL,
    message TEXT
);

-- Scheduler job runs
CREATE TABLE scheduler_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    status TEXT NOT NULL,
    rates_processed INTEGER DEFAULT 0,
    rates_updated INTEGER DEFAULT 0,
    error_message TEXT
);
```

#### Class: DataStore

```python
class DataStore:
    def __init__(self, db_path: str = "data/rates.db"):
        """Initialize data store."""

    async def initialize(self) -> None:
        """Create database tables if they don't exist."""

    # Rate operations
    async def store_rate(self, rate_data: Any) -> int
    async def get_rate_history(self, rate_type: str, days: int = 30) -> List[StoredRate]
    async def get_latest_rate(self, rate_type: str) -> Optional[StoredRate]

    # Oracle update logging
    async def log_oracle_update(
        self, rate_type: str, tx_hash: Optional[str],
        block_number: Optional[int], gas_used: Optional[int],
        status: str, error_message: Optional[str] = None
    ) -> int

    # Anomaly logging
    async def log_anomaly(
        self, rate_type: str, anomaly_type: str, current_value: float,
        expected_low: float, expected_high: float, std_devs: float, message: str
    ) -> int
    async def get_anomalies(
        self, rate_type: Optional[str] = None, days: int = 7, limit: int = 100
    ) -> List[Anomaly]

    # Scheduler run logging
    async def log_scheduler_run(self, job_id: str, started_at: datetime, status: str = "running") -> int
    async def update_scheduler_run(
        self, job_id: str, ended_at: datetime, status: str,
        rates_processed: int = 0, rates_updated: int = 0, error_message: Optional[str] = None
    ) -> None

    # Statistics
    async def get_stats(self) -> Dict[str, Any]
```

---

### 4.6 Anomaly Detector

**Location:** `/backend/services/anomaly_detector.py`

#### Purpose

Statistical anomaly detection for rate changes. Anomalies are logged but do NOT block updates (monitoring only).

#### Detection Types

| Type | Description | Trigger |
|------|-------------|---------|
| Value Spike | Rate value > N standard deviations from mean | z-score > threshold |
| Stale Data | Data age exceeds heartbeat threshold | age > heartbeat |
| Velocity | Rate of change exceeds threshold | daily change > 50% |

#### Class: AnomalyDetector

```python
class AnomalyDetector:
    def __init__(
        self,
        std_threshold: float = 3.0,      # Std devs to flag as anomaly
        lookback_days: int = 30,         # Historical window
        velocity_threshold: float = 0.5, # Max daily change (50%)
        min_history_size: int = 5,       # Minimum history for stats
    ):
        """Initialize anomaly detector."""

    def detect_value_anomaly(
        self, current_value: float, historical_values: List[float]
    ) -> AnomalyResult:
        """Detect if current value is statistically anomalous."""

    def detect_stale_data(
        self, last_update: datetime, heartbeat_seconds: int
    ) -> AnomalyResult:
        """Detect if data is stale."""

    def detect_velocity_anomaly(
        self, current_value: float, previous_value: float, time_delta_hours: float = 24
    ) -> AnomalyResult:
        """Detect abnormal rate of change."""

    def run_all_checks(
        self, current_value: float, historical_values: List[float],
        last_update: Optional[datetime] = None, heartbeat_seconds: Optional[int] = None,
        previous_value: Optional[float] = None, time_delta_hours: float = 24
    ) -> List[AnomalyResult]:
        """Run all applicable anomaly checks."""
```

#### AnomalyResult

```python
@dataclass
class AnomalyResult:
    is_anomaly: bool
    anomaly_type: Optional[str]  # 'value_spike', 'stale_data', 'velocity'
    current_value: float
    mean: float
    std_dev: float
    z_score: float
    message: str

    @property
    def severity(self) -> str:
        """Get severity level based on z_score."""
        if not self.is_anomaly:
            return "normal"
        if self.z_score > 5:
            return "critical"
        if self.z_score > 4:
            return "high"
        return "medium"
```

---

## 5. Frontend Application

**Location:** `/frontend/`
**Framework:** Next.js 14 (App Router)
**Styling:** Tailwind CSS
**Wallet:** RainbowKit + wagmi

### Project Structure

```
frontend/
├── app/
│   ├── layout.tsx        # Root layout with providers
│   ├── page.tsx          # Oracle dashboard
│   ├── issue/
│   │   └── page.tsx      # Debenture issuance form
│   ├── portfolio/
│   │   └── page.tsx      # Portfolio management
│   └── providers.tsx     # React Query + wagmi providers
├── components/
│   ├── debenture/
│   │   ├── IssueForm.tsx     # Debenture creation form
│   │   └── PortfolioList.tsx # Portfolio display
│   └── oracle/
│       ├── RateCard.tsx      # Individual rate display
│       └── RateDashboard.tsx # All rates dashboard
├── lib/
│   ├── api.ts            # Backend API client
│   ├── contracts.ts      # Contract addresses and ABIs
│   └── wagmi.ts          # Web3 configuration
└── tailwind.config.ts
```

### Key Components

#### RateDashboard

Displays real-time Brazilian macro rates from the oracle.

```tsx
// /frontend/components/oracle/RateDashboard.tsx
export function RateDashboard() {
  const { data: ratesResponse, isLoading, error } = useQuery({
    queryKey: ['rates'],
    queryFn: () => ratesAPI.getAll(),
    refetchInterval: 60000, // Refresh every minute
  });

  // Renders grid of RateCard components
}
```

#### IssueForm

Form for creating new tokenized debentures.

```tsx
// /frontend/components/debenture/IssueForm.tsx
const issueSchema = z.object({
  name: z.string().min(3),
  symbol: z.string().min(2).max(10),
  isinCode: z.string().length(12),
  vne: z.number().positive(),
  totalSupply: z.number().positive().int(),
  maturityYears: z.number().min(1).max(30),
  rateType: z.enum(['PRE', 'DI_SPREAD', 'DI_PERCENT', 'IPCA_SPREAD', 'IGPM_SPREAD']),
  spread: z.number().min(0).max(100),
});
```

### Configuration

#### Environment Variables

```env
# .env.local
NEXT_PUBLIC_ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
NEXT_PUBLIC_FACTORY_ADDRESS=0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
```

#### Wallet Configuration

```typescript
// /frontend/lib/wagmi.ts
export const config = createConfig({
  chains: [arbitrumSepolia],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
});
```

---

## 6. Developer Guide

### Prerequisites

- Node.js 18+
- Python 3.10+
- Git
- An Arbitrum Sepolia wallet with ETH for gas

### Installation

#### Clone Repository

```bash
git clone https://github.com/your-org/delos-oracle.git
cd delos-oracle
```

#### Smart Contracts Setup

```bash
cd contracts
npm install
cp .env.example .env
# Edit .env with your PRIVATE_KEY and RPC URL
npx hardhat compile
npx hardhat test
```

#### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your configuration
```

#### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with contract addresses
npm run dev
```

### Running the Stack

#### Terminal 1: Backend API

```bash
cd backend
source venv/bin/activate
python api.py
# API available at http://localhost:8000
# Swagger docs at http://localhost:8000/docs
```

#### Terminal 2: Scheduler (Optional)

```bash
cd backend
source venv/bin/activate
python scheduler.py start
```

#### Terminal 3: Frontend

```bash
cd frontend
npm run dev
# App available at http://localhost:3000
```

### Testing

#### Smart Contract Tests

```bash
cd contracts
npx hardhat test
npx hardhat coverage
```

#### Backend Tests (Manual)

```bash
cd backend

# Test BCB client
python bcb_client.py

# Test oracle updater
python oracle_updater.py status
python oracle_updater.py check

# Test API
curl http://localhost:8000/health
curl http://localhost:8000/rates
```

### Development Workflow

1. **Make changes** to smart contracts or backend code
2. **Run tests** to ensure nothing is broken
3. **Deploy** contracts to testnet if needed
4. **Update** frontend contract addresses if deployed
5. **Test** end-to-end flow

---

## 7. Deployment Guide

### Smart Contract Deployment

#### Deploy Oracle

```bash
cd contracts
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```

**deploy.ts** deploys:
1. BrazilianMacroOracle
2. Grants UPDATER_ROLE to deployer

#### Deploy Debenture System

```bash
# Deploy implementation contract
npx hardhat run scripts/deploy-clone-factory.ts --network arbitrumSepolia
```

**deploy-clone-factory.ts** deploys:
1. BrazilianDebentureCloneable (implementation)
2. DebentureCloneFactory (pointing to implementation and oracle)

### Backend Deployment

#### Docker (Recommended)

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t delos-backend .
docker run -d -p 8000:8000 --env-file .env delos-backend
```

#### Systemd Service

```ini
[Unit]
Description=DELOS Backend API
After=network.target

[Service]
User=delos
WorkingDirectory=/opt/delos/backend
Environment="PATH=/opt/delos/backend/venv/bin"
ExecStart=/opt/delos/backend/venv/bin/uvicorn api:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

### Frontend Deployment

#### Vercel (Recommended)

```bash
cd frontend
vercel deploy
```

Set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_ORACLE_ADDRESS`
- `NEXT_PUBLIC_FACTORY_ADDRESS`
- `NEXT_PUBLIC_BACKEND_API_URL`

---

## 8. Integration Examples

### Reading Oracle from Smart Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBrazilianMacroOracle {
    function getRate(string calldata rateType)
        external view returns (int256 answer, uint256 timestamp, uint256 realWorldDate);

    function latestRoundData(string calldata rateType)
        external view returns (
            uint80 roundId, int256 answer, uint256 startedAt,
            uint256 updatedAt, uint80 answeredInRound
        );
}

contract YieldCalculator {
    IBrazilianMacroOracle public oracle;

    constructor(address _oracle) {
        oracle = IBrazilianMacroOracle(_oracle);
    }

    function getIPCASpreadYield(uint256 spreadBps) external view returns (int256) {
        (int256 ipca,,) = oracle.getRate("IPCA");
        // ipca is in 8 decimals, spreadBps in basis points
        int256 spreadScaled = int256(spreadBps) * 1e4; // Convert bps to 8 decimals
        return ipca + spreadScaled;
    }
}
```

### Fetching Rates from JavaScript

```javascript
import { ethers } from 'ethers';

const ORACLE_ADDRESS = '0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe';
const ORACLE_ABI = [
  'function getRate(string calldata rateType) external view returns (int256 answer, uint256 timestamp, uint256 realWorldDate)',
  'function latestRoundData(string calldata rateType) external view returns (uint80, int256, uint256, uint256, uint80)',
];

async function getRates() {
  const provider = new ethers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc');
  const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);

  const [cdiAnswer, cdiTimestamp, cdiDate] = await oracle.getRate('CDI');
  console.log(`CDI: ${Number(cdiAnswer) / 1e8}% (${cdiDate})`);

  const rates = ['IPCA', 'CDI', 'SELIC', 'PTAX', 'IGPM', 'TR'];
  for (const rate of rates) {
    const [answer] = await oracle.getRate(rate);
    console.log(`${rate}: ${Number(answer) / 1e8}`);
  }
}
```

### Creating a Debenture from JavaScript

```javascript
import { ethers } from 'ethers';

const FACTORY_ADDRESS = '0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f';

async function createDebenture(signer) {
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);

  const terms = {
    vne: ethers.parseUnits('1000', 6),
    totalSupplyUnits: 1000n,
    issueDate: BigInt(Math.floor(Date.now() / 1000)),
    maturityDate: BigInt(Math.floor(Date.now() / 1000) + 2 * 365 * 86400),
    anniversaryDay: 15,
    lockUpEndDate: BigInt(Math.floor(Date.now() / 1000) + 30 * 86400),
    rateType: 3, // IPCA_SPREAD
    fixedRate: 50000n, // 5%
    percentDI: 100,
    couponFrequencyDays: 180n,
    amortType: 0,
    isinCode: 'BRTEST000001',
    cetipCode: '',
    series: '1a Serie',
    hasRepactuacao: false,
    hasEarlyRedemption: false,
    comboId: ethers.ZeroHash,
  };

  const tx = await factory.createDebenture(
    'Test Debenture IPCA+ 2026',
    'TEST26',
    terms,
    paymentTokenAddress,
    trusteeAddress
  );

  const receipt = await tx.wait();
  const event = receipt.logs.find(log => log.fragment?.name === 'DebentureCreated');
  console.log(`Debenture deployed at: ${event.args.debentureAddress}`);
}
```

### Using the REST API

```python
import httpx

API_URL = "http://localhost:8000"

async def get_rates():
    async with httpx.AsyncClient() as client:
        # Get all rates
        response = await client.get(f"{API_URL}/rates")
        rates = response.json()

        for rate in rates:
            print(f"{rate['rate_type']}: {rate['raw_value']}% (stale: {rate['is_stale']})")

        # Get specific rate
        cdi = await client.get(f"{API_URL}/rates/CDI")
        print(f"CDI: {cdi.json()['raw_value']}%")

        # Get history
        history = await client.get(f"{API_URL}/rates/IPCA/history?days=30")
        print(f"IPCA history: {history.json()['count']} records")
```

---

## 9. Troubleshooting

### Common Issues

#### "ORACLE_ADDRESS not set"

**Cause:** Environment variable not configured.

**Solution:**
```bash
# Backend
export ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe

# Or in .env file
ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
```

#### "ABI not found"

**Cause:** Smart contracts not compiled.

**Solution:**
```bash
cd contracts
npx hardhat compile
```

#### BCB API Rate Limit

**Cause:** Too many requests to BCB API.

**Solution:** The BCB client has built-in retry with exponential backoff. If issues persist, reduce request frequency in scheduler settings.

#### Transaction Reverted: "SameDateUpdate"

**Cause:** Trying to update a rate with the same date as existing.

**Solution:** This is expected behavior. The oracle skips same-date updates to save gas. Use `--force` flag to bypass (contract will still skip).

#### "Not authorized issuer"

**Cause:** Wallet not authorized to create debentures.

**Solution:**
```javascript
// Factory owner must authorize
await factory.setAuthorizedIssuer(issuerAddress, true);
```

#### Frontend: "Failed to load rates"

**Causes:**
1. Backend API not running
2. CORS not configured
3. Wrong API URL

**Solutions:**
```bash
# 1. Start backend
cd backend && python api.py

# 2. Check CORS in backend (should be configured)
# 3. Verify NEXT_PUBLIC_BACKEND_API_URL in .env.local
```

### Debugging Tips

#### Check Oracle State

```bash
cd backend
python oracle_updater.py status
```

#### Check Scheduler Jobs

```bash
cd backend
python scheduler.py status
```

#### Check API Health

```bash
curl http://localhost:8000/health
```

#### Check Database Stats

```bash
curl http://localhost:8000/stats
```

#### View Recent Anomalies

```bash
curl http://localhost:8000/anomalies
```

---

## 10. Appendices

### A. Contract ABIs

Contract ABIs are available in:
- `/contracts/artifacts/contracts/BrazilianMacroOracle.sol/BrazilianMacroOracle.json`
- `/contracts/artifacts/contracts/DebentureCloneFactory.sol/DebentureCloneFactory.json`
- `/contracts/artifacts/contracts/BrazilianDebentureCloneable.sol/BrazilianDebentureCloneable.json`

### B. BCB API Reference

**Base URL:** `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series}/dados`

**Endpoints:**
- Latest N records: `/ultimos/{N}?formato=json`
- Date range: `?formato=json&dataInicial={DD/MM/YYYY}&dataFinal={DD/MM/YYYY}`

**Response Format:**
```json
[
  {"data": "26/11/2024", "valor": "10.90"}
]
```

### C. Rate Configuration Reference

| Rate | Series | Decimals | Heartbeat | Min | Max | Frequency |
|------|--------|----------|-----------|-----|-----|-----------|
| IPCA | 433 | 8 | 35 days | -10% | 100% | Monthly |
| CDI | 12 | 8 | 2 days | 0% | 50% | Daily |
| SELIC | 432 | 8 | 2 days | 0% | 50% | Daily |
| PTAX | 1 | 8 | 2 days | 1.0 | 15.0 | Daily |
| IGPM | 189 | 8 | 35 days | -10% | 100% | Monthly |
| TR | 226 | 8 | 2 days | 0% | 50% | Daily |

### D. Environment Variables Reference

#### Backend (`/backend/.env`)

```env
# BCB API
BCB_API_TIMEOUT=30.0
BCB_MAX_RETRIES=3
BCB_RETRY_BASE_DELAY=1.0
BCB_RETRY_MAX_DELAY=60.0

# Oracle Contract
ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
PRIVATE_KEY=your_private_key_here
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Scheduler
DAILY_UPDATE_HOUR=19
DAILY_UPDATE_MINUTE=0
MONTHLY_UPDATE_DAY=10

# Anomaly Detection
ANOMALY_STD_THRESHOLD=3.0
ANOMALY_LOOKBACK_DAYS=30
ANOMALY_VELOCITY_THRESHOLD=0.5

# Data Storage
DATABASE_PATH=data/rates.db

# API
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=*

# Logging
LOG_LEVEL=INFO
LOG_JSON_FORMAT=true

# Alerting (optional)
SLACK_WEBHOOK_URL=
ALERT_EMAIL=
```

#### Frontend (`/frontend/.env.local`)

```env
NEXT_PUBLIC_ORACLE_ADDRESS=0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe
NEXT_PUBLIC_FACTORY_ADDRESS=0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
```

### E. Glossary

| Term | Definition |
|------|------------|
| **ANBIMA** | Brazilian Financial and Capital Markets Association |
| **BCB** | Banco Central do Brasil (Brazilian Central Bank) |
| **CDI** | Certificado de Deposito Interbancario (Interbank Deposit Certificate) |
| **CETIP** | Central de Custodia e Liquidacao Financeira de Titulos (Brazilian clearing house) |
| **EIP-1167** | Minimal proxy contract standard for gas-efficient cloning |
| **ERC-1404** | Security token standard with transfer restrictions |
| **ERC-20** | Standard interface for fungible tokens |
| **IGPM** | Indice Geral de Precos do Mercado (General Market Price Index) |
| **IPCA** | Indice Nacional de Precos ao Consumidor Amplo (Consumer Price Index) |
| **ISIN** | International Securities Identification Number |
| **PTAX** | Official USD/BRL exchange rate published by BCB |
| **SELIC** | Sistema Especial de Liquidacao e Custodia (Brazilian base interest rate) |
| **TR** | Taxa Referencial (Reference Rate for savings accounts) |
| **VNA** | Valor Nominal Atualizado (Updated Face Value) |
| **VNE** | Valor Nominal de Emissao (Original Face Value at Issuance) |

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | Dec 2024 | DELOS Team | Initial comprehensive documentation |

---

*This documentation was generated for the DELOS Brazilian Macro Oracle Platform. For questions or support, please open an issue on the project repository.*
