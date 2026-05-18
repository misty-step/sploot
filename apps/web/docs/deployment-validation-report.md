# Deployment Validation Report

**Date**: 2026-05-18
**Deployment**: https://www.sploot.app
**Status**: Degraded

## Summary

The deployment validation harness now checks the current `/api/health` response
shape and the deployed smoke harness records production product-route behavior.
Health and backing services are available, but the current production deployment
does not yet serve the protected app/API routes expected by the product contract.

## Validation Commands

```bash
pnpm --filter web validate:deployment
pnpm --filter extension build:prod
pnpm --filter web smoke:deployed
```

`validate:deployment` checks the current health schema:

- `status=ok`
- `dependencies.database=up`
- `dependencies.redis=up`
- `diagnostics.database_url_configured=true`
- `diagnostics.prisma_connection_test=true`

Local runs warn, rather than fail, when optional authenticated Vercel/Neon CLI
checks cannot be performed.

## Deployed Smoke

**Script**: `pnpm --filter web smoke:deployed`
**Artifact**: `apps/web/docs/deployed-smoke-report.json`

Checks:

1. Production `/api/health` returns the current schema.
2. Production `/api/health/services` records service readiness.
3. Signed-out `/app` redirects to `/sign-in`.
4. Signed-out `/api/assets?limit=1` returns `401 {"error":"Unauthorized"}`.
5. The production extension artifact includes `manifest.json`, `popup.html`,
   `background.js`, production host permissions, and a live Clerk publishable
   key in the generated JavaScript.

## Current Evidence

- `validate:deployment`: passing against `https://www.sploot.app`.
- `smoke:deployed`: failing against the current production deployment.
- Passing smoke checks: health, service health, production extension artifact.
- Failing smoke checks: signed-out app route protection and signed-out API auth
  contract.

## Known Issues

- `https://www.sploot.app/app` currently returns HTTP 404 instead of redirecting
  signed-out users to `/sign-in`.
- `https://www.sploot.app/api/assets?limit=1` currently returns an HTML 404
  instead of JSON `401 {"error":"Unauthorized"}`.

## Next Action

Deploy the current auth-boundary implementation, then rerun:

```bash
pnpm --filter extension build:prod
pnpm --filter web smoke:deployed
```

Backlog item `010` and the deployed-smoke portion of `012` should stay open
until the smoke artifact records a passing production run.
