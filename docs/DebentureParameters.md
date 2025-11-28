# ANBIMA Parameters Mapping - BrazilianDebenture.sol

## Overview

This document maps the ANBIMA "Metodologia de Precificação de Debêntures" (Dec/2023) parameters to the smart contract implementation.

---

## Core Parameters Implemented

### 1. Rate Types (Indexador)

| ANBIMA Term | Contract Enum | Description |
|-------------|---------------|-------------|
| DI + Spread | `RateType.DI_SPREAD` | Taxa DI + sobretaxa em basis points |
| % do DI | `RateType.DI_PERCENT` | Percentual do DI (2 casas decimais) |
| IPCA + Spread | `RateType.IPCA_SPREAD` | Spread sobre NTN-B de duration mais próxima |
| IGP-M + Spread | `RateType.IGPM_SPREAD` | Spread sobre IGP-M |
| Prefixado | `RateType.PRE` | Taxa fixa (TIR) |

### 2. Value Parameters

| ANBIMA Term | Contract Field | Precision | Description |
|-------------|----------------|-----------|-------------|
| VNE | `terms.vne` | 6 decimals | Valor Nominal de Emissão |
| VNA | `vnaRecord.value` | 6 decimals | Valor Nominal Atualizado |
| Fator C | `vnaRecord.accumulatedFactor` | 8 decimals | Fator de correção acumulado |
| Fator DI | `accumulatedDIFactor` | 9 decimals | Fator DI acumulado |

### 3. Date Parameters

| ANBIMA Term | Contract Field | Description |
|-------------|----------------|-------------|
| Data de emissão | `terms.issueDate` | Issue timestamp |
| Data de vencimento | `terms.maturityDate` | Maturity timestamp |
| Dia de aniversário | `terms.anniversaryDay` | Day (1-31) for index application |
| Lock-up (ICVM 160) | `terms.lockUpEndDate` | End of restriction period |

### 4. Rate Parameters

| ANBIMA Term | Contract Field | Precision | Description |
|-------------|----------------|-----------|-------------|
| Taxa fixa / Spread | `terms.fixedRate` | 4 decimals (bp) | Fixed rate or spread |
| Percentual DI | `terms.percentDI` | 2 decimals | % of DI rate |

### 5. Payment Structure

| ANBIMA Term | Contract Field | Description |
|-------------|----------------|-------------|
| Periodicidade juros | `terms.couponFrequencyDays` | Days between coupons (126, 180, 252) |
| Tipo amortização | `terms.amortType` | PERCENT_VNE, PERCENT_VNA, FIXED_VALUE |
| Cronograma | `amortizationSchedule[]` | Array of dates and percentages |

### 6. Identifiers

| Field | Contract Field | Description |
|-------|----------------|-------------|
| ISIN | `terms.isinCode` | International Securities Identification Number |
| CETIP/B3 | `terms.cetipCode` | Brazilian registry code |
| Série | `terms.series` | Series identifier (e.g., "1ª Série") |

### 7. Special Conditions

| ANBIMA Term | Contract Field | Description |
|-------------|----------------|-------------|
| Repactuação | `terms.hasRepactuacao` | Early renegotiation clause |
| Resgate antecipado | `terms.hasEarlyRedemption` | Early redemption option |
| Combo | `terms.comboId` | Combo series identifier |

---

## Precision Standards (per ANBIMA)

```
PU (Preço Unitário):     6 decimals, sem arredondamento
Taxas:                   4 decimals, sem arredondamento  
% do DI:                 2 decimals
Fator DI:                9 decimals, com arredondamento
Fator C (índices):       8 decimals, sem arredondamento
Base de cálculo:         252 dias úteis
```

---

## Key Formulas Implemented

### VNA Update (IPCA/IGPM)

```
VNA = VNE × C

C = Π(NIk/NIk-1) × (ProjIPCA)^(dp/dt)

Where:
- NIk = índice do mês anterior
- dp = dias úteis desde aniversário
- dt = dias úteis no período
```

### DI Factor Accumulation

```
// DI + Spread
Factor = Π[(1 + DI/100)^(1/252) × (1 + S/100)^(1/252)]

// % do DI  
Factor = Π[((1 + DI/100)^(1/252) - 1) × P/100 + 1]
```

### PU PAR Calculation

```
PUPAR = VNA × (Juros/100 + 1)

Juros = [(i/100 + 1)^(n/N) - 1] × 100

Where:
- i = taxa de juros anual
- n = dias úteis desde último evento
- N = 252 (dias úteis no ano)
```

### Coupon Payment

```
Pagamento = VNA × Juros/100

// For DI-indexed
Pagamento = VNA × (FatorDI - 1)
```

---

## Transfer Restrictions (ERC-1404)

| Code | Constant | Message |
|------|----------|---------|
| 0 | SUCCESS | Success |
| 1 | NOT_WHITELISTED | Address not whitelisted |
| 2 | PAUSED | Transfers paused |
| 3 | BLACKLISTED | Address blacklisted |
| 4 | LOCK_UP_PERIOD | Lock-up period active |

---

## Roles

| Role | Permissions |
|------|-------------|
| ADMIN_ROLE | Pause, set oracle, manage settings |
| ISSUER_ROLE | Set amortization, pay coupons, early redemption |
| TRUSTEE_ROLE | Declare default, repactuation, blacklist |
| WHITELIST_ADMIN_ROLE | Manage investor whitelist |

---

## Events

| Event | When Emitted |
|-------|--------------|
| DebentureIssued | Contract deployment |
| VNAUpdated | Index update applied |
| CouponCalculated | Coupon amount recorded |
| CouponPaid | Issuer deposits funds |
| CouponClaimed | Investor withdraws |
| AmortizationPaid | Amortization executed |
| StatusChanged | Status transitions |
| WhitelistUpdated | Whitelist changes |
| EarlyRedemptionExecuted | Early redemption |
| RepactuationExecuted | Rate renegotiation |

---

## Not Yet Implemented (Future Enhancements)

1. **Business Day Calendar** - Currently uses simplified day count
2. **NTN-B Duration Matching** - For IPCA spread reference selection
3. **Pro-rata IPCA Calculation** - Full dp/dt interpolation
4. **Combo Series Validation** - Cross-contract combo enforcement
5. **REUNE Integration** - Secondary market price feeds
6. **Projeção IPCA** - ANBIMA projection consumption

---

## Usage Example

```solidity
BrazilianDebenture.DebentureTerms memory terms = BrazilianDebenture.DebentureTerms({
    vne: 1000 * 1e6,                    // R$ 1.000,00 (6 decimals)
    totalSupplyUnits: 10000,            // 10.000 units
    issueDate: block.timestamp,
    maturityDate: block.timestamp + 730 days,
    anniversaryDay: 15,                 // Day 15 of each month
    lockUpEndDate: block.timestamp + 90 days,
    rateType: BrazilianDebenture.RateType.IPCA_SPREAD,
    fixedRate: 500,                     // 5.00% spread (4 decimals)
    percentDI: 0,                       // Not used for IPCA
    couponFrequencyDays: 180,           // Semiannual
    amortType: BrazilianDebenture.AmortizationType.PERCENT_VNE,
    isinCode: "BRPETRDBS001",
    cetipCode: "PETR11",
    series: "1ª Série",
    hasRepactuacao: false,
    hasEarlyRedemption: true,
    comboId: bytes32(0)
});

BrazilianDebenture debenture = new BrazilianDebenture(
    "Petrobras Debenture 2027",
    "PETR27",
    terms,
    oracleAddress,
    paymentTokenAddress,
    issuerAddress,
    trusteeAddress
);
```

---

*Reference: Metodologia ANBIMA de Precificação de Debêntures - Versão Dezembro/2023*