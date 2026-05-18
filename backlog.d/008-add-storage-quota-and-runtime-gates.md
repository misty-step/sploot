---
id: 008-add-storage-quota-and-runtime-gates
title: Add Storage Quota And Runtime Gates
status: ready
lifecycle_stage: Intent
owner: local
acceptance:
  - Uploads are checked against a first-class per-user storage quota before Blob writes.
  - Operators can disable uploads and embeddings with documented runtime gates.
  - Web and extension clients receive typed quota/gate errors with user-safe actions.
  - Settings or status UI shows current storage usage and limit.
evidence_required:
  - Prisma migration and quota policy tests
  - upload route tests for under-limit, over-limit, and gate-disabled paths
  - extension/web error handling tests
  - API docs update
refs:
  - apps/web/prisma/schema.prisma
  - apps/web/app/api/upload/route.ts
  - apps/web/app/api/stats/route.ts
  - apps/web/lib/upload-errors.ts
  - packages/common/src/types.ts
---

# Add Storage Quota And Runtime Gates

Priority: high
Status: ready
Estimate: L

## Goal

Sploot has a deterministic storage safety rail: per-user quota enforcement plus
runtime kill switches for upload and embedding cost exposure.

## Non-Goals

- Full Stripe billing launch
- Retroactive billing for existing users
- Deleting existing over-quota assets automatically

## Oracle

- [ ] A `QuotaPolicy` or equivalent deep module computes used bytes, limit
      bytes, remaining bytes, and enforcement decision.
- [ ] `POST /api/upload` refuses over-quota requests before Blob upload with a
      typed response such as `code: "quota_exceeded"`.
- [ ] Upload and embedding routes return a consistent 503 gate response when a
      runtime gate is disabled.
- [ ] Web and extension clients render a real remediation path instead of a
      dead `/app/settings?tab=billing` target.
- [ ] `pnpm lint && pnpm type-check && DATABASE_URL=... CI=true pnpm --filter web test && pnpm --filter extension build`
      passes against pgvector.

## Scope

- `apps/web/prisma`
- `apps/web/app/api/upload/route.ts`
- `apps/web/app/api/stats/route.ts`
- `apps/web/lib/upload-errors.ts`
- `apps/extension/shared/api-client.ts`
- `packages/common/src/types.ts`
- `apps/web/docs/API.md`

## Why Now

The product cannot safely support unlimited storage. Current UI already has
quota concepts (`quota_exceeded`, upgrade action, storage status), but there is
no schema, policy module, pre-upload enforcement, or operator kill switch.

## Links

- `apps/web/prisma/schema.prisma`
- `apps/web/app/api/upload/route.ts`
- `apps/web/app/api/stats/route.ts`
- `apps/web/components/upload/upload-error-display.tsx`
- `apps/web/lib/upload-errors.ts`
