# Save to Sploot — iPhone Share-Sheet Shortcut

> This walkthrough is also published where users can actually find it:
> `/help/ios-shortcut` on the live product, linked from Settings and the
> Getting Started guide (`/help`). This file is the source copy for
> repo/operator reference — keep both in sync if you edit either.

iOS (WebKit) does not implement the Web Share Target API, so an installed Sploot
PWA can never appear in the iPhone share sheet the way it does on Android. The
sanctioned workaround is an **Apple Shortcut**: it can sit in the share sheet,
accept an image, and make an authenticated HTTP request.

Shortcuts can't carry your Clerk login, so they authenticate with a **personal
upload token** instead — a credential that can *only* upload to your library
(never read or delete it).

## 1. Mint an upload token

1. Open Sploot → **Settings** → **Upload tokens**.
2. Name it (e.g. `iphone`) and tap **mint token**.
3. Copy the `splt_…` value. **It is shown only once.** If you lose it, revoke it
   and mint a new one.

## 2. Build the Shortcut

In the **Shortcuts** app, create a new shortcut with these actions:

1. **Get Contents of URL**
   - **URL:** `https://www.sploot.app/api/upload`
   - **Method:** `POST`
   - **Headers:** add one — `Authorization` = `Bearer splt_…` (your token, with
     the word `Bearer` and a space before it).
   - **Request Body:** `Form`
   - Add a form field:
     - **Key:** `file`
     - **Type:** `File`
     - **Value:** `Shortcut Input` (the shared image)
2. (Optional) **Show Result** / **Show Notification** of the response so you get
   a "saved" confirmation.

Then open the shortcut's settings (the ⓘ / share icon):

- Turn on **Show in Share Sheet**.
- Under **Share Sheet Types**, accept **Images** (and **Media** if you want to
  share from Photos).
- Name it **Save to Sploot**.

## 3. Use it

From any app, tap **Share → Save to Sploot**. The image lands in your library.

Sploot deduplicates by content hash, so re-sharing the same image is harmless —
it returns the existing asset rather than creating a duplicate.

## Responses the Shortcut may see

| Status | Meaning |
|---|---|
| `201` | Saved. Response includes the new `asset`. |
| `409` | Already in your library (duplicate). The existing `asset` is returned. |
| `401` | `{"error":"Unauthorized"}` — token missing, mistyped, or revoked. |
| `403` | `code: "quota_exceeded"` — you're out of storage. |
| `413` | The image is larger than the upload limit. |
| `503` | `code: "uploads_disabled"` — uploads are temporarily paused. |

## Security

- The token is **upload-only**: presenting it to any read or delete endpoint
  returns `401`. It cannot list, view, or remove your memes.
- Only a hash of the token is stored server-side; the plaintext is shown once.
- If a token leaks (lost phone, shared screenshot), open **Settings → Upload
  tokens** and **revoke** it. Revocation is immediate.
- "Last used" is shown per token so you can spot one that's being used
  unexpectedly.

## Sharing your shortcut (optional)

Apple shortcuts are device-signed, so a ready-made `.shortcut` file can only be
produced and shared from an Apple device. If you want to share your build with
someone else, open the shortcut → **Share → Copy iCloud Link** and send that.
Each person still mints and pastes their **own** token; never share a token.
