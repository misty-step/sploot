Validate the Chrome extension release packet for apps/extension.

Run `pnpm --filter extension release:check` (runs
`scripts/validate-store-release.mjs`). It checks the store listing + assets are
release-ready.

Related surfaces to verify when prepping a Web Store submission:
- `apps/extension/STORE_LISTING.md` — listing copy/metadata
- `apps/extension/store-assets/` — screenshots/icons/promo art
- Production build: `pnpm --filter extension build:prod` (or
  `build:prod:unpacked` to include the CRX key), then `zip:prod`
- Env must use the matching Clerk key: `pk_live_*` + `https://www.sploot.app`
  for prod, `pk_test_*` + localhost for dev (`VITE_CLERK_PUBLISHABLE_KEY`,
  `VITE_API_BASE_URL`, `VITE_CLERK_SYNC_HOST`).

Remember: the extension release is a separate surface from the DigitalOcean web
deploy. Report what passed, what's missing, and the exact remediation.
