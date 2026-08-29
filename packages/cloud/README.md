# `@nemu/cloud`

Convex deployment for Nemu: controller registrations, account↔controller
pairings and Google-email invites, and the ephemeral relay mailbox (including
session mint). Home device data never lives here.

## Controller JWT (relay subscription)

Controllers authenticate to Convex with a short-lived ES256 JWT (issuer
`https://nemu.sh/controller`). Generate keys once:

```bash
node scripts/generate-controller-jwt.mjs
# commit packages/cloud/src/lib/controller.jwks.json
# pipe the printed PEM into: npx convex env set CONTROLLER_JWT_PRIVATE_KEY
# then push Convex so auth.config picks up the JWKS
```
