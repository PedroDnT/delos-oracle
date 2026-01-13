# DELOS - Portfolio Project Description

## Short Description (1-2 sentences)

**DELOS** is a blockchain-based oracle and tokenized securities system exploring infrastructure for Brazilian macroeconomic data on-chain. The project demonstrates how tokenized debentures could leverage real-time BCB rates through smart contracts, factory patterns, and automated backend services.

---

## Medium Description (1 paragraph)

**DELOS** is a technical blueprint demonstrating blockchain infrastructure for Brazilian tokenized securities. The system includes a Chainlink-compatible oracle delivering BCB (Banco Central do Brasil) macroeconomic rates on-chain, ERC-20/ERC-1404 compliant debenture contracts with IPCA/CDI indexation, and a gas-efficient EIP-1167 clone factory for deployment. Built with Solidity 0.8.28, Python FastAPI backend, and Next.js 14 frontend, the project explores how ANBIMA's tokenized securities pilot could leverage decentralized infrastructure for automated coupon calculations, KYC compliance, and regulatory-compliant transfer restrictions.

---

## Long Description (2-3 paragraphs)

**DELOS** is an explorational blockchain platform demonstrating how Brazilian tokenized debentures could leverage on-chain macroeconomic data. The project implements a comprehensive oracle system that brings six critical BCB (Banco Central do Brasil) rates—IPCA, CDI, SELIC, PTAX, IGP-M, and TR—onto Arbitrum Sepolia testnet with Chainlink AggregatorV3 compatibility. This enables automated coupon calculations for tokenized securities without manual rate updates or spreadsheet reconciliation.

The smart contract architecture includes three main components: a BrazilianMacroOracle contract with circuit breakers and 8-decimal precision, a BrazilianDebentureCloneable implementation supporting five indexation types (PRE, DI_SPREAD, DI_PERCENT, IPCA_SPREAD, IGPM_SPREAD) and three amortization schedules, and a DebentureCloneFactory using EIP-1167 minimal proxies to reduce deployment costs by ~98%. The debenture contracts implement ERC-1404 transfer restrictions for regulatory compliance, including on-chain KYC whitelisting and lockup period enforcement.

The technical stack demonstrates full-stack blockchain development: Solidity smart contracts with 94 passing tests, Python backend services (FastAPI REST API, APScheduler automation, BCB client with retry logic, SQLite data versioning), and a modern Next.js 14 frontend with RainbowKit wallet integration. While deployed to testnet as a technical exploration rather than production system, the project showcases practical patterns for tokenized securities infrastructure including oracle design, factory deployment optimization, regulatory compliance mechanisms, and economic modeling for Brazilian capital markets.

---

## Technical Highlights (Bullet Points)

**Smart Contracts (Solidity 0.8.28):**
- Chainlink-compatible oracle with 6 Brazilian macro rates
- ERC-20/ERC-1404 tokenized debentures with transfer restrictions
- EIP-1167 minimal proxy factory (~98% gas savings)
- 94 unit tests covering oracle updates, coupon calculations, and compliance

**Backend Services (Python):**
- FastAPI REST API with 10 endpoints for rate queries
- APScheduler for automated daily/monthly rate updates
- BCB API client with retry logic and parallel fetching
- SQLite data versioning and statistical anomaly detection

**Frontend (Next.js 14):**
- Oracle dashboard displaying real-time BCB rates
- Debenture issuance interface with validation
- Portfolio management for investors
- RainbowKit + wagmi wallet integration

**Infrastructure:**
- Deployed to Arbitrum Sepolia testnet
- Hardhat development environment
- Comprehensive test coverage (oracle, debentures, factory)
- Documentation including architecture, workflows, and economics

---

## Key Technologies

- **Blockchain**: Solidity 0.8.28, Hardhat, Arbitrum L2
- **Smart Contract Libraries**: OpenZeppelin, Chainlink interfaces
- **Backend**: Python 3.9+, FastAPI, APScheduler, web3.py, httpx
- **Frontend**: Next.js 14, React, TypeScript, RainbowKit, wagmi, TailwindCSS
- **Testing**: Hardhat test suite, pytest
- **Data**: Banco Central do Brasil API integration

---

## GitHub & Live Links

- **Repository**: https://github.com/PedroDnT/delos-oracle
- **Oracle Contract**: [0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe](https://sepolia.arbiscan.io/address/0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe) (Arbitrum Sepolia)
- **Factory Contract**: [0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f](https://sepolia.arbiscan.io/address/0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f) (Arbitrum Sepolia)
- **Status**: Explorational blueprint (testnet deployment)

---

## Tags/Keywords

`Blockchain` `Solidity` `Smart Contracts` `Oracle` `Tokenization` `DeFi` `Chainlink` `ERC-20` `ERC-1404` `Securities` `Brazil` `Next.js` `Python` `FastAPI` `Arbitrum` `L2` `Web3`

---

## Project Role

**Full-Stack Blockchain Developer** - Designed and implemented complete tokenized securities infrastructure including oracle contracts, factory patterns, backend automation, and frontend interfaces. Explored regulatory compliance mechanisms (ERC-1404), gas optimization techniques (EIP-1167), and integration with Brazilian central bank APIs.
