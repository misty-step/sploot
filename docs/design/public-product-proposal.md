# Sploot: a personal pile worth coming back to

**Design and pricing proposal · 2026-09-10 · awaiting operator approval**

Make Sploot the place a person puts a meme because they trust themselves to find
it again. The memorable object is the pile of pictures, not a dashboard about
the pile. Keep the toybox: chunky search console, candy controls, little hearts,
and a quiet dotted shelf underneath real media.

**Recommendation:** a dense desktop library, a thumb-first mobile shelf, and one
save-to-find loop shared by browser capture, extension, and MCP. Offer a small
cardless Free plan and one proposed **Collector plan at $12/month for 1 GB**.
Sell useful recall and room for a personal collection, not search credits or
unlimited file hosting. The capacity is deliberately conservative because the
current recovery design retains full snapshots. Pricing is a hypothesis for
approval, not a validated margin or an offer available today.

This document authorizes no implementation, enrollment, payment, identity,
provider, or production change. The approved canonical origin is
`https://sploot.mistystep.io`; registration remains closed. Cutover acceptance
and runtime retirement belong to the
[runtime operations guide](../../apps/web/docs/DEPLOYMENT.md#canonical-hosted-go-instance)
and Linear MIS-46/MIS-47, not this proposal.

## What exists, and what this would change

“Implemented” below means present in the merged Go/client source reviewed for
this proposal. It does not assert fresh hosted, physical-phone, store-release,
or payment acceptance. [DESIGN.md](../../DESIGN.md) remains visual law; its
predecessor component inventory is not evidence that Go renders those components.

| Area | Implemented foundation | Proposed consumer treatment or boundary |
| --- | --- | --- |
| Library | Go HTML/HTMX browsing, deterministic shuffle, favorites, tags, original viewer, trash/restore, and owner ZIP export. | Dense picture grid on desktop; compact mobile shelf leading to a full-screen viewer. Preserve filters, shuffle seed, scroll anchor, and focus when returning. |
| Visual system | The current Go CSS uses system-rounded fonts, a desktop left rail, large single-column media, system dark mode, and reduced-motion rules. | Adopt Bungee/Baloo 2, the canonical candy tokens, ink shells, and ink-mini controls. These are proposed Go changes, not an already-shipped toybox grid. |
| Capture | File picker, paste/drop, direct-media URL saves, durable browser receipts; device-paired extension right-click and visible-tab capture. | Bring the latest save receipt next to the feed and make “saved” visibly distinct from “search ready.” Never require extension installation before the first save. |
| Search | Owner-scoped text-to-image retrieval using local CPU CLIP; pending/processing/failed indexing and model readiness are separate states. | One quiet search console, visible results immediately when returned, and a recoverable route back to browsing. No claim of exact text recognition, video transcription, taste learning, or guaranteed first-result accuracy. |
| Piles | Automatic piles and their API belong to the predecessor; Go does not provide them. | Keep “the pile” as the library metaphor. Do not show invented cluster chips, a “sorted automatically” animation, or a clusters promise at launch. Tags stay optional and secondary. |
| Sharing | Share/copy/download prepares the actual file; supported browser capabilities vary. A public link is a separate, explicit and revocable Details action. | Keep actual-file sharing primary. Name the public-link action literally and explain that anyone with it can view/download. Never turn a failed file share into an automatic public link. |
| Accounts | Built-in password accounts; operator-issued, expiring one-use claims for migrated accounts; browser-approved device pairing. No general email verification or password-reset service. | Preserve migrated-account activation. A public new-user flow and reliable recovery need separate approval and implementation before open registration. |
| Mobile capture | Browser Photos/Files capture and browser-dependent Web Share Target; unsigned instance-specific Shortcut source. | Lead with the browser. Do not advertise a native app, universal share-sheet integration, or installable iPhone Shortcut. Physical-device and Apple signing acceptance remain distinct gates. |
| Capacity/billing | Instance-wide disk admission and owner storage reporting; no Go consumer quota, billing routes, or subscription entitlement. | Introduce the proposed owner allowances only after server-side admission exists. A storage bar cannot be calculated from the current instance limit as though it were a user's plan. |
| MCP | Personal-token save/search tools; search returns metadata, not authority to download private media. | Keep an optional “connect an assistant” path in Settings. It is not a replacement for consumer onboarding and gets no payment/account-management powers. |

Native saves preserve accepted originals. For migrated media, “original” means
the captured predecessor-stored file, which may already have been processed.
Never promise recovery of historical pre-processing bytes that were not retained.

## Design direction: loud pictures, quiet machinery

### The small visual kit

Reuse the existing contract rather than create another palette. These six roles
carry the main composition; warning, error, selection, and match roles continue
to use the exact semantic tokens in DESIGN.md.

| Role | Light shelf | Night shelf | Placement |
| --- | --- | --- | --- |
| Ink | `#1c1547` | `#fff3dc` | Text, shells, linework |
| Shelf | `#cfe7ff` | `#19143d` | Low-contrast dots between cards, never behind readable meme text |
| Toy surface | `#ffffff` | `#2d255e` | Search console, sheets, card frame |
| Primary blue | `#087bc1` | `#63c3ff` | Save and the current primary action |
| Bubblegum | `#ed58bd` | `#ff8ed7` | Filled heart and pressed controls |
| Banana | `#ffdd00` | `#ffe45c` | Hover and the one attention highlight per viewport |

- **Type:** Bungee for the wordmark/headline and occasional section title; Baloo
  2 for controls, readable copy, and captions; Space Mono only for optional
  machine readouts. Proposed scale: 16px body/control, 14px metadata, 24px section
  title, 40px mobile/56px desktop landing headline. Readable copy stays under
  70 characters per line. Product labels are lowercase; filenames and user text
  keep their actual casing.
- **Shape:** 18px outer shell, 10px media frame, 9px ink-mini corner, pill buttons
  and chips. Standard 3px ink shell, compact 2px shell, hard downward 5px rest
  shadow; 9px only on the landing search console. No blurred shadows or gradients.
- **Alignment:** left-align headline, search, and feed. Center only the media
  inside its frame and the focused viewer. Cards can have different image
  proportions without producing a confusing visual/tab order.
- **Hierarchy:** one main blue action per local task. A heart remains a small
  filled/outline heart, never a badge, sort option, or “top banger” rank. Use
  “bangers” as the favorite-filter label, with a first-use hint “your favorites.”
- **Motion:** use the existing 130/150/200/300ms tokens. Lift the surface with an
  anchored/extended shadow; sink it on press with a collapsed shadow. State
  markers live inside the transformed card. No ambient bounce, confetti,
  animated counters, or entrance delay on a user's search results.

**Brief review:** a statistics sidebar, a three-card pricing wall, and a giant
marketing hero would spend space on Sploot rather than on memes. Reject them.
The proposal instead puts the search console and actual image cells in the first
viewport, removes the permanent desktop rail, and makes pricing a small capacity
choice in Settings. The current large-media feed is retained as the focused
viewer, not discarded as a useful way to read a meme.

### Public front door, without pretending signup is open

Proposed headline: **“type words. get the picture.”** Supporting copy:
“save your memes. find them by describing what you remember.”

```text
Desktop, first viewport
+--------------------------------------------------------------------+
| sploot                                      how it works   sign in |
|                                                                    |
| type words. get the picture.                                        |
| save your memes. find them by describing what you remember.          |
|                                                                    |
| [small untidy set]   [ describe a meme_________________ ][find]       |
| of permitted demo        [matching image] [another image]            |
| images                    inside the actual card grammar            |
|                                                                    |
| [try the example]     existing account? [sign in]                    |
| new accounts are not open yet.                                      |
+----------------------next section begins here-----------------------+
| save it once  /  find it later  /  share the actual file              |
```

The public example uses a separately permissioned, non-private collection and
is explicitly labeled **“example pile, not your library.”** It must either run
the real advertised search on that collection or be labeled an illustrated
walkthrough; never fake arbitrary-query results. No migration media, account
counts, fabricated testimonials, or “people saved” counters become marketing
material. The demo is proposed work, not a reuse claim about historical labs.

On mobile, show the headline, one working example/search, and the next section
edge. Do not force a horizontal three-panel diagram into the viewport. Until
enrollment is approved, the only account action is sign-in; no active purchase
button or waitlist-email collection is implied by this document.

### Desktop: an archive workbench, not a scrolling presentation

```text
Proposed /app, wide desktop
+--------------------------------------------------------------------+
| sploot  [describe a meme______________________][find] [save] [theme] |
| [all] [heart bangers]      [shuffle]                       [settings] |
| the pile                    [save status, only when relevant]        |
+--------------------------------------------------------------------+
| [        image       ] [ image ] [      image      ] [ image       ] |
| filename               filename filename            filename        |
| [heart][share][more]    [...]    [...]               [...]           |
|                                                                    |
| [ image ] [          image             ] [ image ] [ image        ] |
|           actual pictures, not a quota dashboard                    |
|                                                                    |
| [load more]                       end of pile: [shuffle the pile]    |
+--------------------------------------------------------------------+
Selected image opens viewer; Details opens a secondary sheet/panel.
Search replaces the feed with ranked results, not a second dashboard.
```

Target four to six columns on a wide desktop, two to three at intermediate
widths, with roughly 180–240px readable media cells rather than fixed giant
cards. Row-based responsive layout preserves document order; do not implement
visual masonry that makes keyboard traversal jump unpredictably. Preserve image
aspect ratios, contain meme text instead of cropping it, and reserve dimensions
before loading. Load compact previews in the grid and fetch the original for
viewing/sharing; never eagerly fetch every full video to populate a dense shelf.

Keep heart/share/more controls in a dedicated rail below the image, including
when not hovered. Trash stays inside Details, separated from routine actions.
Optional machine status can expand to show indexing/model information, but it
must not spend a permanent row on healthy internals. Show true library totals
only from owner data; distinguish a search match count from library size.

A search submission keeps the typed query visible, preserves the current filter,
and announces the returned result count. Returning to the pile restores the
same shuffle and position. Shuffling is deliberate: no automatic reshuffle after
hearting, closing a sheet, finishing an upload, or returning from a sharing app.

### Mobile: shelf, find sheet, original

```text
Shelf                         Find sheet                   Viewer
+----------------------+      +----------------------+     +----------------------+
| sploot        [more] |      | find a meme    [close]|     | [back]       [more]  |
| [all] [heart bangers]|      | [description_______] |     |                      |
| [ image ] [ image ] |      | [find]               |     |                      |
| [actions] [actions] |      | scene, feeling, or   |     |   original, uncropped|
| [ image ] [ image ] |      | what you remember    |     |                      |
| [actions] [actions] |      |                      |     |                      |
|                      |      | keyboard             |     | [heart] [share file] |
| [pile][find][save]    |      |                      |     | [previous] [next]    |
+---safe-area space----+      +----------------------+     +---safe-area space----+
```

Use two columns where each image remains intelligible; allow one column on narrow
screens and at larger text sizes. The stable bottom dock has three 44px-or-larger
targets: pile, find, save. Shuffle and Settings live under the top “more” control;
no dock item moves when the keyboard or a queue notice appears. Search/filter
controls open sheets, and results return to the same main shelf. A real browser
Back action closes a sheet/viewer before leaving its underlying result set.

The Save sheet leads with Photos/Files, followed by paste a direct-media URL.
Show local receipt status above the safe-area inset, not behind the dock. Closing
it does not discard a durable pending file; “remove pending capture” is explicit.
Do not promise saving continues with the browser terminated. A queued URL is a
retained URL intent, not a guaranteed local copy of the remote file.

## The save-to-find loop

```text
choose file / paste / extension capture / MCP save
                  |
      kept on device or submitted by client
                  |
      server confirms saved or already saved
                  |
       view immediately; index separately
                  |
        describe it later -> select a match
                  |
       heart it / share file / keep browsing
```

There are two different successes: **the file was saved** and **the file is
searchable**. “Saved” requires the server receipt, not a finished progress bar.
A duplicate is a successful outcome with a link to the existing item, not a red
error. A timeout is “not confirmed,” not “lost”; retry uses the same save intent.
Indexing failure never asks the person to re-upload a safely stored original.

### First use and returning users

1. **Existing migrated account:** use the existing invitation/claim path, then
   open its actual collection. No starter content, onboarding reset, account
   merge by email, forced plan selection, or surprise new charge. An expired
   claim says to request a replacement from the operator; it is not a generic
   password-reset link for an already activated account.
2. **New consumer, only after public-account approval:** explain privacy and
   recovery before account creation, then open an empty shelf with one primary
   action, “save your first meme.” No profile questionnaire, folder taxonomy,
   notification permission, card, or extension requirement.
3. **First confirmed save:** keep the real thumbnail in view with “saved. making
   it searchable.” Offer “view meme” now. Once that asset is ready, offer “try
   describing it.” Do not manufacture a suggested description using an API Go
   does not provide, or trigger a model request on every keystroke.
4. **First useful retrieval:** open the actual match and offer share file. This
   completes onboarding; no streak, achievement modal, or completion dashboard.
   Success means a person can do this unaided, not an invented conversion metric.
5. **Add a capture surface when useful:** after the first save, an optional
   Settings row explains the Chrome extension. Show canonical instance and
   signed-in account on both sides of pairing, compare the code, and explicitly
   approve. A revoked/expired device reconnects; its queued captures stay with
   their original account and instance. MCP stays under connections with its
   narrower token scope explained. Password changes revoke other connections,
   so the account flow must warn about reconnection before submission.

### States worth designing, not smoothing over

All copy here is proposed. Keep the current durable-state and ownership
contracts underneath it; browser-specific capabilities must be detected.

| State | Visible treatment and useful next action |
| --- | --- |
| Empty new pile | One small example-shaped frame, not fake saved media. “your pile starts with one meme.” Primary: “save your first meme.” |
| Empty bangers | Outline heart and “heart the ones you want close.” Action: “browse the pile.” No badge or favorite sort. |
| Uploads closed | “saving is paused. your library is unchanged.” Explain the disabled Save action; never offer an upgrade to bypass an operator pause. |
| Keeping a capture | Show the actual filename and “keeping this on your device.” Do not claim durability until browser storage succeeds. |
| Browser storage unavailable | “this capture has not been sent. keep this page open or keep the original file.” Offer retry; clearing site data is not a recovery action. |
| Uploading / partial batch | A receipt per item, including which items already succeeded. “saving the original.” A failed later item never erases earlier success or replays the entire batch as new saves. |
| Confirmed / duplicate | “saved to your pile” or “already in your pile.” Both offer “view meme.” Only the first creates a new item or consumes a proposed new-save allowance. |
| Network timeout | “save not confirmed. retry checks the same save.” Keep the durable file or URL intent. Do not say a remote URL's bytes are safely on the device. |
| Pending / processing index | Static compact chip: “saved. waiting for search” / “saved. making it searchable.” The image can still open/share/download. |
| Failed index | “saved, but not searchable yet.” Action: “retry search indexing.” Preserve the asset and receipt; do not re-charge it as a new save. |
| Search loading / busy | Keep the query and existing screen stable. Show a small “finding matches” status. Respect server retry timing; never spin an unbounded retry loop. |
| Search unavailable | “search is unavailable. your saved files are still here.” Offer “browse the pile.” A model outage is not an empty result or a reason to upgrade. |
| No matches | “not this time. try the scene or the feeling.” Actions: edit query, clear filter, browse. Mention still-indexing saves only when that state is known. |
| Session ended / account changed | Hide the private library, stop media and outstanding actions, name the required sign-in. State that pending captures have not moved to another account. |
| Unsupported or oversized media | Name the rejected file and accepted formats/10 MiB bound. Offer another file or a direct-media URL. Never silently re-encode originals or promise arbitrary website extraction. |
| Capacity / service storage failure | Separate proposed personal-plan full from shared disk/reserve unavailable. A personal limit offers manage storage; a server fault offers status/retry guidance, not checkout. |
| Share unsupported / denied | Keep “download original” available. Explain the actual browser limitation; “file handed to your sharing app” does not claim delivery to a recipient. |
| Trash / permanent deletion | Undo/restore is visible. Trash still counts as storage. Permanent deletion gets an explicit confirmation; it does not erase retained backups or copies already shared elsewhere. |
| Public link unavailable | “this link is no longer available.” Do not reveal private filenames, owner identity, or whether a guessed asset exists. |

## Accessibility and both shelves are release requirements

- Show every screen, not just landing, in light and dark: sign-in/claim, empty
  shelf, results, Save, viewer, Details, Settings, and future billing states.
  Theme preference offers system/light/dark without altering media colors.
  The proposed switcher is not currently present in the Go template.
- Exhibit ink minis at real size in both themes: rest (flat 2px outline), hover
  (banana and anchored lift), press (bubblegum and collapse), focus (4px token
  outline, 3px offset), selected/pressed, disabled (contract opacity plus an
  explanation), and pending. Their visual body may be 34px on desktop; the
  mobile hit area is at least 44px and cannot overlap a neighbor.
- Meet WCAG 2.2 AA in actual color pairings, including blue primary labels,
  disabled explanations, and focus against both shelves. Token presence is not
  a contrast test. Status uses words/icons as well as color; a filled heart
  also exposes its pressed state and an accessible action name.
- Keyboard access must cover search, ordered grid traversal, heart, viewer,
  share, upload, and Details. Retain useful existing shortcuts without consuming
  typing in inputs. Sheets trap focus while open and return it to the invoker;
  paging and result announcements never steal it. Keep a visible Load more
  alternative and a real end of the list.
- Support 320px width, 200% text zoom and 400% page zoom/reflow, safe areas,
  keyboard-open layouts, portrait/landscape, and long filenames. No horizontal
  document scrolling or cropped error actions.
- Use filenames as the truthful current image-name fallback, not invented
  descriptions. Caption text, control names, and a full-size original help users
  inspect content; do not claim that semantic embeddings provide accurate alt
  text. Any editable description feature would need its own approval.
- Reduced motion removes travel, bounce, stamps, stagger, and smooth scrolling.
  Prefer static posters in the shelf; play GIF/video on deliberate activation
  and expose pause/mute controls. The current Go setting suppresses default
  video autoplay for reduced motion but explicitly leaves GIF animation running;
  the poster treatment is therefore proposed work, not existing compliance.
- Errors persist until resolved/dismissed and use restrained announcements.
  Upload/index transitions use a polite live region; avoid announcing every
  polling response or each tile in a long feed.

## Pricing: one small choice, no trapdoor

### Proposed offer

These are **new hosted-plan proposals**, not existing Go entitlements or verified
Stripe subscriptions. All values require operator approval and the gates below.
One account owns one private library; the plan is not a team or resale license.

The proposed $12 is before applicable tax; show the complete recurring amount
and renewal date before payment. Tax collection and supported regions require
operator approval, not an assumption that a USD price permits worldwide sales.

| | Free | Collector |
| --- | --- | --- |
| Price | $0, no card | **$12 USD per month**, monthly renewal |
| Retained media capacity | **100 MB** | **1 GB** |
| Retained item safety ceiling | 500 items | 10,000 items |
| New unique saves | 100 per month | 1,000 per month |
| Per-file bound and formats | Existing **10 MiB** maximum; JPEG, PNG, WebP, GIF, supported MP4/WebM | Same; payment does not change media validation |
| Included product | Search, shuffle, hearts, tags, actual-file sharing, browser capture, supported extension/MCP connections, and export | Same product; more room and capture capacity |

Capacity uses decimal units: 100 MB is 100,000,000 bytes and 1 GB is
1,000,000,000 bytes. It includes retained originals, generated previews, and
trash, matching the current owner's physical-media reporting. No invisible
preview deduction from a separately advertised “originals-only” allowance.
Database, recovery copies and operational reserves remain the service's cost,
not surprise charges to the customer. Items in trash also count toward the
item ceiling until permanent reclamation succeeds.

Count only server-confirmed new unique assets toward the monthly save allowance.
Duplicates, idempotent retries, reindexing and restore from trash do not count as
new saves. Purging an asset does not refund a monthly save allowance, preventing
upload/delete churn from buying unlimited decoder/index work. Free allowances
reset on the first of the month UTC; Collector resets on its displayed billing
period boundary. Upgrading subtracts new saves already made in the ongoing Free
window from the first paid allowance; repeated upgrade/cancel actions do not
mint extra capacity. Show the actual next reset date, not just “monthly.”

Search is included, not sold by the credit or advertised as unlimited. Proposed
safety ceilings are 30 submitted searches/minute per account, with 100/day for
Free and 500/day for Collector, resetting at midnight UTC. Publish those limits
alongside capture limits before enrollment; do not hide them behind undefined
“fair use.” A limit response shows when searching can resume and leaves browsing,
original access and export available. All devices and tokens share the account's
limits. These bounds still require real full-envelope CPU/latency cost evidence.

Proposed public-link delivery allowances are 1 GB/month Free and 10 GB/month
Collector, separate from private retrieval. Warn at 80%; pause public delivery
at the allowance rather than bill overage or expose another URL. The owner can
still view, download, revoke, and export. Public links resume at the period
reset unless revoked; rate limiting also bounds crawlers and range-request
amplification. Owner retrieval/export needs a separately reserved, bounded
service lane so a viral public link cannot lock the person out of their files.
Do not claim current Go already meters either type of delivery.

**Why this shape:** a cardless plan must complete the real save/find/share loop,
not merely host a demo. One paid capacity level is easier to understand and
operate than a tier matrix. No annual prepayment, lifetime sale, trial requiring
a card, paid search pack, seats, coupons, or second paid tier at launch.
[Optional VISION context](../../VISION.md#sustainable-openness) suggested two
paid tiers; this proposal deliberately recommends only one and requires approval
of that narrower commercial shape. It does not rewrite VISION or the economics
model by implication.

### How it appears in the product

Settings contains one “your room” section: usage, what counts, reset dates, and
“get more room.” The comparison fits one screen and shows the price, renewal,
all safety limits, taxes and cancellation before checkout. There is no
“most popular” badge without evidence and no upgrade control in each meme card.

Warn at 80% and 95% of storage/item/save limits, without interrupting a current
view. At the boundary, stop new cost-creating work before accepting it; keep a
local pending capture and offer manage storage or, where relevant, upgrade.
Upgrading does not bypass a global service stop, unsupported format, account
fence, or full physical disk. Existing search/save usage carries forward against
the new plan's limits rather than resetting on upgrade. If Collector is full,
offer export/manage storage, not an unpriced custom-storage promise.

### Existing users, cancellation and leaving

- **Protect every existing owner.** Retain existing asset identities, ownership,
  favorites, trash, provenance and historical receipts. Never run migration data
  through new-save counters or delete/merge it to fit a plan. Existing retained
  material remains accessible even above a new allowance.
- **Recommended transition:** offer each existing native account a clearly
  recorded 12-month Collector grant from commercial launch, without a card or
  renewal. Set its protected media/item floor to at least the retained amount
  at transition. Show when the grant ends and the resulting limits in advance.
  This is a proposed subsidy, not a claim that a grant has been issued; its cost
  must fit the approved project budget before it is promised.
- **No inferred billing migration.** Historical subscription references do not
  establish current Stripe state. Reconcile actual active subscriptions and
  credits with the operator before any offer, cancellation, refund, or new
  checkout. Never link accounts by matching emails or double-charge an existing
  subscriber. No automatic provider action is approved by this proposal.
- **Cancel renewal in Settings**, without a support conversation. Show the exact
  paid-through date; paid access continues through that period. At expiry,
  return to Free, retaining all media. If over capacity/item limits, pause new
  saves until the account is under the allowance or explicitly upgrades; no
  automatic deletion, forced compression, or export paywall.
- **Failed renewal:** propose one visible seven-day payment grace period with
  the existing paid limits, then the same Free/over-limit behavior. Never
  extend grace indefinitely through repeated failed invoices. Initial failed
  checkout grants no paid access. Unknown provider state grants no new paid
  period, but must not erase a previously confirmed paid-through period.
- **Refund proposal:** honor an explicit first-payment refund request within
  14 days; subsequent cancellations are end-of-period, except billing mistakes
  and applicable consumer rights. Do not treat cancellation as a refund or
  silently charge a cancellation fee. Operator/legal approval is still needed.
- **Export stays available** while over limit, canceled, in payment failure or
  indexing outage. Keep the current owner ZIP with stored originals and
  metadata; no payment dependency, public download URL, or token-scope expansion.
  Serialize expensive exports and show queue/retry status rather than hiding
  the button. Reserve working disk for a full allowed library and an above-limit
  existing collection; a tiny sample export is not acceptance.
- **Account deletion is separate from canceling.** Offer export first, then an
  explicit owner-authenticated confirmation, connection revocation, public-link
  revocation and a documented erasure process. Go does not currently provide
  that complete consumer account-deletion workflow. Explain retained recovery
  copies and legal financial-record retention honestly; never promise immediate
  removal from backups. Do not automatically introduce VISION's possible
  30-day trash purge into the current manually managed trash behavior.

## Economics: an approval boundary, not a margin claim

### What the evidence can and cannot support

The checked-in [economics report](../../economics/REPORT.md),
[workloads](../../economics/workloads.json) and
[rates](../../economics/rates.json) model the predecessor's
Blob/Replicate/Neon/Clerk/platform cost structure. Their $13/10 GB Collector and
$49/100 GB Archive are modeled candidates, not live offers. The report explicitly
lacks fully loaded margin evidence and verified provider hard caps. Do not use
its direct-variable margins or its aggregate historical usage as native-Go cost,
market demand, conversion, or a “typical meme size” estimate.

The native service replaces per-run inference charges with CPU contention,
filesystem capacity and host/network costs; it does not make them free. Current
VM allocation/invoice, network terms, full-load query latency, owner-attributed
costs and a paid-customer mix were not measured in this proposal.

Public list prices read for this review, **not account/billing readbacks**:

- [Stripe US pricing](https://stripe.com/pricing): domestic card processing is
  2.9% + $0.30; pay-as-you-go Billing adds 0.7% of Billing volume. Taxes, tax
  tooling, international cards, FX, disputes, refunds and other selected
  products can add costs. The historical checked-in card rate alone is not the
  full cost of the proposed subscription architecture.
- [R2 Standard pricing](https://developers.cloudflare.com/r2/pricing/):
  $0.015/GB-month, plus operations and billing-unit rounding. Its free egress
  does not establish free traffic from the VM that actually serves the library.
  Free included pools must not be used to make paid full-allowance margins pass.

### Why the storage offer is small

The current [backup runner](../../apps/server/scripts/backup-remote.py) creates
an entire native snapshot archive on each run, not a delta, with hourly objects
and an additional daily copy. The
[recorded retention policy](../../apps/web/docs/DEPLOYMENT.md#canonical-hosted-go-instance)
expires hourly snapshots after four days and daily snapshots after 31 days.
**Illustrative assumption, not measured usage:** steady successful hourly runs,
an unchanged full library, roughly 96 hourly plus 31 daily copies, and lifecycle
expiry without lag imply about 127 retained copies. Actual peak bytes can be
higher because of archive/catalog overhead, churn, lifecycle delay, failed-upload
remnants, and retained recovery exceptions.

At the R2 list rate, 1 GB multiplied by 127 copies is about **$1.91/month for
backup storage alone**, before operations or overhead. A $12 domestic monthly
subscription with the listed processing and Billing rates is about **$0.73** in
fees. To retain 70% gross margin, total service cost must be no more than **$3.60**,
leaving about **$0.96** after only those two illustrative components. VM/disk,
private and public delivery, indexing, DB work, auth, observability, recovery
work, taxes/fees, support/refund risk and an explicit shared-cost allocation
still have to fit. That is a tight bound, not proof of profitability.

This is why a cheap multi-GB “unlimited memes” bundle is not recommended on the
current snapshot policy. Do not shorten retention, discard predecessor recovery,
or silently assume deduped backups to make the price work. If the full allowed
workload cannot meet the bound, **do not launch this price**: bring measured
capacity/price alternatives or a separately approved, restore-proven recovery
change back to the operator. No bigger second plan conceals that constraint.

For Free, recommend an initial ceiling of **25 new admitted accounts**, only
after cost controls exist, and preserve the **$25/month project-wide variable
subsidy ceiling beyond fixed hosting** from VISION. At full 100 MB each, the same
illustrative backup multiplier consumes about $4.76/month before everything
else. This is not a forecast or approval for 25 registrations. Existing-user
grants, protected retained libraries and continuing recovery costs must be
accounted for too; do not move them off the ledger to make the pool pass.
A headcount cap alone is not spend control.

### Cost and abuse risks to bound before enrollment

| Risk | Required product/operating decision |
| --- | --- |
| Many free accounts | Closed/invite-bounded admission until identity/recovery and project-wide limits exist; account and network admission together. A new email is not a new unconstrained subsidy. |
| Tiny files, large decoded media, upload/delete churn | Enforce media-byte, item and new-save ceilings before expensive work; retain current constrained decoding and original-byte contract. Failed/duplicate attempts need separate CPU/request bounds even when not charged as new saves. |
| Automated novel queries | Account-wide limits cover browser, extension and MCP together; preserve bounded native scheduling and interactive/index fairness. No autoscaling or paid external-model fallback as an invisible response to overload. |
| Viral shares and crawlers | Owner-attributed delivery/request admission plus a global brake before serving bytes. Include range requests, request overhead and abuse reports; owner retrieval/export remains isolated from the public budget. |
| Retention amplification and churn | Budget snapshot copies, lifecycle lag, active and trashed media, temporary export/backup disk and protected archives. Include realistic worst-allowed retained bytes rather than originals alone. |
| Slow clients and expensive exports | Bound concurrent transfers, export work and time, with a usable recovery/export path. Document actual host/network limits and the degraded-state UX before selling capacity. |
| Payment failure, refund or dispute | Do not grant capacity from a browser redirect. Reserve for fee/refund risk; one dispute can exceed a month's price. No chargebacks passed on as surprise product overages. |
| Public harmful or infringing material | Provide reporting, takedown and owner notice before promoting public links; no discovery feed. Private-by-default does not remove hosting obligations. |

Do not fund margin with logging people's media or searches. Cost attribution can
use opaque owner IDs, operation/byte counts, queue time and error class without
retaining query text, filenames, direct source URLs, tokens or private thumbnails
in analytics. Public privacy claims must describe that actual data handling.

## A deliberately small future billing architecture

This is a responsibility sketch, not code, a schema migration or an instruction
to configure Stripe. Keep one provider, one paid monthly price and the native
account as the only library identity. Hosted Stripe Checkout and Customer Portal
are the proposed payment UI; Sploot owns the clear plan summary and usage state.

```text
signed-in owner -> Go billing endpoint -> allowlisted monthly Checkout
                                       -> provider-managed payment UI

verified provider events / reconciliation
                  -> owner-linked subscription record and entitlement
                  -> shared Go admission for browser, device and MCP work

Settings -> usage + paid-through/cancel state -> owner-scoped billing portal
         -> independent export / account-security / deletion controls
```

- **Identity:** explicitly map native user ID to provider customer/subscription
  IDs. Email is contact data, never mapping authority. Checkout/portal creation
  is browser-owner-only with the existing origin/auth boundary; device and
  personal tokens do not acquire billing rights. Never send media metadata,
  private paths or access tokens to the payment provider.
- **Commercial record:** retain the allowlisted price, subscription state,
  confirmed paid-through time, pending cancellation, grant expiry and processed
  event IDs. Provider events are signature-verified and idempotent; out-of-order
  delivery cannot resurrect an expired plan. Reconcile against current provider
  subscription/invoice state rather than trusting event arrival order.
- **Entitlement:** Go derives Free/Collector/protected-existing-library access
  from that record. It never derives paid status from `success=true`, a client
  plan name, a stale predecessor row or a shared email address. A checkout return
  can say “confirming payment” until server confirmation arrives. Existing
  confirmed access remains valid through its recorded period during an outage.
- **Admission:** one transactional owner ledger covers retained media/item
  capacity and new-save reservations across all clients. Reserve before
  ingestion, settle only on durable receipt, release on failure/duplicate, and
  reconcile crashes. Personal-plan limits must still allow verified receipt
  replay and duplicate outcomes without charging for a new asset. A separate
  bounded attempt/CPU/delivery budget protects
  work that does not result in a new save. Preserve current auth, idempotency,
  duplicate, storage-reserve and upload-disabled semantics; introduce explicit
  plan-limit responses rather than relabeling server storage failures.
- **No overage engine:** there are no metered invoices or automatic add-ons.
  A boundary pauses the relevant new work with a reason and recovery action.
  Global cost admission can be stricter than an individual allowance, so stop
  new enrollment before already-sold capacity is oversubscribed. Read/export
  reserves and retained obligations must be funded before selling new slots.
- **Control and recovery:** keep entitlement/usage records in native recovery,
  reconcile payment state before re-enabling paid writes after restore, and
  preserve the current rule that portable backups do not restore session/device/
  token authority. Recovery must neither duplicate a charge nor restore a
  canceled entitlement forever. The operator needs a reconciliation view, not
  a new analytics dashboard or parallel identity service.

## Launch gates and decisions

These gates are requirements, **not passed checks from this proposal**. A green
hosted code gate is necessary to publish code but is not proof that enrollment,
privacy, payments or unit economics are ready.

| Gate | Evidence required before the associated launch |
| --- | --- |
| Existing-user production service | Cutover acceptance is recorded in the [runtime operations guide](../../apps/web/docs/DEPLOYMENT.md#canonical-hosted-go-instance) and Linear MIS-46/MIS-47. It does not pass the consumer-design, enrollment or billing gates below. |
| Consumer design adoption | Operator reviews desktop/mobile shelf, search, Save, viewer and ink-mini states at actual scale in both themes. Browser/keyboard/reduced-motion evidence includes empty, failed, processing, partial batch and changed-account states. No private media in the review packet. |
| Capture distribution claims | Real release receipt for the marketed extension channel; actual phone/browser exercise for the claimed mobile path. Keep iOS Shortcut out of promises without signing and physical-device acceptance. |
| Open enrollment | Reliable ownership verification and account recovery, abuse/cost admission across every client, capacity reservation, privacy/terms/support/account-deletion process, and explicit approval to open registration. Migration claims alone do not solve consumer password recovery. |
| Public sharing promotion | Delivery attribution and hard bounds, abuse reporting/takedown, clear consent/revocation and an owner-access reserve. Preserved legacy links are not permission to advertise unbounded public hosting. |
| Paid offer | Native full-allowance/high-abuse cost evidence, retained-backup cost, actual host/network/payment/tax terms, shared-cost allocation and paid mix; at least 70% fully loaded gross margin and the approved free subsidy. No free-tier allowance offsets masking an unprofitable plan. |
| Billing launch | Operator approves exact offer, eligible regions, tax/refund/cancellation/grant policy and reconciled legacy subscriptions. Provider test-mode lifecycle evidence must cover initial failure, renewal, cancellation, duplicate/out-of-order events, outage, restore and above-limit export before any separately authorized live activation. |

### Decisions requested from the operator

1. **Experience:** approve the dense desktop shelf and two-column mobile browse
   with full-size viewer, the quiet three-action mobile dock, and restoration of
   the canonical toybox grammar in Go. Approve “bangers” as the visible favorites
   label with clear accessible wording; no automatic piles promise.
2. **Offer:** approve Free 100 MB / Collector $12 monthly for 1 GB and the stated
   item/save/search/public-delivery limits as hypotheses to validate, with one
   paid tier and no annual plan. Do not approve selling before the cost gate.
3. **Transition:** approve or revise the 12-month existing-account grant,
   protected-retained-material rule and associated subsidy. Reconcile actual
   legacy paid state before making a customer-specific promise.
4. **Consumer policies:** select supported launch regions and tax handling;
   recommendation is a narrow USD/domestic-card launch first if legally and
   commercially appropriate, not implied worldwide availability. Approve the
   seven-day grace, refund policy, account-recovery/deletion process, support
   contact and privacy/recovery-retention disclosures.
5. **Enrollment/publication:** after evidence, explicitly authorize enrollment,
   live billing configuration/activation and marketing/distribution separately.
   No part of the approved infrastructure cutover supplies those permissions.

The unresolved cost allocation, recovery amplification, public-account recovery,
consumer deletion/takedown and legacy subscription readbacks are real launch
blockers, not cosmetic details. Dense image-first UI can be reviewed and adopted
without opening those gates or turning the existing private library into a paid
experiment.

## Review basis

This is a source-and-contract review, not fresh runtime, device or economic
acceptance. Relevant sources:

- [Runtime operations](../../apps/web/docs/DEPLOYMENT.md),
  [DESIGN.md](../../DESIGN.md), and [VISION.md](../../VISION.md), distinguishing
  operating procedure, visual law and intent.
- Go [pages](../../apps/server/internal/web/templates/pages.html),
  [navigation/dialogs](../../apps/server/internal/web/templates/layout.html),
  [media cards](../../apps/server/internal/web/templates/media.html),
  [client state](../../apps/server/internal/web/static/app.js), and
  [current CSS](../../apps/server/internal/web/static/app.css).
- [Go route/auth/storage contract](../../apps/web/docs/API.md#local-go-route-ownership)
  and [published save/search scope](../../apps/web/docs/PUBLIC_API.md).
- [Shared media limits](../../packages/common/src/constants.ts),
  [extension pairing/receipt UI](../../apps/extension/entrypoints/popup/App.tsx),
  and [MCP handlers](../../apps/mcp/src/tools.ts).
- [Economic report](../../economics/REPORT.md),
  [snapshot runner](../../apps/server/scripts/backup-remote.py), and the public
  Stripe/R2 price pages linked above, read on 2026-09-10. Public list prices are
  assumptions, not operator account receipts or a rerun native economic model.
