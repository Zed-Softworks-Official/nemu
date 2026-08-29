#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Keep get.nemu.sh static install assets in sync with repo sources.
PUBLIC_DIR="$ROOT/apps/web/public"
mkdir -p "$PUBLIC_DIR/mosquitto" "$PUBLIC_DIR/zigbee2mqtt"
cp "$ROOT/scripts/install.sh" "$PUBLIC_DIR/install.sh"
cp "$ROOT/scripts/fetch-matter-roots.sh" "$PUBLIC_DIR/fetch-matter-roots.sh"
cp "$ROOT/scripts/matter-roots.sha256" "$PUBLIC_DIR/matter-roots.sha256"
cp "$ROOT/infra/prod/docker-compose.yml" "$PUBLIC_DIR/docker-compose.yml"
cp "$ROOT/infra/prod/mosquitto/mosquitto.conf" "$PUBLIC_DIR/mosquitto/mosquitto.conf"
cp "$ROOT/infra/prod/zigbee2mqtt/configuration.yaml" "$PUBLIC_DIR/zigbee2mqtt/configuration.yaml"
chmod +x "$PUBLIC_DIR/install.sh"

if [ "${VERCEL_ENV:-}" = "production" ]; then
    pnpm --filter @nemu/cloud exec convex deploy \
        --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL \
        --cmd "cd \"$ROOT\" && turbo run build --filter=@nemu/web"
else
    cd "$ROOT"
    turbo run build --filter=@nemu/web
fi
