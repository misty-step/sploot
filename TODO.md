# TODO: Add to Sploot - Chrome Extension Quick Save

## Context

**Architecture**: WXT Framework + Clerk WebSSO + Reuse Existing `/api/upload` endpoint
**Location**: Separate repository/directory `sploot-extension/` (not in main Next.js app)
**Key Pattern**: Extension is thin capture UI—reuses 100% of server upload infrastructure
**Existing Code to Reuse**: `lib/upload-queue.ts` (IndexedDB pattern), Clerk auth patterns from `lib/auth/client.tsx`

**Timeline**: 3 weeks (15-18 days)
- Phase 1 (Days 1-5): WXT scaffold + right-click save + auth
- Phase 2 (Days 6-10): Crop tool + offline queue
- Phase 3 (Days 11-15): Polish + Chrome Web Store

---

## Phase 1: MVP Foundation (Week 1)

### Core Infrastructure

- [ ] Initialize WXT extension project
  ```
  Command: pnpm create wxt@latest sploot-extension
  Location: /Users/phaedrus/Development/sploot-extension/
  Config: TypeScript + React module (@wxt-dev/module-react)

  Success:
  - wxt.config.ts configured with React module
  - package.json has @clerk/chrome-extension dependency
  - tsconfig.json extends .wxt/tsconfig.json
  - pnpm dev starts extension dev server
  - Extension loads in chrome://extensions

  Test: Load unpacked extension, verify manifest v3, check console for errors

  Dependencies: None (bootstrapping)

  Time: 1-2h
  ```

- [ ] Configure manifest.json via WXT
  ```
  File: wxt.config.ts

  Manifest Config:
  - permissions: ["storage", "tabs", "contextMenus", "notifications"]
  - host_permissions: ["*://*/*"] (for image fetch)
  - action: { default_popup: "popup.html" }
  - commands: { "capture-screenshot": { suggested_key: "Ctrl+Shift+S" } }
  - background: { service_worker: "background.ts", type: "module" }

  Success:
  - Manifest v3 valid per Chrome validator
  - Permissions minimal (no debugger, enterprise)
  - CSP strict (script-src 'self', no eval)

  Test: chrome.permissions.getAll() shows only declared permissions

  Dependencies: WXT project initialized

  Time: 30min
  ```

### Authentication Module

- [ ] Implement auth-manager.ts (Background Service Worker)
  ```
  File: sploot-extension/entrypoints/background/auth-manager.ts

  Interface (Deep Module):
  export async function getAuthToken(): Promise<string | null>
  export async function isAuthenticated(): Promise<boolean>
  export async function login(): Promise<void>
  export async function logout(): Promise<void>

  Hidden Implementation:
  - @clerk/chrome-extension createClerkClient() in background
  - syncHost: process.env.PLASMO_PUBLIC_CLERK_SYNC_HOST (sploot.app)
  - Token storage: chrome.storage.session.set({ accessToken, expiresAt })
  - Token refresh: Automatic via Clerk session.getToken()
  - Fallback OAuth: browser.identity.launchWebAuthFlow()

  Pattern: Follow @clerk/chrome-extension docs service-worker.md
  Research: Exa code context shows createClerkClient() + getToken() pattern

  Success:
  - isAuthenticated() returns true if sploot.app session exists
  - getAuthToken() returns JWT from Clerk
  - login() opens OAuth popup if no session
  - Tokens stored in chrome.storage.session (not local)

  Test:
  - Manual: Login to sploot.app, install extension, verify auto-auth
  - Unit: Mock chrome.storage, test token refresh logic

  Dependencies: Clerk publishable key in .env

  Time: 4-6h (includes Clerk WebSSO research/setup)
  ```

- [ ] Configure Clerk dashboard for chrome-extension:// origin
  ```
  Steps:
  1. Login to Clerk dashboard (dashboard.clerk.com)
  2. Navigate to Application → API Keys → Allowed Origins
  3. Add: chrome-extension://  (wildcard for dev extensions)
  4. Production: Add specific extension ID after Chrome Web Store publish

  Success: WebSSO sync works without CORS errors

  Test: Background service worker logs show "Session synced" from sploot.app

  Dependencies: Clerk account access

  Time: 15min
  ```

### Right-Click Image Save

- [ ] Implement context menu handler (Background Service Worker)
  ```
  File: sploot-extension/entrypoints/background/context-menu.ts

  Implementation:
  - chrome.contextMenus.create() on install
  - Menu item: "Save to Sploot" on contexts: ["image"]
  - onClick: Get info.srcUrl → call image-fetcher → queue upload

  Pattern:
  ```typescript
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'save-to-sploot',
      title: 'Save to Sploot',
      contexts: ['image']
    });
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'save-to-sploot') {
      const imageUrl = info.srcUrl;
      await handleImageSave(imageUrl);
    }
  });
  ```

  Success:
  - Right-click any image shows "Save to Sploot"
  - Click triggers handleImageSave()
  - Works on Twitter, Reddit, Discord

  Test: Right-click images on 10+ sites, verify menu appears

  Dependencies: Background service worker configured

  Time: 1h
  ```

- [ ] Implement image-fetcher.ts (Background Service Worker)
  ```
  File: sploot-extension/entrypoints/background/image-fetcher.ts

  Interface:
  export async function fetchImage(url: string): Promise<Blob>

  Hidden Implementation:
  - fetch(url) using background context (bypasses CORS via host_permissions)
  - Validate Content-Type is image/*
  - Max size check: 10MB (match server MAX_FILE_SIZE)
  - Fallback: Try <img crossOrigin="anonymous"> + canvas if fetch fails
  - Error handling: Invalid URL, network errors, non-image content

  Pattern: Use existing upload validation from lib/upload/upload-validation-service.ts

  Success:
  - Fetches images from any origin (Twitter CDN, Reddit, etc.)
  - Returns Blob with correct MIME type
  - Rejects non-images and oversized files

  Test:
  - Unit: Mock fetch, test CORS scenarios, size limits
  - Integration: Fetch real images from Twitter, Reddit

  Dependencies: host_permissions in manifest

  Time: 2-3h
  ```

- [ ] Implement api-client.ts (Shared Module)
  ```
  File: sploot-extension/shared/api-client.ts

  Interface (Simple):
  export async function uploadImage(blob: Blob, filename?: string): Promise<UploadResult>

  interface UploadResult {
    assetId: string;
    blobUrl: string;
    thumbnailUrl: string;
  }

  Hidden Implementation:
  - POST https://sploot.app/api/upload (existing endpoint)
  - FormData: file, metadata: { source: 'chrome-extension' }
  - Authorization: Bearer ${await getAuthToken()}
  - Timeout: 10s (abort if slower)
  - Error parsing: Match existing API error format
  - Progress: Not needed for Phase 1 (add in Phase 2)

  Pattern: Reuse FormData construction from components/upload/upload-zone.tsx

  Success:
  - Upload completes in <3s for 2MB image
  - Server deduplication works (duplicate returns existing asset)
  - 401 error triggers re-auth

  Test:
  - Integration: Upload real image, verify appears in sploot.app library
  - Unit: Mock fetch, test error handling (401, 500, network)

  Dependencies: auth-manager.ts, existing /api/upload endpoint

  Time: 2h
  ```

- [ ] Implement notification feedback (Background Service Worker)
  ```
  File: sploot-extension/entrypoints/background/notifications.ts

  Interface:
  export function showSuccessNotification(filename: string): void
  export function showErrorNotification(error: string): void

  Implementation:
  - chrome.notifications.create() with icon, title, message
  - Success: "Saved to Sploot" with thumbnail preview
  - Error: Clear message + "Retry" button (Phase 2)

  Pattern:
  ```typescript
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon-128.png'),
    title: 'Saved to Sploot',
    message: filename,
    priority: 1
  });
  ```

  Success:
  - Notification appears immediately after upload
  - Auto-dismisses after 5s
  - Works on all platforms (Mac, Windows, Linux)

  Test: Manual testing, verify notification UX

  Dependencies: notifications permission in manifest

  Time: 1h
  ```

### Integration & Testing

- [ ] End-to-end flow testing (Phase 1 acceptance)
  ```
  Test Scenarios:
  1. Fresh install → Login → Right-click image → Upload → Success notification
  2. Existing sploot.app session → Install extension → Auto-authenticated
  3. Right-click on Twitter image → Save → Appears in sploot.app library
  4. Duplicate image → Server returns existing asset (no duplicate upload)
  5. Network error → Error notification shown
  6. 401 error (expired token) → Re-auth triggered

  Sites to Test (CORS + CSP variety):
  - Twitter (twitter.com, x.com)
  - Reddit (reddit.com)
  - Discord (discord.com - requires login)
  - Imgur (imgur.com)
  - GitHub (github.com)
  - Wikipedia (wikipedia.org)

  Success:
  - Upload completes <3s on all sites
  - No CORS errors in console
  - Duplicate detection works

  Test Strategy: Manual testing checklist, no automated tests yet

  Time: 3-4h (iterative debugging)
  ```

---

## Phase 2: Crop Tool + Offline Queue (Week 2)

### Visual Crop Overlay

- [ ] Implement crop-overlay.tsx (Content Script)
  ```
  File: sploot-extension/entrypoints/content/crop-overlay.tsx

  Interface (React Component):
  export function CropOverlay({ onCapture, onCancel }: Props)

  Props:
  - onCapture: (blob: Blob) => void
  - onCancel: () => void

  Hidden Implementation:
  - Semi-transparent overlay (rgba(0,0,0,0.5))
  - Draggable selection rectangle (mouse down → drag → mouse up)
  - Coordinate math: Account for page scroll (window.scrollY)
  - ESC key → onCancel(), Enter key → onCapture()
  - chrome.tabs.captureVisibleTab() → Crop canvas to selection
  - Shadow DOM for CSS isolation (prevent site styles from breaking overlay)

  Pattern: Similar to existing screenshot extensions (Awesome Screenshot)
  Research: Web search found "Crop It!" extension pattern

  UI State Machine:
  1. Idle → Mouse down → Dragging
  2. Dragging → Mouse up → Selection Ready
  3. Selection Ready → Enter → Capturing → Done
  4. Any state → ESC → Cancelled

  Success:
  - Overlay appears in <100ms
  - Drag creates visible rectangle
  - Enter captures selection and uploads
  - Works on complex sites (Twitter, Reddit)

  Test:
  - Manual: Activate on various sites, test drag UX
  - Unit: Mock canvas operations, test coordinate math

  Dependencies: tabs permission, React in content script

  Time: 6-8h (includes UX iteration)
  ```

- [ ] Register keyboard shortcut (Background Service Worker)
  ```
  File: sploot-extension/entrypoints/background/commands.ts

  Implementation:
  - chrome.commands.onCommand listener for "capture-screenshot"
  - Inject crop-overlay.tsx into active tab
  - Pass message to content script: { type: 'SHOW_CROP_OVERLAY' }

  Pattern:
  ```typescript
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'capture-screenshot') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_CROP_OVERLAY' });
    }
  });
  ```

  Success:
  - Cmd+Shift+S (Mac) / Ctrl+Shift+S (Windows) shows overlay
  - Works on any tab
  - Doesn't conflict with browser shortcuts

  Test: Manual testing on Mac + Windows

  Dependencies: crop-overlay.tsx implemented

  Time: 1-2h
  ```

- [ ] Implement screenshot capture and crop logic
  ```
  File: sploot-extension/shared/screenshot.ts

  Interface:
  export async function captureAndCrop(bounds: SelectionBounds): Promise<Blob>

  interface SelectionBounds {
    x: number; y: number; width: number; height: number;
  }

  Hidden Implementation:
  - chrome.tabs.captureVisibleTab({ format: 'png' }) → dataUrl
  - Load dataUrl into Image element
  - Create canvas with selection dimensions
  - ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height)
  - canvas.toBlob() → Blob with type 'image/png'

  Success:
  - Cropped image matches user selection
  - Image quality good (no pixelation)
  - Works on high-DPI displays (devicePixelRatio)

  Test:
  - Integration: Capture various selections, verify crop accuracy
  - Unit: Mock canvas operations

  Dependencies: tabs permission (activeTab)

  Time: 3-4h
  ```

### Offline Upload Queue

- [ ] Implement upload-queue.ts (Background Service Worker)
  ```
  File: sploot-extension/entrypoints/background/upload-queue.ts

  Interface:
  export async function queueUpload(blob: Blob, metadata: ImageMetadata): Promise<string>
  export async function getPendingCount(): Promise<number>
  export async function processQueue(): Promise<void>

  Hidden Implementation:
  - IndexedDB schema (reuse pattern from lib/upload-queue.ts):
    - id, blob, filename, mimeType, size, addedAt, status, retryCount, error
  - Auto-retry: Exponential backoff (1s, 2s, 4s), max 3 attempts
  - Network detection: navigator.onLine event listener
  - Background Sync API: self.registration.sync.register('upload-queue')
  - Storage quota: Warn at 80%, auto-cleanup >7 days old

  Pattern: Directly port lib/upload-queue.ts logic to extension context

  Success:
  - Failed upload automatically queues
  - Offline → online transition triggers retry
  - Badge shows pending count
  - Old uploads auto-cleaned

  Test:
  - Integration: Disconnect network, save image, reconnect, verify auto-upload
  - Unit: Mock IndexedDB, test retry logic

  Dependencies: idb library (pnpm add idb)

  Time: 4-5h
  ```

- [ ] Implement badge counter (Background Service Worker)
  ```
  File: sploot-extension/entrypoints/background/badge.ts

  Interface:
  export function updateBadge(count: number): void

  Implementation:
  - chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
  - chrome.action.setBadgeBackgroundColor({ color: '#7C5CFF' }) (Sploot violet)
  - Update on queue changes: after queueUpload(), after processQueue()

  Success:
  - Badge shows "3" when 3 uploads pending
  - Badge clears when queue empty
  - Color matches Sploot brand

  Test: Manual testing, queue uploads while offline

  Dependencies: upload-queue.ts

  Time: 30min
  ```

- [ ] Background Sync API integration
  ```
  File: sploot-extension/entrypoints/background/sync.ts

  Implementation:
  - Register sync tag: await self.registration.sync.register('upload-queue')
  - Sync event listener: self.addEventListener('sync', handleSync)
  - handleSync: Call processQueue() if tag matches

  Pattern:
  ```typescript
  self.addEventListener('sync', (event) => {
    if (event.tag === 'upload-queue') {
      event.waitUntil(processQueue());
    }
  });
  ```

  Success:
  - Offline uploads sync when browser detects network
  - Works even if extension popup closed

  Test: Offline → queue uploads → close extension → go online → verify uploads

  Dependencies: Service worker registration

  Time: 2h
  ```

---

## Phase 3: Polish + Chrome Web Store (Week 3)

### Popup UI

- [ ] Build popup.tsx (React)
  ```
  File: sploot-extension/entrypoints/popup/App.tsx

  Components:
  - AuthButton: Login/logout + user avatar
  - UploadStatus: Recent uploads list + pending queue
  - QuickActions: Capture screenshot button, settings link

  UI Layout:
  - Header: Logo + user avatar
  - Body: Upload history (last 10) with thumbnails
  - Footer: Pending queue count + "View Library" link

  Design: Reuse Sploot design tokens (--color-primary-violet, etc.)

  Success:
  - Shows authenticated user
  - Lists recent uploads (cached in chrome.storage.local)
  - Shows pending queue count with "View Queue" link
  - Opens sploot.app/app on "View Library" click

  Test: Manual testing, verify all UI states (logged in/out, empty/populated)

  Dependencies: React, Tailwind CSS via WXT

  Time: 4-5h
  ```

- [ ] Implement upload history cache
  ```
  File: sploot-extension/shared/upload-cache.ts

  Interface:
  export async function cacheUpload(upload: CachedUpload): Promise<void>
  export async function getRecentUploads(limit: number): Promise<CachedUpload[]>

  interface CachedUpload {
    assetId: string;
    filename: string;
    thumbnailUrl: string;
    uploadedAt: number;
  }

  Implementation:
  - chrome.storage.local.set/get
  - Max 50 cached uploads (LRU eviction)
  - Used by popup to show recent uploads without API call

  Success:
  - Popup loads instantly (no API delay)
  - Shows last 10 uploads

  Test: Upload multiple images, verify cache population

  Dependencies: None

  Time: 1-2h
  ```

### Extension Icons & Branding

- [ ] Design extension icons
  ```
  Icons Needed:
  - icon-16.png (toolbar)
  - icon-32.png (chrome://extensions)
  - icon-48.png (extensions manager)
  - icon-128.png (Chrome Web Store)

  Design:
  - Violet gradient (Sploot brand color #7C5CFF)
  - Simple "S" logomark or sploot icon
  - SVG → PNG export at multiple sizes

  Tool: Figma or script (scripts/generate-icons.js pattern)

  Success:
  - Icons look crisp on retina displays
  - Match Sploot web app branding
  - Recognizable at 16px

  Test: Load extension, verify icons in toolbar + extensions page

  Dependencies: Design assets or generation script

  Time: 2-3h (design iteration)
  ```

### Error Handling & Sentry

- [ ] Add Sentry integration
  ```
  File: sploot-extension/shared/sentry.ts

  Setup:
  - @sentry/browser for content scripts + popup
  - @sentry/browser (service worker context) for background
  - Sentry.init() in each context with existing SENTRY_DSN
  - User context: setUser({ id: clerkUserId, email })
  - Custom context: source: 'chrome-extension'

  Pattern: Match existing sentry.client.config.ts patterns

  Success:
  - Errors from extension appear in Sentry dashboard
  - Tagged with chrome-extension source
  - User context includes Clerk user ID

  Test: Trigger error, verify appears in Sentry

  Dependencies: @sentry/browser, SENTRY_DSN env var

  Time: 2-3h
  ```

- [ ] Improve error messages and recovery
  ```
  Error Scenarios:
  1. Network error → "Upload failed. Added to queue, will retry when online"
  2. 401 Unauthorized → "Session expired. Click to login again" (trigger re-auth)
  3. 413 Payload Too Large → "Image too large (max 10MB). Try a smaller image"
  4. Unknown error → "Something went wrong. Retry?" (with retry button)

  Implementation:
  - Map API error codes to user-friendly messages
  - Add retry buttons to error notifications
  - Log full error to Sentry, show friendly message to user

  Success:
  - All errors have clear recovery path
  - No raw error messages shown (no "NetworkError: CORS")

  Test: Trigger each error scenario, verify message + recovery

  Dependencies: notifications.ts

  Time: 2-3h
  ```

### Chrome Web Store Submission

- [ ] Create Chrome Web Store listing
  ```
  Assets Needed:
  - Screenshots (1280x800): Show right-click save + crop tool
  - Promotional tile (440x280): Sploot branding
  - Description (max 132 chars): "Save memes from any website to your Sploot library with one click"
  - Detailed description: Feature list, privacy policy link
  - Privacy policy URL: sploot.app/privacy

  Category: Productivity

  Success:
  - Listing looks professional
  - Screenshots show key features
  - Description clear and compelling

  Test: Preview listing in Chrome Web Store Developer Dashboard

  Dependencies: Chrome Web Store developer account ($5 one-time)

  Time: 3-4h (writing + screenshot creation)
  ```

- [ ] Production build and submission
  ```
  Steps:
  1. Update version in wxt.config.ts (1.0.0)
  2. Build production: pnpm build
  3. Test production build locally (load .output/chrome-mv3/)
  4. Create zip: pnpm zip
  5. Upload to Chrome Web Store Developer Dashboard
  6. Submit for review (1-3 days)

  Pre-submission Checklist:
  - All permissions justified in description
  - Privacy policy published at sploot.app/privacy
  - No console errors or warnings
  - Tested on Mac + Windows Chrome
  - Sentry configured for production

  Success:
  - Extension approved by Chrome Web Store
  - Published and installable via chrome.google.com/webstore

  Test: Install from store, verify functionality identical to dev build

  Dependencies: All features complete

  Time: 2-3h (submission process + waiting)
  ```

- [ ] Create demo video
  ```
  Script (30 seconds):
  1. Browse Twitter/Reddit (3s)
  2. Right-click image → "Save to Sploot" (3s)
  3. Notification "Saved to Sploot" (2s)
  4. Open sploot.app → image appears in library (4s)
  5. Press Cmd+Shift+S → crop overlay (3s)
  6. Drag selection → capture (3s)
  7. Search for saved meme → results (3s)
  8. End card: "Add to Sploot" logo + install link (4s)

  Tool: ScreenFlow, QuickTime + iMovie, or Loom

  Success:
  - Shows both capture methods (right-click + crop)
  - Demonstrates key value prop (<2s save time)
  - Professional quality (no stutters)

  Test: Share with 3-5 people, get feedback

  Dependencies: Extension working in production

  Time: 3-4h (recording + editing)
  ```

---

## Design Iteration Checkpoints

### After Phase 1 (Day 5)
- Review: Is Clerk WebSSO working smoothly? Fallback needed?
- Review: Are CORS issues handled on all tested sites?
- Review: Does upload flow feel <2s? Where's latency?
- Decision: Proceed to Phase 2 or iterate on auth/upload

### After Phase 2 (Day 10)
- Review: Is crop tool UX intuitive? Do users discover it?
- Review: Does offline queue handle all failure modes?
- Review: Is badge counter useful or distracting?
- Decision: Proceed to Phase 3 or iterate on crop/queue

### After Phase 3 (Day 15)
- Review: Does extension feel like "native Sploot"?
- Review: Are error messages clear? Recovery paths obvious?
- Review: Is Chrome Web Store listing compelling?
- Decision: Submit or iterate on polish

---

## Out of Scope (Defer to Post-Launch)

**These are valuable but not needed for MVP:**

- Firefox/Safari ports (WXT makes this easy post-launch)
- Bulk selection (select multiple images at once)
- Tag input during save (conflicts with quick-save philosophy)
- Custom keyboard shortcuts (use browser default Ctrl+Shift+S)
- Progress indicators for uploads (most complete <2s)
- Full-page screenshot (crop tool covers this use case)
- In-app tutorial overlay (Chrome Web Store video sufficient)
- Analytics events in extension (rely on server-side upload tracking)
- Settings page (no settings needed for MVP)

Move to BACKLOG.md if requested by users post-launch.

---

## Automation Opportunities

**Repetitive tasks to script:**
1. Extension packaging: `pnpm zip` already exists via WXT
2. Icon generation: Could create script similar to `scripts/generate-icons.js`
3. Screenshot automation: Playwright could capture demo screenshots
4. Version bumping: Script to update wxt.config.ts + package.json versions

**Not worth automating for 3-week project:**
- Chrome Web Store upload (manual process, 1-time)
- Demo video recording (too creative, manual better)
- E2E testing (manual sufficient for MVP, add post-launch)

---

## Success Metrics

**Phase 1 Acceptance**:
- [ ] Right-click any image on Twitter → "Save to Sploot" → Upload completes <3s
- [ ] Duplicate image returns existing asset (no re-upload)
- [ ] Works on 10+ sites (Twitter, Reddit, Discord, Imgur, GitHub, etc.)
- [ ] Logged into sploot.app → Extension auto-authenticates

**Phase 2 Acceptance**:
- [ ] Cmd+Shift+S → Overlay appears <100ms → Drag selection → Upload completes
- [ ] Offline save → queues → online → auto-uploads
- [ ] Badge shows pending count, clears when queue empty

**Phase 3 Acceptance**:
- [ ] Popup shows last 10 uploads with thumbnails
- [ ] All errors have clear recovery (retry, re-auth)
- [ ] Chrome Web Store review approved
- [ ] <5 error reports in first 50 installs (via Sentry)

**Overall Success** (30 days post-launch):
- [ ] 60%+ of weekly active users install extension
- [ ] Extension uploads represent 40%+ of total uploads
- [ ] Average save time <2s (P95)
- [ ] <2% error rate on uploads

---

**Total Estimated Time**: 60-75 hours (15-18 days @ 4-5 hours/day)

**Next Step**: Create feature branch `git checkout -b feat/chrome-extension`
