---
id: 015-improve-shuffle-and-upload-architecture
title: Improve Shuffle And Upload Architecture
status: ready
lifecycle_stage: Intent
owner: local
acceptance:
  - Seeded shuffle avoids ORDER BY RANDOM scaling cliffs or has measured acceptable bounds.
  - UploadZone is decomposed into focused hooks/modules without behavior loss.
  - Upload validation policy has one source of truth in @sploot/common.
  - Refactor keeps current tests green and adds focused regression coverage for moved behavior.
evidence_required:
  - EXPLAIN or benchmark evidence for shuffle path
  - focused upload component/hook tests
  - import scan proving upload policy centralization
  - full CI parity gate output
refs:
  - apps/web/app/api/assets/route.ts
  - apps/web/components/upload/upload-zone.tsx
  - apps/web/lib/upload/validation-service.ts
  - apps/web/lib/blob.ts
  - packages/common/src/constants.ts
---

# Improve Shuffle And Upload Architecture

Priority: medium
Status: ready
Estimate: L

## Goal

Reduce the two clearest scaling and maintainability risks in core save/search
work: shuffle query cost and upload UI change amplification.

## Non-Goals

- Redesigning the whole data access layer
- Replacing Vercel Blob
- Changing user-visible upload behavior without separate UX acceptance

## Oracle

- [ ] Seeded shuffle has benchmark or `EXPLAIN` evidence and avoids a known
      per-user asset-volume cliff.
- [ ] `UploadZone` no longer mixes queue orchestration, compression/prep,
      retry/recovery, progress throttling, and presentation in one component.
- [ ] Upload size/type policy is consumed from `@sploot/common` by web route,
      hook, and extension paths.
- [ ] `pnpm lint && pnpm type-check && DATABASE_URL=... CI=true pnpm --filter web test && pnpm --filter extension build`
      passes.

## Scope

- `apps/web/app/api/assets/route.ts`
- `apps/web/components/upload/upload-zone.tsx`
- `apps/web/lib/upload/*`
- `apps/web/lib/blob.ts`
- `packages/common/src/constants.ts`

## Why Now

Shuffle is a named product differentiator, but `ORDER BY RANDOM()` is a
predictable scaling cliff. Separately, `UploadZone` is over 1,400 lines and
upload policy is split across deprecated aliases, route status payloads, hooks,
and common constants. Quota and extension work will amplify this unless the
boundaries are tightened.

## Links

- `apps/web/app/api/assets/route.ts`
- `apps/web/components/upload/upload-zone.tsx`
- `apps/web/lib/blob.ts`
- `packages/common/src/constants.ts`
