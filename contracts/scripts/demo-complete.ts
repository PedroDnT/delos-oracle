import { ethers } from "hardhat";

/**
 * 🎯 DELOS - Script de Demonstração Completa
 *
 * Este script demonstra todas as funcionalidades da plataforma:
 * 1. Oracle de dados macroeconômicos
 * 2. Factory de debêntures (Clone Pattern)
 * 3. Emissão e gestão de debêntures
 * 4. Pagamento de cupons
 */

async function main() {
  console.log("\n🚀 DELOS - Demonstração Completa");
  console.log("=".repeat(60));

  const signers = await ethers.getSigners();
  const issuer = signers[0];
  const investor1 = signers.length > 1 ? signers[1] : issuer;
  const investor2 = signers.length > 2 ? signers[2] : issuer;

  console.log("\n👥 Contas:");
  console.log("  Emissor:", issuer.address);
  console.log("  Investidor 1:", investor1.address);
  console.log("  Investidor 2:", investor2.address);

  // ===========================================================================
  // PARTE 1: ORACLE DE DADOS MACRO
  // ===========================================================================
  console.log("\n📊 PARTE 1: Oracle de Dados Macroeconômicos");
  console.log("-".repeat(60));

  const ORACLE_ADDRESS = "0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe";
  const oracle = await ethers.getContractAt("BrazilianMacroOracle", ORACLE_ADDRESS);

  console.log("Oracle:", ORACLE_ADDRESS);
  console.log("\n📈 Taxas Atuais:");

  const rates = ["IPCA", "CDI", "SELIC", "PTAX", "IGPM", "TR"];
  const rateNames: Record<string, string> = {
    IPCA: "IPCA",
    CDI: "CDI",
    SELIC: "SELIC",
    PTAX: "PTAX (BRL/USD)",
    IGPM: "IGP-M",
    TR: "TR"
  };

  for (const rate of rates) {
    try {
      const rateData = await oracle.getRateFull(rate);
      const value = ethers.formatUnits(rateData[0], 8);
      const date = new Date(Number(rateData[2]) * 1000).toLocaleDateString();
      console.log(`  • ${rateNames[rate]}: ${value} (${date})`);
    } catch (e) {
      console.log(`  • ${rateNames[rate]}: (não disponível)`);
    }
  }

  // Verificar suporte de taxas
  console.log("\n🔗 Taxas Suportadas:");
  const supportedRates = await oracle.getSupportedRates();
  supportedRates.forEach((rate: string) => {
    console.log(`  • ${rate}`);
  });

  // ===========================================================================
  // PARTE 2: FACTORY DE DEBÊNTURES
  // ===========================================================================
  console.log("\n🏭 PARTE 2: Factory de Debêntures (Clone Pattern)");
  console.log("-".repeat(60));

  const FACTORY_ADDRESS = "0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f";
  const factory = await ethers.getContractAt("DebentureCloneFactory", FACTORY_ADDRESS);

  console.log("Factory:", FACTORY_ADDRESS);
  console.log("Implementation:", await factory.implementation());

  // Deploy Mock Payment Token (BRL Stablecoin)
  console.log("\n💵 Deploying Mock Payment Token...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const paymentToken = await MockERC20.deploy("Brazilian Real Token", "BRL", 6);
  await paymentToken.waitForDeployment();
  const paymentTokenAddress = await paymentToken.getAddress();
  console.log("  Payment Token:", paymentTokenAddress);

  // Mint tokens para o emissor fazer pagamentos
  const mintAmount = ethers.parseUnits("10000000", 6); // 10M BRL
  await paymentToken.mint(issuer.address, mintAmount);
  console.log(`  Minted ${ethers.formatUnits(mintAmount, 6)} BRL para emissor`);

  // Criar nova debênture via factory
  console.log("\n📝 Criando nova debênture...");

  const now = Math.floor(Date.now() / 1000);
  const maturityDate = now + 365 * 24 * 60 * 60; // 1 year
  
  // Generate unique ISIN code using timestamp (last 4 digits)
  const timestampStr = now.toString().slice(-4);
  const isinCode = `BRDELOS${timestampStr.padStart(4, '0')}`.slice(0, 12); // Ensure exactly 12 chars

  // DebentureTerms struct parameters
  const terms = {
    vne: ethers.parseUnits("1000", 6), // VNE: R$ 1.000
    totalSupplyUnits: 1000n, // 1.000 units = 1M total
    issueDate: now,
    maturityDate: maturityDate,
    anniversaryDay: 15,
    lockUpEndDate: now + 30 * 24 * 60 * 60, // 30 days lock-up
    rateType: 3, // IPCA_SPREAD (enum value)
    fixedRate: ethers.parseUnits("6.5", 4), // 6.5% (4 decimals = basis points)
    percentDI: 0,
    couponFrequencyDays: 30,
    amortType: 0, // BULLET
    isinCode: isinCode,
    cetipCode: "DELOS25",
    series: "SERIE001",
    hasRepactuacao: true,
    hasEarlyRedemption: true,
    comboId: ethers.zeroPadValue("0x", 32)
  };

  const createTx = await factory.createDebenture(
    "Debênture DELOS Demo 2025",
    "DELOS25",
    terms,
    paymentTokenAddress,
    issuer.address // trustee
  );

  console.log("  Aguardando confirmação...");
  const createReceipt = await createTx.wait();

  // Extrair endereço da debênture do evento
  const debentureCreatedEvent = createReceipt?.logs.find(
    (log: any) => log.fragment?.name === "DebentureCreated"
  );
  const debentureAddress = debentureCreatedEvent.args.debentureAddress;

  console.log("✅ Debênture criada com sucesso!");
  console.log(`  Endereço: ${debentureAddress}`);
  console.log(`  Gas usado: ${createReceipt?.gasUsed.toString()}`);
  console.log(`  Tamanho do clone: ~6.7KB (EIP-1167)`);

  // Verificar debêntures criadas
  const allDebentures = await factory.getAllDebentures();
  console.log(`\n📋 Total de debêntures na factory: ${allDebentures.length}`);

  // ===========================================================================
  // PARTE 3: OPERAÇÕES COM DEBÊNTURE
  // ===========================================================================
  console.log("\n💰 PARTE 3: Operações com Debênture");
  console.log("-".repeat(60));

  const debenture = await ethers.getContractAt("BrazilianDebentureCloneable", debentureAddress);

  // 3.1 Verificar informações
  console.log("\nℹ️  Informações da Debênture:");
  console.log(`  Nome: ${await debenture.name()}`);
  console.log(`  Símbolo: ${await debenture.symbol()}`);
  console.log(`  Total Supply: ${ethers.formatUnits(await debenture.totalSupply(), 6)} tokens`);
  console.log(`  Emissor: ${await debenture.issuer()}`);
  const debentureTerms = await debenture.terms();
  console.log(`  Vencimento: ${new Date(Number(debentureTerms.maturityDate) * 1000).toLocaleDateString()}`);
  console.log(`  Tipo de Taxa: IPCA + Spread`);
  console.log(`  Spread: ${ethers.formatUnits(debentureTerms.fixedRate, 4)}%`);
  console.log(`  Frequência de Cupom: ${debentureTerms.couponFrequencyDays} dias`);

  // 3.2 Adicionar investidores à whitelist (KYC)
  console.log("\n✅ Adicionando investidores à whitelist (KYC)...");
  await debenture.addToWhitelist(issuer.address);
  await debenture.addToWhitelist(investor1.address);
  await debenture.addToWhitelist(investor2.address);
  console.log("  • Emissor whitelisted");
  console.log("  • Investidor 1 whitelisted");
  console.log("  • Investidor 2 whitelisted");

  // 3.3 Distribuir tokens
  console.log("\n💸 Distribuindo tokens...");
  const amount1 = ethers.parseUnits("400000", 6); // 400k
  const amount2 = ethers.parseUnits("300000", 6); // 300k
  // Emissor fica com 300k

  await debenture.transfer(investor1.address, amount1);
  await debenture.transfer(investor2.address, amount2);

  console.log(`  • Investidor 1: ${ethers.formatUnits(amount1, 6)} tokens`);
  console.log(`  • Investidor 2: ${ethers.formatUnits(amount2, 6)} tokens`);
  console.log(`  • Emissor: ${ethers.formatUnits(await debenture.balanceOf(issuer.address), 6)} tokens`);

  // 3.4 Registrar cupom
  console.log("\n📅 Registrando primeiro cupom...");
  const couponDate = Math.floor(Date.now() / 1000);
  
  // Calculate PU per unit (e.g., 0.05 = 5% coupon per unit)
  // Using 6 decimals for PU precision
  const PRECISION_PU = 1000000n; // 6 decimals
  const puPerUnit = ethers.parseUnits("0.05", 6); // 5% coupon per unit
  
  // Calculate total amount (assuming all tokens are eligible)
  const totalSupply = await debenture.totalSupply();
  const totalCouponAmount = (totalSupply * puPerUnit) / PRECISION_PU;
  
  await debenture.recordCoupon(puPerUnit, totalCouponAmount);
  console.log(`  Data do cupom: ${new Date(couponDate * 1000).toLocaleDateString()}`);
  console.log(`  PU por unidade: ${ethers.formatUnits(puPerUnit, 6)}`);
  console.log(`  Valor total: ${ethers.formatUnits(totalCouponAmount, 6)} BRL`);

  // Obter informações do cupom
  const couponInfo = await debenture.couponRecords(0);
  console.log(`  PU registrado: ${ethers.formatUnits(couponInfo.puPerUnit, 6)}`);
  console.log(`  Valor total: ${ethers.formatUnits(couponInfo.totalAmount, 6)} BRL`);

  // 3.5 Calcular valores de cupom manualmente
  console.log("\n💵 Calculando valores de cupom...");
  const balance1 = await debenture.balanceOf(investor1.address);
  const balance2 = await debenture.balanceOf(investor2.address);
  const balance3 = await debenture.balanceOf(issuer.address);
  
  const coupon1 = (balance1 * puPerUnit) / PRECISION_PU;
  const coupon2 = (balance2 * puPerUnit) / PRECISION_PU;
  const coupon3 = (balance3 * puPerUnit) / PRECISION_PU;

  console.log(`  • Investidor 1: ${ethers.formatUnits(coupon1, 6)} BRL`);
  console.log(`  • Investidor 2: ${ethers.formatUnits(coupon2, 6)} BRL`);
  console.log(`  • Emissor: ${ethers.formatUnits(coupon3, 6)} BRL`);

  const totalCoupon = coupon1 + coupon2 + coupon3;
  console.log(`  • Total: ${ethers.formatUnits(totalCoupon, 6)} BRL`);

  // 3.6 Pagar cupons
  console.log("\n💳 Preparando pagamento de cupons...");

  // Transfer payment tokens to debenture contract
  await paymentToken.transfer(debentureAddress, totalCoupon);
  console.log(`  ${ethers.formatUnits(totalCoupon, 6)} BRL transferidos para contrato da debênture`);

  // Claim coupon for each investor (they call it themselves)
  await debenture.connect(investor1).claimCoupon(0);
  console.log("  ✅ Cupom reclamado pelo Investidor 1");

  await debenture.connect(investor2).claimCoupon(0);
  console.log("  ✅ Cupom reclamado pelo Investidor 2");

  await debenture.connect(issuer).claimCoupon(0);
  console.log("  ✅ Cupom reclamado pelo Emissor");

  // Verificar se cupom foi reclamado
  const claimed1 = await debenture.couponClaimed(investor1.address, 0);
  const claimed2 = await debenture.couponClaimed(investor2.address, 0);
  const claimed3 = await debenture.couponClaimed(issuer.address, 0);
  console.log(`\n  Status de reivindicação:`);
  console.log(`    Investidor 1: ${claimed1 ? "✅ Reclamado" : "❌ Pendente"}`);
  console.log(`    Investidor 2: ${claimed2 ? "✅ Reclamado" : "❌ Pendente"}`);
  console.log(`    Emissor: ${claimed3 ? "✅ Reclamado" : "❌ Pendente"}`);

  // 3.7 Verificar cupons pendentes
  console.log("\n📋 Verificando cupons pendentes...");
  const pending1 = await debenture.getPendingClaims(investor1.address);
  const pending2 = await debenture.getPendingClaims(investor2.address);
  console.log(`  • Investidor 1: ${pending1.length} cupons pendentes`);
  console.log(`  • Investidor 2: ${pending2.length} cupons pendentes`);

  // ===========================================================================
  // PARTE 4: FUNCIONALIDADES AVANÇADAS
  // ===========================================================================
  console.log("\n🚀 PARTE 4: Funcionalidades Avançadas");
  console.log("-".repeat(60));

  // 4.1 Teste de restrição de transferência (ERC-1404)
  console.log("\n🔒 Testando restrições de transferência (ERC-1404)...");
  const [, , , nonWhitelisted] = await ethers.getSigners();

  // Tentar transferir para não-whitelisted (deve falhar)
  const restrictionCode = await debenture.detectTransferRestriction(
    investor1.address,
    nonWhitelisted.address,
    ethers.parseUnits("100", 6)
  );
  console.log(`  Código de restrição: ${restrictionCode}`);
  console.log(`  Mensagem: ${await debenture.messageForTransferRestriction(restrictionCode)}`);

  // 4.2 Batch coupon claim
  if (pending1.length > 0) {
    console.log("\n📦 Testando claim em lote...");
    await debenture.connect(investor1).claimAllCoupons();
    console.log("  ✅ Todos os cupons reclamados com sucesso!");
  }

  // 4.3 Verificar suporte a interfaces
  console.log("\n🔍 Verificando suporte a interfaces (ERC-165)...");
  const supportsERC20 = await debenture.supportsInterface("0x36372b07"); // IERC20
  const supportsERC1404 = await debenture.supportsInterface("0xa0a2b070"); // IERC1404
  console.log(`  • ERC-20: ${supportsERC20 ? "✅" : "❌"}`);
  console.log(`  • ERC-1404: ${supportsERC1404 ? "✅" : "❌"}`);

  // ===========================================================================
  // RESUMO FINAL
  // ===========================================================================
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEMONSTRAÇÃO COMPLETA!");
  console.log("=".repeat(60));
  console.log("\n📊 Resumo:");
  console.log(`  • Oracle: ${ORACLE_ADDRESS}`);
  console.log(`  • Factory: ${FACTORY_ADDRESS}`);
  console.log(`  • Debênture: ${debentureAddress}`);
  console.log(`  • Payment Token: ${paymentTokenAddress}`);
  console.log(`\n✅ Funcionalidades demonstradas:`);
  console.log(`  1. Consulta de taxas no oracle`);
  console.log(`  2. Criação de debênture via factory (Clone Pattern)`);
  console.log(`  3. Whitelist e KYC`);
  console.log(`  4. Distribuição de tokens`);
  console.log(`  5. Registro e cálculo de cupons`);
  console.log(`  6. Pagamento de cupons`);
  console.log(`  7. Restrições de transferência (ERC-1404)`);
  console.log(`  8. Batch coupon claims`);
  console.log(`\n🔗 Block Explorer:`);
  console.log(`  https://sepolia.arbiscan.io/address/${debentureAddress}`);
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
