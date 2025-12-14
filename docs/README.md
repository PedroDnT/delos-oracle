# DELOS Documentation

Welcome to the DELOS Brazilian Macro Oracle Platform documentation.

## Quick Links

| Document | Description | Audience |
|----------|-------------|----------|
| [Technical Documentation](./TECHNICAL_DOCUMENTATION.md) | Comprehensive system documentation | All |
| [API Reference](./API_REFERENCE.md) | REST API endpoints and schemas | Backend Developers |
| [Smart Contracts](./SMART_CONTRACTS.md) | Contract interfaces and ABIs | Blockchain Developers |
| [Developer Guide](./DEVELOPER_GUIDE.md) | Setup and development workflow | Developers |
| [User Guide](./USER_GUIDE.md) | Frontend usage and walkthroughs | End Users |

## Overview

DELOS is a Brazilian Macro Data Oracle Platform providing on-chain access to Banco Central do Brasil (BCB) macroeconomic indicators for tokenized debentures.

### Key Features

- **6 Brazilian Macro Rates**: IPCA, CDI, SELIC, PTAX, IGP-M, TR
- **Chainlink Compatibility**: 8-decimal precision, AggregatorV3Interface
- **Gas-Efficient Debentures**: EIP-1167 minimal proxy pattern (98% savings)
- **ERC-1404 Compliance**: Transfer restrictions for regulatory compliance
- **Automated Updates**: APScheduler-based BCB data synchronization
- **Real-time Frontend**: Next.js 14 dashboard with wallet integration

### Deployed Contracts (Arbitrum Sepolia)

| Contract | Address |
|----------|---------|
| BrazilianMacroOracle | `0xe52d06e96A0ad3e81f23dF5464Ef059c72B3D8fe` |
| BrazilianDebentureCloneable | `0x8856dd1f536169B8A82D8DA5476F9765b768f51D` |
| DebentureCloneFactory | `0x946ca8D40717D7C4bD0fCF134527b890D9b5DF6f` |

## Documentation Structure

### For Developers

1. Start with [Developer Guide](./DEVELOPER_GUIDE.md) for setup instructions
2. Review [Technical Documentation](./TECHNICAL_DOCUMENTATION.md) for architecture
3. Consult [API Reference](./API_REFERENCE.md) for backend integration
4. Check [Smart Contracts](./SMART_CONTRACTS.md) for blockchain integration

### For End Users

1. Read the [User Guide](./USER_GUIDE.md) for application usage
2. Refer to the FAQ section for common questions

### For Architects

1. Review [Technical Documentation](./TECHNICAL_DOCUMENTATION.md) for full system overview
2. Check the Architecture Overview section for diagrams
3. Review Design Decisions section for rationale

## Quick Start

```bash
# Clone repository
git clone https://github.com/your-org/delos-oracle.git
cd delos-oracle

# Setup contracts
cd contracts && npm install && npx hardhat compile

# Setup backend
cd ../backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Setup frontend
cd ../frontend && npm install

# Run the stack
# Terminal 1: Backend API
cd backend && python api.py

# Terminal 2: Frontend
cd frontend && npm run dev
```

See [Developer Guide](./DEVELOPER_GUIDE.md) for detailed instructions.

## Document Versions

| Document | Version | Last Updated |
|----------|---------|--------------|
| Technical Documentation | 1.0.0 | December 2024 |
| API Reference | 1.0.0 | December 2024 |
| Smart Contracts | 1.0.0 | December 2024 |
| Developer Guide | 1.0.0 | December 2024 |
| User Guide | 1.0.0 | December 2024 |

## Contributing

To contribute to documentation:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For questions or issues:
1. Check existing documentation
2. Review project CLAUDE.md for context
3. Open a GitHub issue

---

*DELOS - Brazilian Macro Oracle Platform for ANBIMA Tokenized Securities Pilot*
