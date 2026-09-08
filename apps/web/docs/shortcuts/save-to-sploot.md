# Save to Sploot — iPhone Share-Sheet Shortcut

## Release status

**Unsigned workflow source exists; an installable iPhone integration is not
accepted.** Apple signing and real iPhone saved/duplicate/failure verification
have not been performed. There is no verified iCloud install link to publish.

- [Unsigned workflow source](../../../server/internal/web/static/shortcuts/save-to-sploot.unsigned.shortcut)
- [Packaging and Apple-signing script](../../../server/scripts/shortcut-release.py)
- The Go candidate serves that source at
  `/static/shortcuts/save-to-sploot.unsigned.shortcut`, linked from its Settings
  page as **Shortcut source — Apple signing required**. It is not an install link.

The deployed Next.js predecessor's `/help/ios-shortcut` page describes manual
action assembly. That legacy walkthrough is not proof of a packaged release,
nor is it the generated workflow's source. The Go candidate is not a production
cutover; keep hosted and candidate behavior distinct.

iPhone does not offer the PWA Web Share Target behavior used on supported
Android browsers. The candidate integration uses Apple Shortcuts to accept
shared media and call Sploot's existing authenticated save API.

## Personal token scope and storage

Existing account holders create a token in `/app/settings` under **Upload
tokens** in the predecessor or **Personal access tokens** in the Go candidate.
Name it for the phone, copy the `splt_…` plaintext shown once, and revoke/remint
if it is lost. Closed enrollment is unchanged; the Shortcut does not create an
account or confer new enrollment.

The token permits **save and search**, not only upload:

- `POST /api/upload` saves bytes.
- `POST /api/upload/url` saves a direct media URL.
- `POST /api/search` can return matching library assets.
- It cannot authenticate library listing, direct asset-management APIs,
  export, deletion, or token-management requests.

Only a hash is stored by Sploot. The workflow source, however, deliberately
stores the phone's plaintext credential in
**iCloud Drive/Shortcuts/sploot-upload-token.txt**, not Keychain. Anyone able
to read that file can save and search as its owner. First setup explains this
and asks for a token. Running the workflow without shared input offers
**Replace token**, media selection, a direct URL, or opening the library.
Replace the stored token after revoking an exposed credential in Sploot.

Never distribute a personal token, the token file, an authenticated screenshot,
or a workflow with a credential embedded in its actions. Each person uses their
own token. See [PUBLIC_API.md](../PUBLIC_API.md) for the maintained external
save/search contract.

## Package the source

From the repository root, with Python 3 and no third-party Python dependencies:

```bash
python3 apps/server/scripts/shortcut-release.py \
  --output-dir /tmp/sploot-shortcut-unsigned
```

Choose a new output directory on each release attempt. This emits
`Save to Sploot.unsigned.shortcut` and `distribution.json` with source hash,
action count, `status: "unsigned-source"`, `deviceVerified: false`, and
`icloudImportURL: null`. The binary plist is **source, not installable
distribution**; renaming it does not sign it.

On a Mac with Apple's `shortcuts` CLI and signing service available:

```bash
python3 apps/server/scripts/shortcut-release.py \
  --output-dir /tmp/sploot-shortcut-signed --sign
```

The script invokes `shortcuts sign --mode anyone`, sending the token-free
workflow to Apple, and emits `Save to Sploot.shortcut` plus its hash. It does not
import the workflow, inspect a library, retrieve a token, create an iCloud link,
or perform device acceptance. Even successful signing records
`status: "apple-signed-device-verification-required"` and `deviceVerified: false`.

Apple documents [command-line signing](https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac)
and [sharing Shortcuts](https://support.apple.com/guide/shortcuts-mac/share-shortcuts-apdf01f8c054/mac).
Native signing is an unavailable prerequisite in the current Linux work; an
unsigned artifact must never be presented as ready to install.

## Workflow behavior and iPhone acceptance

The source accepts original JPEG, PNG, WebP, GIF, MP4, and WebM files, or direct
HTTP/HTTPS media URLs. It posts bytes as multipart `file` to
`https://www.sploot.app/api/upload` or a URL to `/api/upload/url`, with the
personal token sent only to Sploot. It does not scrape pages or download social
video players, and does not intentionally transcode animated input into stills.

The workflow branches on JSON `success`, `asset`, and `isDuplicate`; Apple's
**Get Contents of URL** action does not expose a separate HTTP status variable.
Its intended receipt behavior is:

| API outcome | Workflow behavior to verify on iPhone |
|---|---|
| `201`, complete successful receipt | **Saved to Sploot**, with the saved asset identity. Confirm it in the library and download the stored media. |
| `409`, successful receipt with `isDuplicate: true` | **Already in Sploot**, with the same asset identity and no second asset. |
| `401` revoked/invalid token | Failure, never a saved confirmation. Replace the token through setup. |
| `403` quota denial, `413` oversized media, or a save-disabled/unavailable response | Failure with the returned error, not a successful save. |
| `409` with `code: "UPLOAD_IN_PROGRESS"`, timeout, malformed/incomplete JSON, or network failure | No saved confirmation; inspect the library before retrying. Earlier confirmed items in a batch remain saved. |

After signing, inspect/import the signed artifact in Apple Shortcuts and
exercise it **on an iPhone**: share a supported image, animated GIF, and video;
verify playback and receipt identity; repeat an input for duplicate behavior;
and exercise invalid/revoked-token plus network/service failure. Confirm
token replacement and the plaintext-file disclosure. A browser/API smoke or
successful plist packaging cannot substitute for these device interactions.

Only after this acceptance should an operator publish the signed artifact or
an Apple-created iCloud sharing link, with its artifact hash and sanitized
device evidence. No such acceptance or distribution is claimed here.
