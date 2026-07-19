# `@nemu/web`

Marketing site for Nemu. Deployed at [nemu.sh](https://nemu.sh).

## Development

```bash
# from repo root — starts web (:3000) and dashboard (:3001)
pnpm dev:web

# web only
pnpm --filter @nemu/web dev
```

## Environment

See [`.env.example`](../../.env.example). Required public origins:

- `NEXT_PUBLIC_SITE_URL` — this app (`http://localhost:3000` locally, `https://nemu.sh` in production)
- `NEXT_PUBLIC_DASHBOARD_URL` — dashboard app (`http://localhost:3001` locally, `https://dashboard.nemu.sh` in production)

Legacy path `/dashboard` permanently redirects to `NEXT_PUBLIC_DASHBOARD_URL`.
