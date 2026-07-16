#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cp "$ROOT/microfrontends.json" "$ROOT/apps/web/microfrontends.json"

if [ "${VERCEL_ENV:-}" = "production" ]; then
    pnpm --filter @nemu/cloud exec convex deploy \
        --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL \
        --cmd "cd \"$ROOT\" && turbo run build --filter=@nemu/web"
else
    cd "$ROOT"
    turbo run build --filter=@nemu/web
fi
