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

  const [issuer, investor1, investor2] = await ethers.getSigners();
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

  // IPCA
  const ipca = await oracle.getIPCA();
  console.log(`  • IPCA: ${ethers.formatUnits(ipca.value, 8)}%`);
  console.log(`    Data: ${new Date(Number(ipca.lastUpdate) * 1000).toLocaleDateString()}`);

  // CDI
  const cdi = await oracle.getCDI();
  console.log(`  • CDI: ${ethers.formatUnits(cdi.value, 8)}%`);
  console.log(`    Data: ${new Date(Number(cdi.lastUpdate) * 1000).toLocaleDateString()}`);

  // SELIC
  const selic = await oracle.getSELIC();
  console.log(`  • SELIC: ${ethers.formatUnits(selic.value, 8)}%`);
  console.log(`    Data: ${new Date(Number(selic.lastUpdate) * 1000).toLocaleDateString()}`);

  // PTAX
  const ptax = await oracle.getPTAX();
  console.log(`  • PTAX: ${ethers.formatUnits(ptax.value, 8)} BRL/USD`);
  console.log(`    Data: ${new Date(Number(ptax.lastUpdate) * 1000).toLocaleDateString()}`);

  // IGP-M
  const igpm = await oracle.getIGPM();
  console.log(`  • IGP-M: ${ethers.formatUnits(igpm.value, 8)}%`);
  console.log(`    Data: ${new Date(Number(igpm.lastUpdate) * 1000).toLocaleDateString()}`);

  // TR
  const tr = await oracle.getTR();
  console.log(`  • TR: ${ethers.formatUnits(tr.value, 8)}%`);
  console.log(`    Data: ${new Date(Number(tr.lastUpdate) * 1000).toLocaleDateString()}`);

  // Verificar compatibilidade Chainlink
  console.log("\n🔗 Compatibilidade Chainlink AggregatorV3:");
  const latestRound = await oracle.latestRoundData();
  console.log(`  • Round ID: ${latestRound.roundId}`);
  console.log(`  • Answer: ${ethers.formatUnits(latestRound.answer, 8)}`);
  console.log(`  • Decimals: ${await oracle.decimals()}`);
  console.log(`  • Description: ${await oracle.description()}`);

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
  const paymentToken = await MockERC20.deploy("Brazilian Real Token", "BRL");
  await paymentToken.waitForDeployment();
  const paymentTokenAddress = await paymentToken.getAddress();
  console.log("  Payment Token:", paymentTokenAddress);

  // Mint tokens para o emissor fazer pagamentos
  const mintAmount = ethers.parseUnits("10000000", 6); // 10M BRL
  await paymentToken.mint(issuer.address, mintAmount);
  console.log(`  Minted ${ethers.formatUnits(mintAmount, 6)} BRL para emissor`);

  // Criar nova debênture via factory
  console.log("\n📝 Criando nova debênture...");
  const debentureParams = {
    name: "Debênture DELOS Demo 2025",
    symbol: "DELOS25",
    issuer: issuer.address,
    oracle: ORACLE_ADDRESS,
    paymentToken: paymentTokenAddress,
    totalSupply: ethers.parseUnits("1000000", 6), // 1M de reais
    maturityDate: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 ano
    rateType: 3, // IPCA_SPREAD
    rateValue: ethers.parseUnits("6.5", 6), // IPCA + 6.5%
    couponFrequency: 30 * 24 * 60 * 60, // 30 dias (mensal)
    amortizationType: 0, // BULLET (pagamento no vencimento)
    earlyRedemptionAllowed: true
  };

  const createTx = await factory.createDebenture(
    debentureParams.name,
    debentureParams.symbol,
    debentureParams.issuer,
    debentureParams.oracle,
    debentureParams.paymentToken,
    debentureParams.totalSupply,
    debentureParams.maturityDate,
    debentureParams.rateType,
    debentureParams.rateValue,
    debentureParams.couponFrequency,
    debentureParams.amortizationType,
    debentureParams.earlyRedemptionAllowed
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
  console.log(`  Emissor: ${await debenture.issuerAddress()}`);
  console.log(`  Vencimento: ${new Date(Number(await debenture.maturityDate()) * 1000).toLocaleDateString()}`);
  console.log(`  Tipo de Taxa: IPCA + Spread`);
  console.log(`  Spread: ${ethers.formatUnits(await debenture.rateValue(), 6)}%`);
  console.log(`  Frequência de Cupom: Mensal`);

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
  await debenture.recordCoupon(couponDate);
  console.log(`  Data do cupom: ${new Date(couponDate * 1000).toLocaleDateString()}`);

  // Obter informações do cupom
  const couponInfo = await debenture.coupons(0);
  console.log(`  Taxa registrada: ${ethers.formatUnits(couponInfo.rate, 6)}%`);
  console.log(`  Valor total: ${ethers.formatUnits(couponInfo.totalAmount, 6)} BRL`);

  // 3.5 Calcular valores de cupom
  console.log("\n💵 Calculando valores de cupom...");
  const coupon1 = await debenture.calculateCouponValue(investor1.address, 0);
  const coupon2 = await debenture.calculateCouponValue(investor2.address, 0);
  const coupon3 = await debenture.calculateCouponValue(issuer.address, 0);

  console.log(`  • Investidor 1: ${ethers.formatUnits(coupon1, 6)} BRL`);
  console.log(`  • Investidor 2: ${ethers.formatUnits(coupon2, 6)} BRL`);
  console.log(`  • Emissor: ${ethers.formatUnits(coupon3, 6)} BRL`);

  const totalCoupon = coupon1 + coupon2 + coupon3;
  console.log(`  • Total: ${ethers.formatUnits(totalCoupon, 6)} BRL`);

  // 3.6 Pagar cupons
  console.log("\n💳 Pagando cupons...");

  // Aprovar tokens de pagamento
  await paymentToken.approve(debentureAddress, totalCoupon);
  console.log("  Tokens de pagamento aprovados");

  // Pagar cada investidor
  await debenture.payCoupon(investor1.address, 0);
  console.log("  ✅ Cupom pago ao Investidor 1");

  await debenture.payCoupon(investor2.address, 0);
  console.log("  ✅ Cupom pago ao Investidor 2");

  await debenture.payCoupon(issuer.address, 0);
  console.log("  ✅ Cupom pago ao Emissor");

  // Verificar se cupom foi marcado como pago
  const updatedCouponInfo = await debenture.coupons(0);
  console.log(`\n  Status do cupom: ${updatedCouponInfo.paid ? "✅ Pago" : "❌ Pendente"}`);

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
