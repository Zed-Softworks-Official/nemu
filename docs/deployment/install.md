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
| `NEMU_CONVEX_SITE_URL` / `--convex-url`                    | Convex HTTP site URL for registration + relay                      |
| `CONVEX_URL`                                               | Alias for the Convex deployment URL (`.cloud` → `.site`)           |
| `NEMU_CONTROLLER_NAME` / `--controller-name`               | Display name (default `Home`)                                      |
| `CONTROLLER_REGISTRATION_SECRET` / `--registration-secret` | Optional shared secret with cloud                                  |
| `NEMU_ZIGBEE_DEVICE` / `--zigbee-device`                   | Host serial path (default auto: `/dev/ttyACM0`, `/dev/ttyUSB0`, …) |
| `NEMU_FORCE=1` / `--force`                                 | Overwrite compose/config under `/opt/nemu` (keeps `.env`)          |
| `WATCHTOWER_POLL_INTERVAL`                                 | Seconds between image polls (default `3600`)                       |

## What gets installed

Under `/opt/nemu`:

- `docker-compose.yml` — mosquitto, zigbee2mqtt, postgres, `nemu-core`, Watchtower
- `.env` — Postgres password and Convex settings
- Mosquitto + zigbee2mqtt config templates
- `docker-compose.override.yml` — USB serial mapping when an adapter is detected

Docker Engine + Compose plugin are installed from Docker’s official Ubuntu apt repository if missing.

Controller API: `http://<host-ip>:6368` and `https://<host-ip>:6368` on the same port (opportunistic TLS). Pair from [https://app.nemu.sh](https://app.nemu.sh). After the controller registers, the dashboard prefers `https://{controllerId}.lan.nemu.sh:6368` with a Let's Encrypt certificate (your home LAN address is published under that hostname so the browser can trust it). Until that cert is issued, the first HTTPS visit uses a self-signed certificate — continue past the browser warning once so the dashboard can use `wss://`.

## Updates

**nemu-core** uses image tag `:latest`. Watchtower (label-scoped) polls hourly and recreates the container when GHCR moves `:latest`. Diesel migrations run on boot.

Mosquitto, zigbee2mqtt, and Postgres are **not** auto-updated. Compose/file changes are **not** auto-applied — re-run the installer with force or edit `/opt/nemu` manually:

```bash
curl -fsSL https://get.nemu.sh | sudo NEMU_FORCE=1 sh
```

Manual pull:

```bash
cd /opt/nemu && sudo docker compose pull && sudo docker compose up -d
```

Disable Watchtower by removing the `watchtower` service from compose, or clear the `com.centurylinklabs.watchtower.enable` label on `nemu-core`.

## Publishing images (maintainers)

Tag a release to build multi-arch images on Blacksmith and push to GHCR:

```bash
git tag core-v0.1.0
git push origin core-v0.1.0
```

See [`.github/workflows/publish-core.yml`](../../.github/workflows/publish-core.yml). After pushing the tag, approve the pending **core-release** environment deployment in GitHub Actions (required reviewer: `@kzolt`).

Security controls: [github-release-protections.md](github-release-protections.md).

## Related

- [Subdomain cutover](subdomain-cutover.md)
- [GitHub release protections](github-release-protections.md)
- [Architecture overview](../architecture/overview.md)
