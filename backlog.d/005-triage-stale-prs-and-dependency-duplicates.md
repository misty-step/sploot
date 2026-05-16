---
id: 005-triage-stale-prs-and-dependency-duplicates
title: Triage Stale PRs And Dependency Duplicates
status: ready
lifecycle_stage: Intent
owner: local
acceptance:
  - Each stale human PR has one explicit action.
  - Duplicate Dependabot tracks for Next and @clerk/clerk-react are consolidated.
  - Any retained PR has passing CI or a concrete follow-up backlog item.
evidence_required:
  - PR triage notes
  - retained PR CI status or follow-up backlog item
refs:
  - backlog.d/README.md
---

# Triage Stale PRs And Dependency Duplicates

Priority: medium
Status: ready
Estimate: S

## Goal

The open PR queue reflects current work instead of stale, conflicting, or
duplicate tracks.

## Non-Goals

- Merging dependency updates without CI evidence
- Reopening already closed dependency noise
- Moving Sploot work tracking back to GitHub Issues

## Oracle

- [ ] Each stale human PR has one explicit action: rebase/resubmit or close with
      a clear replacement note.
- [ ] Duplicate Dependabot tracks for Next and `@clerk/clerk-react` are
      consolidated so only the viable lockfile-correct PR remains.
- [ ] Any retained PR has passing CI or a concrete follow-up backlog item.

## Scope

- PR #154 `feat(web): add PostHog product analytics`
- PR #156 `ci: add trufflehog workflow`
- PR #157 `ci: normalize merge gate`
- PRs #169/#170 Next bump duplication
- PRs #167/#168 `@clerk/clerk-react` duplication

## Why Now

The PR queue had ten open PRs while the local backlog was empty. Three March 6
human PRs were stale/dirty, and two dependency families had duplicate tracks.
That makes review state noisy unless PR hygiene is captured locally and
resolved.
