#!/usr/bin/env bash
# setup-local.sh — Install Solana + Anchor toolchain locally (no container)
# Everything installs to ~/.local/share/solana/ and ~/.avm/ — no global pollution.

set -euo pipefail

SOLANA_VERSION="${SOLANA_VERSION:-1.18.26}"
ANCHOR_VERSION="${ANCHOR_VERSION:-0.30.1}"

echo ""
echo "=== Delos Oracle — Solana Dev Setup ==="
echo "  Solana: ${SOLANA_VERSION}"
echo "  Anchor: ${ANCHOR_VERSION}"
echo ""

# ── Rust ──────────────────────────────────────────────────────────────────────
if ! command -v cargo &>/dev/null; then
  echo "[1/4] Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  source "${HOME}/.cargo/env"
else
  echo "[1/4] Rust already installed ($(rustc --version))"
fi

# ── Solana CLI ────────────────────────────────────────────────────────────────
SOLANA_BIN="${HOME}/.local/share/solana/install/active_release/bin"
if ! command -v solana &>/dev/null; then
  echo "[2/4] Installing Solana CLI ${SOLANA_VERSION}..."
  sh -c "$(curl -sSfL https://release.solana.com/v${SOLANA_VERSION}/install)"
  export PATH="${SOLANA_BIN}:${PATH}"
  # Add to shell profile
  for rc in ~/.bashrc ~/.zshrc; do
    if [ -f "$rc" ]; then
      echo "export PATH=\"${SOLANA_BIN}:\$PATH\"" >> "$rc"
    fi
  done
else
  echo "[2/4] Solana already installed ($(solana --version))"
fi

# ── Anchor via avm ────────────────────────────────────────────────────────────
if ! command -v anchor &>/dev/null; then
  echo "[3/4] Installing Anchor ${ANCHOR_VERSION} via avm..."
  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
  avm install "${ANCHOR_VERSION}"
  avm use "${ANCHOR_VERSION}"
else
  echo "[3/4] Anchor already installed ($(anchor --version))"
fi

# ── Solana keypair + devnet config ────────────────────────────────────────────
echo "[4/4] Configuring devnet..."
if [ ! -f "${HOME}/.config/solana/id.json" ]; then
  solana-keygen new --no-bip39-passphrase -o "${HOME}/.config/solana/id.json"
fi
solana config set --url devnet
solana airdrop 2 --url devnet || echo "  (airdrop may be rate-limited — try again later)"

# ── Node + crank deps ─────────────────────────────────────────────────────────
echo ""
echo "Installing crank dependencies..."
cd solana-crank && npm install && cd ..

echo ""
echo "=== Setup complete ==="
echo ""
echo "  Public key : $(solana address --url devnet)"
echo "  Balance    : $(solana balance --url devnet)"
echo ""
echo "Next steps:"
echo "  make build   — compile the Anchor program"
echo "  make test    — run tests against local validator"
echo "  make deploy  — deploy to devnet"
echo ""
echo "NOTE: Restart your shell or run:"
echo "  export PATH=\"${SOLANA_BIN}:\$PATH\""
echo "  source \${HOME}/.cargo/env"
echo ""
