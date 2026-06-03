---
id: 009-fix-release-automation-branch-protection
title: Fix Release Automation Branch Protection
status: done
lifecycle_stage: Feedback
owner: local
acceptance:
  - Release workflow no longer tries to push a changelog commit directly to protected master without required checks.
  - Next release path is proven with a dry-run or controlled release evidence.
  - Release notes/changelog strategy is documented for protected branches.
  - Node action deprecation and pnpm action version drift are addressed or explicitly deferred.
evidence_required:
  - failing GitHub Actions log reference
  - workflow diff
  - semantic-release dry-run or successful release run
  - release notes/changelog evidence
refs:
  - .github/workflows/release.yml
  - CHANGELOG.md
  - GitHub Actions run 26039957419
---

# Fix Release Automation Branch Protection

Priority: high
Status: done
Estimate: M

## Goal

Automated releases can publish without being rejected by protected `master`.

## Non-Goals

- Weakening branch protection without an explicit alternative control
- Replacing semantic-release wholesale unless the smaller fix is not viable
- Combining web deploy and extension Web Store release

## Oracle

- [x] Release workflow avoids direct protected-branch mutation or uses an
      approved protected-branch-compatible strategy.
- [x] A semantic-release dry-run or controlled release proves the next release
      path past the previous `@semantic-release/git` failure.
- [x] `CHANGELOG.md` and GitHub release notes behavior is documented.
- [x] Historical repeated Release failures are documented; the next post-merge
      Release run is expected to be the live confirmation signal.

## Scope

- `.github/workflows/release.yml`
- semantic-release configuration
- `CHANGELOG.md` process docs if behavior changes

## Why Now

On 2026-05-18, CI passed on `master` but Release failed repeatedly. The latest
failure tried to push tags and a changelog commit to protected `master`, and
GitHub rejected it because required status check `merge-gate` was expected.
That blocks release `1.1.0` while `v1.0.0` remains the latest GitHub release.

## Links

- GitHub Actions run `26039957419`
- `.github/workflows/release.yml`
- `CHANGELOG.md`

## What Was Built

Semantic-release no longer runs `@semantic-release/changelog` or
`@semantic-release/git`, so the release path cannot create a `CHANGELOG.md` or
`package.json` prepare commit against protected `master`. The workflow now runs
the repo `pnpm release` script, uses `pnpm/action-setup@v4`, and keeps write
permissions scoped to the jobs that need them. `CHANGELOG.md` now documents
GitHub Releases as the authoritative changelog and notes that synthesized notes,
when enabled, update GitHub Release notes rather than committing to the branch.

The prior failing release evidence is GitHub Actions run `26039957419`, where
`@semantic-release/git` tried to push to protected `master` and was rejected by
the required `merge-gate` branch protection check.
`gh run list --workflow release.yml --limit 5` still shows the historical
pre-fix failures because this backlog fix has not merged yet; the local
branch-correct dry-run below is the pre-merge proof, and the first post-merge
Release run is the remaining production confirmation signal.

Verified on 2026-05-18:

- `pnpm install --frozen-lockfile`
- `GITHUB_TOKEN="$(gh auth token)" pnpm release:dry-run`
- In `/tmp/sploot-release-dryrun`, on local branch `master` with this patch
  applied:
  `GITHUB_TOKEN="$(gh auth token)" pnpm release:dry-run --repository-url https://github.com/misty-step/sploot.git`
  loaded only `@semantic-release/github`, `@semantic-release/commit-analyzer`,
  and `@semantic-release/release-notes-generator`; analyzed 22 commits from
  `v1.0.0`; computed release `1.1.0`; generated notes; and skipped tag/GitHub
  publish only because dry-run mode was active.
- `pnpm lint`
- `pnpm type-check`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable pnpm --filter web db:migrate`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable CI=true pnpm --filter web test`
- `pnpm --filter extension build`
