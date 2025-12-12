// Import ABIs from typechain-generated files
import BrazilianMacroOracleABI from '../../contracts/artifacts/contracts/BrazilianMacroOracle.sol/BrazilianMacroOracle.json'
import DebentureFactoryABI from '../../contracts/artifacts/contracts/DebentureFactory.sol/DebentureFactory.json'
import BrazilianDebentureABI from '../../contracts/artifacts/contracts/BrazilianDebenture.sol/BrazilianDebenture.json'

export const CONTRACTS = {
  oracle: {
    address: (process.env.NEXT_PUBLIC_ORACLE_ADDRESS || '0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe') as `0x${string}`,
    abi: BrazilianMacroOracleABI.abi,
  },
  factory: {
    address: (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    abi: DebentureFactoryABI.abi,
  },
  debenture: {
    abi: BrazilianDebentureABI.abi,
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
