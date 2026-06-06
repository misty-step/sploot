# Sploot Component Library

This is the component grammar for the self-organizing zine archive direction.
It describes product components that should sit on top of shadcn/Radix
primitives. It is not a separate package yet.

## Component Families

| Family | Product Role | Current Source | Future Direction |
|---|---|---|---|
| Command bar | Search, upload, shuffle, global actions | `apps/web/components/chrome/*`, `apps/web/components/search/*` | One canonical desktop command bar with search-first hierarchy |
| Command dock | Mobile primary actions | `apps/web/components/chrome/mobile-command-dock.tsx` | Stable icon positions, safe-area padding, optional cluster tab row |
| Image tile | Atomic saved object | `apps/web/components/library/image-tile.tsx` | Image-first tile with compact metadata and coral banger stamp |
| Image grid | Primary library browse surface | `apps/web/components/library/image-grid.tsx` | Grid remains canonical fallback for cluster views |
| Pile / cluster | Automatic semantic group | Not implemented | Thumbnail stack or bounded group with violet/cyan relation cues |
| Similarity line | Relationship between piles/items | Not implemented | Thin semantic line, never decorative by itself |
| Sticker tab | Label, tag, status, callout | Partial via badges/chips | Square label with hard offset shadow and mono compact text |
| Banger stamp | Favorite/top-ranked marker | `favorite` affordance in image tile | Coral stamp distinct from system alerts |
| Inspector | Selected asset or group details | Selected-asset modal, detail routes | Dense side panel with tags, scores, related saves, actions |
| Upload inbox | Import queue and recovery | `apps/web/components/upload/*` | Queue as visible workbench state, not hidden progress toast |
| Empty state | First-use education | `apps/web/components/library/empty-state.tsx` | Show upload chaos becoming semantic piles |

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

### Command Bar

Purpose: a fast route into search, upload, and shuffle.

Rules:

- Search input gets first hierarchy.
- Upload and shuffle are icon-plus-label on desktop, icon-only with tooltip on
  mobile dock.
- Focus ring uses cyan.
- Status values use mono and tabular numbers.

### Command Dock

Purpose: one-hand mobile operation.

Rules:

- Stable button order: upload, search, filter/bangers, sort/cluster, shuffle.
- Minimum target is 44px.
- Active state uses cyan fill or border, not layout shift.
- Retry/upload status row must not cover feed content.

### Image Tile

Purpose: the saved meme itself.

Rules:

- Image dominates. Metadata never competes with the thumbnail.
- Banger state is coral and visible without relying only on color.
- Similarity score is visible only in search/related contexts.
- Technical embedding states are compact labels, not hero badges.

### Pile / Cluster

Purpose: automatic organization without manual folders.

Rules:

- Label reads as a suggestion, not a permanent folder.
- Use thumbnail overlap, bounded lanes, or small stacks to imply grouping.
- Use violet for semantic grouping and cyan for active search relation.
- Provide a list fallback for keyboard and screen-reader access.

### Sticker Tab

Purpose: tags, statuses, and playful annotations.

Rules:

- Square or slightly rotated only when non-interactive.
- Interactive tabs must stay aligned and predictable.
- Use hard offset shadow sparingly.
- Text is short and direct.

### Inspector

Purpose: selected image or selected pile detail.

Rules:

- Dense facts before prose.
- Actions are grouped by intent: keep, organize, share, delete.
- Related saves use a horizontal filmstrip or compact list.
- Destructive actions remain visually separate.

## Anti-Components

Do not create:

- Generic marketing card grids for repeated app actions.
- Decorative network diagrams that are not navigable.
- Glass panels as visual identity.
- Gradient hero text.
- Rounded SaaS cards as the default wrapper.
- Abstract illustrations where real saved thumbnails can explain the state.

## Migration Notes

Current shadcn primitives remain valid base components. Product surfaces should
wrap them with Sploot-specific roles instead of scattering one-off classes.

Good future wrappers:

- `StickerTab`
- `BangerStamp`
- `ClusterPile`
- `SimilarityLine`
- `CommandDockButton`
- `AssetInspector`
- `UploadInbox`

## Implemented wrappers

These wrappers are canonical starting points for new product surfaces:

| Component | Source | Status | Use |
|---|---|---|---|
| `StickerTab` | `apps/web/components/sploot/sticker-tab.tsx` | implemented | Short labels, tags, status tabs, and zine annotations |
| `BangerStamp` | `apps/web/components/sploot/banger-stamp.tsx` | implemented | Favorite/top-ranked marker distinct from alerts |
| `ClusterPile` | `apps/web/components/sploot/cluster-pile.tsx` | implemented | Automatic semantic group preview with text or thumbnail tiles |
| `PileMark` | `apps/web/components/sploot/pile-mark.tsx` | implemented | Compact brand mark for navigation and tight chrome |
| `AtlasLandingHero` | `apps/web/components/sploot/atlas-landing-hero.tsx` | implemented | Landing first viewport showing messy saves becoming piles |

New product code should import these wrappers from `apps/web/components/sploot`
before inventing local sticker, pile, or banger treatments.

The Chrome extension popup is also a product surface. It should use the same
paper/ink/cyan/coral/violet token meanings, square shape grammar, and 44px
minimum button targets even though it owns a standalone CSS file.
