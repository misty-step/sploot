# Adopt the design system substrate and re-cut the landing: "Swiss chrome, feral contents"

Priority: P2 · Status: ready · Estimate: XL

> **Groom reframe (2026-06-22) — UNBLOCKED.** The package exists: PR #228 wires
> `@misty-step/aesthetic` (v2.6.0). A design investigation found the tension and
> its resolution: the aesthetic is *instrument-panel restraint* (it forbids
> oversized hero type, filled colored pills, and ambient motion) — structurally
> opposed to "hyper-maximalist," **and** opposed to sploot's own shipped grammar
> (`StickerTab`/`BangerStamp` are filled pills; the Bebas hero is oversized
> display; `splootStamp` overshoots). BUT the aesthetic *names sploot as its
> canonical "loud" adopter*. Resolution → **"Swiss chrome, feral contents":**
> adopt the disciplined substrate for free quality (AA contrast contracts,
> light/dark flip, hairline primitives, Geist), and concentrate ALL maximalism
> into high-variance **content objects** (meme tiles, sticker tabs, stamps, pile
> borders) + **three earned motion beats** — the frame is disciplined; the stuff
> inside the frame is unhinged. The operator wants delight, fun, hyper-maximalism;
> this is how to get it *without* fighting the substrate on every upstream bump.
> The vibe is already codified in DESIGN.md §7 ("density of delight, not density
> of words").

## Goal

Sploot's visual layer is built on the `@misty-step/aesthetic` substrate with a
documented sploot "loud layer" on top, and the landing page is re-cut as a
maximalist showcase — cohesive, distinctive, goofy-maximalist, and honest about
shipped features.

## Oracle

- [ ] The design system package is a dependency; sploot's tokens/components
      map onto it with the bespoke `--sploot-*` layer reduced to genuine
      brand deltas (an explicit mapping doc says what stayed and why).
- [ ] Core surfaces (landing, /app workbench, detail page, settings,
      changelog) render on the new system; `pnpm lint:design` (updated to
      enforce the new system) green.
- [ ] Landing page redesigned on the new system: feature-true copy, real
      meme visuals, working how-it-works, pricing section once 031 lands.
- [ ] Release-note markdown on /changelog renders properly (links, lists)
      instead of raw syntax — fold this cosmetic fix into the pass.
- [ ] Evidence packets with before/after screenshots, desktop + mobile, for
      each surface.

## Art direction — "Swiss chrome, feral contents" (concrete)

- **Type:** keep aesthetic's Geist body (weight-driven hierarchy) for ~95% of
  surfaces; reintroduce ONE sploot display register — a fat grotesque, jet-black
  weight, tightly packed, with an occasional hard offset shadow
  (`--sploot-sticker-shadow`) — used only on the landing hero + section stamps.
  Geist Mono carries all chrome/stats/labels (the "terminally online terminal"
  voice). This is a *declared deviation* from the aesthetic's no-display-type
  invariant.
- **Color:** ink-on-paper is the resting state; sploot spends loudness as
  *frequency, not new hues* — cyan/coral/violet liberally on tiles, sticker tabs,
  pile borders, stamps; lime as the rare highlighter beat (one thing per
  viewport).
- **Density:** the landing is a bento **wall of real meme tiles** at high
  variance (the `ClusterPile` ±1–2° jitter), not stacked SaaS hero sections.
- **Motion budget = exactly three beats, all already built, all resolve-once
  (no loops, no ambient drift):** (a) `splootStamp` overshoot on banger-mark;
  (b) staggered tile cascade on pile reshuffle; (c) a "summon" beat — typing a
  query physically pulls the matching tile out of the messy pile into focus.

## Children

1. **Land the substrate + the sploot loud-layer mapping doc (M).** Merge #228;
   write the token-mapping doc this epic requires, declaring sploot's *permitted
   deviations* (the one display register, the filled-pill sticker/stamp
   exception, the three motion beats) as named project-token overrides on top of
   the aesthetic invariants. Pin the tag (v2.6.0); retire legacy
   `electric-lime`/`hot-pink`/`cyber-blue` names. This turns an ambiguous re-skin
   into a contract and stops #228 from silently flattening the brand.
2. **Re-cut the landing as Summon hero + PileWall (L).** Replace the 4-section
   SaaS scroll (`app/page.tsx`) with a two-screen loud-on-quiet narrative: Summon
   hero (query pulls the meme out of the pile) → PileWall (a real, scrollable
   meme bento proving the product) → one mono "how" strip → CTA stamp. New
   components `SummonField`, `PileWall`, `EndOfPileMarker`. Reuse
   `AtlasLandingHero` + real seeded landing memes (021).
3. **Harden the component library into the delight system + fix the gate (M).**
   Complete state matrices (hover/focus/active/loading/empty/error/reduced-motion)
   for the five wrappers, add `EndOfPileMarker` + the three motion beats as
   documented utilities, and **fix `lint:design`** (one-char mismatch:
   `scripts/check-design-system.mjs:113` wants `"Pile / cluster"` but
   `component-library.md:74` reads `"Pile / Cluster"`). **Absorbs ticket 043.**
4. App chrome + workbench + tile/detail/settings migration onto the substrate;
   fold in the /changelog markdown-rendering fix.

## Progress 2026-06-26

The neo-brutalist search-console landing, `/styleguide`, live wrapper docs,
token docs, and `pnpm lint:design` repair shipped as the first visual-system
slice. This closes absorbed ticket 043 and gives the remaining epic a real
surface to extend.

Still open: package/substrate dependency mapping, `/app` workbench,
detail/settings/changelog migration, pricing after 031, and full-surface
before/after evidence.

## Operator converge 2026-07-09

Round 1 of `explorations/lab-033-full-pass` locked the implementation direction:

- Keep the console landing, command-bar workbench, drop-zone intake, centered
  auth card, and editorial detail route.
- Keep neo-brutalist zine as the base; sticker-bomb remains the only challenger.
  Compact/icon controls get a flat, lighter grammar instead of inheriting slab
  borders, shadows, and lift motion.
- Replace CSS doodle media with credible meme fixtures, preserve every source
  aspect ratio, and move banger/relevance metadata outside the image frame.
- Settings stays close to shipped, with control-panel toggles where needed and
  hazard treatment reserved for destructive actions.
- Lab baselines must reproduce the real product structure before they can be
  labeled `shipped`.

## Notes

No longer blocked — the package exists and #228 wires it. **Gate #228 behind
child 1's deviation doc**: merging it as-is swaps Bebas→Geist and deletes the
display face, shipping a *quieter* sploot (the opposite of the brief). Do not let
#228 be the final landing state. Design investigation 2026-06-22; relates to the
goofy-maximalist vibe in VISION.md and DESIGN.md §7. Risk: "delightful motion" +
meme content is one bad call from "meme casino" (anti-goal, DESIGN.md:52) — hold
the resolve-once rule and the three-beat budget.
