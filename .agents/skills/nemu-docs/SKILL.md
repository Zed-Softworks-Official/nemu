---
name: nemu-docs
description: >-
  Where Nemu is going: accepted Target Architecture, Beta Roadmap sequence, and
  the hard privacy rules, in Superhuman Docs. Use before designing or changing
  Nemu features, schema, pairing, LAN/Relay, Matter, Convex, voice, energy,
  installer, or releases, or when unsure whether a behavior is built or only
  planned. For what the code does today and where it lives, use the graphify
  skill instead; Graphify is the source of truth for code.
---

# Nemu docs (Superhuman)

Graphify is the source of truth for the code: what exists, where it lives, who
calls what, and what a change touches. It is built from the repository, so it
stays current. Use the `graphify` skill for all of that.

Superhuman holds internal planning: architecture direction, accepted decisions,
and the order work lands in. Its pages change as plans change, so read them as
intent, not as fact about the code.

- Doc: https://docs.superhuman.com/d/_d06TiZ2FvM1
- URI: `superhuman://docs/06TiZ2FvM1`

Public install and deploy notes stay in git under `docs/deployment/`. Decisions
are in `docs/adr/`, and terms are in `CONTEXT.md`.

## Which page answers what

| Question | Page | URI |
|---|---|---|
| What have we decided to build? | **Target Architecture** | `superhuman://docs/06TiZ2FvM1/pages/section-32m0eaqs9u` |
| In what order, and what gates beta? | **Beta Roadmap** | `superhuman://docs/06TiZ2FvM1/pages/section-FGvtqZ0GH5` |
| Product direction, stages, out of scope | **Design Document** | `superhuman://docs/06TiZ2FvM1/pages/section-FamOL5zYQQ` |
| Known alpha gaps (dated snapshot) | **Current Architecture** | `superhuman://docs/06TiZ2FvM1/pages/section-XqzhFJaoF2` |

Area plans (Voice Pipeline, Energy Management, Controller Hardware) are listed
in the **Docs** table. Pages under **Archive** described the code and are no
longer maintained; don't use them.

## Workflow

1. For how something works today, ask Graphify first.
2. For where it should go, read the matching page with Superhuman Docs MCP `content_read`.
3. Never describe Target Architecture or Beta Roadmap content as built. Confirm with Graphify.
4. If a page disagrees with the code, trust the code and flag the drift (or fix the page if the user asks).

Voice is post-beta and not implemented in the Controller. Design the separate speaker-like Device architecture before adding voice modules or endpoints.

## Hard privacy rules

1. The Controller is authoritative for Memberships, Access Clients, Device inventory, Rooms, state, Automations, History, Audit records, and operations. PostgreSQL holds the canonical durable model; adapters retain protocol stores.
2. Convex may persist identity references, signed Membership routing projections, Controller public identity, invitations, ACME records, and an Owner-enabled opaque encrypted Home backup.
3. Convex has no durable readable Home model or History. Relay holds only short-lived end-to-end encrypted envelopes and short-lived traffic metadata.
4. Controller, Access Client, TLS, and backup private keys stay outside Convex. Cloud logs exclude Relay contents, Device identifiers, Commands, and Device state.
5. Treat the current plaintext Relay, shared registration secret, and cloud-generated TLS key as migration gaps, not patterns to extend.
