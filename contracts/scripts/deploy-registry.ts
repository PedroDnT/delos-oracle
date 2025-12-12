import { ethers } from "hardhat";

async function main() {
    // Get the oracle address from environment or use deployed address
    const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS || "0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe";

    console.log("Deploying SimpleDebentureRegistry...");
    console.log(`Using Oracle: ${ORACLE_ADDRESS}`);

    const SimpleDebentureRegistry = await ethers.getContractFactory("SimpleDebentureRegistry");
    const registry = await SimpleDebentureRegistry.deploy(ORACLE_ADDRESS);
    await registry.waitForDeployment();

    const address = await registry.getAddress();
    console.log(`\nSimpleDebentureRegistry deployed to: ${address}`);

    // Wait for confirmations before verification
    console.log("\nWaiting for 5 block confirmations...");
    await registry.deploymentTransaction()?.wait(5);

    console.log("\n✅ Deployment Complete!");
    console.log("\nNext steps:");
    console.log(`1. Verify: npx hardhat verify --network arbitrumSepolia ${address} "${ORACLE_ADDRESS}"`);
    console.log(`2. Update .env: REGISTRY_ADDRESS=${address}`);
    console.log(`3. Update frontend/.env.local: NEXT_PUBLIC_FACTORY_ADDRESS=${address}`);
    console.log("\nNote: This is a simple registry. Debentures must be deployed manually and then registered.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
