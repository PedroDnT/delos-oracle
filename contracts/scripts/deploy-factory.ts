import { ethers } from "hardhat";

async function main() {
    // Get the oracle address from environment or use deployed address
    const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS || "0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe";

    // Default payment token (address(0) = no default, issuers specify per debenture)
    const DEFAULT_PAYMENT_TOKEN = ethers.ZeroAddress;

    console.log("Deploying DebentureFactory...");
    console.log(`Using Oracle: ${ORACLE_ADDRESS}`);
    console.log(`Default Payment Token: ${DEFAULT_PAYMENT_TOKEN} (none)`);

    const DebentureFactory = await ethers.getContractFactory("DebentureFactory");
    const factory = await DebentureFactory.deploy(ORACLE_ADDRESS, DEFAULT_PAYMENT_TOKEN);
    await factory.waitForDeployment();

    const address = await factory.getAddress();
    console.log(`\nDebentureFactory deployed to: ${address}`);

    // Wait for confirmations before verification
    console.log("\nWaiting for 5 block confirmations...");
    await factory.deploymentTransaction()?.wait(5);

    console.log("\nNext steps:");
    console.log(`1. Verify: npx hardhat verify --network arbitrumSepolia ${address} "${ORACLE_ADDRESS}" "${DEFAULT_PAYMENT_TOKEN}"`);
    console.log(`2. Update .env: FACTORY_ADDRESS=${address}`);
    console.log(`3. Update frontend/.env.local: NEXT_PUBLIC_FACTORY_ADDRESS=${address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
