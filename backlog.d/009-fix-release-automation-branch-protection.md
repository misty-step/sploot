---
id: 009-fix-release-automation-branch-protection
title: Fix Release Automation Branch Protection
status: ready
lifecycle_stage: Intent
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
Status: ready
Estimate: M

## Goal

Automated releases can publish without being rejected by protected `master`.

## Non-Goals

- Weakening branch protection without an explicit alternative control
- Replacing semantic-release wholesale unless the smaller fix is not viable
- Combining web deploy and extension Web Store release

## Oracle

- [ ] Release workflow avoids direct protected-branch mutation or uses an
      approved protected-branch-compatible strategy.
- [ ] A semantic-release dry-run or controlled release proves the next release
      path past the previous `@semantic-release/git` failure.
- [ ] `CHANGELOG.md` and GitHub release notes behavior is documented.
- [ ] `gh run list` no longer shows repeated Release failures on every merge.

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
