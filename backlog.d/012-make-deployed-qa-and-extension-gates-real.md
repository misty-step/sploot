---
id: 012-make-deployed-qa-and-extension-gates-real
title: Make Deployed QA And Extension Gates Real
status: ready
lifecycle_stage: Intent
owner: local
acceptance:
  - Deployment validator matches the current health schema and runs cleanly against production.
  - CI runs extension tests, not just extension build.
  - Extension lint is real or explicitly replaced with an equivalent static check.
  - Pnpm-only tooling drift is removed from package scripts and lockfiles.
  - A scripted deployed smoke covers health, protected auth behavior, and production extension artifact sanity.
evidence_required:
  - updated validate-deployment output
  - CI workflow diff
  - extension test/lint output
  - deployed smoke artifact
refs:
  - apps/web/scripts/validate-deployment.sh
  - apps/web/app/api/health/route.ts
  - .github/workflows/ci.yml
  - apps/extension/package.json
  - apps/extension/entrypoints/background/auth-manager.ts
  - apps/extension/entrypoints/background/image-fetcher.ts
---

# Make Deployed QA And Extension Gates Real

Priority: high
Status: ready
Estimate: M

## Goal

The QA gate proves the deployed app and extension-critical behavior instead of
only compiling the extension and running unit tests.

## Non-Goals

- Replacing the entire CI pipeline
- Adding flaky end-to-end coverage for every UI path
- Requiring production secrets for pull-request CI

## Oracle

- [ ] `pnpm --filter web validate:deployment` matches current `/api/health`
      response shape and passes against `https://www.sploot.app`.
- [ ] CI runs `pnpm --filter extension test` and a real extension lint/static
      check.
- [ ] Focused extension tests cover auth-manager, image-fetcher, and
      notification/error mapping behavior.
- [ ] A deployed smoke script records production health/services results and
      expected signed-out protected-route/API behavior.

## Scope

- `.github/workflows/ci.yml`
- `apps/web/scripts/validate-deployment.sh`
- `apps/web/docs/deployment-validation-report.md`
- `apps/extension/package.json`
- root and workspace package manager metadata
- extension tests under `apps/extension`

## Why Now

The groom found that the deployment validator still expects a legacy health
schema, while current runtime returns `dependencies.database=up`. CI also builds
the extension but does not run extension tests, the extension lint script is a
no-op, and the repo still has mixed package-manager signals despite the pnpm
invariant. This weakens the release signal for the main capture surface.

## Links

- `apps/web/scripts/validate-deployment.sh`
- `.github/workflows/ci.yml`
- `apps/extension/package.json`
