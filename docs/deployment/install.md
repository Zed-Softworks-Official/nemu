# Install Nemu on Ubuntu Server

Nemu’s controller runs as a Docker Compose stack on hardware you own. The supported host OS is **Ubuntu Server LTS** (22.04 or 24.04) on **amd64** or **arm64** (including Raspberry Pi 4/5 with Ubuntu Server).

## One-liner

```bash
curl -fsSL https://get.nemu.sh | sudo sh
```

Inspect the script before running:

```bash
curl -fsSL https://get.nemu.sh
```

### Optional environment

`sudo` resets the environment, so installer variables must be passed to `sh`, not `curl`:

```bash
curl -fsSL https://get.nemu.sh | sudo \
  NEMU_CONVEX_SITE_URL=https://YOUR_DEPLOYMENT.convex.site \
  NEMU_CONTROLLER_NAME=Home \
  sh
```

`CONVEX_URL` (the Convex client URL) is accepted as an alias; `*.convex.cloud` is rewritten to `*.convex.site`. Flags also work, and survive `sudo` even when env vars do not:

```bash
curl -fsSL https://get.nemu.sh | sudo sh -s -- \
  --force \
  --convex-url=https://YOUR_DEPLOYMENT.convex.cloud \
  --controller-name=Home
```

| Variable / flag                                            | Purpose                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `NEMU_CONVEX_SITE_URL` / `--convex-url`                    | Convex HTTP site URL for registration + TLS; relay derives `.convex.cloud` |
| `CONVEX_URL`                                               | Alias for the Convex deployment URL (`.cloud` → `.site`)           |
| `NEMU_CONTROLLER_NAME` / `--controller-name`               | Display name (default `Home`)                                      |
| `CONTROLLER_REGISTRATION_SECRET` / `--registration-secret` | Optional shared secret with cloud                                  |
| `NEMU_ZIGBEE_DEVICE` / `--zigbee-device`                   | Host serial path (default auto: `/dev/ttyACM0`, `/dev/ttyUSB0`, …) |
| `NEMU_FORCE=1` / `--force`                                 | Overwrite compose/config under `/opt/nemu` (keeps `.env`)          |
| `WATCHTOWER_POLL_INTERVAL`                                 | Seconds between image polls (default `3600`)                       |

## What gets installed

Under `/opt/nemu`:

- `docker-compose.yml` — mosquitto, zigbee2mqtt, `nemu-matter`, postgres, `nemu-core`, Watchtower
- `.env` — Postgres password and Convex settings
- Mosquitto + zigbee2mqtt config templates
- `docker-compose.override.yml` — USB serial mapping when an adapter is detected

Docker Engine + Compose plugin are installed from Docker’s official Ubuntu apt repository if missing.

## Matter

Matter-over-Wi-Fi support is on by default and needs no extra hardware: the
`nemu-matter` service runs host-networked (Matter requires mDNS and IPv6),
and new devices are commissioned over the host's Bluetooth adapter via BlueZ.
The installer warns if IPv6 is disabled or `bluetoothd` is not running.
`nemu-matter` runs as uid 1000; the installer chowns the Matter data volume
so the process can write its fabric store.

Pair from the dashboard: **Add device → Works with Matter**, then scan the
device's QR code or enter its 11-digit pairing code. For devices that join
Wi-Fi during setup, the wizard asks for the 2.4 GHz home network; credentials
stay on the controller. If pairing fails, put the device back in pairing
mode, keep it near the controller, and try again on 2.4 GHz — not 5 GHz.
A multi-outlet power strip appears as one smart-strip device; opening it
lets you manage each outlet. Forgetting the strip unpairs the whole device.
The only internet traffic Matter adds is DCL certificate attestation during
commissioning.

Controller API: `http://<host-ip>:6368` and `https://<host-ip>:6368` on the same port (opportunistic TLS). Pair from [https://app.nemu.sh](https://app.nemu.sh). After the controller registers, the dashboard prefers `https://{controllerId}.lan.nemu.sh:6368` with a Let's Encrypt certificate (your home LAN address is published under that hostname so the browser can trust it). Until that cert is issued, the first HTTPS visit uses a self-signed certificate — continue past the browser warning once so the dashboard can use `wss://`.

## Updates

**nemu-core** uses image tag `:latest`. Watchtower (label-scoped) polls hourly and recreates the container when GHCR moves `:latest`. Diesel migrations run on boot.

On the home network, an owner can also check for updates in dashboard Settings and apply immediately. That tells Watchtower to recreate `nemu-core` now; the hourly poll still runs because compose sets `WATCHTOWER_HTTP_API_PERIODIC_POLLS=true`. Watchtower’s HTTP API stays on the Docker network and is not published to the host.

Mosquitto, zigbee2mqtt, and Postgres are **not** auto-updated. Compose/file changes are **not** auto-applied — re-run the installer with force or edit `/opt/nemu` manually:

```bash
curl -fsSL https://get.nemu.sh | sudo NEMU_FORCE=1 sh
```

That keeps `.env`, writes the latest compose (including the Watchtower HTTP API), and generates `WATCHTOWER_HTTP_API_TOKEN` if it is missing. Until compose is refreshed, Settings reports that Watchtower is not configured.

Watchtower only recreates `nemu-core`. Zigbee devices stay on the radio; core rebuilds live state from MQTT. Existing zigbee2mqtt installs should enable availability so mains-powered devices are pinged after a core restart. Add this to `/opt/nemu/zigbee2mqtt/configuration.yaml` if it is missing, then recreate that service:

```yaml
availability:
  enabled: true
```

```bash
cd /opt/nemu && sudo docker compose up -d zigbee2mqtt
```

Manual pull:

```bash
cd /opt/nemu && sudo docker compose pull && sudo docker compose up -d
```

Disable Watchtower by removing the `watchtower` service from compose, or clear the `com.centurylinklabs.watchtower.enable` label on `nemu-core`.

## Publishing images (maintainers)

Tag a release to build multi-arch images on Blacksmith and push to GHCR:

```bash
# Core
git tag core-v0.1.0
git push origin core-v0.1.0
# Approve pending deployment → Environment "core-release"

# Matter
git tag matter-v0.1.0
git push origin matter-v0.1.0
# Approve pending deployment → Environment "matter-release"
```

See [`.github/workflows/publish-core.yml`](../../.github/workflows/publish-core.yml) and [`.github/workflows/publish-matter.yml`](../../.github/workflows/publish-matter.yml). Required reviewer for both environments: `@kzolt`.

Security controls: [github-release-protections.md](github-release-protections.md).

## Related

- [Subdomain cutover](subdomain-cutover.md)
- [GitHub release protections](github-release-protections.md)
- [Architecture overview](../architecture/overview.md)
