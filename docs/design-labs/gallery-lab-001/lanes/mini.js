/* lanes/mini.js · flat editorial minimalism translated through the toybox.
   discipline: subtraction. chrome recedes; the thumbnails are the interface.
   two options:
   MINI-1 "the bare wall": no chrome above the grid at all; captions never
     render in the grid; one bottom ledger line owns everything.
   MINI-2 "margin catalog": a quiet text margin beside a masonry of framed
     plates with museum wall labels; detail is a paginated plate spread. */

const pct = (s) => `${Math.round(parseFloat(s) * 100)}%`;

function ranked() {
  const c = LAB.corpus;
  return [
    ...c.filter((m) => m.role === 'match'),
    ...c.filter((m) => m.role === 'near'),
    ...c.filter((m) => !m.role),
  ];
}

/* =====================================================================
   MINI-1 · the bare wall
   ===================================================================== */

const CSS1 = `
<style>
[data-opt="MINI-1"] { display:flex; flex-direction:column; min-height:100dvh; }
[data-opt="MINI-1"] .wall { flex:1; padding:12px 12px 116px; }
[data-opt="MINI-1"] .grid { display:grid; grid-template-columns:repeat(8, minmax(0,1fr)); gap:10px; max-width:1416px; margin:0 auto; }
[data-opt="MINI-1"] .t { position:relative; display:flex; flex-direction:column; border:var(--sploot-border); border-radius:var(--sploot-radius-inner); background:var(--sploot-panel); box-shadow:var(--sploot-shadow-sm); }
[data-opt="MINI-1"] .tm { aspect-ratio:1; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:7px; background:var(--sploot-paper-warm); color:var(--sploot-ink); }
[data-opt="MINI-1"] .t:has(.ts) .tm { border-bottom-left-radius:0; border-bottom-right-radius:0; }
[data-opt="MINI-1"] .ts { border-top:var(--sploot-border-thin); border-radius:0 0 7px 7px; padding:3px 8px; background:var(--sploot-panel); font-family:var(--font-mono); font-size:0.6rem; font-weight:700; text-transform:lowercase; }
[data-opt="MINI-1"] .t-open { position:absolute; inset:-3px; z-index:1; border:0; border-radius:var(--sploot-radius-inner); background:transparent; cursor:pointer; }
[data-opt="MINI-1"] .st { position:absolute; top:-9px; right:7px; z-index:2; display:grid; place-items:center; width:20px; height:20px; border:var(--sploot-border-thin); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); box-shadow:0 2px 0 var(--sploot-shadow-color); pointer-events:none; }
[data-opt="MINI-1"] .st--heart { color:var(--sploot-magenta); }
[data-opt="MINI-1"] .st--check { background:var(--sploot-purple); color:var(--sploot-on-purple); }
[data-opt="MINI-1"] .t--match { z-index:2; outline:4px solid var(--sploot-lime); outline-offset:0; }
[data-opt="MINI-1"] .t--near { outline:3px dashed var(--sploot-orange); outline-offset:2px; }
[data-opt="MINI-1"] .t--sel { outline:4px solid var(--sploot-purple); outline-offset:0; }
[data-opt="MINI-1"] .t--dim { opacity:0.4; filter:saturate(0.2); }

[data-opt="MINI-1"] .ledger { position:fixed; left:0; right:0; bottom:0; z-index:30; display:flex; align-items:center; gap:16px; padding:10px 16px calc(10px + env(safe-area-inset-bottom)); background:var(--sploot-panel); border-top:var(--sploot-border); }
[data-opt="MINI-1"] .q { display:flex; align-items:center; gap:8px; flex:0 0 300px; min-height:40px; padding:4px 14px; border:var(--sploot-border-thin); border-radius:var(--sploot-radius-pill); background:var(--sploot-paper-warm); color:var(--sploot-ink); }
[data-opt="MINI-1"] .q input { flex:1; min-width:0; border:0; background:none; font:inherit; font-weight:700; color:var(--sploot-ink); }
[data-opt="MINI-1"] .piles { flex:1; display:flex; align-items:center; gap:4px; overflow-x:auto; }
[data-opt="MINI-1"] .pl { display:inline-flex; align-items:center; gap:6px; border:0; background:none; padding:6px 8px; border-radius:var(--sploot-radius-pill); color:var(--sploot-ink); font-weight:700; font-size:0.78rem; text-transform:lowercase; text-decoration:underline; text-decoration-thickness:2px; text-underline-offset:3px; white-space:nowrap; }
[data-opt="MINI-1"] .pl small { font-family:var(--font-mono); font-size:0.62rem; font-weight:400; opacity:0.7; font-variant-numeric:tabular-nums; }
[data-opt="MINI-1"] .pl:hover { background:var(--sploot-yellow); color:#1c1547; text-decoration:none; }
[data-opt="MINI-1"] .pl--on { background:var(--sploot-void); color:var(--sploot-on-void); border:var(--sploot-border-thin); padding:4px 12px; text-decoration:none; }
[data-opt="MINI-1"] .pl--on:hover { background:var(--sploot-void); color:var(--sploot-on-void); }
[data-opt="MINI-1"] .ct { font-family:var(--font-mono); font-size:0.66rem; font-variant-numeric:tabular-nums; white-space:nowrap; opacity:0.85; }
[data-opt="MINI-1"] .minis { display:flex; gap:8px; }
[data-opt="MINI-1"] .line { flex:1; min-width:0; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
[data-opt="MINI-1"] .bulk { flex:1; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
[data-opt="MINI-1"] .bact { display:inline-flex; align-items:center; gap:8px; min-height:40px; padding:6px 16px; border:var(--sploot-border-thin); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); color:var(--sploot-ink); font-weight:700; text-transform:lowercase; box-shadow:var(--sploot-shadow-sm); }
[data-opt="MINI-1"] .bact svg { width:16px; height:16px; }

[data-opt="MINI-1"] .blank { max-width:560px; margin:9dvh auto 0; display:flex; flex-direction:column; gap:14px; align-items:center; text-align:center; }
[data-opt="MINI-1"] .blank h2 { margin:0; font-size:1.7rem; }
[data-opt="MINI-1"] .blank p { margin:0; font-weight:700; }
[data-opt="MINI-1"] .ghostrow { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; width:100%; }
[data-opt="MINI-1"] .ghost { aspect-ratio:1; border:2px dashed var(--sploot-ink); border-radius:var(--sploot-radius-inner); opacity:0.45; }
[data-opt="MINI-1"] .steps { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:6px; font-size:0.85rem; font-weight:700; text-align:left; }
[data-opt="MINI-1"] .steps b { font-family:var(--font-mono); font-weight:700; margin-right:8px; opacity:0.6; }
[data-opt="MINI-1"] .tryrow { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; align-items:center; }

[data-opt="MINI-1"] .room { min-height:100dvh; display:flex; flex-direction:column; padding:18px 18px 44px; }
[data-opt="MINI-1"] .room-top { display:flex; justify-content:flex-end; align-items:center; gap:10px; }
[data-opt="MINI-1"] .esc { padding:3px 10px; border:var(--sploot-border-thin); border-radius:var(--sploot-radius-pill); font-family:var(--font-mono); font-size:0.62rem; }
[data-opt="MINI-1"] .room-fig { margin:auto; display:flex; flex-direction:column; align-items:center; gap:18px; width:100%; max-width:600px; }
[data-opt="MINI-1"] .frame { width:100%; border:var(--sploot-border); border-radius:var(--sploot-radius); overflow:hidden; background:var(--sploot-panel); box-shadow:var(--sploot-shadow-lg); }
[data-opt="MINI-1"] .frame > div { display:flex; align-items:center; justify-content:center; padding:44px; background:var(--sploot-paper-warm); color:var(--sploot-ink); }
[data-opt="MINI-1"] .placard { width:100%; border:var(--sploot-border-thin); border-radius:var(--sploot-radius-inner); background:var(--sploot-panel); padding:14px 16px; }
[data-opt="MINI-1"] .placard .cap { margin:0 0 10px; font-weight:700; }
[data-opt="MINI-1"] .placard dl { display:grid; grid-template-columns:auto 1fr; gap:4px 16px; margin:0 0 12px; font-size:0.72rem; }
[data-opt="MINI-1"] .placard dt { font-family:var(--font-mono); opacity:0.65; }
[data-opt="MINI-1"] .placard dd { margin:0; font-weight:700; }
[data-opt="MINI-1"] .acts { display:flex; gap:8px; border-top:2px dashed var(--sploot-ink); padding-top:10px; }

@media (max-width: 767px) {
  [data-opt="MINI-1"] .wall { padding:8px 8px 170px; }
  [data-opt="MINI-1"] .grid { grid-template-columns:repeat(3, minmax(0,1fr)); gap:6px; }
  [data-opt="MINI-1"] .ledger { flex-wrap:wrap; gap:8px; padding:8px 10px calc(10px + env(safe-area-inset-bottom)); }
  [data-opt="MINI-1"] .piles { order:-1; flex:1 1 100%; }
  [data-opt="MINI-1"] .pl { min-height:44px; }
  [data-opt="MINI-1"] .q { flex:1 1 auto; min-height:44px; }
  [data-opt="MINI-1"] .ct { display:none; }
  [data-opt="MINI-1"] .minis .sploot-ctl { width:44px; height:44px; }
  [data-opt="MINI-1"] .bact { min-height:44px; }
  [data-opt="MINI-1"] .ghostrow { grid-template-columns:repeat(3,1fr); }
  [data-opt="MINI-1"] .frame > div { padding:20px; }
}
</style>`;

function tile1(m, st, mode) {
  const cls = ['t', 'sploot-press-sm'];
  if (st === 'match') cls.push('t--match');
  if (st === 'near') cls.push('t--near');
  if (st === 'dim') cls.push('t--dim');
  if (st === 'selected') cls.push('t--sel');
  const bar = st === 'match' || st === 'near'
    ? `<div class="ts">${st} ${pct(m.score)}</div>`
    : '';
  const btn = mode === 'select'
    ? `<button class="t-open" aria-pressed="${st === 'selected'}" aria-label="select: ${m.cap}"></button>`
    : `<button class="t-open" aria-label="open: ${m.cap}"></button>`;
  const heart = m.banger ? `<span class="st st--heart" aria-hidden="true">${LAB.icon('heartFill', 11)}</span>` : '';
  const check = st === 'selected' ? `<span class="st st--check" aria-hidden="true">${LAB.icon('check', 11)}</span>` : '';
  return `<article class="${cls.join(' ')}" data-id="${m.id}">
    <div class="tm">${LAB.doodle(m.kind, { label: m.cap, size: '58%' })}</div>
    ${bar}${btn}${check || heart}
  </article>`;
}

function grid1(items, stateOf, mode) {
  return `<div class="grid">${items.map((m) => tile1(m, stateOf(m), mode)).join('')}</div>`;
}

function ledger1(opts = {}) {
  const s = LAB.stats;
  const search = `
    <div class="q">${LAB.icon('search', 16)}<input value="${opts.query || ''}" placeholder="type words. get the picture." aria-label="search the pile" /></div>`;
  const minis = `
    <div class="minis">
      <button class="sploot-ctl" aria-label="upload">${LAB.icon('upload')}</button>
      <button class="sploot-ctl" aria-label="shuffle the pile">${LAB.icon('shuffle')}</button>
    </div>`;
  if (opts.bulk) {
    return `<footer class="ledger" aria-label="selection commands">
      <span class="ct">3 selected · 48 on the wall</span>
      <div class="bulk">
        <button class="bact sploot-press-sm">${LAB.icon('heart')} make bangers</button>
        <button class="bact sploot-press-sm">${LAB.icon('share')} share</button>
        <button class="bact sploot-press-sm">${LAB.icon('trash')} trash</button>
        <button class="bact sploot-press-sm">${LAB.icon('x')} clear</button>
      </div>
    </footer>`;
  }
  const piles = opts.noPiles
    ? `<span class="line" style="opacity:0.7;">no piles yet. the machine needs material.</span>`
    : `<div class="piles" role="group" aria-label="pile filters">
        <button class="pl pl--on" aria-pressed="true">all <small>${s.total}</small></button>
        <button class="pl" aria-pressed="false">${LAB.icon('heart', 12)} bangers</button>
        ${LAB.piles.map((p) => `<button class="pl" aria-pressed="false">${p.conf < 0.56 ? 'maybe ' : ''}${p.label} <small>${p.count}</small></button>`).join('')}
      </div>`;
  const mid = opts.line
    ? `<span class="line ${opts.pulse ? 'animate-sploot-pulse' : ''}">${opts.line}</span>`
    : piles;
  return `<footer class="ledger" aria-label="library commands">
    ${search}${mid}<span class="ct sploot-tabular">${opts.count}</span>${minis}
  </footer>`;
}

function render1(state) {
  const C = LAB.corpus;
  const s = LAB.stats;
  let body = '';
  let ledger = '';

  if (state === 'browse') {
    body = grid1(C, () => 'default');
    ledger = ledger1({ count: `48 on the wall · ${s.total} in the pile · ${s.queue} in queue` });
  } else if (state === 'searching') {
    body = grid1(C, () => 'dim');
    ledger = ledger1({
      query: LAB.query,
      line: `checking ${s.embedded} embedded memes against "${LAB.query}"`,
      pulse: true,
      count: `searching · ${s.total} in the pile`,
    });
  } else if (state === 'results') {
    body = grid1(ranked(), (m) => m.role || 'dim');
    ledger = ledger1({
      query: LAB.query,
      line: `1 match · 3 near · the other 44 recede`,
      count: `4 hits · ${s.total} in the pile`,
    });
  } else if (state === 'zero') {
    body = `<div class="blank">
      <h2 class="display">nothing matches.</h2>
      <p>"${LAB.zeroQuery}" is not in the pile. the machine checked all ${s.total}.</p>
      <div class="tryrow">
        <span class="ct">try</span>
        <button class="pl">cat vibrating at 3am</button>
        <button class="pl">frog wisdom</button>
        <button class="bact sploot-press-sm">${LAB.icon('x')} clear search</button>
      </div>
    </div>`;
    ledger = ledger1({ query: LAB.zeroQuery, line: 'zero hits. the wall stays blank on purpose.', count: `0 hits · ${s.total} in the pile` });
  } else if (state === 'empty') {
    body = `<div class="blank">
      <div class="ghostrow" aria-hidden="true"><span class="ghost"></span><span class="ghost"></span><span class="ghost"></span><span class="ghost"></span></div>
      <h2 class="display">blank wall.</h2>
      <p>the pile is empty. save one thing and the machine starts sorting.</p>
      <ol class="steps">
        <li><b>01</b>hit upload, or drag an image anywhere on this page</li>
        <li><b>02</b>the extension saves straight from any tab</li>
        <li><b>03</b>type words later. get the picture back.</li>
      </ol>
      <button class="btn btn--blue sploot-press">${LAB.icon('upload')} upload the first meme</button>
    </div>`;
    ledger = ledger1({ noPiles: true, count: `0 on the wall · 0 in the pile` });
  } else if (state === 'selected') {
    body = grid1(C, (m) => ([0, 5, 9].includes(m.id) ? 'selected' : 'default'), 'select');
    ledger = ledger1({ bulk: true });
  } else if (state === 'detail') {
    const m = C[0];
    return `<div class="opt" data-opt="MINI-1">${CSS1}
      <section class="room bg-sploot-workbench" role="dialog" aria-modal="true" aria-label="meme detail: ${m.cap}">
        <header class="room-top">
          <span class="esc">esc closes</span>
          <button class="sploot-ctl" aria-label="close detail">${LAB.icon('x')}</button>
        </header>
        <figure class="room-fig" style="margin:auto;">
          <div class="frame"><div>${LAB.doodle(m.kind, { label: m.cap, size: '260' })}</div></div>
          <figcaption class="placard">
            <p class="cap">${m.cap}</p>
            <dl>
              <dt>file</dt><dd>${m.file}</dd>
              <dt>vector</dt><dd>${m.index}</dd>
              <dt>kind</dt><dd>${m.kind}</dd>
              <dt>embedded</dt><dd>yes · scorer clip</dd>
            </dl>
            <div class="acts">
              <button class="sploot-ctl" aria-label="banger" aria-pressed="${m.banger}">${LAB.icon(m.banger ? 'heartFill' : 'heart')}</button>
              <button class="sploot-ctl" aria-label="share">${LAB.icon('share')}</button>
              <button class="sploot-ctl" aria-label="trash">${LAB.icon('trash')}</button>
            </div>
          </figcaption>
        </figure>
      </section>
    </div>`;
  }

  return `<div class="opt" data-opt="MINI-1">${CSS1}
    <main class="wall bg-sploot-workbench" aria-label="the pile">${body}</main>
    ${ledger}
  </div>`;
}

/* =====================================================================
   MINI-2 · margin catalog
   ===================================================================== */

const CSS2 = `
<style>
[data-opt="MINI-2"] { display:flex; min-height:100dvh; background:var(--sploot-paper); }
[data-opt="MINI-2"] .mgn { flex:0 0 236px; position:sticky; top:0; max-height:100dvh; overflow:auto; display:flex; flex-direction:column; gap:16px; padding:22px 18px; border-right:var(--sploot-border); background:var(--sploot-panel); }
[data-opt="MINI-2"] .wm { margin:0; font-family:var(--font-display); font-size:1.05rem; }
[data-opt="MINI-2"] .sub { margin:-10px 0 0; font-family:var(--font-mono); font-size:0.6rem; opacity:0.6; }
[data-opt="MINI-2"] .q2 { display:flex; align-items:center; gap:8px; min-height:40px; padding:4px 12px; border:var(--sploot-border-thin); border-radius:var(--sploot-radius-pill); background:var(--sploot-paper-warm); color:var(--sploot-ink); }
[data-opt="MINI-2"] .q2 input { flex:1; min-width:0; border:0; background:none; font:inherit; font-weight:700; font-size:0.82rem; color:var(--sploot-ink); }
[data-opt="MINI-2"] .mgn nav { display:flex; flex-direction:column; gap:2px; }
[data-opt="MINI-2"] .nv { display:flex; align-items:baseline; justify-content:space-between; gap:8px; width:100%; border:0; background:none; padding:7px 8px; border-radius:var(--sploot-radius-ctl); color:var(--sploot-ink); font-weight:700; font-size:0.82rem; text-align:left; text-transform:lowercase; }
[data-opt="MINI-2"] .nv small { font-family:var(--font-mono); font-size:0.62rem; font-weight:400; opacity:0.7; font-variant-numeric:tabular-nums; }
[data-opt="MINI-2"] .nv:hover { background:var(--sploot-paper-warm); }
[data-opt="MINI-2"] .nv--on { background:var(--sploot-yellow); color:#1c1547; }
[data-opt="MINI-2"] .nv--on:hover { background:var(--sploot-yellow); }
[data-opt="MINI-2"] .nv--on small { opacity:0.75; }
[data-opt="MINI-2"] .nvh { margin:12px 0 2px; font-family:var(--font-mono); font-size:0.6rem; opacity:0.6; }
[data-opt="MINI-2"] .mact { display:flex; gap:8px; }
[data-opt="MINI-2"] .sbtn { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:38px; border:var(--sploot-border-thin); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); color:var(--sploot-ink); font-weight:700; font-size:0.78rem; text-transform:lowercase; box-shadow:var(--sploot-shadow-sm); }
[data-opt="MINI-2"] .sbtn svg { width:15px; height:15px; }
[data-opt="MINI-2"] .mstats { margin-top:auto; border-top:2px dashed var(--sploot-ink); padding-top:12px; }
[data-opt="MINI-2"] .mstats dl { display:grid; grid-template-columns:1fr auto; gap:3px 10px; margin:0; font-family:var(--font-mono); font-size:0.62rem; font-variant-numeric:tabular-nums; }
[data-opt="MINI-2"] .mstats dt { opacity:0.65; }
[data-opt="MINI-2"] .mstats dd { margin:0; text-align:right; }

[data-opt="MINI-2"] .main2 { flex:1; min-width:0; padding:20px 22px 90px; }
[data-opt="MINI-2"] .lede { max-width:1160px; margin:0 auto 14px; font-family:var(--font-mono); font-size:0.7rem; font-weight:700; opacity:0.85; }
[data-opt="MINI-2"] .mas { max-width:1160px; margin:0 auto; columns:5; column-gap:16px; }
[data-opt="MINI-2"] .f { break-inside:avoid; margin:0 0 18px; }
[data-opt="MINI-2"] .ff { position:relative; border:var(--sploot-border); border-radius:var(--sploot-radius); background:var(--sploot-panel); box-shadow:var(--sploot-shadow-sm); }
[data-opt="MINI-2"] .fm { display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:15px; background:var(--sploot-paper-warm); color:var(--sploot-ink); }
[data-opt="MINI-2"] .ff:has(.fs) .fm { border-bottom-left-radius:0; border-bottom-right-radius:0; }
[data-opt="MINI-2"] .fs { border-top:var(--sploot-border-thin); border-radius:0 0 15px 15px; padding:3px 10px; background:var(--sploot-panel); font-family:var(--font-mono); font-size:0.6rem; font-weight:700; text-transform:lowercase; }
[data-opt="MINI-2"] .f-open { position:absolute; inset:-3px; z-index:1; border:0; border-radius:var(--sploot-radius); background:transparent; cursor:pointer; }
[data-opt="MINI-2"] .st { position:absolute; top:-9px; right:9px; z-index:2; display:grid; place-items:center; width:20px; height:20px; border:var(--sploot-border-thin); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); box-shadow:0 2px 0 var(--sploot-shadow-color); pointer-events:none; }
[data-opt="MINI-2"] .st--heart { color:var(--sploot-magenta); }
[data-opt="MINI-2"] .st--check { background:var(--sploot-purple); color:var(--sploot-on-purple); }
[data-opt="MINI-2"] .ff--match { z-index:2; outline:4px solid var(--sploot-lime); outline-offset:0; }
[data-opt="MINI-2"] .ff--near { outline:3px dashed var(--sploot-orange); outline-offset:2px; }
[data-opt="MINI-2"] .ff--sel { outline:4px solid var(--sploot-purple); outline-offset:0; }
[data-opt="MINI-2"] .f--dim { opacity:0.4; filter:saturate(0.2); }
[data-opt="MINI-2"] .fc { margin:7px 4px 0; font-family:var(--font-mono); font-size:0.63rem; line-height:1.4; opacity:0.85; text-transform:lowercase; }

[data-opt="MINI-2"] .bulk2 { position:fixed; left:50%; transform:translateX(-50%); bottom:calc(14px + env(safe-area-inset-bottom)); z-index:40; display:flex; align-items:center; gap:10px; padding:8px 14px; border:var(--sploot-border); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); box-shadow:var(--sploot-shadow); }
[data-opt="MINI-2"] .bulk2 .ct2 { font-family:var(--font-mono); font-size:0.66rem; font-weight:700; white-space:nowrap; font-variant-numeric:tabular-nums; }

[data-opt="MINI-2"] .blank2 { max-width:520px; margin:10dvh auto 0; display:flex; flex-direction:column; gap:14px; align-items:flex-start; }
[data-opt="MINI-2"] .blank2 h2 { margin:0; font-size:1.7rem; }
[data-opt="MINI-2"] .blank2 p { margin:0; font-weight:700; }
[data-opt="MINI-2"] .steps2 { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:6px; font-size:0.85rem; font-weight:700; }
[data-opt="MINI-2"] .steps2 b { font-family:var(--font-mono); margin-right:8px; opacity:0.6; }
[data-opt="MINI-2"] .ghostrow2 { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; width:100%; }
[data-opt="MINI-2"] .ghost2 { aspect-ratio:1; border:2px dashed var(--sploot-ink); border-radius:var(--sploot-radius-inner); opacity:0.45; }
[data-opt="MINI-2"] .tl { border:0; background:none; padding:4px 2px; color:var(--sploot-ink); font-weight:700; font-size:0.82rem; text-transform:lowercase; text-decoration:underline; text-decoration-thickness:2px; text-underline-offset:3px; }
[data-opt="MINI-2"] .tl:hover { background:var(--sploot-yellow); color:#1c1547; text-decoration:none; }

[data-opt="MINI-2"] .plate { flex:1; min-height:100dvh; display:flex; flex-direction:column; padding:16px 20px 28px; background:var(--sploot-panel); }
[data-opt="MINI-2"] .plate-top { display:flex; align-items:center; gap:12px; }
[data-opt="MINI-2"] .back { display:inline-flex; align-items:center; gap:8px; border:0; background:none; padding:6px 4px; color:var(--sploot-ink); font-weight:700; text-transform:lowercase; text-decoration:underline; text-decoration-thickness:2px; text-underline-offset:3px; }
[data-opt="MINI-2"] .plate-top .num { flex:1; text-align:center; font-family:var(--font-mono); font-size:0.66rem; opacity:0.75; }
[data-opt="MINI-2"] .esc2 { padding:3px 10px; border:var(--sploot-border-thin); border-radius:var(--sploot-radius-pill); font-family:var(--font-mono); font-size:0.62rem; }
[data-opt="MINI-2"] .spread { flex:1; display:grid; grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr); gap:32px; align-items:center; width:100%; max-width:1160px; margin:0 auto; padding:24px 0; }
[data-opt="MINI-2"] .pfr { display:flex; align-items:center; justify-content:center; padding:44px; border:var(--sploot-border); border-radius:var(--sploot-radius); background:var(--sploot-paper-warm); color:var(--sploot-ink); box-shadow:var(--sploot-shadow-lg); }
[data-opt="MINI-2"] .pside .cap { margin:0 0 12px; font-weight:700; font-size:1.05rem; }
[data-opt="MINI-2"] .pside dl { display:grid; grid-template-columns:auto 1fr; gap:4px 16px; margin:0 0 14px; font-size:0.72rem; }
[data-opt="MINI-2"] .pside dt { font-family:var(--font-mono); opacity:0.65; }
[data-opt="MINI-2"] .pside dd { margin:0; font-weight:700; }
[data-opt="MINI-2"] .pacts { display:flex; gap:8px; border-top:2px dashed var(--sploot-ink); padding-top:12px; }
[data-opt="MINI-2"] .pager { display:flex; align-items:center; gap:10px; margin-top:16px; }
[data-opt="MINI-2"] .pager span { font-family:var(--font-mono); font-size:0.64rem; opacity:0.75; }

[data-opt="MINI-2"] .mbar { display:none; }

@media (max-width: 767px) {
  [data-opt="MINI-2"] { flex-direction:column; }
  [data-opt="MINI-2"] .mgn { position:static; flex:none; max-height:none; flex-direction:row; flex-wrap:wrap; align-items:center; gap:8px; padding:12px 14px; border-right:0; border-bottom:var(--sploot-border); }
  [data-opt="MINI-2"] .mgn .q2, [data-opt="MINI-2"] .mact, [data-opt="MINI-2"] .mstats, [data-opt="MINI-2"] .nvh, [data-opt="MINI-2"] .sub { display:none; }
  [data-opt="MINI-2"] .mgn nav { flex:1 1 100%; flex-direction:row; overflow-x:auto; gap:2px; }
  [data-opt="MINI-2"] .nv { width:auto; align-items:center; white-space:nowrap; min-height:44px; }
  [data-opt="MINI-2"] .main2 { padding:14px 12px 120px; }
  [data-opt="MINI-2"] .mas { columns:2; column-gap:10px; }
  [data-opt="MINI-2"] .f { margin-bottom:12px; }
  [data-opt="MINI-2"] .mbar { display:flex; position:fixed; left:10px; right:10px; bottom:calc(10px + env(safe-area-inset-bottom)); z-index:40; align-items:center; gap:8px; padding:8px 10px; border:var(--sploot-border); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); box-shadow:var(--sploot-shadow); }
  [data-opt="MINI-2"] .mbar .q2 { display:flex; flex:1; min-height:44px; }
  [data-opt="MINI-2"] .mbar .sploot-ctl { width:44px; height:44px; flex:none; }
  [data-opt="MINI-2"] .bulk2 { left:10px; right:10px; transform:none; justify-content:space-between; }
  [data-opt="MINI-2"] .bulk2 .sploot-ctl { width:44px; height:44px; }
  [data-opt="MINI-2"] .spread { grid-template-columns:1fr; gap:18px; align-items:start; }
  [data-opt="MINI-2"] .pfr { padding:20px; }
  [data-opt="MINI-2"] .ghostrow2 { grid-template-columns:repeat(3,1fr); }
}
</style>`;

function plate2(m, st, mode) {
  const ffCls = ['ff', 'sploot-press-sm'];
  if (st === 'match') ffCls.push('ff--match');
  if (st === 'near') ffCls.push('ff--near');
  if (st === 'selected') ffCls.push('ff--sel');
  const fCls = ['f'];
  if (st === 'dim') fCls.push('f--dim');
  const strip = st === 'match' || st === 'near'
    ? `<div class="fs">${st} ${pct(m.score)}</div>`
    : '';
  const btn = mode === 'select'
    ? `<button class="f-open" aria-pressed="${st === 'selected'}" aria-label="select: ${m.cap}"></button>`
    : `<button class="f-open" aria-label="open: ${m.cap}"></button>`;
  const heart = m.banger ? `<span class="st st--heart" aria-hidden="true">${LAB.icon('heartFill', 11)}</span>` : '';
  const check = st === 'selected' ? `<span class="st st--check" aria-hidden="true">${LAB.icon('check', 11)}</span>` : '';
  return `<figure class="${fCls.join(' ')}" data-id="${m.id}">
    <div class="${ffCls.join(' ')}">
      <div class="fm" style="aspect-ratio:${m.aspect};">${LAB.doodle(m.kind, { label: m.cap, size: '55%' })}</div>
      ${strip}${btn}${check || heart}
    </div>
    <figcaption class="fc">${m.cap}</figcaption>
  </figure>`;
}

function mas2(items, stateOf, mode) {
  return `<div class="mas">${items.map((m) => plate2(m, stateOf(m), mode)).join('')}</div>`;
}

function margin2(opts = {}) {
  const s = LAB.stats;
  const total = opts.empty ? 0 : s.total;
  const piles = opts.empty
    ? `<p class="nvh">no piles yet. the machine needs material.</p>`
    : `<p class="nvh">piles the machine made</p>
      ${LAB.piles.map((p) => `<button class="nv" aria-pressed="false"><span>${p.conf < 0.56 ? 'maybe ' : ''}${p.label}</span><small>${p.count}</small></button>`).join('')}`;
  return `<aside class="mgn" aria-label="library margin">
    <h1 class="wm">sploot</h1>
    <p class="sub">no folders. just vibes.</p>
    <div class="q2">${LAB.icon('search', 15)}<input value="${opts.query || ''}" placeholder="type words" aria-label="search the pile" /></div>
    <nav aria-label="filters">
      <button class="nv ${opts.empty ? '' : 'nv--on'}" aria-pressed="${!opts.empty}"><span>the pile</span><small>${total}</small></button>
      <button class="nv" aria-pressed="false"><span>bangers ${LAB.icon('heart', 12)}</span></button>
      ${piles}
    </nav>
    <div class="mact">
      <button class="sbtn sploot-press-sm">${LAB.icon('upload')} upload</button>
      <button class="sbtn sploot-press-sm">${LAB.icon('shuffle')} shuffle</button>
      <button class="sbtn sploot-press-sm" aria-pressed="${!!opts.selecting}">${LAB.icon('check')} select</button>
    </div>
    <div class="mstats">
      <dl aria-label="machine stats">
        <dt>memes</dt><dd>${total}</dd>
        <dt>embedded</dt><dd>${opts.empty ? 0 : s.embedded}</dd>
        <dt>queue</dt><dd>${opts.empty ? 0 : s.queue}</dd>
        <dt>storage</dt><dd>${opts.empty ? '0 gb' : s.storage}</dd>
        <dt>scorer</dt><dd>clip</dd>
      </dl>
    </div>
  </aside>`;
}

function mbar2(opts = {}) {
  return `<nav class="mbar" aria-label="commands">
    <div class="q2">${LAB.icon('search', 15)}<input value="${opts.query || ''}" placeholder="type words" aria-label="search the pile" /></div>
    <button class="sploot-ctl" aria-label="upload">${LAB.icon('upload')}</button>
    <button class="sploot-ctl" aria-label="select">${LAB.icon('check')}</button>
  </nav>`;
}

function render2(state) {
  const C = LAB.corpus;
  const s = LAB.stats;

  if (state === 'detail') {
    const m = C[0];
    return `<div class="opt" data-opt="MINI-2">${CSS2}
      <section class="plate" role="dialog" aria-modal="true" aria-label="plate: ${m.cap}">
        <header class="plate-top">
          <button class="back">${LAB.icon('arrowL', 15)} back to the pile</button>
          <span class="num sploot-tabular">plate 001 of ${s.total}</span>
          <span class="esc2">esc closes</span>
          <button class="sploot-ctl" aria-label="close plate">${LAB.icon('x')}</button>
        </header>
        <div class="spread">
          <div class="pfr">${LAB.doodle(m.kind, { label: m.cap, size: '300' })}</div>
          <div class="pside">
            <p class="cap">${m.cap}</p>
            <dl>
              <dt>file</dt><dd>${m.file}</dd>
              <dt>vector</dt><dd>${m.index}</dd>
              <dt>kind</dt><dd>${m.kind}</dd>
              <dt>match</dt><dd>${pct(m.score)} for "${LAB.query}"</dd>
              <dt>embedded</dt><dd>yes · scorer clip</dd>
            </dl>
            <div class="pacts">
              <button class="sploot-ctl" aria-label="banger" aria-pressed="${m.banger}">${LAB.icon(m.banger ? 'heartFill' : 'heart')}</button>
              <button class="sploot-ctl" aria-label="share">${LAB.icon('share')}</button>
              <button class="sploot-ctl" aria-label="copy link">${LAB.icon('link')}</button>
              <button class="sploot-ctl" aria-label="trash">${LAB.icon('trash')}</button>
            </div>
            <div class="pager">
              <button class="sploot-ctl" aria-label="previous plate">${LAB.icon('arrowL')}</button>
              <button class="sploot-ctl" aria-label="next plate">${LAB.icon('arrowR')}</button>
              <span>flip through the pile</span>
            </div>
          </div>
        </div>
      </section>
    </div>`;
  }

  let main = '';
  let mgn = margin2({});
  let extra = '';

  if (state === 'browse') {
    main = `<p class="lede sploot-tabular">showing 48 of ${s.total} in the pile · shuffled</p>${mas2(C, () => 'default')}`;
  } else if (state === 'searching') {
    mgn = margin2({ query: LAB.query });
    main = `<p class="lede animate-sploot-pulse">searching the pile for "${LAB.query}" · scoring ${s.embedded} embedded memes</p>${mas2(C, () => 'dim')}`;
    extra = mbar2({ query: LAB.query });
  } else if (state === 'results') {
    mgn = margin2({ query: LAB.query });
    main = `<p class="lede sploot-tabular">1 match · 3 near · out of ${s.total} in the pile. the rest recede.</p>${mas2(ranked(), (m) => m.role || 'dim')}`;
    extra = mbar2({ query: LAB.query });
  } else if (state === 'zero') {
    mgn = margin2({ query: LAB.zeroQuery });
    main = `<div class="blank2">
      <h2 class="display">zero hits.</h2>
      <p>the pile holds ${s.total} memes. "${LAB.zeroQuery}" is not one of them. respect.</p>
      <p style="opacity:0.75;">try fewer words, or different ones:</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button class="tl">cat vibrating at 3am</button>
        <button class="tl">frog wisdom</button>
        <button class="sbtn sploot-press-sm" style="flex:none;padding:0 16px;">${LAB.icon('x')} clear search</button>
      </div>
    </div>`;
    extra = mbar2({ query: LAB.zeroQuery });
  } else if (state === 'empty') {
    mgn = margin2({ empty: true });
    main = `<div class="blank2">
      <div class="ghostrow2" aria-hidden="true"><span class="ghost2"></span><span class="ghost2"></span><span class="ghost2"></span><span class="ghost2"></span></div>
      <h2 class="display">the catalog is empty.</h2>
      <p>save something and the machine starts the sorting. no folders required.</p>
      <ol class="steps2">
        <li><b>01</b>upload straight from the camera roll</li>
        <li><b>02</b>the extension grabs images from any tab</li>
        <li><b>03</b>embeddings happen on their own. then you type words.</li>
      </ol>
      <button class="btn btn--blue sploot-press">${LAB.icon('upload')} upload the first meme</button>
    </div>`;
  } else if (state === 'selected') {
    mgn = margin2({ selecting: true });
    main = `<p class="lede sploot-tabular">select mode · tap plates to pick them · 48 of ${s.total} shown</p>
      ${mas2(C, (m) => ([0, 5, 9].includes(m.id) ? 'selected' : 'default'), 'select')}`;
    extra = `<div class="bulk2" role="toolbar" aria-label="bulk actions">
      <span class="ct2">3 selected</span>
      <button class="sploot-ctl" aria-label="make bangers">${LAB.icon('heart')}</button>
      <button class="sploot-ctl" aria-label="share">${LAB.icon('share')}</button>
      <button class="sploot-ctl" aria-label="trash">${LAB.icon('trash')}</button>
      <button class="sploot-ctl" aria-label="clear selection">${LAB.icon('x')}</button>
    </div>`;
  }

  return `<div class="opt" data-opt="MINI-2">${CSS2}
    ${mgn}
    <main class="main2 bg-sploot-workbench" aria-label="the catalog">${main}</main>
    ${state === 'browse' || state === 'empty' || state === 'selected' ? mbar2({}) : ''}
    ${extra}
  </div>`;
}

/* ===================================================================== */

export const SPECS = {
  'MINI-1': {
    name: 'the bare wall',
    lane: 'mini',
    move: 'no chrome above the grid at all: bare uniform tiles from pixel zero; one bottom ledger line owns search, text filters, counts, and bulk actions',
    notes: 'deleted from baseline: the top command bar, candy filename tabs, per tile captions, tile action rails, and the pile chip rail. what earns the space: the ledger, a single fixed bottom line holding the search pill, piles as underlined text filters (active pile inverts to ink), the total versus shown count, and two ink minis. captions never render in the grid at all (the inversion); they live only in the detail placard. score bars appear inside match and near tiles only, as text ("match 91%"), so state is never color alone. banger heart is a small sticker straddling the frame edge, inside the card transform. loud budget: browse spends none, results spends it on the lime ring, empty spends it on the one blue upload button. text level filters are the philosophy call; hover gives them a flat banana highlight and focus uses the global ring. detail is a museum room replacing the grid: one specimen, shadow-lg frame, plain dl placard, dialog semantics with labeled close and a visible esc chip.',
    render(state) {
      return render1(state);
    },
  },
  'MINI-2': {
    name: 'margin catalog',
    lane: 'mini',
    move: 'book margin catalog: a quiet text filter column beside a masonry of framed plates with museum wall labels; detail is a paginated plate spread',
    notes: 'deleted from baseline: the top command bar, candy filename tabs, tile action rails, and the pile chip rail. kept one quiet mono wall label under each frame (the museum caption); all other text is on demand. filters are plain text rows in a left book margin; the active filter takes a banana highlight, which is the screen`s single loud moment. the margin bottom dl keeps the machine showing its work (memes, embedded, queue, storage, scorer). state markers (heart sticker, score strip, match and near rings) render inside the frame element so they obey the card transform law; the wall label below the frame is passive text and never a marker. detail is a book plate spread with pagination, back link, labeled close, and esc chip under dialog semantics. mobile folds the margin into a top pile row and moves search, upload, and select into a fixed 44px bottom bar; bulk actions dock as a floating pill.',
    render(state) {
      return render2(state);
    },
  },
};
