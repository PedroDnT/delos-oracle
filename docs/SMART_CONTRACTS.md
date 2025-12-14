# DELOS Smart Contract Documentation

## Overview

This document provides comprehensive documentation for the DELOS smart contract system, including contract interfaces, ABIs, deployment addresses, and integration guides.

## Deployed Contracts (Arbitrum Sepolia)

| Contract | Address | Purpose |
|----------|---------|---------|
| BrazilianMacroOracle | `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe` | BCB rate feed oracle |
| BrazilianDebentureCloneable | `0x8856dd1f536169B8A82D8DA5476F9765b768f51D` | Debenture implementation |
| DebentureCloneFactory | `0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f` | Debenture factory |

**Network Details:**
- Chain ID: 421614
- RPC URL: `https://sepolia-rollup.arbitrum.io/rpc`
- Block Explorer: `https://sepolia.arbiscan.io`

---

## BrazilianMacroOracle

### Overview

On-chain storage for Brazilian macroeconomic indicators with Chainlink AggregatorV3Interface compatibility.

**Contract Address:** `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe`

### Value Encoding

All values use Chainlink's 8-decimal standard:

```
Encoding Formula: answer = raw_value * 10^8

Examples:
  4.50% interest rate  -> 450,000,000   (4.5 * 10^8)
  10.90% CDI rate      -> 1,090,000,000 (10.9 * 10^8)
  5.81 BRL/USD         -> 581,000,000   (5.81 * 10^8)
  -0.25% deflation     -> -25,000,000   (-0.25 * 10^8)
```

### Supported Rates

| Rate | BCB Series | Type | Heartbeat | Min Value | Max Value |
|------|-----------|------|-----------|-----------|-----------|
| IPCA | 433 | Inflation % | 35 days | -10% | 100% |
| CDI | 12 | Interest Rate | 2 days | 0% | 50% |
| SELIC | 432 | Interest Rate | 2 days | 0% | 50% |
| PTAX | 1 | FX Rate | 2 days | 1.0 | 15.0 |
| IGPM | 189 | Inflation % | 35 days | -10% | 100% |
| TR | 226 | Interest Rate | 2 days | 0% | 50% |

### Solidity Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBrazilianMacroOracle {
    // ============ Structs ============

    struct RateData {
        int256 answer;          // Rate scaled by 10^8
        uint256 timestamp;      // Block timestamp
        uint256 realWorldDate;  // YYYYMMDD format
        string source;          // Data source (e.g., "BCB-433")
        address updater;        // Address that performed update
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

    // ============ Events ============

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

    // ============ View Functions ============

    function getRate(string calldata rateType)
        external view returns (int256 answer, uint256 timestamp, uint256 realWorldDate);

    function getRateFull(string calldata rateType)
        external view returns (RateData memory);

    function getRateHistory(string calldata rateType, uint256 count)
        external view returns (RateData[] memory);

    function getRateMetadata(string calldata rateType)
        external view returns (RateMetadata memory);

    function getSupportedRates() external view returns (string[] memory);

    function getSupportedRatesCount() external view returns (uint256);

    function isRateStale(string calldata rateType) external view returns (bool);

    // ============ Chainlink Compatibility ============

    function latestRoundData(string calldata rateType)
        external view returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function decimals(string calldata rateType) external view returns (uint8);

    function description(string calldata rateType) external view returns (string memory);

    function version() external pure returns (uint256);

    // ============ Helper Functions ============

    function answerToPercentage(int256 answer)
        external pure returns (int256 whole, uint256 fractional);
}
```

### ABI (Essential Functions)

```json
[
  {
    "inputs": [{"internalType": "string", "name": "rateType", "type": "string"}],
    "name": "getRate",
    "outputs": [
      {"internalType": "int256", "name": "answer", "type": "int256"},
      {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
      {"internalType": "uint256", "name": "realWorldDate", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "string", "name": "rateType", "type": "string"}],
    "name": "latestRoundData",
    "outputs": [
      {"internalType": "uint80", "name": "roundId", "type": "uint80"},
      {"internalType": "int256", "name": "answer", "type": "int256"},
      {"internalType": "uint256", "name": "startedAt", "type": "uint256"},
      {"internalType": "uint256", "name": "updatedAt", "type": "uint256"},
      {"internalType": "uint80", "name": "answeredInRound", "type": "uint80"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "string", "name": "rateType", "type": "string"}],
    "name": "isRateStale",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getSupportedRates",
    "outputs": [{"internalType": "string[]", "name": "", "type": "string[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "string", "name": "rateType", "type": "string"}],
    "name": "decimals",
    "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  }
]
```

### Usage Examples

#### JavaScript/ethers.js

```javascript
import { ethers } from 'ethers';

const ORACLE_ADDRESS = '0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe';
const ORACLE_ABI = [
  'function getRate(string) view returns (int256, uint256, uint256)',
  'function latestRoundData(string) view returns (uint80, int256, uint256, uint256, uint80)',
  'function isRateStale(string) view returns (bool)',
  'function getSupportedRates() view returns (string[])',
];

async function main() {
  const provider = new ethers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc');
  const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);

  // Get CDI rate
  const [cdiAnswer, cdiTimestamp, cdiDate] = await oracle.getRate('CDI');
  console.log(`CDI: ${Number(cdiAnswer) / 1e8}%`);
  console.log(`Date: ${cdiDate}`);
  console.log(`Timestamp: ${new Date(Number(cdiTimestamp) * 1000)}`);

  // Check if stale
  const isStale = await oracle.isRateStale('CDI');
  console.log(`Is stale: ${isStale}`);

  // Get all supported rates
  const rates = await oracle.getSupportedRates();
  console.log('Supported rates:', rates);

  // Chainlink-compatible call
  const roundData = await oracle.latestRoundData('IPCA');
  console.log(`IPCA: ${Number(roundData[1]) / 1e8}%`);
}
```

#### Solidity Integration

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBrazilianMacroOracle {
    function getRate(string calldata rateType)
        external view returns (int256 answer, uint256 timestamp, uint256 realWorldDate);
}

contract IPCAIndexedBond {
    IBrazilianMacroOracle public immutable oracle;
    uint256 public constant PRECISION = 1e8;

    constructor(address _oracle) {
        oracle = IBrazilianMacroOracle(_oracle);
    }

    function getCurrentIPCA() public view returns (int256) {
        (int256 answer,,) = oracle.getRate("IPCA");
        return answer;
    }

    function calculateIndexedValue(uint256 principal, uint256 spreadBps) public view returns (uint256) {
        (int256 ipca,,) = oracle.getRate("IPCA");

        // IPCA is already in 8 decimals, spreadBps needs conversion
        // spreadBps: 500 = 5% = 5e6 in 8 decimals
        int256 spreadScaled = int256(spreadBps) * 1e4;

        int256 totalRate = ipca + spreadScaled;

        // Calculate indexed value
        // principal * (1 + rate/100)
        if (totalRate >= 0) {
            return principal + (principal * uint256(totalRate)) / (100 * PRECISION);
        } else {
            return principal - (principal * uint256(-totalRate)) / (100 * PRECISION);
        }
    }
}
```

---

## DebentureCloneFactory

### Overview

Factory contract for gas-efficient deployment of Brazilian debentures using the EIP-1167 minimal proxy pattern.

**Contract Address:** `0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f`

### Benefits of Clone Pattern

| Metric | Full Deployment | Clone Deployment |
|--------|-----------------|------------------|
| Bytecode Size | ~29KB | ~45 bytes |
| Gas Cost | ~3M gas | ~45K gas |
| Cost Savings | - | ~98% |

### Solidity Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDebentureCloneFactory {
    // ============ Events ============

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
    event DefaultPaymentTokenUpdated(address indexed oldToken, address indexed newToken);

    // ============ State Variables ============

    function implementation() external view returns (address);
    function oracle() external view returns (address);
    function defaultPaymentToken() external view returns (address);

    // ============ Factory Functions ============

    function createDebenture(
        string calldata name,
        string calldata symbol,
        BrazilianDebentureCloneable.DebentureTerms calldata terms,
        address paymentToken,
        address trustee
    ) external returns (address debentureAddress);

    function createDeterministicDebenture(
        string calldata name,
        string calldata symbol,
        BrazilianDebentureCloneable.DebentureTerms calldata terms,
        address paymentToken,
        address trustee,
        bytes32 salt
    ) external returns (address debentureAddress);

    function predictDeterministicAddress(bytes32 salt) external view returns (address);

    // ============ Admin Functions ============

    function setAuthorizedIssuer(address issuer, bool authorized) external;
    function batchAuthorizeIssuers(address[] calldata issuers) external;
    function setOracle(address _oracle) external;
    function setDefaultPaymentToken(address _token) external;

    // ============ View Functions ============

    function getAllDebentures() external view returns (address[] memory);
    function getIssuerDebentures(address issuer) external view returns (address[] memory);
    function getTotalDebentures() external view returns (uint256);
    function isinExists(string calldata isinCode) external view returns (bool);
    function debenturesByISIN(string calldata isinCode) external view returns (address);
    function authorizedIssuers(address issuer) external view returns (bool);
}
```

### ABI (Essential Functions)

```json
[
  {
    "inputs": [
      {"internalType": "string", "name": "name", "type": "string"},
      {"internalType": "string", "name": "symbol", "type": "string"},
      {
        "components": [
          {"internalType": "uint256", "name": "vne", "type": "uint256"},
          {"internalType": "uint256", "name": "totalSupplyUnits", "type": "uint256"},
          {"internalType": "uint256", "name": "issueDate", "type": "uint256"},
          {"internalType": "uint256", "name": "maturityDate", "type": "uint256"},
          {"internalType": "uint8", "name": "anniversaryDay", "type": "uint8"},
          {"internalType": "uint256", "name": "lockUpEndDate", "type": "uint256"},
          {"internalType": "enum BrazilianDebentureCloneable.RateType", "name": "rateType", "type": "uint8"},
          {"internalType": "uint256", "name": "fixedRate", "type": "uint256"},
          {"internalType": "uint8", "name": "percentDI", "type": "uint8"},
          {"internalType": "uint256", "name": "couponFrequencyDays", "type": "uint256"},
          {"internalType": "enum BrazilianDebentureCloneable.AmortizationType", "name": "amortType", "type": "uint8"},
          {"internalType": "string", "name": "isinCode", "type": "string"},
          {"internalType": "string", "name": "cetipCode", "type": "string"},
          {"internalType": "string", "name": "series", "type": "string"},
          {"internalType": "bool", "name": "hasRepactuacao", "type": "bool"},
          {"internalType": "bool", "name": "hasEarlyRedemption", "type": "bool"},
          {"internalType": "bytes32", "name": "comboId", "type": "bytes32"}
        ],
        "internalType": "struct BrazilianDebentureCloneable.DebentureTerms",
        "name": "terms",
        "type": "tuple"
      },
      {"internalType": "address", "name": "paymentToken", "type": "address"},
      {"internalType": "address", "name": "trustee", "type": "address"}
    ],
    "name": "createDebenture",
    "outputs": [{"internalType": "address", "name": "debentureAddress", "type": "address"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAllDebentures",
    "outputs": [{"internalType": "address[]", "name": "", "type": "address[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "string", "name": "isinCode", "type": "string"}],
    "name": "debenturesByISIN",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
]
```

### Usage Example

```javascript
import { ethers } from 'ethers';

const FACTORY_ADDRESS = '0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f';

async function createDebenture(signer, paymentTokenAddress) {
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);

  const now = BigInt(Math.floor(Date.now() / 1000));

  const terms = {
    vne: ethers.parseUnits('1000', 6),              // R$ 1,000.00
    totalSupplyUnits: 1000n,                         // 1000 units
    issueDate: now,
    maturityDate: now + BigInt(2 * 365 * 86400),     // 2 years
    anniversaryDay: 15,
    lockUpEndDate: now + BigInt(30 * 86400),         // 30 days lock-up
    rateType: 3,                                     // IPCA_SPREAD
    fixedRate: 50000n,                               // 5% spread (4 decimals)
    percentDI: 100,
    couponFrequencyDays: 180n,                       // Semi-annual
    amortType: 0,                                    // PERCENT_VNE
    isinCode: 'BRTEST000001',                        // 12 characters
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
    signer.address  // Trustee = deployer
  );

  const receipt = await tx.wait();

  // Extract deployed address from event
  const event = receipt.logs.find(
    log => log.fragment?.name === 'DebentureCreated'
  );

  console.log(`Debenture deployed at: ${event.args.debentureAddress}`);
  return event.args.debentureAddress;
}
```

---

## BrazilianDebentureCloneable

### Overview

Cloneable ERC-20 token representing Brazilian debentures with ERC-1404 transfer restrictions, oracle integration, and coupon distribution.

**Implementation Address:** `0x8856dd1f536169B8A82D8DA5476F9765b768f51D`

### Standards

- **ERC-20**: Fungible token standard
- **ERC-1404**: Security token transfer restrictions
- **ERC-165**: Interface detection
- **OpenZeppelin**: AccessControl, ReentrancyGuard, Pausable, Initializable

### Enums

```solidity
enum RateType {
    PRE,          // 0 - Fixed rate
    DI_SPREAD,    // 1 - DI + spread
    DI_PERCENT,   // 2 - Percentage of DI
    IPCA_SPREAD,  // 3 - IPCA + spread
    IGPM_SPREAD   // 4 - IGP-M + spread
}

enum AmortizationType {
    PERCENT_VNE,   // 0 - Percentage of original face value
    PERCENT_VNA,   // 1 - Percentage of updated face value
    FIXED_VALUE    // 2 - Fixed amount
}

enum DebentureStatus {
    ACTIVE,    // 0 - Normal operations
    MATURED,   // 1 - Reached maturity
    DEFAULTED, // 2 - In default
    REDEEMED   // 3 - Early redemption
}
```

### ERC-1404 Transfer Restriction Codes

| Code | Constant | Description |
|------|----------|-------------|
| 0 | SUCCESS | Transfer allowed |
| 1 | NOT_WHITELISTED | Sender or receiver not whitelisted |
| 2 | PAUSED | Transfers are paused |
| 3 | BLACKLISTED | Sender or receiver is blacklisted |
| 4 | LOCK_UP_PERIOD | Lock-up period still active |

### Solidity Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBrazilianDebentureCloneable {
    // ============ Structs ============

    struct DebentureTerms {
        uint256 vne;                    // Face value (6 decimals)
        uint256 totalSupplyUnits;       // Number of units
        uint256 issueDate;              // Issue timestamp
        uint256 maturityDate;           // Maturity timestamp
        uint8 anniversaryDay;           // IPCA anniversary day (1-31)
        uint256 lockUpEndDate;          // Lock-up end timestamp
        RateType rateType;              // Indexation type
        uint256 fixedRate;              // Fixed rate/spread (4 decimals)
        uint8 percentDI;                // % of DI (2 decimals)
        uint256 couponFrequencyDays;    // Coupon frequency
        AmortizationType amortType;     // Amortization basis
        string isinCode;                // ISIN (12 chars)
        string cetipCode;               // CETIP code
        string series;                  // Series identifier
        bool hasRepactuacao;            // Repactuation clause
        bool hasEarlyRedemption;        // Early redemption clause
        bytes32 comboId;                // Combo identifier
    }

    struct VNARecord {
        uint256 value;                  // Current VNA (6 decimals)
        uint256 lastUpdateDate;
        uint256 lastIndexValue;
        uint256 accumulatedFactor;      // Factor C (8 decimals)
    }

    struct CouponRecord {
        uint256 date;
        uint256 puPerUnit;              // PU per unit (6 decimals)
        uint256 totalAmount;
        bool distributed;
    }

    // ============ Events ============

    event DebentureInitialized(string indexed isinCode, uint256 vne, uint256 totalSupply, RateType rateType);
    event WhitelistUpdated(address indexed account, bool status);
    event BlacklistUpdated(address indexed account, bool status);
    event CouponRecorded(uint256 indexed couponIndex, uint256 puPerUnit, uint256 totalAmount);
    event CouponClaimed(address indexed holder, uint256 indexed couponIndex, uint256 amount);
    event AmortizationExecuted(uint256 indexed scheduleIndex, uint256 amount);
    event VNAUpdated(uint256 newValue, uint256 indexValue, uint256 factor);
    event StatusChanged(DebentureStatus oldStatus, DebentureStatus newStatus);

    // ============ ERC-1404 ============

    function detectTransferRestriction(address from, address to, uint256 amount) external view returns (uint8);
    function messageForTransferRestriction(uint8 restrictionCode) external pure returns (string memory);

    // ============ Whitelist ============

    function addToWhitelist(address account) external;
    function removeFromWhitelist(address account) external;
    function batchAddToWhitelist(address[] calldata accounts) external;
    function addToBlacklist(address account) external;
    function removeFromBlacklist(address account) external;
    function whitelist(address account) external view returns (bool);
    function blacklist(address account) external view returns (bool);

    // ============ Coupon ============

    function recordCoupon(uint256 puPerUnit, uint256 totalAmount) external;
    function claimCoupon(uint256 couponIndex) external;
    function claimAllCoupons() external;
    function getCouponCount() external view returns (uint256);
    function getPendingClaims(address holder) external view returns (uint256[] memory);

    // ============ Status ============

    function declareMaturity() external;
    function declareDefault() external;
    function earlyRedemption() external;
    function pause() external;
    function unpause() external;

    // ============ View Functions ============

    function getTerms() external view returns (DebentureTerms memory);
    function getVNA() external view returns (VNARecord memory);
    function status() external view returns (DebentureStatus);
    function issuer() external view returns (address);
    function trustee() external view returns (address);
}
```

### Role Permissions

| Role | Permissions |
|------|-------------|
| DEFAULT_ADMIN_ROLE | Grant/revoke roles |
| ADMIN_ROLE | Pause/unpause, manage blacklist |
| ISSUER_ROLE | Record coupons, execute amortization, early redemption |
| TRUSTEE_ROLE | Declare maturity/default |
| WHITELIST_ADMIN_ROLE | Add/remove whitelist |

### Usage Examples

#### Checking Transfer Restriction

```javascript
const debenture = new ethers.Contract(debentureAddress, DEBENTURE_ABI, provider);

// Check if transfer would be allowed
const restrictionCode = await debenture.detectTransferRestriction(
  fromAddress,
  toAddress,
  amount
);

if (restrictionCode !== 0) {
  const message = await debenture.messageForTransferRestriction(restrictionCode);
  console.log(`Transfer blocked: ${message}`);
}
```

#### Managing Whitelist

```javascript
const debenture = new ethers.Contract(debentureAddress, DEBENTURE_ABI, issuerSigner);

// Add to whitelist
await debenture.addToWhitelist(investorAddress);

// Batch add
await debenture.batchAddToWhitelist([investor1, investor2, investor3]);

// Check status
const isWhitelisted = await debenture.whitelist(investorAddress);
```

#### Recording and Claiming Coupons

```javascript
// Issuer records a coupon payment
const puPerUnit = ethers.parseUnits('50', 6);  // R$ 50.00 per unit
const totalAmount = ethers.parseUnits('50000', 6);  // Total R$ 50,000.00

await debenture.recordCoupon(puPerUnit, totalAmount);

// Holder claims their coupons
const pendingClaims = await debenture.getPendingClaims(holderAddress);
if (pendingClaims.length > 0) {
  await debenture.claimAllCoupons();
}
```

---

## Access Control

All contracts use OpenZeppelin's AccessControl for role-based permissions.

### BrazilianMacroOracle Roles

```solidity
bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
```

| Role | Permissions |
|------|-------------|
| DEFAULT_ADMIN_ROLE | Grant/revoke all roles |
| ADMIN_ROLE | Add/deactivate rates, pause/unpause, update bounds |
| UPDATER_ROLE | Update rate values |

### Granting Roles

```javascript
// Grant updater role
const UPDATER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPDATER_ROLE"));
await oracle.grantRole(UPDATER_ROLE, updaterAddress);

// Revoke role
await oracle.revokeRole(UPDATER_ROLE, oldUpdaterAddress);
```

---

## Events

### Subscribing to Events

```javascript
// Listen for rate updates
oracle.on('RateUpdated', (rateType, answer, realWorldDate, source, updater, timestamp) => {
  console.log(`Rate ${rateType} updated to ${Number(answer) / 1e8}`);
});

// Listen for debenture creation
factory.on('DebentureCreated', (address, isin, name, symbol, issuer, vne, totalSupply) => {
  console.log(`New debenture ${symbol} at ${address}`);
});

// Listen for coupon claims
debenture.on('CouponClaimed', (holder, couponIndex, amount) => {
  console.log(`${holder} claimed coupon ${couponIndex}: ${ethers.formatUnits(amount, 6)}`);
});
```

### Querying Historical Events

```javascript
// Get all rate updates for IPCA in the last 1000 blocks
const filter = oracle.filters.RateUpdated('IPCA');
const events = await oracle.queryFilter(filter, -1000);

for (const event of events) {
  console.log(`Block ${event.blockNumber}: ${Number(event.args.answer) / 1e8}%`);
}
```

---

## Gas Estimation

### Typical Gas Costs (Arbitrum Sepolia)

| Operation | Gas Used | Notes |
|-----------|----------|-------|
| updateRate | ~70,000 | Single rate update |
| batchUpdateRates (6 rates) | ~200,000 | All rates in one tx |
| createDebenture (clone) | ~250,000 | Via factory |
| addToWhitelist | ~50,000 | Per address |
| recordCoupon | ~80,000 | Per coupon |
| claimCoupon | ~60,000 | Per claim |
| claimAllCoupons (3 coupons) | ~150,000 | Batch claim |

### Estimating Gas

```javascript
// Estimate gas for rate update
const gasEstimate = await oracle.updateRate.estimateGas(
  'CDI',
  1090000000n,
  20241126n,
  'BCB-12'
);
console.log(`Estimated gas: ${gasEstimate}`);
```

---

## Error Handling

### Custom Errors

```solidity
// BrazilianMacroOracle errors
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

### Handling Errors in JavaScript

```javascript
try {
  await oracle.updateRate('INVALID', 1000000000n, 20241126n, 'TEST');
} catch (error) {
  if (error.data) {
    const decoded = oracle.interface.parseError(error.data);
    console.log(`Error: ${decoded.name}`, decoded.args);
  }
}
```

---

## Security Considerations

1. **Access Control**: Only authorized addresses can update rates or create debentures
2. **Circuit Breakers**: Rate values must be within configured bounds
3. **Same-Date Protection**: Prevents duplicate updates for the same BCB date
4. **Pausable**: Admin can pause operations in emergencies
5. **Transfer Restrictions**: ERC-1404 compliance for regulatory requirements
6. **Reentrancy Protection**: All external calls use ReentrancyGuard
7. **Safe Token Transfers**: Uses SafeERC20 for payment token operations

---

## Full ABI Files

Complete ABI files are available at:

- `/contracts/artifacts/contracts/BrazilianMacroOracle.sol/BrazilianMacroOracle.json`
- `/contracts/artifacts/contracts/DebentureCloneFactory.sol/DebentureCloneFactory.json`
- `/contracts/artifacts/contracts/BrazilianDebentureCloneable.sol/BrazilianDebentureCloneable.json`

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Dec 2024 | Initial contract deployment |
