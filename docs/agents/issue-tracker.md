# Issue tracker: Linear

Issues and specs for this repo live in Linear, on the **Nemu** team. Use the **Linear MCP** for all operations. Do not use GitHub Issues, the `gh` issue commands, or a local `.scratch/` tracker.

Resolve the team with the MCP (`list_teams` / equivalent) by name **Nemu**; do not hard-code a team id. Infer the workspace from that team.

## Conventions

- **Create an issue**: MCP create/save on the Nemu team. Title, description, labels, and parent/relations as the calling skill specifies.
- **Read an issue**: fetch the full issue including comments, labels, status, parent, and blocking relations.
- **List issues**: MCP list/search, filtered by team, labels, status, and assignee as needed.
- **Comment on an issue**: MCP create comment on the issue.
- **Apply / remove labels**: MCP update the issue's labels.
- **Status / close**: MCP update status. "Close" means the team's Done/Canceled equivalent, not a GitHub close.
- **Assign**: MCP set assignee. `@me` means the authenticated Linear user.

Ticket identifiers look like `NEM-123` (or whatever prefix the Nemu team uses). Always refer to an issue by **title wrapping a link**; do not leave a bare id as the only name.

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
- **Resolve**: comment the answer on the ticket, mark it done, then append a context pointer (gist + link) to the map's Decisions-so-far.
