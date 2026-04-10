FROM rust:1.79-slim-bookworm

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

# Solana CLI (to isolated path)
ENV SOLANA_VERSION=1.18.26
RUN sh -c "$(curl -sSfL https://release.solana.com/v${SOLANA_VERSION}/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Anchor via avm
ENV ANCHOR_VERSION=0.30.1
RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force \
    && avm install ${ANCHOR_VERSION} \
    && avm use ${ANCHOR_VERSION}

# Generate a dev keypair for container use
RUN solana-keygen new --no-bip39-passphrase -o /root/.config/solana/id.json \
    && solana config set --url devnet

WORKDIR /workspace
