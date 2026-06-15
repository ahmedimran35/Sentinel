#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

echo "Building Sentinel"
echo "══════════════════"

# Order matters: shared -> providers -> mcp -> core -> tools -> sdk -> server -> tui -> cli
packages=(
  "@sentinel/shared"
  "@sentinel/providers"
  "@sentinel/mcp"
  "@sentinel/core"
  "@sentinel/tools"
  "@sentinel/sdk"
  "@sentinel/server"
  "@sentinel/tui"
  "@sentinel/cli"
)

for pkg in "${packages[@]}"; do
  echo "Building $pkg..."
  pnpm --filter "$pkg" build
done

echo "All packages built successfully."
