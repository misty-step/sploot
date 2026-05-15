# Resync API Docs With Runtime Contracts

Priority: medium
Status: done
Estimate: M

## Goal

`apps/web/docs/API.md` matches the actual route responses and shared API types
used by web and extension clients.

## Non-Goals

- Introducing generated OpenAPI unless that is the smallest durable fix
- Rewriting all app documentation
- Changing route behavior without a separate implementation ticket

## Oracle

- [x] `/api/upload` is documented using `SplootApiUploadResponse`, including
      `success`, `asset`, `isDuplicate`, `201`, and duplicate status behavior.
- [x] Upload, upload-url, embedding-status, batch embedding-status, and search
      examples are checked against route code or request-level tests.
- [x] Stale base URLs and embedding dimension examples are fixed or explicitly
      marked as placeholders.
- [x] Run the narrow docs/contract verification chosen for this change plus
      `pnpm lint && pnpm type-check`.

## Scope

- `apps/web/docs/API.md`
- `packages/common/src/types.ts`
- `apps/web/app/api/upload/route.ts`
- `apps/web/app/api/assets/[id]/embedding-status/route.ts`
- `apps/web/app/api/assets/batch/embedding-status/route.ts`
- `apps/web/app/api/search/route.ts`

## Why Now

`/groom` found API docs describing legacy response shapes while
`@sploot/common` and route implementations expose different contracts. This
directly compounds the extension upload bug and slows future client work.

## What Was Built

`apps/web/docs/API.md` now matches the runtime contracts for the ticketed
routes: `POST /api/upload` documents `SplootApiUploadResponse` success,
duplicate, and validation-error shapes; `POST /api/upload-url` documents
`downloadUrl`, `pathname`, `method`, and `headers`; embedding status docs now
cover both single-asset and batch status responses; search docs now describe
the flat result shape, threshold defaults, fallback metadata, and suggestion
response shape.

Checked examples against:

- `packages/common/src/types.ts`
- `apps/web/app/api/upload/route.ts`
- `apps/web/app/api/upload-url/route.ts`
- `apps/web/app/api/assets/[id]/embedding-status/route.ts`
- `apps/web/app/api/assets/batch/embedding-status/route.ts`
- `apps/web/app/api/search/route.ts`
- `apps/web/app/api/search/advanced/route.ts`
- `apps/web/app/api/embeddings/text/route.ts`
- `apps/web/app/api/embeddings/image/route.ts`
- `apps/web/lib/embeddings.ts`

Verified on 2026-05-15:

- `git diff --check`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable pnpm --filter web db:migrate`
- `pnpm lint`
- `pnpm type-check`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable CI=true pnpm --filter web test`
- `pnpm --filter extension build`
