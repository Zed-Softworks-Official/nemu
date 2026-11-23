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
- Name branches with the Linear branch name from the ticket's `gitBranchName` (for example `kzoltany/nem-123-short-title`), so Linear links the branch and PR to the ticket. An integration branch for a spec uses the spec ticket's branch name.
- Put `Refs NEM-123` in the body of each commit for a ticket.
- Never mark a ticket Done just because its branch merged into a feature or integration branch. That's In Review until the work reaches `master`.
- If work is abandoned, move the ticket back to Todo, or to Canceled with a comment saying why.
- Comment on the ticket when moving it to In Review. Say what shipped, what wasn't verified, and any follow-up tickets.

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
