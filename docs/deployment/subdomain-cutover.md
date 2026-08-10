# Subdomain cutover

Production hostnames for Nemu cloud surfaces and the controller installer.

| Hostname | App / asset | Platform |
| -------- | ----------- | -------- |
| `https://nemu.sh` | Marketing (`@nemu/web`) | Vercel |
| `https://app.nemu.sh` | Dashboard (`@nemu/dashboard`) | Vercel |
| `https://get.nemu.sh` | Installer (`install.sh` + compose assets from `@nemu/web` `public/`) | Vercel (same project as marketing) |

## DNS

1. Point `nemu.sh` and `www` (optional) at the marketing Vercel project.
2. Point `app.nemu.sh` at the dashboard Vercel project.
3. CNAME `get.nemu.sh` at the **same** Vercel project as `nemu.sh`.
4. In the Vercel project for marketing, add domain `get.nemu.sh`. Host-based rewrite serves `/install.sh` at `/` (see [`apps/web/vercel.json`](../../apps/web/vercel.json)).

## Environment

| Variable | Production value |
| -------- | ---------------- |
| `NEXT_PUBLIC_SITE_URL` | `https://nemu.sh` |
| `NEXT_PUBLIC_DASHBOARD_URL` | `https://app.nemu.sh` |
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL |

Controller CORS allowlist includes `https://app.nemu.sh` (and legacy `https://dashboard.nemu.sh` during transition).

## Installer assets

Built into the marketing deploy via [`scripts/vercel-build-web.sh`](../../scripts/vercel-build-web.sh):

- `https://get.nemu.sh` → `install.sh`
- `https://get.nemu.sh/docker-compose.yml`
- `https://get.nemu.sh/mosquitto/mosquitto.conf`
- `https://get.nemu.sh/zigbee2mqtt/configuration.yaml`

Sources of truth: [`scripts/install.sh`](../../scripts/install.sh), [`infra/prod/`](../../infra/prod/).

## Checklist

- [ ] Domains attached in Vercel (marketing + dashboard + `get.nemu.sh`)
- [ ] Clerk allowed origins / redirect URLs include `https://app.nemu.sh`
- [ ] Convex production deployment wired; `NEMU_CONVEX_SITE_URL` documented for installs
- [ ] GHCR package `ghcr.io/zed-softworks-official/nemu-core` is public (Watchtower pulls without auth)
- [ ] Tag `core-v*` publish workflow succeeds on Blacksmith runners
