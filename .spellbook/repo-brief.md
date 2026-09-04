# Sploot Repo Brief

## Vision & Purpose

Sploot is a personal meme library for people with saved images scattered across camera rolls, bookmarks, downloads, and chats. The product promise is save, semantic search, and shuffle: find memes with words, not folders, and make the core loop delightful before generation or richer media.

## Stack & Boundaries

Sploot is a pnpm Turborepo monorepo. `apps/web` owns the Next.js 16 app on DigitalOcean, App Router API routes, Clerk auth, Prisma/Neon Postgres with pgvector, Vercel Blob, Replicate embeddings, Sentry diagnostics, and deployed smoke. `apps/extension` owns the WXT/React Chrome extension, popup, background context-menu capture, Clerk extension auth, API upload client, store listing assets, and Chrome Web Store release packet. `packages/common` owns shared upload constants and API types consumed by web and extension.

## Load-Bearing Gate

Ship gate equals CI parity: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with Prisma/pgvector DB-backed paths requiring `DATABASE_URL` against a pgvector-capable Postgres or explicit `DB path unverified` evidence. GitHub CI adds frozen install, `pnpm --filter web db:migrate` against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension lint/test/build, and the `merge-gate` aggregate job.

## Invariants

- Default base branch is `origin/master`.
- Use pnpm 10; do not add npm/yarn flows.
- Use `DATABASE_URL` for Prisma. Do not invent aliases for DB-backed tests or migrations.
- `@sploot/common` is the source of truth for upload limits, MIME validation, and shared API types.
- Work tracking lives in Powder via the registered MCP/API/CLI, not GitHub Issues or repository-local ticket files.
- Closure is a Powder card status update with proof, links, and acceptance-criterion evidence.
- Web deploy and Chrome extension release are separate surfaces with separate evidence.
- The legacy harness has been removed from this repo; do not require legacy harness config or evidence directories. Powder card evidence and the maintained repo rules are the harness.

## Known Debts

- Powder card `sploot-007`: active release blocker. Current worktree extension is loaded in Chrome, but authenticated upload/duplicate QA needs a fresh login and Chrome Web Store dashboard receipt.
- PR #151: stale Prisma serverless connection risk around `apps/web/app/api/health/route.ts`; future DB health changes need runtime proof.
- Embedding scheduler/rate-limit pressure around `apps/web/lib/embeddings.ts`, embedding guard/rate-limit modules, and scheduler routes; cost and duplicate jobs are production risks.
- Release automation depends on `GH_RELEASE_TOKEN` in `.github/workflows/release.yml`; fixes must prove the token path without weakening permissions.
- `apps/web/docs/API.md` is hand-maintained and can drift from route behavior.

## Terminology

Use web app for `apps/web`, extension for `apps/extension`, common package for `packages/common`, semantic search for text-to-image vector search, embedding job for Replicate/pgvector indexing, CI parity for the local command set mirroring GitHub CI, and release checker for `pnpm --filter extension release:check`.

## Session Signal

Recurring corrections: use Computer Use for real Chrome UI including `chrome://extensions`; do not stop at signed-out checks when authenticated production QA is the real oracle; do not call GitHub Issues the tracker; do not claim DB-backed paths without pgvector evidence; do not conflate web deploy with extension release. Validated patterns: pnpm-first commands, Powder card lifecycle, master as base, Sentry/deployed smoke as production inputs, release checker as local Chrome Web Store gate, and explicit blocker reporting when credentials or dashboard access are needed.
