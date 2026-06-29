# Vision

## One-liner
A personal multimedia meme library you can capture from anywhere, search with
words instead of folders, and that, over time, learns what you find funny.

## Who it's for
Built first for one person: someone whose memes are scattered across Twitter
bookmarks, Google Photos, camera rolls, screenshots, downloads, desktop folders,
and group chats, who just wants to *find them again*. Designed so it could open
to other hoarders later — but me-first, openable, not a creator/marketer tool
and not a social network.

## North star
The meme app that **knows your taste**: search naturally, shuffle endlessly, and
eventually generate new memes tailored to your humor. "Knows your taste" is the
soul and the long arc — be honest that today it's only a first cut: the library
sorts into fixed categories and ranks off a single averaged signal, not genuine
per-user taste yet (the real version is ahead — backlog 037). Don't describe the
aspiration as if it shipped.

## What we're chasing now: make the basics irresistible
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

## The arc
1. **Now** — effortless capture + instant, accurate retrieval. The delightful
   basics, including frictionless share *back out* to a group chat.
2. **Next** — real taste: cluster a library by *your* humor, rank by it.
3. **Someday** — generate new memes from your taste profile and existing meme
   graph. Downstream of #2; not planned around until taste is real.

## How we build it
Sploot is built to be **run end-to-end by an AI agent**. Schema-to-prod is one
merge (migrations ride the deploy), operations are token-on-disk commands rather
than dashboard clicks, and the agent can verify and recover what it ships.
Sequestered secrets and manual deploy steps are bugs to fix, not facts of life.
This is a first-class constraint — see `AGENTS.md` and backlog 036/041.

## Non-goals
- Not a creator/marketer tool; not a social feed.
- No engagement extraction or dark patterns — it's a goofy personal utility.
- Monetization is deferred until there are other users, and never holds memes
  hostage (export always works). Storage-based pricing is the likely default
  because media costs should be covered honestly.
- No multi-user/social surface built speculatively before it's needed.

## Vibe
Goofy. Fun. Personal. Doesn't take itself too seriously.

---
*Last updated 2026-06-21 (/vision). Supersedes the 2026-01-25 draft, which listed
taste/piles as delivered differentiators when they shipped only as a shallow
first cut.*
