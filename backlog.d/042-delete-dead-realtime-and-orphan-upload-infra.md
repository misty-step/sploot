# Delete dead realtime and orphan-upload infrastructure

Priority: P2 · Status: ready · Estimate: S

## Goal

Remove ~2,150 LOC of zero-importer infrastructure so the maintenance surface
matches what the app actually runs.

## Oracle

- [ ] After a `tsc`/knip confirmation of zero live importers, these modules and
      their dead chains are removed:
      - `lib/websocket-manager.ts` + `hooks/use-websocket.ts`
      - `lib/pg-notify-listener.ts` + its test + `scripts/test-pg-notify.ts`
      - `lib/connection-pool.ts` + `hooks/use-embedding-status-manager.ts`
      - `lib/upload/upload-queue-service.ts` + its test (orphan parallel to the
        live `lib/upload-queue.ts`)
- [ ] `pnpm build && pnpm test` green after removal; no behavior change.

## Notes

All confirmed zero-importer via recursive grep (groom 2026-06-21 "architecture").
LISTEN/NOTIFY is incompatible with the PgBouncer setup and was never wired; the
WebSocket / connection-pool chains have no renderers. **Confirm with the user that
streaming embedding-status was abandoned (not deferred) before deleting.** Verify
with `tsc`/knip, not just grep. Pure subtraction — sibling in spirit to the shipped
027 (delete dead enterprise infra).
