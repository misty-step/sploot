Run all Sploot CI-parity ship-gate commands from the repository root, in order, and report each exit result:

```sh
pnpm lint
pnpm type-check
pnpm lint:design
pnpm test:economics
CI=1 pnpm --filter web test
pnpm --filter web eval:search
pnpm --filter extension lint
pnpm --filter extension test
pnpm --filter extension build
```

DB-backed web paths require `DATABASE_URL` against pgvector Postgres. If that
path was not exercised, report `DB path unverified`; a skipped DB test is not a
pass. CI additionally runs frozen install, Prisma migration, and the required
`merge-gate` aggregate. Keep design, economics, retrieval, and extension gates
intact; report the first real error for every failure.

The persistent local product also has its own real SQLite/inference/browser gate:

```sh
pnpm --filter server test:integration
pnpm --filter server build
pnpm --filter server models:prepare
pnpm --filter server exec playwright install chromium
pnpm --filter server smoke --binary build/sploot
pnpm --filter extension build:e2e
xvfb-run -a pnpm --filter server smoke --extension --binary build/sploot
docker build --tag sploot-local apps/server
```

Host builds require Go, a C compiler, SQLite development headers and FFmpeg/ffprobe.
The browser gauntlet uses newly allocated libraries and actual pinned local CLIP
inference; it never seeds or deletes the ordinary `.sploot-local/library`.
Native extension capture also requires `xdotool`. Model preparation needs network
access only for missing pinned artifacts; a prepared cache can be reused.
Keep this evidence separate from predecessor pgvector, production and device/store
release evidence. See `apps/web/docs/DEPLOYMENT.md` for runtime and recovery.
