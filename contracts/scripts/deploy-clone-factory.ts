import { ethers } from "hardhat";

/**
 * Deploy the Clone-based Debenture Factory
 *
 * This script deploys:
 * 1. BrazilianDebentureCloneable - Implementation contract (deployed once)
 * 2. DebentureCloneFactory - Factory that creates minimal proxy clones
 *
 * Benefits:
 * - Factory is only ~6.7KB (vs 29KB original)
 * - Each clone costs ~45K gas (vs ~3M for full deployment)
 * - All clones share the same bytecode
 */
async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("=".repeat(60));
    console.log("DELOS Clone Factory Deployment");
    console.log("=".repeat(60));
    console.log(`Deployer: ${deployer.address}`);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    // Configuration
    const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS || "0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe";
    const DEFAULT_PAYMENT_TOKEN = process.env.DEFAULT_PAYMENT_TOKEN || ethers.ZeroAddress;

    console.log("\nConfiguration:");
    console.log(`  Oracle: ${ORACLE_ADDRESS}`);
    console.log(`  Default Payment Token: ${DEFAULT_PAYMENT_TOKEN}`);

    // Step 1: Deploy Implementation
    console.log("\n1. Deploying BrazilianDebentureCloneable (Implementation)...");
    const Implementation = await ethers.getContractFactory("BrazilianDebentureCloneable");
    const implementation = await Implementation.deploy();
    await implementation.waitForDeployment();
    const implAddress = await implementation.getAddress();
    console.log(`   Implementation deployed: ${implAddress}`);

    // Wait for confirmations
    console.log("   Waiting for 3 block confirmations...");
    await implementation.deploymentTransaction()?.wait(3);

    // Step 2: Deploy Clone Factory
    console.log("\n2. Deploying DebentureCloneFactory...");
    const Factory = await ethers.getContractFactory("DebentureCloneFactory");
    const factory = await Factory.deploy(
        implAddress,
        ORACLE_ADDRESS,
        DEFAULT_PAYMENT_TOKEN
    );
    await factory.waitForDeployment();
    const factoryAddress = await factory.getAddress();
    console.log(`   Factory deployed: ${factoryAddress}`);

    // Wait for confirmations
    console.log("   Waiting for 3 block confirmations...");
    await factory.deploymentTransaction()?.wait(3);

    // Verify deployment
    console.log("\n3. Verifying deployment...");
    const implFromFactory = await factory.implementation();
    const oracleFromFactory = await factory.oracle();
    const ownerFromFactory = await factory.owner();

    console.log(`   Factory.implementation: ${implFromFactory}`);
    console.log(`   Factory.oracle: ${oracleFromFactory}`);
    console.log(`   Factory.owner: ${ownerFromFactory}`);

    const implMatch = implFromFactory.toLowerCase() === implAddress.toLowerCase();
    const oracleMatch = oracleFromFactory.toLowerCase() === ORACLE_ADDRESS.toLowerCase();

    if (!implMatch || !oracleMatch) {
        console.error("   ❌ Verification failed!");
        process.exit(1);
    }
    console.log("   ✅ Verification passed!");

    // Output summary
    console.log("\n" + "=".repeat(60));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log(`
Implementation (BrazilianDebentureCloneable):
  Address: ${implAddress}

Factory (DebentureCloneFactory):
  Address: ${factoryAddress}

Oracle:
  Address: ${ORACLE_ADDRESS}
`);

    // Next steps
    console.log("=".repeat(60));
    console.log("NEXT STEPS");
    console.log("=".repeat(60));
    console.log(`
1. Verify contracts on Arbiscan:

   npx hardhat verify --network arbitrumSepolia ${implAddress}

   npx hardhat verify --network arbitrumSepolia ${factoryAddress} \\
     "${implAddress}" \\
     "${ORACLE_ADDRESS}" \\
     "${DEFAULT_PAYMENT_TOKEN}"

2. Update environment files:

   # contracts/.env
   IMPLEMENTATION_ADDRESS=${implAddress}
   FACTORY_ADDRESS=${factoryAddress}

   # frontend/.env.local
   NEXT_PUBLIC_FACTORY_ADDRESS=${factoryAddress}

3. Test creating a debenture:

   npx hardhat console --network arbitrumSepolia
   > const factory = await ethers.getContractAt("DebentureCloneFactory", "${factoryAddress}")
   > await factory.getTotalDebentures()  // Should return 0
`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
