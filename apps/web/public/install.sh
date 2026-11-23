#!/usr/bin/env sh
# Nemu controller installer for Ubuntu Server (amd64 / arm64).
#
# Installs the host Updater (nemu-updater.service) and the Home's Release
# channel's signed Release, then starts the stack. After that the Home updates
# through the Updater. Re-running it on an existing Home installs the Updater,
# removes Watchtower, and keeps .env, the Zigbee serial override, and Home data.
#
# Environment variables must be passed to `sh`, not `curl`. `sudo` resets the
# environment, so prefix vars on the `sudo … sh` side (or pass flags after `--`).
#
# Usage (zero-config against Nemu cloud — no env vars required):
#   curl -fsSL https://get.nemu.sh | sudo sh
#   curl -fsSL https://get.nemu.sh | sudo NEMU_FORCE=1 sh
#   curl -fsSL https://get.nemu.sh | sudo sh -s -- --force
# Canary Release channel instead of Stable:
#   curl -fsSL https://get.nemu.sh | sudo NEMU_CHANNEL=canary sh
# Custom Convex / secret (self-hosted or non-prod):
#   curl -fsSL https://get.nemu.sh | sudo \
#     NEMU_CONVEX_SITE_URL=https://….convex.site \
#     CONTROLLER_REGISTRATION_SECRET=… \
#     sh
# Inspect without running:
#   curl -fsSL https://get.nemu.sh
#
# Optional env (or matching --flags); unset values fall back to Nemu prod defaults:
#   NEMU_CONVEX_SITE_URL  Convex HTTP site URL (https://….convex.site)
#   CONVEX_URL            Alias; .convex.cloud is rewritten to .convex.site
#   NEMU_CONTROLLER_NAME  Display name (default Home)
#   CONTROLLER_REGISTRATION_SECRET  Shared with Convex (public default for consumer installs)
#   NEMU_ZIGBEE_DEVICE    Host serial path
#   NEMU_CHANNEL          Release channel for a new Home: stable (default) or canary.
#                         An existing Home keeps its channel; switch it in Settings.
#   NEMU_FORCE=1          Re-run on an existing /opt/nemu
#   NEMU_INSTALL_DIR      Default /opt/nemu
#   GET_NEMU_BASE_URL     Default https://get.nemu.sh

set -eu

BASE_URL="${GET_NEMU_BASE_URL:-https://get.nemu.sh}"
BASE_URL="${BASE_URL%/}"
INSTALL_DIR="${NEMU_INSTALL_DIR:-/opt/nemu}"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
ENV_FILE="${INSTALL_DIR}/.env"
UPDATER_DIR="${INSTALL_DIR}/updater"
WRAPPER="${UPDATER_DIR}/wrapper"
PIN_FILE="${UPDATER_DIR}/release-public-key"
INSTALLED_RELEASE="${UPDATER_DIR}/installed-release.json"
UNIT_FILE="/etc/systemd/system/nemu-updater.service"

# Release-signing public key (base64 of the 32-byte ed25519 key). It is the
# first wrapper pin on a new Home. A Home that already has a pin keeps it: a
# key rotation arrives as a Release signed by the current key (ADR-0028).
RELEASE_PUBLIC_KEY="LcAhCy1owu5LTP0rZea9R1wHERptGH+qmckOpl+ZD7U="
# DER prefix of an ed25519 SubjectPublicKeyInfo, base64. 12 bytes, so it
# concatenates with the base64 key without re-encoding.
ED25519_SPKI_PREFIX="MCowBQYDK2VwAyEA"

# Public Nemu prod defaults (anyone with the install script can register a controller).
# Override via env/flags for self-hosted deployments. Must match Convex CONTROLLER_REGISTRATION_SECRET.
DEFAULT_NEMU_CONVEX_SITE_URL="https://veracious-goat-294.convex.site"
DEFAULT_CONTROLLER_REGISTRATION_SECRET="43a1d23942fd0757c14aff37da23c95525aaf48ec51deb6935c4ce79b8c56ac6"

FORCE=0
ARG_CHANNEL=""
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

# Read KEY from dotenv (empty if missing / blank).
read_env() {
  key="$1"
  [ -f "${ENV_FILE}" ] || return 0
  line="$(grep "^${key}=" "${ENV_FILE}" | head -n1 || true)"
  [ -n "${line}" ] || return 0
  printf '%s\n' "${line#*=}"
}

# Convex HTTP actions live on *.convex.site; client URLs are *.convex.cloud.
normalize_convex_site_url() {
  url="${1:-}"
  [ -n "${url}" ] || return 0
  url="${url%/}"
  printf '%s\n' "${url}" | sed 's/\.convex\.cloud/.convex.site/'
}

# Flag/env → existing .env → baked Nemu prod default.
resolve_convex_site_url() {
  raw="${ARG_CONVEX_URL:-${NEMU_CONVEX_SITE_URL:-${CONVEX_URL:-${NEXT_PUBLIC_CONVEX_URL:-}}}}"
  if [ -z "${raw}" ]; then
    raw="$(read_env NEMU_CONVEX_SITE_URL || true)"
  fi
  if [ -z "${raw}" ]; then
    raw="${DEFAULT_NEMU_CONVEX_SITE_URL}"
  fi
  normalize_convex_site_url "${raw}"
}

resolve_controller_name() {
  printf '%s\n' "${ARG_CONTROLLER_NAME:-${NEMU_CONTROLLER_NAME:-Home}}"
}

# Flag/env → existing .env → baked Nemu prod default.
resolve_registration_secret() {
  secret="${ARG_REGISTRATION_SECRET:-${CONTROLLER_REGISTRATION_SECRET:-}}"
  if [ -z "${secret}" ]; then
    secret="$(read_env CONTROLLER_REGISTRATION_SECRET || true)"
  fi
  if [ -z "${secret}" ]; then
    secret="${DEFAULT_CONTROLLER_REGISTRATION_SECRET}"
  fi
  printf '%s\n' "${secret}"
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --force | -f)
        FORCE=1
        ;;
      --channel=*)
        ARG_CHANNEL="${1#--channel=}"
        ;;
      --channel)
        shift
        ARG_CHANNEL="${1:-}"
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

detect_zigbee_device() {
  if [ -n "${ARG_ZIGBEE_DEVICE:-}" ]; then
    printf '%s\n' "${ARG_ZIGBEE_DEVICE}"
    return
  fi
  if [ -n "${NEMU_ZIGBEE_DEVICE:-}" ]; then
    printf '%s\n' "${NEMU_ZIGBEE_DEVICE}"
    return
  fi
  # A re-run keeps the adapter this Home was installed with.
  stored="$(read_env NEMU_ZIGBEE_DEVICE || true)"
  if [ -n "${stored}" ] && [ -e "${stored}" ]; then
    printf '%s\n' "${stored}"
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

# Matter runs on by default (nemu-matter, host network).
# Wi-Fi Matter needs working IPv6 (link-local at minimum) and BLE commissioning
# needs bluetoothd on the host D-Bus. IPv6 stays warn-only; BlueZ is installed
# when missing. Neither failure blocks the install — Zigbee and already-onboarded
# Matter devices keep working.
check_matter_prereqs() {
  if [ "$(cat /proc/sys/net/ipv6/conf/all/disable_ipv6 2>/dev/null || echo 0)" = "1" ]; then
    warn "IPv6 is disabled on this host. Matter requires IPv6 (link-local is enough)."
    warn "Enable it with: sysctl -w net.ipv6.conf.all.disable_ipv6=0 (and persist in /etc/sysctl.d)"
  fi
  if ! command -v systemctl >/dev/null 2>&1; then
    return
  fi
  if systemctl is-active --quiet bluetooth 2>/dev/null; then
    return
  fi

  log "Installing BlueZ for Matter BLE commissioning"
  export DEBIAN_FRONTEND=noninteractive
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq bluez || warn "Failed to install bluez package"
    systemctl enable --now bluetooth >/dev/null 2>&1 || true
  else
    warn "apt-get not available; cannot install BlueZ automatically"
  fi

  if systemctl is-active --quiet bluetooth 2>/dev/null; then
    log "Bluetooth service is active"
  else
    warn "bluetoothd is not running. BLE commissioning of new Matter devices will fail."
  fi
}

# Default-route NIC so Matter mDNS stays on the LAN, not a docker bridge.
detect_primary_interface() {
  if [ -n "${PRIMARY_INTERFACE:-}" ]; then
    printf '%s\n' "${PRIMARY_INTERFACE}"
    return
  fi
  ip -4 route show default 2>/dev/null \
    | awk '{ for (i = 1; i <= NF; i++) if ($i == "dev") { print $(i + 1); exit } }'
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
  if [ -n "${TZ:-}" ]; then
    upsert_env "TZ" "${TZ}" "${ENV_FILE}"
  fi
  primary_iface="$(detect_primary_interface)"
  if [ -n "${primary_iface}" ]; then
    upsert_env "PRIMARY_INTERFACE" "${primary_iface}" "${ENV_FILE}"
  fi
  # Watchtower is gone; the Updater needs no token.
  sed -i '/^WATCHTOWER_/d' "${ENV_FILE}"
}

write_files() {
  log "Installing Nemu under ${INSTALL_DIR}"
  mkdir -p "${INSTALL_DIR}/zigbee2mqtt"

  # The compose file and mosquitto.conf are stack files: they come from the
  # signed Release. The Zigbee configuration is Home data and is only seeded.
  z2m_config="${INSTALL_DIR}/zigbee2mqtt/configuration.yaml"
  if [ ! -f "${z2m_config}" ]; then
    download_file "zigbee2mqtt/configuration.yaml" "${z2m_config}"
  fi
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
  elif [ -f "${INSTALL_DIR}/docker-compose.override.yml" ]; then
    warn "No Zigbee serial device is attached now; keeping the existing docker-compose.override.yml."
  else
    warn "No Zigbee serial device found. Stack will start; zigbee2mqtt may restart until a dongle is attached."
    warn "Set NEMU_ZIGBEE_DEVICE=/dev/ttyACM0 (or similar) and re-run with NEMU_FORCE=1 after plugging in."
  fi

  convex_site_url="$(resolve_convex_site_url)"
  controller_name="$(resolve_controller_name)"
  registration_secret="$(resolve_registration_secret)"
  tls_san="$(resolve_tls_san)"

  if [ ! -f "${ENV_FILE}" ]; then
    password="$(random_hex)"
    cat >"${ENV_FILE}" <<EOF
POSTGRES_USER=nemu
POSTGRES_PASSWORD=${password}
POSTGRES_DB=nemu
NEMU_CONVEX_SITE_URL=${convex_site_url}
NEMU_CONTROLLER_NAME=${controller_name}
CONTROLLER_REGISTRATION_SECRET=${registration_secret}
NEMU_ZIGBEE_DEVICE=${zigbee_dev:-/dev/ttyACM0}
NEMU_TLS_SAN=${tls_san}
TZ=${TZ:-UTC}
PRIMARY_INTERFACE=$(detect_primary_interface)
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

require_systemd() {
  if ! command -v systemctl >/dev/null 2>&1 || [ ! -d /run/systemd/system ]; then
    die "systemd is required: the Updater runs as nemu-updater.service"
  fi
}

install_tools() {
  missing=""
  command -v jq >/dev/null 2>&1 || missing="${missing} jq"
  command -v openssl >/dev/null 2>&1 || missing="${missing} openssl"
  if [ -n "${missing}" ]; then
    log "Installing${missing}"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    # shellcheck disable=SC2086
    apt-get install -y -qq ${missing}
  fi
  need_cmd jq
  need_cmd openssl
  need_cmd base64
}

updater_arch() {
  case "$(uname -m)" in
    x86_64 | amd64) printf 'amd64\n' ;;
    aarch64 | arm64) printf 'arm64\n' ;;
    *) die "unsupported architecture: $(uname -m)" ;;
  esac
}

# A Home that already stores a Platform version is on a Release.
home_has_release() {
  [ -f "${INSTALLED_RELEASE}" ] \
    && jq -e '.platformVersion | type == "string" and length > 0' "${INSTALLED_RELEASE}" >/dev/null 2>&1
}

resolve_channel() {
  if home_has_release; then
    stored="$(jq -r '.channel // "stable"' "${INSTALLED_RELEASE}")"
    requested="${ARG_CHANNEL:-${NEMU_CHANNEL:-}}"
    if [ -n "${requested}" ] && [ "${requested}" != "${stored}" ]; then
      warn "This Home is on the ${stored} channel. NEMU_CHANNEL only applies to a new Home; switch channel in dashboard Settings."
    fi
    printf '%s\n' "${stored}"
    return
  fi
  channel="${ARG_CHANNEL:-${NEMU_CHANNEL:-stable}}"
  case "${channel}" in
    stable | canary) printf '%s\n' "${channel}" ;;
    *) die "unknown Release channel: ${channel} (use stable or canary)" ;;
  esac
}

# The key to verify with: this Home's pin when it has one, else the
# release key baked into this script.
pinned_key_b64() {
  if [ -f "${PIN_FILE}" ]; then
    size="$(wc -c <"${PIN_FILE}")"
    if [ "${size}" -eq 32 ]; then
      base64 -w0 <"${PIN_FILE}"
    else
      tr -d ' \n\r' <"${PIN_FILE}"
    fi
    return
  fi
  printf '%s' "${RELEASE_PUBLIC_KEY}"
}

# Downloads the channel manifest and verifies its signature before anything
# from it runs. The signed bytes are the compact manifest JSON exactly as it
# appears between `{"manifest":` and `,"signature":"…"}`.
fetch_release() {
  channel="$1"
  work="$2"
  url="${BASE_URL}/releases/${channel}.json"
  log "Fetching the ${channel} Release from ${url}"
  code="$(curl -sS -L -o "${work}/manifest.json" -w '%{http_code}' "${url}" || true)"
  case "${code}" in
    200) ;;
    404) die "The ${channel} Release channel has no published Release yet. Install Stable (the default), or try again once ${channel} has published." ;;
    *) die "could not download ${url} (HTTP ${code:-none})" ;;
  esac

  manifest="${work}/manifest.json"
  sig="$(jq -er '.signature' "${manifest}" 2>/dev/null)" || die "the ${channel} manifest is not a signed Release manifest"
  prefix='{"manifest":'
  suffix=",\"signature\":\"${sig}\"}"
  total="$(wc -c <"${manifest}")"
  suffix_len="$(printf '%s' "${suffix}" | wc -c)"
  [ "$(head -c 12 "${manifest}")" = "${prefix}" ] || die "the ${channel} manifest is not in the signed layout"
  [ "$(tail -c "${suffix_len}" "${manifest}")" = "${suffix}" ] || die "the ${channel} manifest is not in the signed layout"
  tail -c +13 "${manifest}" | head -c "$((total - 12 - suffix_len))" >"${work}/signed.json"
  printf '%s' "${sig}" | base64 -d >"${work}/signature.bin" 2>/dev/null || die "the ${channel} manifest signature is not base64"
  printf -- '-----BEGIN PUBLIC KEY-----\n%s%s\n-----END PUBLIC KEY-----\n' \
    "${ED25519_SPKI_PREFIX}" "$(pinned_key_b64)" >"${work}/release-key.pem"
  if ! openssl pkeyutl -verify -pubin -inkey "${work}/release-key.pem" -rawin \
    -in "${work}/signed.json" -sigfile "${work}/signature.bin" >/dev/null 2>&1; then
    die "the ${channel} manifest did not verify against the pinned release key. Nothing was changed."
  fi
  RELEASE_VERSION="$(jq -r '.platformVersion' "${work}/signed.json")"
  log "Verified ${channel} Release ${RELEASE_VERSION}"

  arch="$(updater_arch)"
  jq -e ".updater.${arch} | type == \"string\" and length > 0" "${work}/signed.json" >/dev/null \
    || die "the ${channel} Release has no Updater for ${arch}"
  jq -jer ".updater.${arch}" "${work}/signed.json" | base64 -d >"${work}/updater" 2>/dev/null \
    || die "the ${channel} Release has no Updater for ${arch}"
  chmod 0755 "${work}/updater"
  if ! "${work}/updater" version 2>/dev/null | grep -q '^nemu-updater'; then
    die "The ${channel} Release (${RELEASE_VERSION}) predates the host Updater and cannot be installed by this script. Wait for a newer ${channel} Release."
  fi
}

# Stops a Watchtower-era stack before its compose file is replaced. Named
# volumes are kept.
stop_legacy_stack() {
  if [ ! -f "${COMPOSE_FILE}" ] || home_has_release; then
    return
  fi
  log "Stopping the existing stack (Watchtower is being removed)"
  (cd "${INSTALL_DIR}" && docker compose down --remove-orphans) \
    || warn "could not stop the existing stack cleanly; continuing"
}

# Prints one progress line for a copy: label, bar, percent, and sizes.
# On a terminal the line redraws in place; otherwise it is printed as is.
progress_line() {
  awk -v label="$1" -v done_k="$2" -v total_k="$3" -v cr="$4" '
    function human(k) {
      if (k >= 1048576) return sprintf("%.1f GB", k / 1048576)
      if (k >= 1024) return sprintf("%.1f MB", k / 1024)
      return sprintf("%d KB", k)
    }
    BEGIN {
      width = 30
      pct = total_k > 0 ? int(done_k * 100 / total_k) : 100
      if (pct > 100) pct = 100
      filled = int(pct * width / 100)
      bar = ""
      for (i = 0; i < filled; i++) bar = bar "#"
      for (; i < width; i++) bar = bar "."
      printf "%s    %-12s [%s] %3d%%  %s / %s%s", cr, label, bar, pct, human(done_k), human(total_k), (cr == "" ? "\n" : "")
    }'
}

# Copies a directory tree while showing progress. du is polled every two
# seconds; on a terminal the bar redraws, otherwise a line prints every 20s.
copy_with_progress() {
  # POSIX sh has no locals: these names must not collide with the caller's.
  cwp_src="$1"
  cwp_dest="$2"
  cwp_label="$3"
  cwp_total_k="$(du -sk "${cwp_src}" 2>/dev/null | awk '{ print $1 }')"
  cwp_total_k="${cwp_total_k:-0}"
  cp -a "${cwp_src}/." "${cwp_dest}/" &
  cwp_copy_pid=$!
  cwp_ticks=0
  while kill -0 "${cwp_copy_pid}" 2>/dev/null; do
    cwp_done_k="$(du -sk "${cwp_dest}" 2>/dev/null | awk '{ print $1 }')"
    # du can briefly exceed the source while files are still being written.
    if [ "${cwp_done_k:-0}" -ge "${cwp_total_k}" ] && [ "${cwp_total_k}" -gt 0 ]; then
      cwp_done_k=$((cwp_total_k - 1))
    fi
    if [ -t 1 ]; then
      progress_line "${cwp_label}" "${cwp_done_k:-0}" "${cwp_total_k}" "$(printf '\r')"
    elif [ $((cwp_ticks % 10)) -eq 0 ]; then
      progress_line "${cwp_label}" "${cwp_done_k:-0}" "${cwp_total_k}" ""
    fi
    cwp_ticks=$((cwp_ticks + 1))
    sleep 2
  done
  if ! wait "${cwp_copy_pid}"; then
    [ -t 1 ] && printf '\n'
    return 1
  fi
  if [ -t 1 ]; then
    progress_line "${cwp_label}" "${cwp_total_k}" "${cwp_total_k}" "$(printf '\r')"
    printf '\n'
  else
    progress_line "${cwp_label}" "${cwp_total_k}" "${cwp_total_k}" ""
  fi
}

# Home data moved from named volumes to bind mounts under ${INSTALL_DIR}, so
# the Updater can snapshot it before an install. The copy runs with the stack
# stopped, into "${dest}.partial", and is renamed into place only when it has
# finished. An interrupted copy is therefore started over on the next run,
# never mistaken for a finished one. The old volume is not deleted.
migrate_volume() {
  name="$1"
  dest="$2"
  label="$3"
  project="${COMPOSE_PROJECT_NAME:-$(basename "${INSTALL_DIR}")}"
  vol="${project}_${name}"
  docker volume inspect "${vol}" >/dev/null 2>&1 || return 0
  if [ -d "${dest}" ] && [ -n "$(ls -A "${dest}" 2>/dev/null)" ]; then
    return 0
  fi
  src="$(docker volume inspect -f '{{ .Mountpoint }}' "${vol}")"
  [ -d "${src}" ] || die "cannot read Docker volume ${vol} at ${src}"
  partial="${dest}.partial"
  rm -rf "${partial}"
  mkdir -p "${partial}"
  log "Copying ${label} data from Docker volume ${vol} (this can take several minutes on a Raspberry Pi)"
  copy_with_progress "${src}" "${partial}" "${label}" \
    || die "copying ${vol} failed. Your data is still in the volume; re-run the installer to try again."
  # An empty destination may exist from an earlier run; the copy replaces it.
  if [ -d "${dest}" ]; then
    rmdir "${dest}"
  fi
  mv "${partial}" "${dest}"
  log "Copied ${vol} to ${dest}. The volume is kept; remove it with 'docker volume rm ${vol}' once the Home is healthy."
}

prepare_home_data() {
  migrate_volume postgres-data "${INSTALL_DIR}/volumes/postgres" Postgres
  migrate_volume mosquitto-data "${INSTALL_DIR}/mosquitto/data" Mosquitto
  migrate_volume matter-controller-data "${INSTALL_DIR}/volumes/matter" Matter
  mkdir -p "${INSTALL_DIR}/volumes/postgres" "${INSTALL_DIR}/mosquitto/data" "${INSTALL_DIR}/volumes/matter"
  # nemu-matter runs as uid 1000.
  chown -R 1000:1000 "${INSTALL_DIR}/volumes/matter"
  # The Updater socket directory. The daemon sets its mode and the socket owner.
  mkdir -p "${INSTALL_DIR}/run"
}

install_updater() {
  work="$1"
  channel="$2"
  mkdir -p "${UPDATER_DIR}"
  if [ ! -f "${PIN_FILE}" ]; then
    printf '%s\n' "${RELEASE_PUBLIC_KEY}" >"${PIN_FILE}"
    chmod 0644 "${PIN_FILE}"
  fi
  install -m 0755 "${work}/updater" "${WRAPPER}"

  if home_has_release; then
    log "This Home is already on a Release; the Updater keeps it current"
  else
    log "Installing the ${channel} Release"
    NEMU_DIR="${INSTALL_DIR}" NEMU_RELEASE_BASE_URL="${BASE_URL}" "${WRAPPER}" bootstrap --channel "${channel}" \
      || die "the Updater could not install the ${channel} Release"
  fi
}

install_updater_service() {
  log "Installing nemu-updater.service"
  cat >"${UNIT_FILE}" <<EOF
[Unit]
Description=Nemu Updater
Documentation=https://github.com/Zed-Softworks-Official/nemu/blob/master/docs/deployment/install.md
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=NEMU_DIR=${INSTALL_DIR}
Environment=NEMU_RELEASE_BASE_URL=${BASE_URL}
ExecStart=${WRAPPER} wrapper
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable nemu-updater.service >/dev/null 2>&1
  systemctl restart nemu-updater.service
}

install_matter_trust_roots() {
  fetch_script="${INSTALL_DIR}/fetch-matter-roots.sh"
  manifest="${INSTALL_DIR}/matter-roots.sha256"
  source_dir="$(CDPATH= cd "$(dirname "$0")" && pwd)"
  if [ ! -f "${fetch_script}" ] && [ -f "${source_dir}/fetch-matter-roots.sh" ]; then
    cp "${source_dir}/fetch-matter-roots.sh" "${fetch_script}"
  fi
  if [ ! -f "${manifest}" ] && [ -f "${source_dir}/matter-roots.sha256" ]; then
    cp "${source_dir}/matter-roots.sha256" "${manifest}"
  fi
  if [ ! -f "${fetch_script}" ]; then
    curl -fsSL "${BASE_URL}/fetch-matter-roots.sh" -o "${fetch_script}" || true
  fi
  if [ ! -f "${manifest}" ]; then
    curl -fsSL "${BASE_URL}/matter-roots.sha256" -o "${manifest}" || true
  fi
  if [ ! -f "${fetch_script}" ]; then
    warn "Matter trust-root fetcher is missing at ${fetch_script}; certified devices may not pair."
    return
  fi
  chmod +x "${fetch_script}" || true
  data="${INSTALL_DIR}/volumes/matter"
  tmp="$(mktemp -d)"
  if MATTER_DATA_DIR="${tmp}" bash "${fetch_script}" && [ -d "${tmp}/paa-roots" ]; then
    mkdir -p "${data}/paa-roots" "${data}/cd-roots"
    cp -a "${tmp}/paa-roots/." "${data}/paa-roots/"
    cp -a "${tmp}/cd-roots/." "${data}/cd-roots/" 2>/dev/null || true
    chown -R 1000:1000 "${data}"
  else
    warn "Could not download Matter trust roots; certified devices may not pair."
  fi
  rm -rf "${tmp}"
}

start_stack() {
  log "Pulling Release images and starting the stack"
  cd "${INSTALL_DIR}"
  docker compose pull
  docker compose up -d --remove-orphans
}

wait_for_updater() {
  i=0
  while [ "$i" -lt 15 ]; do
    if [ -S "${INSTALL_DIR}/run/updater.sock" ]; then
      log "The Updater is running"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  warn "The Updater socket did not appear. Check: journalctl -u nemu-updater"
  return 1
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

Release channel: ${CHANNEL} (Platform ${INSTALLED_VERSION:-unknown})
The Updater (systemctl status nemu-updater) checks hourly and installs newer
Releases on that channel. Owners can install, roll back, and switch channel in
dashboard Settings.

EOF
}

main() {
  parse_args "$@"
  detect_ubuntu
  require_root
  require_systemd
  need_cmd curl
  install_docker
  install_tools
  check_matter_prereqs

  if [ -d "${INSTALL_DIR}" ] && [ -f "${COMPOSE_FILE}" ] && ! is_force; then
    die "${INSTALL_DIR} already exists. Re-run with force (vars must be on the sh side, not curl):
  curl -fsSL ${BASE_URL} | sudo NEMU_FORCE=1 sh
  curl -fsSL ${BASE_URL} | sudo sh -s -- --force"
  fi

  # Restarting the Updater mid-install would leave the Home in maintenance.
  if [ -f "${UPDATER_DIR}/maintenance" ]; then
    die "an update or rollback is in progress (${UPDATER_DIR}/maintenance). Wait for it to finish; check: journalctl -u nemu-updater"
  fi

  CHANNEL="$(resolve_channel)"
  work="$(mktemp -d)"
  trap 'rm -rf "${work}"' EXIT
  fetch_release "${CHANNEL}" "${work}"

  stop_legacy_stack
  write_files
  prepare_home_data
  install_updater "${work}" "${CHANNEL}"
  INSTALLED_VERSION="$(jq -r '.platformVersion // empty' "${INSTALLED_RELEASE}" 2>/dev/null || true)"
  install_matter_trust_roots
  start_stack
  install_updater_service
  wait_for_health || true
  wait_for_updater || true
  print_next_steps
}

main "$@"
