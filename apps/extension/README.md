# Sploot Browser Extension 🧩

> **Right-click to save memes from anywhere.**

A Chrome Extension built with WXT and React that integrates seamlessly with the Sploot library.

## ✨ Key Features

- **Context Menu**: Right-click any image → "Save to Sploot".
- **Popup UI**: View status, sign in/out.
- **Auth**: Seamless Clerk integration sharing session with web app.
- **Tech**: WXT (Vite-based), React 19, TypeScript.

## 🚀 Getting Started

### 1. Environment Setup

Create `.env` (dev) or `.env.production` (prod):

```env
# Must match the Web App's keys
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
VITE_API_BASE_URL=http://localhost:3001 # or https://www.sploot.app
```

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

### 4. Installation (Manual)

1. Go to `chrome://extensions`.
2. Enable **Developer Mode**.
3. Click **Load Unpacked**.
4. Select `apps/extension/dist/chrome-mv3`.

## 🏗️ Architecture

- **Background Script**: Handles context menu clicks and auth token management.
- **Popup**: React app for user interaction.
- **Shared Code**: Imports types and constants from `@sploot/common`.
