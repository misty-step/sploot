# gallery-lab-001 · sploot gallery design lab

Pre-implementation design lab for Powder card `sploot-gallery-design-pass`:
structurally distinct directions for the `/app` gallery workbench (browse,
search, filter, select, detail) so the lead can lock ONE direction before any
production UI work. **Nothing in this directory ships**; it is a decision
artifact. No production routes are exposed — the lab is a static, self-owned
HTML surface under `docs/`.

## Run it

```bash
python3 docs/design-labs/gallery-lab-001/serve.py 4173
# then open http://127.0.0.1:4173/index.html
```

(`serve.py` sends `Cache-Control: no-store` so round bumps never serve stale
lane modules. Asset URLs are also versioned `?v=N` per round.)

Viewer: sidebar = the registry (options + provenance badges); arrow keys step
options; top bar has viewport presets (fit / 1440×900 / 1280×800 / 1024×768 /
768×1024 / 390×844) plus custom width×height with scale-to-fit readout; the
state strip switches each option through the seven canonical states
(browse / searching / results / zero / empty / selected / detail); the theme
button cycles system → light → dark (a manual stamp wins over the media
query). Selection, viewport, and theme persist in localStorage.

Rendered-evidence sweep (option × state × viewport × theme; asserts
console-clean, non-blank, no horizontal overflow; screenshots land OUTSIDE
the repo):

```bash
node docs/design-labs/gallery-lab-001/qa-sweep.mjs --out /tmp/lab001-evidence
```

## The fence

- FIXED: the toybox token system (`--sploot-*` from `apps/web/app/globals.css`,
  ported verbatim into `frame.css`), radius scale 18/10/9/pill, 3px ink shells,
  straight-down hard drops, the hover-physics law, ink-mini controls, heart =
  the only banger marker, 44px touch floor, light + dark first-class, sploot
  voice, DESIGN.md anti-patterns (no gradients / glass / blur / tints).
- VARIES: layout macrostructure, grid density and rhythm, filter integration,
  search feedback, selection model, detail/lightbox concept, mobile command
  placement, empty/loading/zero treatment.
- Corpus: 48 license-safe doodle stand-ins with real-shaped metadata (shared
  `LAB` API in `frame.js`); no external assets.

## Source material and constraints

- `DESIGN.md` (toybox grammar, operator rules from lab-034) and `VISION.md`
  (capture→retrieval arc) are live authority.
- PR #274 was inspected read-only as source material (stale/conflicting; its
  neo-brutalist shadow language is dead). Ideas carried in as product facts:
  never cover the artwork; human-readable relevance ("match 91%"); the
  lightbox-vs-detail-page question; aspect-safe previews.
- Independent audit constraints baked into every lane brief: any modal detail
  needs a real focus-trap story; no nested-interactive tiles (inset overlay
  button pattern); search/zero/loading must be unmistakably distinct; counts
  distinguish library total from filtered subsets. Search-pagination and
  upload-command correctness bugs are implementation-lane work, not design-lab
  scope, but no candidate may design them away.

## Bench

Five blind parallel lanes, one philosophy each, two options per lane; the
shipped state rides along as `BASE-0` (baseline, never a candidate):

| lane | philosophy | brings |
|---|---|---|
| `afd` | anthropic frontend design | distinctive structural thesis; push the toybox further |
| `emil` | fluid physical interaction | spatial continuity, sheets, gesture-first mobile |
| `taste` | metric-based anti-default | density dials, type discipline, fzf search mechanics |
| `brut` | structural brutalism (token-translated) | exposed retrieval pipeline, machine honesty |
| `mini` | flat editorial minimalism | subtraction, media-first, museum detail |

## Candidates (round 1 · 10 after dedupe review · baseline separate)

Every option renders all seven states at 1440×900 and 390×844 in both themes.
Named structural moves; no two are reskins. Composer dedupe review kept all
ten: the closest pair is MINI-1 / TASTE-2 (both delete all chrome above the
grid) but they differ in cell anatomy (no captions vs full tiles), filter
voice (text links vs pill chips), and detail model (museum room vs modal), so
both stand.

| id | name | structural move |
|---|---|---|
| `BASE-0` | shipped workbench | baseline, not a candidate: top command bar + pile rail over 4-col masonry; off-system blur lightbox; mobile dock |
| `AFD-1` | the shelf stack | piles are physical shelves (labeled ledges toys sit on); search carpenters a results shelf at the top; detail is an inline workbench drawer splitting the stack |
| `AFD-2` | wall and remote | chrome inverted: edge-to-edge micro-tile wall, pile plaques as load-bearing grid cells, ONE floating console toy is all chrome; detail is a full inspection bay |
| `EMIL-1` | the shelf that opens | left pile drawer with edge grabber; results reveal in place and the grid never moves; detail expands from its slot and snaps back |
| `EMIL-2` | thumb console | inversion: mobile primary; zero top chrome; one bottom sheet (peek/half/full) runs everything; hits get pulled into a swipeable tray, slots become dashed sockets |
| `TASTE-1` | finder pane | inversion: a full-height fzf finder IS the interface (token-highlighted rows, score column, hotkeys); grid demotes to preview shelf |
| `TASTE-2` | counted sheet | zero chrome above the grid: full-bleed 8×4 counted tile sheet; ALL chrome in one bottom command strip that is also the state machine |
| `BRUT-1` | index spine | the machine console IS the app: left spine owns query + exposed tokenize→embed→cosine→return pipeline + pile table + index ledger; fig-labeled hits/recede sections |
| `BRUT-2` | title block | inversion: the status bar becomes primary chrome (engineering masthead with stat/pipeline/pile cells); library is recency registers (today/week/deep pile); detail is a plate page |
| `MINI-1` | the bare wall | subtraction: captionless uniform wall from pixel zero; one bottom ledger line owns filters, counts, states; detail is a museum room |
| `MINI-2` | margin catalog | book-margin text column beside a masonry of framed plates with wall labels; detail is a paginated plate spread |

## Verdict matrix (designer scores, 1–5; risk 5 = lowest)

| id | retrieval speed | capture→retrieval continuity | distinctiveness | responsive coherence | a11y feasibility | impl. risk | toybox fit | Σ |
|---|---|---|---|---|---|---|---|---|
| AFD-1 | 4 | 4 | 5 | 3 | 3 | 2 | 5 | 26 |
| AFD-2 | 4 | 4 | 5 | 4 | 3 | 3 | 4 | 27 |
| EMIL-1 | 5 | 4 | 4 | 4 | 4 | 3 | 4 | 28 |
| EMIL-2 | 3 | 4 | 5 | 5 | 3 | 2 | 4 | 26 |
| TASTE-1 | 4 | 4 | 5 | 4 | 5 | 4 | 4 | 30 |
| TASTE-2 | 5 | 3 | 4 | 5 | 4 | 4 | 4 | 29 |
| BRUT-1 | 4 | 5 | 5 | 4 | 4 | 3 | 5 | 30 |
| BRUT-2 | 4 | 5 | 5 | 4 | 4 | 3 | 4 | 29 |
| MINI-1 | 4 | 3 | 4 | 4 | 3 | 4 | 3 | 25 |
| MINI-2 | 3 | 4 | 4 | 4 | 4 | 3 | 3 | 25 |

Scoring notes:
- TASTE-1's rows are the fastest text-retrieval machine, but memes are
  recognized visually; demoting thumbnails to a preview shelf trades against
  DESIGN.md's image-first priority (hence 4, not 5, on retrieval).
- AFD-1's horizontal shelves cost vertical scan density on mobile (~2 shelves
  per screen) and make list virtualization hard (risk 2).
- EMIL-2 is the best pure-mobile story in the lab but leaves desktop
  underpowered and carries the heaviest interaction build.
- BRUT-1/BRUT-2 score 5 on continuity because the queue/embedding ledger and
  "saved today" registers make the capture arc visible in the browse surface.
- MINI options are the calmest, but sit furthest from the loud-toy brand.

## Recommendation (designer's, not a lock — the lead decides)

- **Primary: `BRUT-1` index spine.** Ties the top score while keeping the
  image grid primary (visual recognition is the retrieval act for memes),
  literalizes the brand's "machine shows its work" with the exposed
  tokenize→embed→cosine→return pipeline, gives the clearest
  searching/results/zero distinction in the lab, and maps cleanly to a
  bottom statusline + candy chips on mobile. Main tradeoff: the spine is a
  full layout rework of `/app` (medium implementation risk) and the pipeline
  cells must stay honest (only render stages the API actually reports).
- **Backup: `TASTE-2` counted sheet.** Highest thumbnail density, lowest
  implementation risk (survives most shipped components; the bottom strip is
  continuous with the shipped mobile command dock), and its strip could
  absorb BRUT-1's pipeline cells as a round-2 mutation if the lead wants
  machine honesty without the spine.
- **Grafts worth carrying regardless of winner:** EMIL-1's "results reveal in
  place; the grid never moves" behavior; TASTE-1's token highlighting and
  visible hotkeys; the human-readable "match 91%" treatment (used by most
  candidates); a real focus-trap dialog to replace the shipped blur lightbox,
  which every candidate retires.

## Verdict state

Round 1 complete · awaiting lead verdicts (kill / mutate / lock per option).
Mutations return to the originating lane's philosophy under new IDs; the
catalog refills toward the Law after kills.
