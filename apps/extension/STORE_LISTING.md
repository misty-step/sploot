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
Required to cache extension auth state, durable save jobs, and upload status across browser sessions.
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

**activeTab**

```text
Required to capture the visible tab only after the user invokes the Sploot popup action. This temporary grant avoids requesting file: or ftp: host access.
```

**Host permission: `*://*/*`**

```text
Required so the extension can offer "Save to Sploot" on images from arbitrary websites the user visits. The extension only captures or uploads after the user explicitly chooses a Sploot action. Screenshot capture is limited to visible http(s) pages; Chrome, extension, file, ftp, data, and view-source pages are rejected.
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

- User-selected images are uploaded to the user's private Sploot meme library.
- Authentication is handled by Clerk.
- The extension does not collect or transmit browsing history.
- Only images explicitly selected by the user through the context menu are sent to Sploot.
- Search logs and product analytics are described in the privacy policy.

## Visual Assets

Required before submission:

- Store icon: `apps/extension/public/icon-128.png`
- Screenshot: `apps/extension/store-assets/screenshots/01-context-menu-save-to-sploot-1280x800.png`
- Small promo tile: `apps/extension/store-assets/promo/small-promo-440x280.png`

Current status: one non-sensitive context-menu screenshot is present and validates at `1280x800`; the small promo tile is present and validates at `440x280`.

## Release Provenance

This checked-in file is listing copy only. It intentionally contains no fixed
artifact digest, Chrome Web Store submission receipt, dashboard status, signed-in
device evidence, or deployed-environment claim. Those values become stale when
the candidate changes and must not be treated as release proof.

The release gate builds the candidate zip, computes its SHA256, and writes a
provenance record containing both that digest and the exact checked-out commit.
CI supplies the event candidate SHA and fails if it differs from the checked-out
source. The zip and generated provenance record are uploaded together as the
release artifact. No Web Store submission is claimed here.

Gate:

```bash
pnpm --filter extension zip:prod
pnpm --filter extension release:structural
```

## Operator-only evidence before submission

The operator must independently capture, for the exact CI provenance record:

- authenticated right-click save and duplicate behavior in a real Chrome profile;
- the Chrome Web Store package page after upload, if submission is authorized;
- any submit/review receipt, only after an operator explicitly performs that action.

Until then:

```text
Status: not submitted.
```

The strict `release:check` gate consumes an operator-created JSON packet via
`RELEASE_OPERATOR_EVIDENCE_PATH`; it does not generate or accept a self-attested
pass. The packet must bind the exact source, ZIP, version, extension ID, and
Web Store item, and carry independently captured proof references for
authenticated right-click/save, the 409 duplicate, library visibility,
sign-out, the Web Store receipt, and installation. Each proof must repeat the
same `candidateSha`, `artifactSha256`, `version`, and `extensionId` binding.
The packet schema is versioned and every proof names a local relative artifact
with a SHA-256, byte length, MIME type, capture timestamp, and machine metadata;
the validator reads and hashes those files, rejects path escapes/schemes,
future or stale timestamps, invalid Chrome IDs, and Web Store origin/item/status
drift. Operator approval is a separate record from the independent provider
verification record and cannot substitute for either. CI intentionally remains
red with the typed `external-evidence-missing` verdict until a real operator
supplies this packet.
