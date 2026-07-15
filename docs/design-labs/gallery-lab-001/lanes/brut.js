/* lanes/brut.js · structural brutalism, translated through the toybox.
   Brutalism here = STRUCTURE and machine honesty, never the dead slab skin:
   toybox radii, straight drops, 3px shells, Baloo chrome voice. The page
   admits it is a database. The machine's work (index, model, pipeline,
   latency) is a first-class visible layer printed in mono on toys. Ruled
   lines and fig labels organize every sheet like an engineering document.

   BRUT-1 "index spine": the machine console IS the app chrome. A left spine
   owns query + exposed retrieval pipeline + piles + index ledger; the grid
   is a full-bleed uniform square-plate contact sheet with no top bar at all.

   BRUT-2 "title block": the status bar inverts into the primary chrome, an
   engineering title-block masthead; the library is a ruled document of
   mixed-module registers; detail is a full plate page, not an overlay. */

const pct = (s) => `${Math.round(parseFloat(s || '0') * 100)}%`;

/* ---------- the exposed retrieval pipeline, shared model ----------
   phases: idle | run | done | zero. Each stage is a labeled cell. */
function stages(phase, S) {
  const P = (lbl, st, out) => ({ lbl, st, out });
  if (phase === 'run')
    return [
      P('tokenize', 'done', '5 tokens'),
      P('embed', 'done', '1 x 768'),
      P('cosine', 'run', `241 / ${S.embedded}`),
      P('return', 'wait', 'waiting'),
    ];
  if (phase === 'done')
    return [
      P('tokenize', 'done', '5 tokens'),
      P('embed', 'done', '1 x 768'),
      P('cosine', 'done', `${S.embedded} compared`),
      P('return', 'done', '4 hits · 38 ms'),
    ];
  if (phase === 'zero')
    return [
      P('tokenize', 'done', '3 tokens'),
      P('embed', 'done', '1 x 768'),
      P('cosine', 'done', `${S.embedded} compared`),
      P('return', 'zero', '0 hits · 41 ms'),
    ];
  return [
    P('tokenize', 'idle', 'awaiting query'),
    P('embed', 'idle', 'idle'),
    P('cosine', 'idle', 'idle'),
    P('return', 'idle', 'idle'),
  ];
}

/* ---------- shared tile: own builder so the open control is an explicit
   sibling of the actions, never a nested interactive. State markers render
   inside the article so they ride the card transform. ---------- */
function tile(m, o = {}) {
  const st = o.state || 'default';
  const cls = ['cell', 'tile'];
  if (['match', 'near', 'dim', 'selected'].includes(st)) cls.push('cell--' + st);
  if (o.openTile) cls.push('tile--open');
  const badge =
    st === 'match'
      ? `<span class="cell-badge animate-sploot-stamp">match ${pct(m.score)}</span>`
      : st === 'near'
        ? `<span class="cell-badge tag--near">near ${pct(m.score)}</span>`
        : st === 'selected'
          ? `<span class="cell-badge tag--sel">picked</span>`
          : o.openTile
            ? `<span class="cell-badge tag--open">open</span>`
            : '';
  const openBtn = `<button class="topen sploot-ctl" aria-label="open ${m.cap}">${LAB.icon('expand', 14)}</button>`;
  const tab = o.tab
    ? `<div class="cell-tab tone-${m.tone}"><span>${m.file}</span><span>${m.index}</span></div>`
    : '';
  const line = `${o.tab ? '' : `${m.index} · `}${m.kind}`;
  const meta = `<div class="tmeta"><div class="tmtxt"><p>${m.cap}</p><span class="mono tline">${line}${
    m.banger ? `<i class="bang">${LAB.icon('heartFill', 11)}</i>` : ''
  }</span></div>${o.openIn === 'meta' ? openBtn : ''}</div>`;
  return `<article class="${cls.join(' ')}" data-id="${m.id}" aria-label="${m.cap}">${badge}${tab}<div class="cell-media" style="aspect-ratio:${
    o.square ? '1 / 1' : m.aspect
  };">${LAB.doodle(m.kind, { label: m.cap, size: '52%' })}</div>${meta}</article>`;
}

/* mono spec table used by both detail concepts */
function specRows(rows) {
  return `<div class="spec mono">${rows
    .map((r) => `<div class="specrow"><span>${r[0]}</span><span>${r[1]}</span></div>`)
    .join('')}</div>`;
}

/* CSS shared by both options, stamped under each scope */
function commonCSS(id) {
  const s = `[data-opt="${id}"]`;
  return `
${s} .tile .cell-media{margin:6px;padding:10px;}
${s} .tile .cell-badge{left:8px;right:auto;}
${s} .tag--near{background:var(--sploot-orange);}
${s} .tag--sel{background:var(--sploot-purple);color:var(--sploot-on-purple);}
${s} .tag--open{background:var(--sploot-blue);color:var(--sploot-on-blue);}
${s} .tmeta{display:flex;align-items:center;gap:6px;padding:5px 8px;border-top:2px solid var(--sploot-ink);}
${s} .tmtxt{flex:1;min-width:0;}
${s} .tmtxt p{margin:0;font-size:0.66rem;font-weight:700;text-transform:lowercase;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
${s} .tline{display:flex;align-items:center;gap:4px;font-size:0.54rem;opacity:0.75;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;}
${s} .bang{display:inline-flex;color:var(--sploot-magenta);}
${s} .tile--open{outline:4px solid var(--sploot-blue);outline-offset:0;z-index:2;}
${s} .topen{flex-shrink:0;}
${s} .spec{border:2px solid var(--sploot-ink);border-radius:var(--sploot-radius-inner);overflow:hidden;background:var(--sploot-panel);}
${s} .specrow{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:6px 10px;font-size:0.62rem;font-variant-numeric:tabular-nums;}
${s} .specrow + .specrow{border-top:2px solid var(--sploot-ink);}
${s} .specrow span:first-child{font-weight:700;opacity:0.7;}
${s} .esc{display:inline-flex;align-items:center;gap:5px;font-size:0.58rem;opacity:0.9;white-space:nowrap;}
${s} .esc kbd{font-family:var(--font-mono);border:2px solid var(--sploot-ink);border-radius:var(--sploot-radius-ctl);padding:1px 7px;box-shadow:var(--sploot-sticker-shadow);}
${s} .scan{margin:12px 20px 0;font-size:0.62rem;font-weight:700;}
${s} .emptydoc{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:16px 20px 6px;}
${s} .estep{padding:18px;display:flex;flex-direction:column;gap:9px;align-items:flex-start;}
${s} .en{font-size:0.56rem;font-weight:700;opacity:0.7;}
${s} .eart{color:var(--sploot-ink);border:2px dashed var(--sploot-ink);border-radius:var(--sploot-radius-inner);padding:16px;display:grid;place-items:center;width:100%;background:var(--sploot-paper-warm);}
${s} .estep h3{margin:0;font-size:0.95rem;text-transform:lowercase;}
${s} .estep p{margin:0;font-size:0.72rem;line-height:1.45;}
${s} .ecta{display:flex;gap:10px;padding:8px 20px 26px;flex-wrap:wrap;}
${s} .zwrap{padding:14px 20px 6px;}
${s} .zcard{display:flex;gap:20px;padding:22px;align-items:center;max-width:720px;}
${s} .zart{flex-shrink:0;color:var(--sploot-ink);}
${s} .zcard h3{margin:0 0 6px;font-size:1.05rem;}
${s} .zcard p{margin:0 0 12px;font-size:0.78rem;line-height:1.45;}
${s} .zacts{display:flex;gap:8px;flex-wrap:wrap;}
@media (max-width:767px){
  ${s} .emptydoc{grid-template-columns:1fr;}
  ${s} .zcard{flex-direction:column;align-items:flex-start;}
  ${s} .topen{width:44px;height:44px;}
}`;
}

/* ================================================================
   BRUT-1 · index spine
   ================================================================ */
const CSS1 = `<style>
[data-opt="BRUT-1"]{display:flex;align-items:stretch;background:var(--sploot-paper);}
[data-opt="BRUT-1"] .spine{width:300px;flex-shrink:0;position:sticky;top:0;height:100dvh;overflow-y:auto;background:var(--sploot-panel);border-right:3px solid var(--sploot-ink);display:flex;flex-direction:column;}
[data-opt="BRUT-1"] .brand{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:14px 16px;border-bottom:3px solid var(--sploot-ink);}
[data-opt="BRUT-1"] .brand h1{margin:0;font-family:var(--font-display);font-weight:400;font-size:1.25rem;}
[data-opt="BRUT-1"] .mline{font-size:0.56rem;opacity:0.7;}
[data-opt="BRUT-1"] .sec{border-bottom:3px solid var(--sploot-ink);}
[data-opt="BRUT-1"] .sfig{display:flex;justify-content:space-between;gap:8px;margin:0;padding:9px 16px;font-size:0.58rem;font-weight:700;letter-spacing:0.05em;border-bottom:2px dashed var(--sploot-ink);}
[data-opt="BRUT-1"] .q{display:flex;align-items:center;gap:8px;margin:13px 14px;padding:6px 14px;min-height:44px;border:3px solid var(--sploot-ink);border-radius:var(--sploot-radius-pill);background:var(--sploot-paper-warm);box-shadow:var(--sploot-shadow-sm);}
[data-opt="BRUT-1"] .q input{flex:1;min-width:0;border:0;background:transparent;font:inherit;font-weight:700;color:var(--sploot-ink);}
[data-opt="BRUT-1"] .pipe{margin:0 14px 14px;border:2px solid var(--sploot-ink);border-radius:var(--sploot-radius-inner);overflow:hidden;background:var(--sploot-panel);font-family:var(--font-mono);}
[data-opt="BRUT-1"] .stage{display:flex;align-items:center;gap:8px;padding:7px 10px;font-size:0.6rem;}
[data-opt="BRUT-1"] .stage + .stage{border-top:2px solid var(--sploot-ink);}
[data-opt="BRUT-1"] .smk{width:15px;display:inline-flex;justify-content:center;}
[data-opt="BRUT-1"] .slbl{font-weight:700;width:60px;}
[data-opt="BRUT-1"] .sout{flex:1;text-align:right;opacity:0.8;font-variant-numeric:tabular-nums;}
[data-opt="BRUT-1"] .stage--idle,[data-opt="BRUT-1"] .stage--wait{opacity:0.45;}
[data-opt="BRUT-1"] .stage--run{background:var(--sploot-cyan);color:#1c1547;}
[data-opt="BRUT-1"] .stage--zero{background:var(--sploot-orange);color:#1c1547;}
[data-opt="BRUT-1"] .pilerow{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:40px;padding:6px 16px;border:0;background:transparent;color:var(--sploot-ink);text-align:left;font-weight:700;font-size:0.78rem;text-transform:lowercase;transition:background-color var(--sploot-motion-fast) var(--sploot-ease-out);}
[data-opt="BRUT-1"] .pilerow + .pilerow{border-top:2px solid var(--sploot-ink);}
[data-opt="BRUT-1"] .pilerow:hover{background:var(--sploot-yellow);color:#1c1547;}
[data-opt="BRUT-1"] .pilerow--on{background:var(--sploot-yellow);color:#1c1547;}
[data-opt="BRUT-1"] .pilerow .n{display:inline-flex;align-items:center;gap:5px;font-size:0.56rem;opacity:0.85;font-variant-numeric:tabular-nums;white-space:nowrap;}
[data-opt="BRUT-1"] .ledger{padding:6px 0 8px;}
[data-opt="BRUT-1"] .led{display:flex;justify-content:space-between;padding:5px 16px;font-size:0.64rem;}
[data-opt="BRUT-1"] .led b{font-variant-numeric:tabular-nums;}
[data-opt="BRUT-1"] .selist{list-style:none;margin:0;padding:6px 16px 2px;font-family:var(--font-mono);font-size:0.6rem;display:flex;flex-direction:column;gap:5px;}
[data-opt="BRUT-1"] .selist li{display:flex;align-items:center;gap:6px;}
[data-opt="BRUT-1"] .selcount{margin:0;padding:2px 16px 8px;font-size:0.56rem;opacity:0.7;}
[data-opt="BRUT-1"] .selacts{display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 14px;}
[data-opt="BRUT-1"] .selacts .btn{min-height:36px;padding:4px 12px;font-size:0.72rem;box-shadow:var(--sploot-shadow-sm);}
[data-opt="BRUT-1"] .spacts{display:flex;flex-direction:column;gap:10px;padding:14px 16px;margin-top:auto;}
[data-opt="BRUT-1"] .main{flex:1;min-width:0;padding-bottom:28px;}
[data-opt="BRUT-1"] .rulehead{display:flex;align-items:center;gap:10px;padding:15px 20px 0;}
[data-opt="BRUT-1"] .rf{font-size:0.58rem;font-weight:700;border:2px solid var(--sploot-ink);border-radius:var(--sploot-radius-pill);padding:2px 10px;background:var(--sploot-panel);white-space:nowrap;}
[data-opt="BRUT-1"] .rt{font-weight:700;font-size:0.9rem;text-transform:lowercase;white-space:nowrap;}
[data-opt="BRUT-1"] .rl{flex:1;border-top:3px solid var(--sploot-ink);}
[data-opt="BRUT-1"] .rc{font-size:0.58rem;font-variant-numeric:tabular-nums;opacity:0.85;white-space:nowrap;}
[data-opt="BRUT-1"] .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(156px,1fr));gap:13px;padding:14px 20px 8px;}
[data-opt="BRUT-1"] .grid--hits{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));}
[data-opt="BRUT-1"] .grid--beside{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));}
[data-opt="BRUT-1"] .topen{position:absolute;top:8px;right:8px;z-index:3;background:var(--sploot-panel);opacity:0;}
[data-opt="BRUT-1"] .tile:hover .topen,[data-opt="BRUT-1"] .topen:focus-visible{opacity:1;}
[data-opt="BRUT-1"] .split{display:grid;grid-template-columns:1fr 400px;align-items:start;}
[data-opt="BRUT-1"] .inspector{position:sticky;top:0;height:100dvh;overflow:auto;background:var(--sploot-panel);border-left:3px solid var(--sploot-ink);display:flex;flex-direction:column;gap:12px;padding:0 16px 16px;}
[data-opt="BRUT-1"] .ihead{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:12px 0;border-bottom:3px solid var(--sploot-ink);position:sticky;top:0;background:var(--sploot-panel);font-size:0.62rem;font-weight:700;z-index:2;}
[data-opt="BRUT-1"] .iplate{border:2px solid var(--sploot-ink);border-radius:var(--sploot-radius-inner);background:var(--sploot-paper-warm);display:grid;place-items:center;padding:22px;min-height:260px;color:var(--sploot-ink);}
[data-opt="BRUT-1"] .icap{margin:0;font-size:0.95rem;font-weight:700;text-transform:lowercase;}
[data-opt="BRUT-1"] .irail{display:flex;gap:8px;}
[data-opt="BRUT-1"] .inav{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:4px;}
[data-opt="BRUT-1"] .inav .btn{min-height:38px;padding:4px 14px;font-size:0.72rem;box-shadow:var(--sploot-shadow-sm);}
[data-opt="BRUT-1"] .inav .mono{font-size:0.6rem;font-variant-numeric:tabular-nums;}
[data-opt="BRUT-1"] .mdock{display:none;position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--sploot-void);color:var(--sploot-on-void);border-top:3px solid var(--sploot-ink);padding:7px 10px calc(9px + env(safe-area-inset-bottom));}
[data-opt="BRUT-1"] .mstat{font-size:0.56rem;padding:0 4px 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}
[data-opt="BRUT-1"] .mrow{display:flex;gap:7px;}
[data-opt="BRUT-1"] .mbtn{flex:1;min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:2px solid var(--sploot-ink);border-radius:var(--sploot-radius-pill);background:var(--sploot-panel);color:var(--sploot-ink);font-size:0.56rem;font-weight:700;text-transform:lowercase;}
[data-opt="BRUT-1"] .mbtn--blue{background:var(--sploot-blue);color:var(--sploot-on-blue);}
[data-opt="BRUT-1"] .mbtn--cyan{background:var(--sploot-cyan);color:#1c1547;}
[data-opt="BRUT-1"] .mbtn--red{background:var(--sploot-red);color:var(--sploot-on-red);}
${commonCSS('BRUT-1')}
@media (max-width:767px){
  [data-opt="BRUT-1"] .spine{display:none;}
  [data-opt="BRUT-1"] .main{padding-bottom:132px;}
  [data-opt="BRUT-1"] .grid,[data-opt="BRUT-1"] .grid--hits,[data-opt="BRUT-1"] .grid--beside{grid-template-columns:repeat(2,1fr);gap:10px;padding:10px 12px;}
  [data-opt="BRUT-1"] .rulehead{padding:12px 12px 0;flex-wrap:wrap;}
  [data-opt="BRUT-1"] .topen{opacity:1;}
  [data-opt="BRUT-1"] .mdock{display:block;}
  [data-opt="BRUT-1"] .split{display:block;}
  [data-opt="BRUT-1"] .inspector{position:fixed;inset:0;z-index:60;height:auto;border-left:0;padding:0 14px calc(20px + env(safe-area-inset-bottom));}
  [data-opt="BRUT-1"] .inspector .sploot-ctl{width:44px;height:44px;}
  [data-opt="BRUT-1"] .scan{margin:10px 12px 0;}
}
</style>`;

function b1Spine(o) {
  const S = o.stats;
  const stgs = stages(o.phase, S)
    .map(
      (st) => `<div class="stage stage--${st.st}${st.st === 'run' ? ' animate-sploot-pulse' : ''}">
        <span class="smk">${
          st.st === 'done' ? LAB.icon('check', 11) : st.st === 'zero' ? LAB.icon('x', 11) : st.st === 'run' ? '&gt;' : '·'
        }</span>
        <span class="slbl">${st.lbl}</span><span class="sout">${st.out}</span>
      </div>`
    )
    .join('');
  const piles = LAB.piles
    .map(
      (p) => `<button class="pilerow"><span>${p.conf < 0.56 ? 'maybe ' : ''}${p.label}</span><span class="n mono">${p.count} in pile</span></button>`
    )
    .join('');
  const sel = o.selected
    ? `<section class="sec">
        <h2 class="sfig mono"><span>fig.04</span><span>selection</span></h2>
        <ul class="selist">${o.selected.map((m) => `<li>${LAB.icon('check', 10)} ${m.file}</li>`).join('')}</ul>
        <p class="selcount mono">${o.selected.length} picked · ${S.total - o.selected.length} not</p>
        <div class="selacts">
          <button class="btn sploot-press-sm">${LAB.icon('heart', 15)} heart all</button>
          <button class="btn sploot-press-sm">${LAB.icon('share', 15)} share</button>
          <button class="btn btn--red sploot-press-sm">${LAB.icon('trash', 15)} trash ${o.selected.length}</button>
          <button class="btn sploot-press-sm">${LAB.icon('x', 15)} clear</button>
        </div>
      </section>`
    : '';
  return `<aside class="spine" aria-label="machine console">
    <div class="brand"><h1>sploot</h1><span class="mline mono">/app · clip-vit-b32</span></div>
    <section class="sec">
      <h2 class="sfig mono"><span>fig.01</span><span>query console</span></h2>
      <div class="q">${LAB.icon('search', 16)}<input value="${o.query || ''}" placeholder="type words. get the picture." aria-label="search the pile" /></div>
      <div class="pipe" aria-label="retrieval pipeline">${stgs}</div>
    </section>
    <section class="sec">
      <h2 class="sfig mono"><span>fig.02</span><span>piles</span></h2>
      <button class="pilerow pilerow--on" aria-pressed="true"><span>all memes</span><span class="n mono">${LAB.icon('check', 10)} ${S.total} in library</span></button>
      ${piles}
    </section>
    <section class="sec">
      <h2 class="sfig mono"><span>fig.03</span><span>index</span></h2>
      <div class="ledger mono">
        <div class="led"><span>objects</span><b>${S.total}</b></div>
        <div class="led"><span>embedded</span><b>${S.embedded}</b></div>
        <div class="led"><span>queue</span><b>${S.queue}</b></div>
        <div class="led"><span>storage</span><b>${S.storage}</b></div>
      </div>
    </section>
    ${sel}
    <div class="spacts">
      <button class="btn btn--blue sploot-press">${LAB.icon('upload', 16)} upload chaos</button>
      <button class="btn sploot-press">${LAB.icon('shuffle', 16)} shuffle the pile</button>
    </div>
  </aside>`;
}

function b1Dock(o) {
  const b = (ic, l, cls = '') => `<button class="mbtn ${cls}">${LAB.icon(ic, 16)}<span>${l}</span></button>`;
  const row = o.bulk
    ? `${b('heart', 'heart all')}${b('share', 'share')}${b('trash', 'trash 3', 'mbtn--red')}${b('x', 'clear')}`
    : `${b('search', 'search', 'mbtn--cyan')}${b('filter', 'piles')}${b('upload', 'upload', 'mbtn--blue')}${b('shuffle', 'shuffle')}${b('check', 'select')}`;
  return `<nav class="mdock" aria-label="commands">
    <div class="mstat mono">${o.mline}</div>
    <div class="mrow">${row}</div>
  </nav>`;
}

function b1Rule(fig, title, count) {
  return `<div class="rulehead"><span class="rf mono">${fig}</span><span class="rt">${title}</span><span class="rl"></span><span class="rc mono">${count}</span></div>`;
}

function b1Inspector(m, S) {
  return `<aside class="inspector animate-sploot-slide-up" role="dialog" aria-modal="false" aria-label="record: ${m.cap}">
    <header class="ihead">
      <span class="mono">record · ${m.index}</span>
      <span class="esc mono"><kbd>esc</kbd> closes</span>
      <button class="sploot-ctl" aria-label="close record">${LAB.icon('x', 16)}</button>
    </header>
    <div class="iplate">${LAB.doodle(m.kind, { label: m.cap, size: '72%' })}</div>
    <p class="icap">${m.cap}</p>
    <div class="irail">
      <button class="sploot-ctl" aria-label="banger" aria-pressed="${m.banger}">${LAB.icon(m.banger ? 'heartFill' : 'heart')}</button>
      <button class="sploot-ctl" aria-label="share">${LAB.icon('share')}</button>
      <button class="sploot-ctl" aria-label="copy link">${LAB.icon('link')}</button>
      <button class="sploot-ctl" aria-label="trash">${LAB.icon('trash')}</button>
    </div>
    ${specRows([
      ['file', m.file],
      ['index', m.index],
      ['kind', m.kind],
      ['vector', '768 d · ready'],
      ['model', 'clip-vit-b32'],
      ['saved', '2026-06-30 03:12'],
      ['size', '412 kb'],
      ['last query', `match ${pct(m.score)} (cosine ${m.score})`],
    ])}
    <footer class="inav">
      <button class="btn sploot-press-sm">${LAB.icon('arrowL', 14)} prev</button>
      <span class="mono">1 / ${S.total}</span>
      <button class="btn sploot-press-sm">next ${LAB.icon('arrowR', 14)}</button>
    </footer>
  </aside>`;
}

function b1Render(state) {
  const C = LAB.corpus;
  const S = state === 'empty' ? { total: 0, embedded: 0, queue: 0, storage: '0 b' } : LAB.stats;
  const g = (items, f, cls = '') =>
    `<div class="grid ${cls}">${items.map((m) => tile(m, { square: true, state: f ? f(m) : 'default' })).join('')}</div>`;
  let spine = b1Spine({ stats: S, phase: 'idle' });
  let body = '';
  let mline = `${S.total} objects · ${S.embedded} embedded · queue ${S.queue} · ${S.storage}`;
  let bulk = false;

  if (state === 'searching') {
    spine = b1Spine({ stats: S, phase: 'run', query: LAB.query });
    mline = `tokenize ok · embed ok · cosine 241/${S.embedded} · "${LAB.query}"`;
    body = `${b1Rule('fig.04', 'query in flight', `comparing against ${S.embedded} vectors`)}
      <p class="scan mono animate-sploot-pulse">cosine sweep running for "${LAB.query}"…</p>
      ${g(C, () => 'dim')}`;
  } else if (state === 'results') {
    const hits = C.filter((m) => m.role);
    const rest = C.filter((m) => !m.role);
    spine = b1Spine({ stats: S, phase: 'done', query: LAB.query });
    mline = `4 hits of ${S.total} · best ${pct(hits[0] && hits[0].score)} · 38 ms`;
    body = `${b1Rule('fig.05', 'hits', `4 of ${S.total} · best ${pct(hits[0] && hits[0].score)} · 38 ms`)}
      ${g(hits, (m) => m.role, 'grid--hits')}
      ${b1Rule('fig.06', 'the rest recede', `${rest.length} on sheet below the floor`)}
      ${g(rest, () => 'dim')}`;
  } else if (state === 'zero') {
    spine = b1Spine({ stats: S, phase: 'zero', query: LAB.zeroQuery });
    mline = `0 hits of ${S.total} · "${LAB.zeroQuery}"`;
    body = `${b1Rule('fig.05', 'zero hits', `0 of ${S.total} above the 0.30 floor`)}
      <div class="zwrap"><div class="zcard sploot-card">
        <div class="zart">${LAB.doodle('ghost', { label: 'nothing found', size: '96' })}</div>
        <div>
          <h3 class="display">zero hits</h3>
          <p>the archive holds no record of "${LAB.zeroQuery}". the machine compared all ${S.embedded} embedded objects and found nothing, which is honestly impressive.</p>
          <div class="zacts">
            <button class="btn sploot-press-sm">${LAB.icon('x', 14)} clear query</button>
            <button class="btn sploot-press-sm">${LAB.icon('shuffle', 14)} shuffle instead</button>
          </div>
        </div>
      </div></div>
      ${b1Rule('fig.06', 'the pile, unfiltered', `12 of ${C.length} on sheet · ${S.total} in library`)}
      ${g(C.slice(0, 12), () => 'dim')}`;
  } else if (state === 'empty') {
    mline = `0 objects · the shelf echoes`;
    const step = (n, ic, h, p) => `<div class="estep sploot-card">
      <span class="en mono">step ${n}</span>
      <div class="eart">${LAB.icon(ic, 40)}</div>
      <h3>${h}</h3><p>${p}</p>
    </div>`;
    body = `${b1Rule('fig.00', 'an empty archive', `0 objects · awaiting chaos`)}
      <div class="emptydoc">
        ${step(1, 'camera', 'save chaos', 'screenshot it. upload it. paste a link. the pile takes anything.')}
        ${step(2, 'sparkle', 'the machine reads it', 'every image becomes a 768 number vector. no folders were harmed.')}
        ${step(3, 'search', 'type words. get the picture.', 'fuzzy memory is enough. the query console does the rest.')}
      </div>
      <div class="ecta">
        <button class="btn btn--blue sploot-press">${LAB.icon('upload', 16)} upload your first meme</button>
        <button class="btn sploot-press">${LAB.icon('link', 16)} get the extension</button>
      </div>`;
  } else if (state === 'selected') {
    const ids = [0, 5, 9];
    const sel = C.filter((m) => ids.includes(m.id));
    spine = b1Spine({ stats: S, phase: 'idle', selected: sel });
    mline = `3 picked of ${S.total} · bulk acts below`;
    bulk = true;
    body = `${b1Rule('fig.04', 'the pile', `3 picked of ${S.total} · tap a plate to toggle`)}
      ${g(C, (m) => (ids.includes(m.id) ? 'selected' : 'default'))}`;
  } else if (state === 'detail') {
    const m = C[0];
    mline = `record ${m.index} · plate 1 of ${S.total}`;
    body = `${b1Rule('fig.04', 'the pile', `record ${m.index} open · ${S.total} in library`)}
      <div class="split">
        <div class="grid grid--beside">${C.map((x) => tile(x, { square: true, state: x.id === m.id ? 'default' : 'dim', openTile: x.id === m.id })).join('')}</div>
        ${b1Inspector(m, S)}
      </div>`;
  } else {
    body = `${b1Rule('fig.04', 'the pile', `${C.length} on this sheet · ${S.total} in library · newest first`)}${g(C)}`;
  }

  return `<div class="opt" data-opt="BRUT-1">${CSS1}
    ${spine}
    <main class="main bg-sploot-workbench">${body}</main>
    ${b1Dock({ mline, bulk })}
  </div>`;
}

/* ================================================================
   BRUT-2 · title block
   ================================================================ */
const CSS2 = `<style>
[data-opt="BRUT-2"]{display:flex;flex-direction:column;background:var(--sploot-paper);}
[data-opt="BRUT-2"] .tb{margin:14px 18px 4px;border:3px solid var(--sploot-ink);border-radius:var(--sploot-radius);background:var(--sploot-panel);box-shadow:var(--sploot-shadow);overflow:hidden;}
[data-opt="BRUT-2"] .tbr{display:flex;align-items:stretch;}
[data-opt="BRUT-2"] .tbr + .tbr{border-top:3px solid var(--sploot-ink);}
[data-opt="BRUT-2"] .tbc{display:flex;align-items:center;gap:8px;padding:8px 14px;min-width:0;}
[data-opt="BRUT-2"] .tbc + .tbc{border-left:3px solid var(--sploot-ink);}
[data-opt="BRUT-2"] .tbbrand{gap:10px;align-items:baseline;}
[data-opt="BRUT-2"] .tbbrand .display{font-size:1.15rem;}
[data-opt="BRUT-2"] .tbbrand .mono{font-size:0.54rem;opacity:0.7;white-space:nowrap;}
[data-opt="BRUT-2"] .tbstat{flex-direction:column;align-items:flex-start;gap:0;justify-content:center;}
[data-opt="BRUT-2"] .tk{font-size:0.52rem;opacity:0.7;}
[data-opt="BRUT-2"] .tv{font-size:0.92rem;font-variant-numeric:tabular-nums;}
[data-opt="BRUT-2"] .tbm{flex-direction:column;align-items:flex-start;gap:2px;font-size:0.54rem;opacity:0.85;justify-content:center;flex:1;}
[data-opt="BRUT-2"] .tbacts{gap:8px;}
[data-opt="BRUT-2"] .tbacts .btn{min-height:40px;padding:6px 14px;font-size:0.8rem;box-shadow:var(--sploot-shadow-sm);}
[data-opt="BRUT-2"] .tbq{flex:1;}
[data-opt="BRUT-2"] .tbq input{flex:1;min-width:0;border:0;background:transparent;font:inherit;font-weight:700;color:var(--sploot-ink);}
[data-opt="BRUT-2"] .tbpipe{padding:0;align-items:stretch;font-family:var(--font-mono);}
[data-opt="BRUT-2"] .pst{display:flex;flex-direction:column;justify-content:center;gap:1px;padding:6px 12px;font-size:0.54rem;min-width:88px;}
[data-opt="BRUT-2"] .pst + .pst{border-left:2px solid var(--sploot-ink);}
[data-opt="BRUT-2"] .pst .pl{font-weight:700;}
[data-opt="BRUT-2"] .pst .po{opacity:0.75;font-variant-numeric:tabular-nums;}
[data-opt="BRUT-2"] .pst--idle,[data-opt="BRUT-2"] .pst--wait{opacity:0.45;}
[data-opt="BRUT-2"] .pst--run{background:var(--sploot-cyan);color:#1c1547;}
[data-opt="BRUT-2"] .pst--zero{background:var(--sploot-orange);color:#1c1547;}
[data-opt="BRUT-2"] .tbhits{font-family:var(--font-mono);font-weight:700;font-size:0.66rem;min-width:96px;justify-content:center;font-variant-numeric:tabular-nums;white-space:nowrap;}
[data-opt="BRUT-2"] .tbhits--hit{background:var(--sploot-lime);color:#1c1547;}
[data-opt="BRUT-2"] .tbhits--zero{background:var(--sploot-orange);color:#1c1547;}
[data-opt="BRUT-2"] .tblbl{font-size:0.58rem;font-weight:700;opacity:0.7;}
[data-opt="BRUT-2"] .tbrail{display:flex;align-items:center;flex:1;min-width:0;gap:8px;overflow-x:auto;}
[data-opt="BRUT-2"] .pill{font-family:var(--font-sans);font-size:0.78rem;min-height:40px;padding:4px 14px;flex-direction:row;gap:6px;align-items:center;box-shadow:var(--sploot-shadow-sm);white-space:nowrap;}
[data-opt="BRUT-2"] .pill small{font-family:var(--font-mono);font-size:0.54rem;}
[data-opt="BRUT-2"] .tbcount{font-family:var(--font-mono);font-size:0.56rem;opacity:0.85;white-space:nowrap;font-variant-numeric:tabular-nums;}
[data-opt="BRUT-2"] .doc{flex:1;padding:8px 0 40px;}
[data-opt="BRUT-2"] .reg{padding:8px 18px 10px;}
[data-opt="BRUT-2"] .reghead{display:flex;align-items:center;gap:10px;padding:10px 0;}
[data-opt="BRUT-2"] .fig{font-family:var(--font-mono);font-size:0.58rem;font-weight:700;border:2px solid var(--sploot-ink);border-radius:var(--sploot-radius-pill);padding:2px 10px;background:var(--sploot-panel);white-space:nowrap;}
[data-opt="BRUT-2"] .rname{font-weight:700;font-size:0.88rem;text-transform:lowercase;white-space:nowrap;}
[data-opt="BRUT-2"] .rline{flex:1;border-top:3px solid var(--sploot-ink);}
[data-opt="BRUT-2"] .rn{font-family:var(--font-mono);font-size:0.56rem;font-variant-numeric:tabular-nums;opacity:0.85;white-space:nowrap;}
[data-opt="BRUT-2"] .reg--lg .row{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:16px;align-items:start;}
[data-opt="BRUT-2"] .reg--md .row{display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:12px;align-items:start;}
[data-opt="BRUT-2"] .reg--sm .row{display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));gap:10px;align-items:start;}
[data-opt="BRUT-2"] .reg--sm .tmtxt p{font-size:0.6rem;}
[data-opt="BRUT-2"] .topen{width:28px;height:28px;}
[data-opt="BRUT-2"] .hitrow{display:grid;grid-template-columns:minmax(240px,340px) 1fr;gap:16px;align-items:start;}
[data-opt="BRUT-2"] .why{padding:16px 18px;display:flex;flex-direction:column;gap:7px;max-width:520px;}
[data-opt="BRUT-2"] .why h3{margin:0 0 2px;font-size:0.98rem;text-transform:lowercase;}
[data-opt="BRUT-2"] .wline{display:flex;justify-content:space-between;gap:12px;font-size:0.6rem;border-bottom:2px dashed var(--sploot-ink);padding:3px 0 5px;font-variant-numeric:tabular-nums;}
[data-opt="BRUT-2"] .wacts{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;}
[data-opt="BRUT-2"] .wacts .btn{min-height:40px;padding:6px 14px;font-size:0.78rem;box-shadow:var(--sploot-shadow-sm);}
[data-opt="BRUT-2"] .slotrow{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;}
[data-opt="BRUT-2"] .slot{aspect-ratio:1/1;border:2px dashed var(--sploot-ink);border-radius:var(--sploot-radius-inner);opacity:0.35;}
[data-opt="BRUT-2"] .seldock{position:fixed;left:0;right:0;bottom:0;z-index:45;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 18px calc(10px + env(safe-area-inset-bottom));background:var(--sploot-void);color:var(--sploot-on-void);border-top:3px solid var(--sploot-ink);}
[data-opt="BRUT-2"] .selsum{font-weight:700;font-size:0.7rem;white-space:nowrap;}
[data-opt="BRUT-2"] .self{flex:1;font-size:0.58rem;opacity:0.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:120px;}
[data-opt="BRUT-2"] .seldock .btn{min-height:40px;padding:6px 14px;font-size:0.76rem;box-shadow:var(--sploot-shadow-sm);}
[data-opt="BRUT-2"] .platewrap{padding:8px 18px 10px;}
[data-opt="BRUT-2"] .platebody{display:grid;grid-template-columns:minmax(320px,1fr) 380px;gap:18px;align-items:start;padding-top:4px;}
[data-opt="BRUT-2"] .pmedia{padding:16px;display:flex;flex-direction:column;gap:10px;}
[data-opt="BRUT-2"] .pmart{width:100%;display:grid;place-items:center;background:var(--sploot-paper-warm);border:2px solid var(--sploot-ink);border-radius:var(--sploot-radius-inner);padding:36px;min-height:320px;color:var(--sploot-ink);}
[data-opt="BRUT-2"] .pmedia figcaption{font-family:var(--font-mono);font-size:0.58rem;opacity:0.8;}
[data-opt="BRUT-2"] .pside{display:flex;flex-direction:column;gap:12px;}
[data-opt="BRUT-2"] .pcap{margin:0;font-size:1.05rem;font-weight:700;text-transform:lowercase;}
[data-opt="BRUT-2"] .prail{display:flex;gap:8px;}
[data-opt="BRUT-2"] .pnav{display:flex;align-items:center;justify-content:space-between;gap:10px;}
[data-opt="BRUT-2"] .pnav .btn{min-height:38px;padding:4px 14px;font-size:0.72rem;box-shadow:var(--sploot-shadow-sm);}
[data-opt="BRUT-2"] .pnav .mono{font-size:0.6rem;font-variant-numeric:tabular-nums;}
[data-opt="BRUT-2"] .closebtn{min-height:40px;padding:6px 14px;font-size:0.76rem;box-shadow:var(--sploot-shadow-sm);}
[data-opt="BRUT-2"] .mdock2{display:none;}
[data-opt="BRUT-2"] .tbhide2{display:flex;}
${commonCSS('BRUT-2')}
@media (max-width:767px){
  [data-opt="BRUT-2"] .tb{margin:10px 10px 2px;}
  [data-opt="BRUT-2"] .tbhide,[data-opt="BRUT-2"] .tbm,[data-opt="BRUT-2"] .tbacts,[data-opt="BRUT-2"] .tbcount{display:none;}
  [data-opt="BRUT-2"] .tbr2{flex-wrap:wrap;}
  [data-opt="BRUT-2"] .tbq{flex:1 1 100%;min-height:44px;}
  [data-opt="BRUT-2"] .tbpipe{flex:1;border-left:0;border-top:2px solid var(--sploot-ink);overflow-x:auto;}
  [data-opt="BRUT-2"] .pst{min-width:74px;padding:5px 9px;}
  [data-opt="BRUT-2"] .tbhits{border-top:2px solid var(--sploot-ink);}
  [data-opt="BRUT-2"] .doc{padding-bottom:96px;}
  [data-opt="BRUT-2"] .reghead{flex-wrap:wrap;row-gap:4px;}
  [data-opt="BRUT-2"] .reghead .rname{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  [data-opt="BRUT-2"] .reg{padding:6px 10px 8px;}
  [data-opt="BRUT-2"] .reg--lg .row,[data-opt="BRUT-2"] .reg--md .row{display:flex;overflow-x:auto;gap:10px;padding-bottom:6px;}
  [data-opt="BRUT-2"] .reg--lg .row > *{flex:0 0 64%;}
  [data-opt="BRUT-2"] .reg--md .row > *{flex:0 0 46%;}
  [data-opt="BRUT-2"] .reg--sm .row{grid-template-columns:repeat(2,1fr);}
  [data-opt="BRUT-2"] .hitrow{display:flex;flex-direction:column;}
  [data-opt="BRUT-2"] .platebody{grid-template-columns:1fr;display:grid;}
  [data-opt="BRUT-2"] .seldock .btn{min-height:44px;}
  [data-opt="BRUT-2"] .prail .sploot-ctl,[data-opt="BRUT-2"] .platewrap .sploot-ctl{width:44px;height:44px;}
  [data-opt="BRUT-2"] .mdock2{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:40;gap:7px;padding:8px 10px calc(10px + env(safe-area-inset-bottom));background:var(--sploot-void);border-top:3px solid var(--sploot-ink);}
  [data-opt="BRUT-2"] .mdock2 button{flex:1;min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:2px solid var(--sploot-ink);border-radius:var(--sploot-radius-pill);background:var(--sploot-panel);color:var(--sploot-ink);font-size:0.56rem;font-weight:700;text-transform:lowercase;}
  [data-opt="BRUT-2"] .mdock2 .mb--blue{background:var(--sploot-blue);color:var(--sploot-on-blue);}
  [data-opt="BRUT-2"] .mdock2 .mb--cyan{background:var(--sploot-cyan);color:#1c1547;}
}
</style>`;

function b2TB(o) {
  const S = o.stats;
  const stat = (k, v, cls = '') => `<div class="tbc tbstat ${cls}"><span class="tk mono">${k}</span><b class="tv display">${v}</b></div>`;
  const pipeCells = stages(o.phase, S)
    .map(
      (st) => `<div class="pst pst--${st.st}${st.st === 'run' ? ' animate-sploot-pulse' : ''}"><span class="pl">${st.lbl}</span><span class="po">${st.out}</span></div>`
    )
    .join('');
  const piles = LAB.piles
    .map((p) => `<button class="pill sploot-press-sm">${p.conf < 0.56 ? 'maybe ' : ''}${p.label}<small>${p.count} in pile</small></button>`)
    .join('');
  const hitsCls = o.phase === 'done' ? ' tbhits--hit' : o.phase === 'zero' ? ' tbhits--zero' : '';
  const hitsTxt = o.phase === 'run' ? '<span class="animate-sploot-pulse">…</span>' : o.hits;
  return `<header class="tb" aria-label="archive title block">
    <div class="tbr tbr1">
      <div class="tbc tbbrand"><span class="display">sploot</span><span class="mono">archive sheet a1</span></div>
      ${stat('objects', S.total)}${stat('embedded', S.embedded, 'tbhide')}${stat('queue', S.queue)}${stat('storage', S.storage, 'tbhide')}
      <div class="tbc tbm mono"><span>model clip-vit-b32</span><span>scorer cosine</span><span>route /app</span></div>
      <div class="tbc tbacts">
        <button class="btn btn--blue sploot-press-sm">${LAB.icon('upload', 15)} upload</button>
        <button class="btn sploot-press-sm">${LAB.icon('shuffle', 15)} shuffle</button>
      </div>
    </div>
    <div class="tbr tbr2">
      <div class="tbc tbq">${LAB.icon('search', 16)}<input value="${o.query || ''}" placeholder="type words. get the picture." aria-label="search the archive" /></div>
      <div class="tbc tbpipe" aria-label="retrieval pipeline">${pipeCells}</div>
      <div class="tbc tbhits${hitsCls}">${hitsTxt}</div>
    </div>
    <div class="tbr tbr3">
      <span class="tbc tblbl mono">piles</span>
      <div class="tbc tbrail">
        <button class="pill pill--on sploot-press-sm">${LAB.icon('check', 12)} all memes<small>${S.total} in library</small></button>
        ${piles}
      </div>
      <span class="tbc tbcount">${o.count}</span>
    </div>
  </header>`;
}

function b2Reg(fig, name, count, cls, cellsHtml) {
  return `<section class="reg ${cls}">
    <div class="reghead"><span class="fig">${fig}</span><span class="rname">${name}</span><span class="rline"></span><span class="rn">${count}</span></div>
    <div class="row">${cellsHtml}</div>
  </section>`;
}

function b2Why(m, S) {
  const w = (k, v) => `<div class="wline mono"><span>${k}</span><span>${v}</span></div>`;
  return `<div class="why sploot-card">
    <h3>why this one</h3>
    ${w('query', `"${LAB.query}"`)}
    ${w('cosine', `${m.score} raw`)}
    ${w('reads as', `match ${pct(m.score)}`)}
    ${w('matched on', 'cat, 3am, motion')}
    ${w('rank', `1 of ${S.embedded} compared`)}
    ${w('latency', '38 ms')}
    <div class="wacts">
      <button class="btn btn--blue sploot-press-sm">${LAB.icon('expand', 15)} open the plate</button>
      <button class="btn sploot-press-sm">${LAB.icon('share', 15)} share</button>
    </div>
  </div>`;
}

function b2SelDock(sel, S) {
  return `<footer class="seldock" role="toolbar" aria-label="selection actions">
    <span class="selsum">${sel.length} picked</span>
    <span class="self mono">${sel.map((m) => m.file).join(' · ')} · ${S.total - sel.length} not picked</span>
    <button class="btn sploot-press-sm">${LAB.icon('heart', 15)} heart all</button>
    <button class="btn sploot-press-sm">${LAB.icon('share', 15)} share</button>
    <button class="btn btn--red sploot-press-sm">${LAB.icon('trash', 15)} trash ${sel.length}</button>
    <button class="btn sploot-press-sm">${LAB.icon('x', 15)} clear</button>
  </footer>`;
}

function b2Dock() {
  const b = (ic, l, cls = '') => `<button class="${cls}">${LAB.icon(ic, 16)}<span>${l}</span></button>`;
  return `<nav class="mdock2" aria-label="commands">
    ${b('search', 'search', 'mb--cyan')}${b('filter', 'piles')}${b('upload', 'upload', 'mb--blue')}${b('shuffle', 'shuffle')}${b('check', 'select')}
  </nav>`;
}

function b2Plate(m, S) {
  return `<section class="platewrap" role="dialog" aria-modal="false" aria-label="plate: ${m.cap}">
    <div class="reghead">
      <span class="fig">plate 1 of ${S.total}</span>
      <span class="rname">${m.file}</span>
      <span class="rline"></span>
      <span class="esc mono"><kbd>esc</kbd> returns to the sheet</span>
      <button class="btn closebtn sploot-press-sm" aria-label="close plate">${LAB.icon('x', 14)} close plate</button>
    </div>
    <div class="platebody">
      <figure class="pmedia sploot-card" style="margin:0;">
        <div class="pmart">${LAB.doodle(m.kind, { label: m.cap, size: '300' })}</div>
        <figcaption>${m.index} · 768 d vector · clip-vit-b32 · printed at full size</figcaption>
      </figure>
      <div class="pside">
        <p class="pcap">${m.cap}</p>
        <div class="prail">
          <button class="sploot-ctl" aria-label="banger" aria-pressed="${m.banger}">${LAB.icon(m.banger ? 'heartFill' : 'heart')}</button>
          <button class="sploot-ctl" aria-label="share">${LAB.icon('share')}</button>
          <button class="sploot-ctl" aria-label="copy link">${LAB.icon('link')}</button>
          <button class="sploot-ctl" aria-label="trash">${LAB.icon('trash')}</button>
        </div>
        ${specRows([
          ['file', m.file],
          ['index', m.index],
          ['kind', m.kind],
          ['saved', '2026-06-30 03:12'],
          ['size', '412 kb'],
          ['model', 'clip-vit-b32'],
          ['last query', `match ${pct(m.score)} (cosine ${m.score})`],
        ])}
        <div class="pnav">
          <button class="btn sploot-press-sm">${LAB.icon('arrowL', 14)} prev plate</button>
          <span class="mono">1 / ${S.total}</span>
          <button class="btn sploot-press-sm">next plate ${LAB.icon('arrowR', 14)}</button>
        </div>
      </div>
    </div>
  </section>`;
}

function b2Render(state) {
  const C = LAB.corpus;
  const S = state === 'empty' ? { total: 0, embedded: 0, queue: 0, storage: '0 b' } : LAB.stats;
  const today = C.slice(0, 6);
  const week = C.slice(6, 18);
  const deep = C.slice(18);
  const t = (m, st) => tile(m, { tab: true, openIn: 'meta', state: st });
  const ts = (m, st) => tile(m, { tab: false, openIn: 'meta', state: st });
  const regsBrowse = (f) =>
    b2Reg('fig.01', 'saved today', `${today.length} on sheet`, 'reg--lg', today.map((m) => t(m, f && f(m))).join('')) +
    b2Reg('fig.02', 'this week', `${week.length} on sheet`, 'reg--md', week.map((m) => t(m, f && f(m))).join('')) +
    b2Reg('fig.03', 'the deep pile', `${deep.length} on sheet · ${S.total} in library`, 'reg--sm', deep.map((m) => ts(m, f && f(m))).join(''));

  let tb = b2TB({ stats: S, phase: 'idle', hits: 'ready', count: `sheet shows ${C.length} of ${S.total} · newest first` });
  let doc = regsBrowse();
  let after = b2Dock();

  if (state === 'searching') {
    tb = b2TB({ stats: S, phase: 'run', query: LAB.query, hits: '…', count: 'sheet paused while the machine thinks' });
    doc = `<p class="scan mono animate-sploot-pulse">comparing "${LAB.query}" against ${S.embedded} vectors…</p>${regsBrowse(() => 'dim')}`;
  } else if (state === 'results') {
    const match = C.find((m) => m.role === 'match');
    const nears = C.filter((m) => m.role === 'near');
    const rest = C.filter((m) => !m.role);
    tb = b2TB({ stats: S, phase: 'done', query: LAB.query, hits: '4 hits', count: `sheet shows 4 hits + ${rest.length} receded · of ${S.total}` });
    doc = `<section class="reg">
        <div class="reghead"><span class="fig">fig.r1</span><span class="rname">the match</span><span class="rline"></span><span class="rn">1 hit · ${pct(match && match.score)}</span></div>
        <div class="hitrow">${match ? t(match, 'match') : ''}${match ? b2Why(match, S) : ''}</div>
      </section>
      ${b2Reg('fig.r2', 'near misses', `${nears.length} close`, 'reg--md', nears.map((m) => t(m, 'near')).join(''))}
      ${b2Reg('fig.r3', 'the rest recedes', `${rest.length} below the floor`, 'reg--sm', rest.map((m) => ts(m, 'dim')).join(''))}`;
  } else if (state === 'zero') {
    tb = b2TB({ stats: S, phase: 'zero', query: LAB.zeroQuery, hits: '0 hits', count: `sheet shows 0 hits · ${S.total} unfiltered below` });
    doc = `<section class="reg">
        <div class="reghead"><span class="fig">fig.z1</span><span class="rname">zero hits</span><span class="rline"></span><span class="rn">0 of ${S.total} above the floor</span></div>
        <div class="zwrap" style="padding:0;"><div class="zcard sploot-card">
          <div class="zart">${LAB.doodle('ghost', { label: 'nothing found', size: '96' })}</div>
          <div>
            <h3 class="display">no record of that</h3>
            <p>"${LAB.zeroQuery}" tokenized fine, embedded fine, matched nothing. the machine checked all ${S.embedded} embedded objects. it is not mad, just disappointed.</p>
            <div class="zacts">
              <button class="btn sploot-press-sm">${LAB.icon('x', 14)} clear query</button>
              <button class="btn sploot-press-sm">${LAB.icon('shuffle', 14)} shuffle the pile</button>
              <button class="btn sploot-press-sm">${LAB.icon('filter', 14)} browse piles</button>
            </div>
          </div>
        </div></div>
      </section>
      ${b2Reg('fig.z2', 'the pile, unaffected', `12 of ${C.length} on sheet`, 'reg--sm', C.slice(0, 12).map((m) => ts(m, 'dim')).join(''))}`;
  } else if (state === 'empty') {
    tb = b2TB({ stats: S, phase: 'idle', hits: 'ready', count: 'sheet shows 0 of 0' });
    const step = (n, ic, h, p) => `<div class="estep sploot-card">
      <span class="en mono">step ${n}</span>
      <div class="eart">${LAB.icon(ic, 40)}</div>
      <h3>${h}</h3><p>${p}</p>
    </div>`;
    doc = `<section class="reg">
        <div class="reghead"><span class="fig">fig.01</span><span class="rname">how this document fills itself</span><span class="rline"></span><span class="rn">0 objects · awaiting chaos</span></div>
        <div class="emptydoc" style="padding:0;">
          ${step(1, 'camera', 'save chaos', 'screenshot it. upload it. the extension grabs it from anywhere.')}
          ${step(2, 'sparkle', 'the machine reads it', 'every image becomes a 768 number vector and files itself.')}
          ${step(3, 'search', 'type words. get the picture.', 'the title block up top is a search box. for memes.')}
        </div>
        <div class="ecta" style="padding:14px 0 4px;">
          <button class="btn btn--blue sploot-press">${LAB.icon('upload', 16)} upload your first meme</button>
          <button class="btn sploot-press">${LAB.icon('link', 16)} get the extension</button>
        </div>
      </section>
      <section class="reg">
        <div class="reghead"><span class="fig">fig.02</span><span class="rname">reserved for your first saves</span><span class="rline"></span><span class="rn">6 empty plates</span></div>
        <div class="slotrow">${Array.from({ length: 6 }, () => '<div class="slot"></div>').join('')}</div>
      </section>`;
  } else if (state === 'selected') {
    const ids = [1, 8, 22];
    const sel = C.filter((m) => ids.includes(m.id));
    tb = b2TB({ stats: S, phase: 'idle', hits: 'ready', count: `3 picked · ${S.total} in library` });
    doc = regsBrowse((m) => (ids.includes(m.id) ? 'selected' : 'default'));
    after = b2SelDock(sel, S);
  } else if (state === 'detail') {
    const m = C[0];
    doc = `${b2Plate(m, S)}
      ${b2Reg('fig.d2', 'the sheet continues', `${C.length - 1} more · ${S.total} in library`, 'reg--sm', C.slice(1, 13).map((x) => ts(x, 'dim')).join(''))}`;
  }

  return `<div class="opt" data-opt="BRUT-2">${CSS2}
    ${tb}
    <main class="doc bg-sploot-workbench">${doc}</main>
    ${after}
  </div>`;
}

/* ================================================================ */
export const SPECS = {
  'BRUT-1': {
    name: 'index spine',
    lane: 'brut',
    move: 'the machine console is the app: a left spine owns query, exposed pipeline, piles and the index ledger; the grid is a full-bleed square-plate contact sheet with no top chrome at all',
    notes:
      'square plates crop nothing here (doodles) but will center-crop real memes; if crops offend, swap media to aspect-true and accept ragged rows. spine is 300px of permanent chrome and earns it only if the pipeline gets real timings wired. mobile piles and search open from the machine strip and are stubbed in this static lab. bulk actions live in the spine on desktop and swap into the strip on mobile.',
    render(state) {
      return b1Render(state);
    },
  },
  'BRUT-2': {
    name: 'title block',
    lane: 'brut',
    move: 'the status bar inverts into the primary chrome: an engineering title-block masthead holds stats, search, pipeline and piles; the library is a ruled document of recency registers and detail is a full plate page, not an overlay',
    notes:
      'registers need a real recency grouping rule (today / week / deep is demo logic). the title block eats about 150px of top chrome at 1440 and condenses hard on mobile. raw cosine appears only in the why panel and plate spec sheet, paired with the human match percent. the selection ledger replaces the mobile dock while active, on purpose. plate page relies on esc plus the labeled close, wire a focus trap when it goes live.',
    render(state) {
      return b2Render(state);
    },
  },
};
