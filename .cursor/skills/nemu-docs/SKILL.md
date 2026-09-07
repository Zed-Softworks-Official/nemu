---
name: nemu-docs
description: >-
  Routes Nemu work through the Superhuman Docs Skills and Docs tables
  (architecture, privacy, core, Matter, Convex, dashboard, voice, energy,
  install, releases). Use when changing Nemu features, schema, pairing,
  LAN/relay, voice, energy, installer, or releases — or when unsure where
  code or docs live.
---

# Nemu docs (Superhuman)

Canonical architecture lives in Superhuman, not git `docs/architecture/`.

- Doc: https://docs.superhuman.com/d/_d06TiZ2FvM1
- URI: `superhuman://docs/06TiZ2FvM1`
- Tables: **Skills**, **Docs**

Public install/deploy notes remain in git under `docs/deployment/`.

## Workflow

1. Open Superhuman Docs MCP. Prefer `name_match` for table/page names, or `table_rows_read` on **Skills**.
2. Match the task to a Skills row (Area / When to use).
3. Open that skill’s **Page** link (or `Page id` → `superhuman://docs/06TiZ2FvM1/pages/{Page id}`) and `content_read` the instructions. Skill instructions live on dedicated child pages under **Skills**, not in table canvas cells.
4. For each linked Docs row, open the Docs **Page** / `Page id` the same way. Bodies live on child pages under **Docs**.
5. Classify the claim before using it: **Current Architecture** and **Status: Current** describe shipped behavior; **Target Architecture** and **Status: Accepted** describe approved but potentially unimplemented behavior; **Beta Roadmap** defines sequence and completion gates.
6. Use **Repo Map** only for the current tree. Never describe target behavior as shipped.
7. Then change code under the skill’s **Repo globs**.

Voice is post-beta and not implemented in `platform/core`. Design the separate speaker-like Device architecture before adding voice modules or endpoints.

## Hard privacy rules

1. The Controller is authoritative for Memberships, Access Clients, Device inventory, Rooms, state, Automations, History, Audit records, and operations. PostgreSQL holds the canonical durable model; adapters retain protocol stores.
2. Convex may persist identity references, signed Membership routing projections, Controller public identity, invitations, ACME records, and an Owner-enabled opaque encrypted Home backup.
3. Convex has no durable readable Home model or History. Relay holds only short-lived end-to-end encrypted envelopes and short-lived traffic metadata.
4. Controller, Access Client, TLS, and backup private keys stay outside Convex. Cloud logs exclude Relay contents, Device identifiers, Commands, and Device state.
5. Treat the current plaintext Relay, shared registration secret, and cloud-generated TLS key as migration gaps, not patterns to extend.

## Current path map (quick)

| Area | Path |
|------|------|
| Controller | `platform/core/**` |
| Matter | `platform/matter/**` |
| Convex | `packages/cloud/**` (schema: `src/functions/schema.ts`) |
| Dashboard | `apps/dashboard/**` |
| LAN/relay client | `packages/controller/**` |
| Wire types | `packages/protocol/**` |
| Marketing / installer assets | `apps/web/**`, `scripts/install.sh`, `infra/prod/**` |

Do not use outdated paths (`apps/core`, `apps/web/convex`).
