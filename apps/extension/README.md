# Sploot browser extension

Save original images, GIFs and direct MP4/WebM videos to your own Sploot instance. The popup connects a revocable device, opens your library for local semantic search, captures the visible tab, and shows durable saved/duplicate/failure receipts. Streaming-player downloads are not supported.

## Run and load locally

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:local
```

Leave the real Go app running at `http://127.0.0.1:3001`. Its first preparation downloads and verifies the pinned local inference artifacts; no hosted identity, storage, database, or inference API keys are required. Create a real account at `/sign-up`. The default library is repository `.sploot-local/library`; the model cache is separate. Ctrl-C never deletes accounts or saved media. [Runtime operations and recovery](../web/docs/DEPLOYMENT.md#self-contained-go-runtime) owns host prerequisites, model preparation, doctor, build, and backup/restore.

In another terminal:

```sh
pnpm --filter extension build
```

1. Open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**.
2. Load `apps/extension/dist/chrome-mv3` (not `.output`). Pin Sploot's action to the toolbar.
3. Open the popup. The default instance is `http://127.0.0.1:3001`. If necessary, edit **Instance URL** and choose **Use instance**. Remote instances require HTTPS; HTTP is accepted only on loopback.
4. Choose **Connect device**. The popup shows a short connection code and opens your instance's approval page. Sign in if needed, verify the code and account, and choose **Approve connection**.
5. The popup shows the connected account email. You can close the popup during approval: the pending request and its deadline survive popup closure and worker/browser restart.
6. Right-click an image or direct video and choose **Save to Sploot**. The notification and popup distinguish **Saved**, **Already in Sploot**, a scheduled retry, and a retained failure. **View My Library** opens the selected instance for search.
7. **Screenshot this tab** saves the visible HTTP(S) tab, not hidden tabs or browser-internal pages. Opening the toolbar popup or its `Ctrl+Shift+Y` shortcut (`Command+Shift+Y` on macOS) grants Chrome's temporary active-tab authority.

`pnpm --filter extension dev` starts WXT on port 3303. For another build-time default, set `VITE_API_BASE_URL=https://your-instance.example`. An existing profile retains its selected instance; rebuilding does not silently retarget it.

## Disconnect, switch instances, and recover

**Disconnect** calls the current instance to revoke this device session before forgetting it locally. If that request fails, the UI reports failure and keeps the credential so you can retry revocation; it does not claim success. Once disconnected, select another instance or reconnect using a different account. This does not log the browser out of its separate web session.

Device credentials stay in trusted extension-local storage, never sync storage, messages, diagnostics, or logs. API calls omit browser cookies and reject redirects. Every request captures its destination before obtaining a credential for that exact origin. Queued ownership is the stable **instance + user** identity; a new device session for the same account can resume retained work, but another account or instance cannot list, retry, discard, or upload it. An unpaired capture records its target instance before approval.

Device `spld_` credentials grant owner-library operations, not password changes, device approval, or personal-token management. Those security actions require the instance's browser session. A personal `splt_` token is narrower: save/search only, not extension pairing or private media access. Account credentials from the unchanged deployed Next.js predecessor do not pair this local extension.

Save/search receipts retain the shared response shape, but local `blobUrl`/thumbnail references are private relative `/media/{id}` paths. Resolve them against the selected instance and authenticate media fetches with its device bearer; do not treat them as public Blob URLs or put credentials into URLs. A bare image/notification URL cannot provide bearer authority. Browser library links use the browser's separately authenticated session.

Captures retain original bytes, SHA-256, and an idempotency key. The queue remains bounded to 50 jobs and 8 MiB encoded source bytes, with finite request deadlines, attempts, retry backoff, and seven-day retention. Larger originals cannot be retained and are rejected visibly rather than compressed or silently dropped. Terminal inactive-owner entries can be reclaimed without exposing or uploading them. Chrome storage removal or uninstall deletes retained extension captures, but never removes the app's already-saved library.

Pairing expires after at most ten minutes and 300 polls. A responsive timer runs while the worker is awake; a persisted Chrome alarm resumes polling after suspension. Chrome can delay alarms to its minimum interval. Offline failures preserve the pending request until expiry and never create a fake signed-in state.

Restoring a local library preserves its account passwords and saved media but removes portable browser/device sessions, pairing requests, and personal tokens. Sign in and pair again against the restored instance. Restore does not revoke the source instance's credentials or migrate an extension's retained queue to a different origin.

## Verification boundaries

There is no authentication bypass build. `build:e2e` is the ordinary development artifact.

```sh
pnpm --filter extension lint
pnpm --filter extension test
pnpm --filter extension build:e2e
pnpm --filter extension exec playwright install chromium
pnpm --filter extension test:layout
SPLOOT_E2E_BASE_URL=http://127.0.0.1:3001 pnpm --filter extension test:mv3
pnpm --filter extension test:mv3:fixture
pnpm --filter extension test:update-nag
```

On Linux the browser suites require a graphical session (or `xvfb-run -a`) and `xdotool`. They invoke native Chrome context menus and the browser action accelerator; no runtime message substitutes for a context-menu save. Native-menu failures are failures, not skips.

- `test:mv3` requires an actual Go instance with registration open and local inference ready. It creates uniquely named test accounts, pairs and approves a device across worker termination, verifies original-byte hashes, duplicates, real device search, screenshot capture, revocation, and cross-account isolation. It does not mock the account/library API and does not delete your database. Prefer a dedicated persistent acceptance directory.
- `test:mv3:fixture` uses a **controlled local API fixture**, including its device protocol. This is not backend acceptance. It exercises real Chromium storage, alarms, owner changes, immutable retries, failure/discard UI, duplicate receipts, queue-capacity reclamation, and screenshot restart recovery under deterministic failures.
- `test:layout` checks the actual popup at 360/280/240 px without injected auth. Unit tests defend device deadlines, invalid origins, credential/owner fences, stale revocation, and durable queue edges. The update-notice fixture controls update events only, never identity.

## Chrome Web Store release

Local app deployment and extension publication remain separate. The checked-in listing packet still records the Web Store submission status; an unpacked working build is not publication evidence.

```sh
pnpm --filter extension build:prod
pnpm --filter extension manifest:check
pnpm --filter extension assert:update-nag-artifact
pnpm --filter extension zip:prod
pnpm --filter extension release:structural
pnpm --filter extension release:check
```

Release checks retain manifest least-privilege validation, asset/listing checks, exact candidate/ZIP provenance, and the operator Chrome/Web Store evidence gate. Release bundles must not contain former auth-bypass markers, hosted publishable keys, or development update controls. `release:check` remains nonzero without the exact approved operator evidence packet. A controlled fixture or local pairing result is not evidence of compatibility with a deployed predecessor or of a Web Store submission.

For a stable ID in production-like unpacked QA, run `pnpm --filter extension generate:crx-key` once, then `pnpm --filter extension build:prod:unpacked`. Store ZIPs do not include that private local key. Review [STORE_LISTING.md](STORE_LISTING.md), preserve the candidate/ZIP hashes, submit manually to the authorized Web Store item, and verify the uploaded artifact with `release:verify-uploaded` before claiming publication.
