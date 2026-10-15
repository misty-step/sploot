# Private library

Stories: US-003
Source: SPEC.md, apps/server/cmd/sploot/**, apps/server/internal/library/**, apps/server/internal/recovery/**, apps/server/internal/httpapi/**, apps/server/internal/auth/**, apps/server/internal/database/**, apps/server/internal/web/**, apps/server/scripts/local-gauntlet.ts, qa/walk*, .exe/setup.sh

## Sub-features

Behavior: [US-003](../SPEC.md#us-003-keep-the-library-mine), including accounts, credential scopes, sharing and recovery. This map locates implementation and evidence; it does not define behavior.

## How to get to it (user POV)

Open `/app` to trash an asset, then `/app/settings` to see and restore it. Use Settings for the owner ZIP export. Full-library restore is an operator command, not a web action.

## Driving it

`qa/walk --stories "US-003"` runs the isolated Go browser and recovery acceptance: trash disappears from live listing and returns on restore, ZIP manifest and original hashes belong to the active owner, restored media survives and old sessions cannot enter the new library, and an existing populated restore target rejects an overwrite without losing its content.

## Gotchas

Owner ZIP export is not the full-library recovery format. Restored sessions and device credentials are deliberately invalidated; sign in with an existing password. Never aim restore or tests at `.sploot-local/library` or another live directory.
