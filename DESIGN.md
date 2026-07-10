# Sploot Design System

Sploot is a personal meme archive that sorts itself into semantic piles. The
interface is a toybox: every interactive object is a toy on a candy shelf,
built from ink shells, candy fills, and honest drop-height physics. Fun but
disciplined: loud toys, quiet ink-mini controls, and a machine that still
shows its work.

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

Sploot is a **toybox**: every interactive object is a toy.

Sploot should feel:

- Fun, chunky, and tactile: controls you want to press.
- Built from 3px ink shells, rounded corners, flat candy fills, and
  drop-height elevation sitting on a dotted candy shelf.
- Disciplined about hierarchy: loud toys (buttons, cards, the search console)
  over quiet ink-mini controls (icon buttons flat at rest until touched).
- Physically honest: surfaces lift and sink, shadows anchor and collapse,
  nothing floats or glows.
- Technically capable without sounding like generic AI infrastructure. The
  machine still shows its work (index, scorer/model, route, status); it is
  printed on toys now instead of exposed steel.
- Private by default.

Sploot should not feel:

- Like a generic centered SaaS hero, or calm minimal-SaaS.
- Like purple-on-black AI glassmorphism, gradient decoration, or glass chrome.
- Like the previous system: square brutalist slabs, 8px diagonal ink
  shadows, all-mono uppercase chrome. That grammar is dead.
- Like baby furniture: rounded and friendly never means unserious or vague.
- Like a creator monetization dashboard or enterprise file management.
- Like a meme casino or engagement-maximizing social feed.

## 4. Visual Language

### Core Metaphor

The toybox / candy shelf: the library is a shelf of toys the machine keeps
sorted. Every card, console, button, and chip is a physical toy with an ink
shell and a drop shadow straight down; the shelf behind them is a dotted
substrate, not grid paper.

- Shelf: the resting background is the polka-dot candy shelf
  (`.bg-sploot-workbench`).
- Toys: consoles, cards, stats, and buttons are panel-surface toys with 3px
  ink shells, rounded corners, and drop-height elevation.
- Ink minis: compact icon controls are flat 2px ink outlines at rest that
  fill with candy on hover and sink on press.
- Piles: self-organizing piles remain the durable product metaphor (see §1);
  pile filters render as pill chips over the feed.

### Color

Light and dark are both first-class on every surface. Dark mode is the night
shelf, not an inversion: candy values lift for AA contrast, shells turn warm
cream, and drop shadows deepen to near-black.

| Role | Token | Light | Dark | Use |
|---|---|---|---|---|
| Ink | `--sploot-ink` | `#1c1547` | `#fff3dc` | Text, shells, outlines, linework |
| Shelf | `--sploot-paper` | `#cfe7ff` | `#19143d` | Resting dotted background |
| Panel wash | `--sploot-paper-warm` | `#f1f7ff` | `#241d50` | Inner panel wash, rails |
| Toy surface | `--sploot-panel` | `#ffffff` | `#2d255e` | Cards, consoles, stats |
| Void | `--sploot-void` | `#1c1547` | `#090720` | Dark chrome (status bar) |
| Blue | `--sploot-blue` | `#087bc1` | `#63c3ff` | PRIMARY action |
| Cyan | `--sploot-cyan` | `#39b1ff` | `#8ed2ff` | Brand through-line, tab candy |
| Bubblegum | `--sploot-magenta` | `#ed58bd` | `#ff8ed7` | Bangers, attention, press fill |
| Banana | `--sploot-yellow` | `#ffdd00` | `#ffe45c` | Hover fill; the ONE highlight per viewport |
| Orange | `--sploot-orange` | `#d97500` | `#ffb13b` | Near-match / warning |
| Apple | `--sploot-lime` | `#138a50` | `#55d992` | The found / match ring |
| Cherry | `--sploot-red` | `#e52347` | `#ff5d73` | Error / destructive |
| Grape | `--sploot-purple` | `#7547e8` | `#a78aff` | Selected |
| Focus | `--sploot-focus` | `#4a25c7` | `#ffe45c` | Focus-visible outline |
| Shadow | `--sploot-shadow-color` | `#1c1547` | `#090720` | Every drop shadow |
| Dot | `--sploot-dot` | `rgba(255,255,255,0.68)` | `rgba(255,255,255,0.09)` | Shelf polka dots |

`--sploot-coral` aliases magenta and `--sploot-violet` aliases purple for
legacy component code and lint; new code uses the real names.

Color rules:

- Candy is a flat fill inside an ink shell, never a tint, gradient, or glow.
- Blue is the primary action color; cyan is the brand through-line.
- Yellow is the hover fill and the single highlight per viewport. Magenta is
  bangers, attention, and the press fill. Lime is reserved for the match
  ring; orange for near-match; red for destructive; purple for selected.
- Both themes ship with every surface. A component is not done until it has
  been seen on the light shelf and the night shelf.

### Typography

- Display: Bungee for headlines, section heads, and stat values. Toy display
  type; use it sparingly and never for controls or dense labels.
- Body: Baloo 2 for product copy, controls, and captions. Rounded and
  friendly without turning the controls into baby furniture.
- Machine: Space Mono for machine metadata only: labels, stats, vector
  indexes, routes, command hints.

Mono is no longer the default chrome voice. Body copy and control labels are
lowercase Baloo 2; uppercase mono appears only where the machine is speaking.

### Shape and Line

- Radius scale: `--sploot-radius` (18px) for cards, consoles, and stats;
  `--sploot-radius-inner` (10px) for media frames inside cards;
  `--sploot-radius-ctl` (9px) for ink-mini icon controls;
  `--sploot-radius-pill` (999px) for buttons, tabs, inputs, and pile chips.
  Square corners are dead.
- Shells carry structure: `--sploot-border` (3px ink) standard,
  `--sploot-border-thin` (2px ink) for compact controls and inner frames,
  `--sploot-border-thick` (4px ink) for primary / active surfaces.
- Elevation is drop height, straight down, never blurred: `--sploot-shadow`
  (5px resting), `--sploot-shadow-sm` (3px compact), `--sploot-shadow-lg`
  (9px hero).
- THE HOVER-PHYSICS LAW: on hover the surface lifts while the shadow stays
  anchored or extends; never translate a control so its shadow travels with
  it unchanged. On press the surface sinks and the shadow collapses. In
  tokens: hover is `--sploot-shadow-hover` (2px 7px) or
  `--sploot-shadow-hover-sm` (2px 5px); press is `--sploot-shadow-press`
  (0 1px).
- The found state is the lime match ring (`--sploot-match-ring`: 4px lime
  halo plus the 9px drop); near-match is a dashed orange outline.

## 5. Layout and Density

### Landing and Onboarding

The first viewport should show the product mechanism, not an abstract hero.
Preferred structure:

- Messy import pile on one side.
- Search or shuffle command in the center.
- Automatic semantic piles on the other side.
- The next section should be visible below the fold on desktop and mobile.

Landing copy should be short, literal, and product-owned. The landing leads
with the literal mechanic ("type words. get the picture." over "it's a search
box. for memes.") delivered deadpan on the candy shelf. "No folders. Just
vibes." remains the product label and supporting line; the copy explains the
mechanic: the user's saves are searchable without folders.

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

The workbench substrate is the dotted candy shelf, not grid paper. Toys sit
on the dots; the dots never compete with thumbnails.

### Mobile

Mobile should be thumb-first:

- One primary visual surface per screen.
- Persistent bottom command dock of candy chips with stable icon positions
  and 44px minimum targets.
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
| Search console | The centerpiece: type, find the match | 18px panel toy with ink machine titlebar and dashed machine footer; pill input inside; 9px hero drop |
| Meme cell (toy card) | One tile in the pile | 18px shell, candy filename tab, 10px inner media frame, caption row, action rail; seven states: default / match / near / dim / selected / loading / error |
| IconButton (ink mini) | Compact icon control: theme switcher, tile actions, toolbar icons | 34px, 2px ink outline, 9px radius, flat at rest; hover lifts with banana fill and a small anchored shadow; press sinks with bubblegum fill and no shadow; disabled drops to 36% opacity |
| TileActionRail | Heart / share / trash row on the cell | Owns space below the caption behind a dashed divider; never covers the media; renders inside the transformed card |
| Heart banger | Favorite marker | A little heart: filled means banger, outline means not; no badges, no sort, no loud marks |
| Stat block | A library readout | Mono key over Bungee value; 18px toy with 5px drop |
| Status bar | The machinery on display | Ink row: index / scorer-model / route / status |
| Button | Actions | Pill toy, 3px shell, 5px drop; variants map to the candy palette; obeys the hover-physics law |
| Sticker tab | Label, tag, status | Pill candy chip with 2px shell; short lowercase text |
| Pile chip | Self-organizing grouping filter | Pill, panel fill, 5px drop; selected fills banana (`--sploot-pile-selected`) |
| Command dock | Mobile primary actions | Candy chips at 44px (`--sploot-touch-target`): pill rounding, 2px drop, extend on hover, click flush |
| Empty state | First-use and zero-result education | Panel toy showing the product action, not generic illustration |

### Operator Rules (design law)

These five rules are standing operator law from lab 034. They bind every
surface and every future design pass:

1. Compact icon buttons (theme switcher, banger/share/trash tile actions) are
   a CRITICAL component; any design work must exhibit them at real scale with
   full states in both themes.
2. Banger = a little heart (filled = banger, outline = not). No banger
   badges, no banger sort, no loud marks.
3. THE HOVER-PHYSICS LAW: on hover the surface lifts while the shadow stays
   anchored or extends; never translate a control so its shadow travels with
   it unchanged. On press the surface sinks and the shadow collapses.
4. Match/state/banger markers render INSIDE the transformed card element;
   they move with the card on hover, never anchored outside it.
5. Light and dark are both first-class on every surface.

### Implemented Wrappers

Implemented product wrappers live in `apps/web/components/sploot`:

- `SearchField` — the search console; the landing and app centerpiece.
- `MemeCell` — one toy card in the pile with its reveal states.
- `IconButton` — the ink-mini compact control; `TileActionRail` composes it
  into the cell's heart / share / trash row.
- `StatBlock` — the library readout (mono key over display value).
- `StatusBar` — the machinery row (index / scorer / mode / route / status).
- `StickerTab`, `ClusterPile`, `PileMark`, `AtlasLandingHero` — pill chips,
  pile previews, brand mark, landing hero.
- `BangerStamp` is legacy: the heart in `TileActionRail` is the only banger
  marker going forward.

New product surfaces should compose these wrappers before creating one-off
console, cell, chip, pile, banger, or stat treatments.

### Motion

Motion tokens live in `apps/web/app/globals.css` and are the only sanctioned
timing values:

| Token | Value | Use |
|---|---|---|
| `--sploot-motion-fast` | 130ms | Hover/press physics on controls |
| `--sploot-motion-base` | 150ms | Card lifts, pops, small reveals |
| `--sploot-motion-panel` | 200ms | Panels, sheets, stamps |
| `--sploot-motion-cluster` | 300ms | Grid reshuffle/cluster moves |
| `--sploot-ease-out` | cubic-bezier(0.2, 0.8, 0.2, 1) | Default deceleration |
| `--sploot-ease-snap` | cubic-bezier(0.34, 1.56, 0.64, 1) | Springy squash, stretch, settle |

Named utilities:

- `.sploot-press` / `.sploot-press-sm`: the hover-physics law for toys (lift
  with anchored shadow, sink with collapsed shadow) at 5px and 3px resting
  drops.
- `.sploot-ctl`: ink-mini physics (flat rest, candy hover, bubblegum press).
- `.animate-sploot-stamp`: match/state stamp punch (scale-down rotate-in).
- `.animate-sploot-pop`: chips and labels appearing.
- `.animate-sploot-slide-up`: panels, sheets, and docks entering.
- Grid tiles cascade with `fadeInScale` staggered at 30ms per tile, capped at
  15 tiles so paginated content never waits.

A global `prefers-reduced-motion: reduce` override collapses all animations
and transitions and removes travel, squash, and bounce; state changes remain
immediate. Do not add per-component opt-outs.

Interaction rules:

- Motion is physics, on interaction only: lift, sink, squash, settle. Never
  animate idle data.
- Motion must explain sorting, clustering, uploading, or selection.
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

- All focus states must be visible: a 4px `--sploot-focus` outline at 3px
  offset (0 offset on inputs to avoid double borders). Global rules in
  `apps/web/app/globals.css` own this; do not restyle focus per component.
- Interactive targets must be at least 44px on mobile
  (`--sploot-touch-target`).
- Color cannot be the only indicator for favorite, selected, failed, or active
  states. The heart uses fill, the match state uses a badge plus the ring.
- Status and count values should use tabular numerals when compared.
- Thumbnail grids must preserve aspect ratio to avoid layout shift.
- Cluster canvases need keyboard-accessible list fallbacks.
- Dark and light themes must both meet WCAG AA for text and controls; the
  dark candy palette is lifted specifically to hold AA on the night shelf.

## 9. Evidence and Governance

Current design direction is based on:

- `vision.md`, especially the personal meme library, semantic search, shuffle,
  bangers, and goofy/private positioning, plus the Meme Atlas mechanics and
  No Folders Just Vibes lineage recorded in `design-contract.md`.
- Design lab 034 (`explorations/lab-034-hypermax/`): round 1 (2026-07-09)
  picked AFD-1 overprint and AFD-3 toybox as co-winners; round 3 (2026-07-09)
  locked AFD-3 toybox; round 4 (2026-07-10) locked AFD-8 "ink minis" as the
  compact-control grammar, with AFD-9's candy-chip treatment adopted for the
  44px mobile dock only.
- Live tokens and physics utilities in `apps/web/app/globals.css`.

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
- Blurred or soft shadows. Elevation is a hard drop straight down.
- Square brutalist slabs. The neo-brutalist grammar is dead; every surface
  uses the radius scale.
- 8px diagonal offset ink shadows, or any resting shadow that travels
  diagonally. Resting drops are straight down.
- Hover that translates a control with its shadow unchanged. The
  hover-physics law is absolute: lift with anchored shadow, sink with
  collapsed shadow.
- Banger badges, banger sorts, or loud banger marks. The heart is the only
  banger marker.
- Uppercase mono as the default chrome voice. Mono is machine metadata only.
- Match/state/banger markers anchored outside the card transform.
- Tints, washes, or pastel decoration in place of flat candy fills inside
  ink shells.
- Calm minimal-SaaS, or a generic centered hero when the product surface can
  lead.
- Uniform fade/float motion, or animating idle data. Motion is physics on
  interaction.
- Stock illustrations where real product state or the doodle stand-ins are
  clearer.

Now allowed (banned under the previous system):

- Rounded corners everywhere, on the 18 / 10 / 9 / pill radius scale.
- Drop shadows straight down, at the 5 / 3 / 9px drop heights.
