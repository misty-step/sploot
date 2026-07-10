/* lab 034 · lane TASTE — three complete-system propositions under the
   design-taste-frontend doctrine (variance 8, motion pushed to 7, density
   dialed per option; anti-slop rules enforced: no pure black, tinted or hard
   ink shadows only, no glows, mono tabular numerals, labels above inputs,
   full loading/empty/error cycles, transform/opacity motion only). */
'use strict';

(() => {

/* ================================================================
   TASTE-1 · "OPERATIONS LEDGER" — maximalism as data density.
   System rule: no cards, no floats; every object lives inside a 1px
   hairline lattice. delight = machinery annotation everywhere, index
   colors as thin instrument bars, everything countable is counted.
   Type: Bricolage Grotesque / Outfit / IBM Plex Mono.
   ================================================================ */

function t1Cell(m, state = '', score = false) {
  const tags = { match: 'match', near: 'related', dim: 'filtered', sel: 'selected' };
  const tag = tags[state] || '';
  return `
  <div class="t1-cell ${state}">
    <div class="hd"><span>${esc(m.file)}</span><span class="num">vec ${m.vec}</span></div>
    <div class="art" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>
    <div class="ft">
      <span class="cap">${esc(m.cap)}</span>
      ${m.banger ? '<span class="t1-banger">banger</span>' : ''}
    </div>
    ${score || tag ? `<div class="sc">
      ${score ? `<b class="num">${(m.score / 100).toFixed(2)}</b>` : ''}
      ${tag ? `<span class="t1-tag ${state}">${tag}</span>` : ''}
    </div>` : ''}
  </div>`;
}

function t1Console(q = 'cat losing it', id = '') {
  return `
  <div class="t1-console" ${id ? `id="${id}"` : ''}>
    <label class="t1-lab" for="t1q${id}">semantic query</label>
    <div class="row">
      <input class="t1-input" id="t1q${id}" type="text" value="${esc(q)}" spellcheck="false">
      <button class="t1-btn primary" type="button">find it</button>
    </div>
    <p class="t1-help">describe the picture. the index handles the rest.</p>
    <div class="meta num">
      <span>index <b>${LIB.total.toLocaleString()}</b> vec</span>
      <span>model <b>${LIB.model}</b></span>
      <span>dim <b>${LIB.dim}</b></span>
      <span>latency <b>${LIB.latency}ms</b></span>
      <span>route <b>/api/search</b></span>
    </div>
  </div>`;
}

function t1Status() {
  return `
  <div class="t1-status num">
    <span><b>index</b> ${LIB.total.toLocaleString()} vec</span>
    <span><b>embedded</b> ${LIB.embedded.toLocaleString()}</span>
    <span><b>queue</b> ${LIB.queued}</span>
    <span><b>model</b> ${LIB.model}</span>
    <span><b>p50</b> ${LIB.latency}ms</span>
    <span class="live"><i></i>live</span>
  </div>`;
}

SPECS['TASTE-1'] = (mount) => {
  css('TASTE-1', `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');

  .taste1 {
    --t1-bg: #f4f3ee;
    --t1-srf: #fbfaf6;
    --t1-ink: #17171c;
    --t1-mut: #5e5e68;
    --t1-linec: #c9c8bf;
    --t1-hardc: #17171c;
    --t1-acid: #8fb800;
    --t1-cobalt: #2743cc;
    --t1-cyan: #0e8f9e;
    --t1-ember: #cf3a1a;
    --t1-rose: #c22a74;
    --t1-line: 1px solid var(--t1-linec);
    --t1-rule: 2px solid var(--t1-hardc);
    --t1-disp: 'Bricolage Grotesque', sans-serif;
    --t1-body: 'Outfit', sans-serif;
    --t1-mono: 'IBM Plex Mono', monospace;
    --t1-fast: 110ms; --t1-ease: cubic-bezier(0.16, 1, 0.3, 1);
    min-height: 100dvh; display: flex; flex-direction: column;
    background: var(--t1-bg); color: var(--t1-ink);
    font-family: var(--t1-body); font-size: 15px; line-height: 1.5;
  }
  .taste1.theme-dark {
    --t1-bg: #141419;
    --t1-srf: #1b1b22;
    --t1-ink: #ecedf2;
    --t1-mut: #9d9dab;
    --t1-linec: #34343e;
    --t1-hardc: #ecedf2;
    --t1-acid: #b8e02a;
    --t1-cobalt: #8494ff;
    --t1-cyan: #3fc4d4;
    --t1-ember: #ff7a55;
    --t1-rose: #ff6cb1;
    --t1-line: 1px solid var(--t1-linec);
    --t1-rule: 2px solid var(--t1-hardc);
  }
  .taste1 .num { font-family: var(--t1-mono); font-variant-numeric: tabular-nums; }
  .taste1 :focus-visible { outline: 2px solid var(--t1-cobalt); outline-offset: 2px; }
  .taste1 a { color: inherit; }

  .taste1 .wrap { width: 100%; max-width: 1360px; margin: 0 auto; padding: 0 32px; }
  .taste1 .sec {
    display: flex; gap: 14px; align-items: baseline; margin-top: 56px; padding: 8px 0;
    border-top: var(--t1-rule); font-family: var(--t1-mono); font-size: 11px;
    text-transform: uppercase; letter-spacing: .14em;
  }
  .taste1 .sec b { color: var(--t1-cobalt); }
  .taste1 .sec span { color: var(--t1-mut); }

  /* masthead */
  .taste1 .mast {
    display: flex; align-items: center; gap: 22px; padding: 10px 32px;
    border-bottom: var(--t1-rule); background: var(--t1-srf);
  }
  .taste1 .logo { font-family: var(--t1-disp); font-weight: 800; font-size: 21px; letter-spacing: -.02em; }
  .taste1 .logo i { font-style: normal; color: var(--t1-cobalt); }
  .taste1 .mnav { display: flex; gap: 18px; margin-left: auto; font-family: var(--t1-mono); font-size: 11px; text-transform: uppercase; }
  .taste1 .mnav a { text-decoration: none; color: var(--t1-mut); padding: 6px 2px; border-bottom: 2px solid transparent; }
  .taste1 .mnav a:hover { color: var(--t1-ink); border-bottom-color: var(--t1-acid); }
  .taste1 .mast .pulse { font-family: var(--t1-mono); font-size: 10px; color: var(--t1-mut); }

  /* hero: split, left aligned, machinery rail on the right */
  .taste1 .hero { display: grid; grid-template-columns: 1.25fr .75fr; border-bottom: var(--t1-line); }
  .taste1 .hero .l { padding: 56px 40px 44px 32px; display: flex; flex-direction: column; gap: 22px; border-right: var(--t1-line); }
  .taste1 .eyebrow { font-family: var(--t1-mono); font-size: 11px; text-transform: uppercase; letter-spacing: .18em; color: var(--t1-mut); }
  .taste1 .h1 {
    font-family: var(--t1-disp); font-weight: 800; letter-spacing: -.035em;
    font-size: clamp(40px, 5.2vw, 66px); line-height: .98;
  }
  .taste1 .h1 em { font-style: normal; box-shadow: inset 0 -0.28em 0 color-mix(in srgb, var(--t1-acid) 55%, transparent); }
  .taste1 .sub { max-width: 52ch; color: var(--t1-mut); font-size: 16px; }
  .taste1 .hero .r { background: var(--t1-srf); display: flex; flex-direction: column; }
  .taste1 .hero .r .rrow {
    display: grid; grid-template-columns: 1fr 1fr; border-bottom: var(--t1-line);
  }
  .taste1 .hero .r .rrow > div { padding: 18px 20px; }
  .taste1 .hero .r .rrow > div + div { border-left: var(--t1-line); }
  .taste1 .kpi .kl { font-family: var(--t1-mono); font-size: 10px; text-transform: uppercase; letter-spacing: .12em; color: var(--t1-mut); }
  .taste1 .kpi .kv { font-family: var(--t1-mono); font-variant-numeric: tabular-nums; font-size: 30px; font-weight: 600; line-height: 1.15; }
  .taste1 .kpi .kv i { font-style: normal; font-size: 13px; color: var(--t1-mut); }
  .taste1 .kpi.a .kv { color: var(--t1-cobalt); }
  .taste1 .hero .r .fill { flex: 1; display: grid; place-items: center; padding: 20px; }
  .taste1 .hero .r .fill .t1-cell { width: min(240px, 100%); border: var(--t1-line); }

  /* console */
  .taste1 .t1-console { background: var(--t1-srf); border: var(--t1-line); border-left: 4px solid var(--t1-cobalt); padding: 16px 18px 0; }
  .taste1 .t1-lab { display: block; font-family: var(--t1-mono); font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: var(--t1-mut); margin-bottom: 8px; }
  .taste1 .t1-console .row { display: flex; gap: 10px; }
  .taste1 .t1-input {
    flex: 1; min-width: 0; background: var(--t1-bg); color: var(--t1-ink);
    border: var(--t1-line); border-bottom: 2px solid var(--t1-ink);
    padding: 11px 13px; font-family: var(--t1-mono); font-size: 15px;
  }
  .taste1 .t1-input:focus-visible { outline-offset: 0; border-bottom-color: var(--t1-cobalt); }
  .taste1 .t1-help { font-size: 12px; color: var(--t1-mut); margin: 8px 0 10px; }
  .taste1 .t1-console .meta {
    display: flex; flex-wrap: wrap; gap: 4px 20px; padding: 8px 0; margin: 0 -18px; padding-left: 18px; padding-right: 18px;
    border-top: var(--t1-line); font-size: 10px; text-transform: uppercase; color: var(--t1-mut);
  }
  .taste1 .t1-console .meta b { color: var(--t1-ink); font-weight: 600; }

  /* buttons: flat instruments, 44px primaries, push feedback */
  .taste1 .t1-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 44px; padding: 0 20px; border: 2px solid var(--t1-ink);
    background: var(--t1-srf); color: var(--t1-ink);
    font-family: var(--t1-mono); font-size: 13px; font-weight: 600; text-transform: uppercase;
    transition: transform var(--t1-fast) var(--t1-ease), background var(--t1-fast) var(--t1-ease);
  }
  .taste1 .t1-btn:hover { background: var(--t1-bg); }
  .taste1 .t1-btn:active { transform: translateY(2px); }
  .taste1 .t1-btn.primary { background: var(--t1-ink); color: var(--t1-bg); }
  .taste1 .t1-btn.primary:hover { background: var(--t1-cobalt); border-color: var(--t1-cobalt); color: #fff; }
  .taste1 .t1-btn.ghost { border-color: var(--t1-linec); color: var(--t1-mut); }
  .taste1 .t1-btn.ghost:hover { color: var(--t1-ink); border-color: var(--t1-ink); }
  .taste1 .t1-btn.sm { min-height: 32px; padding: 0 10px; font-size: 11px; border-width: 1px; text-transform: none; }
  .taste1 .t1-btn.icon { width: 44px; padding: 0; }
  .taste1 .t1-btn.icon.sm { width: 32px; }

  /* tags, banger, sticker */
  .taste1 .t1-tag {
    font-family: var(--t1-mono); font-size: 9px; text-transform: uppercase; letter-spacing: .1em;
    padding: 2px 6px; border: 1px solid currentColor;
  }
  .taste1 .t1-tag.match { color: color-mix(in srgb, var(--t1-acid) 60%, var(--t1-ink)); }
  .taste1 .t1-tag.near { color: var(--t1-cyan); }
  .taste1 .t1-tag.dim { color: var(--t1-mut); }
  .taste1 .t1-tag.sel { color: var(--t1-cobalt); }
  .taste1 .t1-banger {
    flex: none; font-family: var(--t1-mono); font-size: 9px; font-weight: 600; text-transform: uppercase;
    color: #fff; background: var(--t1-rose); padding: 2px 6px;
  }
  .taste1.theme-dark .t1-banger { color: #141419; }
  .taste1 .t1-stick {
    display: inline-flex; align-items: center; gap: 6px; font-family: var(--t1-mono); font-size: 11px;
    padding: 5px 10px; border: 1px solid var(--t1-linec); background: var(--t1-srf); color: var(--t1-mut);
  }
  .taste1 .t1-stick i { width: 8px; height: 8px; flex: none; }

  /* cells inside a 1px lattice: grid gap paints the hairlines */
  .taste1 .lattice { display: grid; gap: 1px; background: var(--t1-linec); border: var(--t1-line); }
  .taste1 .c4 { grid-template-columns: repeat(4, 1fr); }
  .taste1 .t1-cell { background: var(--t1-srf); display: flex; flex-direction: column; position: relative; }
  .taste1 .t1-cell .hd {
    display: flex; justify-content: space-between; gap: 8px; padding: 6px 9px;
    font-family: var(--t1-mono); font-size: 9px; text-transform: uppercase; color: var(--t1-mut);
    border-bottom: var(--t1-line); white-space: nowrap; overflow: hidden;
  }
  .taste1 .t1-cell .art { display: grid; place-items: center; overflow: hidden; background: var(--t1-bg); }
  .taste1 .t1-cell .meme-media { background: var(--t1-bg); }
  .taste1 .t1-cell .ft {
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
    padding: 8px 9px; font-size: 12.5px; line-height: 1.35; border-top: var(--t1-line); margin-top: auto;
  }
  .taste1 .t1-cell .sc {
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
    padding: 5px 9px; border-top: var(--t1-line); font-size: 12px;
  }
  .taste1 .t1-cell.match { box-shadow: inset 0 4px 0 var(--t1-acid); }
  .taste1 .t1-cell.near { box-shadow: inset 0 4px 0 var(--t1-cyan); }
  .taste1 .t1-cell.dim { opacity: .38; filter: grayscale(.5); }
  .taste1 .t1-cell.sel { box-shadow: inset 0 0 0 3px var(--t1-cobalt); }
  .taste1 .t1-cell.sel .hd { background: var(--t1-cobalt); color: #fff; }
  .taste1 .t1-cell.err { box-shadow: inset 0 4px 0 var(--t1-ember); }
  .taste1 .t1-cell .errbox {
    display: flex; flex-direction: column; gap: 8px; align-items: flex-start; justify-content: center;
    padding: 18px; font-family: var(--t1-mono); font-size: 11px; color: var(--t1-ember);
  }
  .taste1 .skel {
    width: 100%; height: 100%; min-height: 120px;
    background: linear-gradient(100deg, var(--t1-bg) 40%, var(--t1-srf) 50%, var(--t1-bg) 60%);
    background-size: 200% 100%; animation: t1shim 1.4s linear infinite;
  }
  @keyframes t1shim { to { background-position: -200% 0; } }

  /* stat strip: logic grouping via rules, no boxes */
  .taste1 .stats { display: grid; grid-template-columns: repeat(3, 1fr); border-top: var(--t1-rule); }
  .taste1 .stats > div { padding: 16px 18px 18px 0; border-bottom: var(--t1-line); }
  .taste1 .stats > div + div { padding-left: 18px; border-left: var(--t1-line); }
  .taste1 .stats .kl { font-family: var(--t1-mono); font-size: 10px; text-transform: uppercase; letter-spacing: .12em; color: var(--t1-mut); }
  .taste1 .stats .kv { font-family: var(--t1-mono); font-variant-numeric: tabular-nums; font-size: 42px; font-weight: 600; line-height: 1.1; }
  .taste1 .stats .kv.a { color: var(--t1-cobalt); }
  .taste1 .stats .kv.r { color: var(--t1-rose); }

  /* status bar */
  .taste1 .t1-status {
    display: flex; flex-wrap: wrap; gap: 0; border-top: var(--t1-rule); background: var(--t1-srf);
    font-size: 11px;
  }
  .taste1 .t1-status > span { display: inline-flex; align-items: center; gap: 7px; padding: 8px 16px; border-right: var(--t1-line); }
  .taste1 .t1-status b { text-transform: uppercase; font-weight: 400; color: var(--t1-mut); font-size: 9px; letter-spacing: .1em; }
  .taste1 .t1-status .live { color: color-mix(in srgb, var(--t1-acid) 60%, var(--t1-ink)); text-transform: uppercase; }
  .taste1 .t1-status .live i { width: 8px; height: 8px; background: var(--t1-acid); display: inline-block; }

  /* tabs */
  .taste1 .tabs { display: inline-flex; border: var(--t1-line); }
  .taste1 .tab {
    min-height: 40px; padding: 0 16px; display: inline-flex; align-items: center;
    background: var(--t1-srf); border: 0; border-right: var(--t1-line); color: var(--t1-mut);
    font-family: var(--t1-mono); font-size: 12px; text-transform: uppercase; cursor: pointer;
  }
  .taste1 .tab:last-child { border-right: 0; }
  .taste1 .tab.on { color: var(--t1-ink); box-shadow: inset 0 -3px 0 var(--t1-acid); font-weight: 600; }

  /* toast */
  .taste1 .toast {
    display: inline-flex; align-items: center; gap: 10px; padding: 10px 16px;
    background: var(--t1-ink); color: var(--t1-bg); font-family: var(--t1-mono); font-size: 12px;
    border-left: 4px solid var(--t1-acid);
  }
  .taste1 .toast.pop { animation: t1toast 200ms var(--t1-ease); }
  @keyframes t1toast { from { transform: translateY(8px); opacity: 0; } }

  /* empty state: personality slot */
  .taste1 .empty {
    border: var(--t1-line); border-left: 4px solid var(--t1-rose); background: var(--t1-srf);
    padding: 26px 24px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start;
  }
  .taste1 .empty .num0 { font-family: var(--t1-mono); font-size: 40px; font-weight: 600; line-height: 1; }
  .taste1 .empty p { font-size: 14px; color: var(--t1-mut); max-width: 40ch; }

  /* type specimen */
  .taste1 .spec { display: flex; flex-direction: column; gap: 14px; }
  .taste1 .spec .row2 { display: grid; grid-template-columns: 130px 1fr; gap: 18px; align-items: baseline; border-bottom: var(--t1-line); padding-bottom: 12px; }
  .taste1 .spec .row2 > span:first-child { font-family: var(--t1-mono); font-size: 10px; text-transform: uppercase; color: var(--t1-mut); }

  /* foundations shapes */
  .taste1 .shapes { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 16px; }
  .taste1 .shape {
    width: 132px; height: 84px; display: grid; place-items: center; text-align: center;
    background: var(--t1-srf); font-family: var(--t1-mono); font-size: 9px; text-transform: uppercase; color: var(--t1-mut);
  }

  /* motion lab */
  .taste1 .mlab { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; margin-top: 18px; }
  .taste1 .cascade { display: grid; grid-template-columns: repeat(6, 44px); gap: 1px; background: var(--t1-linec); border: var(--t1-line); }
  .taste1 .cascade i { display: block; height: 44px; background: var(--t1-srf); }
  .taste1 .cascade.go i { animation: t1rise 300ms var(--t1-ease) both; animation-delay: calc(var(--i) * 55ms); }
  @keyframes t1rise { from { transform: translateY(10px); opacity: 0; } }
  .taste1 .revealcell { width: 190px; }
  .taste1 .revealcell .t1-cell { border: var(--t1-line); }
  .taste1 .revealcell .t1-cell.matchgo { animation: t1match 260ms var(--t1-ease); }
  @keyframes t1match { 0% { box-shadow: inset 0 0 0 var(--t1-acid); } 100% { box-shadow: inset 0 4px 0 var(--t1-acid); } }
  .taste1 .rm-note { font-family: var(--t1-mono); font-size: 10px; text-transform: uppercase; color: var(--t1-mut); max-width: 40ch; }

  /* workbench composition */
  .taste1 .bench { border: var(--t1-rule); background: var(--t1-srf); }
  .taste1 .bench .cmd { display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-bottom: var(--t1-line); }
  .taste1 .bench .cmd .t1-input { flex: 1; max-width: 460px; padding: 8px 12px; font-size: 13px; }
  .taste1 .bench .body { display: grid; grid-template-columns: 230px 1fr; }
  .taste1 .rail { border-right: var(--t1-line); display: flex; flex-direction: column; }
  .taste1 .rail .rl { font-family: var(--t1-mono); font-size: 10px; text-transform: uppercase; letter-spacing: .12em; color: var(--t1-mut); padding: 12px 14px 6px; }
  .taste1 .pile {
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
    padding: 9px 14px; border: 0; border-top: var(--t1-line); background: none; color: var(--t1-ink);
    font-family: var(--t1-body); font-size: 13px; text-align: left; cursor: pointer;
  }
  .taste1 .pile b { font-family: var(--t1-mono); font-weight: 400; font-size: 11px; color: var(--t1-mut); }
  .taste1 .pile i { width: 8px; height: 8px; flex: none; }
  .taste1 .pile:hover { background: var(--t1-bg); }
  .taste1 .pile.on { box-shadow: inset 3px 0 0 var(--t1-cobalt); font-weight: 600; background: var(--t1-bg); }
  .taste1 .bench .lattice { border: 0; border-left: var(--t1-line); }

  /* phone */
  .taste1 .phone {
    width: 390px; max-width: 100%; border: var(--t1-rule); background: var(--t1-bg);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .taste1 .phone .dock { display: flex; border-top: var(--t1-rule); background: var(--t1-srf); }
  .taste1 .phone .dock button {
    flex: 1; min-height: 50px; background: none; border: 0; border-right: var(--t1-line);
    font-family: var(--t1-mono); font-size: 10px; text-transform: uppercase; color: var(--t1-mut); cursor: pointer;
  }
  .taste1 .phone .dock button:last-child { border-right: 0; }
  .taste1 .phone .dock button.on { color: var(--t1-ink); box-shadow: inset 0 3px 0 var(--t1-cobalt); font-weight: 600; }

  @media (max-width: 860px) {
    .taste1 .wrap { padding: 0 16px; }
    .taste1 .mast { padding: 10px 16px; flex-wrap: wrap; }
    .taste1 .hero { grid-template-columns: 1fr; }
    .taste1 .hero .l { border-right: 0; border-bottom: var(--t1-line); padding: 36px 16px; }
    .taste1 .c4 { grid-template-columns: repeat(2, 1fr); }
    .taste1 .stats { grid-template-columns: 1fr; }
    .taste1 .stats > div + div { padding-left: 0; border-left: 0; }
    .taste1 .bench .body { grid-template-columns: 1fr; }
    .taste1 .rail { border-right: 0; border-bottom: var(--t1-line); }
    .taste1 .spec .row2 { grid-template-columns: 1fr; gap: 4px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .taste1 *, .taste1 *::before, .taste1 *::after { animation: none !important; transition: none !important; }
  }
  `);

  const M = MEMES;
  const pileColors = ['var(--t1-cobalt)', 'var(--t1-rose)', 'var(--t1-ember)', 'var(--t1-cyan)', 'var(--t1-acid)', 'var(--t1-mut)'];
  mount.innerHTML = `
  <div class="taste1">
    <div class="mast">
      <span class="logo">sploot<i>.</i></span>
      <span class="pulse num">${LIB.embedded.toLocaleString()}/${LIB.total.toLocaleString()} embedded</span>
      <nav class="mnav"><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">upload</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </div>

    <div class="hero">
      <div class="l">
        <span class="eyebrow">private meme archive · semantic index</span>
        <h1 class="h1">type words.<br>get the <em>picture.</em></h1>
        <p class="sub">no folders. just vibes. every image you throw at the pile gets a 768-dim vector and a seat in the index.</p>
        ${t1Console('cat losing it', 'hero')}
      </div>
      <div class="r">
        <div class="rrow">
          <div class="kpi a"><div class="kl">memes indexed</div><div class="kv num">1,482</div></div>
          <div class="kpi"><div class="kl">bangers</div><div class="kv num">37</div></div>
        </div>
        <div class="rrow">
          <div class="kpi"><div class="kl">search p50</div><div class="kv num">212<i>ms</i></div></div>
          <div class="kpi"><div class="kl">folders required</div><div class="kv num">0</div></div>
        </div>
        <div class="fill">${t1Cell(M[0], 'match', true)}</div>
      </div>
    </div>

    <div class="wrap"><div class="sec"><b>01</b> foundations <span>hairline lattice · index colors as instrument bars</span></div></div>
    ${swatches([
      ['ink', '#17171c', '#fff'], ['bg bone', '#f4f3ee'], ['surface', '#fbfaf6'], ['hairline', '#c9c8bf'],
      ['cobalt', '#2743cc', '#fff'], ['acid', '#8fb800'], ['cyan', '#0e8f9e', '#fff'], ['ember', '#cf3a1a', '#fff'], ['rose', '#c22a74', '#fff'],
    ])}
    <div class="wrap">
      <div class="shapes">
        <div class="shape" style="border:1px solid var(--t1-linec)">1px hairline · lattice</div>
        <div class="shape" style="border:2px solid var(--t1-ink)">2px rule · structure</div>
        <div class="shape" style="border:1px solid var(--t1-linec);border-left:4px solid var(--t1-cobalt)">4px bar · meaning</div>
        <div class="shape" style="border:1px solid var(--t1-linec);box-shadow:inset 0 4px 0 var(--t1-acid)">state bar · top</div>
        <div class="shape" style="border:1px solid var(--t1-linec);border-radius:0">radius 0 · no exceptions</div>
        <div class="shape" style="border:1px solid var(--t1-linec);box-shadow:none">elevation 0 · flat by law</div>
      </div>
      <p class="rm-note" style="margin-top:12px;max-width:none">spacing rides an 8px scale; sections divide by rules, never by boxes. density: cockpit.</p>
    </div>

    <div class="wrap"><div class="sec"><b>02</b> type <span>bricolage grotesque · outfit · ibm plex mono</span></div>
      <div class="spec">
        <div class="row2"><span>display 800</span><span style="font-family:var(--t1-disp);font-weight:800;font-size:44px;letter-spacing:-.03em;line-height:1">shuffle the pile</span></div>
        <div class="row2"><span>body 400</span><span style="max-width:58ch">outfit carries the reading layer. the index sorts your chaos into piles overnight and never asks you to name a folder.</span></div>
        <div class="row2"><span>label</span><span style="font-family:var(--t1-mono);font-size:11px;text-transform:uppercase;letter-spacing:.14em">semantic query · pile · banger</span></div>
        <div class="row2"><span>metadata</span><span class="num" style="font-size:11px;color:var(--t1-mut)">vec 0413 · siglip-base · dim 768 · 212ms</span></div>
        <div class="row2"><span>tabular</span><span class="num" style="font-size:26px;font-weight:600">1,482 · 0.94 · 212ms · 0088</span></div>
        <div class="row2"><span>caption wrap</span><span style="font-size:13px;max-width:46ch;color:var(--t1-mut)">long caption test: me explaining to the group chat at 2:47am why the spreadsheet cell that broke me deserves its own pile, its own vector, and honestly its own museum wing.</span></div>
      </div>
    </div>

    <div class="wrap"><div class="sec"><b>03</b> components <span>the instrument kit</span></div>
      <div style="display:flex;flex-direction:column;gap:28px">
        ${t1Console('sad frog', 'sheet')}
        <div class="lattice c4">
          ${t1Cell(M[1])}
          ${t1Cell(M[2], 'match', true)}
          ${t1Cell(M[3], 'near', true)}
          ${t1Cell(M[5], 'dim')}
        </div>
        <div class="lattice c4">
          ${t1Cell(M[4], 'sel')}
          <div class="t1-cell"><div class="hd"><span>uploading…</span><span class="num">queue 2</span></div><div class="art" style="aspect-ratio:1/1"><div class="skel"></div></div><div class="ft"><span class="cap" style="color:var(--t1-mut)">embedding in progress</span></div></div>
          <div class="t1-cell err"><div class="hd"><span>failed.png</span><span class="num">err 500</span></div><div class="errbox" style="aspect-ratio:1/1"><span>embed failed. the model looked away.</span><button class="t1-btn sm" type="button">retry embed</button></div><div class="ft"><span class="cap">error state</span></div></div>
          <div class="empty"><span class="num0 num">0</span><p>the pile is empty. zero memes, zero thoughts, infinite potential. upload chaos and the machine starts sorting.</p><button class="t1-btn primary" type="button">upload chaos</button></div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <button class="t1-btn primary" type="button">find it</button>
          <button class="t1-btn" type="button">shuffle the pile</button>
          <button class="t1-btn ghost" type="button">secondary</button>
          <button class="t1-btn sm" type="button">compact</button>
          <button class="t1-btn icon sm" type="button" aria-label="close">×</button>
          <span class="t1-stick"><i style="background:var(--t1-cobalt)"></i>cats being unwell</span>
          <span class="t1-stick"><i style="background:var(--t1-rose)"></i>reaction faces</span>
          <span class="t1-banger">banger</span>
        </div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center">
          <div class="tabs" role="tablist"><button class="tab on" type="button">all</button><button class="tab" type="button">bangers</button><button class="tab" type="button">recent</button></div>
          <div class="toast">saved to the pile · vec assigned</div>
        </div>
        <div class="stats">
          <div><div class="kl">memes indexed</div><div class="kv num a">1,482</div></div>
          <div><div class="kl">bangers certified</div><div class="kv num r">37</div></div>
          <div><div class="kl">folders required</div><div class="kv num">0</div></div>
        </div>
        ${t1Status()}
      </div>
    </div>

    <div class="wrap"><div class="sec"><b>04</b> motion <span>interaction-tied only · transform + opacity</span></div>
      <div class="mlab">
        <button class="t1-btn primary" id="t1-save" type="button">save to pile</button>
        <span id="t1-toast-slot"></span>
        <button class="t1-btn" id="t1-cascade-go" type="button">replay cascade</button>
        <div class="cascade" id="t1-cascade">${[0,1,2,3,4,5].map(i => `<i style="--i:${i}"></i>`).join('')}</div>
        <button class="t1-btn" id="t1-match-go" type="button">reveal match</button>
        <div class="revealcell" id="t1-match-cell">${t1Cell(M[8])}</div>
      </div>
      <p class="rm-note" style="margin-top:12px">prefers-reduced-motion collapses every animation and transition in this system to zero.</p>
    </div>

    <div class="wrap"><div class="sec"><b>05</b> compositions <span>workbench · phone</span></div>
      <div class="bench">
        <div class="cmd">
          <span class="logo" style="font-size:15px">sploot<i>.</i></span>
          <input class="t1-input" type="text" value="search the pile" aria-label="search the pile">
          <button class="t1-btn sm" type="button">shuffle</button>
          <button class="t1-btn sm" type="button">upload</button>
        </div>
        <div class="body">
          <div class="rail">
            <span class="rl">automatic piles</span>
            ${PILES.map((p, i) => `<button class="pile ${i === 0 ? 'on' : ''}" type="button"><i style="background:${pileColors[i]}"></i><span style="flex:1">${esc(p.name)}</span><b class="num">${p.n}</b></button>`).join('')}
          </div>
          <div class="lattice c4">${M.slice(0, 8).map((x, i) => t1Cell(x, i === 0 ? 'match' : '', i === 0)).join('')}</div>
        </div>
        ${t1Status()}
      </div>
      <div style="padding:26px 0 48px">
        <div class="phone">
          <div class="mast" style="padding:9px 14px"><span class="logo" style="font-size:15px">sploot<i>.</i></span><span class="pulse num" style="margin-left:auto">1,482 vec</span></div>
          <div style="padding:12px;display:flex;flex-direction:column;gap:12px">
            <div>
              <label class="t1-lab" for="t1qp">semantic query</label>
              <input class="t1-input" id="t1qp" type="text" value="cat losing it" style="width:100%">
            </div>
            <div class="lattice" style="grid-template-columns:1fr 1fr">${M.slice(0, 4).map((x, i) => t1Cell(x, i === 0 ? 'match' : '')).join('')}</div>
          </div>
          <div class="dock"><button class="on" type="button">pile</button><button type="button">search</button><button type="button">upload</button><button type="button">bangers</button></div>
        </div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'operations ledger'], ['type', 'bricolage grotesque / outfit / ibm plex mono'], ['move', 'maximalism as data density: 1px lattice, everything countable is counted'], ['density', 'cockpit'], ['motion', 'staggered cascade + state bars, interaction only']])}
    </div>
  </div>`;

  themeToggle(mount.querySelector('.taste1'));

  const save = mount.querySelector('#t1-save');
  const slot = mount.querySelector('#t1-toast-slot');
  if (save && slot) save.addEventListener('click', () => {
    slot.innerHTML = '<span class="toast pop">saved to the pile · vec assigned</span>';
    clearTimeout(slot._t);
    slot._t = setTimeout(() => { slot.innerHTML = ''; }, 2200);
  });
  const casGo = mount.querySelector('#t1-cascade-go');
  const cas = mount.querySelector('#t1-cascade');
  if (casGo && cas) casGo.addEventListener('click', () => {
    cas.classList.remove('go'); void cas.offsetWidth; cas.classList.add('go');
  });
  const mGo = mount.querySelector('#t1-match-go');
  const mCell = mount.querySelector('#t1-match-cell .t1-cell');
  if (mGo && mCell) mGo.addEventListener('click', () => {
    mCell.classList.remove('match', 'matchgo'); void mCell.offsetWidth;
    mCell.classList.add('match', 'matchgo');
  });
};

})();

(() => {
/* TASTE-2 · SIGNAL PARADE. Maximalism is a stack of broadcast channels:
   every horizontal band has one job, one color, and one tempo. */
function cell(m, state = '') {
  const names = { match:'match .94', near:'near .79', dim:'dim .38', selected:'selected', loading:'embedding', error:'failed' };
  if (state === 'loading') return `<article class="t2cell loading"><div class="t2media"><i></i><i></i><i></i></div><footer><span>upload chaos</span><b>embedding</b></footer></article>`;
  if (state === 'error') return `<article class="t2cell error"><div class="t2media err"><b>index missed.</b><span>the machine had one job.</span><button class="t2mini" type="button">retry</button></div><footer><span>${esc(m.file)}</span><b>error</b></footer></article>`;
  return `<article class="t2cell ${state}"><div class="t2flag">${names[state] || 'in the pile'}</div><div class="t2media" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div><footer><span>${esc(m.cap)}</span>${m.banger ? '<b class="t2bang">banger</b>' : `<b>${m.vec}</b>`}</footer></article>`;
}
function consoleBox(id, value='cat losing it') { return `<div class="t2console"><label for="${id}">semantic search console</label><div><span>describe:</span><input id="${id}" value="${esc(value)}"><button class="t2btn primary" type="button">find it</button></div><small><b>${LIB.total.toLocaleString()}</b> vectors / ${LIB.model} / ${LIB.dim}d / ${LIB.latency}ms</small></div>`; }
function status() { return `<div class="t2status"><span>index <b>${LIB.total.toLocaleString()}</b></span><span>embedded <b>${LIB.embedded.toLocaleString()}</b></span><span>queue <b>${LIB.queued}</b></span><span>model <b>${LIB.model}</b></span><span class="ok">online</span></div>`; }
function heading(n, title, note) { return `<header class="t2section"><b>${n}</b><h2>${title}</h2><span>${note}</span></header>`; }
SPECS['TASTE-2'] = (mount) => {
css('TASTE-2', `
.taste2{--bg:#fff8df;--paper:#fffdf5;--ink:#20212a;--mut:#555666;--line:#20212a;--red:#d9363e;--blue:#1769aa;--sun:#f5c400;--mint:#54b88b;--pink:#e477a3;--border:2px solid var(--line);--shadow:6px 6px 0 #20212a;--display:'Unbounded',sans-serif;--body:'Bricolage Grotesque',sans-serif;--mono:'IBM Plex Mono',monospace;min-height:100dvh;background:var(--bg);color:var(--ink);font:15px/1.45 var(--body);overflow:hidden}.taste2.theme-dark{--bg:#191a21;--paper:#23242d;--ink:#f5f1df;--mut:#b8b6aa;--line:#f5f1df;--red:#ff6970;--blue:#70b8ef;--sun:#ffd83d;--mint:#72d2a5;--pink:#f394bb;--border:2px solid var(--line);--shadow:6px 6px 0 #f5f1df}.taste2 *{box-sizing:border-box}.taste2 :focus-visible{outline:3px solid var(--blue);outline-offset:3px}.taste2 a{color:inherit}.taste2 button,.taste2 input{font:inherit;color:inherit}.taste2 .t2mast{min-height:58px;display:flex;align-items:center;gap:24px;padding:8px 24px;border-bottom:var(--border);background:var(--paper)}.taste2 .brand{font:800 20px var(--display)}.taste2 .brand b{color:var(--red)}.taste2 nav{display:flex;gap:18px;margin-left:auto;font:11px var(--mono)}.taste2 nav a{text-decoration:none}.taste2 .t2hero{display:grid;grid-template-columns:1.2fr .8fr;min-height:540px;border-bottom:var(--border)}.taste2 .heroCopy{padding:54px 4vw;display:flex;flex-direction:column;justify-content:space-between;background:var(--sun);color:#20212a;border-right:var(--border)}.taste2 .kicker,.taste2 label{font:700 10px var(--mono);text-transform:uppercase;letter-spacing:.12em}.taste2 h1{font:800 clamp(43px,6.5vw,88px)/.9 var(--display);letter-spacing:-.065em;max-width:9ch}.taste2 .heroCopy p{max-width:50ch;font-size:17px}.taste2 .heroWall{display:grid;grid-template-rows:repeat(3,1fr)}.taste2 .heroWall>div{padding:22px;border-bottom:var(--border);display:flex;justify-content:space-between;align-items:end}.taste2 .heroWall>div:last-child{border:0}.taste2 .heroWall b{font:800 clamp(35px,5vw,70px)/1 var(--display)}.taste2 .heroWall span{font:10px var(--mono);text-transform:uppercase}.taste2 .wrap{width:min(1320px,100%);margin:auto;padding:0 28px}.taste2 .t2section{display:grid;grid-template-columns:60px 1fr auto;align-items:end;gap:18px;margin-top:62px;padding:8px 0;border-bottom:4px solid var(--ink)}.taste2 .t2section>b{font:12px var(--mono);color:var(--red)}.taste2 .t2section h2{font:800 28px var(--display);letter-spacing:-.05em}.taste2 .t2section span{font:10px var(--mono);color:var(--mut)}.taste2 .sw{display:grid;grid-template-columns:repeat(6,1fr)}.taste2 .sw div{min-height:94px;padding:9px;border-right:var(--border);font:9px var(--mono);text-transform:uppercase}.taste2 .sw b{display:block;margin-top:38px}.taste2 .tokens{display:flex;flex-wrap:wrap;gap:16px;padding:22px 0}.taste2 .token{min-width:150px;padding:16px;border:var(--border);background:var(--paper)}.taste2 .shadow{box-shadow:var(--shadow)}.taste2 .round{border-radius:40px}.taste2 .note{font:10px var(--mono);color:var(--mut)}.taste2 .types{display:grid;grid-template-columns:1.5fr .5fr;gap:22px;padding:26px 0}.taste2 .display{font:800 clamp(36px,6vw,72px)/.92 var(--display);letter-spacing:-.06em}.taste2 .typeRail{display:flex;flex-direction:column;gap:10px}.taste2 .meta,.taste2 .nums{font-family:var(--mono);font-variant-numeric:tabular-nums}.taste2 .caption{max-width:44ch;padding:12px 0;border-top:var(--border)}.taste2 .sheet{display:flex;flex-direction:column;gap:24px;padding:28px 0}.taste2 .t2console{border:var(--border);background:var(--paper);box-shadow:var(--shadow)}.taste2 .t2console>label{display:block;padding:7px 12px;background:var(--blue);color:#fff}.taste2.theme-dark .t2console>label{color:#191a21}.taste2 .t2console>div{display:flex;align-items:center;gap:10px;padding:12px;background:var(--sun);color:#20212a}.taste2 .t2console input{flex:1;min-width:0;border:2px solid #20212a;background:#fffdf5;color:#20212a;padding:10px 12px;font-family:var(--mono)}.taste2 .t2console small{display:block;padding:7px 12px;font:10px var(--mono)}.taste2 .t2btn{min-height:44px;padding:0 18px;border:var(--border);background:var(--paper);font:700 11px var(--mono);text-transform:uppercase;box-shadow:3px 3px 0 var(--line);transition:transform .16s cubic-bezier(.16,1,.3,1),box-shadow .16s}.taste2 .t2btn:hover{transform:translate(-2px,-2px);box-shadow:5px 5px 0 var(--line)}.taste2 .t2btn:active{transform:translate(2px,2px);box-shadow:0 0}.taste2 .t2btn.primary{background:var(--red);color:#fff}.taste2 .t2btn.compact{min-height:34px;padding:0 10px}.taste2 .t2btn.icon{width:44px;padding:0}.taste2 .t2mini{min-height:36px;padding:0 10px;border:2px solid currentColor;background:transparent}.taste2 .cells{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}.taste2 .t2cell{position:relative;border:var(--border);background:var(--paper);box-shadow:4px 4px 0 var(--line);transition:transform .2s cubic-bezier(.16,1,.3,1)}.taste2 .t2cell:hover{transform:translateY(-4px)}.taste2 .t2media{display:grid;place-items:center;min-height:150px;overflow:hidden;background:var(--bg)}.taste2 .meme-media{width:100%;height:100%;object-fit:contain}.taste2 .t2cell footer{display:flex;justify-content:space-between;gap:10px;padding:8px;border-top:var(--border);font-size:11px}.taste2 .t2cell footer b{font:9px var(--mono)}.taste2 .t2flag{position:absolute;z-index:1;top:7px;left:-5px;padding:4px 7px;background:var(--blue);color:#fff;font:9px var(--mono);text-transform:uppercase}.taste2 .match{box-shadow:7px 7px 0 var(--mint)}.taste2 .near{box-shadow:7px 7px 0 var(--sun)}.taste2 .dim{opacity:.42;filter:grayscale(.65)}.taste2 .selected{outline:5px solid var(--red);outline-offset:-5px}.taste2 .t2bang{background:var(--pink);color:#20212a;padding:2px 5px}.taste2 .loading .t2media{display:flex;gap:7px}.taste2 .loading i{width:22%;height:65%;background:var(--sun);animation:t2load .9s steps(2) infinite}.taste2 .loading i:nth-child(2){animation-delay:.15s;background:var(--red)}.taste2 .loading i:nth-child(3){animation-delay:.3s;background:var(--blue)}@keyframes t2load{50%{transform:translateY(12px)}}.taste2 .err{gap:8px;flex-direction:column;color:var(--red)}.taste2 .error{border-color:var(--red)}.taste2 .row{display:flex;flex-wrap:wrap;gap:14px;align-items:center}.taste2 .tag{padding:5px 9px;border:2px solid var(--ink);background:var(--sun);font:10px var(--mono)}.taste2 .stats{display:flex;border:var(--border)}.taste2 .stat{flex:1;padding:16px;border-right:var(--border)}.taste2 .stat:last-child{border:0}.taste2 .stat b{display:block;font:700 34px var(--mono);font-variant-numeric:tabular-nums}.taste2 .stat span{font:9px var(--mono);text-transform:uppercase}.taste2 .t2status{display:flex;flex-wrap:wrap;background:var(--ink);color:var(--bg);font:10px var(--mono)}.taste2 .t2status span{padding:8px 12px;border-right:1px solid color-mix(in srgb,var(--bg) 30%,transparent)}.taste2 .t2status .ok:before{content:'';display:inline-block;width:8px;height:8px;margin-right:6px;background:var(--mint)}.taste2 .field{display:flex;flex-direction:column;gap:7px;min-width:260px}.taste2 .field input{min-height:44px;padding:9px;border:var(--border);background:var(--paper)}.taste2 .tabs{display:flex;border:var(--border)}.taste2 .tabs button{min-height:44px;padding:0 14px;border:0;border-right:var(--border);background:var(--paper)}.taste2 .tabs button.on{background:var(--sun);color:#20212a;font-weight:700}.taste2 .toast{padding:12px 16px;background:var(--mint);color:#20212a;border:var(--border);font:11px var(--mono)}.taste2 .empty{max-width:500px;padding:25px;border:var(--border);background:var(--pink);color:#20212a}.taste2 .empty h3{font:800 25px var(--display)}.taste2 .motion{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:28px 0}.taste2 .demo{min-height:150px;border:var(--border);background:var(--paper);display:grid;place-items:center;padding:18px}.taste2 .ticker{width:100%;overflow:hidden;border-block:var(--border);white-space:nowrap}.taste2 .ticker span{display:inline-block;padding:8px;transform:translateX(0)}.taste2 .ticker.go span{animation:t2tick .65s cubic-bezier(.16,1,.3,1)}@keyframes t2tick{from{transform:translateX(100%)}to{transform:translateX(0)}}.taste2 .shuffle.go{animation:t2shuffle .5s cubic-bezier(.34,1.56,.64,1)}@keyframes t2shuffle{50%{transform:rotate(-5deg) scale(.94)}}.taste2 .bench{border:var(--border);background:var(--paper);margin:28px 0}.taste2 .cmd{display:flex;gap:10px;padding:10px;border-bottom:var(--border)}.taste2 .cmd input{flex:1;min-width:0;padding:8px;border:var(--border);background:var(--bg)}.taste2 .work{display:grid;grid-template-columns:210px 1fr}.taste2 .rail{border-right:var(--border);padding:12px}.taste2 .pile{width:100%;display:flex;justify-content:space-between;padding:9px 4px;border:0;border-bottom:1px solid var(--line);background:none;text-align:left}.taste2 .miniGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:12px}.taste2 .phone{width:390px;max-width:100%;margin:24px 0 50px;border:5px solid var(--ink);background:var(--paper);overflow:hidden}.taste2 .phoneGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:9px}.taste2 .dock{display:flex;border-top:var(--border)}.taste2 .dock button{flex:1;min-height:50px;border:0;border-right:1px solid var(--line);background:var(--paper);font:9px var(--mono)}.taste2 .dock .on{background:var(--red);color:#fff}.taste2 .lab-spec{font-family:var(--mono)}
@media(max-width:760px){.taste2 .t2mast{padding:8px 14px}.taste2 nav a:nth-child(-n+2){display:none}.taste2 .t2hero{grid-template-columns:1fr}.taste2 .heroCopy{min-height:430px;border-right:0;border-bottom:var(--border);padding:38px 18px}.taste2 .wrap{padding:0 14px}.taste2 .t2section{grid-template-columns:34px 1fr}.taste2 .t2section span{display:none}.taste2 .sw{grid-template-columns:repeat(2,1fr)}.taste2 .types{grid-template-columns:1fr}.taste2 .cells,.taste2 .miniGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.taste2 .motion{grid-template-columns:1fr}.taste2 .work{grid-template-columns:1fr}.taste2 .rail{border-right:0;border-bottom:var(--border)}.taste2 .stats{display:grid;grid-template-columns:1fr 1fr}.taste2 .stat{border-bottom:var(--border)}.taste2 .t2console>div{flex-wrap:wrap}.taste2 .t2console input{flex-basis:100%}.taste2 .cmd .t2btn{display:none}}
@media(prefers-reduced-motion:reduce){.taste2 *,.taste2 *:before,.taste2 *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`);
const M=MEMES;
mount.innerHTML=`<div class="taste2"><header class="t2mast"><span class="brand">sploot<b>/</b>fm</span><nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">upload</a><a href="#0">settings</a><a href="#0">sign in</a></nav></header>
<section class="t2hero"><div class="heroCopy"><span class="kicker">private frequency / semantic retrieval</span><h1>type words. get the picture.</h1><p>your private meme archive, tuned by meaning. no folders. just vibes.</p></div><div class="heroWall"><div style="background:var(--red);color:#fff"><span>the pile</span><b>1,482</b></div><div style="background:var(--mint);color:#20212a"><span>bangers</span><b>37</b></div><div style="background:var(--blue);color:#fff"><span>queue</span><b>03</b></div></div></section>
<div class="wrap">${heading('01','foundations','color bands / hard edges / disciplined broadcast')}<div class="sw"><div style="background:#fff8df">paper<b>#fff8df</b></div><div style="background:#20212a;color:#fff">ink<b>#20212a</b></div><div style="background:#d9363e;color:#fff">signal red<b>#d9363e</b></div><div style="background:#1769aa;color:#fff">radio blue<b>#1769aa</b></div><div style="background:#f5c400">sun<b>#f5c400</b></div><div style="background:#54b88b">mint<b>#54b88b</b></div></div><div class="tokens"><div class="token">2px signal rule</div><div class="token shadow">6px hard elevation</div><div class="token round">pill exception</div><div class="token">square control shape</div></div><p class="note">spacing rhythm: 8 / 12 / 18 / 28 / 62, bands stay tight and sections get air.</p>
${heading('02','type specimen','unbounded / bricolage grotesque / ibm plex mono')}<div class="types"><div><div class="display">the pile is broadcasting.</div><p class="caption">long caption: the cat is judging your commit history while the embedding queue quietly decides whether this belongs in animals mid-crime.</p></div><div class="typeRail"><b>body / bricolage grotesque</b><span class="kicker">label / signal upper</span><span class="meta">vec 0413 / siglip-base</span><span class="nums">1,482 / 0.94 / 212ms</span></div></div>
${heading('03','component sheet','every state gets a channel')}<div class="sheet">${consoleBox('t2query')}<div class="cells">${cell(M[0])}${cell(M[1],'match')}${cell(M[2],'near')}${cell(M[3],'dim')}${cell(M[4],'selected')}${cell(M[5],'loading')}${cell(M[6],'error')}</div><div class="row"><button class="t2btn primary">find it</button><button class="t2btn">shuffle the pile</button><button class="t2btn compact">compact</button><button class="t2btn icon" aria-label="close">×</button><span class="tag">automatic pile</span><span class="t2bang">banger</span></div><div class="stats"><div class="stat"><span>indexed</span><b>1,482</b></div><div class="stat"><span>bangers</span><b>37</b></div><div class="stat"><span>folders</span><b>0</b></div></div>${status()}<div class="row"><label class="field">text input<input value="zero thoughts"></label><div class="tabs"><button class="on">pile</button><button>bangers</button><button>recent</button></div><div class="toast">saved. the pile grows.</div></div><div class="empty"><h3>nothing on this frequency.</h3><p>try fewer words or upload chaos.</p><button class="t2btn primary">upload</button></div></div>
${heading('04','motion row','three live controls / no ambient data')}<div class="motion"><div class="demo"><button class="t2btn primary" id="t2toast">send toast</button></div><div class="demo"><div class="ticker" id="t2ticker"><span>the pile / bangers / upload chaos / semantic match</span></div><button class="t2mini" id="t2tickergo">run band</button></div><div class="demo"><button class="t2btn shuffle" id="t2shuffle">shuffle the pile</button></div></div><p class="note">reduced motion: transforms and channel sweeps collapse to their final state.</p>
${heading('05','compositions','desktop workbench / 390px phone')}<div class="bench"><div class="cmd"><b class="brand">sploot/</b><input value="cat losing it" aria-label="search the pile"><button class="t2btn compact">upload</button><button class="t2btn compact">bangers</button></div><div class="work"><aside class="rail"><span class="kicker">automatic piles</span>${PILES.map((p,i)=>`<button class="pile"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}</aside><div class="miniGrid">${M.slice(0,8).map((m,i)=>cell(m,i===0?'match':'')).join('')}</div></div>${status()}</div><div class="phone"><header class="t2mast"><b class="brand">sploot/</b><span class="meta">1,482</span></header>${consoleBox('t2phone','group chat')}<div class="phoneGrid">${M.slice(0,4).map((m,i)=>cell(m,i===0?'match':'')).join('')}</div><div class="dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div></div></div>${labSpec([['system','signal parade'],['type','unbounded / bricolage grotesque / ibm plex mono'],['move','maximalism as broadcast: every horizontal channel owns one job, color, and tempo'],['density','stacked medium-high'],['motion','channel sweeps and tactile stamps, interaction only']])}</div>`;
themeToggle(mount.querySelector('.taste2'));
const toast=mount.querySelector('#t2toast');if(toast)toast.addEventListener('click',()=>{toast.textContent='saved to the pile';setTimeout(()=>toast.textContent='send toast',1500)});const tick=mount.querySelector('#t2ticker'),tickgo=mount.querySelector('#t2tickergo');if(tick&&tickgo)tickgo.addEventListener('click',()=>{tick.classList.remove('go');void tick.offsetWidth;tick.classList.add('go')});const sh=mount.querySelector('#t2shuffle');if(sh)sh.addEventListener('click',()=>{sh.classList.remove('go');void sh.offsetWidth;sh.classList.add('go')});
};
})();

(() => {
/* TASTE-3 · CURIO INDEX. Maximalism as a museum cabinet: irregular bays,
   numbered specimens, editorial labels, and one red catalog mark. */
function c3(m,state='',wide=false){if(state==='loading')return `<article class="t3cell loading"><div class="skeleton"></div><div class="cardcap"><b>embedding specimen</b><span>queue ${LIB.queued}</span></div></article>`;if(state==='error')return `<article class="t3cell error"><div class="errbox"><b>specimen unavailable</b><p>the index ate this one.</p><button class="t3small">retry</button></div><div class="cardcap"><b>${esc(m.file)}</b><span>failed</span></div></article>`;return `<article class="t3cell ${state} ${wide?'wide':''}"><div class="index">${m.vec}</div><div class="media" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div><div class="cardcap"><b>${esc(m.cap)}</b><span>${m.banger?'banger':state||'archive'}</span></div></article>`}
function c3search(id,value='cat losing it'){return `<div class="t3search"><label for="${id}">describe the picture</label><div><span>search /</span><input id="${id}" value="${esc(value)}"><button class="t3button primary">find it</button></div><small>${LIB.total.toLocaleString()} indexed / ${LIB.model} / ${LIB.latency}ms</small></div>`}
function c3status(){return `<div class="t3status"><span>archive <b>${LIB.total.toLocaleString()}</b></span><span>embedded <b>${LIB.embedded.toLocaleString()}</b></span><span>intake <b>${LIB.queued}</b></span><span>dimensions <b>${LIB.dim}</b></span><span><i></i> index ready</span></div>`}
SPECS['TASTE-3']=(mount)=>{css('TASTE-3',`
.taste3{--bg:#e8e1d4;--paper:#f8f4ea;--ink:#25231f;--mut:#696357;--line:#25231f;--accent:#c93827;--wash:#d0c5b4;--cool:#547078;--border:1px solid var(--line);--heavy:3px solid var(--line);--shadow:10px 10px 0 rgba(37,35,31,.18);--display:'Anton',sans-serif;--body:'Space Grotesk',sans-serif;--serif:'Instrument Serif',serif;--mono:'Space Mono',monospace;min-height:100dvh;background:var(--bg);color:var(--ink);font:15px/1.5 var(--body);overflow:hidden}.taste3.theme-dark{--bg:#1d1c19;--paper:#292722;--ink:#eee8da;--mut:#b5ad9d;--line:#eee8da;--accent:#f06a56;--wash:#3a3730;--cool:#91adb3;--border:1px solid var(--line);--heavy:3px solid var(--line);--shadow:10px 10px 0 rgba(0,0,0,.32)}.taste3 *{box-sizing:border-box}.taste3 :focus-visible{outline:3px solid var(--accent);outline-offset:3px}.taste3 button,.taste3 input{font:inherit;color:inherit}.taste3 a{color:inherit}.taste3 .mast{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:12px 25px;border-bottom:var(--heavy);background:var(--paper)}.taste3 .logo{font:48px/.8 var(--display);letter-spacing:-.03em;text-transform:uppercase}.taste3 .issue{font:10px var(--mono);text-transform:uppercase}.taste3 nav{justify-self:end;display:flex;gap:17px;font:10px var(--mono)}.taste3 nav a{text-decoration:none}.taste3 .hero{min-height:590px;display:grid;grid-template-columns:.72fr 1.28fr;border-bottom:var(--heavy)}.taste3 .heroCopy{padding:55px 4vw;display:flex;flex-direction:column;justify-content:space-between;border-right:var(--heavy)}.taste3 .hero h1{font:clamp(70px,11vw,158px)/.73 var(--display);text-transform:uppercase;letter-spacing:-.045em}.taste3 .hero h1 i{display:block;font:italic clamp(39px,7vw,94px)/.8 var(--serif);text-transform:none;color:var(--accent)}.taste3 .heroCopy p{max-width:42ch;font-size:17px}.taste3 .heroCabinet{display:grid;grid-template-columns:1.1fr .9fr;grid-template-rows:1fr 1fr;background:var(--line);gap:1px}.taste3 .heroCabinet .t3cell:first-child{grid-row:span 2}.taste3 .container{width:min(1340px,100%);margin:auto;padding:0 30px}.taste3 .sectionHead{margin-top:76px;display:flex;align-items:baseline;gap:20px;border-bottom:var(--heavy);padding-bottom:8px}.taste3 .sectionHead span{font:10px var(--mono);color:var(--accent)}.taste3 .sectionHead h2{font:44px/.9 var(--display);text-transform:uppercase}.taste3 .sectionHead p{margin-left:auto;font:10px var(--mono);color:var(--mut)}.taste3 .palette{display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr}.taste3 .palette div{min-height:120px;padding:10px;border-right:var(--border);font:9px var(--mono);text-transform:uppercase}.taste3 .palette b{display:block;margin-top:62px}.taste3 .found{display:flex;flex-wrap:wrap;gap:18px;padding:24px 0}.taste3 .sample{min-width:170px;padding:18px;background:var(--paper);border:var(--border)}.taste3 .sample.heavy{border:var(--heavy)}.taste3 .sample.elev{box-shadow:var(--shadow)}.taste3 .sample.oval{border-radius:50%}.taste3 .rhythm{font:10px var(--mono);color:var(--mut)}.taste3 .types{display:grid;grid-template-columns:1.4fr .6fr;padding:28px 0;gap:30px}.taste3 .bigtype{font:clamp(64px,10vw,132px)/.75 var(--display);text-transform:uppercase}.taste3 .bigtype em{font-family:var(--serif);text-transform:none;color:var(--accent)}.taste3 .typeList{display:flex;flex-direction:column;gap:13px}.taste3 .label{font:10px var(--mono);text-transform:uppercase;letter-spacing:.1em}.taste3 .meta,.taste3 .nums{font-family:var(--mono);font-variant-numeric:tabular-nums}.taste3 .longcap{max-width:46ch;padding:13px 0;border-top:var(--border);font-family:var(--serif);font-size:19px}.taste3 .components{display:flex;flex-direction:column;gap:25px;padding:28px 0}.taste3 .t3search{background:var(--paper);border:var(--heavy);padding:15px}.taste3 .t3search label{display:block;font:10px var(--mono);text-transform:uppercase;margin-bottom:8px}.taste3 .t3search>div{display:flex;align-items:center;gap:10px}.taste3 .t3search>div>span{font:italic 21px var(--serif);color:var(--accent)}.taste3 .t3search input{flex:1;min-width:0;background:transparent;border:0;border-bottom:3px solid var(--ink);padding:10px 4px;font:18px var(--mono)}.taste3 .t3search small{display:block;margin-top:9px;font:9px var(--mono);color:var(--mut)}.taste3 .t3button{min-height:44px;padding:0 18px;border:var(--heavy);background:var(--paper);font:700 10px var(--mono);text-transform:uppercase;transition:transform .2s cubic-bezier(.16,1,.3,1)}.taste3 .t3button:hover{transform:translateY(-3px)}.taste3 .t3button:active{transform:translateY(1px) scale(.98)}.taste3 .t3button.primary{background:var(--accent);color:#fff}.taste3.theme-dark .t3button.primary{color:#1d1c19}.taste3 .t3button.compact{min-height:34px;padding:0 10px}.taste3 .t3button.icon{width:44px;padding:0}.taste3 .t3small{min-height:34px;border:var(--border);background:transparent;padding:0 10px}.taste3 .cabinet{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-flow:dense;gap:1px;background:var(--line);border:var(--border)}.taste3 .t3cell{position:relative;background:var(--paper);min-width:0;transition:transform .22s cubic-bezier(.16,1,.3,1),opacity .2s}.taste3 .t3cell.wide{grid-column:span 2}.taste3 .t3cell:hover{transform:translateY(-4px);z-index:1}.taste3 .media{display:grid;place-items:center;min-height:170px;overflow:hidden;background:var(--wash)}.taste3 .meme-media{width:100%;height:100%;object-fit:contain}.taste3 .index{position:absolute;top:8px;left:8px;z-index:1;background:var(--paper);border:var(--border);padding:3px 6px;font:9px var(--mono)}.taste3 .cardcap{display:flex;justify-content:space-between;gap:9px;padding:9px;border-top:var(--border);font-size:11px}.taste3 .cardcap b{font-weight:500}.taste3 .cardcap span{font:9px var(--mono);color:var(--accent)}.taste3 .match{box-shadow:inset 0 0 0 7px var(--accent)}.taste3 .near{box-shadow:inset 0 0 0 5px var(--cool)}.taste3 .dim{opacity:.36;filter:grayscale(.65)}.taste3 .selected:after{content:'selected';position:absolute;inset:8px 8px auto auto;background:var(--accent);color:#fff;padding:4px 7px;font:9px var(--mono)}.taste3 .skeleton{min-height:210px;background:repeating-linear-gradient(135deg,var(--wash) 0 16px,var(--paper) 16px 32px);background-size:200% 100%;animation:t3sk 1s steps(6) infinite}@keyframes t3sk{to{background-position:100% 0}}.taste3 .errbox{min-height:210px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:7px;padding:20px;color:var(--accent)}.taste3 .error{outline:3px solid var(--accent);outline-offset:-3px}.taste3 .kitrow{display:flex;flex-wrap:wrap;align-items:center;gap:13px}.taste3 .tag{padding:5px 9px;border:var(--border);border-radius:50%;font:10px var(--mono)}.taste3 .banger{padding:4px 7px;background:var(--accent);color:#fff;font:9px var(--mono);transform:rotate(-2deg)}.taste3 .stats{display:grid;grid-template-columns:1.5fr 1fr .7fr;border-block:var(--heavy)}.taste3 .stat{padding:19px;border-right:var(--border)}.taste3 .stat b{display:block;font:56px/.85 var(--display);font-variant-numeric:tabular-nums}.taste3 .stat span{font:9px var(--mono);text-transform:uppercase}.taste3 .t3status{display:flex;flex-wrap:wrap;background:var(--ink);color:var(--bg);font:9px var(--mono)}.taste3 .t3status span{padding:8px 12px;border-right:1px solid color-mix(in srgb,var(--bg) 25%,transparent)}.taste3 .t3status i{display:inline-block;width:7px;height:7px;background:var(--accent);margin-right:5px}.taste3 .inputset{display:flex;flex-direction:column;gap:6px;min-width:260px;font:10px var(--mono);text-transform:uppercase}.taste3 .inputset input{min-height:44px;padding:8px;border:var(--border);background:var(--paper);text-transform:none}.taste3 .tabs{display:flex;border-bottom:var(--heavy)}.taste3 .tabs button{min-height:44px;border:0;background:none;padding:0 14px}.taste3 .tabs .on{color:var(--accent);font-weight:700}.taste3 .toast{border-left:7px solid var(--accent);background:var(--paper);padding:12px 16px;font:10px var(--mono)}.taste3 .empty{display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;padding:20px;border:var(--heavy);background:var(--paper)}.taste3 .empty b{font:64px/.8 var(--display);color:var(--accent)}.taste3 .empty h3{font:30px var(--serif)}.taste3 .motion{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--line);border:var(--border);margin:28px 0}.taste3 .demo{min-height:160px;background:var(--paper);padding:20px;display:grid;place-items:center}.taste3 .stamp.go{animation:t3stamp .45s cubic-bezier(.34,1.56,.64,1)}@keyframes t3stamp{from{transform:scale(1.7) rotate(8deg);opacity:0}}.taste3 .flip{transition:transform .45s cubic-bezier(.16,1,.3,1)}.taste3 .flip.go{transform:rotateY(180deg)}.taste3 .bench{border:var(--heavy);margin:28px 0;background:var(--paper)}.taste3 .command{display:flex;gap:10px;padding:10px;border-bottom:var(--heavy)}.taste3 .command input{flex:1;min-width:0;border:0;border-bottom:var(--border);background:transparent;padding:8px}.taste3 .work{display:grid;grid-template-columns:190px 1fr}.taste3 .rail{padding:12px;border-right:var(--heavy)}.taste3 .pile{width:100%;display:flex;justify-content:space-between;gap:8px;padding:9px 0;border:0;border-bottom:var(--border);background:none;text-align:left;font-size:11px}.taste3 .miniCab{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);padding-left:1px}.taste3 .phone{width:390px;max-width:100%;border:5px solid var(--ink);background:var(--paper);margin:25px 0 55px;overflow:hidden}.taste3 .phoneCab{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line)}.taste3 .dock{display:flex;border-top:var(--heavy)}.taste3 .dock button{flex:1;min-height:52px;border:0;background:var(--paper);font:9px var(--mono)}.taste3 .dock .on{background:var(--accent);color:#fff}.taste3 .lab-spec{font-family:var(--mono)}
@media(max-width:760px){.taste3 .mast{grid-template-columns:1fr auto;padding:10px 14px}.taste3 .logo{font-size:36px}.taste3 .issue{display:none}.taste3 nav a:nth-child(-n+3){display:none}.taste3 .hero{grid-template-columns:1fr}.taste3 .heroCopy{min-height:450px;padding:38px 18px;border-right:0;border-bottom:var(--heavy)}.taste3 .heroCabinet{min-height:430px}.taste3 .container{padding:0 14px}.taste3 .sectionHead p{display:none}.taste3 .palette{grid-template-columns:1fr 1fr}.taste3 .types{grid-template-columns:1fr}.taste3 .cabinet,.taste3 .miniCab{grid-template-columns:repeat(2,minmax(0,1fr))}.taste3 .t3cell.wide{grid-column:auto}.taste3 .motion{grid-template-columns:1fr}.taste3 .work{grid-template-columns:1fr}.taste3 .rail{border-right:0;border-bottom:var(--heavy)}.taste3 .empty{grid-template-columns:1fr}.taste3 .t3search>div{flex-wrap:wrap}.taste3 .t3search input{flex-basis:100%}.taste3 .command .t3button{display:none}.taste3 .stats{grid-template-columns:1fr}.taste3 .stat{border-bottom:var(--border)}}
@media(prefers-reduced-motion:reduce){.taste3 *,.taste3 *:before,.taste3 *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`);const M=MEMES;mount.innerHTML=`<div class="taste3"><header class="mast"><b class="logo">sploot</b><span class="issue">private index / issue 1,482</span><nav><a href="#0">the pile</a><a href="#0">piles</a><a href="#0">bangers</a><a href="#0">upload</a><a href="#0">sign in</a></nav></header><section class="hero"><div class="heroCopy"><span class="label">a cabinet of internet evidence</span><h1>type words.<i>get the picture.</i></h1><p>the private meme archive that remembers what you meant. no folders. just vibes.</p></div><div class="heroCabinet">${c3(M[0],'match')}${c3(M[4])}${c3(M[2])}</div></section><div class="container"><header class="sectionHead"><span>01</span><h2>foundations</h2><p>archival paper / catalog red / specimen rules</p></header><div class="palette"><div style="background:#e8e1d4">archive<b>#e8e1d4</b></div><div style="background:#f8f4ea">paper<b>#f8f4ea</b></div><div style="background:#25231f;color:#fff">ink<b>#25231f</b></div><div style="background:#c93827;color:#fff">catalog<b>#c93827</b></div><div style="background:#547078;color:#fff">cool<b>#547078</b></div></div><div class="found"><div class="sample">1px specimen rule</div><div class="sample heavy">3px section rule</div><div class="sample elev">catalog elevation</div><div class="sample oval">oval tag exception</div></div><p class="rhythm">spacing rhythm: 9 / 18 / 30 / 76, tight labels inside generous galleries.</p><header class="sectionHead"><span>02</span><h2>type specimen</h2><p>anton / instrument serif / space grotesk / space mono</p></header><div class="types"><div class="bigtype">zero <em>thoughts.</em><br>head empty.</div><div class="typeList"><b>body / space grotesk</b><span class="label">label / catalog upper</span><span class="meta">metadata / vec 0413</span><span class="nums">1,482 / 0.94 / 212ms</span><p class="longcap">long caption: me explaining the lore to my cat while the automatic piles quietly file the evidence under animals mid-crime.</p></div></div><header class="sectionHead"><span>03</span><h2>component sheet</h2><p>the entire cabinet, including failure</p></header><div class="components">${c3search('t3query')}<div class="cabinet">${c3(M[0])}${c3(M[1],'match',true)}${c3(M[2],'near')}${c3(M[3],'dim')}${c3(M[4],'selected')}${c3(M[5],'loading')}${c3(M[6],'error')}</div><div class="kitrow"><button class="t3button primary">find it</button><button class="t3button">shuffle the pile</button><button class="t3button compact">compact</button><button class="t3button icon" aria-label="close">×</button><span class="tag">automatic pile</span><span class="banger">banger</span></div><div class="stats"><div class="stat"><span>specimens indexed</span><b>1,482</b></div><div class="stat"><span>bangers</span><b>37</b></div><div class="stat"><span>folders</span><b>0</b></div></div>${c3status()}<div class="kitrow"><label class="inputset">text input<input value="zero thoughts"></label><div class="tabs"><button class="on">pile</button><button>bangers</button><button>recent</button></div><div class="toast">saved to the pile.</div></div><div class="empty"><b>0</b><div><h3>an aggressively empty cabinet.</h3><p>upload chaos and the index gets to work.</p></div><button class="t3button primary">upload</button></div></div><header class="sectionHead"><span>04</span><h2>motion row</h2><p>live, tactile, never ambient</p></header><div class="motion"><div class="demo"><button class="t3button primary stamp" id="t3stamp">stamp banger</button></div><div class="demo"><button class="t3button flip" id="t3flip">flip specimen</button></div><div class="demo"><button class="t3button" id="t3count">shuffle 1,482</button></div></div><p class="rhythm">reduced motion: catalog stamps, flips, and transitions resolve instantly.</p><header class="sectionHead"><span>05</span><h2>compositions</h2><p>desktop workbench / 390px phone</p></header><div class="bench"><div class="command"><b class="logo" style="font-size:28px">sploot</b><input value="cat losing it" aria-label="search the pile"><button class="t3button compact">upload</button><button class="t3button compact">bangers</button></div><div class="work"><aside class="rail"><span class="label">automatic piles</span>${PILES.map(p=>`<button class="pile"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}</aside><div class="miniCab">${M.slice(0,8).map((m,i)=>c3(m,i===0?'match':'')).join('')}</div></div>${c3status()}</div><div class="phone"><header class="mast"><b class="logo">sploot</b><span class="meta">1,482</span></header>${c3search('t3phone','group chat')}<div class="phoneCab">${M.slice(0,4).map((m,i)=>c3(m,i===0?'match':'')).join('')}</div><div class="dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div></div></div>${labSpec([['system','curio index'],['type','anton / instrument serif / space grotesk / space mono'],['move','maximalism as curation: irregular specimen bays, numbered evidence, one catalog mark'],['density','editorial medium-high'],['motion','catalog stamps and physical flips, interaction only']])}</div>`;themeToggle(mount.querySelector('.taste3'));const stamp=mount.querySelector('#t3stamp');if(stamp)stamp.addEventListener('click',()=>{stamp.classList.remove('go');void stamp.offsetWidth;stamp.classList.add('go');stamp.textContent='banger stamped'});const flip=mount.querySelector('#t3flip');if(flip)flip.addEventListener('click',()=>{flip.classList.toggle('go')});const count=mount.querySelector('#t3count');if(count)count.addEventListener('click',()=>{count.textContent=count.textContent==='shuffle 1,482'?'shuffled. zero thoughts.':'shuffle 1,482'});
};
})();

(() => {
/* TASTE-4 · STOCKROOM — overprint + toybox dialed for the daily-driver
   workbench. NEW MOVE: density-delineated annotation tiers — cell size
   steps, chrome budgets (compact 0%, standard ~15%, expanded ~35%), and
   annotation quotas (compact:0, standard:1, expanded:2+). The DNA (cream
   paper, ink outline, arcade drop, toy colors) decorates only what earns
   its tier. Every surface wears its tier badge. */

const T4_TIER_LABELS = ['compact (t0)', 'standard (t1)', 'expanded (t2)'];
const T4_TIER_NUMS = ['t0', 't1', 't2'];

function t4TierBadge(n) {
  return n === 0 ? '' : `<span class="t4-tierbadge t4-tier${n}">${T4_TIER_LABELS[n]}</span>`;
}

function t4Stamp(text, extra = '') {
  return `<span class="t4-stamp ${extra}">${text}</span>`;
}

function t4Star(text, extra = '') {
  return `<span class="t4-star ${extra}"><span>${text}</span></span>`;
}

function t4Cell(m, state = '', tier = 1, score = false) {
  const et = (state === 'match' || state === 'selected') ? Math.max(tier, 2) : tier;
  let extra = '';
  if (state === 'match' && et >= 2) extra += t4Star('top match', 't4-star-corner');
  if (state === 'match' && et >= 2 && m.banger) { extra = t4Star('banger!', 't4-star-corner') + extra; }
  else if (m.banger && et >= 1 && state !== 'match') extra += t4Stamp('banger');
  if (et >= 2) extra += `<div class="t4-tape"></div>`;
  return `
  <div class="t4-cw t4-cw-${T4_TIER_NUMS[et]}">
    <div class="t4cell ${state}">
      ${tier > 0 ? `<div class="t4head"><span>${esc(m.file)}</span><span class="num">vec ${m.vec}</span></div>` : ''}
      <div class="t4art" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>
      <div class="t4foot">
        <span class="t4cap">${esc(m.cap)}</span>
        ${score ? `<span class="t4match num">${(m.score / 100).toFixed(2)}</span>` : ''}
      </div>
      ${tier === 0 ? `<div class="t4t0foot"><span class="t4num">${T4_TIER_NUMS[0]}</span><span class="t4thin">data only · 0 annotations</span></div>` : ''}
      ${tier >= 1 ? t4TierBadge(et === 0 ? 0 : et) : ''}
      ${extra}
    </div>
  </div>`;
}

function t4CellLoading(i = 0) {
  return `<div class="t4-cw t4-cw-t1"><div class="t4cell"><div class="t4head"><span>cooking…</span><span class="num">queue ${LIB.queued}</span></div><div class="t4art t4load" style="aspect-ratio:1/1" aria-label="loading"><i></i><i></i><i></i><span>pressing</span></div><div class="t4foot"><span class="t4cap">embedding in progress</span></div>${t4TierBadge(1)}</div></div>`;
}

function t4CellError(m) {
  return `<div class="t4-cw t4-cw-t2"><div class="t4cell error"><div class="t4head"><span>${esc(m.file)}</span><span class="num">err 500</span></div><div class="t4art t4erbox" style="aspect-ratio:1/1"><b>misprint</b><span>the model looked away. press retry.</span><button class="t4btn sm">retry</button></div><div class="t4foot"><span class="t4cap">embedding error</span></div><div class="t4-tape"></div></div></div>`;
}

function t4Console(q = 'cat losing it') {
  return `
  <div class="t4console">
    <div class="t4conhead"><span>stockroom counter</span><span class="num">${LIB.model} · ${LIB.latency}ms</span></div>
    <div class="t4conshelf">
      <div class="t4field"><span class="t4prompt">describe:</span><span class="t4q">${esc(q)}</span><span class="t4caret"></span></div>
      <button class="t4btn primary">find it</button>
    </div>
    <div class="t4conmeta num">
      <span>index <b>${LIB.total.toLocaleString()}</b></span>
      <span>dim <b>${LIB.dim}</b></span>
      <span>queue <b>${LIB.queued}</b></span>
      <span>route <b>/api/search</b></span>
      <span class="t4con-tier">compact cells hide all decorations</span>
    </div>
  </div>`;
}

function t4Status() {
  return `
  <div class="t4status num">
    <span><b>index</b> ${LIB.total.toLocaleString()}</span>
    <span><b>embedded</b> ${LIB.embedded.toLocaleString()}</span>
    <span><b>intake</b> ${LIB.queued}</span>
    <span><b>model</b> ${LIB.model}</span>
    <span class="t4ok"><i></i> stock ready</span>
    <span class="t4tiercount"><b>t0</b> compact / <b>t1</b> standard / <b>t2</b> expanded</span>
  </div>`;
}

SPECS['TASTE-4'] = (mount) => {
  css('TASTE-4', `
  @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&display=swap');
  .taste4{
    --t4-bg:#eee3c9; --t4-panel:#f7f0dd; --t4-panel2:#f2ead3; --t4-ink:#1a1547;
    --t4-mut:rgba(26,21,71,.6); --t4-line:rgba(26,21,71,.35);
    --t4-cherry:#ff3355; --t4-banana:#ffdd00; --t4-gum:#ff7ad9; --t4-apple:#2ec06e;
    --t4-sky:#39b1ff; --t4-store:#ff6c2f; --t4-mauve:#8a5cff;
    --t4-o:3px solid var(--t4-ink);
    --t4-drop:0 5px 0 var(--t4-ink); --t4-drop-lg:0 9px 0 var(--t4-ink); --t4-drop-dn:0 1px 0 var(--t4-ink);
    --t4-miss:4px 4px 0 var(--t4-cherry);
    --t4-miss-lg:6px 6px 0 var(--t4-cherry), 10px 10px 0 var(--t4-sky);
    --t4-ring:0 0 0 4px var(--t4-apple), 8px 8px 0 var(--t4-ink);
    --t4-r:12px; --t4-rs:8px;
    --t4-spring:cubic-bezier(.34,1.56,.64,1); --t4-fast:130ms;
    --t4-display:'Bungee',cursive; --t4-body:'Bricolage Grotesque',sans-serif;
    --t4-mono:'IBM Plex Mono',monospace; --t4-hand:'Caveat',cursive;
    --t4-toy:'Baloo 2',sans-serif;
    min-height:100dvh; display:flex; flex-direction:column;
    font-family:var(--t4-body); color:var(--t4-ink);
    background:radial-gradient(var(--t4-line) 1.5px, transparent 1.8px) 0 0 / 18px 18px, var(--t4-bg);
  }
  .taste4.theme-dark{
    --t4-bg:#171329; --t4-panel:#231e3c; --t4-panel2:#1d1936; --t4-ink:#efe5ce;
    --t4-mut:rgba(239,229,206,.65); --t4-line:rgba(239,229,206,.12);
    --t4-cherry:#ff5575; --t4-banana:#ffe833; --t4-gum:#ff99e0; --t4-apple:#4edb8c;
    --t4-sky:#66c5ff; --t4-store:#ff8c55; --t4-mauve:#a87dff;
    --t4-o:3px solid var(--t4-ink);
    --t4-drop:0 5px 0 #0a0720; --t4-drop-lg:0 9px 0 #0a0720; --t4-drop-dn:0 1px 0 #0a0720;
    --t4-miss:4px 4px 0 var(--t4-cherry);
    --t4-miss-lg:6px 6px 0 var(--t4-cherry), 10px 10px 0 var(--t4-sky);
    --t4-ring:0 0 0 4px var(--t4-apple), 8px 8px 0 #0a0720;
  }
  .taste4 *{box-sizing:border-box}
  .taste4 .num{font-family:var(--t4-mono);font-variant-numeric:tabular-nums}
  .taste4 :focus-visible{outline:3px dashed var(--t4-store);outline-offset:3px;border-radius:4px}
  .taste4 button,.taste4 input{font:inherit;color:inherit}
  .taste4 a{color:inherit;text-decoration:none}
  .taste4 .wrap{width:100%;max-width:1320px;margin:0 auto;padding:0 clamp(14px,4vw,44px)}
  .taste4 .sec{
    display:flex;gap:14px;align-items:baseline;margin-top:52px;padding:10px 0 18px;
    border-top:var(--t4-o);font-family:var(--t4-mono);font-size:11px;text-transform:lowercase;
  }
  .taste4 .sec b{background:var(--t4-ink);color:var(--t4-bg);padding:2px 10px;border-radius:6px;font-weight:700}
  .taste4 .sec i{font-family:var(--t4-hand);font-style:normal;font-size:17px;color:var(--t4-mut)}
  .taste4 .row{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
  .taste4 .mast{
    display:flex;align-items:center;justify-content:space-between;gap:16px;
    padding:12px clamp(14px,4vw,44px);border-bottom:var(--t4-o);background:var(--t4-panel);
  }
  .taste4 .logo{font-family:var(--t4-display);font-size:22px;letter-spacing:.02em}
  .taste4 .logo em{font-style:normal;color:var(--t4-cherry)}
  .taste4 .mnav{display:flex;gap:12px;font-family:var(--t4-mono);font-size:11px;text-transform:lowercase}
  .taste4 .mnav a{color:var(--t4-ink);border-bottom:2px solid transparent;padding:2px 0}
  .taste4 .mnav a:hover{border-bottom-color:var(--t4-cherry)}
  .taste4 .mtier{font-family:var(--t4-mono);font-size:9px;color:var(--t4-store);text-transform:lowercase}
  .taste4 .hero{display:grid;grid-template-columns:1.2fr .8fr;border-bottom:var(--t4-o);min-height:480px}
  .taste4 .hero-l{padding:50px 40px 44px clamp(14px,4vw,44px);display:flex;flex-direction:column;gap:22px;border-right:var(--t4-o)}
  .taste4 .eyeb{display:inline-flex;align-items:center;gap:8px;font-family:var(--t4-mono);font-size:10px;text-transform:lowercase;color:var(--t4-mut)}
  .taste4 .eyeb i{width:8px;height:8px;border-radius:50%;background:var(--t4-apple)}
  .taste4 .h1{font-family:var(--t4-display);font-size:clamp(36px,5.6vw,64px);line-height:1.04;letter-spacing:.005em}
  .taste4 .h1 em{font-style:normal;color:var(--t4-cherry)}
  .taste4 .hero-r{display:grid;grid-template-rows:auto 1fr;background:var(--t4-panel2)}
  .taste4 .hero-r-top{display:grid;grid-template-columns:1fr 1fr;border-bottom:var(--t4-o)}
  .taste4 .hero-r-top>div{padding:18px 20px;display:flex;flex-direction:column;gap:4px}
  .taste4 .hero-r-top>div+div{border-left:var(--t4-o)}
  .taste4 .kpi-lb{font-family:var(--t4-mono);font-size:9px;text-transform:lowercase;color:var(--t4-mut)}
  .taste4 .kpi-vl{font-family:var(--t4-mono);font-variant-numeric:tabular-nums;font-size:28px;font-weight:700;line-height:1.1}
  .taste4 .kpi-vl.s{color:var(--t4-store)}
  .taste4 .kpi-vl.c{color:var(--t4-cherry)}
  .taste4 .hero-r-bot{display:grid;place-items:center;padding:16px}
  .taste4 .hero-tag{font-family:var(--t4-hand);font-size:18px;color:var(--t4-mut);transform:rotate(-1.5deg)}
  .taste4 .t4console{border:var(--t4-o);border-radius:var(--t4-r);background:var(--t4-panel);box-shadow:var(--t4-drop-lg);max-width:840px;overflow:hidden}
  .taste4 .t4conhead{display:flex;justify-content:space-between;gap:10px;padding:9px 16px;
    background:var(--t4-ink);color:var(--t4-bg);font-family:var(--t4-mono);font-size:10px;text-transform:lowercase}
  .taste4 .t4conshelf{display:flex;gap:12px;padding:16px;align-items:center;
    background:repeating-linear-gradient(transparent,transparent 24px,var(--t4-line) 24px,var(--t4-line) 25px),var(--t4-panel)}
  .taste4 .t4field{flex:1;display:flex;align-items:center;gap:10px;border:var(--t4-o);border-radius:999px;
    background:var(--t4-panel2);padding:11px 16px;font-family:var(--t4-body);font-weight:600;font-size:15px;min-width:0}
  .taste4 .t4prompt{font-family:var(--t4-mono);font-size:10px;color:var(--t4-mut)}
  .taste4 .t4q{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .taste4 .t4caret{width:9px;height:19px;border-radius:2px;background:var(--t4-store);flex:none;animation:t4blink 1s steps(1) infinite}
  @keyframes t4blink{50%{opacity:0}}
  .taste4 .t4conmeta{display:flex;gap:14px;flex-wrap:wrap;align-items:center;padding:8px 16px;
    border-top:2px dashed var(--t4-ink);font-family:var(--t4-mono);font-size:9px;color:var(--t4-mut)}
  .taste4 .t4conmeta b{color:var(--t4-ink);font-weight:600}
  .taste4 .t4con-tier{margin-left:auto;font-family:var(--t4-hand);font-size:13px;color:var(--t4-store)}
  .taste4 .t4-tierbadge{display:inline-block;font-family:var(--t4-mono);font-size:8px;text-transform:lowercase;
    color:var(--t4-bg);padding:2px 7px;border-radius:999px;background:var(--t4-store)}
  .taste4.theme-dark .t4-tierbadge{color:#171329}
  .taste4 .t4-tier2{background:var(--t4-mauve)}
  .taste4 .t4-tier1{background:var(--t4-sky)}
  .taste4 .t4-stamp{display:inline-block;font-family:var(--t4-toy);font-weight:800;font-size:10px;text-transform:uppercase;
    border:3px double var(--t4-cherry);color:var(--t4-cherry);padding:2px 8px;transform:rotate(-2deg);flex:none}
  .taste4 .t4-stamp.green{border-color:var(--t4-apple);color:var(--t4-apple)}
  .taste4 .t4-stamp.store{border-color:var(--t4-store);color:var(--t4-store)}
  .taste4 .t4-star{display:inline-grid;place-items:center;width:72px;height:72px;flex:none;
    clip-path:polygon(100% 50%,80.9% 58.3%,93.3% 75%,72.6% 72.6%,75% 93.3%,58.3% 80.9%,50% 100%,41.7% 80.9%,25% 93.3%,27.4% 72.6%,6.7% 75%,19.1% 58.3%,0% 50%,19.1% 41.7%,6.7% 25%,27.4% 27.4%,25% 6.7%,41.7% 19.1%,50% 0%,58.3% 19.1%,75% 6.7%,72.6% 27.4%,93.3% 25%,80.9% 41.7%);
    background:var(--t4-banana);filter:drop-shadow(2px 3px 0 rgba(26,21,71,.85))}
  .taste4 .t4-star span{font-family:var(--t4-display);font-size:9px;color:#1a1547;text-align:center;max-width:50px;line-height:1.15;transform:rotate(-2deg)}
  .taste4 .t4-star-corner{position:absolute;top:-12px;right:-10px;z-index:3}
  .taste4 .t4-star.left{right:auto;left:-10px;transform:rotate(-10deg)}
  .taste4 .t4-star.apple{background:var(--t4-apple)}
  .taste4 .t4-star.gum{background:var(--t4-gum)}
  .taste4 .t4-tape{position:absolute;top:-6px;left:50%;width:52px;height:14px;
    margin-left:-26px;background:rgba(255,221,0,.5);border:1px solid rgba(26,21,71,.12);
    transform:rotate(-1.5deg);z-index:2;pointer-events:none}
  .taste4.theme-dark .t4-tape{background:rgba(255,221,0,.25)}
  .taste4 .t4btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
    min-height:46px;padding:10px 22px;font-family:var(--t4-toy);font-weight:700;font-size:14px;
    border:var(--t4-o);border-radius:999px;background:var(--t4-panel);color:var(--t4-ink);
    box-shadow:var(--t4-drop);transition:transform var(--t4-fast) var(--t4-spring),box-shadow var(--t4-fast) var(--t4-spring)}
  .taste4 .t4btn:hover{transform:translateY(-2px);box-shadow:0 7px 0 var(--t4-ink)}
  .taste4.theme-dark .t4btn:hover{box-shadow:0 7px 0 #0a0720}
  .taste4 .t4btn:active{transform:translateY(4px) scale(.98,.95);box-shadow:var(--t4-drop-dn)}
  .taste4 .t4btn.primary{background:var(--t4-banana);color:#1a1547}
  .taste4 .t4btn.cherry{background:var(--t4-cherry);color:#fff}
  .taste4 .t4btn.sm{min-height:36px;padding:5px 14px;font-size:13px;border-width:2px;box-shadow:0 3px 0 var(--t4-ink)}
  .taste4.theme-dark .t4btn.sm{box-shadow:0 3px 0 #0a0720}
  .taste4 .t4btn.sm:active{transform:translateY(2px);box-shadow:0 1px 0 var(--t4-ink)}
  .taste4 .t4btn.icon{width:46px;padding:0}
  .taste4 .t4btn.quiet{border-style:dashed;box-shadow:none}
  .taste4 .t4btn.quiet:hover{transform:none;box-shadow:none;background:var(--t4-panel2)}
  .taste4 .t4tag{display:inline-flex;align-items:center;gap:5px;font-family:var(--t4-toy);font-weight:700;
    font-size:12px;border:2px solid var(--t4-ink);border-radius:999px;padding:4px 11px;background:var(--t4-sky);color:#1a1547}
  .taste4 .t4tag.gum{background:var(--t4-gum)}
  .taste4 .t4tag.apple{background:var(--t4-apple)}
  .taste4 .t4-cw{position:relative}
  .taste4 .t4cell{position:relative;border:var(--t4-o);border-radius:var(--t4-r);background:var(--t4-panel);
    box-shadow:var(--t4-drop);overflow:hidden;
    transition:transform var(--t4-fast) var(--t4-spring),box-shadow var(--t4-fast) var(--t4-spring)}
  .taste4 .t4cell:hover{transform:translateY(-2px);box-shadow:0 7px 0 var(--t4-ink)}
  .taste4.theme-dark .t4cell:hover{box-shadow:0 7px 0 #0a0720}
  .taste4 .t4head{display:flex;justify-content:space-between;gap:8px;padding:5px 10px;
    font-family:var(--t4-mono);font-size:9px;text-transform:lowercase;color:var(--t4-mut);
    border-bottom:2px dashed var(--t4-ink);white-space:nowrap;overflow:hidden}
  .taste4 .t4art{display:grid;place-items:center;overflow:hidden;background:var(--t4-panel2);margin:7px;border:2px solid var(--t4-ink);border-radius:var(--t4-rs)}
  .taste4 .t4art .meme-media{background:var(--t4-panel2)}
  .taste4 .t4foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 11px 10px;font-size:12.5px;line-height:1.35;font-weight:600;
    border-top:2px dashed var(--t4-ink);margin-top:auto}
  .taste4 .t4match{font-family:var(--t4-mono);font-size:13px;font-weight:700;color:var(--t4-apple)}
  .taste4 .t4cap{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
  .taste4 .t4t0foot{display:flex;align-items:center;gap:8px;padding:4px 10px;
    font-family:var(--t4-mono);font-size:8px;text-transform:lowercase;color:var(--t4-mut)}
  .taste4 .t4t0foot .t4num{background:var(--t4-store);color:var(--t4-bg);padding:0 6px;border-radius:4px}
  .taste4.theme-dark .t4t0foot .t4num{color:#171329}
  .taste4 .t4thin{flex:1}
  .taste4 .t4cell.match{border-color:var(--t4-apple);box-shadow:var(--t4-ring)}
  .taste4 .t4cell.near{outline:3px dashed var(--t4-store);outline-offset:3px}
  .taste4 .t4cell.dim{opacity:.42;filter:grayscale(.5) contrast(.9)}
  .taste4 .t4cell.selected{box-shadow:0 0 0 4px var(--t4-mauve),var(--t4-drop-lg)}
  .taste4 .t4cell.error{border-color:var(--t4-cherry);box-shadow:0 5px 0 var(--t4-cherry)}
  .taste4 .t4cell.error .t4head{color:var(--t4-cherry);border-bottom-color:var(--t4-cherry)}
  .taste4 .t4-cw-t0 .t4cell{box-shadow:var(--t4-drop)}
  .taste4 .t4-cw-t0 .t4art{border-radius:0;margin:0;border:0}
  .taste4 .t4-cw-t0 .t4foot{border-top:2px solid var(--t4-ink);padding:7px 10px;font-size:11px}
  .taste4 .t4-cw-t2 .t4cell{box-shadow:var(--t4-miss)}
  .taste4 .t4-cw-t2 .t4cell:hover{transform:translate(-2px,-2px) rotate(.3deg);box-shadow:var(--t4-miss-lg)}
  .taste4 .t4-cw-t2 .t4head{color:var(--t4-ink)}
  .taste4 .t4load{display:flex;gap:8px;align-items:center;justify-content:center;
    font-family:var(--t4-mono);font-size:10px;color:var(--t4-mut)}
  .taste4 .t4load i{width:9px;height:9px;border-radius:50%;background:var(--t4-mauve);animation:t4bounce 600ms var(--t4-spring) infinite alternate}
  .taste4 .t4load i:nth-child(2){animation-delay:90ms;background:var(--t4-gum)}
  .taste4 .t4load i:nth-child(3){animation-delay:180ms;background:var(--t4-sky)}
  @keyframes t4bounce{from{transform:translateY(2px)}to{transform:translateY(-4px)}}
  .taste4 .t4erbox{display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;
    padding:18px;text-align:center;font-family:var(--t4-mono);font-size:11px;color:var(--t4-cherry)}
  .taste4 .t4stat{border:var(--t4-o);border-radius:var(--t4-r);background:var(--t4-panel);box-shadow:var(--t4-drop);padding:12px 16px;min-width:150px}
  .taste4 .t4stat .lb{font-family:var(--t4-mono);font-size:9px;text-transform:lowercase;color:var(--t4-mut)}
  .taste4 .t4stat .vl{font-family:var(--t4-mono);font-variant-numeric:tabular-nums;font-size:32px;font-weight:700;line-height:1.1}
  .taste4 .t4stat.s{background:var(--t4-store);color:#fff}
  .taste4 .t4stat.banana{background:var(--t4-banana);color:#1a1547}
  .taste4 .t4stat.cherry{background:var(--t4-cherry);color:#fff}
  .taste4 .t4status{display:flex;flex-wrap:wrap;align-items:center;border-top:var(--t4-o);
    background:var(--t4-ink);color:var(--t4-bg);font-family:var(--t4-mono);font-size:9px;text-transform:lowercase}
  .taste4 .t4status span{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-right:2px dotted rgba(247,240,221,.3)}
  .taste4 .t4status b{color:rgba(247,240,221,.6);font-weight:400;margin-right:3px}
  .taste4 .t4ok i{width:8px;height:8px;border-radius:50%;background:var(--t4-apple)}
  .taste4 .t4tiercount{margin-left:auto}
  .taste4 .t4tiercount b{font-weight:700!important;color:var(--t4-store)!important;font-family:var(--t4-mono)}
  .taste4 .t4input{display:flex;align-items:center;gap:10px;border:var(--t4-o);border-radius:999px;
    background:var(--t4-panel);padding:11px 16px;min-width:260px}
  .taste4 .t4tabs{display:inline-flex;border:var(--t4-o);border-radius:var(--t4-r);background:var(--t4-panel);padding:3px}
  .taste4 .t4tab{font-family:var(--t4-toy);font-weight:700;font-size:13px;padding:8px 16px;min-height:38px;
    border:0;border-radius:var(--t4-rs);background:transparent;color:var(--t4-ink);cursor:pointer}
  .taste4 .t4tab.on{background:var(--t4-ink);color:var(--t4-bg)}
  .taste4 .t4toast{display:inline-flex;gap:12px;align-items:center;border:var(--t4-o);border-radius:var(--t4-r);
    background:var(--t4-apple);color:#1a1547;box-shadow:var(--t4-drop);padding:11px 17px;
    font-family:var(--t4-toy);font-weight:700;font-size:13px}
  .taste4 .t4empty{position:relative;border:var(--t4-o);border-radius:var(--t4-r);background:var(--t4-panel);
    box-shadow:var(--t4-drop-lg);padding:30px 24px;max-width:430px;display:flex;flex-direction:column;gap:12px;align-items:flex-start}
  .taste4 .t4empty .big{font-family:var(--t4-display);font-size:32px;line-height:1;color:var(--t4-store)}
  .taste4 .t4empty .hand{font-family:var(--t4-hand);font-size:18px;color:var(--t4-mut);transform:rotate(-1deg)}
  .taste4 .shapes{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px}
  .taste4 .shape{border:var(--t4-o);border-radius:var(--t4-r);background:var(--t4-panel);width:132px;height:82px;
    display:grid;place-items:center;text-align:center;font-family:var(--t4-mono);font-size:9px;text-transform:lowercase;color:var(--t4-mut)}
  .taste4 .shape.t0{border-width:2px;border-radius:0;font-size:8px}
  .taste4 .shape.t1{border-radius:999px}
  .taste4 .shape.t2{box-shadow:var(--t4-miss)}
  .taste4 .g4{display:grid;gap:18px;grid-template-columns:repeat(4,1fr)}
  .taste4 .g2{display:grid;gap:14px;grid-template-columns:repeat(2,1fr)}
  .taste4 .mlab{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-top:16px}
  @keyframes t4slam{0%{opacity:0;transform:scale(2) rotate(-16deg)}55%{opacity:1;transform:scale(.9) rotate(3deg)}100%{opacity:1;transform:scale(1) rotate(-2deg)}}
  .taste4 .t4-demostamp.go{animation:t4slam 280ms var(--t4-spring)}
  @keyframes t4boop{0%{transform:scale(1)}40%{transform:scale(.92,.88)}100%{transform:scale(1)}}
  .taste4 .t4-demoboop.go .t4cell{animation:t4boop 200ms var(--t4-spring)}
  @keyframes t4tierfill{from{width:0%}}
  .taste4 .t4-tierdemo .bar{height:6px;background:var(--t4-line);border-radius:4px;overflow:hidden;margin-top:8px}
  .taste4 .t4-tierdemo .bar i{display:block;height:100%;width:0;background:var(--t4-store);border-radius:4px}
  .taste4 .t4-tierdemo.go .bar i{animation:t4tierfill 400ms var(--t4-spring) forwards}
  .taste4 .bench{border:var(--t4-o);border-radius:var(--t4-r);background:var(--t4-panel);box-shadow:var(--t4-drop-lg);overflow:hidden}
  .taste4 .benchbar{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:var(--t4-o);flex-wrap:wrap}
  .taste4 .benchbody{display:grid;grid-template-columns:220px 1fr}
  .taste4 .rail{border-right:var(--t4-o);padding:10px 0;display:flex;flex-direction:column}
  .taste4 .rail-head{font-family:var(--t4-mono);font-size:9px;text-transform:lowercase;color:var(--t4-mut);padding:8px 14px 4px}
  .taste4 .pile{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 14px;border:0;border-top:2px dashed var(--t4-line);
    background:none;color:var(--t4-ink);font-family:var(--t4-body);font-weight:600;font-size:13px;text-align:left;cursor:pointer}
  .taste4 .pile b{font-family:var(--t4-mono);font-weight:400;font-size:11px;color:var(--t4-mut)}
  .taste4 .pile:hover{background:var(--t4-panel2)}
  .taste4 .pile.on{box-shadow:inset 4px 0 0 var(--t4-store);background:var(--t4-panel2)}
  .taste4 .phone{width:390px;max-width:100%;border:var(--t4-o);border-radius:24px;background:var(--t4-bg);
    box-shadow:var(--t4-drop-lg);overflow:hidden;margin:24px 0 48px}
  .taste4 .phhead{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;
    border-bottom:var(--t4-o);background:var(--t4-panel)}
  .taste4 .phbody{padding:12px;display:flex;flex-direction:column;gap:12px}
  .taste4 .dock{display:flex;border-top:var(--t4-o);background:var(--t4-panel)}
  .taste4 .dock button{flex:1;min-height:48px;background:none;border:0;border-right:2px dashed var(--t4-line);
    font-family:var(--t4-toy);font-weight:700;font-size:11px;color:var(--t4-ink);cursor:pointer}
  .taste4 .dock button:last-child{border-right:0}
  .taste4 .dock button.on{background:var(--t4-ink);color:var(--t4-bg)}
  @media(prefers-reduced-motion:reduce){
    .taste4 *,.taste4 *::before,.taste4 *::after{animation:none!important;transition:none!important}
    .taste4 .t4-demostamp.go{opacity:1}
  }
  @media(max-width:760px){
    .taste4 .wrap{padding:0 14px}
    .taste4 .mast{padding:10px 14px}
    .taste4 .hero{grid-template-columns:1fr}
    .taste4 .hero-l{border-right:0;border-bottom:var(--t4-o);padding:34px 14px}
    .taste4 .g4{grid-template-columns:repeat(2,minmax(0,1fr))}
    .taste4 .benchbody{grid-template-columns:1fr}
    .taste4 .rail{border-right:0;border-bottom:var(--t4-o)}
    .taste4 .t4conshelf{flex-direction:column;align-items:stretch}
    .taste4 .shapes{gap:8px}
    .taste4 .t4con-tier{display:none}
    .taste4 .t4tiercount{display:none}
    .taste4 .mnav{flex-wrap:wrap;justify-content:flex-end}
    .taste4 [style*="display:flex"]{flex-wrap:wrap}
    .taste4 .g4{grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
  }`);

  const M = MEMES;
  mount.innerHTML = `
  <div class="taste4">
    <div class="mast">
      <span class="logo">spl<em>oo</em>t</span>
      <span class="mtier num">tier density: compact → standard → expanded</span>
      <nav class="mnav"><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">upload</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </div>
    <div class="hero">
      <div class="hero-l">
        <span class="eyeb"><i></i> stockroom · daily-driver archive</span>
        <h1 class="h1">type words.<br>get the <em>picture.</em></h1>
        <p style="max-width:48ch;font-size:16px">your whole meme library, gated by annotation tier. compact cells hide every decoration. expanded cells earn the full print-toy treatment. no folders. just vibes.</p>
        ${t4Console()}
      </div>
      <div class="hero-r">
        <div class="hero-r-top">
          <div><span class="kpi-lb">memes indexed</span><span class="kpi-vl num s">1,482</span></div>
          <div><span class="kpi-lb">with annotations</span><span class="kpi-vl num c">237</span></div>
        </div>
        <div class="hero-r-bot">
          <div style="display:flex;flex-direction:column;gap:10px;align-items:center">
            <span class="hero-tag">decorations are earned, not sprinkled</span>
            <div class="row" style="align-items:center;gap:8px">
              <span class="t4-tierbadge t4-tier1">standard (t1)</span>
              <span style="font-family:var(--t4-mono);font-size:9px;color:var(--t4-mut)">1 annotation max</span>
            </div>
            <span class="t4-stamp" style="font-size:12px">banger</span>
          </div>
        </div>
      </div>
    </div>
    <div class="wrap"><div class="sec"><b>01</b><span>foundations <i>— stock paper, ink outline, tier rules</i></span></div></div>
    <div>${swatches([['stock', '#eee3c9'], ['panel', '#f7f0dd'], ['ink', '#1a1547', '#efe5ce'], ['store', '#ff6c2f','#fff'], ['cherry', '#ff3355','#fff'], ['banana', '#ffdd00'], ['gum', '#ff7ad9'], ['apple', '#2ec06e','#fff'], ['sky', '#39b1ff'], ['mauve', '#8a5cff','#fff']])}</div>
    <div class="wrap" style="padding-top:18px">
      <div class="shapes">
        <div class="shape t0">2px border · compact (t0)</div>
        <div class="shape">3px ink · std object (t1)</div>
        <div class="shape t2">misregister offset · expanded (t2)</div>
        <div class="shape" style="box-shadow:var(--t4-drop)">drop 5 · toy elevation</div>
        <div class="shape" style="box-shadow:var(--t4-drop-lg)">drop 9 · floating</div>
        <div class="shape t1">pill · pressable</div>
      </div>
      <p style="margin-top:14px;font-family:var(--t4-mono);font-size:9px;color:var(--t4-mut);text-transform:lowercase">spacing rides a 14px stock grid · elevation is arcade drop-height, press removes it · annotations: max 0 at t0, 1 at t1, 2+ at t2</p>
    </div>
    <div class="wrap"><div class="sec"><b>02</b><span>typography <i>— bungee / baloo 2 / bricolage / plex mono / caveat</i></span></div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="font-family:var(--t4-display);font-size:44px;line-height:1.08">display · bungee</div>
        <div style="font-family:var(--t4-toy);font-size:28px;font-weight:700;line-height:1.1">annotation · baloo 2</div>
        <div style="font-size:17px;max-width:550px">body · bricolage grotesque. the pile sorts itself into tiers while you sleep. compact cells carry zero decorations.</div>
        <div style="font-family:var(--t4-mono);font-size:11px;text-transform:lowercase">label · ibm plex mono · data layer</div>
        <div style="font-family:var(--t4-mono);font-size:10px;color:var(--t4-mut)">metadata · vec 0413 · 212ms · siglip-base · dim 768</div>
        <div style="font-family:var(--t4-mono);font-size:26px;font-variant-numeric:tabular-nums">1,482 · 0.94 · 212ms · t0:1,021 · t2:237</div>
        <div style="font-family:var(--t4-hand);font-size:20px;color:var(--t4-mut);transform:rotate(-1deg)">scribble · caveat, for marginalia the archivist adds</div>
        <div style="font-size:13px;max-width:44ch;border-left:3px solid var(--t4-store);padding-left:12px">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me earns the expanded tier treatment.</div>
      </div>
    </div>
    <div class="wrap"><div class="sec"><b>03</b><span>components <i>— tier-gated, chrome-budgeted, every surface declared</i></span></div>
      <div style="display:flex;flex-direction:column;gap:28px">
        ${t4Console('sad frog')}
        <div class="g4">
          ${t4Cell(M[1], '', 0, false)}
          ${t4Cell(M[0], 'match', 2, true)}
          ${t4Cell(M[3], 'near', 1, true)}
          ${t4Cell(M[9], 'dim', 0, false)}
        </div>
        <div class="g4">
          ${t4Cell(M[4], 'selected', 1, true)}
          ${t4CellLoading()}
          ${t4CellError(M[6])}
          <div class="t4empty">
            <span class="big">0</span>
            <p style="font-size:15px;font-weight:600">the stockroom is quiet. no items on any tier. upload chaos and the machine starts sorting by chrome budget.</p>
            <p class="hand">compact cells stay invisible until they earn their way up.</p>
            <button class="t4btn primary">upload chaos</button>
          </div>
        </div>
        <div class="row" style="align-items:center">
          <button class="t4btn primary">find it</button>
          <button class="t4btn">shuffle the pile</button>
          <button class="t4btn quiet">secondary</button>
          <button class="t4btn sm">compact</button>
          <button class="t4btn sm icon" aria-label="close">✕</button>
          <span class="t4tag">tier tag</span>
          <span class="t4tag apple">annotated (t2)</span>
          <span class="t4-stamp">banger</span>
          <span class="t4-tierbadge t4-tier1">standard</span>
        </div>
        <div class="row" style="align-items:center">
          <div class="t4input"><span class="t4prompt">search:</span><span>text input</span><span class="t4caret"></span></div>
          <div class="t4tabs"><button class="t4tab on">all</button><button class="t4tab">bangers</button><button class="t4tab">recent</button></div>
          <div class="t4toast">saved to the pile · tier t1</div>
        </div>
        <div class="row">
          <div class="t4stat banana"><div class="lb">folders required</div><div class="vl num">0</div></div>
          <div class="t4stat"><div class="lb">memes indexed</div><div class="vl num">1,482</div></div>
          <div class="t4stat cherry"><div class="lb">annotated (t2+)</div><div class="vl num">237</div></div>
          <div class="t4stat s"><div class="lb">compact (t0)</div><div class="vl num">1,021</div></div>
        </div>
        ${t4Status()}
      </div>
    </div>
    <div class="wrap"><div class="sec"><b>04</b><span>motion <i>— tier-gated, interaction only, squash-stamp-fill</i></span></div>
      <div class="mlab">
        <button class="t4btn primary">press me · arcade drop</button>
        <button class="t4btn" id="t4-slam">slam stamp</button>
        <span class="t4-demostamp" style="visibility:hidden"><span class="t4-stamp" style="font-size:16px;padding:5px 12px">banger!</span></span>
        <button class="t4btn" id="t4-boop">boop card</button>
        <div class="t4-demoboop" style="width:140px">${t4Cell(M[1], '', 1).replace('t4-cw t4-cw-t1','t4-cw')}</div>
        <button class="t4btn" id="t4-tierfill">fill tier gauge</button>
        <div class="t4-tierdemo" style="min-width:200px;padding:12px 14px;border:var(--t4-o);border-radius:var(--t4-r);background:var(--t4-panel)">
          <span style="font-family:var(--t4-mono);font-size:9px;text-transform:lowercase">chrome budget: t0<b style="color:var(--t4-store);font-weight:700"> 0%</b> → t2<b style="color:var(--t4-store);font-weight:700"> 35%</b></span>
          <div class="bar"><i id="t4-tierfill-bar"></i></div>
        </div>
      </div>
      <p style="margin-top:14px;font-family:var(--t4-mono);font-size:9px;text-transform:lowercase;color:var(--t4-mut)">prefers-reduced-motion: stamp slams, card boops, and tier fills snap to their final state instantly. compact (t0) cells never animate.</p>
    </div>
    <div class="wrap"><div class="sec"><b>05</b><span>compositions <i>— workbench and pocket stockroom</i></span></div></div>
    <div class="wrap">
      <div class="bench">
        <div class="benchbar">
          <span class="logo" style="font-size:16px">spl<em>oo</em>t</span>
          <div class="t4field" style="flex:1;max-width:400px"><span class="t4prompt">search:</span><span class="t4q">search the pile</span><span class="t4caret"></span></div>
          <button class="t4btn sm">upload</button>
          <button class="t4btn sm">bangers</button>
          <button class="t4btn sm">tiers</button>
        </div>
        <div class="benchbody">
          <div class="rail">
            <span class="rail-head">automatic piles · by tier</span>
            ${PILES.map((p, i) => `<button class="pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b class="num">${p.n}</b></button>`).join('')}
            <div style="margin-top:auto;padding:10px 14px;border-top:2px dashed var(--t4-line)">
              <span class="t4-tierbadge t4-tier1">t1 standard</span>
              <span style="font-family:var(--t4-mono);font-size:8px;color:var(--t4-mut);display:block;margin-top:4px">piles with annotations</span>
            </div>
          </div>
          <div class="g4" style="padding:14px;gap:14px">${M.slice(0, 8).map((x, i) => t4Cell(x, i === 0 ? 'match' : '', i < 2 ? 2 : i < 5 ? 1 : 0, i === 0)).join('')}</div>
        </div>
        ${t4Status()}
      </div>
    </div>
    <div class="wrap">
      <div class="phone">
        <div class="phhead"><span class="logo" style="font-size:15px">spl<em>oo</em>t</span><span class="t4-tierbadge t4-tier1" style="font-size:7px">t1</span></div>
        <div class="phbody">
          <div class="t4field" style="min-width:0"><span class="t4prompt">find:</span><span>cat losing it</span><span class="t4caret"></span></div>
          <div class="g2" style="gap:12px">${M.slice(0, 4).map((x, i) => t4Cell(x, i === 0 ? 'match' : '', i === 0 ? 2 : 1, i === 0)).join('')}</div>
        </div>
        <div class="dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>
    <div style="margin-top:auto">
      ${labSpec([['system', 'stockroom · overprint+toybox daily driver'], ['type', 'bungee / baloo 2 / bricolage grotesque / ibm plex mono / caveat'], ['move', 'density-delineated annotation tiers: cell size steps, chrome budgets (0/15/35%), annotation quotas (0/1/2+)'], ['density', 'tiered · compact 0% → standard 15% → expanded 35% chrome'], ['motion', 'arcade drop, stamp slam, boop: all tier-gated, interaction only']])}
    </div>
  </div>`;

  themeToggle(mount.querySelector('.taste4'));

  const slamBtn = mount.querySelector('#t4-slam');
  const slamTarget = mount.querySelector('.t4-demostamp');
  if (slamBtn && slamTarget) slamBtn.addEventListener('click', () => {
    slamTarget.style.visibility = 'visible';
    slamTarget.classList.remove('go'); void slamTarget.offsetWidth; slamTarget.classList.add('go');
  });

  const boopBtn = mount.querySelector('#t4-boop');
  const boopTarget = mount.querySelector('.t4-demoboop');
  if (boopBtn && boopTarget) boopTarget.addEventListener('click', () => {
    boopTarget.classList.remove('go'); void boopTarget.offsetWidth; boopTarget.classList.add('go');
  });

  const fillBtn = mount.querySelector('#t4-tierfill');
  const fillBar = mount.querySelector('#t4-tierfill-bar');
  if (fillBtn && fillBar) fillBtn.addEventListener('click', () => {
    const pct = 35;
    fillBar.style.width = '0%';
    fillBar.closest('.t4-tierdemo')?.classList.remove('go');
    void fillBar.offsetWidth;
    fillBar.closest('.t4-tierdemo')?.classList.add('go');
    fillBar.style.width = pct + '%';
  });
};

})();
