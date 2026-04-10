# Delos Oracle — Solana

**Created:** 2026-04-10
**Builder:** Solo (Pedro / PedroDnT)
**Grant Target:** Solana Grow ($500–$1k)

---

## What This Is

BCB macroeconomic data oracle for Solana. Posts Brazilian Central Bank daily rates and Focus Boletim market expectations on-chain. Adds TimeFM-based SELIC/IPCA forecasts alongside actuals as a differentiator. No equivalent oracle exists on Solana — Pyth covers FX/equities but not Brazilian sovereign macro data.

## Core Value

**DeFi protocols on Solana need rate-sensitive collateral logic for Brazilian macro exposure. Brazilian institutional teams evaluating Solana need proof this data is available on-chain.**

## Builder Context

- ANBIMA Working Group member on debenture tokenization
- Working BCB oracle on Arbitrum (this repo, EVM branch) — Solana is a port + expansion
- Existing backend: `bcb_client.py` fetches SELIC/CDI/PTAX/TR/IPCA/IGP-M from BCB SGS API
- Prior art: 94 passing EVM tests, testnet deployed

---

## Requirements

### Validated (Non-Negotiable)

- BCB daily rates posted on-chain: SELIC (432), CDI (12), PTAX (1), TR (226)
- Focus Boletim expectations on-chain: IPCA expectation, SELIC end-of-year, USD/BRL, GDP
- Data scaled to 10^8 integers (Chainlink-compatible standard, reuse from EVM version)
- Anchor program deployed to Solana devnet
- Authorized signer pattern (only publisher can update)
- Live dashboard URL reading on-chain state

### Active (Build in Scope)

- TypeScript crank publisher fetching BCB API + posting Solana transactions
- React/Next.js dashboard with wallet-optional read-only view
- Anchor IDL auto-generated for frontend consumption
- Devnet deploy with documented program ID
- Grant application narrative ready

### Out of Scope (Post-Grant)

- TimeFM forecasts on-chain (Milestone 3 — roadmap item in application)
- Pyth PTAX cross-reference (Milestone 4)
- COPOM LLM sentiment scoring (Milestone 5)
- Mainnet deployment
- Authentication / API keys
- Monthly rates (IPCA, IGP-M) — roadmap, not MVP

---

## Key Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-10 | Port EVM oracle to Anchor/Solana | No equivalent exists on Solana; grant opportunity |
| 2026-04-10 | 8 data fields: 4 daily + 4 Focus | Daily rates = concrete, Focus = narrative differentiation |
| 2026-04-10 | Reuse `bcb_client.py` logic for publisher | Already works, validated against BCB API |
| 2026-04-10 | Single oracle account (not per-rate PDAs) | Simpler for v1; easier to read in dashboard |
| 2026-04-10 | TypeScript publisher (not Python) | Solana ecosystem standard; `@solana/web3.js` + `@coral-xyz/anchor` |
| 2026-04-10 | Grant MVP = M1 + M2 only | Devnet program + live URL is sufficient to apply credibly |

---

## Constraints

- Solo builder — phases must be independently completable
- No paid infrastructure for MVP (devnet RPC, free tier)
- BCB API is free / no auth wall
- Program must pass basic security review for grant credibility
- Dashboard must be live URL (Vercel acceptable)
