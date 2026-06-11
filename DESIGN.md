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

Sploot should feel:

- Goofy, direct, and personal.
- Technically capable without sounding like generic AI infrastructure.
- Zine-like and tactile, with real product state doing the visual work.
- Private by default.

Sploot should not feel:

- Like a generic centered SaaS hero.
- Like a creator monetization dashboard.
- Like enterprise file management.
- Like purple-on-black AI glassmorphism.
- Like a meme casino or engagement-maximizing social feed.

## 4. Visual Language

### Core Metaphor

Use a "self-organizing zine archive" language:

- Piles: grouped thumbnails with imperfect but readable boundaries.
- Atlas: optional semantic lines and neighborhood labels when showing
  relationships.
- Stickers: labels, banger marks, status stamps, and short annotations.
- Workbench: dense command surfaces for repeated use.

### Color

Canonical colors are semantic, not decorative.

| Role | Token | Use |
|---|---|---|
| Ink | `--sploot-ink` | Primary text, hard borders, linework |
| Paper | `--sploot-paper` | Main light-mode surface |
| Paper warm | `--sploot-paper-warm` | Secondary surface or landing bands |
| Void | `--sploot-void` | Dark-mode surface |
| Cyan | `--sploot-cyan` | Search, active controls, similarity lines |
| Coral | `--sploot-coral` | Bangers, favorite stamps, destructive-adjacent attention |
| Violet | `--sploot-violet` | Semantic matches, related groups, secondary AI affordance |
| Lime | `--sploot-lime` | Small discovery callouts only |
| Grid | `--sploot-grid-line` | Grid paper and low-emphasis structure |

Color rules:

- Default UI is ink plus paper, with one accent per local interaction cluster.
- Cyan is the primary product action color.
- Coral is for bangers/favorites and important human judgment.
- Violet is for similarity, relatedness, and automatic organization.
- Lime is rare. Use it like a sticky-note highlight, not a second primary.
- Neon intensity belongs to active states, not idle backgrounds.

### Typography

- Sans: Geist Sans for readable product copy and controls.
- Mono: JetBrains Mono for stats, status labels, command hints, and technical
  metadata.
- Display: Bebas Neue for brand headers and section labels only.

Do not use display type for dense control labels, table content, metadata, or
long explanatory copy.

### Shape and Line

- Default radius is square.
- Small rounded exceptions are allowed only for external widgets, avatars,
  native media masks, or Radix/shadcn primitives waiting on migration.
- Borders carry structure. Shadows are rare and should imply elevation, not
  softness.
- Thick borders are reserved for active docks, selected clusters, upload
  targets, and destructive confirmation surfaces.

## 5. Layout and Density

### Landing and Onboarding

The first viewport should show the product mechanism, not an abstract hero.
Preferred structure:

- Messy import pile on one side.
- Search or shuffle command in the center.
- Automatic semantic piles on the other side.
- The next section should be visible below the fold on desktop and mobile.

Landing copy should be short, literal, and product-owned. "No folders. Just
vibes." is the current directional headline. Supporting copy explains the
mechanic: the user's saves sort themselves.

### App Workbench

Desktop `/app` should prioritize repeated use:

- Top command/search bar.
- Left or top filter controls for upload, search, shuffle, bangers, tags, and
  sort.
- Central image grid or cluster surface.
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
| Command bar | Search, upload, shuffle, route actions | Square, border-led, cyan focus |
| Command dock | Mobile primary actions | Fixed positions, icon-first, 44px minimum targets |
| Image tile | Product object | Image dominates; metadata is secondary and compact |
| Pile / cluster | Automatic grouping | Thumbnail stack or bounded group, violet/cyan relation cues |
| Similarity line | Shows relationship | Thin cyan or violet line, never decorative alone |
| Sticker tab | Label, tag, status | Square or slight offset, mono uppercase when compact |
| Banger stamp | Favorite or top-ranked marker | Coral, high contrast, visually different from system alerts |
| Inspector | Selected asset/group detail | Dense facts, actions, tags, related items |
| Upload inbox | Pending import state | Workbench panel with queue and failure recovery |
| Empty state | First-use and zero-result education | Show product action and example pile, not generic illustration |

Implemented product wrappers live in `apps/web/components/sploot`:

- `StickerTab` for labels, tags, status, and playful annotations.
- `BangerStamp` for favorite or top-ranked markers.
- `ClusterPile` for automatic semantic group previews, including real
  thumbnail-backed piles when image URLs are available.
- `PileMark` for compact brand/navigation surfaces where the product mechanic
  needs to replace abstract circle marks.
- `AtlasLandingHero` for the landing first viewport.

New product surfaces should compose these wrappers before creating one-off
sticker, pile, banger, or atlas treatments.

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

## 7. Content Voice

The voice is hypermaximalist, terminally online, zoomer meme-culture brainrot —
delivered deadpan inside Swiss chrome. Lowercase everything except display
headlines. The product talks like the person whose camera roll it is:
self-aware, a little feral, never corporate. Every surface gets one moment of
personality; density of delight, not density of words.

Lexicon (use naturally, never all at once):

- "no folders. just vibes."
- "type the vibe. summon the meme."
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
- Purple-on-black AI hero gradients.
- Glassmorphism as decoration.
- Decorative blobs, bokeh, or mesh gradients.
- Generic centered hero pages when the product surface can lead.
- Rounded SaaS cards as the default grammar.
- Uniform fade/float motion for every element.
- Stock illustrations where real thumbnails or product state would be clearer.
