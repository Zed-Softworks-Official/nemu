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
5. Prefer **Status: Current** docs. Trust **Repo Map** and the Architecture page for paths.
6. Then change code under the skill’s **Repo globs**.

Voice is **planned / local-only** and not implemented in `platform/core` yet — do not assume voice modules or endpoints exist.

## Hard privacy rules

1. Controller Postgres holds all home state (devices, rooms, telemetry, voice, automations).
2. Convex stores identity + bindings + ephemeral relay + ACME only (`controllers`, `acmeAccounts`, `pairings`, `invites`, `relayMessages`).
3. Never add device inventory, rooms, scenes, state, telemetry, history, or voice to Convex.
4. Relay is a TTL pipe, not a store. Audio never leaves the device.

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
