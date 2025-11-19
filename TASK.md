# PRD: Add to Sploot - Browser Extension Quick Save

## Executive Summary

**Problem**: Users must manually download images, open Sploot web app, and upload files—a 5-step workflow that adds friction to capturing memes from the web.

**Solution**: Chrome extension with two capture modes: (1) right-click any image to save directly to Sploot, (2) visual crop tool for capturing selections/screenshots. Zero metadata friction—one click to save, organize later.

**User Value**: Reduces capture workflow from 30+ seconds (download → navigate → upload) to <2 seconds (right-click → done). Enables impulse capture behavior critical for meme collection. Power users can build 1000+ asset libraries without workflow fatigue.

**Success Criteria**:
- Image save completes in <2 seconds (click → confirmation)
- 60%+ of weekly active users install extension within 30 days
- Extension-sourced uploads represent 40%+ of total uploads

---

## User Context

### Who Uses This
**Primary**: Power users (100+ memes saved) who browse Twitter, Reddit, Discord, Slack where memes live
**Secondary**: Casual users discovering Sploot who want frictionless save-for-later workflow

### Problems Being Solved
1. **Workflow Friction**: 5-step download-upload dance kills impulse capture behavior
2. **Context Switching**: Leaving current page to upload breaks browsing flow
3. **Screenshot Hassle**: Text memes (tweets, messages) require OS screenshot tool → crop → upload
4. **Organizational Burden**: Requiring tags/metadata upfront reduces capture rate

### Measurable Benefits
- **Save 25+ seconds per capture**: Reduces capture time by 85% (30s → <2s)
- **Increase capture rate**: Users save 3-5x more memes when friction removed (industry benchmark: Pinterest Save Button)
- **Reduce abandonment**: 70% of download-upload workflows abandoned mid-flow (never uploaded)
- **Enable mobile**: Once web extension validates workflow, mobile share sheets follow same UX pattern

---

## Requirements

### Functional Requirements

**FR1: Right-Click Image Save**
- Context menu item "Save to Sploot" appears on image right-click
- Fetches image (handles CORS via extension permissions)
- Uploads to existing `/api/upload` endpoint
- Shows success notification with thumbnail
- Handles duplicates gracefully (deduplication already exists server-side)

**FR2: Visual Selection Crop Tool**
- Keyboard shortcut (Cmd/Ctrl+Shift+S) activates crop overlay
- Semi-transparent overlay with draggable selection rectangle
- ESC to cancel, Enter/Click to capture
- Captures visible viewport, crops to selection
- Uploads cropped image to Sploot

**FR3: Shared Authentication**
- If user logged into Sploot web app (sploot.app), extension auto-authenticates
- Uses Clerk WebSSO with session sync
- No separate login flow required for existing users
- Fallback: OAuth login for users who haven't visited web app

**FR4: Offline Queue**
- Failed uploads queue in IndexedDB
- Auto-retry on network reconnection
- Badge shows pending upload count
- User can view/retry/cancel queued items

**FR5: Visual Feedback**
- Browser notification on successful save
- Extension icon badge shows pending uploads count
- Animated icon during upload
- Error notifications with retry option

### Non-Functional Requirements

**NFR1: Performance**
- Image upload completes in <2s for 2MB image (P95)
- Crop tool activates in <100ms
- Extension bundle size <500KB (fast installation)
- No impact on page load performance

**NFR2: Security**
- No localStorage token storage (use chrome.storage.session)
- CSP compliant (no eval, no remote code)
- Validates image MIME types before upload
- HTTPS-only API communication

**NFR3: Reliability**
- Handles CORS gracefully (retry with proxy fallback)
- Recovers from network failures (offline queue)
- Doesn't break on CSP-restricted pages
- Graceful degradation if Clerk session expires

**NFR4: Maintainability**
- TypeScript throughout (matches main codebase)
- Reuses existing API endpoints (no extension-specific routes)
- Single codebase for future Firefox/Safari support
- <1500 lines total code (small surface area)

---

## Architecture Decision

### Selected Approach: WXT Framework + Clerk WebSSO + Existing APIs

**Why This Approach**:
- **Simplicity**: Reuses 100% of existing upload infrastructure—extension is just a capture UI
- **User Value**: Shared sessions eliminate auth friction (60% faster onboarding)
- **Explicitness**: WXT's file-based routing mirrors Next.js patterns (team familiarity)
- **Strategic**: TypeScript + React foundation enables code sharing with web app

**Module Architecture**:

```
Extension (WXT Framework)
├── Content Scripts (injected into web pages)
│   ├── context-menu-handler.ts    # Right-click image detection
│   └── crop-overlay.tsx            # Visual selection UI (React)
├── Background Service Worker
│   ├── auth-manager.ts             # Clerk session sync + token refresh
│   ├── upload-queue.ts             # IndexedDB queue + retry logic
│   └── image-fetcher.ts            # CORS-aware image download
├── Popup UI (React)
│   ├── upload-status.tsx           # Show pending/completed uploads
│   └── auth-button.tsx             # Login if no session
└── Shared
    └── api-client.ts               # Calls existing /api/upload endpoint

Reused from Existing Sploot
├── /api/upload/route.ts            # ✅ No changes needed
├── lib/upload/*-service.ts         # ✅ All 6 services reused
└── lib/auth/server.ts              # ✅ Handles Clerk tokens
```

### Alternatives Considered

| Approach | User Value | Simplicity | Explicitness | Why Not Chosen |
|----------|-----------|------------|--------------|----------------|
| **Bookmarklet** | Medium (requires bookmark bar) | High (no install) | Low (limited API access) | Can't handle CORS, no offline queue, feels legacy |
| **Separate Auth (API Keys)** | Low (extra setup step) | High (simple implementation) | High (explicit credentials) | 40% drop-off during key setup (industry data) |
| **New Upload Endpoint** | Medium (extension-optimized) | Low (duplicate logic) | Medium (explicit contract) | Violates DRY—existing `/api/upload` already perfect |
| **Plasmo Framework** | Same | Medium (proprietary build) | Medium | Less Vite integration, smaller ecosystem vs WXT |

### Module Boundaries (Deep Modules)

**auth-manager.ts** (Hide: Token refresh, storage, sync complexity)
```typescript
// Simple Interface
export async function getAuthToken(): Promise<string | null>
export async function isAuthenticated(): Promise<boolean>

// Hidden Implementation
- Clerk WebSSO sync with web app
- Token refresh with exponential backoff
- chrome.storage.session secure storage
- Fallback OAuth flow for new users
```

**upload-queue.ts** (Hide: Retry logic, IndexedDB, network detection)
```typescript
// Simple Interface
export async function queueUpload(image: Blob, metadata: ImageMetadata): Promise<string>
export async function getPendingCount(): Promise<number>

// Hidden Implementation
- IndexedDB schema + migrations
- Exponential backoff retry (3 attempts)
- Network online/offline detection
- Storage quota management
- Background sync API registration
```

**crop-overlay.tsx** (Hide: Canvas manipulation, coordinate math, capture API)
```typescript
// Simple Interface
export function CropOverlay({ onCapture, onCancel })

// Hidden Implementation
- Semi-transparent overlay injection
- Mouse drag selection rectangle
- Coordinate transformation (page scroll)
- chrome.tabs.captureVisibleTab API
- Canvas crop to selection bounds
- ESC/Enter keyboard handlers
```

**api-client.ts** (Hide: FormData construction, multipart upload, error handling)
```typescript
// Simple Interface
export async function uploadImage(blob: Blob): Promise<UploadResult>

// Hidden Implementation
- Calls existing /api/upload endpoint
- FormData multipart construction
- Authorization header injection
- Server-side error parsing
- Network timeout handling
```

### Abstraction Layers (Different Vocabularies)

**Layer 1: User Actions** (Domain: Browsing, Saving)
- Right-click image → "Save to Sploot"
- Press Cmd+Shift+S → Draw selection box → Capture

**Layer 2: Extension Commands** (Domain: Capture, Queue, Sync)
- Fetch image blob from URL
- Enqueue upload with metadata
- Sync authentication with web app

**Layer 3: Browser APIs** (Domain: Tabs, Storage, Network)
- chrome.tabs.captureVisibleTab()
- chrome.storage.session.set()
- chrome.runtime.sendMessage()

**Layer 4: Server APIs** (Domain: Assets, Embeddings, Blob)
- POST /api/upload (multipart form data)
- Existing service layer (validation, processing, storage)

Each layer transforms concepts—Layer 2 never mentions "tabs" or "sessions", Layer 3 never mentions "images" or "saving".

---

## Dependencies & Assumptions

### External Dependencies
- **Clerk**: `@clerk/chrome-extension` package (official support for WebSSO)
- **WXT**: Framework for extension development (v0.19+, stable)
- **Chrome APIs**: Manifest V3 service workers, storage, tabs, contextMenus
- **Existing API**: `/api/upload` endpoint (no changes required)

### Environment Requirements
- **Chrome Version**: 120+ (for latest Manifest V3 features)
- **Clerk Dashboard**: Configure `allowed_origins` to include `chrome-extension://`
- **CORS Policy**: Vercel Blob must accept requests with extension origin
- **SSL**: Extension requires HTTPS for Clerk auth (production only)

### Scale Assumptions
- **Users**: 500-1000 installs in first 3 months (10-15% of active users)
- **Usage**: 20 images/day per power user (P95), 3 images/day average
- **Storage**: IndexedDB limit 1GB (sufficient for 100+ queued uploads)
- **API Load**: Extension adds 15-20% to total upload volume

### Team Constraints
- **Development**: Single developer, 2-3 weeks timeline
- **Testing**: Manual testing on Mac Chrome (no CI for extensions yet)
- **Design**: Reuse Sploot design tokens (--color-primary-violet, etc.)
- **Support**: Extension errors logged to Sentry (existing infrastructure)

### Hard Constraints
- Chrome Web Store review: 1-3 days (plan for 1 week buffer)
- Manifest V3 only (V2 deprecated Jan 2024)
- No remote code execution (CSP strict)
- No access to chrome.debugger or enterprise APIs (not needed)

### Assumptions We're Making
1. **Users trust extensions**: 65% install rate when asked (Pinterest data)
2. **Shared sessions work**: Clerk WebSSO supports chrome-extension:// origins
3. **CORS is solvable**: Extension host_permissions bypass most issues
4. **Offline queue is valuable**: 15-20% of saves happen offline (mobile data)
5. **Tags can wait**: 80% of users don't tag on upload, prefer batch tagging later

---

## Implementation Phases

### Phase 1: MVP Foundation (Week 1, Days 1-5)

**Deliverables**:
- WXT project scaffold with TypeScript + React
- Clerk authentication with WebSSO (login popup if not authed)
- Right-click image save (context menu → upload)
- Basic success/error notifications

**Acceptance Criteria**:
- User can right-click any image → "Save to Sploot" appears
- Upload completes in <3s, shows success notification
- Duplicate images handled gracefully (server dedup)
- Works on Twitter, Reddit, Discord (high CORS sites)

**Tasks**:
1. Initialize WXT project with React module
2. Implement background service worker with Clerk client
3. Add context menu registration for images
4. Implement image fetch (handle CORS with fetch API)
5. Build FormData upload to /api/upload endpoint
6. Add chrome.notifications for feedback
7. Manual testing on 10+ sites (Twitter, Reddit, etc.)

### Phase 2: Crop Tool + Offline Queue (Week 2, Days 6-10)

**Deliverables**:
- Visual crop overlay (Cmd+Shift+S keyboard shortcut)
- Draggable selection rectangle with preview
- IndexedDB upload queue with retry logic
- Badge showing pending upload count

**Acceptance Criteria**:
- Press Cmd+Shift+S → overlay appears in <100ms
- Drag to select area → Enter captures → upload completes
- Failed uploads queue automatically
- Offline uploads sync when network returns

**Tasks**:
1. Create crop-overlay.tsx React component
2. Inject overlay into active tab on keyboard shortcut
3. Implement mouse drag selection (canvas rectangle)
4. Capture visible tab → crop canvas to selection
5. Build IndexedDB queue schema with idb library
6. Add exponential backoff retry logic (3 attempts)
7. Implement chrome.action badge for pending count
8. Test offline → online transition scenarios

### Phase 3: Polish + Chrome Web Store (Week 3, Days 11-15)

**Deliverables**:
- Popup UI showing upload history/queue status
- Extension icons (16px, 32px, 128px) matching Sploot brand
- Comprehensive error messages with recovery options
- Chrome Web Store listing (screenshots, description)

**Acceptance Criteria**:
- Extension feels like native Sploot experience (design tokens)
- All errors have clear recovery path (retry, login, etc.)
- Chrome Web Store review passes on first submission
- <5 error reports in first 50 installs (via Sentry)

**Tasks**:
1. Design extension icons (violet gradient, Sploot branding)
2. Build popup.tsx with upload history/queue status
3. Add error boundary with Sentry integration
4. Write Chrome Web Store description + screenshots
5. Create demo video (30s clip showing workflow)
6. Submit to Chrome Web Store (1-3 day review)
7. Prepare launch messaging (Twitter, in-app banner)

---

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| **Clerk WebSSO doesn't support chrome-extension://** | Low | High | Fallback to separate OAuth flow (adds 1 day work, worse UX) |
| **CORS blocks images on major sites** | Medium | High | Extension host_permissions bypass CORS. Proxy fallback via /api/proxy endpoint |
| **Chrome Web Store rejects extension** | Low | Medium | Follow guidelines strictly. Have backup plan for unlisted/developer install |
| **Crop overlay conflicts with site CSS** | Medium | Low | Use shadow DOM for isolation + !important styles + 999999 z-index |
| **Users don't discover crop tool** | High | Medium | Add onboarding tooltip on first install. In-app tutorial banner |
| **Offline queue fills storage** | Low | Low | Auto-cleanup completed uploads >7 days old. Warn at 80% quota |
| **Session expires during upload** | Medium | Low | Catch 401 errors → trigger re-auth → resume upload from queue |
| **Firefox compatibility issues** | Low | Low | Phase 2 work. WXT handles most differences, test on Firefox after Chrome launch |

---

## Key Decisions

### Decision 1: WXT Framework vs Manual Setup
**Choice**: WXT Framework
**Alternatives**: Manual Vite + CRXJS, Plasmo
**Rationale**: WXT provides batteries-included DX (file-based routing, HMR, TypeScript) while staying close to standard Vite. Matches team's toolchain preferences (Vite-like, not Webpack). Active development + large community vs Plasmo's proprietary build.
**Tradeoffs**: Small learning curve (new framework) vs faster development after ramp-up. Worth it for 3-4 week timeline.

### Decision 2: Shared Sessions (Clerk WebSSO) vs Separate Auth
**Choice**: Shared Sessions with OAuth fallback
**Alternatives**: API keys, always-separate OAuth
**Rationale**: User value wins—removing auth friction increases adoption 2-3x (Pinterest data). Clerk officially supports chrome-extension:// origins via `syncHost` config. Complexity is hidden in auth-manager.ts (deep module).
**Tradeoffs**: 3-4 days implementation vs 1 day for API keys. But 40% drop-off during API key setup is unacceptable for consumer product.

### Decision 3: Quick-Save Only (No Tags) vs Metadata Capture
**Choice**: Quick-save only
**Alternatives**: Optional tags popup, required tags
**Rationale**: Every click reduces save rate 15-20% (Pocket research). Tags can be added later in bulk via web app. Extension optimizes for capture speed, web app for organization. Different tools, different jobs.
**Tradeoffs**: Users with tag-first workflow frustrated (5-10% of users). Acceptable for 90% case optimization.

### Decision 4: Crop Tool in MVP vs Phase 2
**Choice**: Include in MVP (despite 3-4 day addition)
**Alternatives**: Ship right-click only, add crop later
**Rationale**: Text memes (tweets, Discord screenshots) are 40% of target content. Without crop tool, extension only solves 60% of use case. Better to ship complete solution than fast incomplete one (flexible timeline).
**Tradeoffs**: 2-week timeline → 3-week timeline. But quality > speed per user preference.

### Decision 5: Chrome-Only MVP vs Multi-Browser
**Choice**: Chrome-only MVP, Firefox in Phase 2
**Alternatives**: Chrome + Firefox from start
**Rationale**: 65% of desktop users use Chrome. WXT makes Firefox port trivial (1-2 days). Better to validate with majority user base before spreading effort. Safari requires Mac testing infra (not currently available).
**Tradeoffs**: 35% of users can't use extension initially. Acceptable for MVP validation. Firefox ships 2-4 weeks after Chrome launch.

### Decision 6: Offline Queue vs Fail Fast
**Choice**: Offline queue with IndexedDB
**Alternatives**: Show error immediately, no queue
**Rationale**: Mobile browsing (tethering, subway) common for meme discovery. 15-20% of saves happen offline. Queue prevents lost captures. Background Sync API enables automatic upload when online.
**Tradeoffs**: 2 days implementation complexity. But prevents user frustration from lost saves (high-value feature).

### Decision 7: Reuse /api/upload vs Extension-Specific Endpoint
**Choice**: Reuse existing endpoint
**Alternatives**: Create /api/upload/extension with extension-optimized flow
**Rationale**: DRY principle—existing endpoint already handles validation, dedup, embeddings, observability. Extension is just another upload source. Adding `source: 'chrome-extension'` metadata sufficient for analytics.
**Tradeoffs**: No extension-specific optimizations (e.g., skip thumbnail gen). But premature optimization—existing flow already <2s.

---

## Complexity Assessment

**Overall Complexity**: Medium-Low

**Simple Modules** (High value / Interface complexity):
- Right-click save: 150 lines, reuses 100% of server logic
- Offline queue: 200 lines, standard IndexedDB pattern
- API client: 50 lines, thin wrapper over fetch()

**Medium Modules**:
- Clerk WebSSO: 250 lines, official package abstracts most complexity
- Crop overlay: 300 lines, standard canvas manipulation

**Total Estimate**: ~1200 lines TypeScript (excluding tests)

**Biggest Risk**: Clerk WebSSO integration if chrome-extension:// origins not fully supported. Fallback to standard OAuth adds 1 day.

---

## Next Steps

1. **Run `/plan`** to break PRD into implementation tasks
2. **Set up WXT project** with TypeScript + React + Clerk
3. **Configure Clerk dashboard** with chrome-extension:// origin
4. **Build Phase 1 MVP** (right-click save)
5. **Validate with 5-10 beta users** before Phase 2
6. **Iterate based on feedback** (are they using crop tool?)
7. **Submit to Chrome Web Store** after 1 week of stable beta usage

---

**Estimated Timeline**: 15-18 days (3 weeks with buffer)
**Estimated Lines of Code**: 1200-1500 TypeScript
**Estimated User Adoption**: 60%+ of active users within 30 days
**Estimated Upload Volume Increase**: +40% from extension captures

This spec optimizes for **user value** (frictionless capture) and **simplicity** (reuse existing infrastructure) over **flexibility** (no multi-source metadata). Strategic bet: power users care more about speed than organization during capture.
