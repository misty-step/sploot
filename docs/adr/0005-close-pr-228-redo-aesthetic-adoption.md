# ADR 0005: Close PR #228; redo the @misty-step/aesthetic adoption fresh on master

- Status: Accepted
- Date: 2026-07-07

## Context

Two visual-system efforts forked in June 2026:

- **PR #228** ("Adopt @misty-step/aesthetic as the substrate", opened
  2026-06-13, untouched since 2026-06-13): 13 files, +148/−14. It pins
  `github:misty-step/aesthetic#v2.5.1`, imports the kit's CSS into
  `globals.css` at `layer(base)`, repoints the shadcn semantic token layer
  (`--background`, `--primary`, …) at the `--ae-*` substrate with sploot's
  cyan steered as the accent, and swaps DM Sans / JetBrains Mono / Bebas
  Neue for Geist + Geist Mono — deleting the display face outright.
- **Master** meanwhile shipped the bespoke neo-brutalist system as the
  first visual-system slice (2026-06-26): DESIGN.md, `design-contract.md`,
  `docs/design/tokens.md` + `component-library.md`, the `--sploot-*` token
  layer (paper/ink, 4px borders, hard offset shadows), twelve
  `components/sploot/*` wrappers, the re-cut landing, `/styleguide`, and a
  repaired `pnpm lint:design` gate that structurally enforces all of it.

Live evidence gathered 2026-07-07:

- `gh pr view 228` reports `mergeable: CONFLICTING`. Both of its code
  targets (`globals.css`, `layout.tsx`) were rewritten by the 2026-06-26
  slice.
- The pinned substrate is stale: `#v2.5.1` vs `v2.24.0` current — nineteen
  minor versions of token/law drift in the kit itself.
- Backlog card 032's own notes gate #228 behind a "deviation doc" (the
  declared sploot loud-layer exceptions) that was never written, and state:
  merging #228 as-is "ships a *quieter* sploot (the opposite of the
  brief). Do not let #228 be the final landing state."
- The Bebas display face #228 deletes is now load-bearing: the shipped
  landing hero and section stamps read `--font-display`, and DESIGN.md
  names the display register part of the brand.
- The PR's evidence (before/after screenshots) predates the landing re-cut
  and is unusable for review.

## Decision

**Close PR #228 without merging and redo the adoption fresh on master.**

Rebasing was rejected: after resolving conflicts against a rewritten
`globals.css`/`layout.tsx`, re-pinning v2.5.1→v2.24.x, restoring the
display face the PR deletes, and re-shooting all evidence, nothing of the
original commits survives — a "rebase" is a redo with extra archaeology.
The PR's durable value is its wiring pattern, which the redo keeps:

1. Depend on `github:misty-step/aesthetic#v2.24.0` (public, MIT); import
   its CSS at `layer(base)` in `globals.css`.
2. Repoint the shadcn semantic token layer at `--ae-*` with sploot cyan as
   the steered accent — this is what re-skins the generic-shadcn `/app`
   workbench and the violet-glassmorphism auth door (both violations of
   DESIGN.md §3, which bans "purple-on-black AI glassmorphism") onto
   ink-on-paper in one move.
3. **Unlike #228:** keep Bebas as the declared display-register deviation,
   keep the `--sploot-*` loud layer (stickers, stamps, hard shadows, the
   landing) as named project tokens on top of the substrate, and document
   both in the token-mapping/deviation doc the card requires. This is the
   card's "Swiss chrome, feral contents" resolution: aesthetic is the
   disciplined frame; the sploot layer is the loud contents.

## Consequences

- #228 closes with a comment linking this ADR; its branch is not deleted
  (history stays inspectable).
- The redo lands via card sploot-032 with a design lab
  (`explorations/`) covering the auth door and workbench chrome, per the
  design-lab law.
- Future aesthetic upgrades are ordinary dependency bumps against a
  documented deviation list instead of silent brand flattening.
