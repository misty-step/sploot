# Sploot Design Tokens

This file translates `DESIGN.md` into implementation-facing token guidance.
The live CSS variables live in `apps/web/app/globals.css`.

## Token Layers

Use three layers:

1. Primitive tokens: raw color, type, motion, and structural values.
2. Semantic tokens: product meanings such as ink, paper, match, banger, warning,
   and command surface.
3. Component tokens: local roles for the search console, meme cell, stat block,
   status bar, pile, sticker tab, and banger stamp.

Do not use raw hex values in product components when a semantic token exists.

## Canonical Semantic Tokens

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--sploot-ink` | `#0a0a0a` | `#f3efe4` | Text, borders, linework, hard shadows |
| `--sploot-paper` | `#f3efe4` | `#141414` | Main resting surface |
| `--sploot-paper-warm` | `#e9e4d6` | `#1d1d1d` | Secondary paper surface and workbench panels |
| `--sploot-void` | `#0a0a0a` | `#0a0a0a` | Dark status and deep machine surfaces |
| `--sploot-blue` | `#1f4cff` | `#4d72ff` | Primary action and search machinery |
| `--sploot-cyan` | `#00e5d4` | `#00e5d4` | Brand through-line, focus, secondary accent |
| `--sploot-magenta` | `#ff2d9b` | `#ff2d9b` | Bangers, favorites, attention stamps |
| `--sploot-yellow` | `#ffe600` | `#ffe600` | The single highlighter block in a viewport |
| `--sploot-orange` | `#ff5a1f` | `#ff7a45` | Near-match and warning state |
| `--sploot-lime` | `#9cff2e` | `#9cff2e` | Found state and match ring |
| `--sploot-coral` | alias of magenta | alias of magenta | Back-compat favorite/banger alias |
| `--sploot-violet` | alias of blue | alias of blue | Back-compat semantic-pile alias |
| `--sploot-grid-line` | ink alpha | paper alpha | Paper grid and low-emphasis structure |
| `--sploot-command-surface` | paper | dark paper | Command bars and search surfaces |
| `--sploot-pile-surface` | paper | dark paper | Cluster pile panels |
| `--sploot-pile-selected` | yellow | yellow | Selected pile/filter surface |

## Structure Tokens

| Token | Value | Use |
|---|---|---|
| `--sploot-border` | `4px solid var(--sploot-ink)` | Standard product surface border |
| `--sploot-border-thick` | `6px solid var(--sploot-ink)` | Primary or active surface border |
| `--sploot-active-border-width` | `6px` | Tailwind arbitrary border width hook |
| `--sploot-shadow` | `8px 8px 0 var(--sploot-ink)` | Hard offset block shadow |
| `--sploot-shadow-sm` | `5px 5px 0 var(--sploot-ink)` | Compact hard shadow |
| `--sploot-shadow-lg` | `12px 12px 0 var(--sploot-ink)` | Search console and hero shadow |
| `--sploot-sticker-shadow` | `5px 5px 0 var(--sploot-ink)` | Sticker tabs and stamps |
| `--sploot-match-ring` | lime ring plus ink shadow | Found meme cell state |
| `--sploot-touch-target` | `44px` | Minimum mobile target |

No blurred shadows. No rounded product surfaces except full circles and
unmigrated third-party widgets.

## Tailwind Names

The CSS `@theme inline` block exposes color utilities:

- `text-sploot-ink`, `bg-sploot-ink`, `border-sploot-ink`
- `bg-sploot-paper`, `bg-sploot-paper-warm`, `bg-sploot-void`
- `text-sploot-blue`, `bg-sploot-blue`, `border-sploot-blue`
- `text-sploot-cyan`, `bg-sploot-cyan`, `border-sploot-cyan`
- `text-sploot-magenta`, `bg-sploot-magenta`, `border-sploot-magenta`
- `text-sploot-yellow`, `bg-sploot-yellow`, `border-sploot-yellow`
- `text-sploot-orange`, `bg-sploot-orange`, `border-sploot-orange`
- `text-sploot-lime`, `bg-sploot-lime`, `border-sploot-lime`
- `text-sploot-coral`, `bg-sploot-coral`, `border-sploot-coral`
- `text-sploot-violet`, `bg-sploot-violet`, `border-sploot-violet`
- `border-sploot-grid-line`

Historical utility names such as `electric-lime`, `hot-pink`, and `cyber-blue`
may remain in migration exceptions only. New product code must use `sploot-*`
tokens.

The Chrome extension cannot import the Next app Tailwind theme directly. Its
popup stylesheet mirrors the required semantic token names in
`apps/extension/entrypoints/popup/style.css`; design lint treats that file as
part of the system.

## Type

- `--font-sans`: Space Grotesk for default UI and copy.
- `--font-mono`: Space Mono for status, labels, metadata, and command hints.
- `--font-display`: Archivo Black for display headlines and stat values.

Use tabular numbers for counts, storage values, queue depth, similarity scores,
and rank comparisons. Letter spacing is `0`; use `tracking-normal` in Tailwind.

## Color Use

- Blue is the primary action and exposed-machine color.
- Cyan is the brand through-line and focus accent.
- Magenta is human judgment: favorite, banger, delete emphasis, or high-salience
  stamp.
- Yellow is one highlighter block per viewport.
- Lime is reserved for the found/match state.
- Orange is reserved for near-match or warning state.

Avoid tints, pastels, decorative gradients, and full-page color washes. Let
thumbnails, paper grid, borders, and product state carry the surface.

## Motion

Live CSS tokens:

- `--sploot-motion-fast`: press feedback and tiny state changes.
- `--sploot-motion-base`: hover, focus, and small reveal.
- `--sploot-motion-panel`: panels, cells, stamps, and search reveal.
- `--sploot-motion-cluster`: sorting, clustering, and upload queue movement.
- `--sploot-ease-out`: default deceleration curve.
- `--sploot-ease-snap`: overshoot curve for stickers and stamps.

Named animation utilities:

- `.animate-sploot-stamp`: banger/favorite and match stamp punch.
- `.animate-sploot-pop`: sticker tabs and status dots.
- `.animate-sploot-slide-up`: panels, sheets, and docks entering.

A global `prefers-reduced-motion: reduce` rule collapses all animations and
transitions; components must not re-implement their own opt-outs.
