# Stories

<!-- Root artifact: what users must be able to do. One file, ids never
reused, criteria a check can fail on. skill://user-stories guides edits. -->

## Capability: Capture

## US-001 Save a meme from the current surface

Statement: When I see an image I want to keep, I want to save the original
into my private library, so I can find it later without hunting a camera
roll.

Criteria:
1. WHEN I upload a supported original (JPEG, PNG, WebP, GIF, MP4, or WebM),
   THE SYSTEM SHALL store the bytes under my account and keep them after
   restart.
2. WHEN I save from the paired browser extension, THE SYSTEM SHALL attach
   the capture to the same account using device-paired auth.
3. IF the payload is an unsupported type, THEN THE SYSTEM SHALL reject it
   without storing a partial asset.

No-gos: no generated memes, no learning my taste.

Evidence: `apps/server/internal/ingest/media_test.go`, `apps/server/internal/httpapi/server_test.go`

## Capability: Find

## US-002 Find a saved image by describing it

Statement: When I remember what was in a picture but not its name, I want
to type that description and get ranked matches, so I can grab the right
one.

Criteria:
1. WHEN I search with a text query against indexed originals, THE SYSTEM
   SHALL return ranked matches from my library using local CLIP retrieval.
2. IF the query matches nothing I own, THEN THE SYSTEM SHALL return an
   empty result, not another owner's media.

No-gos: no seeded-only search cache as the hosted path.

Evidence: `apps/server/internal/embedding/search_test.go`

## Capability: Private library

## US-003 Keep the library mine

Statement: When I use the library, I want my media, tags, trash, and
exports fenced to me, so a restore or another account cannot mix libraries.

Criteria:
1. WHEN I trash an item, THE SYSTEM SHALL hide it from the live library and
   allow restore until I purge it.
2. WHEN I export, THE SYSTEM SHALL produce an owner ZIP of my originals.
3. IF a restore target already has a live library, THEN THE SYSTEM SHALL
   refuse to overwrite it.

No-gos: no automatic piles on the hosted Go surface.

Evidence: `apps/server/internal/library/service_integration_test.go`, `apps/server/internal/recovery/recovery_test.go`
