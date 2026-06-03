---
id: 012-make-deployed-qa-and-extension-gates-real
title: Make Deployed QA And Extension Gates Real
status: done
lifecycle_stage: Feedback
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
Status: done
Estimate: M

## Goal

The QA gate proves the deployed app and extension-critical behavior instead of
only compiling the extension and running unit tests.

## Non-Goals

- Replacing the entire CI pipeline
- Adding flaky end-to-end coverage for every UI path
- Requiring production secrets for pull-request CI

## Oracle

- [x] `pnpm --filter web validate:deployment` matches current `/api/health`
      response shape and passes against `https://www.sploot.app`.
- [x] CI runs `pnpm --filter extension test` and a real extension lint/static
      check.
- [x] Focused extension tests cover auth-manager, image-fetcher, and
      notification/error mapping behavior.
- [x] A deployed smoke script records production health/services results and
      expected signed-out protected-route/API behavior.

## Scope

- `.github/workflows/ci.yml`
- `apps/web/scripts/validate-deployment.sh`
- `apps/web/docs/deployment-validation-report.md`
- `apps/extension/package.json`

## What Was Built

- Updated the deployment validator to assert the current `/api/health` schema:
  `status=ok`, `dependencies.database=up`, `dependencies.redis=up`,
  `diagnostics.database_url_configured=true`, and
  `diagnostics.prisma_connection_test=true`.
- Added a deployed smoke harness that records production health, service
  readiness, signed-out app redirect behavior, signed-out API 401 behavior, and
  production extension artifact sanity into
  `apps/web/docs/deployed-smoke-report.json`.
- Made the extension CI gate real: CI runs extension lint/static check,
  extension tests, and extension build, then uploads the built artifact.
- Added focused extension coverage for background auth state/token behavior,
  image fetch validation/privacy/size handling, notification mapping, app URL
  handling, and upload response/error mapping.
- Removed package-manager drift from the checked workspace: no npm/yarn/bun
  lockfiles are present under the repo scan, and package scripts use pnpm
  workflows.
- Deployed the current branch to Vercel production and reran the deployed smoke
  until it passed against `https://www.sploot.app`.

## Evidence

- `pnpm --filter web validate:deployment` passed against
  `https://www.sploot.app` on 2026-05-18.
- `pnpm --filter extension lint && pnpm --filter extension test && pnpm --filter extension build` passed on 2026-05-18; extension tests: 5 files, 16 tests.
- `find . -maxdepth 4 \( -name package-lock.json -o -name yarn.lock -o -name bun.lock -o -name npm-shrinkwrap.json \) -print` returned no files.
- `VITE_CLERK_PUBLISHABLE_KEY=pk_live_* pnpm --filter extension build:prod && pnpm --filter web smoke:deployed` passed after deploy on 2026-05-18; see `apps/web/docs/deployed-smoke-report.json`.
- Production deploy evidence: Vercel deployment
  `dpl_9DWe7Dhz82D5pX8GFbKd3j4cYZYT`,
  `https://sploot-9hzycv2x3-misty-step.vercel.app`, aliased to
  `https://www.sploot.app`.
- Authenticated production smoke: blocked. Attempted source was the existing
  Chrome profile via the Codex Chrome backend; Chrome was running and the Codex
  Chrome Extension was installed/enabled earlier, but the backend reported
  `Browser is not available: chrome`. No user-provided production test account
  or bearer token was available, so signed-in upload/search smoke remains a
  release-readiness input for backlog 007 rather than hidden evidence here.
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
