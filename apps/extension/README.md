# Sploot browser extension

The [current specification](../../SPEC.md#browser-extension-program) owns capture, pairing, retained work and disconnect behavior. This document owns setup and verification procedures, not a second behavior contract.

## Run and load locally

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:local
```

Leave the real Go app running at `http://127.0.0.1:3001`. Its first preparation downloads and verifies the pinned local inference artifacts; no hosted identity, storage, database, or inference API keys are required. Create a real account at `/sign-up`. The default library is repository `.sploot-local/library`; the model cache is separate. Ctrl-C never deletes accounts or saved media. [Runtime operations and recovery](../../docs/DEPLOYMENT.md#self-contained-go-runtime) owns host prerequisites, model preparation, doctor, build, and backup/restore.

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

Choose **Disconnect** before switching the popup's instance or account. See the
[extension behavior](../../SPEC.md#browser-extension-program) for failure and
queue ownership, [account authority](../../SPEC.md#accounts-and-authority) for
credential scopes, and [recovery behavior](../../SPEC.md#sharing-removal-and-recovery)
before pairing against a restored instance. Wire-level media references and
credential formats remain in [the API](../../docs/API.md#authentication).

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
