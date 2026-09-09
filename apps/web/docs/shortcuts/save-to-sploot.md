# Save to Sploot — iPhone Share-Sheet Shortcut

## Release status

**Unsigned workflow source exists; an installable iPhone integration is not
accepted.** Apple signing and real iPhone saved/duplicate/failure verification
have not been performed. There is no verified iCloud install link to publish.

- [Instance-configured workflow template](../../../server/internal/web/templates/save-to-sploot.unsigned.shortcut)
- The self-contained Go app serves rendered source at browser-authenticated
  `/app/shortcut`, linked from Settings as **Shortcut source — Apple signing
  required**. It uses that instance's canonical origin and a distinct token-file
  name for the instance. It is a source download, not an install link.
- [Static predecessor workflow source](../../../server/internal/web/static/shortcuts/save-to-sploot.unsigned.shortcut)
  and its [packaging/signing script](../../../server/scripts/shortcut-release.py)
  are separate: that script packages the static `https://www.sploot.app` workflow,
  not the instance-specific `/app/shortcut` download.

The deployed predecessor's `/help/ios-shortcut` page describes manual action
assembly. Neither that walkthrough nor the static packaging source proves a
local instance release. Production and the old real library are unchanged,
not migrated by running the self-contained Go app.

## Mobile browser versus native capture

The Go product supports responsive browser upload from Photos/Files, original
GIF/video playback, and downloads. Mobile-viewport browser paths have been
exercised; no physical iPhone or native Apple Shortcuts acceptance is claimed.
iPhone does not expose a PWA Web Share Target just because Sploot is added to
the Home Screen. Shortcuts is the separate native share-sheet integration.

A phone must be able to reach the selected instance. `127.0.0.1` on the phone
means the phone, not the computer running `pnpm dev`. For real phone access,
configure a reachable HTTPS origin and explicit registration policy using the
[runtime procedure](../DEPLOYMENT.md#configuration-and-private-directory-lifetime),
then download that instance's source. Do not sign a laptop-loopback workflow
and present it as usable from a phone.

## Personal token scope and storage

Create or sign in to a real account on the selected instance. In `/app/settings`,
use **Personal access tokens** in Go or **Upload tokens** in the predecessor.
Name the token for the phone, copy the `splt_…` plaintext shown once, and
revoke/remint if it is lost. The Shortcut cannot create accounts or bypass the
instance's registration policy. A production token is not a local-instance token.

The token permits **save and search**, not only upload:

- `POST /api/upload` saves bytes.
- `POST /api/upload/url` saves a direct media URL.
- `POST /api/search` can return matching library assets.
- It cannot authenticate library listing, private `/media/{id}` downloads,
  direct asset-management APIs, export, deletion, or token management.

Only a hash is stored by Sploot. The workflow deliberately stores the phone's
plaintext credential in **iCloud Drive/Shortcuts**, not Keychain. Rendered local
source uses `sploot-<instance-hash>-upload-token.txt`; the static predecessor
workflow uses `sploot-upload-token.txt`. Anyone able to read that file can save
and search as its owner. First setup discloses this and asks for a token.
Running without shared input offers **Replace token**, media selection, a direct
URL, or opening the library. Replacing the file does not revoke the old token:
revoke an exposed credential in Sploot first.

A local-library restore excludes personal tokens and all browser/device
sessions from the portable copy. Sign in to the restored instance, mint a new
token, and replace the phone's stored value; account passwords are preserved.

Never distribute a personal token, the token file, an authenticated screenshot,
or a workflow with a credential embedded in its actions. Each person uses their
own token. See [PUBLIC_API.md](../PUBLIC_API.md) for the maintained external
save/search contract.

## Sign instance-specific source

Download **Shortcut source — Apple signing required** from the intended Go
instance's Settings page after configuring its reachable HTTPS origin. Inspect
the source's API URLs and token-file disclosure. The downloaded source contains
no personal token; enter the phone's token only during its own setup.

On a Mac with Apple's `shortcuts` CLI and signing service available, sign that
exact downloaded file (choose a new output filename):

```sh
shortcuts sign --mode anyone \
  --input "$HOME/Downloads/save-to-sploot.unsigned.shortcut" \
  --output "$HOME/Downloads/Save to Sploot.shortcut"
```

Signing sends the token-free workflow to Apple. It neither performs a save nor
creates an iCloud install link. Preserve the exact signed artifact for the
device acceptance below.

## Package the static predecessor source

The existing Python helper has **no input-source or instance-URL override**.
It always packages the checked-in static predecessor workflow for
`https://www.sploot.app`; do not use its output as an instance-configured local
release. From the repository root, with Python 3 and no third-party dependencies:

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
HTTP/HTTPS media URLs. It posts bytes as multipart `file` to the configured
instance's `/api/upload`, or a direct URL to `/api/upload/url`, with the personal
token sent only to that instance. The static predecessor source fixes this
origin to `https://www.sploot.app`; `/app/shortcut` renders the selected Go
origin. It does not scrape pages or download streaming players, and does not
intentionally transcode animated input into stills.

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
