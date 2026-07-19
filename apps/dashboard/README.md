# `@nemu/dashboard`

Authenticated Nemu control UI. Deployed at [dashboard.nemu.sh](https://dashboard.nemu.sh).

## Development

```bash
# from repo root
pnpm dev:dashboard

# or with the marketing site
pnpm dev:web
```

Runs on port **3001** by default.

## Environment

See [`.env.example`](../../.env.example). Required public origins:

- `NEXT_PUBLIC_SITE_URL` — marketing site
- `NEXT_PUBLIC_DASHBOARD_URL` — this app

Uses the same Clerk application and Convex deployment as `@nemu/web`.
