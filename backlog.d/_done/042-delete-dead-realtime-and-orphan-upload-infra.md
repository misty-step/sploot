# Delete dead realtime and orphan-upload infrastructure

Priority: P2 · Status: done · Estimate: S

## Goal

Remove ~2,150 LOC of zero-importer infrastructure so the maintenance surface
matches what the app actually runs.

## Oracle

- [x] After a `tsc`/knip confirmation of zero live importers, these modules and
      their dead chains are removed:
      - `lib/websocket-manager.ts` + `hooks/use-websocket.ts`
      - `lib/pg-notify-listener.ts` + its test + `scripts/test-pg-notify.ts`
      - `lib/upload/upload-queue-service.ts` + its test (orphan parallel to the
        live `lib/upload-queue.ts`)
- [x] `lib/connection-pool.ts` + `hooks/use-embedding-status-manager.ts`
      were not deleted because live importers proved the card premise wrong
      for that piece.
- [x] Repo gate green after removal; no behavior change expected because only
      zero-importer files were removed.

## Notes

All confirmed zero-importer via recursive grep (groom 2026-06-21 "architecture").
LISTEN/NOTIFY is incompatible with the PgBouncer setup and was never wired; the
WebSocket / connection-pool chains have no renderers. **Confirm with the user that
streaming embedding-status was abandoned (not deferred) before deleting.** Verify
with `tsc`/knip, not just grep. Pure subtraction — sibling in spirit to the shipped
027 (delete dead enterprise infra).

## What Was Built

- Deleted `apps/web/lib/websocket-manager.ts` and
  `apps/web/hooks/use-websocket.ts`. Importer proof:
  `rg -n "websocket-manager|WebSocketManager|createWebSocketManager|getWebSocketManager|use-websocket|useWebSocket" apps/web packages apps/extension`
  returned only those two files before deletion and no code matches after
  deletion.
- Deleted `apps/web/lib/pg-notify-listener.ts`,
  `apps/web/__tests__/lib/pg-notify-listener.test.ts`, and
  `apps/web/scripts/test-pg-notify.ts`. Importer proof:
  `rg -n "pg-notify-listener|PgNotify|PGNotify|listenFor|test-pg-notify|NOTIFY|LISTEN" apps/web packages apps/extension`
  found the listener, its own test/script, and the historical Prisma migration
  comment; no runtime importer referenced the listener.
- Deleted `apps/web/lib/upload/upload-queue-service.ts` and
  `apps/web/__tests__/lib/upload/upload-queue-service.test.ts`. Importer proof:
  `rg -n "upload-queue-service|UploadQueueService|uploadQueueService|UploadQueueJob|createUploadQueueService" apps/web packages apps/extension`
  found only the orphan service and its own test before deletion and no code
  matches after deletion. The live `apps/web/lib/upload-queue.ts` path was not
  touched.
- Left `apps/web/lib/connection-pool.ts` and
  `apps/web/hooks/use-embedding-status-manager.ts` in place. Live-importer
  proof: `apps/web/app/layout.tsx` imports and renders
  `EmbeddingStatusProvider`; `apps/web/components/upload/embedding-status-indicator.tsx`
  imports `useEmbeddingStatusSubscription`; `apps/web/contexts/embedding-status-context.tsx`
  imports `getEmbeddingStatusManager`; and
  `apps/web/hooks/use-embedding-status-manager.ts` imports `pooledFetch`.

## Verification

- `pnpm --filter web type-check` after each deletion subsystem.
- `pnpm dlx knip --workspace web --production --files --reporter compact --no-exit-code --max-show-issues 200`
  after deletion no longer reports the deleted files.
- `pnpm lint`
- `pnpm type-check`
- `pnpm --filter web test`
- `pnpm --filter extension build`
- `pnpm build`
- `pnpm test`

Backlog: `backlog.d/042-delete-dead-realtime-and-orphan-upload-infra.md`
Ships-backlog: `backlog.d/042-delete-dead-realtime-and-orphan-upload-infra.md`
PR: `#252`
