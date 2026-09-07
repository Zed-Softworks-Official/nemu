# Agent notes (Nemu)

## Documentation

Architecture and design live in Superhuman Docs:

**[Nemu](https://docs.superhuman.com/d/_d06TiZ2FvM1)** (`superhuman://docs/06TiZ2FvM1`)

Before changing product code, load **`.cursor/skills/nemu-docs/SKILL.md`**: match a **Skills** row and read its linked pages. Use **Current Architecture** for shipped facts, **Target Architecture** for accepted decisions, and **Beta Roadmap** for sequence. Never describe target behavior as shipped.

Public deployment docs remain in git:

- `docs/deployment/install.md`
- `docs/deployment/subdomain-cutover.md`
- `docs/deployment/github-release-protections.md`

## Privacy (non-negotiable)

Readable Home inventory, state, telemetry, Automations, History, and voice data stay on the Controller. Convex is limited to identity references, signed Membership routing projections, Controller public identity, invitations, ACME records, short-lived end-to-end encrypted Relay envelopes, and an Owner-enabled opaque encrypted Home backup. Convex receives no Controller, Access Client, TLS, or backup private keys and has no durable readable Home model or History.

## Agent skills

### Issue tracker

Issues live in Linear (Nemu team), via Linear MCP. See `docs/agents/issue-tracker.md`.

### Triage labels

Default role names: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.
