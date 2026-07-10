# lab 035 · the spine · round 2

Content/layout/structure/hierarchy redesign of each core view WITHIN the
locked toybox system (lab-034 AFD-8). The system is law: frame.css carries
the shipped tokens/kit verbatim; lanes composed the kit and varied only
structure. Six sections (LAND, NAV, FEED, DET, UP, SET) × 8 candidates from
four blind philosophy lanes (afd, hall, taste, impec) + truthful screenshot
baselines of the shipped post-fixpack build. 54/54 sweep clean (render,
console, 390px, theme flip; baselines are static captures, toggle-exempt).

## Run it

```bash
# from the REPO ROOT
python3 explorations/lab-035-spine/serve.py 4035
# → http://localhost:4035/explorations/lab-035-spine/index.html
```

←/→ options, ↑/↓ sections; ◐ flips each candidate's theme live.

## Verdicts

Per section: winner / kills / mutations / seeds. Round mechanics as lab-034
(update app.js SECTIONS, edit originating lanes/<alias>.js under NEW ids,
bump FRAME_V + ?v=). Kin annotations mark cross-lane convergences (count
once toward the Law). Winners converge into apps/web per view.

### Round 1 (operator, 2026-07-10)

- **LAND** — survivors HALL-LAND-1 ("probably one of the stronger ones")
  and IMPEC-LAND-1 ("I actually like Impec Land 1 as well"); AFD-LAND-1/2
  "okay" but out; everything else killed. NEW PRODUCT FACT folded into the
  drill-down: the demo becomes a real searchable micro-gallery over a
  ~1,000-classic public corpus — randomized subset at rest, live re-rank
  with similarity scores on search, no fave/share/delete on demo cells
  (carded: backlog.d/059-live-demo-pile-on-landing.md).
- **NAV** — AFD-NAV-1 lead ("substantially better than what we have
  currently shipped"); HALL-NAV-1 kept ("I could get into that");
  AFD-NAV-2 killed ("console is just taking up too much space");
  HALL-NAV-2 killed ("a little unbalanced"); all TASTE/IMPEC nav killed
  (oversized search controls — "clearly something is wrong here").
- **FEED** — **LOCKED: AFD-FEED-1** (masonry + pile chips above the wall).
  Hard rule: every meme rendered in full, never cropped. Mixed-span and
  letterboxed directions rejected outright.
- **DET** — head-to-head: AFD-DET-1 ("solid") vs TASTE-DET-1 ("also pretty
  good"); "it's got to be one of those."
- **UP** — AFD-UP-1 lead ("great… probably the one that we do");
  HALL-UP-2 kept ("I do like haul up two though").
- **SET** — AFD-SET-1 lead ("great… probably what we want"); AFD-SET-2
  and IMPEC-SET-2 kept; "let's drill down into that."

### Round 2 (this round)

Survivors + 18 mutations from their originating lanes: LAND drill-down
around the live demo pile (HALL/IMPEC ×2 each), NAV (AFD/HALL ×2 each),
DET head-to-head refinements (AFD/TASTE ×2 each), UP (AFD/HALL ×2 each),
SET (AFD refine + blend, IMPEC ×2). FEED is locked and awaits convergence.

### Round 2 verdicts (operator delegated the pick, 2026-07-10: "use your
best judgment and ship it")

- **LAND: IMPEC-LAND-3** — keeps both survivors' DNA (IMPEC copy tower ×
  HALL console-crowned demo) with the searchable wall above the fold;
  grafted HALL-LAND-3's honest reshuffle microcopy. Converged with
  today's static starter-pile demo and honest copy; the 1,000-classic
  live corpus is backlog 059.
- **NAV: AFD-NAV-1** as endorsed in round 1 — mutations traded away
  affordances (help control, visible sort chip) for marginal density.
- **FEED: AFD-FEED-1** (operator lock). Convergence found production
  already satisfies it: masonry, object-contain uncropped tiles, in-card
  action rail, and pile chips already exist (PileFilterRail).
- **DET: AFD-DET-3** — similar-saves with score pills living in the
  sticky sidebar answers the related-memes defect most directly; grafted
  TASTE-DET-4's "ranked by cosine similarity" microcopy. Action trio
  unified to identical IconButton grammar (banger/share/delete).
- **UP: AFD-UP-1** unchanged — both AFD mutations quietly demoted the
  winning dropzone-dominant mouth into a cramped bar.
- **SET: AFD-SET-4** (SET-1 calm column + SET-2 stat row) with
  IMPEC-SET-3's token-scope-chip content graft. The typed-DELETE danger
  gate was skipped honestly: no destructive account flow exists yet.

Converged via branch feat/spine-convergence. Lab closed.
