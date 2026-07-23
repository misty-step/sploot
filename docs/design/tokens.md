# Sploot Design Tokens

This file translates `DESIGN.md` into implementation-facing token guidance.
The live CSS variables live in `apps/web/app/globals.css`. The values below
are the TOYBOX system (lab-034, AFD-8 "ink minis", locked 2026-07-10). Token
NAMES are stable across the migration; only values moved.

## Token Layers

Use three layers:

1. Primitive tokens: raw color, type, motion, and structural values.
2. Semantic tokens: product meanings such as ink, shelf, panel, match, banger,
   warning, and command surface.
3. Component tokens: local roles for the search console, meme cell, icon
   controls, stat block, status bar, pile chips, and sticker tabs.

Do not use raw hex values in product components when a semantic token exists.

## Canonical Semantic Tokens

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--sploot-ink` | `#1c1547` | `#fff3dc` | Text, shells, outlines, linework |
| `--sploot-paper` | `#cfe7ff` | `#19143d` | The shelf: resting dotted background |
| `--sploot-paper-warm` | `#f1f7ff` | `#241d50` | Inner panel wash, action rails |
| `--sploot-panel` | `#ffffff` | `#2d255e` | Toy surface: cards, consoles, stats |
| `--sploot-void` | `#1c1547` | `#090720` | Dark chrome (status bar) |
| `--sploot-blue` | `#087bc1` | `#63c3ff` | Primary action |
| `--sploot-cyan` | `#39b1ff` | `#8ed2ff` | Brand through-line, tab candy |
| `--sploot-magenta` | `#ed58bd` | `#ff8ed7` | Bubblegum: bangers, attention, press fill |
| `--sploot-yellow` | `#ffdd00` | `#ffe45c` | Banana: hover fill, the one highlight |
| `--sploot-orange` | `#d97500` | `#ffb13b` | Near-match and warning state |
| `--sploot-lime` | `#138a50` | `#55d992` | Apple: found state and match ring |
| `--sploot-red` | `#e52347` | `#ff5d73` | Cherry: error / destructive |
| `--sploot-purple` | `#7547e8` | `#a78aff` | Grape: selected |
| `--sploot-focus` | `#4a25c7` | `#ffe45c` | Focus-visible outline |
| `--sploot-shadow-color` | `#1c1547` | `#090720` | Every drop shadow |
| `--sploot-dot` | `rgba(255,255,255,0.68)` | `rgba(255,255,255,0.09)` | Shelf polka dots |
| `--sploot-coral` | alias of magenta | alias of magenta | Back-compat banger alias |
| `--sploot-violet` | alias of purple | alias of purple | Back-compat selected alias |
| `--sploot-grid-line` | ink alpha | ink alpha | Low-emphasis structure lines |
| `--sploot-command-surface` | panel | panel | Command bars and search surfaces |
| `--sploot-pile-surface` | panel | panel | Pile chips and panels |
| `--sploot-pile-selected` | yellow | yellow | Selected pile/filter fill |

Dark mode is the night shelf: candy values are lifted for WCAG AA contrast,
ink turns warm cream, and shadows deepen to near-black. `next-themes` flips
the `.dark` class; components never hardcode per-theme values.

## Structure Tokens

| Token | Value | Use |
|---|---|---|
| `--sploot-border` | `3px solid var(--sploot-ink)` | Standard toy shell |
| `--sploot-border-thin` | `2px solid var(--sploot-ink)` | Compact controls, inner media frames |
| `--sploot-border-thick` | `4px solid var(--sploot-ink)` | Primary or active surface shell |
| `--sploot-active-border-width` | `4px` | Tailwind arbitrary border width hook |
| `--sploot-radius` | `18px` | Cards, consoles, stats |
| `--sploot-radius-inner` | `10px` | Media frames inside cards |
| `--sploot-radius-ctl` | `9px` | Ink-mini icon controls |
| `--sploot-radius-pill` | `999px` | Buttons, tabs, inputs, pile chips |
| `--sploot-radius-segment` | `0px` | Interior edges inside a rounded segmented-control shell |
| `--sploot-shadow` | `0 5px 0 var(--sploot-shadow-color)` | Resting drop |
| `--sploot-shadow-sm` | `0 3px 0 var(--sploot-shadow-color)` | Compact drop |
| `--sploot-shadow-lg` | `0 9px 0 var(--sploot-shadow-color)` | Hero drop (search console) |
| `--sploot-shadow-hover` | `2px 7px 0 var(--sploot-shadow-color)` | Lifted, shadow anchored |
| `--sploot-shadow-hover-sm` | `2px 5px 0 var(--sploot-shadow-color)` | Compact lifted |
| `--sploot-shadow-press` | `0 1px 0 var(--sploot-shadow-color)` | Sunk, shadow collapsed |
| `--sploot-sticker-shadow` | `0 3px 0 var(--sploot-shadow-color)` | Sticker tabs and chips |
| `--sploot-match-ring` | 4px lime halo plus 9px drop | Found meme cell state |
| `--sploot-touch-target` | `44px` | Minimum mobile target |
| `--sploot-control-height-sm` | `36px` | Compact desktop command height |
| `--sploot-control-height` | `44px` | Default command height and touch-safe control floor |
| `--sploot-control-height-lg` | `48px` | Large action height |

Elevation is drop height, straight down, never blurred. The hover-physics law
binds every interactive surface: hover lifts the surface while the shadow
stays anchored or extends; press sinks the surface and collapses the shadow.
The shared utilities `.sploot-press`, `.sploot-press-sm`, and `.sploot-ctl`
in `globals.css` implement the law; compose them instead of hand-rolling
transform/shadow pairs.

## Tailwind Names

The CSS `@theme inline` block exposes color utilities:

- `text-sploot-ink`, `bg-sploot-ink`, `border-sploot-ink`
- `bg-sploot-paper`, `bg-sploot-paper-warm`, `bg-sploot-panel`, `bg-sploot-void`
- `text-sploot-blue`, `bg-sploot-blue`, `border-sploot-blue`
- `text-sploot-cyan`, `bg-sploot-cyan`, `border-sploot-cyan`
- `text-sploot-magenta`, `bg-sploot-magenta`, `border-sploot-magenta`
- `text-sploot-yellow`, `bg-sploot-yellow`, `border-sploot-yellow`
- `text-sploot-orange`, `bg-sploot-orange`, `border-sploot-orange`
- `text-sploot-lime`, `bg-sploot-lime`, `border-sploot-lime`
- `text-sploot-red`, `bg-sploot-red`, `border-sploot-red`
- `text-sploot-purple`, `bg-sploot-purple`, `border-sploot-purple`
- `outline-sploot-focus`
- `text-sploot-coral`, `bg-sploot-coral`, `border-sploot-coral` (legacy alias)
- `text-sploot-violet`, `bg-sploot-violet`, `border-sploot-violet` (legacy alias)
- `border-sploot-grid-line`

Historical utility names such as `electric-lime`, `hot-pink`, and `cyber-blue`
may remain in migration exceptions only. New product code must use `sploot-*`
tokens.

The Chrome extension cannot import the Next app Tailwind theme directly. Its
popup stylesheet mirrors the required semantic token names in
`apps/extension/entrypoints/popup/style.css`; design lint treats that file as
part of the system.

## Type

The `next/font` variable slots are stable; only the families behind them
moved (wired in `apps/web/app/layout.tsx`):

- `--font-sans` (slot `--font-geist-sans`): Baloo 2 for default UI and copy.
- `--font-mono` (slot `--font-jetbrains-mono`): Space Mono for machine
  metadata: status, labels, stats, vector indexes, command hints.
- `--font-display` (slot `--font-bebas-neue`): Bungee for display headlines
  and stat values.

Mono is machine text only, not the default chrome voice. Use tabular numbers
for counts, storage values, queue depth, similarity scores, and rank
comparisons. Letter spacing is `0`; use `tracking-normal` in Tailwind.

## Color Use

- Blue is the primary action color.
- Cyan is the brand through-line and tab candy.
- Yellow is the hover fill and the single highlight per viewport.
- Magenta is human judgment: banger, attention, and the press fill.
- Lime is reserved for the found/match state.
- Orange is reserved for near-match or warning state.
- Red is error and destructive. Purple is selected.

Candy is a flat fill inside an ink shell. Avoid tints, washes, decorative
gradients, and full-page color floods. Let thumbnails, the dot shelf, shells,
and product state carry the surface.

## Motion

Live CSS tokens:

- `--sploot-motion-fast`: `130ms`, hover/press physics on controls.
- `--sploot-motion-base`: `150ms`, card lifts, pops, small reveals.
- `--sploot-motion-panel`: `200ms`, panels, sheets, stamps.
- `--sploot-motion-cluster`: `300ms`, sorting, clustering, upload queue moves.
- `--sploot-ease-out`: default deceleration curve.
- `--sploot-ease-snap`: springy squash/settle curve for toy physics.

Named animation utilities:

- `.sploot-press` / `.sploot-press-sm` / `.sploot-ctl`: the hover-physics law.
- `.animate-sploot-stamp`: match/state stamp punch.
- `.animate-sploot-pop`: chips and labels appearing.
- `.animate-sploot-slide-up`: panels, sheets, and docks entering.

A global `prefers-reduced-motion: reduce` rule collapses all animations and
transitions and removes transform travel on the physics utilities; components
must not re-implement their own opt-outs.
