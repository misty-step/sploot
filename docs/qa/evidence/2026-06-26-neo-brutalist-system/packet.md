# Neo-brutalist design system QA packet

## Scope

Public landing (`/`) and rendered component catalog (`/styleguide`) for the
neo-brutalist Sploot system.

## Checks

- `pnpm lint:design`
- `pnpm --filter web exec vitest run __tests__/components/sploot/atlas-landing-hero.test.tsx`
- Browser walk at `http://localhost:3001/` and `/styleguide` on `1440x1000` and
  `390x844`
- Landing interaction: type `galaxy brain`, verify the readout and tile both
  resolve to `galaxybrain_4.png`
- Copy guard: no visible `12,408`, `12,000`, `38ms`, or `siglip` claims on the
  public demo or styleguide
- Browser capture: no page errors and no console errors

## Evidence

- `playwright-results.json`
- `landing-1440x1000.png`
- `landing-390x844.png`
- `styleguide-1440x1000.png`
- `styleguide-390x844.png`

## Verdict

PASS. The landing search demo and styleguide render at desktop and mobile sizes,
the sample query updates the matching meme cell, and the signed-out copy stays
demo-scoped.

## Residual Risk

This walk used a local dev server already running on port 3001. The screenshots
hide the large Clerk local setup helper before capture; a small Clerk dev badge
may still be visible in local screenshots and is not production UI. Authenticated
library workflows were not part of this visual-system change.
