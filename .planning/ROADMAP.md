# Roadmap — Delos Oracle Solana

**Created:** 2026-04-10
**Milestone:** v1 Grant MVP → Solana Grow application

---

## Milestone 1: Grant MVP (M1 + M2)

### Phase 1: Anchor Program

**Goal:** Deployed Anchor program on Solana devnet that stores BCB daily rates + Focus Boletim expectations. Authorized publisher only. Anchor tests passing.

**Deliverables:**
- `programs/delos-oracle/` — Anchor workspace initialized
- `MacroOracle` account struct with 8 data fields (4 daily + 4 Focus)
- Instructions: `initialize`, `update_rate`, `batch_update_rates`, `update_focus`, `transfer_authority`
- Anchor tests: initialize, update, authority enforcement, batch update
- Deployed to devnet with documented Program ID

**Success Criteria:**
- `anchor test` passes locally
- `anchor deploy --provider.cluster devnet` succeeds
- Program ID in README
- No authority bypass possible

**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md — anchor build: compile program and generate IDL + TypeScript types
- [ ] 01-02-PLAN.md — anchor test: run 7 localnet tests, verify authority enforcement
- [ ] 01-03-PLAN.md — anchor deploy to devnet + README update with Program ID and explorer link

---

### Phase 2: TypeScript Publisher

**Goal:** Crank script that fetches BCB API (daily + Focus) and posts transactions to Solana devnet oracle. Staleness check prevents redundant writes.

**Deliverables:**
- `solana-crank/` directory with TypeScript publisher
- BCB SGS fetcher (SELIC 432, CDI 12, PTAX 1, TR 226)
- BCB Focus fetcher (IPCA, SELIC EOY, USD/BRL, GDP expectations)
- Staleness check: compare on-chain date vs BCB date
- `publish.ts` entry point — manual run + cron-ready
- `.env.example` with required variables

**Success Criteria:**
- `npx ts-node publish.ts` updates devnet oracle
- Skip logic works when data is already current
- Logs success/failure per field

---

### Phase 3: React Dashboard

**Goal:** Live deployed URL showing current on-chain BCB oracle state. No wallet required. Links to devnet explorer.

**Deliverables:**
- `solana-dashboard/` — Next.js 14 app
- Oracle reader using `@coral-xyz/anchor` + IDL
- Display: 4 daily rates + 4 Focus expectations with labels, values, dates
- Last updated timestamp
- Explorer links (program ID, oracle account)
- Deployed to Vercel (live URL)

**Success Criteria:**
- Live URL accessible without wallet
- Values match devnet oracle account
- Updates reflected within 30s of publisher run

---

## Milestone 2: Differentiation (Post-Grant Roadmap)

### Phase 4: TimeFM Forecasts On-Chain

**Goal:** TimeFM-based SELIC/IPCA forecasts posted alongside actuals as separate account. Demonstrates AI + oracle combination.

**Deliverables:**
- `ForecastOracle` account struct (forecast + confidence interval)
- `update_forecast` instruction
- Python inference script using TimeFM
- Dashboard extension showing actuals vs forecast

---

### Phase 5: Pyth PTAX Cross-Reference

**Goal:** Compare Delos PTAX vs Pyth USDBRL. Post discrepancy signal on-chain. DeFi use case: arbitrage / data quality signal.

---

### Phase 6: COPOM LLM Sentiment

**Goal:** Hawkish/dovish sentiment score from COPOM minutes, posted on-chain. Narrative differentiator for institutional users.

---

## Grant Application Trigger

**Apply after Phase 3 complete:**
- Program ID on devnet ✓
- Live dashboard URL ✓
- TimeFM in roadmap (narrative) ✓
- Pyth cross-reference in roadmap ✓
- ANBIMA validation story ✓
