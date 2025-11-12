Hey Phaedrus — I dug into both attachments and then cross‑checked Clerk’s most recent guidance for Chrome extensions and Next.js. Below is a complete diagnosis and a menu of working paths (simple tweaks → rebuilds). I’ll also include concrete code you can drop in to get unblocked.

---

## TL;DR

* **Your extension already gets a Clerk session token** (via `clerk.session.getToken()` in the background worker) and sends it as `Authorization: Bearer <token>` to `/api/upload`.
* **Your Next.js API handlers currently call `auth()`/`getAuth()`** (via `requireUserIdWithSync()`), which read **cookies** by default — not the `Authorization` header your extension is sending. That mismatch produces 401s and the “auth pain.”
* The **minimal, durable fix** is to verify the Bearer session token in your route handlers using Clerk’s **`authenticateRequest()`** (or `verifyToken()`), **not** `auth()`. That’s the path Clerk recommends for authenticating cross‑origin/API calls with session tokens. ([Clerk][1])

I’ll show the exact patches below.

---

## What you already have (and what’s good)

**Extension architecture** (WXT + React)

* Popup uses `<ClerkProvider><SignIn/></ClerkProvider>` → inline sign‑in within the extension. No SSO/OAuth redirect flows (which Chrome popups don’t support).  ([Clerk][2])
* Background uses `createClerkClient()` on demand (fresh each call) and pulls `session.getToken()`; uploads use that token as Bearer to your API.
* You’ve already automated **allowed origins** for Clerk (adds `chrome-extension://<ID>`), and you create a stable CRX ID. Great hygiene.

**Web app** (Next.js 15 App Router)

* Most API routes use `requireUserIdWithSync()` → under the hood it calls `@clerk/nextjs/server`’s `auth()` + current user, and syncs to DB. This is perfect for cookie‑authenticated browser traffic.
* `/api/upload` (and related routes) enforce auth up front and have CORS preflight configured to allow `Authorization` headers.

**Where it breaks in practice**
Your extension **isn’t cookie‑same‑origin** with the web app; it’s cross‑origin (`chrome-extension://…`). Clerk’s `auth()` helper won’t see the token from `Authorization: Bearer …`. You need to explicitly verify that Bearer token on the server. This is exactly the “make API requests with session tokens” scenario Clerk documents for backends. ([Clerk][1])

---

## Option 1 (Recommended): Verify the Bearer token in your API routes

**What changes:**
Replace `requireUserIdWithSync()` in routes the extension calls (e.g., `/api/upload`) with Clerk’s **`authenticateRequest()`** (preferred) or **`verifyToken()`** against the **Authorization header**. This accepts the short‑lived **Clerk session token** your background worker already sends. ([Clerk][1])

**Why this works best**

* Uses the session token you already mint (`session.getToken()`).
* No cookie shenanigans; cross‑origin safe.
* Standard Clerk guidance for “request authentication” from SDK clients. ([Clerk][3])

### Drop‑in patch (App Router route handler)

```ts
// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';

// helper to read the Bearer token (optional with authenticateRequest, but handy elsewhere)
function getBearer(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // 1) Authenticate the request using the Authorization header (or cookies)
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY!,         // required
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, // optional
  });

  // authenticateRequest() extracts from Authorization OR cookies automatically
  const { isSignedIn, toAuth, sessionClaims, debug } = await clerk.authenticateRequest(req, {
    // Strongly recommended to protect against CSRF; include both web + extension origins
    authorizedParties: [
      'https://sploot.app',
      'https://www.sploot.app',
      'chrome-extension://<YOUR_EXTENSION_ID>',
      'http://localhost:3000',
    ],
    // Optional: networkless verification if you set CLERK_JWT_KEY
    // jwtKey: process.env.CLERK_JWT_KEY,
    acceptsToken: 'session_token', // explicit for clarity
  });

  if (!isSignedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = sessionClaims?.sub ?? (await toAuth()).userId; // both ways covered

  // ... now proceed with your existing logic, using `userId`
  // (Your current code starts by doing requireUserIdWithSync(); replace that with `userId`.)
}
```

**Where to update today**

* `/api/upload` (direct upload) currently calls `requireUserIdWithSync()` — replace as shown.
* If your extension will call other endpoints (e.g., `/api/upload/check`, `/api/assets`, tag routes), convert those to `authenticateRequest()` too.

**Why not keep using `auth()`?**
`auth()` is optimized for **cookie** sessions (browser pages). Your extension is sending a **header** token. Clerk recommends verifying the token with the backend SDK (`authenticateRequest` or `verifyToken`) for this case. ([Clerk][1])

> Reference: Clerk’s Chrome extension docs explicitly outline supported auth options and the need to sync or pass tokens; OAuth/SAML aren’t supported in popup flows, which matches your inline popup design. ([Clerk][2])

---

## Option 2: Keep `auth()` but switch the extension to **Sync Host** (WebSSO)

**What changes:**
Use the Clerk Chrome Extension SDK’s **Sync Host** mode so the extension reads the same session as your web app (cookie‑based). The background worker would do:

```ts
// background/auth-manager.ts
const clerk = await createClerkClient({
  publishableKey: PUBLISHABLE_KEY,
  syncHost: 'https://sploot.app', // or https://www.sploot.app - be consistent
});
```

…and then continue calling your API without custom header verification (your `auth()` usage on the server will work because the extension and website share the session). ([Clerk][4])

**Caveats**

* You must keep **origins and domains perfectly aligned** (apex vs `www`) and ensure the extension’s origin is allowed in Clerk. Your repo already highlights this as a foot-gun and includes scripts to configure allowed origins.
* Historically, WebSSO was sensitive to cookie settings and scheme/domain mismatches. You already experienced some of this, and your notes emphasize “fresh client every time” to avoid stale cookie sync.

**When to choose Sync Host**
If you want a single login (web) to automatically sign the extension, and you don’t care about popup login inside the extension; or if you need Google/Apple OAuth (popups can’t do OAuth; Sync Host can). ([Clerk][2])

---

## Option 3: **Hybrid** — Inline sign‑in in popup **plus** server verifies header (Option 1)

This is effectively what you started: let users sign into the extension itself (no dependency on an open web tab), issue a session token with `getToken()`, and the server always verifies header. This is my **recommended** long‑term path because it’s robust against cookie/host quirks and doesn’t need a web tab open.  ([Clerk][3])

---

## Option 4: **Handshake from the website** using Clerk **Sign‑in Tokens** (no Clerk in the extension)

**What changes:**
Remove Clerk from the extension. When the user clicks “Connect extension” (in the web app), your server creates a short‑lived **sign‑in token** and opens a tab to a page that exchanges that token for an **extension‑scoped token** (your own JWT). You pass it back to the extension via `externally_connectable` messaging and store it.

* Create one‑time sign‑in token: Clerk Backend API `createSignInToken`. ([Clerk][5])
* Add `"externally_connectable"` in `manifest.json` so `https://sploot.app` can message your extension. ([MDN Web Docs][6])
* From that point, your extension uses **your** short‑lived API tokens (minted by your backend after verifying the Clerk user server‑side) — completely bypassing Clerk inside the extension.

**Pros/cons**

* **Pro:** No Clerk UI in the extension, no popup limitations, no origin whitelisting beyond messaging.
* **Con:** More custom code and a small token service on your backend.

---

## Option 5: **Chrome Identity API + OAuth (PKCE)** to your own auth server (Clerk optional)

If you ever decide to rebuild auth from scratch for the extension, Chrome’s `launchWebAuthFlow` lets you run a first‑class OAuth flow with redirect to `https://<EXT_ID>.chromiumapp.org/*` and catch the final redirect in the extension. ([Chrome for Developers][7])

* You can still use Clerk as the IdP if you insert your backend as the OAuth client (server‑side) and exchange for your own API tokens.
* This is a **bigger lift** and unnecessary unless you need full IdP OAuth in the extension.

---

## Exact reasons your current setup 401s (root cause)

* Extension **sends Bearer token** correctly.
* Server **expects cookie sessions** (`requireUserIdWithSync()` → `auth()`), which **does not look** at `Authorization` by default. Therefore the request is “unauthorized.”
* Clerk’s backend docs say: **authenticate the session token on the server** (`authenticateRequest` or `verifyToken`) for cross‑origin/API calls — which is what you’re doing. Add that and it works. ([Clerk][1])

---

## Concrete patch set (copy/paste)

1. **Add a tiny verifier helper** you can reuse:

```ts
// lib/auth/verify-bearer.ts
import { NextRequest } from 'next/server';
import { createClerkClient } from '@clerk/backend';

export async function verifyBearerOrThrow(req: NextRequest) {
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY!,
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });

  const { isSignedIn, sessionClaims, toAuth } = await clerk.authenticateRequest(req, {
    authorizedParties: [
      'https://sploot.app',
      'https://www.sploot.app',
      'chrome-extension://<YOUR_EXTENSION_ID>',
      'http://localhost:3000',
    ],
    acceptsToken: 'session_token',
    // jwtKey: process.env.CLERK_JWT_KEY, // optional networkless verify
  });

  if (!isSignedIn) throw new Error('Unauthorized');

  // Prefer claims.sub; fall back to toAuth()
  return sessionClaims?.sub ?? (await toAuth()).userId;
}
```

2. **Change routes the extension hits** (e.g., `/api/upload`) to call that helper instead of `requireUserIdWithSync()`. Minimal invasive diff:

```diff
- import { requireUserIdWithSync } from '@/lib/auth/server';
+ import { verifyBearerOrThrow } from '@/lib/auth/verify-bearer';

async function postHandler(req: NextRequest) {
  const startTime = Date.now();
  try {
-   const userId = await requireUserIdWithSync();
+   const userId = await verifyBearerOrThrow(req);
    // ...rest unchanged...
```

This aligns the auth model for **API calls** while keeping `auth()` for **browser pages**.

**Note:** You’ve already configured CORS preflight to allow `Authorization` headers in `/api/upload/check`. Keep that across all extension‑facing routes.

---

## Extension-side guardrails (quick checklist)

* Keep creating a **fresh Clerk client** in background before each token read (you already do).
* Ensure both **Clerk publishable key** and **API base URL** match environment (test vs prod) — your `shared/env.ts` infers and warns; keep using that.
* Make sure your **manifest host_permissions** include Clerk’s domain (accounts.dev for test, custom domain for prod) and your API base URL. You’ve already wired this in WXT config.
* **Allowed origins in Clerk** must include your web domains and the **extension origin** (`chrome-extension://<ID>`). You automated this with `pnpm setup:clerk`.

---

## If you want OAuth (Google/Apple) in the extension popup

Clerk’s docs are explicit: **OAuth/SAML aren’t supported in popups/side panel** because they require redirects. Use **Sync Host** (Option 2) and sign in on the web app (where OAuth is allowed), then the extension will be signed in, too. ([Clerk][2])

---

## Tradeoffs and when to choose what

| Path                                  | Works with popup?    | Supports OAuth? | Complexity | Notes                                                      |
| ------------------------------------- | -------------------- | --------------: | ---------: | ---------------------------------------------------------- |
| **Option 1/3: Verify Bearer in API**  | ✅                    |       ❌ (popup) |        Low | Most robust. Keep inline sign‑in. Recommended.             |
| **Option 2: Sync Host**               | ➖ (popup not needed) |               ✅ |     Medium | Share cookies; watch domain/`www` and extension ID config. |
| **Option 4: Sign‑in token handshake** | ✅ (no Clerk UI)      |      ✅ (on web) |     Medium | Clean separation; custom token service.                    |
| **Option 5: Chrome Identity OAuth**   | ✅                    |               ✅ |       High | Only if you want your own OAuth; bigger rebuild.           |

---

## Smoke test steps after the patch

1. Build extension for the same environment as the site (your `WXT_MODE` + `.env.production` guidance is good).
2. In the extension popup, sign in (Email OTP/password/passkeys — supported in popup). ([Clerk][2])
3. Right‑click image → **Save to Sploot**. The background should:

   * `getToken()` → attach `Authorization: Bearer <token>`
   * `/api/upload` should accept it and return 200/201.
4. If you still see a 401, log the **`authenticateRequest().debug`** payload on the server to confirm azp/origin mismatch; add/adjust `authorizedParties`. ([Clerk][1])

---

## Bonus hardening & nice-to-haves

* **Networkless verification**: Add `CLERK_JWT_KEY` and pass `jwtKey` to `authenticateRequest()` for **no external JWKS fetch** per request. (Faster and resilient.) ([Clerk][1])
* **JWT templates** (optional): If later you want fine‑grained scopes/audience claims, define a **JWT template** in Clerk and call `session.getToken({ template: 'sploot' })`. Server verifies with `verifyToken` and checks custom claims. ([Clerk][8])
* **Clerk features in popup**: Stick to Email+OTP / Password / Passkeys in popup (OAuth is unsupported there). ([Clerk][2])
* **Diagnostics button**: Your popup already has “Dump Auth Diagnostics”. Consider adding a server endpoint `/api/auth/debug` that simply echoes the verified `userId` using `authenticateRequest()` so you can validate end‑to‑end quickly.

---

## Why I’m confident this solves it

* Your extension is already **minting** the right token and **sending** it correctly.
* Clerk’s official guidance is to **verify session tokens in the backend** for cross‑origin clients (exactly your case). ([Clerk][3])
* The only missing link was server‑side **verification of `Authorization`**, not cookies.

If you want, I can also draft the exact diffs across all extension‑facing routes (upload, tags, assets) in one patch, but the snippet above is the core change.

---

### Sources (key external references)

* Clerk Chrome Extension SDK (auth modes, features table; OAuth not supported in popup/side panel). Updated Nov 5, 2025. ([Clerk][2])
* `authenticateRequest()` (JS Backend SDK) for verifying session tokens; authorized parties & networkless verification. ([Clerk][1])
* Clerk docs on authenticating SDK requests with short‑lived **session tokens**. ([Clerk][3])
* JWT Templates / `getToken({ template })` if you later want custom claims. ([Clerk][8])
* Chrome Identity OAuth and externally_connectable messaging (for alternatives). ([Chrome for Developers][7])

### Citations to your files

* Extension background auth + API client (Bearer token usage).
* Popup’s inline Clerk sign‑in.
* Scripts for CRX stability and Clerk allowed origins.
* Web app routes using `requireUserIdWithSync()` / `auth()`.

---

## Recommended move

**Adopt Option 1/3 now:** keep your nice inline sign‑in in the popup, and switch API routes to verify the Bearer token using `authenticateRequest()`. It’s a small, targeted change that aligns perfectly with Clerk’s recommended pattern for SDK clients and eliminates the cookie vs header mismatch that’s been causing you grief.

[1]: https://clerk.com/docs/reference/backend/authenticate-request "SDK Reference: authenticateRequest()"
[2]: https://clerk.com/docs/reference/chrome-extension/overview "SDK Reference: Clerk Chrome Extension SDK"
[3]: https://clerk.com/docs/guides/development/making-requests?utm_source=chatgpt.com "Development: Request authentication"
[4]: https://clerk.com/docs/reference/chrome-extension/create-clerk-client "SDK Reference: createClerkClient()"
[5]: https://clerk.com/docs/reference/backend/sign-in-tokens/create-sign-in-token?utm_source=chatgpt.com "SDK Reference: createSignInToken()"
[6]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/externally_connectable?utm_source=chatgpt.com "externally_connectable - Mozilla - MDN Web Docs"
[7]: https://developer.chrome.com/docs/extensions/how-to/integrate/oauth?utm_source=chatgpt.com "OAuth 2.0: authenticate users with Google | Chrome Extensions"
[8]: https://clerk.com/docs/guides/sessions/jwt-templates?utm_source=chatgpt.com "Session management: JWT templates"

