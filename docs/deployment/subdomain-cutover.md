# Subdomain cutover checklist

Nemu ships as two standalone Next.js apps (no Microfrontends):

| App | Package | Production host | Local |
|---|---|---|---|
| Marketing | `@nemu/web` | `https://nemu.sh` | `http://localhost:3000` |
| Dashboard | `@nemu/dashboard` | `https://dashboard.nemu.sh` | `http://localhost:3001` |

Shared packages (`@nemu/ui`, `@nemu/cloud`) stay in the monorepo. Convex still deploys from the web production build (`scripts/vercel-build-web.sh`).

## 1. Vercel projects

1. Confirm **two** Vercel projects point at this repo:
   - Web: root / `apps/web` with [`apps/web/vercel.json`](../../apps/web/vercel.json)
   - Dashboard: `apps/dashboard` with [`apps/dashboard/vercel.json`](../../apps/dashboard/vercel.json)
2. Remove any **Microfrontends** group that path-mounts `/dashboard` onto the web project.
3. Assign domains:
   - Web → `nemu.sh` (and `www` if used)
   - Dashboard → `dashboard.nemu.sh`
4. Set env vars on **both** projects:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_SITE_URL=https://nemu.sh
NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.nemu.sh
```

Web production builds also need `CONVEX_DEPLOY_KEY` and Convex-related secrets for `scripts/vercel-build-web.sh`.

## 2. DNS

Add a `CNAME` (or Vercel alias) for `dashboard.nemu.sh` to the dashboard project. Keep `nemu.sh` on the web project.

## 3. Clerk

Keep a **single** Clerk application for both hosts:

1. Add `https://dashboard.nemu.sh` to allowed origins / authorized parties.
2. Add redirect / callback URLs for the dashboard host (sign-in, sign-up, OAuth).
3. Prefer cookie domain / satellite or multi-domain setup so a session started on `nemu.sh` works on `dashboard.nemu.sh`.
4. Leave `CLERK_JWT_ISSUER_DOMAIN` (Convex) unchanged if the Clerk app is the same.

## 4. Convex

No schema change is required for the subdomain split. Ensure the deployment still has:

- `CLERK_JWT_ISSUER_DOMAIN`
- `CONTROLLER_REGISTRATION_SECRET` (if used)

`NEXT_PUBLIC_CONVEX_URL` on both Vercel projects should point at the same deployment.

## 5. Verify after deploy

- [ ] `https://nemu.sh` loads marketing
- [ ] `https://dashboard.nemu.sh/` loads the dashboard shell
- [ ] `https://nemu.sh/dashboard` → `https://dashboard.nemu.sh/`
- [ ] `https://nemu.sh/dashboard/devices` → `https://dashboard.nemu.sh/devices`
- [ ] Sign-in on marketing, then open dashboard without forced re-auth
- [ ] Logo / favicon load from the dashboard project (no rewrite to `nemu.sh`)
- [ ] Browser on `dashboard.nemu.sh` can call the LAN controller (CORS allows that origin)
