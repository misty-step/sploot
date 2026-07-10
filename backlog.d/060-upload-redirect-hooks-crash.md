# 060 — /app/upload redirect crashes the library page (hooks-order violation)

Status: todo
Created: 2026-07-10

## Goal

Visiting `/app/upload` while authed (server redirect → `/app?upload=1`,
i.e. library page mounting with the upload panel open) throws React's
"Rendered more hooks than during the previous render" and the page
recovers into the empty state instead of the user's pile. Reproduced
identically on master (clean worktree rig, 2026-07-10) — pre-existing,
NOT introduced by the spine convergence. Root-cause and fix the hook-order
violation.

## Acceptance oracle

- Repro first: authed Playwright visit to `/app/upload` (QA rig:
  pgvector + qa:seed + SPLOOT_QA_AUTH_MODE=enabled) captures the console
  error before the fix and zero hooks errors after.
- The library renders the user's assets (not the empty state) when
  arriving via `/app/upload` / `?upload=1`.
- The offending component's hooks are unconditional; no test or gate is
  weakened.

## Notes

- Trigger is the upload-panel-open-on-mount path; plain `/app` is clean.
- Evidence: session 31f4d9fa scratchpad spine-shots/master-shots runs
  (branch and master both error on upload-light/upload-dark walks).
- The `/app/upload` → `/app?upload=1` redirect dates to the original
  subtree import; likely suspects are components mounted only when
  `showUploadPanel` initializes true (UploadZone subtree) calling a hook
  conditionally, or a suspense/remount seam in `AppPageClient`.
