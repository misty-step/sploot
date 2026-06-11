# Adopt the new design system package and re-cut the landing page

Priority: P2 · Status: blocked · Estimate: XL

## Goal

Sploot's visual layer comes from the user's new aesthetic design system
package instead of the current bespoke token set, and the landing page is
rebuilt on it — cohesive, distinctive, and honest about shipped features.

## Oracle

- [ ] The design system package is a dependency; sploot's tokens/components
      map onto it with the bespoke `--sploot-*` layer reduced to genuine
      brand deltas (an explicit mapping doc says what stayed and why).
- [ ] Core surfaces (landing, /app workbench, detail page, settings,
      changelog) render on the new system; `pnpm lint:design` (updated to
      enforce the new system) green.
- [ ] Landing page redesigned on the new system: feature-true copy, real
      meme visuals, working how-it-works, pricing section once 031 lands.
- [ ] Release-note markdown on /changelog renders properly (links, lists)
      instead of raw syntax — fold this cosmetic fix into the pass.
- [ ] Evidence packets with before/after screenshots, desktop + mobile, for
      each surface.

## Notes

BLOCKED on the design system package existing/being publishable — the user
is building it separately and will import it here (see memory: design work
deliberately punted until then). When it lands, `/shape` the adoption order
(probably landing first as the showcase, then app chrome, then tiles).
Until unblocked, avoid speculative restyling; DESIGN.md and
docs/design/tokens.md remain the live contract.

## Children

1. Package lands: integrate as dependency, token mapping doc.
2. Landing rebuild on the new system.
3. App chrome + workbench migration.
4. Tile/detail/settings migration + changelog markdown rendering fix.
5. Retire dead bespoke tokens; update lint:design to the new system.
