# Sploot Component Library

This is the component grammar for the neo-brutalist exposed-database direction.
It describes product wrappers that sit on top of shadcn/Radix primitives. It is
not a separate package yet.

## Product Grammar

| Family | Product Role | Current Source | Rule |
|---|---|---|---|
| Search console | Signed-out and app search centerpiece | `apps/web/components/sploot/search-field.tsx` | Ink titlebar, yellow query shelf, live match reveal |
| Meme cell | Atomic saved object or demo stand-in | `apps/web/components/sploot/meme-cell.tsx` | Filename header, doodle/image body, match/near/dim/default states |
| Stat block | Short machine/library readout | `apps/web/components/sploot/stat-block.tsx` | Mono label over display value, hard border and shadow |
| Status bar | Machinery on display | `apps/web/components/sploot/status-bar.tsx` | Dark row for index, scorer/model, route, and status |
| Button | Product action slab | `apps/web/components/ui/button.tsx` | Thick border, hard offset shadow, press motion |
| Pile filter / cluster | Automatic semantic group | `apps/web/components/sploot/pile-filter-rail.tsx`, `apps/web/components/sploot/cluster-pile.tsx` | Compact filters over the all-memes feed; pile previews only where they do not replace browsing |
| Sticker tab | Label, tag, status, callout | `apps/web/components/sploot/sticker-tab.tsx` | Saturated square label, thick border, hard shadow |
| Banger stamp | Favorite/top-ranked marker | `apps/web/components/sploot/banger-stamp.tsx` | Magenta stamp distinct from alerts |
| Pile mark | Compact brand/mechanic mark | `apps/web/components/sploot/pile-mark.tsx` | Three square pile cells, no abstract circles |
| Styleguide | Rendered component catalog | `apps/web/app/styleguide/page.tsx` | Uses the live wrappers and tokens |

The Chrome extension popup is also a product surface. It mirrors the same
paper/ink/cyan/magenta/blue token meanings, square shape grammar, and 44px
minimum button targets in `apps/extension/entrypoints/popup/style.css`.

## State Requirements

Every reusable product component should define these states before it is treated
as design-system complete:

- Default
- Hover
- Focus-visible
- Active or selected
- Loading
- Empty, when applicable
- Error or failed
- Disabled
- Reduced-motion fallback, when movement is involved

## Canonical Patterns

### Search Console

Purpose: type a natural-language memory and reveal the matching meme.

Rules:

- The search input gets first hierarchy.
- The console titlebar exposes the machine surface instead of hiding it.
- Signed-out examples must label sample/demo data as demo data.
- The found tile uses `--sploot-match-ring`; near matches use orange.
- Empty or no-overlap queries must show no fake match.
- Focus ring uses the Sploot focus token and remains visible.

### Meme Cell

Purpose: one image or demo stand-in in the pile.

Rules:

- Image or doodle dominates. Metadata never competes with the thumbnail.
- Header shows filename and optional vector index.
- Match, near, dim, and default states are visually distinct without relying
  only on color.
- Similarity score is visible only in search/related contexts.
- Captions stay short and lowercase.

### Stat Block

Purpose: a short readout for library, search, or machine state.

Rules:

- Mono label over display value.
- Use tabular numerals for counts and scores.
- Demo stats must be named as demo stats.
- Do not use stat blocks for speculative product claims.

### Status Bar

Purpose: the machinery row.

Rules:

- Show only truthful details: index, scorer/model, mode, route, status.
- Keep cells compact and scannable.
- The "ok/live" state can use a lime dot, with reduced-motion handled globally.
- Avoid fake latency, fake corpus size, or implementation roadmap copy.

### Button

Purpose: clear product commands.

Rules:

- Product actions are square slabs with thick border and hard offset shadow.
- The press utility owns hover/active motion.
- Icon-only buttons need a label or tooltip in the owning surface.
- Link buttons remain flat.

### Pile / Cluster

Purpose: automatic organization without manual folders.

Rules:

- Label reads as a suggestion, not a permanent folder.
- `/app` defaults to the all-memes shuffled gallery; automatic piles filter that
  gallery instead of becoming the primary library surface.
- Show the real library total separately from per-pile subset counts.
- Low-confidence automatic labels should be hidden or phrased as tentative.
- Use thumbnail overlap, bounded lanes, or small stacks to imply grouping.
- Provide a list fallback for keyboard and screen-reader access.

### Sticker Tab

Purpose: tags, statuses, and playful annotations.

Rules:

- Interactive tabs must stay aligned and predictable.
- Use hard offset shadow sparingly.
- Text is short and direct.
- Color is a solid token block, not a tint.

### Banger Stamp

Purpose: favorite or top-ranked marker.

Rules:

- Use magenta/coral alias and tabular count figures.
- Keep it visually different from destructive/error states.
- Use the stamp animation only when the state changes.

## Anti-Components

Do not create:

- Generic marketing card grids for repeated app actions.
- Decorative network diagrams that are not navigable.
- Glass panels as visual identity.
- Gradient hero text.
- Rounded SaaS cards as the default wrapper.
- Abstract illustrations where real saved thumbnails or demo cells can explain
  the state.
- Signed-out stats that imply a real production corpus, measured latency, or
  shipped model path that the surface is not exercising.

## Implemented Wrappers

These wrappers are canonical starting points for new product surfaces:

| Component | Source | Status | Use |
|---|---|---|---|
| `SearchField` | `apps/web/components/sploot/search-field.tsx` | implemented | Search console and live match demo |
| `MemeCell` | `apps/web/components/sploot/meme-cell.tsx` | implemented | Bordered tile with match, near, dim, and default states |
| `StatBlock` | `apps/web/components/sploot/stat-block.tsx` | implemented | Library/machine readout |
| `StatusBar` | `apps/web/components/sploot/status-bar.tsx` | implemented | Exposed machine status row |
| `StickerTab` | `apps/web/components/sploot/sticker-tab.tsx` | implemented | Short labels, tags, status tabs, and zine annotations |
| `BangerStamp` | `apps/web/components/sploot/banger-stamp.tsx` | implemented | Favorite/top-ranked marker distinct from alerts |
| `ClusterPile` | `apps/web/components/sploot/cluster-pile.tsx` | implemented | Automatic semantic group preview with text, doodle, or thumbnail tiles |
| `PileFilterRail` | `apps/web/components/sploot/pile-filter-rail.tsx` | implemented | Compact automatic pile filters over the primary all-memes gallery |
| `PileMark` | `apps/web/components/sploot/pile-mark.tsx` | implemented | Compact brand mark for navigation and tight chrome |
| `AtlasLandingHero` | `apps/web/components/sploot/atlas-landing-hero.tsx` | implemented | Landing first viewport driven by the search console |

New product code should import these wrappers from `apps/web/components/sploot`
before inventing local console, cell, sticker, pile, banger, stat, or status
treatments.
