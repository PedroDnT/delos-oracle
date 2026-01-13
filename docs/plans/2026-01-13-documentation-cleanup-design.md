# Documentation Cleanup Design

**Date**: 2026-01-13
**Status**: Approved
**Goal**: Align documentation with reality - remove aspirational language, clearly mark this as an explorational blueprint

---

## Problem Statement

Current documentation (README.md, CLAUDE.md) presents DELOS as a production MVP with:
- Economic projections ($1B+ TVL targets)
- Revenue models and timelines
- References to "AI-powered platform" and "comprehensive platform"
- Implied production deployment of backend services

**Reality**: This is an explorational blueprint with:
- Smart contracts deployed to testnet (manually updated to demonstrate functionality)
- Backend services as runnable code (not deployed)
- Frontend demo for interaction
- No production deployment, audit, or continuous operation

---

## Design Decisions

### 1. Hybrid Approach
- **Keep ANBIMA context** for understanding WHY this was built
- **Remove all aspirational claims** about production, revenue, TVL
- **Clearly mark conceptual vs implemented** throughout

### 2. Single Source of Truth
- **Consolidate into README.md** - remove CLAUDE.md (AI-specific tracking document)
- **Mark conceptual docs** - ECONOMICS.md, WORKFLOWS.md get "conceptual/proposed" labels
- **Keep technical docs** - API_REFERENCE.md, SMART_CONTRACTS.md remain (they document what exists)

### 3. Honest Status Markers
- "Explorational blueprint" not "comprehensive platform"
- "Runnable code demonstrating..." not "Automated backend"
- "Manually updated to demonstrate functionality" for oracle
- "(not deployed)" markers for backend services

---

## Implementation Plan

### 1. README.md Changes

**Title & Tagline (Line 1-3)**
```markdown
# DELOS - Brazilian Macro Oracle Blueprint

> Explorational implementation of on-chain macroeconomic data and tokenized debentures for Brazil
```

**Overview Section (Lines 13-22)**
- Add: "Status: Explorational blueprint with testnet deployment. Not production-ready."
- Change: "AI-powered platform" → "technical blueprint exploring"
- Change: "Automated Backend" → "Backend Services: Runnable code demonstrating..."

**Remove Economics Section (Lines 114-176)**
Replace with "What's Implemented" section:
- Smart Contracts (deployed to Arbitrum Sepolia) with addresses
- Backend Services (runnable code) with "(not deployed)" markers
- Frontend (Next.js 14) with actual capabilities
- Note about manual oracle updates

**Security Section (Lines 371-387)**
- Move "Not audited" to top with ⚠️ emoji
- Add explicit "NOT production-ready"
- Expand known limitations (5→6 items)
- Change "Future" to "Production Considerations"

**Documentation Section (Lines 319-343)**
- Mark ECONOMICS.md, WORKFLOWS.md as "*Conceptual*"
- Add note: "Documents marked conceptual describe potential implementations"

**Contributing/Acknowledgments (Lines 442-465)**
- "Pilot implementation" → "explorational blueprint"
- Reframe acknowledgments as inspiration, not partnerships
- Add: "Built as a technical exploration, not an official implementation"

**Footer (Lines 477-479)**
- Remove "Built with ❤️ for Brazil's tokenized securities future"
- Replace with: "Exploring blockchain infrastructure for Brazilian tokenized securities"

### 2. CLAUDE.md Removal
- Delete `/Users/pedrotodescan/Documents/code/delos-oracle/CLAUDE.md`
- This was AI session tracking, not user-facing documentation

### 3. Other Documentation Files
Check these files for similar cleanup needs:
- ECONOMICS.md - add disclaimer at top
- WORKFLOWS.md - add disclaimer at top
- FUTURE_IMPROVEMENTS.md - already conceptual, verify framing
- MVP_REVIEW_REPORT.md - check for aspirational language
- IMPLEMENTATION-COMPLETE.md - verify status accuracy

---

## Success Criteria

1. No economic projections or revenue models in README
2. Clear "explorational blueprint" positioning throughout
3. Honest markers for what's deployed vs runnable code
4. ANBIMA context preserved for understanding use case
5. All aspirational language removed or clearly marked as conceptual

---

## Testing

1. Read README start to finish - should feel honest and direct
2. Check for any remaining "production" or "platform" language
3. Verify all "(not deployed)" markers are present
4. Confirm conceptual docs are clearly labeled

---

## Notes

- Keep technical accuracy - don't downplay what WAS implemented
- Maintain professional tone - this is quality work, just not production
- ANBIMA context helps readers understand the domain problem
