#!/usr/bin/env bash
set -euo pipefail

echo "  Sentinel Installer"
echo "══════════════════════"

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: Node.js >=22 is required. Install from https://nodejs.org"; exit 1; }
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 22 ]; then echo "Error: Node.js >=22 required (found $(node -v))"; exit 1; fi

command -v pnpm >/dev/null 2>&1 || {
  echo "Installing pnpm..."
  corepack enable && corepack prepare pnpm@10 --activate || npm install -g pnpm@10
}

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building packages..."
pnpm build:deps

# Enable V8 compile cache for faster startup (Node 22+)
export NODE_COMPILE_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/sentinel/compile-cache"
mkdir -p "$NODE_COMPILE_CACHE"
echo "V8 compile cache: $NODE_COMPILE_CACHE"

# Add to shell rc if not present
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  if [ -f "$rc" ]; then
    if ! grep -q "NODE_COMPILE_CACHE.*sentinel" "$rc" 2>/dev/null; then
      echo "export NODE_COMPILE_CACHE=\"\${XDG_CACHE_HOME:-\$HOME/.cache}/sentinel/compile-cache\"" >> "$rc"
      echo "Added NODE_COMPILE_CACHE to $rc"
    fi
  fi
done

echo "Linking CLI..."
pnpm --filter @sentinel/cli exec -- pnpm link --global 2>/dev/null || true

echo "  Done! Run 'sentinel --help' to get started."
echo "  Configuration: .sentinel/config.json"
