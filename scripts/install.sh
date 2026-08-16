#!/usr/bin/env sh
# Nemu controller installer for Ubuntu Server (amd64 / arm64).
#
# Environment variables must be passed to `sh`, not `curl`. `sudo` resets the
# environment, so prefix vars on the `sudo … sh` side (or pass flags after `--`).
#
# Usage:
#   curl -fsSL https://get.nemu.sh | sudo sh
#   curl -fsSL https://get.nemu.sh | sudo NEMU_FORCE=1 NEMU_CONVEX_SITE_URL=https://….convex.site sh
#   curl -fsSL https://get.nemu.sh | sudo sh -s -- --force --convex-url=https://….convex.cloud
# Inspect without running:
#   curl -fsSL https://get.nemu.sh
#
# Optional env (or matching --flags):
#   NEMU_CONVEX_SITE_URL  Convex HTTP site URL (https://….convex.site)
#   CONVEX_URL            Alias; .convex.cloud is rewritten to .convex.site
#   NEMU_CONTROLLER_NAME  Display name (default Home)
#   CONTROLLER_REGISTRATION_SECRET
#   NEMU_ZIGBEE_DEVICE    Host serial path
#   NEMU_FORCE=1          Overwrite existing /opt/nemu compose files
#   NEMU_INSTALL_DIR      Default /opt/nemu
#   GET_NEMU_BASE_URL     Default https://get.nemu.sh

set -eu

BASE_URL="${GET_NEMU_BASE_URL:-https://get.nemu.sh}"
INSTALL_DIR="${NEMU_INSTALL_DIR:-/opt/nemu}"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
ENV_FILE="${INSTALL_DIR}/.env"

FORCE=0
ARG_CONVEX_URL=""
ARG_CONTROLLER_NAME=""
ARG_ZIGBEE_DEVICE=""
ARG_REGISTRATION_SECRET=""

log() {
  printf '==> %s\n' "$*"
}

warn() {
  printf 'warning: %s\n' "$*" >&2
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

is_truthy() {
  case "${1:-}" in
    1 | true | TRUE | yes | YES | on | ON) return 0 ;;
    *) return 1 ;;
  esac
}

is_force() {
  is_truthy "${NEMU_FORCE:-}" || [ "${FORCE}" = "1" ]
}

# Convex HTTP actions live on *.convex.site; client URLs are *.convex.cloud.
normalize_convex_site_url() {
  url="${1:-}"
  [ -n "${url}" ] || return 0
  url="${url%/}"
  printf '%s\n' "${url}" | sed 's/\.convex\.cloud/.convex.site/'
}

resolve_convex_site_url() {
  raw="${ARG_CONVEX_URL:-${NEMU_CONVEX_SITE_URL:-${CONVEX_URL:-${NEXT_PUBLIC_CONVEX_URL:-}}}}"
  normalize_convex_site_url "${raw}"
}

resolve_controller_name() {
  printf '%s\n' "${ARG_CONTROLLER_NAME:-${NEMU_CONTROLLER_NAME:-Home}}"
}

resolve_registration_secret() {
  printf '%s\n' "${ARG_REGISTRATION_SECRET:-${CONTROLLER_REGISTRATION_SECRET:-}}"
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --force | -f)
        FORCE=1
        ;;
      --convex-url=*)
        ARG_CONVEX_URL="${1#--convex-url=}"
        ;;
      --convex-url)
        shift
        ARG_CONVEX_URL="${1:-}"
        ;;
      --controller-name=*)
        ARG_CONTROLLER_NAME="${1#--controller-name=}"
        ;;
      --controller-name)
        shift
        ARG_CONTROLLER_NAME="${1:-}"
        ;;
      --zigbee-device=*)
        ARG_ZIGBEE_DEVICE="${1#--zigbee-device=}"
        ;;
      --zigbee-device)
        shift
        ARG_ZIGBEE_DEVICE="${1:-}"
        ;;
      --registration-secret=*)
        ARG_REGISTRATION_SECRET="${1#--registration-secret=}"
        ;;
      --registration-secret)
        shift
        ARG_REGISTRATION_SECRET="${1:-}"
        ;;
      --)
        shift
        break
        ;;
      -*)
        die "unknown argument: $1"
        ;;
      *)
        die "unknown argument: $1"
        ;;
    esac
    shift
  done
}

# Upsert KEY=VALUE in a dotenv file. Escapes sed replacement metacharacters.
upsert_env() {
  key="$1"
  value="$2"
  file="$3"
  escaped=$(printf '%s' "${value}" | sed -e 's/[\\|&]/\\&/g')
  if grep -q "^${key}=" "${file}"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >>"${file}"
  fi
}

detect_ubuntu() {
  if [ ! -f /etc/os-release ]; then
    die "unsupported OS: /etc/os-release not found (Ubuntu Server required)"
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ]; then
    die "unsupported OS: ${PRETTY_NAME:-unknown} (Ubuntu Server required)"
  fi

  arch="$(uname -m)"
  case "$arch" in
    x86_64 | amd64 | aarch64 | arm64) ;;
    *)
      die "unsupported architecture: ${arch} (need amd64 or arm64)"
      ;;
  esac

  log "Detected ${PRETTY_NAME} (${arch})"
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "run as root. Example: curl -fsSL ${BASE_URL} | sudo sh"
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker Engine and Compose plugin already installed"
    return
  fi

  log "Installing Docker Engine from Docker's Ubuntu apt repository"
  need_cmd apt-get
  need_cmd curl
  export DEBIAN_FRONTEND=noninteractive

  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg

  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable --now docker >/dev/null 2>&1 || true
  docker compose version >/dev/null 2>&1 || die "docker compose plugin failed to install"
  log "Docker installed"
}

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

watchtower_token_from_env() {
  [ -f "${ENV_FILE}" ] || return 0
  grep "^WATCHTOWER_HTTP_API_TOKEN=" "${ENV_FILE}" | head -n1 | cut -d= -f2-
}

ensure_watchtower_token() {
  current="$(watchtower_token_from_env || true)"
  if [ -z "${current}" ]; then
    upsert_env "WATCHTOWER_HTTP_API_TOKEN" "$(random_hex)" "${ENV_FILE}"
    log "Generated WATCHTOWER_HTTP_API_TOKEN"
  fi
}

detect_zigbee_device() {
  if [ -n "${ARG_ZIGBEE_DEVICE:-}" ]; then
    printf '%s\n' "${ARG_ZIGBEE_DEVICE}"
    return
  fi
  if [ -n "${NEMU_ZIGBEE_DEVICE:-}" ]; then
    printf '%s\n' "${NEMU_ZIGBEE_DEVICE}"
    return
  fi
  for candidate in /dev/ttyACM0 /dev/ttyUSB0 /dev/ttyAMA0; do
    if [ -e "$candidate" ]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  printf '\n'
}

download_file() {
  src="$1"
  dest="$2"
  curl -fsSL "${BASE_URL}/${src}" -o "${dest}"
}

ensure_z2m_availability() {
  file="$1"
  if [ ! -f "${file}" ]; then
    return
  fi
  if grep -q '^availability:' "${file}" 2>/dev/null; then
    return
  fi
  printf '\navailability:\n  enabled: true\n' >> "${file}"
}

resolve_tls_san() {
  if [ -n "${NEMU_TLS_SAN:-}" ]; then
    printf '%s\n' "${NEMU_TLS_SAN}"
    return
  fi
  primary_ip
}

write_env_overrides() {
  convex_site_url="$1"
  controller_name="$2"
  registration_secret="$3"
  zigbee_dev="$4"
  tls_san="$5"

  if [ -n "${convex_site_url}" ]; then
    upsert_env "NEMU_CONVEX_SITE_URL" "${convex_site_url}" "${ENV_FILE}"
  fi
  if [ -n "${ARG_CONTROLLER_NAME:-${NEMU_CONTROLLER_NAME:-}}" ]; then
    upsert_env "NEMU_CONTROLLER_NAME" "${controller_name}" "${ENV_FILE}"
  fi
  if [ -n "${registration_secret}" ]; then
    upsert_env "CONTROLLER_REGISTRATION_SECRET" "${registration_secret}" "${ENV_FILE}"
  fi
  if [ -n "${zigbee_dev}" ]; then
    upsert_env "NEMU_ZIGBEE_DEVICE" "${zigbee_dev}" "${ENV_FILE}"
  fi
  if [ -n "${tls_san}" ]; then
    upsert_env "NEMU_TLS_SAN" "${tls_san}" "${ENV_FILE}"
  fi
  if [ -n "${WATCHTOWER_POLL_INTERVAL:-}" ]; then
    upsert_env "WATCHTOWER_POLL_INTERVAL" "${WATCHTOWER_POLL_INTERVAL}" "${ENV_FILE}"
  fi
  if [ -n "${TZ:-}" ]; then
    upsert_env "TZ" "${TZ}" "${ENV_FILE}"
  fi
  ensure_watchtower_token
}

write_files() {
  if [ -d "${INSTALL_DIR}" ] && [ -f "${COMPOSE_FILE}" ] && ! is_force; then
    die "${INSTALL_DIR} already exists. Re-run with force (vars must be on the sh side, not curl):
  curl -fsSL ${BASE_URL} | sudo NEMU_FORCE=1 sh
  curl -fsSL ${BASE_URL} | sudo sh -s -- --force"
  fi

  log "Installing Nemu under ${INSTALL_DIR}"
  mkdir -p "${INSTALL_DIR}/mosquitto" "${INSTALL_DIR}/zigbee2mqtt"

  download_file "docker-compose.yml" "${INSTALL_DIR}/docker-compose.yml"
  download_file "mosquitto/mosquitto.conf" "${INSTALL_DIR}/mosquitto/mosquitto.conf"
  download_file "zigbee2mqtt/configuration.yaml" "${INSTALL_DIR}/zigbee2mqtt/configuration.yaml"
  ensure_z2m_availability "${INSTALL_DIR}/zigbee2mqtt/configuration.yaml"

  zigbee_dev="$(detect_zigbee_device)"
  if [ -n "${zigbee_dev}" ]; then
    log "Using Zigbee adapter ${zigbee_dev}"
    # Keep container path stable; map host device into /dev/ttyACM0.
    cat >"${INSTALL_DIR}/docker-compose.override.yml" <<EOF
services:
  zigbee2mqtt:
    devices:
      - "${zigbee_dev}:/dev/ttyACM0"
EOF
    # Ensure YAML serial port matches the in-container path.
    if command -v sed >/dev/null 2>&1; then
      sed -i 's#^\(  port:\).*#\1 /dev/ttyACM0#' "${INSTALL_DIR}/zigbee2mqtt/configuration.yaml" || true
    fi
  else
    warn "No Zigbee serial device found. Stack will start; zigbee2mqtt may restart until a dongle is attached."
    warn "Set NEMU_ZIGBEE_DEVICE=/dev/ttyACM0 (or similar) and re-run with NEMU_FORCE=1 after plugging in."
    rm -f "${INSTALL_DIR}/docker-compose.override.yml"
  fi

  convex_site_url="$(resolve_convex_site_url)"
  controller_name="$(resolve_controller_name)"
  registration_secret="$(resolve_registration_secret)"
  tls_san="$(resolve_tls_san)"

  if [ ! -f "${ENV_FILE}" ]; then
    password="$(random_hex)"
    watchtower_token="$(random_hex)"
    cat >"${ENV_FILE}" <<EOF
POSTGRES_USER=nemu
POSTGRES_PASSWORD=${password}
POSTGRES_DB=nemu
NEMU_CONVEX_SITE_URL=${convex_site_url}
NEMU_CONTROLLER_NAME=${controller_name}
CONTROLLER_REGISTRATION_SECRET=${registration_secret}
NEMU_ZIGBEE_DEVICE=${zigbee_dev:-/dev/ttyACM0}
NEMU_TLS_SAN=${tls_san}
WATCHTOWER_POLL_INTERVAL=${WATCHTOWER_POLL_INTERVAL:-3600}
WATCHTOWER_HTTP_API_TOKEN=${watchtower_token}
TZ=${TZ:-UTC}
EOF
    chmod 600 "${ENV_FILE}"
    log "Wrote ${ENV_FILE}"
  else
    log "Keeping existing ${ENV_FILE}"
    write_env_overrides "${convex_site_url}" "${controller_name}" "${registration_secret}" "${zigbee_dev}" "${tls_san}"
  fi

  if [ -n "${convex_site_url}" ]; then
    log "Convex site URL: ${convex_site_url}"
  fi
}

start_stack() {
  log "Pulling images and starting stack"
  cd "${INSTALL_DIR}"
  docker compose pull
  docker compose up -d
}

wait_for_health() {
  log "Waiting for nemu-core health endpoint"
  i=0
  while [ "$i" -lt 60 ]; do
    if curl -fsS "http://127.0.0.1:6368/api/health" >/dev/null 2>&1; then
      log "nemu-core is healthy"
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  warn "Timed out waiting for http://127.0.0.1:6368/api/health — check: docker compose -f ${COMPOSE_FILE} logs nemu-core"
  return 1
}

primary_ip() {
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}'
  else
    ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}'
  fi
}

print_next_steps() {
  host_ip="$(primary_ip)"
  cat <<EOF

Nemu is installed.

  Install dir:  ${INSTALL_DIR}
  LAN API:      http://${host_ip:-<host-ip>}:6368
  LAN HTTPS:    https://${host_ip:-<host-ip>}:6368
  mDNS (if set): https://nemu.local:6368
  Dashboard:    https://app.nemu.sh

Pair this controller from https://app.nemu.sh (check docker logs for a pairing code on first boot):
  docker compose -f ${COMPOSE_FILE} logs nemu-core

nemu-core auto-updates from ghcr.io/.../nemu-core:latest via Watchtower (hourly by default).
Compose/config changes are not auto-applied — re-run this installer with NEMU_FORCE=1 or edit ${INSTALL_DIR}.

EOF
  if [ -z "$(resolve_convex_site_url)" ] && ! grep -q '^NEMU_CONVEX_SITE_URL=.\+' "${ENV_FILE}" 2>/dev/null; then
    warn "NEMU_CONVEX_SITE_URL is unset — cloud registration/relay is disabled until you set it:
  curl -fsSL ${BASE_URL} | sudo NEMU_CONVEX_SITE_URL=https://YOUR_DEPLOYMENT.convex.site NEMU_FORCE=1 sh"
  fi
}

main() {
  parse_args "$@"
  detect_ubuntu
  require_root
  need_cmd curl
  install_docker
  write_files
  start_stack
  wait_for_health || true
  print_next_steps
}

main "$@"
