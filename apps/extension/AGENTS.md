# Extension

Canonical repo instructions are `../../AGENTS.md`.

## Auth and identity

The background owns one long-lived Clerk client for the service-worker lifecycle (`clerkClientPromise` in `entrypoints/background/auth-manager.ts`) and a WebSSO cookie listener. It publishes sanitized auth metadata only; tokens never cross runtime messages. Recreating a Clerk client per call is wrong. Sign-in happens on the web app. URLs live in `shared/app-url.ts`.

`pnpm generate:crx-key` produces a stable extension ID used by Clerk allowed origins. Do not rotate that key as routine distribution hygiene; rotation is an explicit compatibility operation. `pnpm setup:clerk` registers the origin.

Clerk keys must match the target: `pk_test_*` with localhost for development, `pk_live_*` with `https://www.sploot.app` for production (`VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`, `VITE_CLERK_SYNC_HOST`). Production API base is `https://www.sploot.app`.

## Release

WXT writes `dist/` (`dist/chrome-mv3` unpacked). Web deploy and this Chrome Web Store packet are separate. `pnpm release:check` (or `release:structural`) plus `STORE_LISTING.md` and `store-assets/` are the local packet; hosted `merge-gate` is still required for repository ship. Shared upload, MIME, and API types come from `@sploot/common`.
