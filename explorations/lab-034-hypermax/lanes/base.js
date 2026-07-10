/* lab 034 · lane BASE — the SHIPPED sploot system (neo-brutalist zine),
   verbatim token values from apps/web/app/globals.css, rendered through the
   round-1 gallery contract. This is the baseline, not a candidate. */
'use strict';

(() => {

function bCell(m, state = '', score = false) {
  return `
  <div class="k-cellwrap">
    <div class="k-cell ${state}">
      <div class="head"><span>${esc(m.file)}</span><span>vec ${m.vec}</span></div>
      <div class="art" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>
      <div class="cap"><span>${esc(m.cap)}</span>${m.banger ? '<span class="k-banger">banger</span>' : ''}</div>
    </div>
    ${score ? `<div class="score"><b>${(m.score / 100).toFixed(2)}</b><span>${m.score >= 90 ? 'closest match' : m.score >= 75 ? 'strong match' : 'related'}</span></div>` : ''}
  </div>`;
}
function bConsole(q = 'cat losing it') {
  return `
  <div class="k-console">
    <div class="bar"><span>sploot search console</span><span>v2</span>
      <span class="leds"><i style="background:var(--lime)"></i><i style="background:var(--yellow)"></i><i style="background:var(--magenta)"></i></span>
    </div>
    <div class="shelf">
      <div class="field"><span style="opacity:.55">&gt;</span><span class="q">${esc(q)}</span><span class="caret"></span></div>
      <button class="k-btn primary">find it</button>
    </div>
    <div class="meta">
      <span>index: ${LIB.total.toLocaleString()} vec</span><span>model: ${LIB.model}</span>
      <span>dim: ${LIB.dim}</span><span>route: /api/search</span>
    </div>
  </div>`;
}
function bStatusbar() {
  const cells = [
    ['index', `${LIB.total.toLocaleString()} vec`], ['model', LIB.model],
    ['queue', `${LIB.queued} embedding`], ['route', '/app'], ['status', 'live', true],
  ];
  return `<div class="k-statusbar">${cells.map(c =>
    `<div class="cell ${c[2] ? 'ok' : ''}"><b>${c[0]}</b><span>${c[1]}</span></div>`).join('')}</div>`;
}

SPECS['BASE-1'] = (m) => {
  css('BASE-1', `
  .sysb { min-height:100dvh; display:flex; flex-direction:column; color:var(--ink);
    background:
      linear-gradient(var(--grid-line) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-line) 1px, transparent 1px),
      var(--paper);
    background-size:24px 24px, 24px 24px, auto; }
  .sysb.theme-dark {
    --ink:#f3efe4; --paper:#141414; --paper-warm:#1d1d1d; --blue:#4d72ff;
    --orange:#ff7a45; --grid-line:rgba(243,239,228,.06);
    --b:4px solid var(--ink); --b-thick:6px solid var(--ink);
    --shadow:8px 8px 0 var(--ink); --shadow-sm:5px 5px 0 var(--ink);
    --shadow-lg:12px 12px 0 var(--ink);
    --match-ring:0 0 0 5px var(--lime), 10px 10px 0 var(--ink); }
  .sysb.theme-dark .k-cell, .sysb.theme-dark .k-console .field { background:#1d1d1d; }
  .sysb.theme-dark .k-console .shelf { color:#0a0a0a; }
  .sysb.theme-dark .k-console .field { color:var(--ink); }
  .sysb.theme-dark .k-console .bar { color:#0a0a0a; }
  .sysb .bg-wrap { max-width:1120px; margin:0 auto; width:100%; padding:0 40px; }
  .sysb .bg-sec {
    font-family:var(--mono); font-size:11px; text-transform:uppercase; letter-spacing:.12em;
    border-top:var(--b); margin-top:44px; padding:10px 0 18px; display:flex; gap:12px; align-items:baseline; }
  .sysb .bg-sec b { background:var(--ink); color:var(--paper); padding:2px 8px; }
  .sysb .bg-row { display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start; }
  .sysb .bg-shape { border:var(--b); background:var(--paper-warm); width:120px; height:80px;
    display:grid; place-items:center; font-family:var(--mono); font-size:9px; text-transform:uppercase; }
  .sysb .bg-input { display:flex; align-items:center; gap:10px; border:var(--b); background:#fff;
    padding:10px 14px; font-family:var(--mono); font-size:14px; min-width:280px; }
  .sysb.theme-dark .bg-input { background:#1d1d1d; }
  .sysb .bg-tabs { display:flex; border:var(--b); width:max-content; }
  .sysb .bg-tab { font-family:var(--mono); font-size:12px; text-transform:uppercase; padding:10px 18px;
    background:var(--paper); border-right:2px solid var(--ink); cursor:pointer; min-height:44px; }
  .sysb .bg-tab:last-child { border-right:0; }
  .sysb .bg-tab.on { background:var(--yellow); color:#0a0a0a; font-weight:700; box-shadow:inset 0 -5px 0 var(--ink); }
  .sysb .bg-toast { display:inline-flex; gap:12px; align-items:center; border:var(--b); background:var(--lime);
    color:#0a0a0a; box-shadow:var(--shadow-sm); padding:10px 16px; font-family:var(--mono); font-size:12px; }
  .sysb .bg-empty { border:var(--b-thick); background:var(--paper-warm); box-shadow:var(--shadow);
    padding:36px; display:flex; flex-direction:column; gap:12px; align-items:flex-start; max-width:460px; }
  .sysb .bg-phone { width:390px; flex:none; border:var(--b-thick); box-shadow:var(--shadow-lg);
    background:var(--paper); overflow:hidden; }
  .sysb .bg-dock { display:flex; border-top:var(--b); background:var(--void); }
  .sysb .bg-dock button { flex:1; min-height:52px; background:none; border:0; border-right:2px solid rgba(255,255,255,.18);
    color:#fff; font-family:var(--mono); font-size:10px; text-transform:uppercase; }
  .sysb .bg-dock button.on { background:var(--blue); }
  .sysb .bg-pilerail { display:flex; flex-direction:column; gap:8px; min-width:200px; }
  .sysb .bg-pile { border:2px solid var(--ink); padding:8px 10px; font-family:var(--mono); font-size:11px;
    display:flex; justify-content:space-between; gap:10px; background:var(--paper); cursor:pointer; }
  .sysb .bg-pile.on { border-width:4px; background:var(--yellow); color:#0a0a0a; font-weight:700; }
  .sysb .k-cell .art .meme-media { background:var(--paper-warm); }
  .sysb .bg-load { display:grid; place-items:center; font-family:var(--mono); font-size:10px;
    text-transform:uppercase; background:repeating-linear-gradient(45deg, var(--paper-warm), var(--paper-warm) 8px, var(--paper) 8px, var(--paper) 16px); }
  @media (max-width:700px) {
    .sysb .bg-wrap { padding-left:16px; padding-right:16px; }
    .sysb .k-mast { flex-wrap:wrap; }
    .sysb .bg-input { min-width:0; flex:1; }
    .sysb .bg-phone { width:100%; max-width:390px; }
    .sysb .bg-tabs { width:100%; }
    .sysb .bg-tab { flex:1; text-align:center; }
  }
  `);
  const M = MEMES;
  m.innerHTML = `
  <div class="sysb">
    <div class="k-mast">
      <span class="k-logo">sploot</span>
      <div class="k-mast-links"><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></div>
    </div>

    <div class="bg-wrap" style="padding-top:40px;display:flex;flex-direction:column;gap:22px">
      <span class="k-sticker tilt-l">it's a search box. for memes.</span>
      <h1 class="k-h1" style="font-size:clamp(34px, 6.5vw, 68px)">type words.<br>get the <span class="hl-y">picture.</span></h1>
      ${bConsole()}
      <div class="k-grid cols-4">${M.slice(0, 4).map((x, i) => bCell(x, i === 0 ? 'match' : '', i === 0)).join('')}</div>
    </div>

    <div class="bg-wrap"><div class="bg-sec"><b>01</b> foundations · tokens, shape, elevation</div></div>
    <div>${swatches([['ink', '#0a0a0a', '#fff'], ['paper', '#f3efe4'], ['paper warm', '#e9e4d6'], ['blue', '#1f4cff', '#fff'], ['cyan', '#00e5d4'], ['magenta', '#ff2d9b', '#fff'], ['yellow', '#ffe600'], ['orange', '#ff5a1f', '#fff'], ['lime', '#9cff2e']])}</div>
    <div class="bg-wrap" style="padding-top:18px">
      <div class="bg-row">
        <div class="bg-shape" style="border-width:1px">hairline · compact</div>
        <div class="bg-shape">4px ink · object</div>
        <div class="bg-shape" style="border-width:6px">6px · hero/selected</div>
        <div class="bg-shape" style="box-shadow:var(--shadow-sm)">hard shadow sm</div>
        <div class="bg-shape" style="box-shadow:var(--shadow)">hard shadow</div>
        <div class="bg-shape" style="border-radius:0">radius 0 · always</div>
        <div class="bg-shape" style="width:80px;height:80px;border-radius:50%">circle<br>exception</div>
      </div>
      <p class="k-note" style="margin-top:14px">spacing rides a 24px engineering grid · density: archive workbench</p>
    </div>

    <div class="bg-wrap"><div class="bg-sec"><b>02</b> typography</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="font-family:var(--display);font-size:54px;text-transform:uppercase;line-height:.9">display · archivo black</div>
        <div style="font-size:17px;max-width:560px">body · space grotesk. the pile sorts itself into semantic piles while you sleep. no folders were harmed.</div>
        <div style="font-family:var(--mono);font-size:12px;text-transform:uppercase">label · space mono upper</div>
        <div style="font-family:var(--mono);font-size:10px;opacity:.65">metadata · vec 0413 · 212ms · siglip-base</div>
        <div style="font-family:var(--mono);font-size:26px;font-variant-numeric:tabular-nums">1,482 · 0.94 · 212ms</div>
        <div style="font-size:13px;max-width:420px;border-left:3px solid var(--ink);padding-left:10px">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me is now framed above my desk like a diploma.</div>
      </div>
    </div>

    <div class="bg-wrap"><div class="bg-sec"><b>03</b> components · the kit</div>
      <div style="display:flex;flex-direction:column;gap:26px">
        ${bConsole('sad frog')}
        <div class="k-grid cols-4">
          ${bCell(M[0], 'match', true)}
          ${bCell(M[1], 'near')}
          ${bCell(M[2], 'dim')}
          ${bCell(M[3])}
        </div>
        <div class="k-grid cols-4">
          <div class="k-cellwrap"><div class="k-cell" style="border-width:6px"><div class="head"><span>selected.png</span><span>vec 0002</span></div><div class="art" style="aspect-ratio:1/1">${memeImg(M[4])}</div><div class="cap"><span>selected · 6px frame</span></div></div></div>
          <div class="k-cellwrap"><div class="k-cell"><div class="head"><span>uploading…</span><span>queue 2</span></div><div class="art bg-load" style="aspect-ratio:1/1">embedding…</div><div class="cap"><span>loading state</span></div></div></div>
          <div class="k-cellwrap"><div class="k-cell" style="border-color:var(--orange)"><div class="head" style="background:var(--orange);color:#0a0a0a"><span>failed.png</span><span>err 500</span></div><div class="art" style="aspect-ratio:1/1;display:grid;place-items:center"><span style="font-family:var(--mono);font-size:11px;text-transform:uppercase">embed failed</span></div><div class="cap"><span>error state</span><button class="k-btn sm">retry</button></div></div></div>
          <div class="bg-empty"><span class="k-sticker yellow tilt-l">the pile is empty</span><p style="font-size:15px">zero memes. zero thoughts. upload chaos and the machine starts sorting.</p><button class="k-btn primary">upload chaos</button></div>
        </div>
        <div class="bg-row" style="align-items:center">
          <button class="k-btn primary">find it</button>
          <button class="k-btn">shuffle the pile</button>
          <button class="k-btn accent">bangers</button>
          <button class="k-btn ghost">secondary</button>
          <button class="k-btn sm">compact</button>
          <button class="k-btn sm icon">✕</button>
          <span class="k-sticker">sticker</span>
          <span class="k-sticker magenta tilt-r">banger</span>
          <span class="k-banger">banger</span>
        </div>
        <div class="bg-row" style="align-items:center">
          <div class="bg-input"><span style="opacity:.55">&gt;</span><span>text input</span><span class="caret" style="width:9px;height:18px;background:var(--blue)"></span></div>
          <div class="bg-tabs"><div class="bg-tab on">all</div><div class="bg-tab">bangers</div><div class="bg-tab">recent</div></div>
          <div class="bg-toast">✓ saved to the pile</div>
        </div>
        <div class="bg-row">
          <div class="k-stat yellow" style="min-width:150px"><div class="k-stat-label">folders required</div><div class="k-stat-value">0</div></div>
          <div class="k-stat" style="min-width:150px"><div class="k-stat-label">memes indexed</div><div class="k-stat-value">1,482</div></div>
          <div class="k-stat magenta" style="min-width:150px"><div class="k-stat-label">bangers</div><div class="k-stat-value">37</div></div>
        </div>
        ${bStatusbar()}
      </div>
    </div>

    <div class="bg-wrap"><div class="bg-sec"><b>04</b> motion · hard, on interaction only</div>
      <div class="bg-row" style="align-items:center">
        <button class="k-btn primary">press me · lift/slam</button>
        <button class="k-btn" id="base-stamp-go">replay stamp</button>
        <span class="k-sticker lime" id="base-stamp" style="display:none">banger!</span>
        <span class="k-note">prefers-reduced-motion collapses every animation and transition globally</span>
      </div>
    </div>

    <div class="bg-wrap"><div class="bg-sec"><b>05</b> compositions · workbench + phone</div></div>
    <div class="bg-wrap">
      <div style="border:var(--b);background:var(--paper)">
        <div class="k-mast" style="border-bottom:var(--b)"><span class="k-logo" style="font-size:16px">sploot</span>
          <div class="bg-input" style="flex:1;max-width:420px;border-width:3px;padding:8px 12px"><span style="opacity:.55">&gt;</span><span>search the pile</span></div>
          <div class="k-mast-links"><a href="#0">upload</a><a href="#0">bangers</a><a href="#0">shuffle</a></div>
        </div>
        <div style="display:flex;gap:18px;padding:18px">
          <div class="bg-pilerail">
            ${PILES.slice(0, 5).map((p, i) => `<div class="bg-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></div>`).join('')}
          </div>
          <div class="k-grid cols-4" style="flex:1">${M.slice(0, 8).map(x => bCell(x)).join('')}</div>
        </div>
        ${bStatusbar()}
      </div>
    </div>
    <div class="bg-wrap" style="padding-top:22px;padding-bottom:44px">
      <div class="bg-phone">
        <div class="k-mast" style="padding:9px 12px"><span class="k-logo" style="font-size:15px">sploot</span><span class="k-note">1,482</span></div>
        <div style="padding:12px;display:flex;flex-direction:column;gap:12px">
          <div class="bg-input" style="min-width:0"><span style="opacity:.55">&gt;</span><span>cat losing it</span></div>
          <div class="k-grid" style="grid-template-columns:1fr 1fr;gap:12px">${M.slice(0, 4).map(x => bCell(x)).join('')}</div>
        </div>
        <div class="bg-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'neo-brutalist zine (SHIPPED baseline)'], ['type', 'archivo black / space grotesk / space mono'], ['move', 'the ui admits it is a database'], ['density', 'high'], ['motion', 'hard, on interaction']])}
    </div>
  </div>`;
  themeToggle(m.querySelector('.sysb'));
  const go = m.querySelector('#base-stamp-go');
  const st = m.querySelector('#base-stamp');
  if (go && st) go.onclick = () => {
    st.style.display = 'inline-block';
    st.classList.remove('animate-stamp');
    void st.offsetWidth;
    st.classList.add('animate-stamp');
  };
  css('BASE-1-stamp', `
  @keyframes baseStamp { 0% { opacity:0; transform:scale(1.6) rotate(-12deg); } 60% { opacity:1; transform:scale(.88) rotate(3deg); } 100% { opacity:1; transform:scale(1) rotate(0); } }
  .animate-stamp { animation: baseStamp 160ms cubic-bezier(0.34, 1.56, 0.64, 1); }`);
};

})();
