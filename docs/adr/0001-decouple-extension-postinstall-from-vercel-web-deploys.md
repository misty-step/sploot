# ADR 0001: Decouple extension postinstall from Vercel web deploys

- Status: Accepted
- Date: 2025-12-01

## Context

- The monorepo includes a Next.js web app (deployed on Vercel) and a WXT
  browser extension in `apps/extension`.
- `apps/extension/package.json` defined `postinstall: "wxt prepare"`.
- `wxt prepare` loads `wxt.config.ts`, whose `manifest()` throws if
  `VITE_API_BASE_URL` is missing.
- Vercel runs `pnpm install` for the web app and executes workspace
  `postinstall` scripts, but the web project does not define
  `VITE_API_BASE_URL` for the extension.
- Result: production web deploys failed during `pnpm install` inside the
  extension, before the web build even started.

We want:

- The extension’s configuration to stay strict and fail fast for real
  extension builds.
- Web deploys on Vercel to be independent of extension-specific env.

## Decision

We changed the extension’s `postinstall` script to provide a safe default
`VITE_API_BASE_URL` only for the `wxt prepare` phase:

- File: `apps/extension/package.json`
  - Before:
    - `\"postinstall\": \"wxt prepare\"`
  - After:
    - `\"postinstall\": \"VITE_API_BASE_URL=${VITE_API_BASE_URL:-http://localhost:3001} wxt prepare\"`

Key points:

- `wxt.config.ts` remains strict: it still throws if `VITE_API_BASE_URL`
  is missing or invalid.
- For real extension builds (`pnpm build`, `pnpm build:prod`,
  `pnpm dev`), callers must still set `VITE_API_BASE_URL` explicitly.
- During `pnpm install` (including Vercel), `wxt prepare` always receives
  a valid placeholder API base, so the prepare step no longer aborts the
  install.

This keeps the “deep” configuration module strict, while adjusting the
installation interface so it satisfies the config’s preconditions.

## Alternatives considered

1. **Relax checks in `wxt.config.ts`**
   - Option: default `VITE_API_BASE_URL` inside `wxt.config.ts` or only
     warn when missing during certain modes.
   - Rejected because it weakens env validation for real builds and
     hides misconfiguration. The manifest would need to infer context
     (dev vs CI vs prod), increasing complexity and information leakage.

2. **Skip `wxt prepare` on CI / Vercel**
   - Option: wrap `postinstall` with `if [ -z \"$VERCEL\" ]; then wxt prepare; fi`.
   - Rejected because it bakes deployment-platform details into the
     extension and creates special-case behavior. The extension would
     behave differently depending on where it is installed.

3. **Remove `postinstall` entirely**
   - Option: require `wxt prepare` to be run manually.
   - Rejected because it makes local setup more fragile and increases
     cognitive load for contributors.

## Consequences

- Web deploys on Vercel no longer fail due to missing extension env
  variables during `pnpm install`.
- Extension env validation stays strict for actual builds and runtime.
- `wxt prepare` now runs with a placeholder API base when no explicit
  value is provided, but that placeholder is only used during install
  and not for shipping builds.
- The coupling between the Vercel web deploy pipeline and the extension
  configuration is removed with a small, explicit change at the
  extension’s package boundary.

