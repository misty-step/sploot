# 034 migrate observability from sentry to canary

Status: done
Owner: codex
Created: 2026-06-16

## problem

sploot is an active deployed misty-step app, but runtime error reporting still
depends on sentry in the web app and docs. canary is already present as the
agent-facing sink, so sentry is now duplicate surface area and blocks cancelling
the shared sentry account.

## acceptance

- [x] runtime web errors flow to canary through the existing observability
  logger and client telemetry route.
- [x] sentry runtime config files, direct imports, package dependencies, and
  sentry deploy/env checks are removed from the active web app.
- [x] extension placeholder sentry code is removed because it is not a live
  integration and should not be revived by accident.
- [x] privacy/operator docs name canary as the diagnostic service.
- [ ] production deploy proves `/api/health`, canary health status, and a
  synthetic error readback.

## what was built

- removed `@sentry/nextjs`, sentry Next config wrappers, runtime sentry config
  files, direct sentry imports, the extension placeholder, and the sentry alert
  script.
- kept the existing deep module boundary: `lib/observability-logger.ts`
  remains the server-side error interface and forwards to `lib/canary-reporter.ts`.
- fixed `/api/telemetry` to accept the sanitized client boundary payload that
  `lib/client-error-telemetry.ts` actually sends, including `location`,
  `boundary`, `digest`, and safe metadata.
- updated active operator guidance, privacy copy, deployment validation, and
  spellbook routing to use Canary instead of Sentry.

## evidence

- `rg --hidden -n "Sentry|@sentry|SENTRY|NEXT_PUBLIC_SENTRY|sentry\\.client|sentry\\.server|sentry\\.edge|sentry\\.properties" -g '!node_modules' -g '!dist' -g '!build' -g '!coverage' -g '!.git' -g '!CHANGELOG.md' -g '!backlog.d/_done/**' -g '!docs/qa/evidence/**' -g '!.spellbook/tailor/audit/**'` returned no active-path matches.
- `pnpm lint`
- `pnpm type-check`
- `pnpm --filter web test` — 86 files, 1002 tests.
- `pnpm --filter extension build`
- fresh read-only critic found stale `.spellbook/repo-brief.md` Sentry guidance;
  fixed and reran the active-path scan.

## follow-up

Production deploy/readback remains the live acceptance proof for the portfolio
migration goal: deploy this commit, verify `/api/health`, verify
`/api/health/services` reports Canary healthy, emit a synthetic Sploot error,
and read it back from Canary.

## notes

- keep vercel analytics/speed insights unchanged.
- historical changelog and completed backlog entries may still mention sentry as
  past work; they are not live integrations.
