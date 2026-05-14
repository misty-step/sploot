# Resync API Docs With Runtime Contracts

Priority: medium
Status: ready
Estimate: M

## Goal

`apps/web/docs/API.md` matches the actual route responses and shared API types
used by web and extension clients.

## Non-Goals

- Introducing generated OpenAPI unless that is the smallest durable fix
- Rewriting all app documentation
- Changing route behavior without a separate implementation ticket

## Oracle

- [ ] `/api/upload` is documented using `SplootApiUploadResponse`, including
      `success`, `asset`, `isDuplicate`, `201`, and duplicate status behavior.
- [ ] Upload, upload-url, embedding-status, batch embedding-status, and search
      examples are checked against route code or request-level tests.
- [ ] Stale base URLs and embedding dimension examples are fixed or explicitly
      marked as placeholders.
- [ ] Run the narrow docs/contract verification chosen for this change plus
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
