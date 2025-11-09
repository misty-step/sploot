# Testing Guide - Phase 1 MVP

## Prerequisites

### 1. Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Get credentials from [Clerk Dashboard](https://dashboard.clerk.com/last-active?path=api-keys):

```env
# Chrome Extension CRX ID (auto-generated in next step)
CRX_PUBLIC_KEY=

# Clerk Configuration
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CLERK_SYNC_HOST=https://sploot.app
CLERK_SECRET_KEY=sk_test_...
```

**Note**: You need both **Publishable Key** (for the extension) and **Secret Key** (for automated Clerk configuration).

### 2. Generate Consistent Extension ID

Generate a stable extension ID that won't change between builds:

```bash
pnpm install
pnpm generate:crx-key
```

This creates:
- `.crx-key.pem` - Private key (gitignored, keep secure)
- Updates `.env` with `CRX_PUBLIC_KEY`
- Outputs your extension ID

**Output example**:
```
✅ CRX Key Generation Complete

Extension ID: abcdefghijklmnopqrstuvwxyz123456
Origin: chrome-extension://abcdefghijklmnopqrstuvwxyz123456
```

### 3. Configure Clerk (Automated)

Add your extension ID to Clerk's allowed origins via API:

```bash
pnpm setup:clerk
```

This automatically:
- Fetches current Clerk instance settings
- Adds `chrome-extension://<YOUR_ID>` to allowed origins
- Preserves existing web app origins

**Output example**:
```
✅ Clerk Configuration Complete

Updated allowed_origins:
  - https://sploot.app
  - http://localhost:3000
  - chrome-extension://abcdefghijklmnopqrstuvwxyz123456
```

### 4. Build Extension

```bash
pnpm build
```

## Loading Extension in Chrome

1. Open Chrome
2. Navigate to `chrome://extensions`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select `.output/chrome-mv3` directory
6. Verify Extension ID matches the one from `pnpm generate:crx-key`

**Note**: No manual Clerk configuration needed - `pnpm setup:clerk` already configured the extension origin.

## Test Scenarios

### 1. Extension Loads Successfully
- [ ] Extension appears in `chrome://extensions`
- [ ] No errors in extension console (click "Inspect views: background page")
- [ ] Extension icon appears in toolbar
- [ ] Clicking icon opens popup

### 2. Authentication Flow (Not Logged In)
- [ ] Open extension popup (not logged into sploot.app)
- [ ] Should show "Please login to sploot.app to continue"
- [ ] Click "Open Sploot" button
- [ ] Should open https://sploot.app in new tab
- [ ] Login to sploot.app
- [ ] Return to extension popup
- [ ] Should now show "Ready to save memes!"

### 3. Right-Click Image Save (Authenticated)
- [ ] Login to sploot.app in one tab
- [ ] Navigate to any website with images (e.g., Twitter, Reddit)
- [ ] Right-click on an image
- [ ] "Save to Sploot" option appears in context menu
- [ ] Click "Save to Sploot"
- [ ] Notification appears: "Saved to Sploot" with filename
- [ ] Open sploot.app/app
- [ ] Verify image appears in library

### 4. Error Handling - Unauthenticated Save
- [ ] Logout from sploot.app
- [ ] Right-click image → "Save to Sploot"
- [ ] Should show error: "Please login to sploot.app first"
- [ ] Should open sploot.app in new tab

### 5. Error Handling - Large Image
- [ ] Find image >10MB (or test locally)
- [ ] Right-click → "Save to Sploot"
- [ ] Should show error: "Image too large (max 10MB)"

### 6. Cross-Site CORS Testing
Test on various sites with different CORS policies:

- [ ] **Twitter/X** (twitter.com, x.com) - Strict CORS
- [ ] **Reddit** (reddit.com) - Moderate CORS
- [ ] **Discord** (discord.com) - CDN images
- [ ] **Imgur** (imgur.com) - Image host
- [ ] **GitHub** (github.com) - Tech site
- [ ] **Wikipedia** (wikipedia.org) - Public images
- [ ] **Medium** (medium.com) - Article images
- [ ] **LinkedIn** (linkedin.com) - Profile images
- [ ] **Instagram Web** (instagram.com) - Social media
- [ ] **Slack** (slack.com) - Workspace images

For each site:
- Save at least 2 different images
- Verify filename extraction makes sense
- Check notification appears
- Confirm image in sploot.app library

### 7. Duplicate Detection
- [ ] Save the same image twice
- [ ] Server should return existing asset (no duplicate upload)
- [ ] Success notification still shows
- [ ] Only one copy in library

### 8. Notification Click
- [ ] Save an image
- [ ] Click the success notification
- [ ] Should open sploot.app/app in new tab
- [ ] Notification should dismiss

### 9. Popup UI States
- [ ] **Loading**: Brief "Loading..." on popup open
- [ ] **Unauthenticated**: Login prompt + "Open Sploot" button
- [ ] **Authenticated**: "Ready to save memes!" + "View Library" button
- [ ] Click "View Library" → opens sploot.app/app

### 10. Extension Background Console
Open background service worker console:
1. `chrome://extensions` → Extension → "Inspect views: background page"
2. Check console for:
   - [ ] No errors on load
   - [ ] "Sploot extension initialized successfully"
   - [ ] Auth messages when checking authentication
   - [ ] Fetch/upload logs when saving images
   - [ ] No unhandled promise rejections

## Performance Validation

### Upload Speed
- [ ] 100KB image: <1s
- [ ] 1MB image: <2s
- [ ] 5MB image: <3s
- [ ] 10MB image: ~5s (approaching limit)

### Notification Timing
- [ ] Success notification appears within 500ms of upload complete
- [ ] Error notification appears immediately on failure

### Memory Usage
- [ ] Check `chrome://extensions` → Extension → "Inspect views: background page" → Memory
- [ ] Background worker: <50MB after 20 uploads
- [ ] No memory leaks (stable after multiple saves)

## Known Limitations (Phase 1 MVP)

✅ **Expected Behavior:**
- No offline queue (fails if network down)
- No tag input (saves without tags)
- No progress indicator (immediate success/error)
- No crop tool (Phase 2)
- Chrome only (no Firefox/Safari yet)
- Requires sploot.app login (no separate OAuth yet)

## Troubleshooting

### "Please login to sploot.app first" error
1. Ensure you're logged into sploot.app in any Chrome tab
2. Refresh extension popup
3. Verify Clerk configuration: `pnpm setup:clerk` (re-run if needed)
4. Check extension ID matches: Compare output from `pnpm generate:crx-key` with `chrome://extensions`

### Extension not appearing in toolbar
1. Check `chrome://extensions` → Extension is enabled
2. Click puzzle icon → pin "Add to Sploot"

### Images not saving
1. Check background console for errors
2. Verify network tab shows POST to /api/upload
3. Check sploot.app is running and accessible
4. Verify auth token in request headers

### Build errors
```bash
# Clean rebuild
rm -rf .output .wxt node_modules
pnpm install
pnpm build
```

## Success Criteria

Phase 1 MVP is successful when:
- ✅ Extension loads without errors
- ✅ Authentication works via sploot.app session
- ✅ Right-click save works on 10+ sites
- ✅ Upload completes in <3s (P95)
- ✅ Notifications show success/error clearly
- ✅ Images appear in sploot.app library
- ✅ No console errors during normal use

## Next Phase

After Phase 1 validation:
- **Phase 2**: Crop tool + offline queue + badge counter
- **Phase 3**: Polish + Sentry + Chrome Web Store

Report issues to: GitHub repository or via sploot.app feedback
