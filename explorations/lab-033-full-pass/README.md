# lab 033 · the full pass · round 2

A converged full-surface decision artifact for Sploot. Round two keeps only
the operator-selected winners and useful mutation sources. The shipped
baseline remains marked ● in the registry.

## Run it

```bash
python3 explorations/lab-033-full-pass/serve.py 4133
# → http://localhost:4133/explorations/lab-033-full-pass/index.html
```

The server sends no-cache headers (see lab-registry stale-cache gotcha).
Arrow keys ←/→ step options, ↑/↓ jump sections. Viewport presets + custom
sizes in the top bar; selection persists in localStorage.

## Round-two verdict

| section | winner / base | live mutation source | killed |
|---|---|---|---|
| DNA | DNA-1 neo-brutalist zine | DNA-5 sticker bomb | DNA-2–4, DNA-6–12 |
| BRAND | BRAND-1 bare wordmark | BRAND-7 oo frames | all others |
| LAND | LAND-1 console hero | readable sign-in states; no fake window | LAND-2–10 |
| COMP | COMP-1 shipped kit | COMP-2 cassette hover cues | COMP-3–10 |
| GRID | GRID-1 command bar + masonry grid | lighter compact controls | GRID-2–10 |
| SRCH | SRCH-1 highlight in place | score meaning below media | SRCH-2–10 |
| UP | UP-1 dropzone | UP-3 scanner state motion | UP-2, UP-4–10 |
| DET | DET-10 editorial page | full-media + metadata + related | DET-1–9 |
| SET | SET-1 shipped base | SET-2 routine toggles; SET-9 danger only | SET-3–8, SET-10 |
| AUTH | AUTH-1 centered card | mobile-safe width | AUTH-2–10 |

## Round-two corrections

- Every meme render uses repo-owned starter-pile images; the round-one SVG
  doodles are no longer rendered.
- The pile includes portrait, square, and landscape media frames, always with
  `object-fit: contain` so the complete image remains visible.
- Compact and icon actions use 2px borders and no offset shadow. Assertive
  treatment is reserved for real primary actions and structural surfaces.
- Banger and similarity metadata sit outside the media instead of covering it.
- GRID-1 mirrors the shipped toolbar anatomy: search, upload, all/bangers,
  recent, and shuffle above an uncropped masonry pile.
- UP-1 absorbs the useful scanner motion from UP-3; reduced-motion mode stops it.
- DET-10 is a dedicated, responsive editorial detail page with related memes.

Constraint sets per section are stated in the sidebar tooltips (hover a
section head) and in each option's black spec strip at the page bottom.
DNA explores new systems (constraints themselves vary); all view sections
stay inside the shipped `--sploot-*` tokens.

## Next-round mechanics

Give verdicts per section: winner / kills / mutations / new seeds. Then:
- update `app.js` SECTIONS (status lines, remove kills, add seeds),
- edit/add builders in `s-<section>.js`,
- **bump `FRAME_V` in app.js and the `?v=` params in frame.html** (cache),
- option IDs are never reused.

Per repo DESIGN.md governance this catalog stays a local artifact until
production movement is approved; commit it alongside the round verdict
(precedent: lab-032, commit fb4ce23).

Prior art: the six operator-endorsed directions in the design skill's
aesthetic library (neo-brutalist, terminal-TUI, soft-luxe, memphis, web-1.0,
instrument-panel) are treated as known; DNA-2..12 explore new territory,
and SRCH-5/6/10 fold three of the endorsed vibes into shipped tokens.
