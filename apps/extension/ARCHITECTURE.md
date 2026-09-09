# Extension architecture

The WXT/React extension lives in this pnpm monorepo but ships independently through the Chrome Web Store. The self-contained Go application owns accounts, original media, persistent indexing, and local semantic inference. The predecessor Next app is a separate surface; extension device pairing does not silently fall back to a hosted identity provider.

## Boundaries

- `entrypoints/background/auth-manager.ts` owns the persistent device protocol, credential storage, same-origin checks, sanitized auth events, expiration and revocation. `sploot:connection` is one atomically replaced local-storage record containing the selected origin plus either a pending request or a device session. Poll mutations serialize in the worker; deadlines and Chrome alarms survive its termination.
- `entrypoints/popup/App.tsx` consumes public auth metadata only. It selects an instance, shows the user-facing code, opens approval, disconnects, and displays the current owner's retained save summaries. It never receives the device code or bearer token in runtime messages.
- `entrypoints/background/context-menu.ts` and `screenshot.ts` receive real Chrome user actions. `image-fetcher.ts` retains originals under the shared MIME/upload contract. `context-menu-save-queue.ts` persists bytes, source digest, target instance, idempotency key, and stable account ownership before network upload.
- `shared/api-client.ts` captures the request origin before asking for a credential for that exact origin. Credentials are bearer-only; requests omit cookies and reject redirects. A late 401 invalidates only its exact credential, not a newer pairing.
- Local media is private: receipts expose relative `/media/{id}` references, not public storage URLs. Device-authenticated media fetches resolve only against the selected instance and omit cookies; bare image/notification URLs cannot attach a bearer credential. The browser's library session remains separate.
- `notifications.ts`, `shared/save-status.ts`, and popup queue recovery expose saved/duplicate/retry/failure outcomes. Notification actions are revalidated against the selected origin when clicked, including after worker restart.
- `@sploot/common` remains the source of truth for upload limits, MIME validation, and public upload response types. Do not fork these contracts into the extension.

## Persistence and authority

The stable owner is an instance origin plus user ID. Device-session IDs are non-secret provenance, not ownership: reconnecting the same account to the same instance can resume captured work. Equal user IDs at different instances are different owners. Pending ownerless captures can only be adopted on their recorded target instance; captures from older builds without a target are not automatically assigned to an unrelated instance.

The queue retains immutable bytes, caps aggregate storage/concurrency/attempts, rejects replay drift, and never refetches a mutable source during recovery. Failed/paused work has finite retention and is owner-filtered in the popup. Configuration changes never copy a credential to another origin. Disconnect must revoke remotely before the UI claims completion; offline startup alone does not erase durable work.

Device authentication permits only HTTPS remote instances and loopback HTTP. The extension has no cookie permission or hosted identity SDK. Local storage is restricted to trusted extension contexts; no content script or externally connectable auth bridge is installed. Passwords remain on the instance's browser-origin sign-in page.

The instance grants `spld_` device sessions owner-library/save/search/media/export authority, but approval, password changes, and credential management require the browser's `sploot_session`. Personal `splt_` tokens opt in only to the published save/search routes and cannot be substituted for a device session. These scope checks live in the Go auth boundary, not in popup visibility or a claimed user ID.

The app's persistent `.sploot-local/library` survives ordinary shutdown independently of Chrome storage. Its portable backup preserves passwords/library data but scrubs browser/device/PAT credentials and pending pairing requests. A restored instance requires sign-in and fresh pairing; it does not inherit a usable device secret from the snapshot. [Runtime recovery](../web/docs/DEPLOYMENT.md#library-backup-and-isolated-restore) owns that lifecycle.

## Evidence and releases

[README.md](README.md) is the run/load/runtime procedure. `playwright/mv3-lifecycle.e2e.ts` exercises the real backend; `mv3-api-fixture.e2e.ts` is explicitly a controlled fault fixture. The production artifact, manifest policy, exact-provenance operator evidence, and manually authorized Web Store upload remain separate release gates. Test builds contain no alternate authentication authority.
