#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Dashboard production has no deploy key and keeps NEXT_PUBLIC_CONVEX_URL.
# Canary publishes the shared preview deployment and bakes in its URL.
if [ -n "${CONVEX_DEPLOY_KEY:-}" ] && { [ "${VERCEL_ENV:-}" = "production" ] || [ "${VERCEL_TARGET_ENV:-}" = "canary" ]; }; then
    pnpm --filter @nemu/cloud exec convex deploy \
        --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL \
        --cmd "cd \"$ROOT\" && turbo run build --filter=@nemu/dashboard"
else
    cd "$ROOT"
    turbo run build --filter=@nemu/dashboard
fi
