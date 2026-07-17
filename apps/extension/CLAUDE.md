# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Sploot Chrome Extension** - Phase 1 MVP enabling one-click image saving from any website to Sploot library. Built with WXT framework (Vite-based), React, TypeScript, and Clerk WebSSO authentication.

**Key Stats:**
- ~1,000 lines TypeScript
- 203 KB bundle size
- <1s build time
- 8 modules (6 backend, 2 frontend)

## Essential Commands

### Development Workflow
```bash
pnpm install          # Install deps + run WXT prepare hook
pnpm dev             # Start HMR development server
pnpm dev:firefox     # Firefox development mode
```

### Building
```bash
# Development build (uses .env with pk_test_ keys)
pnpm build

# Production build (uses .env.production with pk_live_ keys)
pnpm build:prod

# Firefox builds
pnpm build:firefox
```

**Critical:** `pnpm build` uses `.env` (local/test Clerk instance), `pnpm build:prod` uses `.env.production` (live Sploot). Environment validation in `shared/env.ts` will throw if Clerk key type doesn't match sync host.

### Extension Setup
```bash
# Generate stable extension ID (run once, creates .crx-key.pem)
pnpm generate:crx-key

# Configure Clerk allowed origins via Backend API
pnpm setup:clerk
```

### Distribution
```bash
pnpm zip             # Create Chrome Web Store package
pnpm zip:firefox     # Create Firefox package
```

### Loading Extension Manually
1. `pnpm build` or `pnpm build:prod`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. "Load unpacked" → select `dist/chrome-mv3/`

**Important:** Extension ID must match Clerk allowed origins. Use `pnpm generate:crx-key` once to get stable ID, then `pnpm setup:clerk` to register it.

## Architecture

### Deep Module Pattern
Every module exports a **simple interface** (1-4 functions) hiding complex implementation:

**`entrypoints/background/auth-manager.ts`** - Clerk WebSSO
- `isAuthenticated(): Promise<boolean>`
- `getAuthToken(): Promise<string | null>`
- `getUserId(): Promise<string | null>`
- `login(): Promise<void>`
- `logout(): Promise<void>`
- `setupAuthListeners(): void`

**Critical Detail:** The background owns one long-lived Clerk client with its
event-driven WebSSO cookie listener. It publishes sanitized auth metadata to
the popup; tokens stay inside the Clerk client and never cross runtime messages.

**`entrypoints/background/image-fetcher.ts`** - CORS-Aware Downloads
- `fetchImage(url: string): Promise<{ blob: Blob, filename: string }>`

Implements dual fetch strategy:
1. Direct `fetch()` with background context (bypasses CORS)
2. Fallback: Image element + OffscreenCanvas (for fetch-blocking sites)

**`shared/api-client.ts`** - Sploot API Integration
- `uploadImage(blob: Blob, filename: string): Promise<UploadResponse>`

Handles FormData construction, auth headers, timeout (10s), error translation.

**`entrypoints/background/notifications.ts`** - User Feedback
- `showSuccessNotification(filename: string, thumbnailUrl: string): void`
- `showErrorNotification(message: string): void`

**`entrypoints/background/context-menu.ts`** - Right-Click Orchestration
- Registers "Save to Sploot" menu item on `chrome.contextMenus`
- Coordinates auth check → fetch → upload → notification flow

### Entry Points

**Background Service Worker** (`entrypoints/background.ts`)
- Initializes on extension load
- Sets up auth RPC listeners
- Registers context menu handlers
- Logging for debugging

**Popup UI** (`entrypoints/popup/App.tsx`)
- React component with `ClerkProvider`
- Two states: `SignedOut` (opens web sign-in) / `SignedIn` (view library)
- No state persistence - queries auth on every open

### Environment Management

**Two config files:**
- `.env` - Development (pk_test_ keys, localhost:3000)
- `.env.production` - Production (pk_live_ keys, https://www.sploot.app)

**Validation (`shared/env.ts`):**
- Checks Clerk publishable key prefix matches sync host environment
- Throws at build time if pk_live with localhost or pk_test with production URL
- Prevents deployment configuration errors

**WXT Configuration (`wxt.config.ts`):**
- Uses `WXT_MODE` env var to switch between dev/prod
- Sets Clerk domain:
  - Dev: `https://tender-bison-73.clerk.accounts.dev/*`
  - Prod: `https://clerk.sploot.app/*`
- Adds API host permission derived from `VITE_API_BASE_URL` (defaults to sploot.app or localhost)

### Authentication Flow (Web Sign-In)

**Shared Sploot session:** Sign-in happens on the Sploot web app so users get
the full Clerk surface instead of a constrained extension popup.

1. Signed-out popup and background prompts open `${VITE_API_BASE_URL}/sign-in`
   in a new tab
2. The background starts one persistent Clerk sync listener and broadcasts
   `AUTH_STATE_CHANGED` metadata when WebSSO changes
3. An already-open popup requests the current state and refreshes its own Clerk
   provider; it does not receive a token or need to be reopened
4. Context-menu prompts wait on the same event boundary for up to 60 seconds;
   they do not poll

**Implementation constraints:**
- Clerk domain must be in manifest `host_permissions`
- Extension ID must be allowed in Clerk dashboard (via `pnpm setup:clerk`)
- One background Clerk client per service-worker lifecycle, recreated on worker restart
- Web app URLs are centralized in `shared/app-url.ts`

### RPC Message Pattern

Cross-context communication now centers on auth state broadcasts:

```typescript
chrome.runtime.sendMessage({
  type: AUTH_MESSAGES.STATE_CHANGED,
  payload: {
    status: 'signed-in',
    userId,
    sessionId,
    expiresAt,
  },
});
```

The background responds to `AUTH_REQUEST_STATE` and `RUN_AUTH_DIAGNOSTICS`.
`AUTH_STATE_CHANGED` is a background-to-popup refresh signal; it contains only
non-secret session metadata.

## Code Conventions

### Module Boundaries
- **`entrypoints/background/`** - Background service worker logic only
- **`entrypoints/popup/`** - React UI components
- **`shared/`** - Cross-context utilities (API client, env validation)
- **`public/`** - Static assets (icons)

### Naming
- Modules: `kebab-case` (e.g., `auth-manager.ts`)
- Functions: `camelCase` (e.g., `getAuthToken`)
- Components: `PascalCase` (e.g., `App.tsx`)

### Error Handling
Translate technical errors to user-friendly messages in `api-client.ts`:
- 401 → "Session expired, please login again"
- 413 → "Image too large (max 10MB)"
- 429 → "Rate limited, please try again"
- Network → "Network error, check connection"

### Type Safety
Strict TypeScript throughout. Use Chrome extension types from `@types/chrome`.

## Special Patterns

### Fresh Clerk Client (DO NOT CACHE)
```typescript
// ✅ Correct - creates fresh client
async function isAuthenticated() {
  const clerk = await createClerkClient({ /* ... */ });
  return clerk.session !== null;
}

// ❌ Wrong - caching breaks WebSSO
const clerk = await createClerkClient({ /* ... */ }); // DON'T DO THIS
async function isAuthenticated() {
  return clerk.session !== null;
}
```

**Why:** Clerk syncs cookies from sploot.app. Fresh client = fresh cookie read = reliable auth state.

### Dual Image Fetch Strategy
1. **Primary:** `fetch(url)` with background context (bypasses CORS)
2. **Fallback:** `<img>` + `OffscreenCanvas` (for sites blocking fetch)

Provides high compatibility without user intervention.

### Filename Extraction Logic
1. Parse URL pathname for filename
2. Fallback to page title (sanitized, no special chars)
3. Fallback to `image-{timestamp}.jpg`

## Testing

**Manual Test Checklist (see TESTING.md):**
1. Extension loads without errors
2. Auth works via sploot.app WebSSO
3. Right-click save on 10+ sites (Twitter, Reddit, Discord, etc.)
4. Upload completes <3s (P95)
5. Notifications show success/error
6. Images appear in library immediately

**Debugging:**
- Background console: `chrome://extensions` → "Inspect views: background page"
- Check POST requests to `/api/upload` in Network tab
- Verify auth token in request headers

**Common Issues:**
- "Not authenticated" → Ensure logged into sploot.app, run `pnpm setup:clerk`
- Extension won't load → `rm -rf dist && pnpm build`
- Images not uploading → Check background console for errors

## Build Output

**Location:** `dist/chrome-mv3/` (or `dist/firefox-mv3/`)

**Files:**
- `manifest.json` - Chrome extension manifest
- `background.js` - Background service worker (~7 KB)
- `popup.html` - Extension popup
- `chunks/` - React bundles (~194 KB)

**Total:** 203 KB (under 500 KB target)

## Phase 1 MVP Scope

**Implemented:**
- ✅ Right-click "Save to Sploot" on any image
- ✅ Clerk WebSSO authentication
- ✅ Image upload with FormData
- ✅ Success/error notifications
- ✅ CORS-aware image fetching

**Not Implemented (Future Phases):**
- Screenshot crop tool (not started; the old dead shortcut registration was removed)
- Offline upload queue (IndexedDB)
- Upload retry logic
- Progress indicator
- Firefox/Safari support
- Chrome Web Store listing

## Dependencies

**Core:**
- `@clerk/chrome-extension` - Clerk WebSSO for extensions
- `react@19.2.0`, `react-dom@19.2.0` - UI framework
- `wxt@0.20.11` - Extension framework (Vite-based)
- `typescript@5.9.3` - Type checking

**Dev Only:**
- `@types/chrome` - Chrome extension API types

**Minimal by design** - only Clerk + React, nothing else.

## Scripts

**`scripts/generate-crx-key.sh`**
- Generates `.crx-key.pem` (private key for stable extension ID)
- Updates `.env` with `CRX_PUBLIC_KEY`
- Outputs extension ID and origin

**`scripts/configure-clerk.sh`**
- Calls Clerk Backend API to fetch current instance settings
- Adds `chrome-extension://<ID>` to allowed origins
- Handles null `allowed_origins` in API response (bug fix in 1e937ae)

## Git Workflow

Recent commits demonstrate iteration pattern:
- `1e937ae` - fix: handle null allowed_origins in Clerk API response
- `609380f` - feat: automate Clerk configuration via Backend API
- `34601db` - docs: add Phase 1 MVP completion summary

**Commit style:** Conventional commits (type: subject)

## Related Documentation

- **README.md** - Quick start, development workflow
- **SUMMARY.md** - Phase 1 completion status, next phases
- **TESTING.md** - Comprehensive manual test scenarios
- **ISSUE.md** - Current issues/bugs
- **AGENTS.md** - Agent configurations
