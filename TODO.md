# TODO: Chrome Extension - Add to Sploot

## Status

**Phase 1 MVP**: ✅ Complete (2025-11-08)
- Implementation: `/Users/phaedrus/Development/sploot-extension/`
- Documentation: See extension repo (TESTING.md, SUMMARY.md, ARCHITECTURE.md)
- Next: Manual testing required (Clerk configuration + test checklist)

**Phase 2**: Pending Phase 1 validation
**Phase 3**: Pending Phase 2 completion

---

## Architecture Summary

**Pattern**: WXT Framework + Clerk WebSSO + Reuse `/api/upload`
**Location**: Separate repository (not monorepo - see extension/ARCHITECTURE.md)
**Timeline**: 3 weeks total (Phase 1: 5 days, Phase 2: 5 days, Phase 3: 5 days)

**Phase 1 Modules Implemented**:
- `auth-manager.ts` - Clerk WebSSO with token caching
- `context-menu.ts` - Right-click "Save to Sploot"
- `image-fetcher.ts` - CORS-aware image downloading
- `api-client.ts` - Upload to existing `/api/upload`
- `notifications.ts` - Success/error feedback
- `popup/App.tsx` - Extension UI

Build: 203KB, TypeScript strict mode, ~1,000 LOC

---

## Phase 1: Validation Required (User Action)

### Prerequisites (Automated Setup)
- [ ] Configure environment
  - Get Clerk keys from dashboard.clerk.com/last-active?path=api-keys
  - Add to `sploot-extension/.env`: `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
  - **Time**: 5 minutes

- [ ] Run automated setup
  - `cd sploot-extension && pnpm generate:crx-key` (generates stable extension ID)
  - `pnpm setup:clerk` (adds extension to Clerk via Backend API)
  - `pnpm build` (build with consistent ID)
  - **Time**: 2 minutes
  - **No manual dashboard configuration required**

### Testing Checklist
- [ ] Load extension in Chrome (`chrome://extensions` → Load unpacked → `.output/chrome-mv3`)
- [ ] Verify extension ID matches output from `pnpm generate:crx-key`
- [ ] Verify no console errors in background service worker
- [ ] Test authentication flow (login to sploot.app → extension auto-authenticates)
- [ ] Right-click save on 10+ sites (Twitter, Reddit, Discord, Imgur, GitHub, Wikipedia, Medium, LinkedIn, Instagram, Slack)
- [ ] Verify upload performance (<3s P95)
- [ ] Test error scenarios (large images >10MB, unauthenticated, network errors)
- [ ] Confirm duplicate detection (same image returns existing asset)

**Acceptance**: All tests pass per `sploot-extension/TESTING.md`
**Time**: 30-45 minutes
**Blockers**: Environment configuration (Clerk keys)

**Decision Point**: Proceed to Phase 2 only after Phase 1 validation succeeds

---

## Phase 2: Crop Tool + Offline Queue (Week 2)

*Deferred until Phase 1 validated*

### Screenshot Capture
- [ ] Implement `crop-overlay.tsx` (Content Script)
  - Semi-transparent overlay with draggable selection
  - Shadow DOM for CSS isolation
  - ESC to cancel, Enter to capture
  - **Time**: 6-8 hours

- [ ] Register `Cmd/Ctrl+Shift+S` keyboard shortcut
  - Inject overlay into active tab
  - **Time**: 1-2 hours

- [ ] Implement `screenshot.ts` capture logic
  - `chrome.tabs.captureVisibleTab()` → crop canvas → Blob
  - Handle devicePixelRatio for retina displays
  - **Time**: 3-4 hours

### Offline Queue
- [ ] Implement `upload-queue.ts` (IndexedDB)
  - Queue failed uploads with exponential backoff (1s, 2s, 4s, max 3 attempts)
  - Auto-retry on network recovery
  - Background Sync API integration
  - **Time**: 4-5 hours

- [ ] Implement badge counter
  - Show pending upload count in extension icon
  - Clear when queue empty
  - **Time**: 30 minutes

**Total Phase 2 Effort**: 16-20 hours
**Review Checkpoint**: Is crop UX intuitive? Does offline queue handle all failure modes?

---

## Phase 3: Polish + Chrome Web Store (Week 3)

*Deferred until Phase 2 complete*

### UI Enhancement
- [ ] Enhanced popup UI
  - Upload history (last 10 with thumbnails)
  - Cached in chrome.storage.local (LRU eviction)
  - **Time**: 5-7 hours

### Error Handling
- [ ] Add Sentry integration (@sentry/browser)
  - Tag errors with `chrome-extension` source
  - Include Clerk user context
  - **Time**: 2-3 hours

- [ ] Improve error messages
  - Map API errors to user-friendly messages
  - Add retry buttons to notifications
  - **Time**: 2-3 hours

### Branding & Publishing
- [ ] Design extension icons (16px, 32px, 48px, 128px)
  - Violet gradient matching Sploot brand
  - **Time**: 2-3 hours

- [ ] Chrome Web Store listing
  - Screenshots (1280x800)
  - Description + privacy policy
  - **Time**: 3-4 hours

- [ ] Demo video (30 seconds)
  - Right-click save + crop tool workflow
  - **Time**: 3-4 hours

- [ ] Submit to Chrome Web Store
  - Production build + test
  - Review process (1-3 days)
  - **Time**: 2-3 hours

**Total Phase 3 Effort**: 20-25 hours
**Review Checkpoint**: Does extension feel like "native Sploot"? Is listing compelling?

---

## Success Metrics

**Phase 1 (Current)**:
- ✅ Extension builds successfully (203KB)
- ⏳ Loads without console errors
- ⏳ Right-click save works on 10+ sites
- ⏳ Upload completes <3s (P95)
- ⏳ Images appear in library immediately

**Phase 2**:
- Cmd+Shift+S → overlay <100ms → upload completes
- Offline save queues → online auto-uploads
- Badge shows pending count

**Phase 3**:
- Chrome Web Store review approved
- <5 error reports in first 50 installs

**30 Days Post-Launch**:
- 60%+ weekly active users install extension
- Extension uploads represent 40%+ of total uploads
- <2% upload error rate

---

## Out of Scope (Post-Launch)

- Firefox/Safari ports
- Bulk image selection
- Tag input during save
- Custom keyboard shortcuts
- Progress indicators
- Full-page screenshot
- In-app tutorial
- Analytics events in extension
- Settings page

Move to BACKLOG.md if requested.

---

## Current Blockers

1. **Clerk Configuration**: User must add chrome-extension:// origins
2. **Manual Testing**: Cannot proceed to Phase 2 without Phase 1 validation

## Next Immediate Step

**User Action Required**: Follow `sploot-extension/TESTING.md` to validate Phase 1 MVP
