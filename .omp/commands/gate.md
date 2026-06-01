Run the sploot ship gate — CI parity — and report pass/fail per step.

Run these in order, from the repo root, and do not stop at the first failure —
run all four so I see the full picture:

1. `pnpm lint`
2. `pnpm type-check`
3. `CI=1 pnpm --filter web test`  (the exact CI test script; `CI=1` forces
   Vitest run-once so it can't drop into watch mode under omp's interactive PTY)
4. `pnpm --filter extension build`

DB-backed web tests need `DATABASE_URL` pointing at a pgvector-capable Postgres.
If it is unset, say so and label those results "DB path unverified" rather than
treating skips as passes.

Then summarize: a ✅/❌ table of the four steps, and for any ❌ the exact failing
command + the first real error. Do NOT propose lowering a gate to get green —
diagnose env/DB/migration/WXT/auth setup instead. This mirrors the GitHub
`merge-gate` job and the Lefthook pre-commit/pre-push hooks.
