.PHONY: help setup build test deploy publish airdrop logs

# ── Dev container (recommended) ───────────────────────────────────────────────
dev:
	docker build -t delos-dev .devcontainer/
	docker run -it --rm -v $(PWD):/workspace -w /workspace delos-dev bash

# ── Local setup (alternative — no container) ──────────────────────────────────
setup:
	@bash scripts/setup-local.sh

# ── Anchor ────────────────────────────────────────────────────────────────────
build:
	anchor build

test:
	anchor test

# Deploy to devnet and update Anchor.toml + crank .env with real Program ID
deploy:
	@echo "Deploying to devnet..."
	anchor deploy --provider.cluster devnet
	@echo ""
	@echo "👉  Update PROGRAM_ID in Anchor.toml and solana-crank/.env"

# ── Publisher crank ───────────────────────────────────────────────────────────
publish:
	cd solana-crank && npm install && npx ts-node src/publish.ts

publish-dry:
	cd solana-crank && npm install && DRY_RUN=true npx ts-node src/publish.ts

# ── Solana devnet utils ───────────────────────────────────────────────────────
airdrop:
	solana airdrop 2 --url devnet

keypair:
	solana-keygen new --no-bip39-passphrase -o ~/.config/solana/id.json
	solana config set --url devnet
	@echo "Public key: $$(solana address)"

balance:
	solana balance --url devnet

logs:
	solana logs --url devnet

help:
	@echo ""
	@echo "  make dev          — Start dev container (Docker)"
	@echo "  make setup        — Install Solana + Anchor locally (no container)"
	@echo "  make build        — anchor build"
	@echo "  make test         — anchor test (local validator)"
	@echo "  make deploy       — anchor deploy --devnet"
	@echo "  make publish      — Run BCB → Solana publisher"
	@echo "  make publish-dry  — Fetch BCB data without posting TXs"
	@echo "  make airdrop      — Get 2 devnet SOL"
	@echo "  make keypair      — Generate new Solana keypair"
	@echo "  make balance      — Check devnet balance"
	@echo ""
