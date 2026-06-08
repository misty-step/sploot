# Sploot Browser Extension 🧩

> **Right-click to save memes from anywhere.**

A Chrome Extension built with WXT and React that integrates seamlessly with the Sploot library.

## ✨ Key Features

- **Context Menu**: Right-click any image → "Save to Sploot".
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

## 🏗️ Architecture

- **Background Script**: Handles context menu clicks and auth token management.
- **Popup**: React app for user interaction.
- **Shared Code**: Imports types and constants from `@sploot/common`.
