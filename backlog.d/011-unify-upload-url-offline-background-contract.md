---
id: 011-unify-upload-url-offline-background-contract
title: Unify Upload URL Offline Background Contract
status: ready
lifecycle_stage: Intent
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
Status: ready
Estimate: M

## Goal

Offline/background upload either works through one typed upload-url contract or
is removed/hidden so users cannot enter a guaranteed-broken path.

## Non-Goals

- Rewriting direct multipart `/api/upload`
- Adding a new storage provider
- Broad PWA redesign

## Oracle

- [ ] `/api/upload-url` validates one canonical request shape, including file
      size, and returns one canonical response shape.
- [ ] `use-background-sync.ts` and `sw-custom.js` use that same shape.
- [ ] A focused test proves queued upload can obtain an upload URL and create an
      asset record, or the offline/background path is removed from product UI.
- [ ] `apps/web/docs/API.md` documents only the supported contract.

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
