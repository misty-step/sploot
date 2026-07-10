# Sploot Component Library

This is the component grammar for the TOYBOX direction (lab-034, AFD-8 "ink
minis"). It describes product wrappers that sit on top of shadcn/Radix
primitives. It is not a separate package yet.

## Product Grammar

| Family | Product Role | Current Source | Rule |
|---|---|---|---|
| Search console | Signed-out and app search centerpiece | `apps/web/components/sploot/search-field.tsx` | 18px panel toy, ink machine titlebar, dashed machine footer, pill input, 9px hero drop |
| Meme cell (toy card) | Atomic saved object or demo stand-in | `apps/web/components/sploot/meme-cell.tsx` | 18px shell, candy filename tab, 10px inner media frame, caption row, action rail; seven states |
| Icon button (ink mini) | Compact icon control: theme switcher, tile actions, toolbar | `apps/web/components/sploot/icon-button.tsx` | 34px flat 2px ink outline at rest; banana fill + anchored shadow on hover; bubblegum sink on press; 44px `dock`/`chip` variant for mobile |
| Tile action rail | Heart / share / trash row on the cell | `apps/web/components/sploot/tile-action-rail.tsx` | Below the caption behind a dashed divider; never covers media; renders inside the transformed card |
| Stat block | Short machine/library readout | `apps/web/components/sploot/stat-block.tsx` | Mono label over Bungee value, 18px toy, 5px drop |
| Status bar | Machinery on display | `apps/web/components/sploot/status-bar.tsx` | Ink row for index, scorer/model, route, and status |
| Button | Product action toy | `apps/web/components/ui/button.tsx` | Pill, 3px shell, 5px drop, candy variants, hover-physics law |
| Pile filter / cluster | Automatic semantic group | `apps/web/components/sploot/pile-filter-rail.tsx`, `apps/web/components/sploot/cluster-pile.tsx` | Pill chips over the all-memes feed; selected fills banana; previews never replace browsing |
| Sticker tab | Label, tag, status, callout | `apps/web/components/sploot/sticker-tab.tsx` | Pill candy chip, 2px shell, short lowercase text |
| Pile mark | Compact brand/mechanic mark | `apps/web/components/sploot/pile-mark.tsx` | Pile cells, no abstract circles |
| Styleguide | Rendered component catalog | `apps/web/app/styleguide/page.tsx` | Uses the live wrappers and tokens, both themes |

The Chrome extension popup is also a product surface. It mirrors the same
ink/shelf/candy token meanings, toy shape grammar, and 44px minimum button
targets in `apps/extension/entrypoints/popup/style.css`.

## State Requirements

Every reusable product component should define these states before it is
treated as design-system complete:

- Default
- Hover (lift, shadow anchored or extended)
- Focus-visible (4px `--sploot-focus` outline at 3px offset)
- Active / pressed (sink, shadow collapsed) or selected
- Loading
- Empty, when applicable
- Error or failed
- Disabled
- Reduced-motion fallback, when movement is involved

The meme cell specifically carries seven reveal states: default, match, near,
dim, selected, loading, and error.

Per operator rule, compact icon controls are a CRITICAL component: any design
work touching them must exhibit them at real scale with full states in both
themes.

## Canonical Patterns

### Search Console

Purpose: type a natural-language memory and reveal the matching meme.

Rules:

- The search input gets first hierarchy; it is a pill inside the console toy.
- The console titlebar and footer expose the machine surface (index, model,
  latency, route) instead of hiding it.
- Signed-out examples must label sample/demo data as demo data.
- The found tile uses `--sploot-match-ring`; near matches use dashed orange.
- Empty or no-overlap queries must show no fake match.
- Focus ring uses the Sploot focus token and remains visible.

### Meme Cell

Purpose: one image or demo stand-in in the pile, as a toy card.

Rules:

- Image or doodle dominates inside the 10px inner media frame. Metadata never
  competes with the thumbnail.
- The candy filename tab shows filename and optional vector index.
- All seven states (default, match, near, dim, selected, loading, error) are
  visually distinct without relying only on color.
- Match/state/banger markers render INSIDE the transformed card element so
  they move with the card on hover; never anchor them outside the card box.
- Similarity score is visible only in search/related contexts.
- Captions stay short and lowercase.

### Icon Button (Ink Mini)

Purpose: the compact icon control grammar: theme switcher, tile actions,
toolbar icons, dock icons.

Rules:

- Flat at rest: 2px ink outline, 9px radius, transparent fill, no shadow.
- Hover lifts with a banana fill and a small anchored shadow; press sinks
  with a bubblegum fill and no shadow; disabled drops to 36% opacity.
- Physics come from the shared `.sploot-ctl` utility; never hand-roll them.
- Desktop density is 34px; the mobile dock uses the 44px `dock` size, with
  the `chip` variant carrying the candy-chip pill treatment (2px drop,
  extends on hover, clicks flush).
- Every icon-only control requires a `label`; it renders as `aria-label`,
  `title`, and screen-reader text.

### Tile Action Rail

Purpose: the cell's heart / share / trash row.

Rules:

- The rail owns space below the caption and never covers the media.
- It renders inside the transformed card element and moves with it on hover.
- Banger is the heart: filled means banger, outline means not. No badges, no
  banger sort, no loud marks.
- Delete hovers to cherry; everything else follows the ink-mini grammar.

### Stat Block

Purpose: a short readout for library, search, or machine state.

Rules:

- Mono label over Bungee display value.
- Use tabular numerals for counts and scores.
- Demo stats must be named as demo stats.
- Do not use stat blocks for speculative product claims.

### Status Bar

Purpose: the machinery row.

Rules:

- Show only truthful details: index, scorer/model, mode, route, status.
- Keep cells compact and scannable.
- The "ok/live" state can use an apple-green dot, with reduced-motion handled
  globally.
- Avoid fake latency, fake corpus size, or implementation roadmap copy.

### Button

Purpose: clear product commands.

Rules:

- Product actions are pill toys with a 3px ink shell and a 5px drop.
- Variants map to the candy palette: blue primary, bubblegum attention,
  banana secondary, cherry destructive, panel ghost/outline, ink inverted.
- The shared press utilities own hover/active physics (the hover-physics
  law); the compact variant uses the 3px drop.
- Icon-only actions use the ink-mini `IconButton`, not a shrunken pill.
- Link buttons remain flat: no shell, no drop, no press physics.

### Pile / Cluster

Purpose: automatic organization without manual folders.

Rules:

- Label reads as a suggestion, not a permanent folder.
- `/app` defaults to the all-memes shuffled gallery; automatic piles filter
  that gallery instead of becoming the primary library surface.
- Show the real library total separately from per-pile subset counts.
- Low-confidence automatic labels should be hidden or phrased as tentative.
- Pile chips are pills; the selected chip fills banana
  (`--sploot-pile-selected`).
- Provide a list fallback for keyboard and screen-reader access.

### Sticker Tab

Purpose: tags, statuses, and playful annotations.

Rules:

- Pill candy chips with a 2px shell; interactive tabs stay aligned and
  predictable.
- Use the sticker drop (3px) sparingly.
- Text is short, lowercase, and direct.
- Color is a flat candy token fill, not a tint.

### Banger Stamp

Legacy. The banger marker is the heart in the tile action rail: filled means
banger, outline means not. Banger badges, banger sorts, and loud stamp marks
are anti-patterns. The `BangerStamp` wrapper remains in the tree for
migration surfaces only; new work must not adopt it.

## Anti-Components

Do not create:

- Generic marketing card grids for repeated app actions.
- Decorative network diagrams that are not navigable.
- Glass panels as visual identity.
- Gradient hero text.
- Square brutalist slabs; every surface uses the toybox radius scale.
- Banger badges, banger sorts, or loud banger marks.
- Icon controls with their own hand-rolled hover/press transforms outside
  the shared physics utilities.
- Abstract illustrations where real saved thumbnails or demo cells can explain
  the state.
- Signed-out stats that imply a real production corpus, measured latency, or
  shipped model path that the surface is not exercising.

## Implemented Wrappers

These wrappers are canonical starting points for new product surfaces:

| Component | Source | Status | Use |
|---|---|---|---|
| `SearchField` | `apps/web/components/sploot/search-field.tsx` | implemented | Search console and live match demo |
| `MemeCell` | `apps/web/components/sploot/meme-cell.tsx` | implemented | Toy card with reveal states |
| `IconButton` | `apps/web/components/sploot/icon-button.tsx` | implemented | Ink-mini compact icon control (34px / 44px dock / candy chip) |
| `TileActionRail` | `apps/web/components/sploot/tile-action-rail.tsx` | implemented | Heart / share / trash row inside the cell |
| `StatBlock` | `apps/web/components/sploot/stat-block.tsx` | implemented | Library/machine readout |
| `StatusBar` | `apps/web/components/sploot/status-bar.tsx` | implemented | Machinery status row |
| `StickerTab` | `apps/web/components/sploot/sticker-tab.tsx` | implemented | Short labels, tags, status chips |
| `ClusterPile` | `apps/web/components/sploot/cluster-pile.tsx` | implemented | Automatic semantic group preview with text, doodle, or thumbnail tiles |
| `PileFilterRail` | `apps/web/components/sploot/pile-filter-rail.tsx` | implemented | Pile chips over the primary all-memes gallery |
| `PileMark` | `apps/web/components/sploot/pile-mark.tsx` | implemented | Compact brand mark for navigation and tight chrome |
| `BangerStamp` | `apps/web/components/sploot/banger-stamp.tsx` | legacy | Superseded by the heart in `TileActionRail`; migration surfaces only |

New product code should import these wrappers from `apps/web/components/sploot`
before inventing local console, cell, chip, pile, banger, stat, or status
treatments.
