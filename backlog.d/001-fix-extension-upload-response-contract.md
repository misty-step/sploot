# Fix Extension Upload Response Contract

Priority: high
Status: ready
Estimate: S

## Goal

Extension uploads return a populated asset id and blob URL after a successful
`/api/upload` response.

## Non-Goals

- Redesigning the upload pipeline
- Changing Vercel Blob storage behavior
- Adding a second upload response shape for compatibility

## Oracle

- [ ] A contract test exercises the extension upload client against the actual
      `SplootApiUploadResponse` shape.
- [ ] A successful response shaped as `{ success: true, asset: { id, blobUrl,
      pathname, ... } }` produces `UploadResult.assetId` and
      `UploadResult.blobUrl`.
- [ ] `apps/web/docs/API.md` examples match `packages/common/src/types.ts`.
- [ ] `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`
      passes, or any narrower verified command is justified in the delivery note.

## Scope

- `apps/extension/shared/api-client.ts`
- `apps/web/app/api/upload/route.ts`
- `packages/common/src/types.ts`
- `apps/web/docs/API.md`

## Why Now

`/groom` found a user-facing contract mismatch: the extension currently reads
`data.id || data.assetId`, while `/api/upload` returns the id under
`data.asset.id`. That can make capture/upload appear successful at HTTP level
while handing callers an undefined asset id.

## Notes

This item was first discovered during the 2026-05-14 `/groom` correction that
moved Sploot back to `backlog.d` as the source of truth.
