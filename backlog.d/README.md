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
| [018](018-agent-friendly-auth-and-qa-harness.md) | Agent-Friendly Auth And QA Harness | P1 | L |

## Done

See `_done/` for completed tickets with their `## What Was Built` notes.

Recently completed:
- [016](_done/016-integrate-canary-agent-observability.md) Integrate Canary Agent Observability
- [001](_done/001-fix-extension-upload-response-contract.md) Fix Extension Upload Response Contract
- [002](_done/002-configure-extension-auth-authorized-parties.md) Configure Extension Auth Authorized Parties
- [003](_done/003-ship-first-class-shuffle-api-contract.md) Ship First-Class Shuffle API Contract
- [004](_done/004-resync-api-docs-with-runtime-contracts.md) Resync API Docs With Runtime Contracts
- [005](_done/005-triage-stale-prs-and-dependency-duplicates.md) Triage Stale PRs And Dependency Duplicates
- [009](_done/009-fix-release-automation-branch-protection.md) Fix Release Automation Branch Protection
- [008](_done/008-add-storage-quota-and-runtime-gates.md) Add Storage Quota And Runtime Gates
- [013](_done/013-align-product-privacy-claims-with-runtime.md) Align Product Privacy Claims With Runtime
- [011](_done/011-unify-upload-url-offline-background-contract.md) Unify Upload URL Offline Background Contract
- [014](_done/014-fix-core-library-ux-contract-gaps.md) Fix Core Library UX Contract Gaps
- [010](_done/010-repair-auth-boundary-and-api-error-contracts.md) Repair Auth Boundary And API Error Contracts
- [012](_done/012-make-deployed-qa-and-extension-gates-real.md) Make Deployed QA And Extension Gates Real
- [015](_done/015-improve-shuffle-and-upload-architecture.md) Improve Shuffle And Upload Architecture

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
