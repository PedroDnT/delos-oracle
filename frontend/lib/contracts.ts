// Import ABIs from artifacts
import BrazilianMacroOracleABI from '../../contracts/artifacts/contracts/BrazilianMacroOracle.sol/BrazilianMacroOracle.json'
import DebentureCloneFactoryABI from '../../contracts/artifacts/contracts/DebentureCloneFactory.sol/DebentureCloneFactory.json'
import BrazilianDebentureCloneableABI from '../../contracts/artifacts/contracts/BrazilianDebentureCloneable.sol/BrazilianDebentureCloneable.json'

export const CONTRACTS = {
  oracle: {
    address: (process.env.NEXT_PUBLIC_ORACLE_ADDRESS || '0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe') as `0x${string}`,
    abi: BrazilianMacroOracleABI.abi,
  },
  factory: {
    // DebentureCloneFactory using EIP-1167 minimal proxy pattern
    address: (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f') as `0x${string}`,
    abi: DebentureCloneFactoryABI.abi,
  },
  debenture: {
    // BrazilianDebentureCloneable - the implementation contract
    abi: BrazilianDebentureCloneableABI.abi,
  },
}

// Contract addresses for Arbitrum Sepolia
export const CHAIN_ID = 421614

// Rate types enum
export enum RateType {
  IPCA = 'IPCA',
  CDI = 'CDI',
  SELIC = 'SELIC',
  PTAX = 'PTAX',
  IGPM = 'IGPM',
  TR = 'TR',
}
