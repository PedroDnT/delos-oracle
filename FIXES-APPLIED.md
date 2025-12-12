# Quick Fixes Applied

## Issue 1: Frontend Next.js Config ✅ FIXED

**Problem**: Next.js 14 doesn't support TypeScript config files
```
Error: Configuring Next.js via 'next.config.ts' is not supported
```

**Solution**:
- Renamed `next.config.ts` → `next.config.js`
- Changed from ES6 export to CommonJS
- Changed TypeScript types to JSDoc comments

**Now works**: `npm run dev` should start successfully

---

## Issue 2: Backend Pydantic Settings ✅ FIXED

**Problem**: Extra fields in `.env` not defined in Settings class
```
ValidationError: Extra inputs are not permitted
- arbiscan_api_key
- basescan_api_key
- etherscan_api_key
- arbitrum_sepolia_rpc
```

**Solution**: Added `extra = "ignore"` to Config class in `backend/config.py`

This allows the backend to load from `../contracts/.env` without errors for contract-specific fields.

**Now works**: `python api.py` should start successfully

---

## Issue 3: DebentureFactory Too Large ⚠️ WORKAROUND

**Problem**: Contract exceeds 24KB limit (29KB actual)
```
Error: max code size exceeded
```

**Root Cause**: Factory includes full BrazilianDebenture bytecode (920 lines) for deployment

**Solution Created**:
- Created `SimpleDebentureRegistry.sol` (~80 lines)
- Lightweight registry that tracks debentures without deploying them
- Created `deploy-registry.ts` deployment script

**Workflow**:
1. Deploy debentures manually
2. Register them in SimpleDebentureRegistry
3. Frontend queries registry for list

**To Deploy Registry**:
```bash
cd contracts
npx hardhat run scripts/deploy-registry.ts --network arbitrumSepolia
```

---

## Next Steps

### 1. Test Frontend
```bash
cd frontend
npm run dev
# Visit http://localhost:3000
```

### 2. Test Backend
```bash
cd backend
source venv/bin/activate
python api.py
# Visit http://localhost:8000/docs
```

### 3. Deploy Registry (instead of Factory)
```bash
cd contracts
npx hardhat run scripts/deploy-registry.ts --network arbitrumSepolia

# After deployment, update frontend/.env.local:
# NEXT_PUBLIC_FACTORY_ADDRESS=<registry_address>
```

### 4. Manual Debenture Deployment (when needed)

Since the factory is too large, deploy debentures manually:

```bash
# Create a deploy-debenture.ts script with specific terms
npx hardhat run scripts/deploy-debenture.ts --network arbitrumSepolia

# Then register it:
npx hardhat console --network arbitrumSepolia
> const registry = await ethers.getContractAt("SimpleDebentureRegistry", "<REGISTRY_ADDRESS>")
> await registry.registerDebenture("<DEBENTURE_ADDRESS>", "BRTEST000001", "<ISSUER_ADDRESS>")
```

---

## Files Modified

1. `frontend/next.config.js` - Renamed from .ts, changed to CommonJS
2. `backend/config.py` - Added `extra = "ignore"` to Config
3. `contracts/contracts/SimpleDebentureRegistry.sol` - NEW lightweight registry
4. `contracts/scripts/deploy-registry.ts` - NEW deployment script
5. `contracts/scripts/deploy-factory.ts` - Fixed (but contract too large)

---

## Alternative: Future Improvement

To make DebentureFactory deployable, implement **EIP-1167 Minimal Proxies**:

1. Deploy BrazilianDebenture once as an implementation
2. Factory creates minimal proxy clones (~45 bytes each)
3. Dramatically reduces factory size

This would require refactoring BrazilianDebenture to support proxy pattern (initializer instead of constructor).

For now, **SimpleDebentureRegistry** is the pragmatic solution.
