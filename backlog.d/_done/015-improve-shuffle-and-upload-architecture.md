---
id: 015-improve-shuffle-and-upload-architecture
title: Improve Shuffle And Upload Architecture
status: done
lifecycle_stage: Feedback
owner: local
acceptance:
- Seeded shuffle avoids ORDER BY RANDOM scaling cliffs or has measured acceptable
  bounds.
- UploadZone is decomposed into focused hooks/modules without behavior loss.
- Upload validation policy has one source of truth in @sploot/common.
- Refactor keeps current tests green and adds focused regression coverage for moved
  behavior.
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
Status: done
Estimate: L

## Goal

Reduce the two clearest scaling and maintainability risks in core save/search
work: shuffle query cost and upload UI change amplification.

## Non-Goals

- Redesigning the whole data access layer
- Replacing Vercel Blob
- Changing user-visible upload behavior without separate UX acceptance

## Oracle

- [x] Seeded shuffle has benchmark or `EXPLAIN` evidence and avoids a known
      per-user asset-volume cliff.
- [x] `UploadZone` no longer mixes queue orchestration, compression/prep,
      retry/recovery, progress throttling, and presentation in one component.
- [x] Upload size/type policy is consumed from `@sploot/common` by web route,
      hook, and extension paths.
- [x] `pnpm lint && pnpm type-check && DATABASE_URL=... CI=true pnpm --filter web test && pnpm --filter extension build`
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

## What Was Built

- Centralized upload validation policy in `@sploot/common`, including upload
  size/type helpers and shared upload constants consumed by web routes, web
  hooks/components, upload services, and extension upload paths.
- Replaced `/api/assets` shuffle sorting with seeded ring order over a stable
  `shuffle_key`, backed by the `assets_owner_live_shuffle_key_id_idx` and
  favorite-aware shuffle indexes.
- Added migration `20260518_add_asset_shuffle_key` to backfill stable shuffle
  keys and keep new assets indexed for seek-based shuffle pagination.
- Documented the seeded shuffle query shape and captured local pgvector
  `EXPLAIN` evidence showing an index scan with `Execution Time: 0.111 ms` for
  a 10,000-asset user fixture.
- Extracted upload progress presentation into `UploadBatchProgressCard` and
  pure progress summary helpers with focused component/unit coverage.
- Centralized client upload HTTP transport in `UploadNetworkClient`, including
  XMLHttpRequest progress handling, structured upload errors, timeout handling,
  duplicate handling, and retryability semantics.
- Extracted upload progress throttling into a tested helper so progress events
  no longer force every percentage tick through component-local logic.
- Fixed the upload metadata batching merge so repeat selections add their own
  file rows by id instead of slicing against the global upload row count.

## Evidence

- `git diff --check HEAD~4..HEAD` passed on 2026-05-18.
- Shuffle evidence captured in `apps/web/docs/shuffle-query-evidence.md`:
  seeded ring query uses `assets_owner_live_shuffle_key_id_idx`, avoids
  `ORDER BY RANDOM()`, and stops after the requested page limit.
- Import scan confirmed upload policy consumers route through
  `@sploot/common` for `UPLOAD`, `isValidMimeType`, `isValidFileSize`, and
  `prepareImageForUpload` across web and extension upload paths.
- Focused regression coverage added for upload validation, upload progress
  summary/card extraction, upload network transport, upload progress throttling,
  and seeded shuffle API behavior.
- Final gate passed on 2026-05-18:
  `DATABASE_URL='postgresql://test:test@localhost:5432/sploot_test?sslmode=disable' pnpm --filter web db:migrate`,
  `pnpm lint`,
  `pnpm type-check`,
  `DATABASE_URL='postgresql://test:test@localhost:5432/sploot_test?sslmode=disable' CI=true pnpm --filter web test`,
  and `pnpm --filter extension build`.
- Gradient validation passed on 2026-05-18:
  `gradient validate`.
