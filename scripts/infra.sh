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

# matterjs-server auto-picks an interface; a docker bridge is often UP and
# wins, so operational discovery never sees Wi-Fi devices on the LAN.
if [[ -z "${PRIMARY_INTERFACE:-}" ]]; then
  PRIMARY_INTERFACE="$(
    ip -4 route show default 2>/dev/null \
      | awk '{ for (i = 1; i <= NF; i++) if ($i == "dev") { print $(i + 1); exit } }'
  )"
  if [[ -z "${PRIMARY_INTERFACE}" ]]; then
    PRIMARY_INTERFACE="$(
      ip -6 route show default 2>/dev/null \
        | awk '{ for (i = 1; i <= NF; i++) if ($i == "dev") { print $(i + 1); exit } }'
    )"
  fi
fi
if [[ -n "${PRIMARY_INTERFACE}" ]]; then
  export PRIMARY_INTERFACE
  echo "Matter mDNS interface: ${PRIMARY_INTERFACE}"
fi

exec docker compose -f "${COMPOSE_FILE}" up -d "$@"
