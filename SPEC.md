# Sploot specification

This is the sole current behavior reference for the private library and its
browser-extension and MCP clients. QA verifies this specification; tests and
observations do not independently define product intent. Story IDs are stable
and never reused. The eight numbered criteria remain the story-walk anchors;
the behavior beneath each story is also part of its contract.

## Scope and program boundaries

- The library lets a person save originals and retrieve them by description,
  manage their own collection, and recover retained data. Hosted and separate
  local/self-hosted instances have separate accounts, credentials and libraries;
  choosing another instance does not migrate or merge them.
- The browser extension captures into one selected instance on behalf of a
  browser-approved account. It does not own the saved library or account policy.
- The MCP program exposes save and search to agents using that instance's
  personal token. It does not implement independent storage, ranking or identity.
- No generated memes, taste learning, automatic piles, billing, general
  password-reset/email-delivery service, or consumer save/search CLI is promised.
  The retired predecessor and proposed rebuild are not alternate current behavior.
- Responsive browser behavior is in scope. Physical iPhone/Apple signing,
  a verified Shortcut install link, Chrome Web Store publication and npm
  publication require separate evidence; local acceptance does not establish them.

[ADRs](docs/adr/) retain technical decisions, [API documentation](docs/API.md)
and the [published save/search contract](docs/PUBLIC_API.md) describe wire
formats and limits, and the [QA procedure](docs/qa/README.md) maps behavior to
real exercises. Setup, deployment and recovery commands belong in
[operations](docs/DEPLOYMENT.md), not this specification.

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

### Library capture

- A signed-in person can upload from a desktop or mobile browser. Originals
  retain their bytes, filename and media type; animation/video are not silently
  replaced by a still image. Saving and indexing are distinct: a saved original
  remains available while indexing is pending or search is unavailable.
- A repeated original returns an explicit duplicate receipt in the same account,
  not another copy. The same bytes may belong independently to another account.
  Retrying an uncertain save with the same identity preserves its original
  receipt and bytes rather than fetching changed content.
- Malformed, unsupported or oversized media is rejected without a partial asset.
  URL capture rejects private-network destinations. Instance storage admission
  can refuse a save; the error distinguishes unavailable storage from capacity
  exhaustion and directs the person to storage management rather than silently
  losing the capture. Trash still occupies retained capacity until purged.
- Where supported by the browser, the installed web application's share target
  accepts files. A multi-file result reports saved, duplicate and failed items;
  successfully saved files are not undone by a later failure. This is not an
  iOS share-sheet guarantee.

### Browser-extension program

- The person selects an instance, connects a device, checks its connection code
  and signed-in account on that instance, and explicitly approves or denies it.
  Remote instances require HTTPS; loopback development may use HTTP. An existing
  profile retains its selected instance across extension rebuilds.
- Password entry stays on the instance's sign-in page. Pairing does not inherit
  a web session. Pending approval and its deadline survive popup closure and
  worker/browser restart. Polling is bounded (at most ten minutes and 300 polls);
  offline failures remain pending until expiry, never a fake connected state.
- A connected person can right-click an image or direct MP4/WebM video, or save
  the visible HTTP(S) tab as a screenshot. Hidden tabs, browser-internal pages
  and streaming-player downloads are not capture surfaces. Library navigation
  opens the selected instance using its separate web sign-in.
- The popup/notification distinguishes Saved, Already in Sploot, scheduled retry
  and retained failure. Captures keep their original bytes and retry identity.
  Retained work is bounded to 50 jobs, 8 MiB encoded source bytes and seven days,
  with finite request deadlines and retry attempts/backoff. An original too large
  to retain is rejected visibly, not compressed or silently dropped.
- Work belongs to an instance and account, not merely the latest device session.
  Re-pairing the same account can resume it. Another account or instance cannot
  inspect, retry, discard or submit it. A capture made before pairing retains
  its chosen destination. Inactive terminal entries may be reclaimed without
  exposing or uploading them. Uninstall/storage removal loses retained extension
  captures, not originals already saved in the library.
- Disconnect revokes the current device before forgetting it or switching
  instances. Failed revocation stays visible and retains the credential for
  retry; it does not claim success or sign out the separate browser session.
- Credentials remain in trusted extension-local storage, not sync, messages,
  diagnostics or logs. Requests are bound to the credential's exact instance,
  omit browser cookies and reject redirects. Private media requires the matching
  device authority, not a public URL or a credential embedded in a URL.

### MCP program

- `sploot_save` accepts a URL or base64 original, with optional filename, media
  type and tags. `sploot_search` accepts a description and optional result limit
  and similarity threshold. Both use the selected instance's published contract
  and return its successful JSON as text content; failures are human-readable
  tool errors, not fabricated saves or search results.
- A personal token is required; startup without one fails with minting guidance.
  The default API is the hosted library; an explicit override selects another
  instance and needs a token issued there. The retired origin is not a fallback.
  MCP has no separate owner/library administration or private-media authority.

## US-002 Find a saved image by describing it

Statement: When I remember what was in a picture but not its name, I want
to type that description and get ranked matches, so I can grab the right
one.

Criteria:
1. WHEN I search with a text query against indexed originals, THE SYSTEM
   SHALL return ranked semantic matches from my library without requiring
   filenames or an external inference service.
2. IF the query matches nothing I own, THEN THE SYSTEM SHALL return an
   empty result, not another owner's media.

### Retrieval and browsing

- New originals and new descriptions participate in actual local semantic
  retrieval, not a seeded-only cache. An empty result is valid; no synthetic
  matches fill it. Readiness alone is not evidence of retrieval quality.
- The person can browse their live collection, mark/unmark favorites, create
  and manage tags and an item's tag associations, and filter retrieval by
  favorites/tags. Changes persist across reload/restart and affect fresh results.
- Shuffle changes the order of the same private collection. Reusing its seed
  with the same filters preserves that order across browser/API traversal;
  pagination does not repeat or mix in another owner's items.
- Originals can be viewed/played and downloaded from desktop/mobile browsers;
  a download preserves the original bytes. Downloading or opening sharing
  controls does not implicitly publish a link.
- A loading, unavailable or disabled search reports its actual state and retry
  guidance rather than returning cached-only success. Existing originals,
  account access, saves, browsing, download and export remain available when
  inference initialization fails. Repair and restart can resume indexing.

## US-003 Keep the library mine

Statement: When I use the library, I want my media, tags, trash, and
exports fenced to me, so a restore or another account cannot mix libraries.

Criteria:
1. WHEN I trash an item, THE SYSTEM SHALL hide it from the live library and
   allow restore until I purge it.
2. WHEN I export, THE SYSTEM SHALL produce an owner ZIP of my originals.
3. IF a restore target already has a live library, THEN THE SYSTEM SHALL
   refuse to overwrite it.

### Accounts and authority

- Accounts are real and persistent, with email as an identifier, not proof of
  email ownership. Registration follows the selected instance's open/closed
  policy; closing it does not revoke existing accounts. The hosted instance is
  closed to public registration. There is no seeded account or QA login.
- A person can sign in/out and change their password with the current password.
  A password change keeps the current browser session but revokes other browser
  and device sessions, personal tokens and approved pending pairings. Sign-out
  revokes the current session without deleting the library.
- Browser sessions permit owner operations and account-security actions.
  Browser mutations require the instance's origin. A paired device permits
  owner library/save/search/private-media/export operations, but not permanent
  purge, password changes, device approval/list management or personal-token
  management. A personal token permits only published save/search, not direct
  private media, library listing, export, deletion or account administration.
- Personal tokens are named, shown in plaintext only once, listable as metadata
  and revocable by the owner's browser. A person can list/revoke their devices.
  Invalid, expired or revoked credentials fail; an explicit bad bearer does not
  fall back to a browser session. Supplied owner hints never grant authority.
- Another account cannot read or mutate private assets, tags, search, trash or
  export. Knowing an asset's private media reference is not authorization.
- An operator-invited imported account can choose its password using its own
  unexpired, one-use invitation even when public registration is closed. Email
  equality does not merge accounts. Wrong-owner, expired, rotated or consumed
  invitations cannot claim an account; invitation issuance is not public, and
  it cannot reset an already activated account.

### Sharing, removal and recovery

- Only an explicit owner action enables a public share link. A visitor can open
  an enabled link without signing in; revocation removes that access immediately.
  Trash hides an item from live retrieval; restoring it does not re-enable a
  revoked share. Private media remains private independently of public sharing.
- Trash is reversible until the owner explicitly confirms permanent purge in
  the browser. Purge requires an already-trashed item, reclaims retained bytes,
  and can safely resume after interruption. A completed purge cannot be replayed
  as a successful duplicate save or recreation; existing backups are unaffected.
- An owner export is a completed ZIP of that account's metadata, tags/vectors
  and retained originals/previews, including soft-deleted records, not another
  owner's data. A truncated transfer is not a successful download. Owner export
  is distinct from a full-instance recovery snapshot.
- Shutdown/restart preserves accounts, saved media and indexing state. An
  operator can back up, verify and restore the full library into an unused
  target. A populated target is refused without modifying it.
- Restore preserves accounts/passwords and media but invalidates portable
  browser/device sessions, pairing requests, personal tokens and invitations.
  People sign in, mint tokens and pair again; unclaimed accounts need new
  invitations. Source-instance credentials are not revoked by restoring a copy,
  and an extension queue is not moved to a different origin.
