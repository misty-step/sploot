# Chrome Web Store Submission Packet

Canonical submission packet for Sploot extension version `1.0.0`.

## Listing Fields

**Extension name**

```text
Sploot - Meme Library & AI Search
```

**Summary**

```text
Save memes from any site with one click. Find them instantly using AI semantic search. Your private meme library.
```

**Category**

```text
Fun
```

**Language**

```text
English
```

**Homepage URL**

```text
https://www.sploot.app
```

**Support URL**

```text
https://www.sploot.app/support
```

**Privacy policy URL**

```text
https://www.sploot.app/privacy
```

**Mature content**

```text
No
```

## Detailed Description

```text
Stop scrolling forever. Find any meme in seconds.

Sploot is your personal meme library with AI-powered semantic search. Save any image from any website with one click, then search your collection using natural language. No more digging through camera rolls, downloads folders, or random desktop piles.

How it works:

- Right-click any image and choose "Save to Sploot"
- Images sync to your private library at www.sploot.app
- Search with natural language like "cat with sunglasses" or "confused guy meme"
- AI semantic search helps find the exact reaction image you meant

Key features:

- One-click saving from websites with image context menus
- AI-powered search for your private meme collection
- Fast access from the extension popup
- Private library by default, with public links only when you choose to share
- Secure account access through Clerk

Perfect for:

- Meme collectors who keep losing the perfect reaction image
- Social media managers who need fast access to visual references
- Content creators building a searchable image library
- Anyone tired of scrolling through thousands of unorganized images

Privacy:

- No ads
- No browsing history tracking
- Only the image you choose to save is uploaded
- Images are stored securely in your Sploot account
- Search logs and product analytics are described in the privacy policy

Get started:

1. Install the extension
2. Sign in to Sploot
3. Right-click any meme and choose "Save to Sploot"
4. Visit www.sploot.app to search your library

Free to start.

Support: https://www.sploot.app/support
Privacy Policy: https://www.sploot.app/privacy
```

## Single Purpose

```text
Save user-selected images from websites to the user's private Sploot meme library for AI-powered search.
```

## Permission Justifications

**contextMenus**

```text
Required to add the "Save to Sploot" option to image right-click menus.
```

**storage**

```text
Required to cache extension auth state and upload status across browser sessions.
```

**notifications**

```text
Required to show success and error feedback after the user saves an image.
```

**cookies**

```text
Required to sync the user's Clerk session between the Sploot web app and the extension.
```

**tabs**

```text
Required to open the Sploot library and sign-in pages from extension actions.
```

**Host permission: `*://*/*`**

```text
Required so the extension can offer "Save to Sploot" on images from arbitrary websites the user visits. The extension only uploads an image after the user explicitly chooses "Save to Sploot" from the context menu.
```

**Host permission: `https://www.sploot.app/*`**

```text
Required to upload selected images to the user's Sploot library and open the web app.
```

**Host permission: `https://sploot.app/*`**

```text
Required for compatibility with the apex Sploot domain.
```

**Host permission: `https://clerk.sploot.app/*`**

```text
Required for secure Clerk authentication and session synchronization.
```

## Data Usage

- User-selected images are uploaded to the user's private Sploot library.
- Authentication is handled by Clerk.
- The extension does not collect or transmit browsing history.
- Only images explicitly selected by the user through the context menu are sent
  to Sploot.
- Search logs and product analytics are described in the privacy policy.

## Visual Assets

Required before submission:

- Store icon: `apps/extension/public/icon-128.png`
- Screenshots:
  `apps/extension/store-assets/screenshots/01-context-menu-save-to-sploot-1280x800.png`
- Small promo tile: `apps/extension/store-assets/promo/small-promo-440x280.png`

Current status: one non-sensitive context-menu screenshot is present and
validates at `1280x800`; the small promo tile is present and validates at
`440x280`.

Readiness gate:

```bash
pnpm --filter extension release:check
```

This command is expected to fail until authenticated right-click upload/duplicate
QA and the Chrome Web Store dashboard receipt are complete.

## Authenticated Chrome QA

Checked on 2026-05-18 with Google Chrome profile `Phaedrus (Phaedrus @ Home)`.

Passing evidence:

- Sploot extension popup opened from Chrome toolbar at
  `chrome-extension://ipnlamdcakhmbidjlpoinkgimfapejna/popup.html`.
- Popup showed an authenticated Sploot session and rendered `View My Library`
  plus `Sign Out`.
- `View My Library` opened `https://sploot.app/app`.
- Production library rendered signed-in content with `MEMES: 3,020` and
  `SIZE: 11.4 MB`.
- Right-clicking `https://www.sploot.app/apple-icon.png` exposed the
  extension context menu item `Save to Sploot`.

Unproven/requires follow-up before submission:

- Selecting `Save to Sploot` on `https://www.sploot.app/apple-icon.png` did
  not produce visible success feedback in the popup or increase the library
  count from `3,020`; right-click upload is therefore not release-proven.
- Duplicate-save behavior remains unproven because the first save did not
  produce observable success evidence.
- The production extension build could not be rerun in this shell because
  `VITE_CLERK_PUBLISHABLE_KEY` is not present.

## Release Artifact

Built on 2026-05-18:

```text
Path: apps/extension/dist/extension-1.0.0-chrome.zip
Version: 1.0.0
Size: 1.66 MB
SHA256: ee12ad391996b50389a60995296c141af689db1bb75411f5f43ae74e583bb532
```

Build commands:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_* pnpm --filter extension build:prod
VITE_CLERK_PUBLISHABLE_KEY=pk_live_* pnpm --filter extension zip:prod
```

Smoke command:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_* pnpm --filter web smoke:deployed
```

Smoke evidence from `apps/web/docs/deployed-smoke-report.json`:

```text
Target: https://www.sploot.app
Status: pass
Checks: production health, service health, signed-out app route protection,
signed-out API auth contract, production extension zip artifact
Artifact: apps/extension/dist/extension-1.0.0-chrome.zip
```

## Submission Status

Status: not submitted.

Blocking items before submission:

- authenticated production Chrome extension QA is partially complete, but
  right-click upload and duplicate behavior are not release-proven
- production rebuild is blocked until `VITE_CLERK_PUBLISHABLE_KEY=pk_live_*`
  is available in the release shell
- no Chrome Web Store dashboard upload/review receipt has been captured

Rollback/disable plan:

- If the submitted extension causes production issues, disable or unpublish
  version `1.0.0` from the Chrome Web Store developer dashboard.
- Keep `https://www.sploot.app` deployed and healthy; extension upload failures
  should return typed API errors and user-visible notifications.
- Rebuild and submit a patched version after passing deployed smoke and real
  Chrome extension upload QA.
