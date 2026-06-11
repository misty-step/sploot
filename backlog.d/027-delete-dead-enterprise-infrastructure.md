# Delete dead enterprise infrastructure from apps/web

Priority: P2 · Status: pending · Estimate: S

## Goal

The web app stops carrying ~1,200+ lines of unreachable or test-only
infrastructure that no production code path uses.

## Oracle

- [ ] `apps/web/app/test-shadcn-batch{1..4}/` routes deleted (production
      routes today, importers: none outside generated `.next` types).
- [ ] `lib/metrics-collector.ts` + its test deleted (only importer is its
      own test).
- [ ] `lib/distributed-queue.ts`, `hooks/use-distributed-queue.ts`, and
      their tests deleted (hook has zero importers; queue's only importer is
      the hook).
- [ ] `components/upload-test.tsx` deleted (zero importers).
- [ ] `components/search/search-bar-with-results.tsx` and
      `search-bar-compact.tsx` deleted or wired in (exported from the barrel
      but never imported; delete unless a live use is found).
- [ ] `pnpm --filter web type-check`, lint, and full test suite green;
      `/app` renders and uploads still work (QA harness smoke).

## Notes

2026-06-10 grug-lane audit, importer claims re-verified by grep. Out of
scope (live but debatably overbuilt — do not touch here):
`connection-pool.ts`, `circuit-breaker.ts`, `observability-logger.ts`. If
the connection-pool/priority-queue machinery keeps growing, emit a separate
simplification ticket with profiling evidence first.
