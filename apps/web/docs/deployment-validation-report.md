# Deployment Validation Report

**Date**: 2026-05-18
**Deployment**: https://www.sploot.app
**Status**: Passing

## Summary

The deployment validation harness checks the current `/api/health` response
shape and the deployed smoke harness records production product-route behavior.
After deploying `dpl_9DWe7Dhz82D5pX8GFbKd3j4cYZYT`, health, backing services,
signed-out app protection, signed-out API auth, and production extension
artifact sanity all pass against `https://www.sploot.app`.

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
3. Signed-out `/app`, `/app/search`, and `/app/upload` redirect to `/sign-in`.
4. Signed-out `/api/assets?limit=1` returns `401 {"error":"Unauthorized"}`.
5. The production extension zip includes `manifest.json`, `popup.html`,
   `background.js`, production host permissions, and a live Clerk publishable
   key in the generated JavaScript. The harness validates
   `../extension/dist/extension-1.0.0-chrome.zip` by default so release smoke
   checks the upload artifact rather than a stale unpacked development build.

## Current Evidence

- `validate:deployment`: passing against `https://www.sploot.app`.
- `smoke:deployed`: passing against `https://www.sploot.app`; the extension
  artifact check validated `../extension/dist/extension-1.0.0-chrome.zip`.
- Passing smoke checks: health, service health, signed-out app route protection
  for `/app`, `/app/search`, and `/app/upload`, signed-out API auth contract,
  and production extension zip artifact.

## Known Issues

- Authenticated extension popup and library visibility partially passed in
  Chrome, but right-click upload and duplicate behavior remain unproven.
- Store screenshots, promo tile, production rebuild from a live Clerk key, and
  Chrome Web Store upload/review receipt remain open for extension publishing.

## Next Action

Use the passing smoke artifact as the release gate for signed-out production
behavior. For extension publishing, complete authenticated production Chrome
extension upload smoke with a signed-in browser session:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_* pnpm --filter extension build:prod
pnpm --filter web smoke:deployed
```

Backlog item `007` should stay open until the Chrome Web Store artifact and
authenticated extension upload receipt are complete.
