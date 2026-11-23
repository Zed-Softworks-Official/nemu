# Agent notes (Nemu)

## Documentation

Architecture and design live in Superhuman Docs:

**[Nemu](https://docs.superhuman.com/d/_d06TiZ2FvM1)** (`superhuman://docs/06TiZ2FvM1`)

Before changing product code, load **`.cursor/skills/nemu-docs/SKILL.md`**: match a **Skills** row and read its linked pages. Use **Current Architecture** for shipped facts, **Target Architecture** for accepted decisions, and **Beta Roadmap** for sequence. Never describe target behavior as shipped.

Public deployment docs remain in git:

- `docs/deployment/install.md`
- `docs/deployment/subdomain-cutover.md`
- `docs/deployment/github-release-protections.md`

## Branches

`master` is the default and Stable branch; `canary` is the development branch. Cut feature branches from `origin/canary` and open PRs with base `canary`, never `master`. Promote to `master` only through a `canary` → `master` PR after the change is verified on Canary. See `docs/deployment/github-release-protections.md`.

## Privacy (non-negotiable)

Readable Home inventory, state, telemetry, Automations, History, and voice data stay on the Controller. Convex is limited to identity references, signed Membership routing projections, Controller public identity, invitations, ACME records, short-lived end-to-end encrypted Relay envelopes, and an Owner-enabled opaque encrypted Home backup. Convex receives no Controller, Access Client, TLS, or backup private keys and has no durable readable Home model or History.

## Agent skills

### Issue tracker

Issues live in Linear (Nemu team), via Linear MCP. See `docs/agents/issue-tracker.md`.

### Triage labels

Default role names: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.

<!-- graphify-rules-start (managed by `graphify init`) -->
## Use Graphify before grep

This repository is indexed by Graphify: a code graph over its call, dependency, and test structure, exposed through a connected Graphify MCP server. Before reaching for grep or reading files, use the Graphify tools your MCP client lists (their exact names and descriptions are in the server's tool list) for what the graph knows and a text search does not:

- find where a symbol, function, or class is defined (instead of grepping for it)
- understand how something works, or where a behavior is handled
- find who calls a function, or what it calls
- see what a change affects (its blast radius) and which tests cover it
- map a file's dependencies and dependents

Fall back to grep or file reads only for what the graph does not model: literal string or comment matches, non-indexed files, or reading a file you have already located. If no Graphify tools are listed, check the MCP server connection.
<!-- graphify-rules-end -->
