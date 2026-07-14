# Vision

## One-liner
A personal multimedia meme library you can capture from anywhere, search with
words instead of folders, and that, over time, learns what you find funny.

## Who it's for
Built first for one person: someone whose memes are scattered across Twitter
bookmarks, Google Photos, camera rolls, screenshots, downloads, desktop folders,
and group chats, who just wants to *find them again*. Sploot stays me-first rather
than growth-led, but public signup is part of the product: other hoarders should
be able to use it without an invitation. That openness must never create an
open-ended liability for the operator.

## North star
The meme app that **knows your taste**: search naturally, shuffle endlessly, and
eventually generate new memes tailored to your humor. "Knows your taste" is the
soul and the long arc — be honest that today it's only a first cut: the library
sorts into fixed categories and ranks off a single averaged signal, not genuine
per-user taste yet (the real version is ahead — Powder card `sploot-037`). Don't
describe the aspiration as if it shipped.

## What we're chasing now: make the basics irresistible and safe to open
Capture and retrieval come first. The product wins or loses on two everyday
moments:
- **Capture** — a meme I see anywhere lands in sploot in one tap, deduped, from
  where it already lives (extension, iOS shortcut, screenshot, paste, upload,
  share sheet, bulk import).
- **Retrieval** — I describe a meme in plain words and it's the first result,
  instantly; shuffle resurfaces forgotten gems; "more like this" actually is;
  relationships between memes become visible without manual folder work.

Taste intelligence and generation are the soul, but they only earn their place
once capture and retrieval feel effortless.

Open signup also has a release gate: every cost-bearing action must be metered,
attributed, and bounded before strangers can create it. Storage, renditions and
delivery, embeddings, vector work, compute, auth, and telemetry all count. A
per-user quota is not enough; global circuit breakers must cap the downside from
many accounts, malicious traffic, or a viral public link.

## Sustainable openness
Sploot sells understandable storage capacity, not a confusing meter for every
search. Ordinary capture, indexing, retrieval, and sharing are bundled inside a
plan's enforceable usage envelope.

- One small, useful, cardless free tier is a deliberate subsidy. Two monthly
  paid tiers cover a serious library and an unusually large one; exact limits
  and prices come from measured economics, not marketing guesses.
- Every paid tier must retain at least 70% gross margin at its full allowed
  usage, including payment fees and all variable infrastructure costs. The
  initial project-wide free subsidy is capped at $25/month beyond fixed hosting.
- Approaching a limit produces clear warnings. Crossing it stops new
  cost-creating work and offers an upgrade; there are no silent overages.
  Existing memes remain readable, exportable, and deletable.
- Trash counts toward storage until it is emptied or automatically purged after
  30 days. Public sharing is explicit, revocable, delivery-bounded, and backed
  by reporting and takedown controls; Sploot never becomes a discovery feed.

## The arc
1. **Now** — prove an economically safe architecture, then open the delightful
   basics: effortless capture, instant accurate retrieval, and frictionless
   sharing *back out* to a group chat.
2. **Next** — real taste: cluster a library by *your* humor and rank by it, once
   the added cost stays inside the same economic boundary.
3. **Someday** — generate new memes from your taste profile and existing meme
   graph. Downstream of #2; not planned around until taste is real.

## How we build it
Sploot is built to be **run end-to-end by an AI agent**. Schema-to-prod is one
merge (migrations ride the deploy), operations are token-on-disk commands rather
than dashboard clicks, and the agent can verify and recover what it ships.
Sequestered secrets and manual deploy steps are bugs to fix, not facts of life.
This is a first-class constraint — see `AGENTS.md` and Powder cards 036/041.

The current implementation is evidence and migration material, not an
architectural constraint. Provider and homegrown alternatives compete on cost,
retrieval quality, performance, and operational burden against representative
workloads. Preserve user data and good product contracts; replace infrastructure
only when the measured trade is worth it, and migrate in reversible vertical
slices. Optimize total ownership cost, not the smallest vendor invoice.

## Non-goals
- Not a creator/marketer tool; not a social feed.
- No engagement extraction or dark patterns — it's a goofy personal utility.
- Not growth-led SaaS. Billing and limits protect openness; hypothetical users
  do not get to distort the me-first product.
- No data hostage-taking. Limits, cancellation, or billing failure never remove
  read, export, or delete access.
- No multi-user collaboration or social surface built speculatively before it's
  needed; public accounts and explicit share links do not turn Sploot into a
  network.

## Vibe
Goofy. Fun. Personal. Doesn't take itself too seriously.

---
*Last updated 2026-07-14 (/vision + /grilling + /groom). Supersedes the
2026-06-21 posture that deferred monetization without making open signup's cost
boundary a release gate.*
