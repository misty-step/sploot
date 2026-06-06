# Sploot Design Tokens

This file translates `DESIGN.md` into implementation-facing token guidance.
The live CSS variables live in `apps/web/app/globals.css`.

## Token Layers

Use three layers:

1. Primitive tokens: raw colors, spacing, fonts, and motion durations.
2. Semantic tokens: product meanings such as ink, paper, cyan, coral, cluster,
   banger, selected, and failed.
3. Component tokens: local roles for command dock, pile, sticker tab, banger
   stamp, image tile, and inspector.

Do not use raw hex values in product components when a semantic token exists.

## Canonical Semantic Tokens

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--sploot-ink` | near black | near white | Text, borders, linework |
| `--sploot-paper` | off-white | black | Main surface |
| `--sploot-paper-warm` | warm paper | warm near-black | Secondary paper surface |
| `--sploot-void` | black | black | Image stage, deep overlay |
| `--sploot-cyan` | deep cyan | bright cyan | Search, focus, active controls |
| `--sploot-coral` | red/coral | bright coral | Bangers, favorites, important stamps |
| `--sploot-violet` | violet | violet | Similarity, related groups, semantic radius |
| `--sploot-lime` | lime | lime | Rare sticky-note discovery callouts |
| `--sploot-grid-line` | subtle ink alpha | subtle paper alpha | Paper grid and atlas lines |
| `--sploot-sticker-shadow` | hard ink offset | hard dark offset | Sticker tabs and stamps |
| `--sploot-active-border-width` | `3px` | `3px` | Command dock and selected surfaces |
| `--sploot-touch-target` | `44px` | `44px` | Minimum mobile target |
| `--sploot-command-surface` | white | near black | Command bars, stats strips, and search surfaces |
| `--sploot-command-surface-contrast` | ink | paper | Text/icons on command surfaces |
| `--sploot-pile-surface` | warm paper | warm near-black | Cluster pile panels |
| `--sploot-pile-selected` | violet wash | violet wash | Selected or active semantic pile |
| `--sploot-sticker-cyan` | cyan paper tint | cyan dark tint | Search/active sticker tab |
| `--sploot-sticker-coral` | coral paper tint | coral dark tint | Banger/favorite sticker tab |
| `--sploot-sticker-violet` | violet paper tint | violet dark tint | Semantic/related sticker tab |
| `--sploot-sticker-lime` | lime paper tint | lime dark tint | Rare discovery sticker tab |

## Tailwind Names

The CSS `@theme inline` block exposes color utilities:

- `text-sploot-ink`
- `bg-sploot-paper`
- `bg-sploot-paper-warm`
- `bg-sploot-void`
- `text-sploot-cyan`, `bg-sploot-cyan`, `border-sploot-cyan`
- `text-sploot-coral`, `bg-sploot-coral`, `border-sploot-coral`
- `text-sploot-violet`, `bg-sploot-violet`, `border-sploot-violet`
- `text-sploot-lime`, `bg-sploot-lime`, `border-sploot-lime`
- `border-sploot-grid-line`

Existing historical utility names such as `electric-lime`, `hot-pink`, and
`cyber-blue` may remain during migration, but new product code should prefer
the `sploot-*` names.

The Chrome extension cannot import the Next app Tailwind theme directly. Its
popup stylesheet mirrors the required semantic token names in
`apps/extension/entrypoints/popup/style.css`; design lint treats that file as
part of the system.

## Color Use

- Cyan is the primary action and focus color.
- Coral is human judgment: favorite, banger, delete confirmation emphasis, or
  high-salience stamp.
- Violet is machine relationship: similarity, automatic group, nearby pile.
- Lime is annotation only. It should be rare enough to feel like a sticky note.
- Avoid full-page color washes. Let thumbnails and paper structure carry the
  surface.

## Type

- `--font-sans`: default UI and copy.
- `--font-mono`: status, labels, compact metadata, command hints.
- `--font-display`: brand marks and large section labels only.

Use tabular numbers for counts, storage values, queue depth, similarity scores,
and rank comparisons.

## Spacing and Shape

- Default component radius is square.
- Default border is `1px`.
- Active or selected product surfaces can use
  `--sploot-active-border-width`.
- Mobile action targets use at least `--sploot-touch-target`.
- Dense workbench panels should prefer 8px or 12px internal rhythm, not large
  marketing-card spacing.

## Motion

Motion tokens should be introduced only when the implementation needs them.
Recommended bands:

- `75ms`: press feedback and tiny icon state.
- `150ms`: hover, focus, menu open.
- `240ms`: sheet, inspector, search overlay.
- `360ms`: sorting, clustering, upload queue rearrangement.

Cluster and shuffle motion must have a reduced-motion fallback.

Live CSS tokens:

- `--sploot-motion-fast`: press feedback and icon state.
- `--sploot-motion-base`: hover, focus, and menu open.
- `--sploot-motion-panel`: sheets, inspectors, and search overlays.
- `--sploot-motion-cluster`: sorting, clustering, and upload queue movement.
