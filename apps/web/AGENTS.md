# Repository Guidelines

## Vibe Check & Voice
Sploot lives in the terminally online brainrot multiverse. Every bit of copy—docs, UI strings, commit subjects, PR blurbs, release notes—should read like a group chat speedrun soaked in meme slang (zoomers/gen alpha energy). Keep facts correct, but deliver them with chaos and emojis instead of beige corpo speak.
Everything stays lowercase unless a brand name demands otherwise. Commit messages, docs, PR blurbs, ui copy—no caps, no apologies.

## Project Structure & Module Organization
Sploot is a Next.js App Router service built with TypeScript.
- `app/` contains routes, layouts, and server actions—co-locate route-only components inside their folder.
- `components/` and `hooks/` expose reusable UI and client utilities; cross-cutting logic lives in `lib/`.
- `prisma/` manages the database schema, migrations, and `seed.ts`; update it whenever storage changes.
- `__tests__/` mirrors runtime modules (`api/`, `integration/`, `utils/`) for Jest coverage.
- `public/` holds static assets, while `scripts/` and `docs/` capture automation and longer-form notes.

## Build, Test, and Development Commands
Prefer `pnpm` to match the lockfile.
- `pnpm dev` boots the Next.js dev server at `localhost:3000` (requires `.env.local`).
- `pnpm build` compiles with Turbopack; run it before cutting a release.
- `pnpm start` serves the production build for smoke testing.
- `pnpm lint` and `pnpm type-check` enforce ESLint rules and TypeScript safety nets.
- `pnpm test`, `pnpm test:watch`, and `pnpm test:coverage` run the Vitest suite.
- `pnpm db:migrate:dev` plus `pnpm db:seed` keep your Prisma schema current locally.

## Coding Style & Naming Conventions
Use two-space indentation and strict TypeScript types. Components, hooks, and React files follow `PascalCase`; utilities stay `camelCase`. Styling is Tailwind-first—compose utility classes and deduplicate them with `clsx` or `tailwind-merge`. Run `pnpm lint` before sending code for review, and commit only clean output. Any user-facing text you touch must stay in meme-speak; if it vibes like corporate onboarding, rewrite it.

## Testing Guidelines
Vitest with `@testing-library/react` powers UI and integration coverage. Create specs alongside the related runtime module using the `*.test.ts` suffix. Mock outbound requests with MSW primitives configured in `vitest.setup.ts`. Check `pnpm test:coverage` to maintain or raise the existing threshold, and refresh fixtures in `__tests__/utils/` when API shapes move.

## Commit & Pull Request Guidelines
- Write imperative, under-72-character commit subjects—but make them terminally-online (`Yeet fallback embeds` > `Update embeddings`).
- Include extra context in bodies when needed, keeping the same meme tone.
- Pull requests should explain motivation, list manual/automated verification, and attach screenshots for UI changes—narrate the whole thing like a Discord recap.
- Reference issues with `#123` syntax.
- Confirm lint, types, and tests succeed before requesting review, and brag about the green checks in the same chaotic vibe.

## Environment & Services
Follow the service setup notes in `SETUP.md` when creating secrets. Store credentials only in `.env.local` (ignored by git). During deploys, run `pnpm db:migrate` to apply Prisma migrations.
