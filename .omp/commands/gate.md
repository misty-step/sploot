Run the sploot ship gate — CI parity — and report pass/fail per step.

Run these in order, from the repo root, and do not stop at the first failure —
run all four so I see the full picture:

1. `pnpm lint`              (Turbo → web + extension + common)
2. `pnpm type-check`        (Turbo → web + extension + common)
3. `CI=1 pnpm --filter web test`  (the exact CI test script; `CI=1` forces
   Vitest run-once so it can't drop into watch mode under omp's interactive PTY)
4. `pnpm --filter extension build`

This is the local ship gate AGENTS.md defines. DB-backed web tests need
`DATABASE_URL` pointing at a pgvector-capable Postgres. If it is unset, say so
and label those results "DB path unverified" rather than treating skips as passes.

Then summarize: a ✅/❌ table of the four steps, and for any ❌ the exact failing
command + the first real error. Do NOT propose lowering a gate to get green —
diagnose env/DB/migration/WXT/auth setup instead. GitHub CI adds checks on top
of these four — a frozen-lockfile install, `pnpm --filter web db:migrate`,
extension lint/test, and the `merge-gate` aggregate job — so a green local gate
is necessary but not a 100% guarantee CI is green.
