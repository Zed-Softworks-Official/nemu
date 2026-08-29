#!/usr/bin/env bash
# Start local compose infra.
# Default (turbo `//#infra` / `pnpm infra`): postgres + mosquitto + zigbee2mqtt.
# Skips Matter root downloads, the chown sidecar, and the nemu-matter image build.
# Full Matter stack: `pnpm infra:full` or `NEMU_INFRA_FULL=1`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${ROOT}/infra/matter/controller"
COMPOSE_FILE="${ROOT}/docker-compose.dev.yml"

FULL=0
COMPOSE_ARGS=()
for arg in "$@"; do
  if [[ "${arg}" == "--full" ]]; then
    FULL=1
  else
    COMPOSE_ARGS+=("${arg}")
  fi
done
if [[ "${NEMU_INFRA_FULL:-}" == "1" ]]; then
  FULL=1
fi

mkdir -p "${DATA}/paa-roots" "${DATA}/cd-roots"

if [[ "${FULL}" -eq 1 ]]; then
  bash "${ROOT}/scripts/fetch-matter-roots.sh"
  # nemu-matter runs as uid 1000; if Docker creates the data dir as root,
  # the process cannot write the fabric store.
  docker run --rm -v "${DATA}:/data" alpine:3.20 chown -R 1000:1000 /data
  exec docker compose -f "${COMPOSE_FILE}" --profile matter up -d "${COMPOSE_ARGS[@]}"
fi

exec docker compose -f "${COMPOSE_FILE}" up -d "${COMPOSE_ARGS[@]}"
