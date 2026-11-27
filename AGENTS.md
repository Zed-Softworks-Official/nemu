# Agent notes (Nemu)

## Documentation

Graphify is the source of truth for the code: what exists, where it lives, and what a change affects. See "Use Graphify before grep" below.

Planning and architecture direction live in Superhuman Docs:

**[Nemu](https://docs.superhuman.com/d/_d06TiZ2FvM1)** (`superhuman://docs/06TiZ2FvM1`)

Before designing or changing product behavior, load the **`nemu-docs`** skill. Use **Target Architecture** for accepted direction and **Beta Roadmap** for sequence. These pages are plans, not facts about the code: never describe them as built, and when one disagrees with the code, trust the code and flag the drift.

Public deployment docs remain in git:

- `docs/deployment/install.md`
- `docs/deployment/subdomain-cutover.md`
- `docs/deployment/github-release-protections.md`

## Branches

`master` is the default and Stable branch; `canary` is the development branch. Cut feature branches from `origin/canary` and open PRs with base `canary`, never `master`. Promote to `master` only through a `canary` → `master` PR after the change is verified on Canary. See `docs/deployment/github-release-protections.md`.

Work that spans more than one ticket (`/implement-spec`, or several tickets in one session) lands on one **integration branch**, cut from `origin/canary` and named with the spec or parent ticket's `gitBranchName`. Each ticket gets its own local worktree and branch off the integration branch; merge finished ticket branches into the integration branch locally, then delete the worktree and branch. Push only the integration branch, and open exactly one PR from it to `canary`. Ticket branches stay local: they are never pushed and never get their own PR.

## Privacy (non-negotiable)

Readable Home inventory, state, telemetry, Automations, History, and voice data stay on the Controller. Convex is limited to identity references, signed Membership routing projections, Controller public identity, invitations, ACME records, short-lived end-to-end encrypted Relay envelopes, and an Owner-enabled opaque encrypted Home backup. Convex receives no Controller, Access Client, TLS, or backup private keys and has no durable readable Home model or History.

## Agent skills

Skills live in `.agents/skills/`. `.claude/skills/` and `.cursor/skills/` hold symlinks to them, so Claude Code and Cursor load the same set. Upstream skills are pinned in `skills-lock.json`; update them with `npx skills update -p -y`, and restore them on a fresh clone with `npx skills experimental_install -a claude-code`. Don't hand-edit upstream skills, since an update overwrites them. Repo-specific behavior goes in `AGENTS.md`, `docs/agents/`, or a repo-owned skill (`nemu-docs`, `graphify`) that isn't in the lock.

### Issue tracker

Issues live in Linear (Nemu team), via Linear MCP. See `docs/agents/issue-tracker.md`.

File every **follow-up** ticket (work found during `/implement`, `/implement-spec`, a code review, or any implementation that falls outside the ticket in hand) as a sub-issue of the standing **Follow-ups** parent issue. See "Follow-up tickets" in `docs/agents/issue-tracker.md`.

### Triage labels

Default role names: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.

<!-- graphify-rules-start (managed by `graphify init`) -->
## Use Graphify before grep

This repository is indexed by Graphify (`Zed-Softworks-Official/nemu`): a code graph over its call, dependency, and test structure, exposed through a connected Graphify MCP server. Before reaching for grep or reading files, use the Graphify tools your MCP client lists (their exact names and descriptions are in the server's tool list) for what the graph knows and a text search does not:

- find where a symbol, function, or class is defined (instead of grepping for it)
- understand how something works, or where a behavior is handled
- find who calls a function, or what it calls
- see what a change affects (its blast radius) and which tests cover it
- map a file's dependencies and dependents

Fall back to grep or file reads only for what the graph does not model: literal string or comment matches, non-indexed files, or reading a file you have already located. If no Graphify tools are listed, check the MCP server connection. This rule applies inside every skill's explore step and to every sub-agent you spawn: tell sub-agents to use Graphify first. The **`graphify`** skill has the tool table and when to trust a result's `commitSha`.
<!-- graphify-rules-end -->
