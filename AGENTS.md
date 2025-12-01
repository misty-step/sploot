# Repository Guidelines

## Project Structure & Modules
- Monorepo via Turborepo + pnpm workspaces: apps/web (Next.js 15), apps/extension (WXT + React), packages/common (shared constants/types).
- App-specific guides: `apps/web/AGENTS.md` (meme-tone UI rules) and `apps/extension/AGENTS.md` (WXT/Clerk tips) take precedence inside each app.
- Tests live beside code (`__tests__` in web, none yet in extension). Shared code in `packages/common/src`.

## Build, Test, and Dev Commands
- Install: `pnpm install`
- Dev servers: `pnpm dev:web` (Next), `pnpm dev:extension` (WXT), or `pnpm dev` for both.
- Quality: `pnpm lint`, `pnpm type-check`
- Build: `pnpm build` (all), `pnpm --filter web build`, `pnpm --filter extension build:prod`
- Tests (web): `pnpm --filter web test`, coverage with `pnpm --filter web test:coverage`
- Hooks installed automatically via `pnpm install` (lefthook).

## Coding Style & Naming
- TypeScript everywhere; two-space indent; trailing commas OK.
- Web: Tailwind-first styling; React components/hook files use PascalCase; utilities camelCase; keep UI copy in meme-speak as per app guide.
- Extension: PascalCase components, camelCase helpers; prefix logs with `[Background]` or `[Popup]`.
- Avoid shallow “utils”/“helpers”; prefer deep modules with small surfaces.

## Testing Guidelines
- Web uses Vitest + @testing-library/react (`apps/web/vitest.config.ts`). Current thresholds low—raise when adding tests.
- Name specs `*.test.ts(x)` near source or in `__tests__/`.
- Run targeted: `pnpm --filter web vitest run path/to/file.test.ts`.
- No formal tests for extension yet; smoke via `pnpm dev` + manual flows.

## Commit & PR Guidelines
- Root history mixes conventional commits (`feat:`, `fix:`) and imperative phrases; keep subjects ≤72 chars.
- PRs: state problem, approach, testing evidence; include screenshots/GIFs for UI or popup changes; link issues/Backlog items.
- Keep diffs small (50–200 lines) and ensure lint + type-check green before request.

## Security & Config Tips
- Never commit secrets; required env vars listed in TASK.md and CLAUDE.md. Web needs `DATABASE_URL`, Clerk keys, Vercel Blob, Sentry; extension uses `VITE_CLERK_PUBLISHABLE_KEY` and API base URL.
- For Prisma, use `DATABASE_URL` name only (see CLAUDE.md rationale).
- Extension store builds come from `apps/extension/.output/` produced by `pnpm --filter extension build:prod`.

## Architecture Snapshot
- Next.js app router with Prisma (Neon + pgvector), Clerk auth, Vercel Blob; WXT extension reuses `@sploot/common` via Vite alias.
- Turbo pipeline caches builds; lint/type-check depend on upstream builds as configured in `turbo.json`.
