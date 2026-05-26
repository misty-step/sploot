---
id: 011-unify-upload-url-offline-background-contract
title: Unify Upload URL Offline Background Contract
status: done
lifecycle_stage: Feedback
owner: local
acceptance:
  - /api/upload-url request and response types live in @sploot/common or the path is removed.
  - use-background-sync and service worker callers send the documented fields and consume the documented response.
  - Offline/background upload has a tested happy path or is explicitly disabled from UX.
  - API docs match route and callers.
evidence_required:
  - request-level /api/upload-url tests
  - background upload integration or removal evidence
  - docs/common type diff
  - browser/PWA smoke notes if feature remains
refs:
  - apps/web/app/api/upload-url/route.ts
  - apps/web/hooks/use-background-sync.ts
  - apps/web/public/sw-custom.js
  - packages/common/src/types.ts
  - apps/web/docs/API.md
---

# Unify Upload URL Offline Background Contract

Priority: high
Status: done
Estimate: M

## Goal

Offline/background upload either works through one typed upload-url contract or
is removed/hidden so users cannot enter a guaranteed-broken path.

## Non-Goals

- Rewriting direct multipart `/api/upload`
- Adding a new storage provider
- Broad PWA redesign

## Oracle

- [x] `/api/upload-url` validates one canonical request shape, including file
      size, and returns one canonical response shape, or the path is removed.
- [x] `use-background-sync.ts` and `sw-custom.js` use that same shape, or the
      unsupported service-worker replay path is removed.
- [x] A focused test proves queued upload can obtain an upload URL and create an
      asset record, or the offline/background upload path is removed from product UI.
- [x] `apps/web/docs/API.md` documents only the supported contract.

## Scope

- `apps/web/app/api/upload-url/route.ts`
- `apps/web/hooks/use-background-sync.ts`
- `apps/web/public/sw-custom.js`
- `packages/common/src/types.ts`
- `apps/web/docs/API.md`

## Why Now

The route expects `filename`, `mimeType`, and `size`, then returns
`uploadUrl`, but background callers send `contentType`, omit `size`, and expect
`url`. That makes the PWA/background upload path fail before the file reaches
storage.

## Links

- `apps/web/app/api/upload-url/route.ts`
- `apps/web/hooks/use-background-sync.ts`
- `apps/web/public/sw-custom.js`

## What Was Built

- Removed the unsupported `/api/upload-url` route instead of adding shared types around a non-working direct-upload abstraction.
- Removed the service-worker upload replay path, background sync hook/status UI, `UploadZoneWithSync`, and the PWA `importScripts` dependency on `sw-custom.js`.
- Kept the supported upload contract as `POST /api/upload` with multipart form data and `SplootApiUploadResponse` from `@sploot/common`.
- Updated API docs, architecture docs, ADR examples, and the upload test component to point at `POST /api/upload`.
- Added a focused upload drop zone test proving unsupported background upload copy is not shown.

Removal evidence:
- `rg -n "BackgroundSyncStatus|useBackgroundSync|enableBackgroundSync|UploadZoneWithSync|supportsBackgroundSync|sw-custom|/api/upload-url|upload-url|uploadUrl|direct-upload URL|background sync|BackgroundSync|trackBackgroundSync" apps/web packages/common apps/extension ARCHITECTURE.md -S` returned no matches.
- Browser/PWA note: service-worker upload replay was removed, so no authenticated background upload smoke is applicable. Authenticated direct upload smoke remains the supported production upload check.

Evidence:
- `pnpm --filter web exec vitest run __tests__/components/upload/upload-drop-zone.test.tsx __tests__/api/auth-unauthorized-contracts.test.ts`
- `DATABASE_URL='postgresql://test:test@localhost:5432/sploot_test?sslmode=disable' CI=true pnpm --filter web test`
- `pnpm lint`
- `pnpm type-check`
- `pnpm --filter extension build`
- `git diff --check`
- `gradient validate`

Build note:
- Critic ran `pnpm --filter web build`; PWA service-worker compilation completed, then prerendering stopped because local Clerk `publishableKey` was not configured. This is not a regression in the removed upload replay path.
