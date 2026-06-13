# Adopt @misty-step/aesthetic — the loud one, in the family

sploot keeps its personality — the self-organizing zine archive, the
cyan/coral/violet stickers, the meme grid — but the **bones become the
design system**. This is the substrate adoption: Geist, the aesthetic
token layer, and the cyan steered as the accent, with coral and violet
kept as project tokens.

## How it's wired

sploot's components already read a shadcn-style semantic layer
(`--background`, `--foreground`, `--primary`, `--border`, …). Rather
than rewrite 24 components, this **repoints that layer at the
aesthetic substrate** — every token resolves to `--ae-*`, so the whole
app re-skins to ink-on-paper at once, and light/dark follow the
system's own resolution.

- **`apps/web/package.json`** — depends on
  `github:misty-step/aesthetic#v2.5.1`.
- **`apps/web/app/globals.css`** — `@import "@misty-step/aesthetic"
  layer(base)`, then a final cascade block that maps the semantic
  tokens onto `--ae-*` and sets the steering:

  ```css
  :root {
    --ae-accent: #0c6a84; /* sploot cyan — AA 6.00 light */
    --ae-accent-dark: #00f0ff; /* AA 13.30 dark */
  }
  ```

  Coral (`#DC2626`/`#FF6B6B`) and violet (`#7C3AED`/`#A855F7`) stay as
  project tokens — the loud accents, spent on stickers and content,
  never on ink hierarchy. Radius was already 0.
- **`apps/web/app/layout.tsx`** — Geist + Geist Mono via `next/font`
  replace DM Sans, JetBrains Mono, and the Bebas Neue display face;
  the hero now reads loud in Geist weight instead of a condensed
  display family. The `--font-display` mapping points at Geist too.

## Verification

- `pnpm type-check` — clean.
- `pnpm exec next build` — the production CSS compiles and 31/42 pages
  prerender; it stops only on a missing Clerk publishableKey (a
  pre-existing credential requirement, unrelated to this change).
- Live render measured: the hero is 72px **Geist** (was Bebas),
  centered, the page healthy (1280px body, 100 nodes) in both modes.

### Before / after — the hero (light)

The condensed Bebas display caps become clean Geist on the paper
surface; the "NO FOLDERS JUST VIBES" chip is a hairline mono tag; the
sticker tiles keep their cyan/coral/violet personality:

![after hero](docs/adoption/after-hero-light.png)

Full-page before/after (both modes) are in `docs/adoption/`.

## Follow-ups (staged, not in this PR)

This PR lands the substrate. The natural next steps, left for review so
the foundation can land first: re-costume the Radix primitives onto the
`.ae-*` classes (dialog, menu, toast, tabs, tooltip → the system's
costumes), and decide how far to collapse the landing's display type
scale (sploot is the loud consumer — some display presence is in-doctrine).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
