# 057 — Toybox design system: full token + component redesign

Status: done
Created: 2026-07-09
Closed: 2026-07-10

## Goal

Fully redesign sploot — every token, every component. Direction:
hypermaximalist and fun, yet really well designed: clean, smooth, organized.
Operator-verdicted through design lab 034 (four rounds, 27 rendered
candidates), locked on AFD-8 "toybox · ink minis", then converged into the
real stack: tokens, reusable component library, all pages, enforcement.

## Acceptance oracle

- Design lab catalog with operator verdicts recorded per round (lab-034).
- `--sploot-*` token layer carries the locked system in both themes.
- Compact icon controls (theme switcher, tile heart/share/trash) are a
  first-class component exercised on every tile.
- Banger = a little heart (filled/outline). No badges, no banger sort.
- Hover-physics law everywhere: surface lifts, shadow anchors/extends;
  press sinks, shadow collapses.
- Markers move with the card (rendered inside the transformed element).
- CI parity green: lint, type-check, lint:design (ratcheted), web tests
  against pgvector, extension build.
- Browser QA evidence light + dark, desktop + 390px.

## What Was Built

- `explorations/lab-034-hypermax/` — the four-round decision record
  (18 blind candidates from 6 design philosophies → co-winners AFD-1/AFD-3 →
  9 seeded descendants → 4 icon-grammar mutations → AFD-8 locked; candy-chip
  dock from AFD-9 for 44px mobile targets).
- `apps/web/app/globals.css` — toybox token layer on stable `--sploot-*`
  names: candy palette light + night-shelf dark, drop-height elevation with
  hover/press variants, radius scale (18/10/9/pill), dotted shelf substrate,
  spring motion tokens, physics utilities (`.sploot-press`,
  `.sploot-press-sm`, `.sploot-ctl`), shadcn semantic layer repointed from
  `--ae-*` to sploot tokens. Fonts: Bungee / Baloo 2 / Space Mono on the
  stable next/font slots.
- Component library: `Button` re-skinned to pill toys; new `IconButton`
  (ink-mini grammar) and `TileActionRail` (heart/share/trash, 44px on
  mobile); all 13 sploot kit wrappers converted (BangerStamp deprecated to a
  quiet heart); production `image-tile` rebuilt as the toy card with the
  rail wired to existing handlers/analytics; chrome, skeletons, banners,
  empty states, theme toggle (now IconButton) converted.
- Pages: landing (LandingHero + below-fold story), auth door, styleguide
  (living spec), /app feed, meme detail, settings, tags, search, upload,
  share pages, offline queue.
- Enforcement: `scripts/check-design-system.mjs` extended with six
  baseline-gated rules (rawHex, rawShadow, rawRadius, handRolledLift,
  banger grammar, legacyNames); ratchet baseline pinned at 24 legacy
  occurrences (can only shrink); adoption assertions moved to the toybox
  grammar.
- Docs: DESIGN.md rewritten (operator rules as design law), tokens.md,
  component-library.md, design-contract.md provenance.

## Evidence

- Gates: `pnpm lint` ✓ · `pnpm type-check` ✓ · `pnpm lint:design` ✓ ·
  `CI=1 pnpm --filter web test` 1076/1076 against `pgvector/pgvector:pg15` ✓ ·
  `pnpm --filter extension build` ✓.
- Lab render sweeps: 19/19 (round 1), 13/13 (round 2), 7/7 (round 3) —
  both themes, zero console errors, no 390px overflow.
- Browser QA packet: `apps/web/qa-evidence/toybox-design-system/` (see PR).

Ships-backlog: backlog.d/_done/057-toybox-design-system.md
