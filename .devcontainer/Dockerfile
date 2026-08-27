FROM rust:1.84-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# Minimal system deps for Solana/Anchor
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git pkg-config libssl-dev libudev-dev build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20 (minimal)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g yarn \
    && rm -rf /var/lib/apt/lists/*

# Solana CLI. release.solana.com no longer serves a working TLS endpoint
# (curl SSL_ERROR_SYSCALL); the installer now lives on release.anza.xyz.
# Write the script to a file first so a failed download fails the build
# instead of becoming `sh -c ""`.
ENV SOLANA_VERSION=1.18.26
RUN curl -sSfL "https://release.anza.xyz/v${SOLANA_VERSION}/install" -o /tmp/solana-install.sh \
    && sh /tmp/solana-install.sh \
    && rm /tmp/solana-install.sh
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Anchor 0.30.1 must be compiled with rustc 1.79:
# - Unpinned `cargo install --git ... avm` follows HEAD, which needs edition2024.
# - On rustc 1.84, `--locked` fails (old `time` crate vs rustc >= 1.80) and an
#   unlocked resolve pulls crates that require edition2024 / rustc 1.85–1.88.
ENV ANCHOR_VERSION=0.30.1
RUN rustup toolchain install 1.79.0 --profile minimal \
    && rustup run 1.79.0 cargo install --git https://github.com/solana-foundation/anchor \
        --tag "v${ANCHOR_VERSION}" anchor-cli --locked --force \
    && anchor --version

# Generate a dev keypair for container use
RUN mkdir -p /root/.config/solana \
    && solana-keygen new --no-bip39-passphrase -o /root/.config/solana/id.json \
    && solana config set --url devnet \
    && solana --version

WORKDIR /workspace
