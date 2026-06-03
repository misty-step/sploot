# Integrate Canary agent observability

Priority: high
Status: done
Estimate: M

## Goal
Forward Sploot server and authenticated client failures into Canary, expose Canary configuration in health checks, and make deployed smoke prove the production integration is live.

## Non-Goals
- Replace Sentry or Vercel Logs as human debugging surfaces.
- Send browser or extension errors directly to Canary with client-visible secrets.
- Block upload, search, auth, or telemetry responses when Canary is unavailable.
- Change Chrome Web Store release behavior.

## Oracle
- [x] Server-side `logger.logError` forwards sanitized error payloads to Canary when `CANARY_ENDPOINT` and `CANARY_API_KEY` are configured.
- [x] `withObservability` promotes HTTP 5xx route responses into error reports, not just timing logs.
- [x] `/api/telemetry` forwards authenticated client error telemetry through the server logger so extension/web client failures can reach Canary without exposing the ingest key.
- [x] `/api/health` exposes `diagnostics.canary_configured`.
- [x] `/api/health/services` exposes optional `services.canary` state without making Canary a required Sploot dependency.
- [x] `EXPECT_CANARY_CONFIGURED=1 pnpm --filter web smoke:deployed` fails if deployed production is missing Canary config or cannot reach Canary.
- [x] Production Vercel env contains `CANARY_ENDPOINT`, `CANARY_API_KEY`, and `CANARY_SERVICE_NAME`.
- [x] Local gate evidence captured for lint, type-check, web tests, and extension build.

## What Was Built

- Added `apps/web/lib/canary-reporter.ts` with best-effort Canary ingest, metadata redaction, health probing, production-safe env detection, and test-mode opt-in.
- Extended `apps/web/lib/observability-logger.ts` so server errors are forwarded to Canary after existing console/Sentry handling.
- Extended `apps/web/lib/with-observability.ts` so 5xx responses are reported as error events.
- Extended `apps/web/app/api/telemetry/route.ts` so authenticated client error telemetry reaches Canary through the server.
- Added Canary health visibility to `/api/health` and `/api/health/services`.
- Updated deployed smoke and operator docs for the Canary production contract.

## Verification

- `pnpm --filter web exec vitest run __tests__/lib/canary-reporter.test.ts __tests__/lib/observability-logger.test.ts __tests__/lib/with-observability.test.ts __tests__/api/health.test.ts __tests__/api/telemetry.integration.test.ts __tests__/error-scenarios.test.ts`
- `pnpm --filter web type-check`
- `pnpm lint`
- `pnpm type-check`
- `CI=true pnpm --filter web test`
- `pnpm --filter extension build`

Ships-backlog: backlog.d/_done/016-integrate-canary-agent-observability.md
