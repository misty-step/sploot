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

## 🛒 Publishing to the Chrome Web Store

The extension ships as a **live public listing**:
**https://chromewebstore.google.com/detail/sploot/fbhkflbcnllfogefckablkafjknmcfnd**
(also linked from the repo README and the sploot.app footer). A stranger with
no repo access installs it straight from that URL — no sideloading required.

To publish an **update**:

1. **Bump the version** — set the new `version` in `wxt.config.ts` (the manifest
   source of truth); Chrome rejects an upload whose version is not strictly
   higher than the published one.
2. **Validate the release structure** — `pnpm --filter extension release:structural`
   (`scripts/validate-store-release.mjs`) verifies the manifest, icons, and
   production config without claiming external Chrome/Web Store proof.
3. **Build the store zip** — `pnpm --filter extension zip:prod` — produces the
   production-config `.zip` under `apps/extension/.output/`.
4. **Upload** the zip to the existing item in the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   and submit for review. (Store credentials live with the operator's Google
   account; there is no CI-automated publish today — this is a deliberate
   manual gate.)
5. **Verify** the listing URL still resolves and the new version is live before
   closing the release.

The strict `pnpm --filter extension release:check` gate is intentionally
nonzero until the operator supplies an exact-provenance Chrome/Web Store
evidence packet through `RELEASE_OPERATOR_EVIDENCE_PATH`.

Firefox has a parallel `zip:firefox` target for a future AMO listing.

## 🏗️ Architecture

- **Background Script**: Handles context menu clicks and auth token management.
- **Popup**: React app for user interaction.
- **Shared Code**: Imports types and constants from `@sploot/common`.
