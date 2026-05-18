---
id: 014-fix-core-library-ux-contract-gaps
title: Fix Core Library UX Contract Gaps
status: ready
lifecycle_stage: Intent
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
Status: ready
Estimate: M

## Goal

Core library controls do what they advertise, and broken recovery paths are
removed before more polish is layered on top.

## Non-Goals

- Full redesign of the library page
- New tagging or organization model
- Replacing the command palette

## Oracle

- [ ] Upload duplicate/error actions route to `/app/meme/:id` or another real
      asset target.
- [ ] Command palette sign-out invalidates the Clerk session and returns the
      user to a signed-out state.
- [ ] Density commands change the image grid density or are removed from the
      palette.
- [ ] UI sort options and `/api/assets` accepted sort values come from one
      shared contract, with tests for unsupported values.

## Scope

- `apps/web/components/upload/upload-error-display.tsx`
- `apps/web/components/upload/upload-file-list.tsx`
- `apps/web/components/upload/file-list-virtual.tsx`
- `apps/web/components/chrome/command-palette.tsx`
- `apps/web/hooks/use-assets.ts`
- `apps/web/app/api/assets/route.ts`
- `packages/common/src/types.ts` if a shared sort type is introduced

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
