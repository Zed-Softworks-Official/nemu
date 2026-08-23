#!/usr/bin/env bash
# Start local compose infra. nemu-matter runs as uid 1000; if Docker creates
# infra/matter/controller as root, the process cannot write the fabric store.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${ROOT}/infra/matter/controller"
COMPOSE_FILE="${ROOT}/docker-compose.dev.yml"

mkdir -p "${DATA}/paa-roots" "${DATA}/cd-roots"
bash "${ROOT}/scripts/fetch-matter-roots.sh"

# Use the daemon (root in typical installs) so we don't need sudo on the host.
docker run --rm -v "${DATA}:/data" alpine:3.20 chown -R 1000:1000 /data

exec docker compose -f "${COMPOSE_FILE}" up -d "$@"
