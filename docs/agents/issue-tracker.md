# Issue tracker: Linear

Issues and specs for this repo live in Linear, on the **Nemu** team. Use the **Linear MCP** for all operations. Do not use GitHub Issues, the `gh` issue commands, or a local `.scratch/` tracker.

Resolve the team with the MCP (`list_teams` / equivalent) by name **Nemu**; do not hard-code a team id. Infer the workspace from that team.

## Conventions

- **Create an issue**: MCP create/save on the Nemu team. Title, description, labels, and parent/relations as the calling skill specifies.
- **Read an issue**: fetch the full issue including comments, labels, status, parent, and blocking relations.
- **List issues**: MCP list/search, filtered by team, labels, status, and assignee as needed.
- **Comment on an issue**: MCP create comment on the issue.
- **Apply / remove labels**: MCP update the issue's labels.
- **Status / close**: MCP update status, following the status workflow below. "Close" means Done (or Canceled/Duplicate for work that won't ship), not a GitHub close.
- **Assign**: MCP set assignee. `@me` means the authenticated Linear user.

Ticket identifiers look like `NEM-123` (or whatever prefix the Nemu team uses). Always refer to an issue by **title wrapping a link**; do not leave a bare id as the only name.

## Ticket status workflow

**This tracker closes work through PRs.** Move every ticket through these statuses as the work moves. Don't leave a ticket in Backlog or Todo once someone has started it.

| Status | When | Who moves it |
| --- | --- | --- |
| **Backlog** / **Todo** | Not started. | — |
| **In Progress** | The first write of the session that starts the ticket: before any code, branch, or worktree. Also assign it. | The agent or person starting it, through the MCP. |
| **In Review** | A PR containing the ticket's work is open, or the ticket's branch has been merged into an integration branch that has an open PR. | The agent or person opening the PR, through the MCP. |
| **Done** | The PR containing the work merges into `master`. | Linear's GitHub integration, from `Closes NEM-123` in the PR description. If the ticket hasn't moved within a few minutes of the merge, set it with the MCP. |

Rules:

- Every PR description lists `Closes NEM-123` on its own line for each ticket it completes, and `Refs NEM-123` for tickets it touches but doesn't finish, such as a parent spec with open sub-issues.
- Name branches with the Linear branch name from the ticket's `gitBranchName` (for example `kzoltany/nem-123-short-title`), so Linear links the branch and PR to the ticket. An integration branch for a spec uses the spec ticket's branch name. Per-ticket branches under an integration branch stay local (see "Branches" in `AGENTS.md`), so their tickets link to the integration PR through its `Closes` lines and their commits' `Refs` lines.
- Put `Refs NEM-123` in the body of each commit for a ticket.
- Never mark a ticket Done just because its branch merged into a feature or integration branch. That's In Review until the work reaches `master`.
- If work is abandoned, move the ticket back to Todo, or to Canceled with a comment saying why.
- Comment on the ticket when moving it to In Review. Say what shipped, what wasn't verified, and any follow-up tickets.

## Follow-up tickets

A **follow-up** is work discovered while implementing a ticket that the ticket doesn't cover: a deferred edge case, a review finding left unfixed, a refactor, a gap in tests or docs. Every follow-up goes under one standing parent issue so they can be triaged and picked up from one place.

1. Find the parent: the open Nemu issue titled exactly **Follow-ups**. If none exists, create it on the Nemu team with that title and a one-line description ("Parent for follow-up work found during implementation"), and leave it in Backlog. It never closes.
2. Create the follow-up as a sub-issue of **Follow-ups**, never of the spec or ticket that surfaced it, so the spec can reach Done while its follow-ups stay open.
3. Add a **related** relation from the follow-up to the ticket that surfaced it, and name that ticket in the description, so the origin is one click away.
4. List each follow-up, as a title wrapping a link, in the In Review comment on the originating ticket.

Implementer subagents report follow-ups to the orchestrating agent instead of filing them, and the orchestrator files them once, so parallel workers don't create duplicates.

## Pull request base branch

`master` is the default branch, but it is the Stable branch, not where work lands. Cut every branch from `canary` and open every PR against `canary` (`gh pr create --base canary`). Never target `master` directly: `master` only receives `canary` → `master` promotion PRs after the change is verified on Canary.

## Pull requests as a triage surface

**PRs as a request surface: no.** GitHub PRs are not triaged as issues. `/triage` covers Linear issues only.

## When a skill says "publish to the issue tracker"

Create a Linear issue on the Nemu team. Apply the `ready-for-agent` triage label unless instructed otherwise. Use Linear's native **blocked-by** relations for blocking edges, created in dependency order (blockers first) so each ticket can reference real identifiers.

## When a skill says "fetch the relevant ticket"

Fetch that Linear issue (id or URL) including comments.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single Linear issue with **child** issues as tickets.

- **Map**: one issue labelled `wayfinder:map`, body = Notes / Decisions-so-far / Fog. Create it on the Nemu team with that label.
- **Child ticket**: a Linear **sub-issue** of the map. Labels: `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`). Once claimed, assign it to the driving dev.
- **Blocking**: Linear's native **blocked-by** relation (the canonical, UI-visible gate). A ticket is unblocked when every blocker is in a done/canceled status. Do not fall back to a body convention unless the MCP cannot write relations.
- **Frontier query**: list the map's open sub-issues; drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: assign the issue to the authenticated user, the session's first write.
- **Resolve**: comment the answer on the ticket, mark it done (research, prototype, and grilling tickets that ship no code go straight to Done; `task` tickets follow the status workflow above), then append a context pointer (gist + link) to the map's Decisions-so-far.
