---
name: nemu-docs
description: >-
  Where Nemu is going: accepted Target Architecture, Beta Roadmap sequence,
  shipped Current Architecture, and the hard privacy rules, all in Superhuman
  Docs. Use before changing Nemu features, schema, pairing, LAN/Relay, Matter,
  Convex, voice, energy, installer, or releases, or when unsure whether a
  behavior is shipped or only planned. For where code lives, use the graphify
  skill instead.
---

# Nemu docs (Superhuman)

Superhuman holds Nemu's direction: what is shipped, what is decided, and in what
order it lands. It does not describe the repo tree. For where code lives, who
calls what, and what a change touches, use Graphify (see the `graphify` skill).

- Doc: https://docs.superhuman.com/d/_d06TiZ2FvM1
- URI: `superhuman://docs/06TiZ2FvM1`

Public install and deploy notes stay in git under `docs/deployment/`.

## Which page answers what

| Question | Page | URI |
|---|---|---|
| What is shipped today? | **Current Architecture** | `superhuman://docs/06TiZ2FvM1/pages/section-XqzhFJaoF2` |
| What have we decided to build? | **Target Architecture** | `superhuman://docs/06TiZ2FvM1/pages/section-32m0eaqs9u` |
| In what order, and what gates beta? | **Beta Roadmap** | `superhuman://docs/06TiZ2FvM1/pages/section-FGvtqZ0GH5` |
| Area guidance (Core, Matter, Cloud, Dashboard, Voice, Energy, Install, Release, Privacy) | **Skills** table, then the row's **Page** | `superhuman://docs/06TiZ2FvM1/pages/section-vxDcVPRmfK` |

## Workflow

1. Read the page that answers your question with Superhuman Docs MCP `content_read`. For area work, read the matching **Skills** row's **Page**, and the **Docs** pages it links.
2. Classify each claim before you use it. **Current Architecture** and **Status: Current** describe shipped behavior. **Target Architecture** and **Status: Accepted** describe approved but possibly unimplemented behavior. **Beta Roadmap** sets sequence and completion gates. Never describe target behavior as shipped.
3. Ignore repo paths in Superhuman (**Repo Map**, **Repo globs**). They drift. Find code with Graphify.
4. If a page disagrees with the code Graphify shows, trust the code for current behavior and flag the drift.

Voice is post-beta and not implemented in the Controller. Design the separate speaker-like Device architecture before adding voice modules or endpoints.

## Hard privacy rules

1. The Controller is authoritative for Memberships, Access Clients, Device inventory, Rooms, state, Automations, History, Audit records, and operations. PostgreSQL holds the canonical durable model; adapters retain protocol stores.
2. Convex may persist identity references, signed Membership routing projections, Controller public identity, invitations, ACME records, and an Owner-enabled opaque encrypted Home backup.
3. Convex has no durable readable Home model or History. Relay holds only short-lived end-to-end encrypted envelopes and short-lived traffic metadata.
4. Controller, Access Client, TLS, and backup private keys stay outside Convex. Cloud logs exclude Relay contents, Device identifiers, Commands, and Device state.
5. Treat the current plaintext Relay, shared registration secret, and cloud-generated TLS key as migration gaps, not patterns to extend.
