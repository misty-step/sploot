# Repository Guidelines

## Project Structure & Module Organization
- `entrypoints/` hosts WXT entry files; keep background-only logic in `background/` and popup UI in `popup/` so layers stay decoupled.
- `components/` holds shared React pieces (currently sparse); prefer co-locating CSS-in-TS with the component and exporting a single entry point.
- `shared/` is for deep utilities like `api-client.ts`; surface minimal functions and keep constants in sync with the main app per `ARCHITECTURE.md`.
- `public/` stores icons, `scripts/` automates Clerk + CRX tasks, and `dist/` is generated—never edit artifacts directly.

## Build, Test, and Development Commands
- `pnpm dev` → WXT dev server with hot reload; `pnpm dev:firefox` targets Firefox preview.
- `pnpm build` (dev bits) and `pnpm build:prod` (ship bits) emit `dist/chrome-mv3`; always run before creating zips.
- `pnpm zip` or `pnpm zip:firefox` packages the latest build for store upload.
- `pnpm generate:crx-key` keeps a stable extension ID; `pnpm setup:clerk` syncs allowed origins so manual dashboard edits stay unnecessary.

## Coding Style & Naming Conventions
- TypeScript strict mode enforced via `tsconfig.json`; keep 2-space indentation and trailing commas per existing files.
- Components use PascalCase filenames, hooks and helpers use camelCase, directories remain kebab-case.
- Favor deep modules: expose intention (`uploadImage`) and hide FormData, Clerk tokens, and retry rules; avoid `utils` junk drawers.
- Console logs should include `[Background]` or `[Popup]` prefixes for grep-friendly tracing.

## Testing Guidelines
- Follow `TESTING.md` scenario list before release; log pass/fail in PR notes.
- Smoke test popup via `pnpm dev` + Chrome load, then use `test-cookies.js` / `test-clerk-manually.js` for edge auth cases when needed.
- When touching upload flow, cover large-image, offline, and duplicate cases outlined in the guide; note any skipped scenario as debt.

## Commit & Pull Request Guidelines
- Use Conventional Commits (`feat:`, `fix:`, `docs:`) as seen in git history; keep subject under 72 chars.
- PR description must state problem, approach, and testing evidence (screenshots/GIF for popup, console log snippets for background).
- Link Clerk or product issues when relevant, and call out any shared-constant drift so the main app can be updated in lockstep.

## Security & Configuration Tips
- Never commit `.env`, `.crx-key.pem`, or Clerk keys; reference `.env.example` for required vars.
- Store generated keys locally and rotate when sharing builds outside the core team.
- Validate that `scripts/configure-clerk.sh` succeeds before publishing—missing origins will break uploads for everyone.
- Clerk/WebSSO still requires the extension origin to be allowed in Clerk, but
  user sign-in happens on the Sploot web app. Web app URLs are centralized in
  `shared/app-url.ts`; do not hardcode sign-in or library targets elsewhere.
- API base is explicit: set `VITE_API_BASE_URL` for every build (prod: `https://sploot.app`; local dev: `http://localhost:3001` or your Next port). Builds now fail if it’s missing. WXT dev server runs on 3303 to avoid port clash with Next.
