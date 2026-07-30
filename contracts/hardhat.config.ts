import { HardhatUserConfig } from "hardhat/config";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatEthersChaiMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  // Hardhat 3 requires plugins to be registered explicitly; a bare `import`
  // no longer registers them.
  plugins: [
    hardhatMocha,
    hardhatEthers,
    hardhatNetworkHelpers,
    hardhatVerify,
    hardhatEthersChaiMatchers,
  ],
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    // In-process EDR network used by the test suite
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },
    // Arbitrum Sepolia (testnet)
    arbitrumSepolia: {
      type: "http",
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Base Sepolia (testnet)
    baseSepolia: {
      type: "http",
      url: "https://sepolia.base.org",
      chainId: 84532,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY || "",
    },
    blockscout: {
      enabled: false,
    },
  },
};

export default config;
