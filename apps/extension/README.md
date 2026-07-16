# Sploot Browser Extension 🧩

> **Right-click to save memes from anywhere.**

A Chrome Extension built with WXT and React that integrates seamlessly with the Sploot library.

## ✨ Key Features

- **Context Menu**: Right-click any image → "Save to Sploot".
- **Durable Save Recovery**: Context-menu saves survive worker restarts with bounded backoff and retry attempts. A terminal failure stays in the popup until you explicitly retry or discard it.
- **Popup UI**: View status, open web sign-in, sign out.
- **Auth**: Seamless Clerk integration sharing session with web app.
- **Tech**: WXT (Vite-based), React 19, TypeScript.

## 🚀 Getting Started

### 1. Environment Setup

Create `.env` (dev) or `.env.production` (prod):

```env
# Must match the Web App's keys
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CLERK_SYNC_HOST=http://localhost:3001
CLERK_SECRET_KEY=sk_test_...
VITE_API_BASE_URL=http://localhost:3001 # or https://sploot.app
```

The web app must trust this extension ID too. After `pnpm generate:crx-key`,
add `chrome-extension://<generated-extension-id>` to the web app's
`CLERK_AUTHORIZED_PARTIES` along with the target API origin.

### 2. Development

```bash
pnpm dev
```
This will open a Chrome instance with the extension pre-loaded and hot-reload enabled.

### 3. Building for Production

```bash
pnpm build:prod
```

Output is generated in `dist/chrome-mv3`.

For production-like unpacked QA with a stable extension ID:

```bash
VITE_API_BASE_URL=https://sploot.app \
VITE_CLERK_SYNC_HOST=https://clerk.sploot.app \
pnpm build:prod:unpacked
```

### 4. Installation (Manual)

1. Go to `chrome://extensions`.
2. Enable **Developer Mode**.
3. Click **Load Unpacked**.
4. Select `apps/extension/dist/chrome-mv3`.

### CI-only MV3 acceptance

CI builds a separate unpacked `dist/chrome-mv3` with
`VITE_E2E_AUTH_MODE=true`, then loads that directory in a persistent real
Chromium context. The harness resolves the generated extension ID, talks to
the real service worker through `chrome.runtime`, persists real
`chrome.storage` and alarm queue state, closes and restarts the worker, and
exercises the actual popup queue listing/actions, image fetch, capture, retry,
duplicate response, owner switch, and abort paths. The popup layout oracle
runs the same real artifact at both 280px and 240px.

Durable saves are owned by the STABLE Clerk account identity
(`userId`/`accountId`); the recorded session id is credential provenance only.
Ordinary sign-out/re-auth (same account, new session) adopts and resumes
retained work, while a different account can never list, retry, discard, or
upload another owner's jobs. Global queue capacity (50 jobs / 8 MB of retained
source bytes) stays hard, but is recoverable: terminal (failed/paused) saves
expire after a bounded retention window, and admission deterministically
reclaims non-active jobs owned by other accounts — oldest terminal first,
never anything actively processing, and without surfacing or uploading the
evicted jobs. The lifecycle harness proves the same-account/new-session
adoption and the foreign-owner wedge recovery against the real worker.

Native Chrome context-menu UI cannot be clicked by Playwright in the CI
browser seam, so the E2E-only message invokes the same production
`handleImageSave` path that the registered `chrome.contextMenus.onClicked`
listener uses; it is not present in production builds. `wxt.config.ts` rejects
the E2E authority mode for both production and manifest-check builds. Real
Clerk device authentication and live Web Store/provider evidence remain
operator-only and keep the release gate red until supplied.

## 🛒 Publishing to the Chrome Web Store

The extension is **not submitted or published** in the Chrome Web Store. The
production build in `dist/` is a local/release candidate artifact only; no live
listing URL or publication receipt exists yet.

To publish an **update**:

1. **Bump the version** — set the new `version` in `wxt.config.ts` (the manifest
   source of truth); Chrome rejects an upload whose version is not strictly
   higher than the published one.
2. **Validate the release structure** — `pnpm --filter extension release:structural`
   (`scripts/validate-store-release.mjs`) verifies the manifest, icons, and
   production config without claiming external Chrome/Web Store proof.
3. **Build the store zip** — `pnpm --filter extension zip:prod` — produces the
   production-config `.zip` under `apps/extension/dist/`.
4. **Upload** the zip to the operator-authorized Chrome Web Store item in the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   and submit for review. (Store credentials live with the operator's Google
   account; there is no CI-automated publish today — this is a deliberate
   manual gate.)
5. **Verify** the provider receipt, downloaded ZIP digest, extension ID, and
   publication status before claiming a submission or publication.

The strict `pnpm --filter extension release:check` gate is intentionally
nonzero until the operator supplies an exact-provenance Chrome/Web Store
evidence packet through `RELEASE_OPERATOR_EVIDENCE_PATH`.

Firefox has a parallel `zip:firefox` target for a future AMO listing.

## 🏗️ Architecture

- **Background Script**: Handles context menu clicks and auth token management.
- **Popup**: React app for user interaction.
- **Shared Code**: Imports types and constants from `@sploot/common`.
