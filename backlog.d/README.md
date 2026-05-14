# Backlog

Active work lives at the top level of `backlog.d/`. Completed work moves to
`backlog.d/_done/` once its oracle is green and merged. Each ticket's
`Status:` field is the source of truth; this index is only a readable map.

Status conventions:
- `ready` - shaped and unblocked; pick next.
- `in-progress` - actively being built on a branch or worktree.
- `done` - merged; lives under `backlog.d/_done/`.

## Active

| # | Title | Priority | Estimate |
|---|-------|----------|----------|
| [001](001-fix-extension-upload-response-contract.md) | Fix Extension Upload Response Contract | high | S |
| [002](002-configure-extension-auth-authorized-parties.md) | Configure Extension Auth Authorized Parties | high | M |
| [003](003-ship-first-class-shuffle-api-contract.md) | Ship First-Class Shuffle API Contract | high | M |
| [004](004-resync-api-docs-with-runtime-contracts.md) | Resync API Docs With Runtime Contracts | medium | M |
| [005](005-triage-stale-prs-and-dependency-duplicates.md) | Triage Stale PRs And Dependency Duplicates | medium | S |

## Done

See `_done/` for completed tickets with their `## What Was Built` notes.

## Workflow

- New tickets are created by `/groom` as markdown files at the top level.
- `/shape` may add a sibling `.ctx.md` packet when implementation needs more
  context than the ticket should carry.
- When starting work, set `Status: in-progress` and keep the file at the top
  level until merge.
- When merged, set `Status: done`, add `## What Was Built`, move the file into
  `_done/`, and update this index.
- GitHub Issues are not the tracker for Sploot. PRs may reference backlog file
  paths, but backlog state lives here.
