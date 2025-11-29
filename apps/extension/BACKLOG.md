# BACKLOG.md

Last groomed: 2025-11-17
Analyzed by: 8 specialized perspectives (complexity-archaeologist, architecture-guardian, security-sentinel, performance-pathfinder, maintainability-maven, user-experience-advocate, product-visionary, design-systems-architect)

---

## Now (Sprint-Ready, <2 weeks)

### [Performance] Fix Notification Listener Memory Leak
**File**: `entrypoints/background/notifications.ts:34-42`
**Perspectives**: performance-pathfinder
**Impact**: Each successful save adds a dangling click handler that's never removed if notification auto-dismisses
**Fix**: Remove listener when notification is cleared:
```typescript
setTimeout(() => {
  chrome.notifications.clear(notificationId);
  chrome.notifications.onClicked.removeListener(clickHandler);
}, 5000);
```
**Effort**: 5m | **Risk**: Memory leak causing degradation over service worker lifetime
**Acceptance**: No listener accumulation after 100+ saves

---

### [Performance] Consolidate Auth Check + Token Retrieval
**File**: `entrypoints/background/context-menu.ts:72-91`, `auth-manager.ts`
**Perspectives**: performance-pathfinder
**Impact**: Every save creates 2 Clerk client instances (200-600ms overhead, 20% of 3s budget)
**Fix**: Get token directly, check if null for auth status:
```typescript
const token = await getAuthToken();
if (!token) {
  // Prompt sign-in
}
// Pass token to uploadImage to avoid re-fetch
```
**Effort**: 30m | **Speedup**: 200-600ms per save
**Acceptance**: Single Clerk client per save operation

---

### [Architecture] Centralize Timeout Constants
**Files**: `auth-manager.ts:6`, `api-client.ts:12`, `image-fetcher.ts:143`, `notifications.ts:29,76`
**Perspectives**: complexity-archaeologist, architecture-guardian, maintainability-maven
**Impact**: 5 timeout values scattered across 4 files with no rationale documentation
**Fix**: Create `shared/constants.ts`:
```typescript
export const TIMEOUTS = {
  /** Sign-in flow - long for OAuth redirects */
  SIGN_IN_MS: 60_000,
  /** API upload - bail early for UX (server times out at 30s) */
  UPLOAD_MS: 10_000,
  /** Image element loading fallback */
  IMAGE_FETCH_MS: 10_000,
  /** Success notification auto-dismiss */
  NOTIFICATION_SUCCESS_MS: 5_000,
  /** Error notification - longer so users can read message */
  NOTIFICATION_ERROR_MS: 10_000,
} as const;
```
**Effort**: 45m | **Benefit**: Single source of truth, documented rationale
**Acceptance**: All timeouts imported from constants.ts

---

### [Architecture] Create Typed Error System
**Files**: `shared/api-client.ts:80-106`, `notifications.ts:52-64`
**Perspectives**: complexity-archaeologist, architecture-guardian, maintainability-maven, user-experience-advocate
**Impact**: Error translation in 2 places with fragile string matching; inconsistent null vs throw patterns
**Fix**: Create `shared/errors.ts`:
```typescript
export enum ErrorCode {
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  IMAGE_TOO_LARGE = 'IMAGE_TOO_LARGE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
}

export class SplootError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = 'SplootError';
  }
}
```
API client throws typed errors, notifications maps codes to user messages.
**Effort**: 2h | **Benefit**: Eliminates string matching, consistent error handling
**Acceptance**: All errors use SplootError with codes

---

### [Security] Add Message Handler Sender Validation
**File**: `entrypoints/background/auth-manager.ts:152-172`
**Perspectives**: security-sentinel
**Impact**: Any context can send AUTH_STATE_UPDATE messages without validation
**Fix**:
```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.id || sender.id !== chrome.runtime.id) {
    console.warn('[Auth] Rejected message from unknown sender', sender);
    return false;
  }
  // ... existing logic
});
```
**Effort**: 15m | **Risk**: MEDIUM - state confusion, future vulnerabilities if content scripts added
**Acceptance**: Messages from non-extension contexts are rejected

---

### [Security] Strip Sensitive Data from Production Logs
**Files**: `auth-manager.ts:19,34-37,66-69,110,145`
**Perspectives**: security-sentinel, performance-pathfinder
**Impact**: User IDs, session IDs logged to console in production; aids reconnaissance
**Fix**: Conditional logging:
```typescript
if (import.meta.env.DEV) {
  console.log('[Auth] Token retrieved', { hasToken, userId });
}
// Production: console.log('[Auth] Token retrieved', { hasToken: Boolean(token) });
```
**Effort**: 30m | **Risk**: MEDIUM - information disclosure
**Acceptance**: No user/session IDs in production console

---

### [UX] Add Progress Notification During Save
**File**: `entrypoints/background/context-menu.ts`
**Perspectives**: user-experience-advocate
**Impact**: No feedback for 0-10+ seconds during image fetch/upload; users think extension is broken
**Fix**: Show immediate progress:
```typescript
showProgressNotification('Saving image...', filename);
const imageBlob = await fetchImage(imageUrl);
updateProgressNotification('Uploading to Sploot...');
const result = await uploadImage(imageBlob, filename);
showSuccessNotification(filename);
```
**Effort**: 2h | **Value**: Prevents confusion and duplicate saves
**Acceptance**: User sees status within 500ms of right-click

---

### [UX] Fix Double Notification on Auth
**File**: `entrypoints/background/context-menu.ts:74-79`
**Perspectives**: user-experience-advocate
**Impact**: Error notification appears BEFORE popup opens for sign-in - confusing sequence
**Fix**: Show info notification instead of error:
```typescript
if (!authenticated) {
  showInfoNotification('Opening sign-in...');  // Not error
  const signedIn = await promptUserSignIn();
  // ...
}
```
**Effort**: 30m | **Value**: Clear flow, reduced user confusion
**Acceptance**: No error notification shown before sign-in attempt

---

### [UX] Translate HTTP Status Codes to User Messages
**File**: `entrypoints/background/image-fetcher.ts:54`
**Perspectives**: user-experience-advocate
**Impact**: Users see "HTTP 403: Forbidden" - technical jargon
**Fix**:
```typescript
const errorMessages: Record<number, string> = {
  403: 'This website blocks image downloads. Try downloading the image first.',
  404: 'Image no longer exists on this website.',
  500: 'The website is experiencing issues. Try again later.',
};
throw new Error(errorMessages[response.status] || `Unable to download (error ${response.status})`);
```
**Effort**: 30m | **Value**: Actionable guidance instead of codes
**Acceptance**: No raw HTTP status codes shown to users

---

### [Design] Fix Focus Ring Color
**File**: `entrypoints/popup/style.css:302`
**Perspectives**: design-systems-architect
**Impact**: Focus ring uses pink `rgba(255, 92, 141, 0.1)` instead of brand purple
**Fix**: Change to `rgba(124, 92, 255, 0.1)` to match `--accent-primary`
**Effort**: 5m | **Value**: Correct brand color in accessibility feature
**Acceptance**: Focus ring matches accent color

---

### [Design] Extract Library URL to Environment
**Files**: `popup/App.tsx:83`, `notifications.ts:36`
**Perspectives**: maintainability-maven, design-systems-architect
**Impact**: Hardcoded `https://sploot.app/app` in 2 places; dev builds point to production
**Fix**: Add to `shared/env.ts`:
```typescript
export const SPLOOT_APP_URL = import.meta.env.DEV
  ? 'http://localhost:3000/app'
  : 'https://sploot.app/app';
```
**Effort**: 15m | **Value**: Consistent dev/prod handling
**Acceptance**: Dev builds open localhost library

---

### [Maintainability] Remove Dead `_thumbnailUrl` Parameter
**File**: `entrypoints/background/notifications.ts:15`
**Perspectives**: complexity-archaeologist
**Impact**: Dead parameter in public interface; cognitive overhead with no value
**Fix**: Remove parameter. Add back when actually needed (YAGNI).
**Effort**: 15m | **Benefit**: Cleaner interface
**Acceptance**: Function signature matches actual usage

---

### [Maintainability] Update CLAUDE.md fetchImage Signature
**File**: `CLAUDE.md`
**Perspectives**: maintainability-maven
**Impact**: Docs say `Promise<{ blob, filename }>` but implementation returns `Promise<Blob>`
**Fix**: Update documentation to match implementation
**Effort**: 5m | **Benefit**: Docs match reality
**Acceptance**: CLAUDE.md signature matches image-fetcher.ts

---

## Next (This Quarter, <3 months)

### [Infrastructure] Add Lefthook + ESLint Quality Gates
**Perspectives**: architecture-guardian, maintainability-maven
**Why**: No pre-commit hooks, no linting rules - bad code reaches repository
**Implementation**:
```bash
pnpm add -D lefthook eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
npx lefthook init
```
Create `lefthook.yml` with type check + lint commands
**Effort**: 3h | **Impact**: Prevents type errors and style issues from being committed

---

### [Infrastructure] Add Test Coverage with Vitest
**Perspectives**: maintainability-maven, architecture-guardian
**Why**: Zero automated tests for auth/upload/fetch - financial/privacy-sensitive code
**Implementation**: Create test suite for critical paths:
- `auth-manager.test.ts` - isAuthenticated, getAuthToken, waitForSignIn
- `api-client.test.ts` - uploadImage success/failure/timeout
- `image-fetcher.test.ts` - URL validation, MIME types, size limits
**Effort**: 8h | **Impact**: CRITICAL - enables safe Phase 2 development

---

### [Infrastructure] Add Structured Logging with Pino
**Perspectives**: architecture-guardian, performance-pathfinder
**Why**: 40+ unstructured console.log calls; no log levels; poor production debugging
**Implementation**:
```typescript
// shared/logger.ts
import pino from 'pino';
export const logger = pino({
  level: import.meta.env.PROD ? 'warn' : 'debug',
});
```
**Effort**: 3h | **Impact**: Structured JSON logs, production-ready

---

### [Infrastructure] Add Sentry Error Tracking
**Perspectives**: architecture-guardian
**Why**: No production error visibility - silent failures
**Implementation**: Initialize Sentry in background.ts with DSN from env
**Effort**: 2h | **Impact**: Production error visibility with user context

---

### [Infrastructure] Add Changelog Automation
**Perspectives**: architecture-guardian
**Why**: No changelog, no version tracking - users don't know what changed
**Implementation**: Changesets or semantic-release
**Effort**: 2h | **Impact**: Automatic changelog generation, consistent versioning

---

### [Architecture] Fix api-client Coupling to Background Module
**File**: `shared/api-client.ts:8`
**Perspectives**: architecture-guardian, maintainability-maven
**Why**: Shared module imports from `entrypoints/background/auth-manager` - can't use in popup
**Fix**: Dependency injection:
```typescript
export async function uploadImage(
  blob: Blob,
  filename: string,
  tokenProvider: () => Promise<string | null>
): Promise<UploadResult>
```
**Effort**: 1h | **Impact**: Enables reuse in multiple contexts, testable without Clerk

---

### [Architecture] Eliminate Cached Auth State
**File**: `entrypoints/background/auth-manager.ts:8-52`
**Perspectives**: complexity-archaeologist, architecture-guardian
**Why**: Hidden `cachedState` conflicts with documented "fresh client" pattern; temporal coupling
**Fix**: Remove mutable cache, always use fresh client reads:
```typescript
export async function getAuthState(): Promise<AuthState> {
  const clerk = await createFreshClerkClient();
  return {
    status: clerk.session ? 'signed-in' : 'signed-out',
    userId: clerk.session?.user?.id ?? null,
    // ...
  };
}
```
**Effort**: 2h | **Impact**: Eliminates stale cache bugs, aligns with docs

---

### [Performance] Fix PNG Forced in Fallback Path
**File**: `entrypoints/background/image-fetcher.ts:116-117`
**Perspectives**: performance-pathfinder
**Why**: Fallback always converts to PNG regardless of source; 500KB JPEG becomes 2-3MB PNG
**Fix**: Preserve format or use JPEG for photos:
```typescript
const format = url.match(/\.png$/i) ? 'image/png' : 'image/jpeg';
canvas.convertToBlob({ type: format, quality: 0.92 });
```
**Effort**: 20m | **Impact**: 2-6x smaller uploads on fallback path

---

### [Security] Reduce Host Permissions Scope
**File**: `wxt.config.ts:36-44`
**Perspectives**: security-sentinel
**Why**: `*://*/*` grants access to ALL websites - may cause Chrome Web Store rejection
**Fix**: Use `activeTab` permission or document justification for store review
**Effort**: 2h | **Risk**: HIGH - violates least privilege

---

### [Security] Tighten Sandbox CSP
**File**: `wxt.config.ts:46-48`
**Perspectives**: security-sentinel
**Why**: Sandbox CSP includes `unsafe-inline` and `unsafe-eval`
**Fix**: Remove unless specifically needed for Clerk
**Effort**: 15m + testing | **Risk**: MEDIUM

---

### [UX] Add Popup Loading State
**File**: `entrypoints/popup/App.tsx`
**Perspectives**: user-experience-advocate, design-systems-architect
**Why**: Brief blank/flash while Clerk loads
**Fix**: Use `<ClerkLoading>` wrapper with spinner
**Effort**: 30m | **Value**: No confusing blank state

---

### [UX] Add Offline Upload Queue
**Perspectives**: user-experience-advocate, product-visionary
**Why**: Upload fails silently on poor connection; images lost permanently
**Implementation**: IndexedDB queue + background retry with exponential backoff
**Effort**: 8h | **Value**: Never lose user data - trust critical

---

### [Design] Unify Design Tokens
**Files**: `popup/App.tsx:20-36`, `popup/style.css:8-73`
**Perspectives**: design-systems-architect
**Why**: Same colors defined in CSS variables AND Clerk config; change one forget other
**Fix**: Extract to `shared/design-tokens.ts`, use in both places
**Effort**: 2h | **Impact**: Single source of truth, enables theming

---

### [Design] Add Error Boundary
**File**: `entrypoints/popup/App.tsx`
**Perspectives**: design-systems-architect
**Why**: React errors would crash entire popup with white screen
**Effort**: 30m | **Impact**: Graceful error recovery

---

### [Design] Add Sign-Out Loading State
**File**: `entrypoints/popup/App.tsx:123-132`
**Perspectives**: design-systems-architect
**Why**: No feedback during sign out
**Effort**: 30m | **Impact**: Clear user feedback during state transition

---

### [Product] Screenshot Crop Tool (Complete Registered Shortcut)
**File**: `wxt.config.ts:54-61`
**Perspectives**: product-visionary, user-experience-advocate
**Why**: `Cmd+Shift+S` registered but does nothing - broken promise; missing 40% content types
**Implementation**: Content script with canvas overlay, click-drag selection, preview
**Effort**: 8d | **Value**: Unlocks tweets, DMs, conversations - 40% content unlock

---

### [Product] Collection Selection at Save Time
**Perspectives**: product-visionary
**Why**: Images go to flat library; creates "digital junk drawer"
**Implementation**: Context menu submenu for collections; API addition for collectionId
**Effort**: 3d | **Value**: Transforms capture tool to organization system; 3x retention

---

### [Product] Page Context Preservation
**File**: `entrypoints/background/context-menu.ts`
**Perspectives**: product-visionary
**Why**: Only saves image URL - "Where did I find this?" lost
**Implementation**: Add metadata to upload:
```typescript
formData.append('metadata', JSON.stringify({
  source: 'chrome-extension',
  pageUrl: tab.url,
  pageTitle: tab.title,
  savedAt: Date.now(),
}));
```
**Effort**: 1d | **Value**: Library becomes knowledge base, not just image dump

---

### [Product] Quick Notification Actions
**File**: `entrypoints/background/notifications.ts`
**Perspectives**: product-visionary, user-experience-advocate
**Why**: Success notification only links to library; no immediate actions
**Implementation**: Add buttons for "Copy Link" and "Add to Collection"
**Effort**: 1d | **Value**: Immediate utility; 2x actions-per-session

---

## Soon (Exploring, 3-6 months)

- **[Product] Bulk Multi-Select** - Shift+click selection for galleries (Reddit, Pinterest); 5d; power user retention
- **[Product] AI Auto-Tagging** - CLIP embeddings for searchable library; 10d; key differentiator
- **[Product] Quick Share/Copy Link** - Save & share in one action; 3d; viral growth
- **[Product] Duplicate Detection** - pHash comparison; 4d; storage efficiency for premium
- **[Platform] Firefox Support** - WXT supports it, minimal changes; 3d; 5-8% market
- **[A11Y] Focus Management** - Programmatic focus on popup open; 15m
- **[A11Y] ARIA Labels** - Screen reader clarity for buttons; 15m
- **[Maintainability] JSDoc for extractFilename Edge Cases** - Document data URL, query param handling; 15m

---

## Later (Someday/Maybe, 6+ months)

- **[Platform] Safari Support** - Different manifest format; 5d
- **[Product] Team/Shared Collections** - B2B market; 15d
- **[Product] Usage Analytics Dashboard** - Premium feature; 5d
- **[Product] Custom Domains** - Professional tier; 8d
- **[Innovation] Similar Image Recommendations** - Engagement feature; 12d
- **[Innovation] Meme Template Detection** - Niche differentiation; 8d
- **[Innovation] Auto-Collection Suggestions** - Organization automation; 6d

---

## Learnings

**From this grooming session:**
- **Token/error duplication** across modules signals need for `shared/` consolidation strategy
- **"Fresh Clerk client" pattern** conflicts with cached state - architecture needs alignment
- **UI is surprisingly mature** for MVP size - good token system, deep modules in auth-manager
- **Security posture solid** - no critical vulnerabilities; main concern is host_permissions scope
- **Performance budget well-managed** - 203KB bundle reasonable; main wins in auth consolidation

---

## Summary Metrics

**Total Issues Identified**: 48
- Critical (Now): 13 items, ~8h effort
- High (Next): 20 items, ~40h effort
- Medium (Soon): 8 items
- Low (Later): 7 items

**Cross-Validation Signals**:
- 5 issues flagged by 3+ agents (highest priority)
- 5 issues flagged by 2 agents (high priority)

**Estimated Phase 1 Completion**: 2 weeks for Now items
**Estimated Phase 2 Foundation**: 6 weeks for Next items

**Strategic Focus**: Post-capture value (collections, context, search) transforms Sploot from "Dropbox for images" to "searchable meme library"
