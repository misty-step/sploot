# @misty-step/aesthetic adoption — token mapping & declared deviations

Card sploot-032, ADR 0005 (`docs/adr/0005-close-pr-228-redo-aesthetic-adoption.md`).
Substrate: `github:misty-step/aesthetic#v2.24.0` (pinned tag; upgrades are
ordinary dependency bumps audited against this document).

The bet is **"Swiss chrome, feral contents"**: the disciplined substrate owns
every quiet chrome surface (workbench shell, auth door, dialogs, settings,
forms), and sploot's loudness is spent inside high-variance **content
objects** (meme tiles, sticker tabs, stamps, pile borders) — never on chrome.

## What the substrate owns (the mapping)

`apps/web/app/globals.css` imports the kit at `layer(base)` and repoints the
shadcn semantic layer at `--ae-*` in a final cascade block. Dark mode is free:
the kit flips every `--ae-*` under `:root.dark`, which next-themes sets.

| Semantic token (what components read) | Substrate source |
|---|---|
| `--background`, `--card`, `--popover`, `--sidebar` | `--ae-surface` |
| `--foreground`, `--*-foreground` (on surface) | `--ae-ink` |
| `--secondary`, `--muted`, `--sidebar-accent` | `--ae-wash` |
| `--muted-foreground` | `--ae-ink-muted` |
| `--primary`, `--accent`, `--accent-cyan` | `--ae-accent` (steered) |
| `--destructive` | `--ae-err` |
| `--border`, `--input`, `--sidebar-border` | `--ae-line` |
| `--ring`, `--sidebar-ring` | `--ae-ink` |

Steering: `--ae-accent: #0c6a84` (AA 6.00 on light surface),
`--ae-accent-dark: #00f0ff` (AA 13.30 on dark surface) — sploot's cyan as the
system accent. `--radius` was already `0`, matching `--ae-radius`.

## What stayed sploot (the declared deviations)

These are deliberate, named exceptions to the kit's invariants. They are the
brand; flattening them re-opens ADR 0005.

1. **The display register.** The kit forbids display type; sploot keeps ONE
   display face (Archivo Black, in the `--font-display` /
   `--font-bebas-neue` slot) for the landing hero, section stamps, and the
   navbar wordmark only. Never on dense control labels, tables, or metadata.
2. **The brutalist text stack.** The kit defaults to Geist/Geist Mono; sploot
   wires `--ae-font` → Space Grotesk and `--ae-font-mono` → Space Mono
   (DESIGN.md §4 typography, shipped 2026-06-26). The card's original
   2026-06-22 draft prescribed Geist; the live DESIGN.md-governed stack
   supersedes it and is recorded here as the deviation instead.
3. **The `--sploot-*` loud layer.** Unbleached paper (`--sploot-paper`), the
   saturated block palette (blue/cyan/magenta/yellow/orange/lime), 4–6px ink
   borders, and hard offset shadows are NOT remapped to `--ae-*`. They style
   content objects and the landing's zine surfaces. PR #228 remapped them to
   the substrate — that is the "quieter sploot" failure mode this doc exists
   to prevent.
4. **Filled pills & hard shadows on content objects.** `StickerTab`,
   `BangerStamp`, pile borders, and the match ring keep their filled
   saturated blocks and offset-ink shadows — kit-illegal, deviation-legal,
   content-objects only.
5. **The three motion beats.** Resolve-once, interaction-triggered only:
   (a) `splootStamp` overshoot on banger-mark, (b) staggered tile cascade on
   pile reshuffle, (c) the summon beat. No loops, no ambient drift — this
   part matches the kit's motion law.

## Surface split

| Surface | Register |
|---|---|
| Auth door (`/sign-in`, `/sign-up`) | Substrate console (`components/auth/console-door.tsx`) — ink titlebar, hairline card, machinery strip, steered cyan. No violet, no glassmorphism (DESIGN.md §3 ban). |
| `/app` workbench chrome (navbar, dialogs, settings, forms) | Substrate quiet: semantic tokens → `--ae-*`, opaque bars, hairline rules. |
| Meme tiles, stamps, stickers, piles | Loud layer (`--sploot-*`), unchanged. |
| Landing | Loud zine surfaces on `--sploot-paper`; body copy rides the semantic layer. |

## Verification

`pnpm lint:design` asserts the substrate import, this document, and the
console door exist. Visual evidence for the adoption pass lives in the PR for
sploot-032.
