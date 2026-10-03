# Capture

Stories: US-001
Source: apps/server/cmd/sploot/**, apps/server/internal/ingest/**, apps/server/internal/httpapi/**, apps/server/internal/auth/**, apps/server/internal/database/**, apps/server/internal/web/**, apps/extension/entrypoints/**, apps/extension/shared/**, apps/extension/wxt.config.ts, packages/common/src/**, apps/server/scripts/local-gauntlet.ts, apps/extension/playwright/mv3-lifecycle.e2e.ts, qa/walk*, .exe/setup.sh

## Sub-features

The Go save boundary validates and deduplicates originals, retains owner-scoped bytes on disk, and queues local indexing. The WXT extension pairs a device to a browser-approved account, then captures a right-click original or visible tab without a password or browser cookie.

## How to get to it (user POV)

Register in the Go instance, open `/app`, press Save and choose a supported file. For extension capture, select the same instance in its popup, approve the device on the instance's `/app/connect` page, then right-click an image or capture the visible tab.

## Driving it

In an isolated library, upload a PNG, GIF, and video and compare each downloaded original's SHA-256 with the submitted bytes. Restart the process and retrieve an original again. Build the unpacked WXT extension and exercise pairing and a real Chromium context-menu capture to the same owner. Try invalid media and verify no extra asset appears. `qa/walk --stories "US-001"` performs these exercises on CI.

## Gotchas

`apps/web` is a retired predecessor, not the Go save path. A device session is narrower than browser account authority. Do not upload into or remove the persistent `.sploot-local/library`; the walk allocates disposable accounts and directories. A MIME label alone does not prove a supported original.
