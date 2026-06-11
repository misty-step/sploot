# Delete dead enterprise infrastructure from apps/web

Priority: P2 · Status: done · Estimate: S

## Goal

The web app stops carrying ~1,200+ lines of unreachable or test-only
infrastructure that no production code path uses.

## Oracle

- [x] `apps/web/app/test-shadcn-batch{1..4}/` routes deleted (production
      routes today, importers: none outside generated `.next` types).
- [x] `lib/metrics-collector.ts` + its test deleted (only importer is its
      own test).
- [x] `lib/distributed-queue.ts`, `hooks/use-distributed-queue.ts`, and
      their tests deleted (hook has zero importers; queue's only importer is
      the hook).
- [x] `components/upload-test.tsx` deleted (zero importers).
- [x] `components/search/search-bar-with-results.tsx` and
      `search-bar-compact.tsx` deleted or wired in (exported from the barrel
      but never imported; delete unless a live use is found).
- [x] `pnpm --filter web type-check`, lint, and full test suite green;
      `/app` renders and uploads still work (QA harness smoke).

## Notes

2026-06-10 grug-lane audit, importer claims re-verified by grep. Out of
scope (live but debatably overbuilt — do not touch here):
`connection-pool.ts`, `circuit-breaker.ts`, `observability-logger.ts`. If
the connection-pool/priority-queue machinery keeps growing, emit a separate
simplification ticket with profiling evidence first.

## What Was Built

- Deleted the four `test-shadcn-batch` App Router pages so they are no longer
  production routes.
- Deleted the unused metrics collector, distributed queue, upload-test
  component, and unused search variants; trimmed the search barrel to only
  export live components.
- Re-verified the deletion claims with repo search:
  `rg -n "test-shadcn-batch|metrics-collector|distributed-queue|use-distributed-queue|upload-test|search-bar-with-results|search-bar-compact" apps packages -g '!**/.next/**'`
  returned no matches, and the matching file/path `find` returned no paths.

## Verification

- `pnpm --filter web lint`
- `pnpm --filter web type-check`
- `pnpm --filter web test` (80 files, 973 tests)
- `pnpm qa:evidence --slug dead-web-infra --intent 'dead web-only infrastructure is deleted while /app still renders the upload/library surface' --routes /app --tests __tests__/components/upload/upload-drop-zone.test.tsx --risk 'smoke renders the upload/library surface but does not execute a blob upload; upload behavior remains covered by the existing upload tests'`
- Evidence packet:
  `docs/qa/evidence/2026-06-11-dead-web-infra/packet.md`

Backlog: `backlog.d/027-delete-dead-enterprise-infrastructure.md`
Ships-backlog: `backlog.d/027-delete-dead-enterprise-infrastructure.md`
