#!/bin/bash
echo "🎨 Running Prettier to clean up formatting..."
npx prettier --write . 2>/dev/null || echo "⚠️ Prettier not found, skipping."
exit 0
