---
id: 014-fix-core-library-ux-contract-gaps
title: Fix Core Library UX Contract Gaps
status: done
lifecycle_stage: Feedback
owner: local
acceptance:
  - Duplicate/upload "view existing" actions navigate to a real asset detail route.
  - Command palette sign-out uses the actual Clerk sign-out flow.
  - View-density commands are wired to grid state or removed.
  - Asset sort options are shared with the API and unsupported sorts fail visibly.
evidence_required:
  - focused component/hook tests
  - manual browser smoke notes
  - API route tests for sort contract
refs:
  - apps/web/components/upload/upload-error-display.tsx
  - apps/web/components/chrome/command-palette.tsx
  - apps/web/app/app/page.tsx
  - apps/web/hooks/use-assets.ts
  - apps/web/app/api/assets/route.ts
---

# Fix Core Library UX Contract Gaps

Priority: medium
Status: done
Estimate: M

## Goal

Core library controls do what they advertise, and broken recovery paths are
removed before more polish is layered on top.

## Non-Goals

- Full redesign of the library page
- New tagging or organization model
- Replacing the command palette

## Oracle

- [x] Upload duplicate/error actions route to `/app/meme/:id` or another real
      asset target.
- [x] Command palette sign-out invalidates the Clerk session and returns the
      user to a signed-out state.
- [x] Density commands change the image grid density or are removed from the
      palette.
- [x] UI sort options and `/api/assets` accepted sort values come from one
      shared contract, with tests for unsupported values.

## Scope

- `apps/web/components/upload/upload-error-display.tsx`
- `apps/web/components/upload/upload-file-list.tsx`
- `apps/web/components/upload/file-list-virtual.tsx`
- `apps/web/components/chrome/command-palette.tsx`
- `apps/web/hooks/use-assets.ts`
- `apps/web/app/api/assets/route.ts`

## What Was Built

- Added a shared `ASSET_SORT` contract in `@sploot/common` for
  `createdAt`, `updatedAt`, `size`, `pathname`, and `shuffle`, and wired the
  sort dropdown, sort preference hook, asset hook, API route, and API docs to
  that contract.
- Changed `/api/assets` to reject unsupported `sortBy` values with a visible
  `400` instead of silently coercing them to `createdAt`.
- Migrated legacy stored sort preferences (`recent`, `date`, `name`) to the
  canonical API values and discarded invalid stored sort values.
- Routed all duplicate upload "view" actions to `/app/meme/:id` with encoded
  asset ids across `UploadErrorDisplay`, `UploadFileList`, and
  `FileListVirtual`.
- Removed unwired command-palette density commands and removed the
  `/api/auth/signout` fallback; the app page now passes Clerk `signOut()` into
  the palette and returns to `/`.
- Surfaced non-search library load errors in the library header instead of
  failing quietly.

## Evidence

- `pnpm --filter web exec vitest run __tests__/middleware.test.ts __tests__/components/upload/upload-error-display.test.tsx __tests__/components/chrome/command-palette.test.tsx __tests__/hooks/use-sort-preferences.test.ts __tests__/api/assets.test.ts` passed on 2026-05-18: 5 files, 62 tests.
- `pnpm lint && pnpm type-check` passed on 2026-05-18.
- Full gate for this patch passed: `DATABASE_URL='postgresql://test:test@localhost:5432/sploot_test?sslmode=disable' CI=true pnpm --filter web test` (58 files, 857 tests) and `pnpm --filter extension build`.
- Runtime scan passed: no remaining `app?highlight=`, `/api/auth/signout`, `View Density`, or `sortBy === 'name'` references in `apps/web` or `packages/common`.
- Local browser smoke on 2026-05-18 reached signed-out `/app` and found a
  middleware redirect blocker, fixed separately in commit `c951dd4`; after the
  fix, `http://localhost:3001/app` rendered `http://localhost:3001/sign-in`
  instead of the Next runtime overlay.
- Authenticated browser smoke for the protected library controls was not
  completed in this pass: the in-app browser had no signed-in Clerk session,
  local dev sign-up did not complete in keyless Clerk mode, and the Chrome
  backend was unavailable even though Chrome was running and the Codex Chrome
  Extension was installed/enabled. The protected flows are covered by focused
  component/API tests above; deployed authenticated smoke remains tracked by
  backlog 012.

## Why Now

The core app advertises controls that are no-ops or lead to dead routes:
duplicate upload view actions push a `highlight` param that the app does not
read, command-palette sign-out targets a non-Clerk route, density commands lack
a handler, and some UI sort options are silently coerced by the API.

## Links

- `apps/web/components/upload/upload-error-display.tsx`
- `apps/web/components/chrome/command-palette.tsx`
- `apps/web/hooks/use-assets.ts`
- `apps/web/app/api/assets/route.ts`
