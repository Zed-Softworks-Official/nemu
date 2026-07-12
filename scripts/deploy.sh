#!/usr/bin/env bash
# Deploy Convex backend and build the web app (production Convex URL injected at build time).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Deploying Convex and building @nemu/web..."

if [ -f "$ROOT/.env" ]; then
    exec dotenv -e "$ROOT/.env" -- turbo run deploy --filter=@nemu/cloud
else
    exec turbo run deploy --filter=@nemu/cloud
fi
