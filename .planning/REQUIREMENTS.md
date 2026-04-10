# Requirements — Delos Oracle Solana

**Date:** 2026-04-10
**Scope:** Milestone 1 (Anchor program) + Milestone 2 (Dashboard) = Grant MVP

---

## Functional Requirements

### F1 — BCB Daily Oracle

- F1.1: Store 4 daily BCB rates on-chain: SELIC, CDI, PTAX, TR
- F1.2: Each rate stored as: `value_scaled: i64` (×10^8), `date: u32` (YYYYMMDD), `source: String`
- F1.3: `update_rate` instruction accepts single rate update with authority check
- F1.4: `batch_update_rates` instruction accepts all 4 daily rates in one transaction
- F1.5: Oracle account stores `last_updated: i64` Unix timestamp

### F2 — Focus Boletim

- F2.1: Store 4 Focus market expectations on-chain: IPCA (current yr), SELIC EOY, USD/BRL, GDP
- F2.2: Each expectation: `median_scaled: i64` (×10^8), `year: u16`, `reference_date: u32`
- F2.3: `update_focus` instruction with authority check
- F2.4: BCB Focus API endpoint: `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/`

### F3 — Authorization

- F3.1: Oracle account has `authority: Pubkey` set at initialization
- F3.2: All update instructions verify `authority == signer`
- F3.3: `initialize` instruction sets authority to deployer pubkey
- F3.4: `transfer_authority` instruction for future key rotation

### F4 — Publisher Crank

- F4.1: TypeScript script fetches BCB SGS API for daily rates
- F4.2: TypeScript script fetches BCB Focus API for weekly expectations
- F4.3: Publisher compares on-chain date vs BCB date — skips if already current
- F4.4: Runs on schedule (cron or manual trigger for devnet MVP)
- F4.5: Posts signed transactions to Solana devnet

### F5 — Dashboard (Milestone 2)

- F5.1: React/Next.js app reads oracle account via Anchor IDL
- F5.2: Displays current values for all 8 fields with labels and dates
- F5.3: Shows last updated timestamp
- F5.4: No wallet required for read-only view
- F5.5: Deployed to live URL (Vercel)
- F5.6: Links to devnet explorer for program ID and oracle account

---

## Non-Functional Requirements

### NF1 — Reliability

- NF1.1: BCB API fetch retries 3× with backoff (reuse from bcb_client.py)
- NF1.2: Publisher logs success/failure per rate to stdout
- NF1.3: Oracle account never partially updated — batch preferred

### NF2 — Security

- NF2.1: Authority check on all state-mutating instructions
- NF2.2: Publisher private key in `.env`, never committed
- NF2.3: No admin backdoor — authority is only control surface

### NF3 — Credibility (Grant)

- NF3.1: Anchor tests covering initialize, update_rate, batch_update, authority enforcement
- NF3.2: Program ID documented in README
- NF3.3: Dashboard live URL documented in README
- NF3.4: Explorer links for devnet deployment in README

---

## BCB Data Sources

| Field | API | Series/Endpoint | Frequency |
|-------|-----|-----------------|-----------|
| SELIC | SGS | 432 | Daily |
| CDI | SGS | 12 | Daily |
| PTAX | SGS | 1 | Daily |
| TR | SGS | 226 | Daily |
| IPCA expectation | Focus | ExpectativasMercadoAnuais | Weekly |
| SELIC EOY expectation | Focus | ExpectativasMercadoAnuais | Weekly |
| USD/BRL expectation | Focus | ExpectativasMercadoAnuais | Weekly |
| GDP expectation | Focus | ExpectativasMercadoAnuais | Weekly |

---

## Out of Scope

- TimeFM forecasts (Milestone 3)
- Pyth integration (Milestone 4)
- COPOM LLM sentiment (Milestone 5)
- Mainnet deploy
- Rate history / historical storage
- Monthly rates (IPCA actuals, IGP-M actuals)
- Wallet connection in dashboard
