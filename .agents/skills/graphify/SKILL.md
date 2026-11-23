---
name: graphify
description: >-
  Search and explore the Nemu codebase through the Graphify code graph instead
  of grep or file walks. Use whenever a task needs to find where a symbol is
  defined, how a behavior works, who calls a function, what a change affects,
  which tests cover code, or a file's dependencies, including inside other
  skills' explore steps (how, wayfinder, to-spec, to-tickets, triage,
  diagnosing-bugs, blast-radius, improve-codebase-architecture, architect) and
  in any sub-agent you spawn to explore.
---

# Graphify for code search

Nemu is indexed by Graphify as `Zed-Softworks-Official/nemu`. Pass that as
`repository_id`. The graph models calls, imports, and test links that a text
search can't see.

## Pick the tool

| You want | Tool |
|---|---|
| Where a symbol, function, or class is defined | `graphify_find` (a name fragment, not a question) |
| How something works, or where a behavior is handled | `query_graph` (prose) or `graphify_rank_files` |
| Who calls X | `graphify_callers` |
| A symbol and its neighbors | `graphify_node` |
| What a change affects | `graphify_impact` (`include_risk=true` ranks by test links) |
| Tests linked to a symbol or file | `graphify_tests_for` |
| A file's dependencies and dependents | `graphify_file_neighbors` |

If a name has several definitions, the symbol tools list candidate ids. Pass one.

## Trust the result, or re-check it

Each result carries `commitSha`. Compare it with `git rev-parse HEAD`.

- Same commit and full coverage: use it as is. Don't re-check with grep.
- Different commit: read the current version of files changed since that commit (`git diff --name-only <commitSha> HEAD`).
- Empty or partial result: fall back to reading files.

## When grep is still right

Literal strings, log tags, comments, config values, env var names, and files
the graph doesn't index (Markdown, YAML, shell, lockfiles). Once Graphify has
located a file, read it directly.

## Sub-agents

When you spawn a sub-agent to explore, tell it to use these Graphify tools
first and grep only for the cases above.
