Run the web app's Vitest suite (one-shot) and report results.

Use `CI=1 pnpm --filter web test` — the exact CI test script (ci.yml runs
`pnpm --filter web test`), with `CI=1` forcing Vitest's run-once mode. Without
it, omp runs bash in a PTY so bare `vitest` would drop into watch and hang.
For a single file: `CI=1 pnpm --filter web test <path/to/file.test.ts>`.

Integration tests that hit Postgres/pgvector need `DATABASE_URL`. CI runs them
against a `pgvector/pgvector:pg15` service. Locally, if `DATABASE_URL` is unset
those tests skip — report skipped DB tests explicitly; a skip is not a pass.

On failure: show the failing test names + assertion diffs, find the root cause,
and fix the behavior (not the assertion).
