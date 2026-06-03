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
Just for Fun
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

This command must pass before release closure. It validates the package SHA,
production manifest shape, Web Store visual assets, and the current submission
status recorded below.

## Authenticated Chrome QA

Checked on 2026-05-18 and 2026-05-22 with Google Chrome profile
`Phaedrus (Phaedrus @ Home)`.

Latest check on 2026-05-26 with Computer Use and the same Chrome profile:

- Baseline-resolved the existing production database schema and applied the
  pending `20250929_add_blob_url_validation`,
  `20260518_add_asset_shuffle_key`, and `20260518_add_storage_quota`
  migrations after production `/api/stats` showed
  `public.user_storage_quotas` was missing.
- Rebuilt the production unpacked extension and zip with the live Clerk
  publishable key sanitized from the Vercel production env file.
- Verified the active unpacked QA extension
  `chrome-extension://hikefmnilgapfckjmillbhcocihjffhn` loads from
  `/Users/phaedrus/.codex/worktrees/5075/sploot/apps/extension/dist/chrome-mv3`.
- Saved a unique local image through Chrome's real image context menu. The
  production Sploot library showed `Last upload: 2026-05-26T14:14:59Z`,
  `MEMES: 3,021`, `SIZE: 12.6 MB`, and first asset
  `user_35AWEm3dlfbKS0eWeQTRHAMlUA0/1779804899669-tp2wukz.png`.
- Repeated `Save to Sploot` on the same image after fixing extension duplicate
  response handling. The production library stayed at `MEMES: 3,021`, queue
  `0`, and the same first asset, proving the duplicate path does not add a
  second asset.
- Private local QA screenshots were captured but are intentionally not committed
  because this repository is public and the screenshots show the signed-in
  production library.
- Uploaded the corrected
  `apps/extension/dist/extension-1.0.0-chrome.zip` to Chrome Web Store draft
  item `fbhkflbcnllfogefckablkafjknmcfnd` and saved the draft.
- Current draft evidence screenshot:
  `.spellbook/evidence/cws-updated-package-submit-enabled-20260526.png`.
- Submitted the item for Chrome Web Store review. Google showed the `Pending
  Review` receipt and the item header now records `Status: Pending review`.
- Submission evidence screenshots:
  `.spellbook/evidence/cws-submitted-pending-review-20260526.png`,
  `.spellbook/evidence/cws-submitted-status-20260526.png`.

Previous check on 2026-05-25 with Computer Use and the same Chrome profile:

- Rebuilt the production extension zip from this worktree with the existing
  public live Clerk publishable key.
- Uploaded `apps/extension/dist/extension-1.0.0-chrome.zip` to the Chrome Web
  Store Developer Dashboard and created draft item
  `fbhkflbcnllfogefckablkafjknmcfnd`.
- Package page recorded version `1.0.0`, item type `Extension`, permissions
  `storage`, `tabs`, `contextMenus`, `notifications`, `cookies`, and host
  permissions.
- Store listing fields, icon, screenshot, small promo tile, homepage URL,
  support URL, language, category, and mature-content setting were saved.
- Privacy page disclosures, permission justifications, remote-code answer,
  data usage categories, certifications, and privacy policy URL were saved.
- Evidence screenshot:
  `.spellbook/evidence/cws-privacy-submit-enabled-20260525.png`.
- Re-uploaded the rebuilt `dfbf3b4e...` zip to the same draft after restoring
  the production-shaped unpacked bundle.
- Current draft evidence screenshot:
  `.spellbook/evidence/cws-current-package-submit-enabled-20260525.png`.
- The dashboard enabled `Submit for review`; it was not clicked because final
  review submission needs action-time confirmation.
- The Web Store draft ID is now the production Chrome extension ID that must be
  allowed by Clerk/backend auth:
  `chrome-extension://fbhkflbcnllfogefckablkafjknmcfnd`.
- The active unpacked QA extension ID
  `chrome-extension://hikefmnilgapfckjmillbhcocihjffhn` and Web Store draft ID
  `chrome-extension://fbhkflbcnllfogefckablkafjknmcfnd` are both included in
  the web API's default Clerk authorized parties.
- Production deploy `dpl_Dc6S9wEDe6xtnDyBMU2sJfg5fxFe`
  (`https://sploot-om9xryqr7-misty-step.vercel.app`) is live behind
  `https://www.sploot.app`, and deployed smoke passed after the auth-origin
  change.
- UI upload proof is paused because Computer Use cannot see Chrome while macOS
  is locked (`cgWindowNotFound`); do not treat right-click upload or duplicate
  behavior as release-proven until the Mac is unlocked and the real Chrome flow
  is captured.

Latest check on 2026-05-24 with Computer Use and the same Chrome profile:

- Production `https://sploot.app/app` is signed in as the saved Sploot account
  after Proton Pass autofill.
- The production library renders `MEMES: 3,020` and `SIZE: 11.4 MB`.
- Chrome Web Store Developer Dashboard reauthentication succeeded for publisher
  `phaedrus`.
- Publisher item list contains `Trump Goggles`, `Bitcoin Price Tag`, `Time Is
  Money`, and `Quack`; no existing Sploot item is present.
- The dashboard reaches the `Add new item` dialog and is ready for a ZIP/CRX
  upload.
- Uploading `apps/extension/dist/extension-1.0.0-chrome.zip` to Google and
  selecting `Save to Sploot` from a public image context menu are the remaining
  action-time confirmation boundaries.

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

Earlier failed or superseded evidence:

- Selecting `Save to Sploot` on `https://www.sploot.app/apple-icon.png` did
  not produce visible success feedback in the popup or increase the library
  count from `3,020`; this was superseded by the 2026-05-26 production upload
  proof.
- On 2026-05-22, reloaded the unpacked production-like build from this worktree:
  `/Users/phaedrus/.codex/worktrees/5075/sploot/apps/extension/dist/chrome-mv3`.
  Chrome's extension detail page shows source `apps/extension/dist/chrome-mv3`,
  version `1.0.0`, size `4.9 MB`, enabled state `On`, site access `On all
  sites`, and `Allow access to file URLs` enabled.
- After loading the current worktree build, the Sploot extension popup and
  `https://sploot.app/app` both show the signed-out Clerk screen. Authenticated
  upload and duplicate QA now require a fresh login before they can be treated
  as release evidence.
- The production extension build and zip were rerun from this worktree with the
  existing public `pk_live_*` Clerk publishable key already embedded in the
  release artifact.

## Release Artifact

Current release artifact, rebuilt on 2026-05-26:

```text
Path: apps/extension/dist/extension-1.0.0-chrome.zip
Version: 1.0.0
Size: 1.66 MB
SHA256: a73c2996fd8fd102a0802da221832ebd1fddefe4e76c579183ae8a03ded0191f
Chrome Web Store draft item: fbhkflbcnllfogefckablkafjknmcfnd
Dashboard receipt: .spellbook/evidence/cws-privacy-submit-enabled-20260525.png
Current draft receipt: .spellbook/evidence/cws-updated-package-submit-enabled-20260526.png
```

Build commands:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_* pnpm --filter extension build:prod:unpacked
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

Status: submitted for review.

Review status:

- Chrome Web Store draft item `fbhkflbcnllfogefckablkafjknmcfnd` exists with
  current package SHA256
  `a73c2996fd8fd102a0802da221832ebd1fddefe4e76c579183ae8a03ded0191f`,
  listing, assets, and privacy disclosures saved.
- Google reports `Pending review`; review may take up to a few business days.
- The review was submitted with automatic publication enabled after approval.

Rollback/disable plan:

- If the submitted extension causes production issues, disable or unpublish
  version `1.0.0` from the Chrome Web Store developer dashboard.
- Keep `https://www.sploot.app` deployed and healthy; extension upload failures
  should return typed API errors and user-visible notifications.
- Rebuild and submit a patched version after passing deployed smoke and real
  Chrome extension upload QA.
