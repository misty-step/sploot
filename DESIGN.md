# Sploot Design System

Sploot is a personal meme archive that sorts itself into semantic piles. The
interface should feel like a useful, private image workbench with zine energy:
paper-grid surfaces, ink lines, sticker labels, sharp controls, and enough
weirdness to avoid corporate AI-search sameness.

## 1. Product Intent

Sploot helps people save, search, shuffle, and rediscover personal meme
collections without building folders by hand. The design system supports three
jobs:

- Find a saved meme from fuzzy memory.
- Browse automatic semantic neighborhoods.
- Keep and share favorite "bangers" without turning the product into a social
  network or creator tool.

The durable product metaphor is self-organizing piles, not folders. Search,
shuffle, bangers, and future clustering features should all reinforce that the
collection has a visible structure that emerges from the user's own saves. The
working label for this direction is No Folders Just Vibes.

## 2. Audience and Context

Primary users are people with messy personal image collections spread across
camera rolls, screenshots, messages, bookmarks, and downloads. They want speed,
privacy, and recall more than enterprise administration.

Design priorities:

- Personal and fast before polished and formal.
- Image-first: thumbnails are the product's primary visual material.
- Mobile use matters because saving and sharing often happen from phones.
- Desktop use should behave like a high-density archive workbench.

## 3. Brand Attributes

Sploot is **neo-brutalist**: it admits it is a database, and it is loud about it.

Sploot should feel:

- Loud, blunt, and deadpan-funny.
- Like a machine on display: structure exposed, the search mechanic and its
  machinery (index, scorer/model, route, status) shown, not hidden behind soft
  chrome.
- Built from thick ink borders, hard offset shadows, square corners, and
  saturated color blocks on unbleached paper.
- Technically capable without sounding like generic AI infrastructure.
- Private by default.

Sploot should not feel:

- Like a generic centered SaaS hero, or calm minimal-SaaS.
- Like soft, rounded, drop-shadowed product chrome.
- Like purple-on-black AI glassmorphism, gradient decoration, or pastel.
- Like a creator monetization dashboard or enterprise file management.
- Like a meme casino or engagement-maximizing social feed.

## 4. Visual Language

### Core Metaphor

Use an "exposed database" language: the interface admits it is a machine that
finds your memes, and shows its work.

- Console: the search box is a labeled console with an ink titlebar; the
  machinery (index size, scorer/model, route, and status) is on display, not
  hidden. Signed-out demos must label sample data as demo data.
- Cells: meme tiles are bordered cells with a filename + vector-index header and
  match / near / dim / default states.
- Stamps and stickers: banger marks, labels, and status are saturated blocks
  slammed on with thick borders and hard offset shadows.
- Piles: self-organizing piles of cells, grouped by what they mean (the durable
  product metaphor; see §1).

### Color

Canonical colors are semantic, and they arrive as flat saturated blocks, never
as tints or gradients.

| Role | Token | Value | Use |
|---|---|---|---|
| Ink | `--sploot-ink` | `#0a0a0a` | Text, all 4-6px borders, linework |
| Paper | `--sploot-paper` | `#f3efe4` | Unbleached resting surface |
| Paper warm | `--sploot-paper-warm` | `#e9e4d6` | Secondary surface / workbench grid |
| Void | `--sploot-void` | `#0a0a0a` | Dark surface (status bar, dark mode) |
| Blue | `--sploot-blue` | `#1f4cff` | Primary action, the search console field |
| Cyan | `--sploot-cyan` | `#00e5d4` | Brand through-line, secondary accent |
| Magenta | `--sploot-magenta` | `#ff2d9b` | Bangers, favorites, attention (`--sploot-coral` aliases here) |
| Yellow | `--sploot-yellow` | `#ffe600` | The single highlight per viewport (the query shelf) |
| Orange | `--sploot-orange` | `#ff5a1f` | Near-match / warning |
| Lime | `--sploot-lime` | `#9cff2e` | The found / match ring (`--sploot-match-ring`) |
| Grid | `--sploot-grid-line` | — | Grid paper and low-emphasis structure |

Color rules:

- Resting state is ink on unbleached paper. Color is a flat block behind a
  border, never a tint, gradient, or glow.
- Blue is the primary action color; cyan is the brand through-line.
- Magenta is bangers / favorites / attention. Yellow is the ONE highlight per
  viewport. Lime is reserved for the match ring; orange for near-match.
- Saturation is full. No pastels, no gradients, no neon glow.

### Typography

- Display: Archivo Black for headlines, section heads, and stat numbers
  (uppercase, letter spacing `0`).
- Mono: Space Mono for all chrome, labels, stats, command hints, and technical
  metadata (uppercase, letter spacing `0`).
- Body: Space Grotesk for readable product copy and controls.

Do not use display type for dense control labels, table content, metadata, or
long explanatory copy.

### Shape and Line

- Default radius is square (`0`). The only rounded exceptions are full circles
  (status dots, avatars) and unmigrated third-party widgets.
- Borders carry ALL structure: `--sploot-border` (4px ink) standard,
  `--sploot-border-thick` (6px ink) for primary / active surfaces.
- Shadows are hard offset only: `--sploot-shadow` / `-sm` / `-lg` is a solid
  ink block offset down and right. Never blurred, never soft. No elevation by
  blur. Buttons press: lift on hover, slam on active.
- The found state is the lime match-ring (`--sploot-match-ring`); near-match is
  an inset orange ring.

## 5. Layout and Density

### Landing and Onboarding

The first viewport should show the product mechanism, not an abstract hero.
Preferred structure:

- Messy import pile on one side.
- Search or shuffle command in the center.
- Automatic semantic piles on the other side.
- The next section should be visible below the fold on desktop and mobile.

Landing copy should be short, literal, and product-owned. The landing leads
with the literal mechanic — "type words. get the picture." over "it's a search
box. for memes." — deadpan inside Swiss chrome. "No folders. Just vibes."
remains the product label and supporting line; the copy explains the mechanic:
the user's saves are searchable without folders.

### App Workbench

Desktop `/app` should prioritize repeated use:

- Tight top command/search bar that leaves the viewport to the image feed.
- Left or top filter controls for upload, search, shuffle, bangers, tags, and
  sort.
- Central shuffled all-memes image grid as the default browse surface.
- Automatic piles as compact suggestion filters over that feed, never as a
  replacement for the full library. Counts must distinguish the true library
  total from per-pile subsets, and weak labels should read as tentative.
- Optional right inspector for selected asset or selected group.
- Bottom or top status line for counts, queue, storage, and embedding state.

### Mobile

Mobile should be thumb-first:

- One primary visual surface per screen.
- Persistent bottom command dock with stable icon positions.
- Search and sorting as sheets, not cramped inline controls.
- Extra safe-area padding around retry/upload/status rows.
- Cluster navigation can become horizontal piles or stacked tabs.

### Density Dials

- Landing: medium density, high visual variance, low ambient motion.
- Desktop app: high density, medium visual variance, low motion.
- Mobile feed: medium density, medium variance, low-to-medium interaction
  motion.
- Share/detail pages: medium density, high focus on the selected image.

## 6. Components and Interaction

Canonical component grammar:

| Component | Purpose | Visual Rule |
|---|---|---|
| Search console | The centerpiece: type, find the match | Ink titlebar + LED squares; yellow query shelf; live match reveal with lime ring |
| Meme cell | One tile in the pile | Thick ink border; filename + vector-index header; match / near / dim / default states |
| Stat block | A library readout | Mono key over Archivo-Black value; bordered, hard offset shadow |
| Status bar | The machinery on display | Dark row: index / scorer-model / route / status |
| Button | Actions | Thick border, hard offset shadow; lift on hover, slam on active |
| Command dock | Mobile primary actions | Fixed positions, icon-first, 44px minimum targets |
| Pile filter / cluster | Self-organizing grouping | Bordered pile of cells; selected reads as a thick border |
| Sticker tab | Label, tag, status | Saturated block, thick border, hard shadow, mono uppercase |
| Banger stamp | Favorite or top-ranked marker | Magenta block slammed on like a rubber stamp |
| Empty state | First-use and zero-result education | Show product action and example pile, not generic illustration |

Implemented product wrappers live in `apps/web/components/sploot`:

- `SearchField` — the search console; the landing and app centerpiece.
- `MemeCell` — one bordered tile in the pile, with match / near / dim states.
- `StatBlock` — a bordered, hard-shadow library readout (demo vectors / folders / scorer).
- `StatusBar` — the machinery row (index / scorer / mode / route / status).
- `StickerTab`, `BangerStamp`, `ClusterPile`, `PileMark`, `AtlasLandingHero` —
  re-skinned neo-brutalist.

New product surfaces should compose these wrappers before creating one-off
console, cell, sticker, pile, banger, or stat treatments.

### Motion

Motion tokens live in `apps/web/app/globals.css` and are the only sanctioned
timing values:

| Token | Value | Use |
|---|---|---|
| `--sploot-motion-fast` | 75ms | Hover/press feedback |
| `--sploot-motion-base` | 150ms | Tile lifts, pops, small reveals |
| `--sploot-motion-panel` | 240ms | Panels, sheets, stamps |
| `--sploot-motion-cluster` | 360ms | Grid reshuffle/cluster moves |
| `--sploot-ease-out` | cubic-bezier(0.2, 0.8, 0.2, 1) | Default deceleration |
| `--sploot-ease-snap` | cubic-bezier(0.34, 1.56, 0.64, 1) | Sticker/stamp overshoot |

Named utilities:

- `.animate-sploot-stamp`: banger/favorite stamp punch (scale-down rotate-in).
- `.animate-sploot-pop`: sticker tabs and labels appearing.
- `.animate-sploot-slide-up`: panels, sheets, and docks entering.
- Grid tiles cascade with `fadeInScale` staggered at 30ms per tile, capped at
  15 tiles so paginated content never waits.

A global `prefers-reduced-motion: reduce` override collapses all animations
and transitions; do not add per-component opt-outs.

Interaction rules:

- Motion must explain sorting, clustering, uploading, or selection.
- Respect `prefers-reduced-motion`.
- Do not animate idle data.
- Search and shuffle should feel fast; loading states should be compact and
  stateful rather than theatrical.
- Cluster labels are suggestions, not user-owned taxonomy. Avoid implying the
  system creates fixed folders unless the user explicitly saves one.
- The library should feel feed-like and thumbable, but not social or addictive:
  reduce persistent header chrome before adding decorative motion.

## 7. Content Voice

The voice is hypermaximalist, terminally online, zoomer meme-culture brainrot —
delivered deadpan inside Swiss chrome. Lowercase everything except display
headlines. The product talks like the person whose camera roll it is:
self-aware, a little feral, never corporate. Every surface gets one moment of
personality; density of delight, not density of words.

Lexicon (use naturally, never all at once):

- "no folders. just vibes."
- "type words. get the picture." / "it's a search box. for memes."
- "bangers", "goated", "unhinged", "feral", "cursed", "brainrot"
- "the pile" (the library is always the pile)
- "go touch grass", "zero thoughts", "hall of fame"
- "upload chaos", "shuffle the pile", "similar saves"

Rules:

- **Feature-true copy.** Visible UI and marketing claims describe what ships
  today. Automatic piles are allowed only where the backed `GET /api/piles`
  surface can produce named clusters from ready image embeddings. Search-result
  groupings remain "piles on demand"; do not imply automatic sorting when the
  pile service is unavailable or a library has too few embedded assets.
- Deadpan over exclamation. The humor lands because the chrome is Swiss.
  Never more than one slang term per sentence; brainrot is seasoning, not soup.
- Skip slang with a short shelf life or fellow-kids energy (no "rizz", no
  "skibidi", nothing that reads as a brand doing a bit).
- Empty states, end-of-list markers, errors, and loading copy are the prime
  personality slots. Buttons and labels stay short and functional.

Avoid:

- "AI-powered solution"
- "revolutionize your workflow"
- "if published"
- "placeholder"
- "future layer"
- "metric to confirm"
- Meta-copy that explains implementation uncertainty.

Use "automatic" or "semantic" when the mechanism matters. Do not overuse "AI"
as the brand.

## 8. Accessibility and Responsiveness

- All focus states must be visible and use the cyan focus ring.
- Interactive targets must be at least 44px on mobile.
- Color cannot be the only indicator for favorite, selected, failed, or active
  states.
- Status and count values should use tabular numerals when compared.
- Thumbnail grids must preserve aspect ratio to avoid layout shift.
- Cluster canvases need keyboard-accessible list fallbacks.
- Dark and light themes must both meet WCAG AA for text and controls.

## 9. Evidence and Governance

Current design direction is based on:

- `vision.md`, especially the personal meme library, semantic search, shuffle,
  bangers, and goofy/private positioning.
- Live production landing screenshots captured during the June 6, 2026 design
  pass.
- Existing tokens and CSS in `apps/web/app/globals.css`.
- Generated design boards combining Meme Atlas mechanics with No Folders Just
  Vibes aesthetics.

Governance rules:

- Read this file before product-facing UI work.
- Update this file when durable visual facts change: tokens, layout density,
  component grammar, content voice, accessibility rules, or anti-patterns.
- Record source/provenance changes in `design-contract.md`.
- Run `pnpm lint:design` before shipping visual-system changes. The lint must
  require both the contract artifacts and at least one concrete product-surface
  adoption point. It also covers extension popup token drift because saving
  from Chrome is part of the product surface.
- Exploratory design catalogs stay on branches or local artifacts until
  production movement is explicitly approved.

## Anti-Patterns

Do not add:

- Gradient text.
- Purple-on-black AI hero gradients, or any gradient as decoration.
- Glassmorphism / `backdrop-blur` as decoration.
- Decorative blobs, bokeh, or mesh gradients.
- Soft or blurred shadows. Shadows are hard offset ink blocks only.
- Rounded corners on product surfaces (square is the default; full circles and
  unmigrated third-party widgets are the only exceptions).
- Pastel or muted palettes. Color is full-saturation flat blocks.
- Calm minimal-SaaS, or a generic centered hero when the product surface can lead.
- Uniform fade/float motion. Motion is hard and on-interaction (press, match lock).
- Stock illustrations where real product state or the doodle stand-ins are clearer.
