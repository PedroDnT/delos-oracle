import { ethers } from "hardhat";

async function main() {
    console.log("Deploying BrazilianMacroOracle...");

    const BrazilianMacroOracle = await ethers.getContractFactory("BrazilianMacroOracle");
    const oracle = await BrazilianMacroOracle.deploy();
    await oracle.waitForDeployment();

    const address = await oracle.getAddress();
    console.log(`✅ Oracle deployed to: ${address}`);

    // Wait for confirmations before verification
    console.log("Waiting for 5 block confirmations...");
    await oracle.deploymentTransaction()?.wait(5);

    console.log("\nNext steps:");
    console.log(`1. Verify: npx hardhat verify --network arbitrumSepolia ${address}`);
    console.log(`2. Update .env: ORACLE_ADDRESS=${address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });