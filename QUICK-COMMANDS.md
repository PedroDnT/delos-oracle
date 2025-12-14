# ⚡ DELOS - Comandos Rápidos

> Guia de referência rápida para demonstrar a plataforma

## 🚀 Execução Rápida

### Demonstração Completa (Script Automatizado)

```bash
cd contracts
npx hardhat run scripts/demo-complete.ts --network arbitrumSepolia
```

Este script executa TUDO automaticamente:
- ✅ Consulta todas as taxas do oracle
- ✅ Cria uma debênture via factory
- ✅ Distribui tokens para investidores
- ✅ Registra e paga cupons
- ✅ Testa restrições de transferência

---

## 📊 Consultar Oracle (Hardhat Console)

```bash
cd contracts
npx hardhat console --network arbitrumSepolia
```

```javascript
// Conectar ao oracle
const oracle = await ethers.getContractAt("BrazilianMacroOracle", "0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe");

// IPCA
const ipca = await oracle.getIPCA();
console.log("IPCA:", ethers.formatUnits(ipca.value, 8), "%");

// CDI
const cdi = await oracle.getCDI();
console.log("CDI:", ethers.formatUnits(cdi.value, 8), "%");

// SELIC
const selic = await oracle.getSELIC();
console.log("SELIC:", ethers.formatUnits(selic.value, 8), "%");

// PTAX
const ptax = await oracle.getPTAX();
console.log("PTAX:", ethers.formatUnits(ptax.value, 8), "BRL/USD");

// Todas as taxas de uma vez
async function showAllRates() {
  const rates = {
    IPCA: await oracle.getIPCA(),
    CDI: await oracle.getCDI(),
    SELIC: await oracle.getSELIC(),
    PTAX: await oracle.getPTAX(),
    IGPM: await oracle.getIGPM(),
    TR: await oracle.getTR()
  };

  for (const [name, data] of Object.entries(rates)) {
    console.log(`${name}: ${ethers.formatUnits(data.value, 8)}% (${new Date(Number(data.lastUpdate) * 1000).toLocaleDateString()})`);
  }
}
await showAllRates();
```

---

## 🏭 Usar Factory (Hardhat Console)

```javascript
// Conectar à factory
const factory = await ethers.getContractAt("DebentureCloneFactory", "0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f");

// Ver todas as debêntures criadas
const all = await factory.getAllDebentures();
console.log("Total de debêntures:", all.length);
all.forEach((addr, i) => console.log(`${i + 1}. ${addr}`));

// Criar nova debênture
const [issuer] = await ethers.getSigners();

// Deploy payment token primeiro (para testes)
const MockERC20 = await ethers.getContractFactory("MockERC20");
const paymentToken = await MockERC20.deploy("Brazilian Real", "BRL");
await paymentToken.waitForDeployment();
const paymentTokenAddr = await paymentToken.getAddress();

// Criar debênture
const tx = await factory.createDebenture(
  "Minha Debênture 2025",                      // nome
  "MINHA25",                                   // símbolo
  issuer.address,                              // emissor
  "0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe", // oracle
  paymentTokenAddr,                            // token de pagamento
  ethers.parseUnits("1000000", 6),            // 1M tokens
  Math.floor(Date.now() / 1000) + 365 * 86400, // vencimento em 1 ano
  3,                                           // IPCA_SPREAD
  ethers.parseUnits("6.5", 6),                // IPCA + 6.5%
  30 * 86400,                                  // cupons mensais
  0,                                           // BULLET
  true                                         // permite resgate antecipado
);

const receipt = await tx.wait();
const event = receipt.logs.find(log => log.fragment?.name === "DebentureCreated");
const debentureAddr = event.args.debentureAddress;
console.log("✅ Debênture criada:", debentureAddr);
```

---

## 💰 Interagir com Debênture (Hardhat Console)

```javascript
// Conectar à debênture (use o endereço retornado acima)
const debenture = await ethers.getContractAt("BrazilianDebentureCloneable", "ENDERECO_DA_DEBENTURE");

// Ver informações
console.log("Nome:", await debenture.name());
console.log("Símbolo:", await debenture.symbol());
console.log("Total Supply:", ethers.formatUnits(await debenture.totalSupply(), 6));
console.log("Emissor:", await debenture.issuerAddress());
console.log("Vencimento:", new Date(Number(await debenture.maturityDate()) * 1000));

// Adicionar à whitelist
const [issuer, investor1, investor2] = await ethers.getSigners();
await debenture.addToWhitelist(investor1.address);
await debenture.addToWhitelist(investor2.address);
console.log("✅ Investidores whitelisted");

// Transferir tokens
await debenture.transfer(investor1.address, ethers.parseUnits("100000", 6));
await debenture.transfer(investor2.address, ethers.parseUnits("50000", 6));
console.log("✅ Tokens transferidos");

// Ver saldos
const bal1 = await debenture.balanceOf(investor1.address);
const bal2 = await debenture.balanceOf(investor2.address);
console.log("Saldo Inv1:", ethers.formatUnits(bal1, 6));
console.log("Saldo Inv2:", ethers.formatUnits(bal2, 6));

// Registrar cupom
await debenture.recordCoupon(Math.floor(Date.now() / 1000));
console.log("✅ Cupom registrado");

// Calcular valores
const coupon1 = await debenture.calculateCouponValue(investor1.address, 0);
const coupon2 = await debenture.calculateCouponValue(investor2.address, 0);
console.log("Cupom Inv1:", ethers.formatUnits(coupon1, 6), "BRL");
console.log("Cupom Inv2:", ethers.formatUnits(coupon2, 6), "BRL");

// Pagar cupons (precisa aprovar payment token primeiro)
const paymentToken = await ethers.getContractAt("IERC20", await debenture.paymentToken());
await paymentToken.approve(await debenture.getAddress(), coupon1 + coupon2);
await debenture.payCoupon(investor1.address, 0);
await debenture.payCoupon(investor2.address, 0);
console.log("✅ Cupons pagos");
```

---

## 🤖 Backend

### Iniciar Scheduler

```bash
cd backend
source venv/bin/activate  # Windows: venv\Scripts\activate

# Ver status
python scheduler.py status

# Executar uma vez (manualmente)
python scheduler.py run-once

# Iniciar daemon
python scheduler.py start
```

### Testar BCB Client

```bash
cd backend
source venv/bin/activate
python bcb_client.py
```

### Iniciar API

```bash
cd backend
source venv/bin/activate
python api.py

# Em outro terminal
curl http://localhost:8000/health
curl http://localhost:8000/rates
curl http://localhost:8000/rates/IPCA
```

---

## 📱 Frontend

```bash
cd frontend

# Desenvolvimento
npm run dev

# Build
npm run build
npm start
```

Abrir no navegador: http://localhost:3000

---

## 🔍 Ver no Block Explorer

### Oracle
https://sepolia.arbiscan.io/address/0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe

### Factory
https://sepolia.arbiscan.io/address/0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f

### Implementation
https://sepolia.arbiscan.io/address/0x8856dd1f536169B8A82D8DA5476F9765b768f51D

---

## 🧪 Testes

### Todos os testes

```bash
cd contracts
npx hardhat test
```

### Teste específico

```bash
# Apenas oracle
npx hardhat test test/BrazilianMacroOracle.test.ts

# Apenas debênture
npx hardhat test test/BrazilianDebenture.test.ts
```

### Coverage

```bash
npx hardhat coverage
```

---

## 📝 Scripts Úteis

### Verificar tamanho dos contratos

```bash
cd contracts
npx hardhat size-contracts
```

### Compilar

```bash
cd contracts
npx hardhat compile
```

### Limpar build

```bash
cd contracts
npx hardhat clean
```

---

## 🎯 Workflow Típico de Demonstração

1. **Mostrar Oracle**
   ```bash
   npx hardhat console --network arbitrumSepolia
   # Executar comandos de consulta do oracle
   ```

2. **Criar Debênture**
   ```bash
   # Usar factory no console ou rodar demo-complete.ts
   npx hardhat run scripts/demo-complete.ts --network arbitrumSepolia
   ```

3. **Mostrar Frontend**
   ```bash
   cd frontend && npm run dev
   # Abrir http://localhost:3000
   ```

4. **Mostrar Backend**
   ```bash
   cd backend && python api.py
   # Abrir http://localhost:8000/docs
   ```

---

## 💡 Dicas

- **Hardhat Console**: Use `npx hardhat console --network arbitrumSepolia` para interação em tempo real
- **Block Explorer**: Sempre verifique transações no Arbiscan
- **Gas**: Arbitrum tem taxas muito baixas (~$0.01 por transação)
- **Demo Script**: Use `demo-complete.ts` para demonstração automatizada completa
- **Frontend**: Precisa conectar carteira com tokens Arbitrum Sepolia ETH

---

## 🆘 Solução de Problemas

### Erro: "insufficient funds"
- Precisa de ETH na Arbitrum Sepolia
- Faucet: https://faucet.quicknode.com/arbitrum/sepolia

### Erro: "transfer restriction"
- Endereço não está na whitelist
- Usar `addToWhitelist(address)` primeiro

### Backend não atualiza taxas
- Verificar BCB_API_KEY no .env
- Testar BCB client: `python bcb_client.py`

### Frontend não conecta
- Verificar RPC_URL correto em .env.local
- Trocar rede na carteira para Arbitrum Sepolia

---

## 📚 Documentação Completa

- [README.md](./README.md) - Visão geral do projeto
- [DEMO-GUIDE.md](./DEMO-GUIDE.md) - Guia completo de demonstração
- [CLAUDE.md](./CLAUDE.md) - Arquitetura e implementação detalhada
