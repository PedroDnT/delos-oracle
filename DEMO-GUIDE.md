# 🎯 DELOS - Guia de Demonstração

> Demonstração completa do Oracle de Dados Macroeconômicos e Debêntures Tokenizadas

## 📋 Visão Geral

Este guia demonstra:
1. ✅ **Oracle de Dados Macro** - Consulta de taxas BCB on-chain
2. ✅ **Factory de Debêntures** - Criação de debêntures via Clone Pattern
3. ✅ **Debêntures Tokenizadas** - Emissão, distribuição de cupons e pagamentos
4. ✅ **Backend Automatizado** - Atualização automática de taxas

---

## 🚀 Contratos Deployados (Arbitrum Sepolia)

| Contrato | Endereço | Descrição |
|----------|----------|-----------|
| **BrazilianMacroOracle** | `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe` | Oracle com 6 taxas BCB |
| **DebentureImplementation** | `0x8856dd1f536169B8A82D8DA5476F9765b768f51D` | Implementação base (Clone) |
| **DebentureCloneFactory** | `0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f` | Factory EIP-1167 (6.7KB) |

**Block Explorer**: https://sepolia.arbiscan.io/

---

## 📊 Parte 1: Demonstração do Oracle

### 1.1 Consultar Taxas On-Chain

```javascript
// No Hardhat Console
const oracle = await ethers.getContractAt("BrazilianMacroOracle", "0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe");

// Consultar IPCA
const ipca = await oracle.getIPCA();
console.log("IPCA:", ethers.formatUnits(ipca.value, 8), "%");
console.log("Data:", ipca.lastUpdate);

// Consultar CDI
const cdi = await oracle.getCDI();
console.log("CDI:", ethers.formatUnits(cdi.value, 8), "%");

// Consultar SELIC
const selic = await oracle.getSELIC();
console.log("SELIC:", ethers.formatUnits(selic.value, 8), "%");

// Consultar PTAX (BRL/USD)
const ptax = await oracle.getPTAX();
console.log("PTAX:", ethers.formatUnits(ptax.value, 8), "BRL/USD");

// Consultar IGP-M
const igpm = await oracle.getIGPM();
console.log("IGP-M:", ethers.formatUnits(igpm.value, 8), "%");

// Consultar TR
const tr = await oracle.getTR();
console.log("TR:", ethers.formatUnits(tr.value, 8), "%");
```

### 1.2 Verificar Compatibilidade Chainlink

```javascript
// Interface AggregatorV3
const latestRound = await oracle.latestRoundData();
console.log({
  roundId: latestRound.roundId.toString(),
  answer: ethers.formatUnits(latestRound.answer, 8),
  startedAt: new Date(Number(latestRound.startedAt) * 1000),
  updatedAt: new Date(Number(latestRound.updatedAt) * 1000),
  answeredInRound: latestRound.answeredInRound.toString()
});

// Metadata
console.log("Decimals:", await oracle.decimals());
console.log("Description:", await oracle.description());
console.log("Version:", await oracle.version());
```

---

## 🏭 Parte 2: Demonstração da Factory

### 2.1 Criar Nova Debênture via Factory

```javascript
const factory = await ethers.getContractAt("DebentureCloneFactory", "0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f");
const [issuer] = await ethers.getSigners();

// Parâmetros da debênture
const params = {
  name: "Debênture ACME 2025",
  symbol: "ACME25",
  issuer: issuer.address,
  oracle: "0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe",
  paymentToken: "0x...", // Endereço do USDC/BRL stablecoin
  totalSupply: ethers.parseUnits("1000000", 6), // 1M de reais (6 decimais)
  maturityDate: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 ano
  rateType: 3, // IPCA_SPREAD
  rateValue: ethers.parseUnits("6.5", 6), // IPCA + 6.5%
  couponFrequency: 30 * 24 * 60 * 60, // Mensal (30 dias)
  amortizationType: 0, // BULLET (pagamento no vencimento)
  earlyRedemptionAllowed: true
};

// Criar debênture
const tx = await factory.createDebenture(
  params.name,
  params.symbol,
  params.issuer,
  params.oracle,
  params.paymentToken,
  params.totalSupply,
  params.maturityDate,
  params.rateType,
  params.rateValue,
  params.couponFrequency,
  params.amortizationType,
  params.earlyRedemptionAllowed
);

const receipt = await tx.wait();
const event = receipt.logs.find(log => log.fragment?.name === "DebentureCreated");
const debentureAddress = event.args.debentureAddress;

console.log("Nova debênture criada:", debentureAddress);
console.log("Gas usado:", receipt.gasUsed.toString());
```

### 2.2 Listar Todas as Debêntures

```javascript
// Obter todas as debêntures criadas
const allDebentures = await factory.getAllDebentures();
console.log("Total de debêntures:", allDebentures.length);

// Obter debêntures por emissor
const issuerDebentures = await factory.getDebenturesByIssuer(issuer.address);
console.log("Debêntures do emissor:", issuerDebentures.length);

// Detalhes de cada debênture
for (const addr of allDebentures) {
  const debenture = await ethers.getContractAt("BrazilianDebentureCloneable", addr);
  const name = await debenture.name();
  const symbol = await debenture.symbol();
  const totalSupply = await debenture.totalSupply();

  console.log(`${name} (${symbol}): ${ethers.formatUnits(totalSupply, 6)} tokens`);
}
```

---

## 💰 Parte 3: Demonstração de Debênture

### 3.1 Emitir e Distribuir Debêntures

```javascript
const debenture = await ethers.getContractAt("BrazilianDebentureCloneable", debentureAddress);
const [issuer, investor1, investor2] = await ethers.getSigners();

// 1. Adicionar investidores à whitelist (KYC)
await debenture.addToWhitelist(investor1.address);
await debenture.addToWhitelist(investor2.address);
console.log("Investidores adicionados à whitelist");

// 2. Distribuir tokens
await debenture.transfer(investor1.address, ethers.parseUnits("100000", 6)); // 100k
await debenture.transfer(investor2.address, ethers.parseUnits("50000", 6));  // 50k
console.log("Tokens distribuídos aos investidores");

// 3. Verificar saldos
const balance1 = await debenture.balanceOf(investor1.address);
const balance2 = await debenture.balanceOf(investor2.address);
console.log("Saldo Investidor 1:", ethers.formatUnits(balance1, 6));
console.log("Saldo Investidor 2:", ethers.formatUnits(balance2, 6));
```

### 3.2 Registrar e Pagar Cupons

```javascript
// 1. Obter taxa do oracle (IPCA)
const oracle = await ethers.getContractAt("BrazilianMacroOracle", await debenture.oracle());
const ipca = await oracle.getIPCA();
console.log("IPCA atual:", ethers.formatUnits(ipca.value, 8), "%");

// 2. Registrar cupom
const couponDate = Math.floor(Date.now() / 1000);
await debenture.recordCoupon(couponDate);
console.log("Cupom registrado para data:", new Date(couponDate * 1000));

// 3. Calcular valor do cupom para cada investidor
const coupon1 = await debenture.calculateCouponValue(investor1.address, 0);
const coupon2 = await debenture.calculateCouponValue(investor2.address, 0);
console.log("Cupom Investidor 1:", ethers.formatUnits(coupon1, 6));
console.log("Cupom Investidor 2:", ethers.formatUnits(coupon2, 6));

// 4. Aprovar pagamento token (USDC/BRL)
const paymentToken = await ethers.getContractAt("IERC20", await debenture.paymentToken());
const totalCoupon = coupon1 + coupon2;
await paymentToken.approve(debentureAddress, totalCoupon);

// 5. Pagar cupons
await debenture.payCoupon(investor1.address, 0);
await debenture.payCoupon(investor2.address, 0);
console.log("Cupons pagos com sucesso!");
```

### 3.3 Verificar Histórico de Cupons

```javascript
// Obter todos os cupons pendentes
const pending1 = await debenture.getPendingClaims(investor1.address);
console.log("Cupons pendentes Investidor 1:", pending1);

// Claim múltiplos cupons de uma vez
if (pending1.length > 0) {
  await debenture.connect(investor1).claimAllCoupons();
  console.log("Todos os cupons foram reclamados!");
}

// Obter informações do cupom
const couponInfo = await debenture.coupons(0);
console.log({
  date: new Date(Number(couponInfo.date) * 1000),
  rate: ethers.formatUnits(couponInfo.rate, 6),
  totalAmount: ethers.formatUnits(couponInfo.totalAmount, 6),
  paid: couponInfo.paid
});
```

### 3.4 Resgate Antecipado

```javascript
// 1. Verificar se está permitido
const earlyRedemptionAllowed = await debenture.earlyRedemptionAllowed();
console.log("Resgate antecipado permitido:", earlyRedemptionAllowed);

// 2. Calcular valor de resgate
const redemptionValue = await debenture.balanceOf(investor1.address);

// 3. Aprovar tokens de pagamento
await paymentToken.approve(debentureAddress, redemptionValue);

// 4. Realizar resgate antecipado
await debenture.earlyRedeem(investor1.address, redemptionValue);
console.log("Resgate antecipado realizado:", ethers.formatUnits(redemptionValue, 6));
```

### 3.5 Vencimento da Debênture

```javascript
// 1. Verificar se está vencida
const maturityDate = await debenture.maturityDate();
const now = Math.floor(Date.now() / 1000);
const isMatured = now >= maturityDate;
console.log("Vencida:", isMatured);
console.log("Data de vencimento:", new Date(Number(maturityDate) * 1000));

// 2. Marcar como vencida (apenas issuer)
if (isMatured) {
  await debenture.markAsMatured();
  console.log("Debênture marcada como vencida");

  // 3. Pagar valor principal + último cupom
  const balance = await debenture.balanceOf(investor1.address);
  await paymentToken.approve(debentureAddress, balance);
  await debenture.transfer(debenture.address, balance); // Queima tokens
  console.log("Pagamento final realizado");
}
```

---

## 🤖 Parte 4: Backend Automatizado

### 4.1 Iniciar Scheduler

```bash
cd backend

# Ativar ambiente virtual
source venv/bin/activate

# Iniciar scheduler
python scheduler.py start

# Verificar jobs agendados
python scheduler.py status
```

### 4.2 Atualização Manual

```bash
# Atualizar todas as taxas
python scheduler.py run-once

# Atualizar taxas específicas
python scheduler.py run-once --rates CDI,SELIC,PTAX
```

### 4.3 API REST

```bash
# Iniciar servidor
python api.py

# Em outro terminal, testar endpoints
curl http://localhost:8000/health
curl http://localhost:8000/rates
curl http://localhost:8000/rates/IPCA
curl http://localhost:8000/rates/IPCA/history
```

---

## 📱 Parte 5: Frontend Dashboard

### 5.1 Iniciar Frontend

```bash
cd frontend

# Instalar dependências (primeira vez)
npm install

# Modo desenvolvimento
npm run dev

# Abrir navegador
open http://localhost:3000
```

### 5.2 Funcionalidades

1. **Dashboard Oracle** (`/`)
   - Visualizar todas as taxas em tempo real
   - Histórico de atualizações
   - Status de conexão com blockchain

2. **Emitir Debênture** (`/issue`)
   - Formulário completo de emissão
   - Validação de parâmetros
   - Confirmação on-chain

3. **Portfolio** (`/portfolio`)
   - Visualizar todas as debêntures
   - Saldos e cupons pendentes
   - Histórico de transações

---

## 🎬 Script Completo de Demonstração

```javascript
// scripts/demo-complete.ts
import { ethers } from "hardhat";

async function main() {
  console.log("🚀 DELOS - Demonstração Completa\n");

  // 1. ORACLE
  console.log("📊 Parte 1: Oracle de Dados Macro");
  const oracle = await ethers.getContractAt(
    "BrazilianMacroOracle",
    "0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe"
  );

  const ipca = await oracle.getIPCA();
  console.log("✅ IPCA:", ethers.formatUnits(ipca.value, 8), "%");

  const cdi = await oracle.getCDI();
  console.log("✅ CDI:", ethers.formatUnits(cdi.value, 8), "%\n");

  // 2. FACTORY
  console.log("🏭 Parte 2: Factory de Debêntures");
  const factory = await ethers.getContractAt(
    "DebentureCloneFactory",
    "0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f"
  );

  const [issuer] = await ethers.getSigners();

  // Deploy mock payment token
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const paymentToken = await MockERC20.deploy("Brazilian Real", "BRL");
  await paymentToken.waitForDeployment();
  console.log("✅ Payment Token:", await paymentToken.getAddress());

  // Create debenture
  const tx = await factory.createDebenture(
    "Debênture Demo 2025",
    "DEMO25",
    issuer.address,
    await oracle.getAddress(),
    await paymentToken.getAddress(),
    ethers.parseUnits("1000000", 6),
    Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    3, // IPCA_SPREAD
    ethers.parseUnits("6.5", 6),
    30 * 24 * 60 * 60,
    0, // BULLET
    true
  );

  const receipt = await tx.wait();
  const event = receipt?.logs.find(log => log.fragment?.name === "DebentureCreated");
  const debentureAddress = event.args.debentureAddress;
  console.log("✅ Debênture criada:", debentureAddress);
  console.log("✅ Gas usado:", receipt?.gasUsed.toString(), "\n");

  // 3. DEBENTURE
  console.log("💰 Parte 3: Operações com Debênture");
  const debenture = await ethers.getContractAt("BrazilianDebentureCloneable", debentureAddress);

  // Mint tokens to issuer for payments
  await paymentToken.mint(issuer.address, ethers.parseUnits("10000000", 6));

  // Add to whitelist
  await debenture.addToWhitelist(issuer.address);
  console.log("✅ Issuer adicionado à whitelist");

  // Record coupon
  const couponDate = Math.floor(Date.now() / 1000);
  await debenture.recordCoupon(couponDate);
  console.log("✅ Cupom registrado");

  // Calculate and pay coupon
  const couponValue = await debenture.calculateCouponValue(issuer.address, 0);
  console.log("✅ Valor do cupom:", ethers.formatUnits(couponValue, 6));

  await paymentToken.approve(debentureAddress, couponValue);
  await debenture.payCoupon(issuer.address, 0);
  console.log("✅ Cupom pago com sucesso!\n");

  console.log("🎉 Demonstração completa!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

---

## 🔍 Verificação no Block Explorer

### Oracle
https://sepolia.arbiscan.io/address/0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe

### Factory
https://sepolia.arbiscan.io/address/0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f

### Debênture Implementation
https://sepolia.arbiscan.io/address/0x8856dd1f536169B8A82D8DA5476F9765b768f51D

---

## 📞 Suporte

- **Documentação**: [CLAUDE.md](./CLAUDE.md)
- **Implementação**: [IMPLEMENTATION-COMPLETE.md](./IMPLEMENTATION-COMPLETE.md)
- **Issues**: GitHub Issues
