# Make landing piles show real memes

Priority: P2 · Status: pending · Estimate: M

## Goal

The landing page's first viewport demonstrates the product mechanism — piles
filled with visible meme thumbnails/captions instead of empty pastel
rectangles.

## Oracle

- [ ] Rendered desktop (1440px) and mobile (390px) screenshots show
      `ClusterPile` tiles with visible image or caption content in the hero
      and the HOW IT WORKS section.
- [ ] `pnpm lint:design` passes with no new migration exceptions.

## Notes

Observed in the 2026-06-10 design-pass screenshots: hero piles render as empty
color blocks and HOW IT WORKS is nearly blank — the "messy saves become
automatic semantic piles" story is told in labels only, not shown.
`design-contract.md` provenance rows already mark the landing structure
"change" (first viewport should show the product mechanism).

`ClusterPile` already accepts `src?: string` per the design lint contract —
the component grammar is in place; this is content + composition work.
Options: bundled sample memes (license-safe), generated caption cards, or a
small inline SVG meme set. Structural redesign of the section flow was
explicitly deferred from the 2026-06-10 design pass.
