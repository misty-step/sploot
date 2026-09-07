Validate the Chrome Web Store packet for `apps/extension`:

```sh
pnpm --filter extension release:check
```

The checker covers `STORE_LISTING.md` and `store-assets/`. For a submission,
build with WXT (`pnpm --filter extension build:prod` or
`build:prod:unpacked`), then `zip:prod`. Match Clerk environment values:
`pk_test_*` + localhost for dev, `pk_live_*` + `https://www.sploot.app` for
production, using `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`, and
`VITE_CLERK_SYNC_HOST`. Report packet gaps and remediation. This release is
separate from the DigitalOcean web deploy.
