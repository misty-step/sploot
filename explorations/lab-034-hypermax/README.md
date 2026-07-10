# lab 034 · hypermax system lab · round 1

A holistic design-system lab for Sploot: full re-derivation of every token and
every component under a new fence — **hypermaximalist, fun, yet clean and
smooth**. Each option is one complete candidate system rendered through the
same gallery contract (hero, foundations, typography, component kit with all
states, live motion demos, desktop workbench + phone compositions) over the
same fixed corpus (repo-owned starter-pile media). The shipped neo-brutalist
system is the ● baseline (`BASE-1`) and does not count toward the candidate
target.

Bench provenance: six blind philosophy lanes, one module each under `lanes/`
(`afd` anthropic-frontend-design, `taste` leon-taste-skill, `soft`
leon-soft-skill, `brut` leon-brutalist-skill, `hall` nutlope-hallmark,
`impec` impeccable-impeccable), three propositions per lane.

## Run it

```bash
# from the REPO ROOT (image paths resolve against apps/web/public)
python3 explorations/lab-034-hypermax/serve.py 4034
# → http://localhost:4034/explorations/lab-034-hypermax/index.html
```

Arrow keys ←/→ step options. Viewport presets + custom sizes in the top bar;
selection persists in localStorage. Every option page has a fixed ◐ toggle
(bottom-left) that flips that system's light/dark theme live.

## Verify a round

```bash
node explorations/lab-034-hypermax/sweep.mjs   # server must be up on :4034
```

Asserts every option renders, zero console errors, no phone-width horizontal
scroll, theme toggle present; drops light/dark/390px screenshots in
`evidence/`.

## Round mechanics

Give verdicts: winner / kills / mutations / new seeds. Then:
- update `app.js` SECTIONS (status line, remove kills, add seeds),
- edit/add builders in the originating lane's `lanes/<alias>.js` (new IDs;
  IDs are never reused),
- **bump `FRAME_V` in app.js and every `?v=` param in frame.html** (cache
  gotcha: heuristic caching can silently run the previous round's code).

Per repo DESIGN.md governance this catalog stays a local artifact until
production movement is approved; commit it alongside the round verdict
(precedent: lab-032 fb4ce23, lab-033).

Related: `explorations/lab-033-full-pass/` (round 2, converged) explored the
full surface under the *current* "Swiss chrome, feral contents" direction;
this lab supersedes nothing until the operator picks a winner here.

## Round-1 verdict (2026-07-09)

| verdict | options |
|---|---|
| co-winners (kept, favorites) | AFD-1 overprint · AFD-3 toybox |
| survivor (kept, praised) | AFD-2 signal |
| near-miss (killed; DNA folded into round-2 seeds) | HALL-3, IMPEC-2 |
| killed | TASTE-1..3, SOFT-1..3, BRUT-1..3, HALL-1..2, IMPEC-1, IMPEC-3 |

Operator notes: "torn between AFD-1 and AFD-3 … use those as the favorites and
regenerate the rest of the catalog seeded in this direction." Lane telemetry:
anthropic-frontend-design produced the highest density of liked options.
Round 2 = the two winners + AFD-2 + baseline, refilled with descendants of the
overprint/toybox DNA (afd lane: 4 descendants; each other philosophy: 1
interpretation of the DNA). Killed builders remain in lane files as inert
history; only the registry lists live options.

## Round 2 (2026-07-09, same evening)

Catalog regenerated from the winners' DNA. Live set (13): AFD-1 + AFD-3
(co-winners), AFD-2 (survivor), AFD-4 prize press, AFD-5 blacklight contact
archive, AFD-6 capsule arcade, AFD-7 peel file, SOFT-4 gilt arcade collector
edition, BRUT-4 imposition floor, HALL-4 morning-edition broadsheet, TASTE-4
stockroom daily driver, IMPEC-4 tokenized edition, ● BASE-1. Sweep 13/13 clean
(render, console, 390px, theme toggle); evidence/ refreshed. Refill lanes ran
on peer CLIs (codex, opencode, pi) during the Claude subagent limit window;
all appends were verified append-only against pre-round hashes.

## Round-3 verdict (2026-07-09)

**WINNER LOCKED: AFD-3 toybox.** Operator: none of the round-2 options beat
AFD-1/AFD-3; toybox is the pick ("I think we got to do toy box"). AFD-1 kept
as reference; everything else killed. Round 3 = four hard-polish mutations of
AFD-3 (AFD-8..11) varying ONLY the compact icon-control grammar.

Standing operator rules baked into every mutation (and later DESIGN.md):
- Compact icon buttons (theme switcher, banger/share/trash tile actions) are a
  critical component; prod's current ones look terrible; every lab option must
  exhibit them at real scale with full states, both themes.
- Banger marker = a little heart, filled/outline. No banger badges, no banger
  sort, no loud marks.
- Hover physics: the surface lifts while the shadow stays anchored or extends;
  never lift button + shadow together. Press sinks, shadow collapses.

## Round-4 verdict / FINAL LOCK (2026-07-10)

**LOCKED: AFD-8 "toybox · ink minis"** (operator deferred the 8-vs-9 pick to
the agent; rationale: loud toys / quiet controls hierarchy, crisp at icon
sizes, consistent with the operator's standing compact-control rule from
lab-033; AFD-9's candy-chip drop-height is adopted for the 44px mobile dock
only). Additional operator fix folded into converge: banger/top-match
markers must MOVE WITH the card on hover (position them inside the
transformed cell box, never anchored outside it). Converge begins: real
tokens, component library overhaul, all pages on the system, lint
enforcement. Lab is now a decision record; production carries the system.
