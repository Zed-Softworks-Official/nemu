#!/usr/bin/env bash
# Start local compose infra. matterjs-server runs as uid 1000; if Docker creates
# infra/matter as root, the process dies on mkdir /data/config and never binds 5580.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${ROOT}/infra/matter"
COMPOSE_FILE="${ROOT}/docker-compose.dev.yml"

mkdir -p "${DATA}"

# Use the daemon (root in typical installs) so we don't need sudo on the host.
docker run --rm -v "${DATA}:/data" alpine:3.20 chown -R 1000:1000 /data

exec docker compose -f "${COMPOSE_FILE}" up -d "$@"
