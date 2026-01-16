# Chrome Web Store Listing

## Extension Name
Sploot - Save Memes Anywhere

## Short Description (132 chars max)
Save memes from any website with one click. AI-powered semantic search finds them instantly in your personal library.

## Detailed Description

### Save memes from anywhere on the web

Sploot is your personal meme library with AI-powered search. Right-click any image and save it to your collection in one click.

**Key Features:**

• **One-Click Save** - Right-click any image on any website and select "Save to Sploot" to instantly add it to your library

• **AI-Powered Search** - Find any meme in seconds using natural language. Search "disappointed drake" or "surprised pikachu" and get instant results

• **Works Everywhere** - Save images from Reddit, Twitter/X, Imgur, Discord, and any website with images

• **Instant Access** - Click the extension icon to quickly access your meme library and search

• **Secure & Private** - Your memes are stored securely in your personal account

**How it works:**

1. Install the extension and sign in with your Sploot account
2. Browse the web as usual
3. When you see a meme you want to save, right-click and select "Save to Sploot"
4. Find your memes instantly with AI-powered semantic search at sploot.app

**Perfect for:**
- Meme enthusiasts who save images across multiple platforms
- Social media managers who need quick access to reaction images
- Anyone tired of scrolling through camera roll to find that one meme

Visit sploot.app to create your free account and start building your meme library today!

## Category
Social & Communication

## Language
English

## Website
https://www.sploot.app

## Privacy Policy URL
https://www.sploot.app/privacy

## Support URL
https://www.sploot.app/support

---

## Screenshots Required

Chrome Web Store requires at least 1 screenshot (1280x800 or 640x400).
Recommended: 3-5 screenshots showing key features.

### Screenshot 1: Context Menu
- Show right-click menu on an image with "Save to Sploot" option
- Capture on a site like imgur.com or reddit.com
- **NOTE: Must be captured manually** (native browser UI)

### Screenshot 2: Extension Popup (Signed Out)
- Show the popup with sign-in prompt
- **NOTE: Must be captured manually** (extension UI)

### Screenshot 3: Extension Popup (Signed In)
- Show the popup with "View Library" option
- **NOTE: Must be captured manually** (extension UI)

### Screenshot 4: Sploot Library
- Show the library with memes and search functionality
- Can be captured from sploot.app when signed in

### Screenshot 5: Search Results
- Show AI-powered search finding memes
- Can be captured from sploot.app when signed in

---

## Promotional Images (Optional but Recommended)

### Small Promo Tile (440x280)
- Logo + tagline: "Your Personal Meme Library"

### Large Promo Tile (920x680)
- Feature showcase with screenshots

### Marquee Promo Tile (1400x560)
- Hero image for featured placement

---

## Additional Store Information

### Single Purpose
Save images from any website to Sploot personal meme library with AI-powered search.

### Permissions Justification

**contextMenus**: Required to add "Save to Sploot" to right-click menu on images

**storage**: Required to maintain authentication state across browser sessions

**notifications**: Required to show success/error feedback when saving images

**Host Permissions**:
- `https://www.sploot.app/*`: Required to upload saved images to user's library
- `https://clerk.sploot.app/*`: Required for secure authentication via Clerk

### Data Usage
- Images are uploaded to user's private Sploot library (stored on Vercel Blob)
- Authentication handled by Clerk (industry-standard auth provider)
- No browsing data is collected or transmitted
- No analytics or tracking beyond standard auth flow

---

## Build Information

**Package Location:** `dist/extension-1.0.0-chrome.zip` (1.41 MB)
**Version:** 1.0.0
**Manifest Version:** 3

To rebuild:
```bash
pnpm zip:prod
```
