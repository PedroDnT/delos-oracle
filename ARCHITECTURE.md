# DELOS Architecture Overview

## System Flow Diagram

```
                              DELOS PLATFORM ARCHITECTURE
    ═══════════════════════════════════════════════════════════════════════

                                 DATA LAYER
    ┌─────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │     ┌─────────────────────────────────────────────────────────┐     │
    │     │                 BANCO CENTRAL DO BRASIL                  │     │
    │     │                      (BCB API)                           │     │
    │     │                                                          │     │
    │     │   IPCA   CDI   SELIC   PTAX   IGPM   TR                 │     │
    │     │    │      │      │       │      │     │                  │     │
    │     └────┼──────┼──────┼───────┼──────┼─────┼──────────────────┘     │
    │          │      │      │       │      │     │                        │
    │          └──────┴──────┴───┬───┴──────┴─────┘                        │
    │                            │                                         │
    │                            ▼                                         │
    │     ┌─────────────────────────────────────────────────────────┐     │
    │     │                   BCB CLIENT (Python)                    │     │
    │     │                                                          │     │
    │     │  • Parallel fetching       • Retry with backoff         │     │
    │     │  • Response validation     • Rate normalization         │     │
    │     │                                                          │     │
    │     └─────────────────────────────────────────────────────────┘     │
    │                                                                      │
    └─────────────────────────────────────────────────────────────────────┘

                                  │
                                  │ HTTP/JSON
                                  ▼

                              SERVICE LAYER
    ┌─────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
    │  │  SCHEDULER  │  │   ORACLE    │  │    DATA     │  │  ANOMALY  │  │
    │  │             │  │   UPDATER   │  │    STORE    │  │ DETECTOR  │  │
    │  │ APScheduler │  │    Web3     │  │   SQLite    │  │  Stats    │  │
    │  │             │  │             │  │             │  │           │  │
    │  │ Daily 19:00 │──│ Push rates  │──│ Historical  │──│ Z-score   │  │
    │  │ Monthly 10th│  │ on-chain    │  │ persistence │  │ Velocity  │  │
    │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
    │                            │                                        │
    │                            │                                        │
    │  ┌─────────────────────────┴─────────────────────────────────────┐ │
    │  │                      REST API (FastAPI)                        │ │
    │  │                                                                │ │
    │  │   GET /rates        GET /health        POST /sync             │ │
    │  │   GET /rates/{type} GET /scheduler     GET /anomalies         │ │
    │  │                                                                │ │
    │  │                 http://localhost:8000                          │ │
    │  └────────────────────────────────────────────────────────────────┘ │
    │                                                                      │
    └─────────────────────────────────────────────────────────────────────┘

                                  │
                                  │ Web3 / RPC
                                  ▼

                             BLOCKCHAIN LAYER
    ┌─────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │                       ARBITRUM SEPOLIA                               │
    │                       ════════════════                               │
    │                                                                      │
    │  ┌─────────────────────────────────────────────────────────────┐   │
    │  │                  BRAZILIAN MACRO ORACLE                      │   │
    │  │                  ─────────────────────                       │   │
    │  │                                                              │   │
    │  │   ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐         │   │
    │  │   │IPCA │ │ CDI │ │SELIC│ │PTAX │ │IGPM │ │ TR  │         │   │
    │  │   │4.50%│ │11.2%│ │11.2%│ │5.95 │ │0.47%│ │0.09%│         │   │
    │  │   └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘         │   │
    │  │                                                              │   │
    │  │   Address: 0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe       │   │
    │  │   Interface: Chainlink AggregatorV3 compatible               │   │
    │  │                                                              │   │
    │  └─────────────────────────────────────────────────────────────┘   │
    │                              │                                      │
    │                              │ getRate()                            │
    │                              ▼                                      │
    │  ┌─────────────────────────────────────────────────────────────┐   │
    │  │                  DEBENTURE CLONE FACTORY                     │   │
    │  │                  ─────────────────────                       │   │
    │  │                                                              │   │
    │  │   ┌─────────────────┐          ┌─────────────────────┐      │   │
    │  │   │ IMPLEMENTATION  │◀─────────│      FACTORY        │      │   │
    │  │   │                 │          │                     │      │   │
    │  │   │ BrazilianDeben- │          │ DebentureClone-     │      │   │
    │  │   │ tureCloneable   │          │ Factory             │      │   │
    │  │   │                 │          │                     │      │   │
    │  │   │ 17,586 bytes    │          │ 6,691 bytes         │      │   │
    │  │   │                 │          │                     │      │   │
    │  │   │ 0x8856dd1f...   │          │ 0x946ca8D4...       │      │   │
    │  │   └────────┬────────┘          └──────────┬──────────┘      │   │
    │  │            │                              │                  │   │
    │  │            │         createDebenture()    │                  │   │
    │  │            │              ┌───────────────┘                  │   │
    │  │            │              │                                  │   │
    │  │            ▼              ▼                                  │   │
    │  │   ┌───────────────────────────────────────────────────┐     │   │
    │  │   │              DEBENTURE CLONES                      │     │   │
    │  │   │                                                    │     │   │
    │  │   │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  │     │   │
    │  │   │  │Clone 1 │  │Clone 2 │  │Clone 3 │  │Clone N │  │     │   │
    │  │   │  │ ~45 B  │  │ ~45 B  │  │ ~45 B  │  │ ~45 B  │  │     │   │
    │  │   │  │        │  │        │  │        │  │        │  │     │   │
    │  │   │  │ISIN:   │  │ISIN:   │  │ISIN:   │  │ISIN:   │  │     │   │
    │  │   │  │BRXXX001│  │BRXXX002│  │BRXXX003│  │BRXXXNNN│  │     │   │
    │  │   │  └────────┘  └────────┘  └────────┘  └────────┘  │     │   │
    │  │   │                                                    │     │   │
    │  │   │  Each clone delegates to implementation            │     │   │
    │  │   │  Storage is per-clone, code is shared              │     │   │
    │  │   │                                                    │     │   │
    │  │   └───────────────────────────────────────────────────┘     │   │
    │  │                                                              │   │
    │  └─────────────────────────────────────────────────────────────┘   │
    │                                                                      │
    └─────────────────────────────────────────────────────────────────────┘

                                  │
                                  │ wagmi / viem
                                  ▼

                            PRESENTATION LAYER
    ┌─────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │                         NEXT.JS 14 FRONTEND                          │
    │                         ═══════════════════                          │
    │                                                                      │
    │  ┌─────────────────────────────────────────────────────────────┐   │
    │  │                     NAVIGATION BAR                           │   │
    │  │  [DELOS]              Dashboard | Issue | Portfolio  [Connect]│   │
    │  └─────────────────────────────────────────────────────────────┘   │
    │                                                                      │
    │  ┌─────────────────────────────────────────────────────────────┐   │
    │  │                    ORACLE DASHBOARD (/)                      │   │
    │  │                                                              │   │
    │  │   ┌─────────┐ ┌─────────┐ ┌─────────┐                       │   │
    │  │   │  IPCA   │ │   CDI   │ │  SELIC  │                       │   │
    │  │   │  4.50%  │ │ 11.15%  │ │ 11.25%  │                       │   │
    │  │   │ Monthly │ │  Daily  │ │  Daily  │                       │   │
    │  │   └─────────┘ └─────────┘ └─────────┘                       │   │
    │  │   ┌─────────┐ ┌─────────┐ ┌─────────┐                       │   │
    │  │   │  PTAX   │ │  IGPM   │ │   TR    │                       │   │
    │  │   │  5.95   │ │  0.47%  │ │  0.09%  │                       │   │
    │  │   │  Daily  │ │ Monthly │ │  Daily  │                       │   │
    │  │   └─────────┘ └─────────┘ └─────────┘                       │   │
    │  │                                                              │   │
    │  └─────────────────────────────────────────────────────────────┘   │
    │                                                                      │
    │  ┌─────────────────────────────────────────────────────────────┐   │
    │  │                   ISSUE PAGE (/issue)                        │   │
    │  │                                                              │   │
    │  │   Name:     [Test Debenture IPCA+ 2026        ]             │   │
    │  │   Symbol:   [TEST26    ]   ISIN: [BRTEST000001]             │   │
    │  │   VNE:      [1000      ]   Supply: [10000     ]             │   │
    │  │   Maturity: [2 years   ]                                     │   │
    │  │   Rate:     [IPCA_SPREAD ▼]  Spread: [5.00%   ]             │   │
    │  │                                                              │   │
    │  │   [          CREATE DEBENTURE          ]                     │   │
    │  │                                                              │   │
    │  └─────────────────────────────────────────────────────────────┘   │
    │                                                                      │
    │  ┌─────────────────────────────────────────────────────────────┐   │
    │  │                PORTFOLIO PAGE (/portfolio)                   │   │
    │  │                                                              │   │
    │  │   Your Debentures:                                          │   │
    │  │   ┌─────────────────────────────────────────────────────┐  │   │
    │  │   │ PETR26      │ IPCA+5%  │ 1000 units │ View Details │  │   │
    │  │   ├─────────────────────────────────────────────────────┤  │   │
    │  │   │ TEST26      │ CDI+2%   │ 500 units  │ View Details │  │   │
    │  │   └─────────────────────────────────────────────────────┘  │   │
    │  │                                                              │   │
    │  └─────────────────────────────────────────────────────────────┘   │
    │                                                                      │
    │                      http://localhost:3000                           │
    │                                                                      │
    └─────────────────────────────────────────────────────────────────────┘
```

---

## Contract Interaction Flow

```
                        DEBENTURE CREATION FLOW
    ═══════════════════════════════════════════════════════════

    USER                    FACTORY                 CLONE
      │                        │                       │
      │  createDebenture()     │                       │
      │ ──────────────────────▶│                       │
      │  (name, symbol, terms) │                       │
      │                        │                       │
      │                        │  Clone.clone()        │
      │                        │──────────────────────▶│ Created!
      │                        │                       │ (~45 bytes)
      │                        │                       │
      │                        │  initialize()         │
      │                        │──────────────────────▶│ Initialized!
      │                        │                       │
      │                        │  Register in mappings │
      │                        │ ◀ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
      │                        │                       │
      │  Return clone address  │                       │
      │ ◀──────────────────────│                       │
      │                        │                       │
      │  Tokens minted to      │                       │
      │  issuer (msg.sender)   │                       │
      │                        │                       │


                          RATE QUERY FLOW
    ═══════════════════════════════════════════════════════════

    DEBENTURE              ORACLE                    BCB
        │                     │                       │
        │  getRate("IPCA")    │                       │
        │ ───────────────────▶│                       │
        │                     │                       │
        │  (value, timestamp, │                       │
        │   realWorldDate)    │                       │
        │ ◀───────────────────│                       │
        │                     │                       │
        │  Calculate coupon   │                       │
        │  with rate          │                       │
        │                     │                       │
        │                     │  Backend scheduler    │
        │                     │  updates rates        │
        │                     │ ◀─────────────────────│
        │                     │  (daily/monthly)      │
        │                     │                       │
```

---

## Economic Value Flows

### Flow 1: Debenture Issuance

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEBENTURE ISSUANCE FLOW                       │
└─────────────────────────────────────────────────────────────────┘

ISSUER
  │
  ├─► Pays gas (~$10-15)
  │
  ▼
FACTORY
  │
  ├─► Creates minimal proxy clone (~45 bytes)
  ├─► Mints total supply to issuer
  │
  └─► VALUE CREATED: 98% gas savings ($500 → $10)

      Traditional deployment: ~29KB, $500 gas
      DELOS deployment: ~45 bytes, $10 gas
```

### Flow 2: Coupon Payment Cycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    COUPON PAYMENT FLOW                           │
└─────────────────────────────────────────────────────────────────┘

BCB (Banco Central)
  │
  ├─► Publishes IPCA rate (free, monthly)
  │
  ▼
ORACLE UPDATER (Backend)
  │
  ├─► Fetches rate via BCB API
  ├─► Validates data
  ├─► Pays gas (~$2) to update oracle
  │
  ▼
ORACLE CONTRACT (On-Chain)
  │
  ├─► Stores rate with 8-decimal precision
  ├─► Available to all debentures
  │
  ▼
DEBENTURE CONTRACT
  │
  ├─► Queries oracle (gas ~$0.50)
  ├─► Calculates coupon: VNA × (IPCA + Spread) × (Days/252)
  ├─► Records coupon on-chain
  │
  ▼
ISSUER
  │
  ├─► Approves payment token (USDC/BRZ)
  ├─► Pays gas (~$3-5 per investor)
  │
  ▼
INVESTORS
  │
  └─► Receive coupon payments automatically
      OR claim individually (gas ~$2-3)

VALUE CREATED:
  • Automated calculations (no human error)
  • Transparent rate source (BCB)
  • Instant settlement
  • Lower operational costs
```

### Flow 3: Secondary Market Trading

```
┌─────────────────────────────────────────────────────────────────┐
│                  SECONDARY MARKET FLOW                           │
└─────────────────────────────────────────────────────────────────┘

SELLER (Token Holder)
  │
  ├─► Lists debenture on DEX/marketplace
  │
  ▼
BUYER (Must be whitelisted!)
  │
  ├─► Completes KYC (off-chain)
  ├─► Gets whitelisted by issuer
  ├─► Executes trade on DEX
  │
  ▼
DEBENTURE CONTRACT (ERC-1404 Check)
  │
  ├─► detectTransferRestriction()
  ├─► Checks buyer whitelist ✅
  ├─► Checks seller not blacklisted ✅
  ├─► Checks lock-up expired ✅
  │
  └─► Transfer succeeds

BUYER receives tokens + future coupons
SELLER receives payment token

VALUE CREATED:
  • 24/7 liquidity
  • Automated compliance
  • Transparent pricing
  • Lower transaction costs vs OTC
```

### Flow 4: Platform Economics

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLATFORM VALUE CAPTURE                        │
└─────────────────────────────────────────────────────────────────┘

Current Model (Pilot):
  • No fees collected
  • Grant-funded / subsidized
  • Goal: Build traction

Future Model (Production):

  ISSUERS → Factory Fee (~$100) → DELOS Treasury
     │
     └─► VALUE: 98% cheaper than alternatives
         ($100 vs $5,000 traditional issuance)

  DEFI PROTOCOLS → Oracle Subscription (~$200/mo) → DELOS Treasury
     │
     └─► VALUE: Access to Brazilian macro data
         (previously unavailable on-chain)

  INVESTORS → Gas Fees Only → Ethereum Network
     │
     └─► VALUE: Automated coupons, 24/7 liquidity
         No platform fees beyond gas

Platform Costs:
  • Infrastructure: $200/month
  • Gas for oracle updates: $50/month
  • Operations: $70/month

Target: $62K/year revenue, $6K/year costs (10x coverage)
```

---

## Technology Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          TECHNOLOGY STACK                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  FRONTEND                                                                │
│  ════════                                                                │
│  • Next.js 14 (App Router)     • React 18                               │
│  • TypeScript                   • Tailwind CSS                          │
│  • wagmi + viem                 • RainbowKit                            │
│  • TanStack Query               • Zod (validation)                      │
│  • react-hook-form              • Lucide icons                          │
│                                                                          │
│  BACKEND                                                                 │
│  ═══════                                                                 │
│  • Python 3.10+                 • FastAPI                                │
│  • APScheduler                  • httpx (async HTTP)                     │
│  • web3.py                      • aiosqlite                              │
│  • pydantic-settings            • Structured logging                     │
│                                                                          │
│  SMART CONTRACTS                                                         │
│  ═══════════════                                                         │
│  • Solidity 0.8.20              • OpenZeppelin 5.x                       │
│  • Hardhat                      • TypeChain                              │
│  • EIP-1167 Clones              • ERC-1404 (restricted)                  │
│                                                                          │
│  BLOCKCHAIN                                                              │
│  ══════════                                                              │
│  • Arbitrum Sepolia             • Chain ID: 421614                       │
│  • RPC: sepolia-rollup.arbitrum.io/rpc                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **EIP-1167 Clones** | Overcome 24KB limit, 98% gas savings per deployment |
| **Chainlink Interface** | DeFi interoperability, standard 8 decimals |
| **ERC-1404** | Regulatory compliance, transfer restrictions |
| **First-party Oracle** | Appropriate for pilot, demonstrable trust |
| **APScheduler** | Reliable cron-like jobs for rate updates |
| **SQLite** | Lightweight persistence, no external DB needed |

---

## Security Considerations

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SECURITY MEASURES                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ORACLE                                                                  │
│  ──────                                                                 │
│  • Rate bounds (min/max) prevent erroneous values                       │
│  • Stale data detection with heartbeat                                  │
│  • Admin-only update functions                                          │
│  • Per-rate configuration                                               │
│                                                                          │
│  DEBENTURES                                                              │
│  ──────────                                                             │
│  • AccessControl roles (ADMIN, ISSUER, TRUSTEE)                        │
│  • ReentrancyGuard on payment functions                                 │
│  • Pausable in emergencies                                              │
│  • Whitelist-only transfers                                             │
│  • Blacklist for bad actors                                             │
│  • Lock-up period enforcement                                           │
│                                                                          │
│  FACTORY                                                                 │
│  ───────                                                                │
│  • Authorized issuers only                                              │
│  • ISIN uniqueness check                                                │
│  • Implementation immutable                                             │
│                                                                          │
│  BACKEND                                                                 │
│  ───────                                                                │
│  • Anomaly detection (Z-score, velocity)                                │
│  • Private key from environment only                                    │
│  • Rate validation before update                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

For more detailed information, see:

- **[ECONOMICS.md](./ECONOMICS.md)** - Platform economics and value flows
- **[WORKFLOWS.md](./WORKFLOWS.md)** - End-to-end user journeys
- **[FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md)** - Roadmap
- **[docs/TECHNICAL_DOCUMENTATION.md](./docs/TECHNICAL_DOCUMENTATION.md)** - Technical details

---

*DELOS Platform Architecture - December 2024*
