# web agent context

read, in order:

1. `../../AGENTS.md` for repository commands, boundaries, and the CI-parity gate;
2. `AGENTS.md` for web-specific voice and code conventions;
3. `../../VISION.md` for product direction;
4. `docs/adr/010-digitalocean-runtime-controls.md` before changing hosting,
   caching, embedding limits, or provider boundaries.

current runtime facts:

- DigitalOcean App Platform runs the long-lived Next.js web service;
- Neon Postgres + pgvector is the durable database and limiter store;
- Vercel Blob is the only intentional Vercel data-plane dependency;
- Clerk supplies identity, Replicate supplies embeddings, and Canary receives
  agent-facing diagnostics;
- browser events use the authenticated first-party `/api/telemetry` route and
  structured application logs.

run the gate from the repo root:

```bash
pnpm lint && pnpm type-check && pnpm lint:design && \
  pnpm --filter web test && pnpm --filter extension build
```

database-backed tests require `DATABASE_URL` pointing to pgvector-capable
Postgres with `pnpm --filter web db:migrate` applied first.
