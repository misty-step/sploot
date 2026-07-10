/* lab 034 · lane HALL — hallmark lane, three hypermaximalist complete systems.
   HALL-1 overprint (riso print press · maximalism = layered ink)
   HALL-2 switchboard (broadcast control room · maximalism = instrumentation)
   HALL-3 gumball (sticker-bomb candy shop · maximalism = silhouette) */
'use strict';

(() => {

const matchWord = (s) => s >= 90 ? 'closest match' : s >= 75 ? 'strong match' : 'related';

/* ======================================================================
   HALL-1 · overprint — riso catalog press
   ====================================================================== */

function h1card(m, state = '', perf = true) {
  const veil =
    state === 'load' ? `<div class="h1-veil"><span class="h1-veiltag">inking&hellip;</span></div>` :
    state === 'err'  ? `<div class="h1-veil err"><span class="h1-veiltag err">press jam · embed failed</span></div>` : '';
  const stamp =
    state === 'match' ? `<span class="h1-matchstamp">closest<br>match</span>` :
    state === 'near'  ? `<span class="h1-neartag">adjacent</span>` :
    state === 'sel'   ? `<span class="h1-neartag sel">pulled</span>` : '';
  return `
  <article class="h1-card ${state}">
    <div class="h1-card-head"><span>no. ${m.vec}</span><span class="h1-file">${esc(m.file)}</span></div>
    <div class="h1-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}${veil}${stamp}
      ${m.banger ? '<span class="h1-banger">banger</span>' : ''}</div>
    <div class="h1-cap">${esc(m.cap)}${state === 'err' ? ' <button type="button" class="h1-btn compact">re-ink</button>' : ''}</div>
    ${perf ? `<div class="h1-perf"><span>match ${(m.score / 100).toFixed(2)}</span><span>${state === 'dim' ? 'cold' : matchWord(m.score)}</span></div>` : ''}
  </article>`;
}

function h1console(q = 'cat losing it') {
  return `
  <div class="h1-console">
    <div class="h1-console-head"><span>search request slip</span><span>form s-1</span></div>
    <div class="h1-console-body">
      <div class="h1-field"><span class="h1-fieldmark">&gt;</span><span class="h1-q">${esc(q)}</span><span class="h1-caret"></span></div>
      <button type="button" class="h1-btn primary">find it</button>
    </div>
    <div class="h1-console-meta">
      <span>index ${LIB.total.toLocaleString()} plates</span><span>ink ${LIB.model}</span>
      <span>${LIB.dim} channels</span><span>${LIB.latency}ms per pull</span>
    </div>
  </div>`;
}

function h1statusbar() {
  const cells = [['edition', `${LIB.total.toLocaleString()} plates`], ['ink', LIB.model],
    ['queue', `${LIB.queued} drying`], ['pull', `${LIB.latency}ms`], ['press', 'live']];
  return `<div class="h1-statusbar">${cells.map(c => `<span class="cell"><b>${c[0]}</b> ${c[1]}</span>`).join('')}</div>`;
}

SPECS['HALL-1'] = (mount) => {
  css('HALL-1', `
  /* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5
   * macrostructure: catalogue press · theme: custom riso
   * axes: light paper · high-contrast serif · warm red */
  .hall1 {
    --h1-paper:#f6f1e3; --h1-card:#fbf7ec; --h1-tint:#efe7d2; --h1-ink:#1d1a16; --h1-deep:#1d1a16;
    --h1-red:#ff4438; --h1-blue:#0078bf; --h1-green:#00a95c; --h1-yellow:#ffe800; --h1-pink:#ffd3e4;
    --h1-red-ink:#c22417; --h1-blue-ink:#005f96; --h1-green-ink:#00714a;
    --h1-rule:2px solid var(--h1-ink); --h1-rule-thick:6px double var(--h1-ink);
    --h1-perf:2px dashed var(--h1-ink);
    --h1-over:6px 6px 0 var(--h1-red); --h1-over2:5px 5px 0 var(--h1-red), 10px 10px 0 var(--h1-blue);
    --h1-text-over:4px 4px 0 var(--h1-red), 8px 8px 0 var(--h1-blue);
    --h1-line:rgba(29,26,22,.09);
    --h1-fast:90ms; --h1-base:180ms; --h1-ease:cubic-bezier(.2,.8,.2,1);
    --h1-display:'Fraunces',serif; --h1-body:'Bricolage Grotesque',sans-serif; --h1-mono:'IBM Plex Mono',monospace;
    font-family:var(--h1-body); color:var(--h1-ink); min-height:100dvh; display:flex; flex-direction:column;
    overflow-x:clip;
    background:repeating-linear-gradient(to bottom, transparent 0 27px, var(--h1-line) 27px 28px), var(--h1-paper);
  }
  .hall1.theme-dark {
    --h1-paper:#181310; --h1-card:#211a15; --h1-tint:#2a221b; --h1-ink:#f2ead8;
    --h1-red:#ff6a5c; --h1-blue:#3aa0e0; --h1-green:#2fbf7f; --h1-yellow:#e8c93e; --h1-pink:#5c3346;
    --h1-red-ink:#ff9285; --h1-blue-ink:#7cc4f0; --h1-green-ink:#63d6a4;
    --h1-rule:2px solid var(--h1-ink); --h1-rule-thick:6px double var(--h1-ink);
    --h1-perf:2px dashed var(--h1-ink);
    --h1-over:6px 6px 0 var(--h1-red); --h1-over2:5px 5px 0 var(--h1-red), 10px 10px 0 var(--h1-blue);
    --h1-text-over:4px 4px 0 rgba(255,106,92,.75), 8px 8px 0 rgba(58,160,224,.6);
    --h1-line:rgba(242,234,216,.07);
    background:repeating-linear-gradient(to bottom, transparent 0 27px, var(--h1-line) 27px 28px), var(--h1-paper);
  }
  .hall1 :is(button,a,input):focus-visible { outline:3px solid var(--h1-blue-ink); outline-offset:2px; }
  .hall1 .h1-wrap { width:100%; max-width:1180px; margin:0 auto; padding:0 clamp(16px, 4vw, 48px); min-width:0; }
  .hall1 .meme-media { background:var(--h1-tint); }

  /* masthead: press nameplate */
  .h1-mast { border-bottom:var(--h1-rule-thick); background:var(--h1-paper); }
  .h1-mast-top { display:flex; justify-content:space-between; gap:12px; font-family:var(--h1-mono);
    font-size:10px; padding:8px clamp(16px,4vw,48px); border-bottom:var(--h1-rule); }
  .h1-name { font-family:var(--h1-display); font-weight:900; font-size:clamp(40px,7vw,72px);
    line-height:.95; text-align:center; padding:10px 0 4px; text-shadow:var(--h1-text-over); }
  .h1-nav { display:flex; justify-content:center; gap:0; border-top:var(--h1-rule); flex-wrap:wrap; }
  .h1-nav a { color:var(--h1-ink); text-decoration:none; font-family:var(--h1-mono); font-size:11px;
    padding:9px 18px; border-right:1px solid var(--h1-ink); min-height:36px; display:inline-flex; align-items:center; }
  .h1-nav a:first-child { border-left:1px solid var(--h1-ink); }
  .h1-nav a:hover { background:var(--h1-yellow); color:var(--h1-deep); }
  .hall1.theme-dark .h1-nav a:hover { color:#1d1a16; }

  /* hero */
  .h1-hero { padding-top:44px; padding-bottom:16px; display:flex; flex-direction:column; gap:22px; align-items:flex-start; }
  .h1-display { font-family:var(--h1-display); font-weight:900; line-height:.92; letter-spacing:-.01em;
    font-size:clamp(44px,8vw,104px); text-shadow:var(--h1-text-over); overflow-wrap:anywhere; min-width:0; }
  .h1-sub { font-size:clamp(15px,2vw,19px); max-width:560px; }
  .h1-tag { display:inline-block; font-family:var(--h1-mono); font-size:12px; border:var(--h1-rule);
    background:var(--h1-pink); color:var(--h1-ink); padding:6px 12px; box-shadow:var(--h1-over); transform:rotate(-2deg); }
  .hall1 .h1-tag.plain { background:var(--h1-card); transform:rotate(1.2deg); }

  /* section rule */
  .h1-sec { border-top:var(--h1-rule-thick); margin-top:52px; padding:10px 0 20px; display:flex; gap:12px;
    align-items:baseline; font-family:var(--h1-mono); font-size:12px; }
  .h1-sec b { background:var(--h1-red); color:#fff; padding:2px 9px; font-weight:700; }
  .hall1.theme-dark .h1-sec b { color:#181310; }

  /* buttons */
  .h1-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; font-family:var(--h1-mono);
    font-weight:700; font-size:13px; border:var(--h1-rule); background:var(--h1-card); color:var(--h1-ink);
    padding:11px 20px; min-height:44px; box-shadow:var(--h1-over);
    transition:transform var(--h1-fast) var(--h1-ease), box-shadow var(--h1-fast) var(--h1-ease); }
  .h1-btn:hover { transform:translate(-2px,-2px); box-shadow:8px 8px 0 var(--h1-red); }
  .h1-btn:active { transform:translate(6px,6px); box-shadow:0 0 0 var(--h1-red); }
  .h1-btn.primary { background:var(--h1-ink); color:var(--h1-paper); box-shadow:var(--h1-over2); }
  .h1-btn.primary:hover { box-shadow:7px 7px 0 var(--h1-red), 13px 13px 0 var(--h1-blue); }
  .h1-btn.primary:active { box-shadow:0 0 0 var(--h1-red), 0 0 0 var(--h1-blue); }
  .h1-btn.ghost { box-shadow:none; background:transparent; }
  .h1-btn.compact { min-height:32px; padding:4px 10px; font-size:11px; box-shadow:none; border-width:1px; }
  .h1-btn.icon { width:44px; padding:0; }

  /* meme card: catalog card with perforated footer */
  .h1-card { border:var(--h1-rule); background:var(--h1-card); box-shadow:var(--h1-over); min-width:0; }
  .h1-card-head { display:flex; justify-content:space-between; gap:8px; font-family:var(--h1-mono); font-size:9px;
    padding:5px 9px; border-bottom:var(--h1-rule); background:var(--h1-tint); }
  .h1-file { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .h1-art { position:relative; display:grid; place-items:center; overflow:hidden; background:var(--h1-tint); }
  .h1-cap { padding:8px 10px; font-size:12.5px; line-height:1.35; border-top:1px solid var(--h1-ink);
    display:flex; justify-content:space-between; align-items:center; gap:8px; overflow-wrap:anywhere; }
  .h1-perf { border-top:var(--h1-perf); display:flex; justify-content:space-between; padding:6px 10px;
    font-family:var(--h1-mono); font-size:10px; }
  .h1-card.match { box-shadow:var(--h1-over2); border-width:3px; }
  .h1-card.near { box-shadow:6px 6px 0 var(--h1-blue); }
  .h1-card.dim { opacity:.4; filter:grayscale(.6); box-shadow:none; }
  .h1-card.sel { border:4px solid var(--h1-red); }
  .h1-card.load .meme-media { opacity:.3; filter:grayscale(1); }
  .h1-card.err .meme-media { opacity:.25; filter:grayscale(1); }
  .h1-veil { position:absolute; inset:0; display:grid; place-items:center;
    background:repeating-linear-gradient(45deg, transparent 0 10px, var(--h1-line) 10px 20px); }
  .h1-veiltag { font-family:var(--h1-mono); font-size:10px; border:var(--h1-rule); background:var(--h1-yellow);
    color:var(--h1-deep); padding:4px 9px; }
  .hall1.theme-dark .h1-veiltag { color:#1d1a16; }
  .h1-veiltag.err { background:var(--h1-red); color:#fff; }
  .hall1.theme-dark .h1-veiltag.err { color:#181310; }
  .h1-matchstamp { position:absolute; top:8px; left:8px; font-family:var(--h1-mono); font-size:9px; font-weight:700;
    line-height:1.25; text-align:center; color:var(--h1-red-ink); border:2px solid var(--h1-red-ink);
    border-radius:50%; width:64px; height:64px; display:grid; place-items:center; transform:rotate(-9deg);
    background:var(--h1-card); }
  .h1-neartag { position:absolute; top:8px; left:8px; font-family:var(--h1-mono); font-size:9px; font-weight:700;
    color:var(--h1-blue-ink); border:2px solid var(--h1-blue-ink); background:var(--h1-card); padding:3px 7px; }
  .h1-neartag.sel { color:var(--h1-red-ink); border-color:var(--h1-red-ink); }
  .h1-banger { position:absolute; top:8px; right:8px; font-family:var(--h1-mono); font-size:9px; font-weight:700;
    color:#fff; background:var(--h1-red); border:1px solid var(--h1-ink); border-radius:50%;
    width:44px; height:44px; display:grid; place-items:center; transform:rotate(8deg); }
  .hall1.theme-dark .h1-banger { color:#181310; }

  /* console (request slip) */
  .h1-console { border:var(--h1-rule); background:var(--h1-card); box-shadow:var(--h1-over2); max-width:760px; width:100%; }
  .h1-console-head { display:flex; justify-content:space-between; font-family:var(--h1-mono); font-size:11px;
    padding:7px 12px; border-bottom:var(--h1-rule-thick); }
  .h1-console-body { display:flex; gap:12px; padding:14px; align-items:center; }
  .h1-field { flex:1; display:flex; align-items:center; gap:10px; font-family:var(--h1-mono); font-size:15px;
    border-bottom:var(--h1-perf); padding:10px 4px; min-width:0; }
  .h1-fieldmark { color:var(--h1-red-ink); }
  .h1-q { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .h1-caret { width:9px; height:19px; background:var(--h1-red); animation:h1blink 1s steps(1) infinite; }
  @keyframes h1blink { 50% { opacity:0; } }
  .h1-console-meta { display:flex; gap:16px; flex-wrap:wrap; font-family:var(--h1-mono); font-size:10px;
    border-top:var(--h1-rule); background:var(--h1-tint); padding:7px 12px; }

  /* misc components */
  .h1-input { display:flex; align-items:center; gap:10px; border:var(--h1-rule); background:var(--h1-card);
    font-family:var(--h1-mono); font-size:14px; padding:11px 14px; min-width:min(280px,100%); }
  .h1-tabs { display:flex; border:var(--h1-rule); width:max-content; max-width:100%; background:var(--h1-card); }
  .h1-tab { font-family:var(--h1-mono); font-size:12px; padding:11px 18px; min-height:44px; background:none;
    border:0; border-right:1px solid var(--h1-ink); color:var(--h1-ink); }
  .h1-tab:last-child { border-right:0; }
  .h1-tab.on { background:var(--h1-red); color:#fff; font-weight:700; }
  .hall1.theme-dark .h1-tab.on { color:#181310; }
  .h1-toast { display:inline-flex; gap:10px; align-items:center; border:var(--h1-rule); background:var(--h1-green);
    color:var(--h1-deep); box-shadow:var(--h1-over); font-family:var(--h1-mono); font-size:12px; padding:10px 16px; }
  .hall1.theme-dark .h1-toast { color:#181310; }
  .h1-stat { border:var(--h1-rule); background:var(--h1-card); box-shadow:var(--h1-over); padding:12px 16px; min-width:150px; }
  .h1-stat b { display:block; font-family:var(--h1-display); font-weight:900; font-size:36px; line-height:1.05; }
  .h1-stat span { font-family:var(--h1-mono); font-size:10px; }
  .h1-empty { border:var(--h1-rule-thick); background:var(--h1-card); box-shadow:var(--h1-over2); padding:32px;
    max-width:460px; display:flex; flex-direction:column; gap:14px; align-items:flex-start; }
  .h1-statusbar { display:flex; flex-wrap:wrap; border-top:var(--h1-rule); background:var(--h1-ink);
    color:var(--h1-paper); font-family:var(--h1-mono); font-size:10px; }
  .h1-statusbar .cell { padding:8px 14px; border-right:1px dashed var(--h1-paper); }
  .h1-statusbar .cell b { color:var(--h1-yellow); font-weight:700; }
  .hall1.theme-dark .h1-statusbar .cell b { color:#0078bf; }

  /* foundations specimens */
  .h1-shape { border:var(--h1-rule); background:var(--h1-card); width:132px; height:88px; display:grid;
    place-items:center; font-family:var(--h1-mono); font-size:9px; text-align:center; padding:6px; }
  .h1-row { display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start; }
  .h1-row.center { align-items:center; }

  /* register motion demo */
  .h1-reg { position:relative; width:230px; height:96px; }
  .h1-reg i { position:absolute; inset:0; border:var(--h1-rule); transition:transform var(--h1-base) var(--h1-ease); }
  .h1-reg .lr { background:var(--h1-red); transform:translate(12px,10px) rotate(2deg); mix-blend-mode:multiply; }
  .h1-reg .lb { background:var(--h1-blue); transform:translate(-10px,-8px) rotate(-2deg); mix-blend-mode:multiply; }
  .h1-reg .lt { display:grid; place-items:center; font-family:var(--h1-mono); font-size:11px; background:var(--h1-card); }
  .h1-reg.on i { transform:translate(0,0) rotate(0); }
  .hall1.theme-dark .h1-reg .lr, .hall1.theme-dark .h1-reg .lb { mix-blend-mode:screen; }
  @keyframes h1stamp { 0% { opacity:0; transform:scale(1.7) rotate(-16deg); }
    62% { opacity:1; transform:scale(.86) rotate(-6deg); } 100% { opacity:1; transform:scale(1) rotate(-9deg); } }
  .h1-stampdemo { position:static !important; width:64px; height:64px; }
  .h1-stampdemo.pop { animation:h1stamp 220ms var(--h1-ease); }

  /* compositions */
  .h1-bench { border:var(--h1-rule); background:var(--h1-card); }
  .h1-bench-bar { display:flex; gap:14px; align-items:center; padding:12px 16px; border-bottom:var(--h1-rule-thick); flex-wrap:wrap; }
  .h1-bench-name { font-family:var(--h1-display); font-weight:900; font-size:22px; text-shadow:2px 2px 0 var(--h1-red); }
  .h1-bench-main { display:flex; gap:18px; padding:18px; }
  .h1-rail { display:flex; flex-direction:column; gap:8px; min-width:210px; }
  .h1-pile { display:flex; justify-content:space-between; gap:10px; border:1px solid var(--h1-ink);
    background:var(--h1-card); font-family:var(--h1-mono); font-size:11px; padding:9px 11px; color:var(--h1-ink); }
  .h1-pile.on { border:var(--h1-rule); background:var(--h1-yellow); color:var(--h1-deep); font-weight:700; box-shadow:3px 3px 0 var(--h1-red); }
  .hall1.theme-dark .h1-pile.on { color:#1d1a16; }
  .h1-grid { display:grid; gap:20px; grid-template-columns:repeat(4,minmax(0,1fr)); min-width:0; flex:1; }
  .h1-grid.g2 { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .h1-phone { width:390px; max-width:100%; border:var(--h1-rule); box-shadow:var(--h1-over2); background:var(--h1-paper); }
  .h1-dock { display:flex; border-top:var(--h1-rule); background:var(--h1-ink); }
  .h1-dock button { flex:1; min-height:48px; background:none; border:0; border-right:1px dashed var(--h1-paper);
    color:var(--h1-paper); font-family:var(--h1-mono); font-size:10px; }
  .h1-dock button.on { background:var(--h1-red); color:#fff; font-weight:700; }
  .hall1.theme-dark .h1-dock button.on { color:#181310; }

  @media (prefers-reduced-motion: reduce) {
    .hall1 *, .hall1 *::before, .hall1 *::after { animation:none !important; transition:none !important; }
  }
  @media (max-width: 900px) {
    .h1-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .h1-bench-main { flex-direction:column; }
    .h1-rail { flex-direction:row; flex-wrap:wrap; min-width:0; }
  }
  @media (max-width: 480px) {
    .h1-grid { grid-template-columns:repeat(1,minmax(0,1fr)); }
    .h1-grid.g2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .h1-console-body { flex-direction:column; align-items:stretch; }
    .h1-display { text-shadow:2px 2px 0 var(--h1-red), 4px 4px 0 var(--h1-blue); }
  }
  `);
  const M = MEMES;
  mount.innerHTML = `
  <div class="hall1">
    <header class="h1-mast">
      <div class="h1-mast-top"><span>private meme archive · printed nightly</span><span>edition of ${LIB.total.toLocaleString()}</span></div>
      <div class="h1-name">sploot</div>
      <nav class="h1-nav"><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </header>

    <section class="h1-wrap h1-hero">
      <span class="h1-tag">no folders. just vibes.</span>
      <h1 class="h1-display">type words.<br>get the picture.</h1>
      <p class="h1-sub">the pile is ${LIB.total.toLocaleString()} memes deep. search it like a card catalog that actually answers.</p>
      <div class="h1-row center">
        <button type="button" class="h1-btn primary">find it</button>
        <button type="button" class="h1-btn">shuffle the pile</button>
      </div>
      ${h1console()}
      <div class="h1-grid" style="width:100%">${M.slice(0, 4).map((x, i) => h1card(x, i === 0 ? 'match' : '', i === 0)).join('')}</div>
    </section>

    <div class="h1-wrap"><div class="h1-sec"><b>01</b> foundations · riso ink, rules, perforation</div></div>
    <div class="h1-wrap">${swatches([
      ['ink', '#1d1a16', '#f6f1e3'], ['paper', '#f6f1e3'], ['card', '#fbf7ec'], ['riso red', '#ff4438', '#fff'],
      ['riso blue', '#0078bf', '#fff'], ['riso green', '#00a95c', '#fff'], ['riso yellow', '#ffe800'], ['pink tint', '#ffd3e4']])}
      <div class="h1-row" style="margin-top:20px">
        <div class="h1-shape" style="border-width:1px">hairline rule</div>
        <div class="h1-shape">2px ink rule</div>
        <div class="h1-shape" style="border:var(--h1-rule-thick)">6px double · section</div>
        <div class="h1-shape" style="border-style:dashed">perforation</div>
        <div class="h1-shape" style="box-shadow:var(--h1-over)">overprint · one layer</div>
        <div class="h1-shape" style="box-shadow:var(--h1-over2)">overprint · two layers</div>
        <div class="h1-shape" style="border-radius:50%;width:88px">round stamp exception</div>
      </div>
      <p style="margin-top:14px;font-family:var(--h1-mono);font-size:10px">spacing rides a 28px baseline ledger. gutters stay tight, margins stay generous.</p>
    </div>

    <div class="h1-wrap"><div class="h1-sec"><b>02</b> type specimen</div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="h1-display" style="font-size:clamp(34px,5vw,58px)">display · fraunces black</div>
        <div style="font-size:17px;max-width:560px">body · bricolage grotesque. the pile sorts itself into piles while you sleep. the press never closes.</div>
        <div style="font-family:var(--h1-mono);font-size:12px">label · ibm plex mono</div>
        <div style="font-family:var(--h1-mono);font-size:10px;opacity:.7">metadata · no. 0413 · ${LIB.latency}ms · ${LIB.model}</div>
        <div style="font-family:var(--h1-mono);font-size:26px;font-variant-numeric:tabular-nums">${LIB.total.toLocaleString()} · 0.94 · ${LIB.latency}ms</div>
        <div style="font-size:13px;max-width:430px;border-left:3px solid var(--h1-red);padding-left:12px">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me is now framed above my desk like a diploma.</div>
      </div>
    </div>

    <div class="h1-wrap"><div class="h1-sec"><b>03</b> components · the catalog kit</div>
      <div style="display:flex;flex-direction:column;gap:28px">
        ${h1console('sad frog')}
        <div class="h1-grid">
          ${h1card(M[0], 'match')}${h1card(M[1], 'near')}${h1card(M[2], 'dim')}${h1card(M[3], '')}
        </div>
        <div class="h1-grid">
          ${h1card(M[4], 'sel')}${h1card(M[5], 'load')}${h1card(M[6], 'err')}
          <div class="h1-empty">
            <span class="h1-tag">the catalog is empty</span>
            <p style="font-size:15px">zero memes on file. the press is warm and waiting. feed it upload chaos and it starts printing.</p>
            <button type="button" class="h1-btn primary">upload chaos</button>
          </div>
        </div>
        <div class="h1-row center">
          <button type="button" class="h1-btn primary">find it</button>
          <button type="button" class="h1-btn">shuffle the pile</button>
          <button type="button" class="h1-btn ghost">secondary</button>
          <button type="button" class="h1-btn compact">compact</button>
          <button type="button" class="h1-btn icon">&#10005;</button>
          <span class="h1-tag plain">sticker · form s-1</span>
          <span class="h1-banger h1-stampdemo" style="display:grid">banger</span>
        </div>
        <div class="h1-row center">
          <div class="h1-input"><span style="color:var(--h1-red-ink)">&gt;</span><span>text input</span><span class="h1-caret"></span></div>
          <div class="h1-tabs"><button type="button" class="h1-tab on">all</button><button type="button" class="h1-tab">bangers</button><button type="button" class="h1-tab">recent</button></div>
          <div class="h1-toast">stamped and filed. it is in the pile.</div>
        </div>
        <div class="h1-row">
          <div class="h1-stat"><span>folders required</span><b>0</b></div>
          <div class="h1-stat"><span>plates printed</span><b>${LIB.total.toLocaleString()}</b></div>
          <div class="h1-stat"><span>drying rack</span><b>${LIB.queued}</b></div>
        </div>
        ${h1statusbar()}
      </div>
    </div>

    <div class="h1-wrap"><div class="h1-sec"><b>04</b> motion · print mechanics, on interaction only</div>
      <div class="h1-row center">
        <button type="button" class="h1-btn primary">press me · slam into the ink</button>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">
          <div class="h1-reg" id="hall1-reg"><i class="lr"></i><i class="lb"></i><i class="lt">misregistered</i></div>
          <button type="button" class="h1-btn compact" id="hall1-reg-go">pull the register lever</button>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <span class="h1-banger h1-stampdemo" id="hall1-stamp" style="display:grid">banger</span>
          <button type="button" class="h1-btn compact" id="hall1-stamp-go">replay stamp</button>
        </div>
      </div>
      <p style="margin-top:12px;font-family:var(--h1-mono);font-size:10px">reduced motion: stamps and registers land instantly. nothing travels.</p>
    </div>

    <div class="h1-wrap"><div class="h1-sec"><b>05</b> compositions · workbench + pocket edition</div>
      <div class="h1-bench">
        <div class="h1-bench-bar">
          <span class="h1-bench-name">sploot</span>
          <div class="h1-field" style="flex:1;max-width:420px;border:var(--h1-rule);padding:9px 12px"><span class="h1-fieldmark">&gt;</span><span class="h1-q">search the pile</span></div>
          <button type="button" class="h1-btn compact">upload</button>
          <button type="button" class="h1-btn compact">bangers</button>
          <button type="button" class="h1-btn compact">shuffle</button>
        </div>
        <div class="h1-bench-main">
          <div class="h1-rail">${PILES.slice(0, 5).map((p, i) => `<button type="button" class="h1-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}</div>
          <div class="h1-grid">${M.slice(0, 8).map(x => h1card(x, '', false)).join('')}</div>
        </div>
        ${h1statusbar()}
      </div>
      <div class="h1-phone" style="margin:26px 0 48px">
        <div class="h1-mast-top" style="border-bottom:var(--h1-rule)"><span style="font-family:var(--h1-display);font-weight:900;font-size:16px">sploot</span><span>${LIB.total.toLocaleString()}</span></div>
        <div style="padding:12px;display:flex;flex-direction:column;gap:12px">
          <div class="h1-input" style="min-width:0"><span style="color:var(--h1-red-ink)">&gt;</span><span>cat losing it</span></div>
          <div class="h1-grid g2">${M.slice(0, 4).map(x => h1card(x, '', false)).join('')}</div>
        </div>
        <div class="h1-dock"><button type="button" class="on">pile</button><button type="button">search</button><button type="button">upload</button><button type="button">bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'overprint · riso catalog press'], ['type', 'fraunces 900 / bricolage grotesque / ibm plex mono'],
        ['move', 'maximalism lives in layered ink: every elevation step is another overprint'],
        ['density', 'ledger tight'], ['motion', 'print mechanics: stamp, register, slam']])}
    </div>
  </div>`;
  themeToggle(mount.querySelector('.hall1'));
  const reg = mount.querySelector('#hall1-reg');
  const regGo = mount.querySelector('#hall1-reg-go');
  if (reg && regGo) regGo.onclick = () => {
    const on = reg.classList.toggle('on');
    reg.querySelector('.lt').textContent = on ? 'in register' : 'misregistered';
    regGo.textContent = on ? 'knock it loose' : 'pull the register lever';
  };
  const st = mount.querySelector('#hall1-stamp');
  const stGo = mount.querySelector('#hall1-stamp-go');
  if (st && stGo) stGo.onclick = () => {
    st.classList.remove('pop'); void st.offsetWidth; st.classList.add('pop');
  };
};

/* ======================================================================
   HALL-2 · switchboard — broadcast control room
   ====================================================================== */

function h2mon(m, state = '') {
  const word = state === 'match' ? 'signal lock' : state === 'near' ? 'adjacent' : state === 'dim' ? 'weak'
    : state === 'sel' ? 'monitoring' : state === 'load' ? 'tuning' : state === 'err' ? 'dead air' : matchWord(m.score);
  const veil =
    state === 'load' ? `<div class="h2-veil"><span class="h2-veiltag">tuning&hellip;</span></div>` :
    state === 'err'  ? `<div class="h2-veil err"><span class="h2-veiltag err">dead air · embed failed</span></div>` : '';
  return `
  <article class="h2-mon ${state}">
    <div class="h2-mon-head"><b>ch ${m.vec.slice(-2)}</b><span class="h2-file">${esc(m.file)}</span><i class="h2-led ${state}"></i></div>
    <div class="h2-screen" style="aspect-ratio:${m.aspect}">${memeImg(m)}${veil}</div>
    <div class="h2-mon-foot">
      <span class="h2-meter"><i style="width:${state === 'err' ? 0 : m.score}%"></i></span>
      <b class="h2-read">${state === 'err' ? '0.00' : (m.score / 100).toFixed(2)}</b>
      <span class="h2-word">${word}</span>
      ${m.banger ? '<span class="h2-banger">banger</span>' : ''}
    </div>
    <div class="h2-cap">${esc(m.cap)}${state === 'err' ? ' <button type="button" class="h2-btn compact">retune</button>' : ''}</div>
  </article>`;
}

function h2console(q = 'cat losing it') {
  return `
  <div class="h2-desk">
    <div class="h2-desk-head"><span>sploot signal desk</span><span>board a</span>
      <span class="h2-leds"><i class="ok"></i><i class="warn"></i><i class="hot"></i></span></div>
    <div class="h2-desk-body">
      <div class="h2-field"><span class="h2-prompt">&gt;</span><span class="h2-q">${esc(q)}</span><span class="h2-caret"></span></div>
      <button type="button" class="h2-btn primary">find it</button>
    </div>
    <div class="h2-desk-meters">
      <span class="h2-mlabel">latency</span><span class="h2-meter wide"><i style="width:21%"></i></span><b class="h2-read">${LIB.latency}ms</b>
      <span class="h2-mlabel">index</span><span class="h2-meter wide"><i style="width:100%"></i></span><b class="h2-read">${LIB.total.toLocaleString()}</b>
    </div>
    <div class="h2-desk-meta"><span>model ${LIB.model}</span><span>dim ${LIB.dim}</span><span>embedded ${LIB.embedded.toLocaleString()}</span><span>queue ${LIB.queued}</span></div>
  </div>`;
}

function h2statusbar() {
  const cells = [['index', `${LIB.total.toLocaleString()} vec`], ['model', LIB.model],
    ['queue', `${LIB.queued} embedding`], ['latency', `${LIB.latency}ms`], ['board', 'live', 1]];
  return `<div class="h2-statusbar">${cells.map(c =>
    `<span class="cell">${c[2] ? '<i class="h2-led ok"></i>' : ''}<b>${c[0]}</b> ${c[1]}</span>`).join('')}</div>`;
}

SPECS['HALL-2'] = (mount) => {
  css('HALL-2', `
  /* Hallmark · pre-emit critique: P5 H4 E5 S5 R4 V5
   * macrostructure: workbench console · theme: custom control-room
   * axes: light console paint (dark night mode) · condensed sans display · amber accent */
  .hall2 {
    --h2-bg:#e7eae2; --h2-panel:#f2f4ee; --h2-well:#dde1d6; --h2-ink:#141f19; --h2-deep:#141f19;
    --h2-amber:#ffb020; --h2-green:#31d57c; --h2-cyan:#45cfe0; --h2-red:#ff5340;
    --h2-amber-ink:#845200; --h2-green-ink:#0b7a44; --h2-red-ink:#c22417;
    --h2-bezel:3px solid var(--h2-ink); --h2-hair:1px solid var(--h2-ink);
    --h2-key:0 4px 0 var(--h2-ink); --h2-grid:rgba(20,31,25,.06);
    --h2-fast:80ms; --h2-base:160ms; --h2-fill:600ms; --h2-ease:cubic-bezier(.2,.8,.2,1);
    --h2-display:'Anton',sans-serif; --h2-body:'Space Grotesk',sans-serif;
    --h2-mono:'IBM Plex Mono',monospace; --h2-crt:'VT323',monospace;
    font-family:var(--h2-body); color:var(--h2-ink); min-height:100dvh; display:flex; flex-direction:column;
    overflow-x:clip;
    background:linear-gradient(var(--h2-grid) 1px, transparent 1px),
      linear-gradient(90deg, var(--h2-grid) 1px, transparent 1px), var(--h2-bg);
    background-size:8px 8px, 8px 8px, auto;
  }
  .hall2.theme-dark {
    --h2-bg:#0b110d; --h2-panel:#121a14; --h2-well:#0e1510; --h2-ink:#dcefe3;
    --h2-amber:#ffb454; --h2-green:#46e08c; --h2-cyan:#5bd5e4; --h2-red:#ff7a6c;
    --h2-amber-ink:#ffb454; --h2-green-ink:#46e08c; --h2-red-ink:#ff8f83;
    --h2-bezel:3px solid var(--h2-ink); --h2-hair:1px solid var(--h2-ink);
    --h2-key:0 4px 0 var(--h2-ink); --h2-grid:rgba(220,239,227,.05);
    background:linear-gradient(var(--h2-grid) 1px, transparent 1px),
      linear-gradient(90deg, var(--h2-grid) 1px, transparent 1px), var(--h2-bg);
    background-size:8px 8px, 8px 8px, auto;
  }
  .hall2 :is(button,a,input):focus-visible { outline:3px solid var(--h2-amber-ink); outline-offset:2px; }
  .hall2 .h2-wrap { width:100%; max-width:1200px; margin:0 auto; padding:0 clamp(14px,3.5vw,44px); min-width:0; }
  .hall2 .meme-media { background:var(--h2-well); }

  /* panel anatomy: bezel + screws */
  .h2-panel { position:relative; border:var(--h2-bezel); background:var(--h2-panel); }
  .h2-panel::before, .h2-panel::after { content:""; position:absolute; top:5px; width:6px; height:6px;
    border-radius:50%; background:var(--h2-ink); opacity:.45; }
  .h2-panel::before { left:5px; } .h2-panel::after { right:5px; }

  /* masthead: desk strip */
  .h2-mast { display:flex; align-items:center; gap:16px; flex-wrap:wrap; padding:10px clamp(14px,3.5vw,44px);
    border-bottom:var(--h2-bezel); background:var(--h2-panel); }
  .h2-logo { font-family:var(--h2-display); font-size:26px; letter-spacing:.02em; }
  .h2-plate { font-family:var(--h2-mono); font-size:10px; background:var(--h2-ink); color:var(--h2-bg); padding:3px 8px; }
  .h2-mastnav { margin-left:auto; display:flex; gap:2px; flex-wrap:wrap; }
  .h2-mastnav a { color:var(--h2-ink); text-decoration:none; font-family:var(--h2-mono); font-size:11px;
    border:var(--h2-hair); padding:7px 12px; min-height:36px; display:inline-flex; align-items:center; }
  .h2-mastnav a:hover { background:var(--h2-amber); color:var(--h2-deep); }
  .hall2.theme-dark .h2-mastnav a:hover { color:#141f19; }

  /* hero */
  .h2-hero { padding-top:40px; padding-bottom:12px; display:flex; flex-direction:column; gap:20px; align-items:flex-start; }
  .h2-display { font-family:var(--h2-display); line-height:.94; font-size:clamp(44px,7.5vw,100px);
    overflow-wrap:anywhere; min-width:0; }
  .h2-display .hot { color:var(--h2-amber-ink); box-shadow:inset 0 -0.14em 0 var(--h2-amber); }
  .hall2.theme-dark .h2-display .hot { box-shadow:inset 0 -0.14em 0 rgba(255,180,84,.35); }
  .h2-sub { font-size:clamp(15px,2vw,19px); max-width:560px; }

  /* leds + meters */
  .h2-led { width:9px; height:9px; border-radius:50%; border:1px solid var(--h2-ink); background:var(--h2-well); display:inline-block; flex:none; }
  .h2-led.ok, .h2-led.match, .h2-led.sel { background:var(--h2-green); }
  .h2-led.load { background:var(--h2-amber); }
  .h2-led.err { background:var(--h2-red); }
  .h2-meter { position:relative; flex:1; min-width:56px; height:12px; border:var(--h2-hair); background:var(--h2-well); overflow:hidden; }
  .h2-meter.wide { max-width:220px; }
  .h2-meter i { display:block; height:100%; background:repeating-linear-gradient(90deg, var(--h2-amber) 0 6px, transparent 6px 9px);
    transition:width var(--h2-fill) var(--h2-ease); }
  .h2-read { font-family:var(--h2-crt); font-size:20px; line-height:1; font-variant-numeric:tabular-nums; }
  .h2-mlabel { font-family:var(--h2-mono); font-size:10px; }

  /* buttons: raised console keys */
  .h2-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; font-family:var(--h2-mono);
    font-weight:600; font-size:13px; border:var(--h2-bezel); background:var(--h2-panel); color:var(--h2-ink);
    padding:10px 20px; min-height:44px; box-shadow:var(--h2-key);
    transition:transform var(--h2-fast) var(--h2-ease), box-shadow var(--h2-fast) var(--h2-ease); }
  .h2-btn:hover { background:var(--h2-well); }
  .h2-btn:active { transform:translateY(4px); box-shadow:0 0 0 var(--h2-ink); }
  .h2-btn.primary { background:var(--h2-amber); color:var(--h2-deep); }
  .hall2.theme-dark .h2-btn.primary { color:#141f19; }
  .h2-btn.ghost { box-shadow:none; background:transparent; border-width:1px; padding:12px 20px; }
  .h2-btn.compact { min-height:32px; padding:4px 10px; font-size:11px; box-shadow:none; border-width:1px; }
  .h2-btn.icon { width:44px; padding:0; }

  /* toggle switch */
  .h2-switch { display:inline-flex; align-items:center; gap:10px; border:0; background:none; font-family:var(--h2-mono);
    font-size:11px; color:var(--h2-ink); min-height:44px; padding:0; }
  .h2-switch .track { width:52px; height:26px; border:var(--h2-bezel); background:var(--h2-well); position:relative; flex:none; }
  .h2-switch .knob { position:absolute; top:2px; left:2px; width:18px; height:18px; background:var(--h2-ink);
    transition:transform var(--h2-base) var(--h2-ease); }
  .h2-switch[aria-pressed="true"] .knob { transform:translateX(26px); }
  .h2-switch[aria-pressed="true"] .track { background:var(--h2-green); }

  /* monitor cell */
  .h2-mon { border:var(--h2-bezel); background:var(--h2-panel); min-width:0; }
  .h2-mon-head { display:flex; align-items:center; gap:8px; padding:5px 8px; border-bottom:var(--h2-bezel);
    font-family:var(--h2-mono); font-size:9px; }
  .h2-mon-head b { background:var(--h2-ink); color:var(--h2-bg); padding:1px 6px; font-weight:600; flex:none; }
  .h2-mon-head .h2-led { margin-left:auto; }
  .h2-file { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
  .h2-screen { position:relative; display:grid; place-items:center; overflow:hidden; background:var(--h2-well);
    border-bottom:var(--h2-hair); }
  .h2-mon-foot { display:flex; align-items:center; gap:8px; padding:6px 8px; border-bottom:var(--h2-hair); }
  .h2-word { font-family:var(--h2-mono); font-size:9px; flex:none; }
  .h2-cap { padding:7px 9px; font-size:12.5px; line-height:1.35; display:flex; justify-content:space-between;
    gap:8px; align-items:center; overflow-wrap:anywhere; }
  .h2-banger { font-family:var(--h2-mono); font-size:9px; font-weight:600; background:var(--h2-amber);
    color:var(--h2-deep); border:1px solid var(--h2-ink); padding:1px 5px; flex:none; }
  .hall2.theme-dark .h2-banger { color:#141f19; }
  .h2-mon.match { box-shadow:0 0 0 3px var(--h2-amber), var(--h2-key); }
  .h2-mon.match .h2-meter i { background:repeating-linear-gradient(90deg, var(--h2-green) 0 6px, transparent 6px 9px); }
  .h2-mon.near { border-style:dashed; }
  .h2-mon.dim { opacity:.4; filter:grayscale(.6); }
  .h2-mon.sel { border-width:5px; }
  .h2-mon.load .meme-media { opacity:.3; filter:grayscale(1); }
  .h2-mon.err .meme-media { opacity:.2; filter:grayscale(1); }
  .h2-veil { position:absolute; inset:0; display:grid; place-items:center;
    background:repeating-linear-gradient(0deg, transparent 0 3px, var(--h2-grid) 3px 6px); }
  .h2-veiltag { font-family:var(--h2-mono); font-size:10px; border:var(--h2-hair); background:var(--h2-amber);
    color:var(--h2-deep); padding:4px 9px; }
  .hall2.theme-dark .h2-veiltag { color:#141f19; }
  .h2-veiltag.err { background:var(--h2-red); }
  @keyframes h2blip { 0% { transform:scaleY(1); filter:brightness(1); } 40% { transform:scaleY(.96); filter:brightness(1.35); } 100% { transform:scaleY(1); filter:brightness(1); } }
  .h2-mon.blip { animation:h2blip 180ms var(--h2-ease); }

  /* signal desk */
  .h2-desk { border:var(--h2-bezel); background:var(--h2-panel); box-shadow:var(--h2-key); max-width:800px; width:100%; }
  .h2-desk-head { display:flex; align-items:center; gap:12px; background:var(--h2-ink); color:var(--h2-bg);
    font-family:var(--h2-mono); font-size:11px; padding:7px 12px; }
  .h2-leds { display:flex; gap:5px; margin-left:auto; }
  .h2-leds i { width:9px; height:9px; border-radius:50%; display:block; }
  .h2-leds .ok { background:var(--h2-green); } .h2-leds .warn { background:var(--h2-amber); } .h2-leds .hot { background:var(--h2-red); }
  .h2-desk-body { display:flex; gap:12px; padding:14px; align-items:center; }
  .h2-field { flex:1; display:flex; align-items:center; gap:10px; border:var(--h2-bezel); background:var(--h2-well);
    font-family:var(--h2-mono); font-size:15px; padding:11px 14px; min-width:0; }
  .h2-prompt { color:var(--h2-amber-ink); }
  .h2-q { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .h2-caret { width:10px; height:20px; background:var(--h2-amber); animation:h2blink 1s steps(1) infinite; }
  @keyframes h2blink { 50% { opacity:0; } }
  .h2-desk-meters { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 14px; border-top:var(--h2-hair); }
  .h2-desk-meta { display:flex; gap:16px; flex-wrap:wrap; font-family:var(--h2-mono); font-size:10px;
    border-top:var(--h2-hair); background:var(--h2-well); padding:7px 14px; }

  /* misc components */
  .h2-input { display:flex; align-items:center; gap:10px; border:var(--h2-bezel); background:var(--h2-well);
    font-family:var(--h2-mono); font-size:14px; padding:10px 14px; min-width:min(280px,100%); }
  .h2-tabs { display:flex; border:var(--h2-bezel); width:max-content; max-width:100%; background:var(--h2-panel); }
  .h2-tab { font-family:var(--h2-mono); font-size:12px; padding:11px 18px; min-height:44px; background:none; border:0;
    border-right:var(--h2-hair); color:var(--h2-ink); display:inline-flex; align-items:center; gap:7px; }
  .h2-tab:last-child { border-right:0; }
  .h2-tab.on { background:var(--h2-ink); color:var(--h2-bg); font-weight:600; }
  .h2-tab.on::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--h2-green); }
  .h2-toast { display:inline-flex; gap:10px; align-items:center; border:var(--h2-bezel); background:var(--h2-panel);
    box-shadow:var(--h2-key); font-family:var(--h2-mono); font-size:12px; padding:10px 16px; }
  .h2-toast i { width:9px; height:9px; border-radius:50%; background:var(--h2-green); flex:none; }
  .h2-stat { border:var(--h2-bezel); background:var(--h2-panel); box-shadow:var(--h2-key); padding:12px 16px; min-width:160px; }
  .h2-stat b { display:block; font-family:var(--h2-crt); font-size:44px; line-height:1; font-variant-numeric:tabular-nums; }
  .h2-stat span { font-family:var(--h2-mono); font-size:10px; }
  .h2-empty { border:var(--h2-bezel); background:var(--h2-panel); box-shadow:var(--h2-key); padding:32px; max-width:460px;
    display:flex; flex-direction:column; gap:14px; align-items:flex-start; }
  .h2-statusbar { display:flex; flex-wrap:wrap; border-top:var(--h2-bezel); background:var(--h2-ink);
    color:var(--h2-bg); font-family:var(--h2-mono); font-size:10px; }
  .h2-statusbar .cell { display:flex; align-items:center; gap:7px; padding:8px 14px; border-right:1px solid var(--h2-bg); }
  .h2-statusbar .cell b { color:var(--h2-amber); font-weight:600; }
  .hall2.theme-dark .h2-statusbar .cell b { color:#845200; }

  .h2-sec { border-top:var(--h2-bezel); margin-top:52px; padding:10px 0 20px; display:flex; gap:12px;
    align-items:center; font-family:var(--h2-mono); font-size:12px; }
  .h2-sec b { background:var(--h2-ink); color:var(--h2-bg); padding:2px 9px; font-weight:600; }
  .h2-shape { border:var(--h2-bezel); background:var(--h2-panel); width:132px; height:88px; display:grid;
    place-items:center; font-family:var(--h2-mono); font-size:9px; text-align:center; padding:6px; }
  .h2-row { display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start; }
  .h2-row.center { align-items:center; }

  /* compositions */
  .h2-bench { border:var(--h2-bezel); background:var(--h2-panel); }
  .h2-bench-bar { display:flex; gap:12px; align-items:center; padding:12px 16px; border-bottom:var(--h2-bezel); flex-wrap:wrap; }
  .h2-bench-main { display:flex; gap:16px; padding:16px; }
  .h2-rail { display:flex; flex-direction:column; gap:8px; min-width:216px; }
  .h2-pile { display:flex; justify-content:space-between; align-items:center; gap:10px; border:var(--h2-hair);
    background:var(--h2-panel); font-family:var(--h2-mono); font-size:11px; padding:9px 11px; color:var(--h2-ink); }
  .h2-pile b { font-family:var(--h2-crt); font-size:17px; font-weight:400; }
  .h2-pile.on { border:var(--h2-bezel); background:var(--h2-amber); color:var(--h2-deep); }
  .hall2.theme-dark .h2-pile.on { color:#141f19; }
  .h2-grid { display:grid; gap:14px; grid-template-columns:repeat(4,minmax(0,1fr)); min-width:0; flex:1; }
  .h2-grid.g2 { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .h2-phone { width:390px; max-width:100%; border:var(--h2-bezel); box-shadow:var(--h2-key); background:var(--h2-bg); }
  .h2-dock { display:flex; border-top:var(--h2-bezel); background:var(--h2-ink); }
  .h2-dock button { flex:1; min-height:48px; background:none; border:0; border-right:1px solid var(--h2-bg);
    color:var(--h2-bg); font-family:var(--h2-mono); font-size:10px; }
  .h2-dock button.on { background:var(--h2-amber); color:var(--h2-deep); font-weight:600; }
  .hall2.theme-dark .h2-dock button.on { color:#141f19; }

  @media (prefers-reduced-motion: reduce) {
    .hall2 *, .hall2 *::before, .hall2 *::after { animation:none !important; transition:none !important; }
  }
  @media (max-width: 900px) {
    .h2-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .h2-bench-main { flex-direction:column; }
    .h2-rail { flex-direction:row; flex-wrap:wrap; min-width:0; }
  }
  @media (max-width: 480px) {
    .h2-grid { grid-template-columns:repeat(1,minmax(0,1fr)); }
    .h2-grid.g2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .h2-desk-body { flex-direction:column; align-items:stretch; }
    .h2-mastnav { margin-left:0; }
  }
  `);
  const M = MEMES;
  mount.innerHTML = `
  <div class="hall2">
    <header class="h2-mast">
      <span class="h2-logo">sploot</span>
      <span class="h2-plate">signal desk</span>
      <span class="h2-plate">board a · live</span>
      <nav class="h2-mastnav"><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </header>

    <section class="h2-wrap h2-hero">
      <span class="h2-plate">every meme is on the board</span>
      <h1 class="h2-display">type words.<br><span class="hot">get the picture.</span></h1>
      <p class="h2-sub">${LIB.total.toLocaleString()} memes wired into one console. tune the desk and the pile answers in ${LIB.latency}ms.</p>
      <div class="h2-row center">
        <button type="button" class="h2-btn primary">find it</button>
        <button type="button" class="h2-btn">shuffle the pile</button>
      </div>
      ${h2console()}
      <div class="h2-grid" style="width:100%">${M.slice(0, 4).map((x, i) => h2mon(x, i === 0 ? 'match' : '')).join('')}</div>
    </section>

    <div class="h2-wrap"><div class="h2-sec"><b>01</b> foundations · console paint, bezels, meters</div></div>
    <div class="h2-wrap">${swatches([
      ['ink', '#141f19', '#e7eae2'], ['console', '#e7eae2'], ['panel', '#f2f4ee'], ['well', '#dde1d6'],
      ['amber', '#ffb020'], ['signal green', '#31d57c'], ['cyan', '#45cfe0'], ['alarm red', '#ff5340']])}
      <div class="h2-row" style="margin-top:20px">
        <div class="h2-shape" style="border-width:1px">hairline · trace</div>
        <div class="h2-shape">3px bezel · panel</div>
        <div class="h2-shape h2-panel">bezel + screws</div>
        <div class="h2-shape" style="box-shadow:var(--h2-key)">raised key</div>
        <div class="h2-shape" style="border-style:dashed">adjacent · dashed</div>
        <div class="h2-shape" style="background:var(--h2-ink);color:var(--h2-bg)">inverse plate</div>
        <div class="h2-shape" style="border-radius:50%;width:88px">led exception</div>
      </div>
      <p style="margin-top:14px;font-family:var(--h2-mono);font-size:10px">everything snaps to an 8px instrument grid. panels pack tight, readouts get air.</p>
    </div>

    <div class="h2-wrap"><div class="h2-sec"><b>02</b> type specimen</div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="font-family:var(--h2-display);font-size:clamp(34px,5vw,58px);line-height:.95">display · anton</div>
        <div style="font-size:17px;max-width:560px">body · space grotesk. the desk hums, the meters move, and the pile sorts itself while you sleep.</div>
        <div style="font-family:var(--h2-mono);font-size:12px">label · ibm plex mono</div>
        <div style="font-family:var(--h2-mono);font-size:10px;opacity:.7">metadata · ch 13 · vec 0413 · ${LIB.latency}ms · ${LIB.model}</div>
        <div class="h2-read" style="font-size:34px">${LIB.total.toLocaleString()} · 0.94 · ${LIB.latency}ms <span style="font-family:var(--h2-mono);font-size:10px">· vt323 readout numerals</span></div>
        <div style="font-size:13px;max-width:430px;border-left:3px solid var(--h2-amber);padding-left:12px">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me is now framed above my desk like a diploma.</div>
      </div>
    </div>

    <div class="h2-wrap"><div class="h2-sec"><b>03</b> components · the board</div>
      <div style="display:flex;flex-direction:column;gap:28px">
        ${h2console('sad frog')}
        <div class="h2-grid">
          ${h2mon(M[0], 'match')}${h2mon(M[1], 'near')}${h2mon(M[2], 'dim')}${h2mon(M[3], '')}
        </div>
        <div class="h2-grid">
          ${h2mon(M[4], 'sel')}${h2mon(M[5], 'load')}${h2mon(M[6], 'err')}
          <div class="h2-empty">
            <span class="h2-plate">no signal</span>
            <p style="font-size:15px">the pile is empty and every channel is static. upload something and watch the meters move.</p>
            <button type="button" class="h2-btn primary">upload chaos</button>
          </div>
        </div>
        <div class="h2-row center">
          <button type="button" class="h2-btn primary">find it</button>
          <button type="button" class="h2-btn">shuffle the pile</button>
          <button type="button" class="h2-btn ghost">secondary</button>
          <button type="button" class="h2-btn compact">compact</button>
          <button type="button" class="h2-btn icon">&#10005;</button>
          <span class="h2-plate">tag · board a</span>
          <span class="h2-banger">banger</span>
        </div>
        <div class="h2-row center">
          <div class="h2-input"><span class="h2-prompt">&gt;</span><span>text input</span><span class="h2-caret" style="width:9px;height:18px"></span></div>
          <div class="h2-tabs"><button type="button" class="h2-tab on">all</button><button type="button" class="h2-tab">bangers</button><button type="button" class="h2-tab">recent</button></div>
          <div class="h2-toast"><i></i>signal locked. saved to the pile.</div>
        </div>
        <div class="h2-row">
          <div class="h2-stat"><span>folders required</span><b>0</b></div>
          <div class="h2-stat"><span>memes indexed</span><b>${LIB.total.toLocaleString()}</b></div>
          <div class="h2-stat"><span>queue</span><b>${LIB.queued}</b></div>
        </div>
        ${h2statusbar()}
      </div>
    </div>

    <div class="h2-wrap"><div class="h2-sec"><b>04</b> motion · electromechanical, on interaction only</div>
      <div class="h2-row center">
        <div style="display:flex;flex-direction:column;gap:8px;min-width:min(260px,100%)">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="h2-meter wide"><i id="hall2-vu" style="width:8%"></i></span><b class="h2-read" id="hall2-vu-read">0.08</b>
          </div>
          <button type="button" class="h2-btn compact" id="hall2-vu-go">run signal check</button>
        </div>
        <button type="button" class="h2-switch" id="hall2-sw" aria-pressed="false">
          <span class="track"><span class="knob"></span></span><span id="hall2-sw-label">match ring · off</span>
        </button>
        <div style="display:flex;flex-direction:column;gap:8px;max-width:240px">
          <div id="hall2-blip">${h2mon(M[7], '')}</div>
          <button type="button" class="h2-btn compact" id="hall2-blip-go">blip the channel</button>
        </div>
      </div>
      <p style="margin-top:12px;font-family:var(--h2-mono);font-size:10px">reduced motion: meters jump straight to value. switches cut without travel.</p>
    </div>

    <div class="h2-wrap"><div class="h2-sec"><b>05</b> compositions · master control + field unit</div>
      <div class="h2-bench">
        <div class="h2-bench-bar">
          <span class="h2-logo" style="font-size:18px">sploot</span>
          <div class="h2-field" style="flex:1;max-width:420px;padding:9px 12px"><span class="h2-prompt">&gt;</span><span class="h2-q">search the pile</span></div>
          <button type="button" class="h2-btn compact">upload</button>
          <button type="button" class="h2-btn compact">bangers</button>
          <button type="button" class="h2-btn compact">shuffle</button>
        </div>
        <div class="h2-bench-main">
          <div class="h2-rail">${PILES.slice(0, 5).map((p, i) => `<button type="button" class="h2-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}</div>
          <div class="h2-grid">${M.slice(0, 8).map(x => h2mon(x)).join('')}</div>
        </div>
        ${h2statusbar()}
      </div>
      <div class="h2-phone" style="margin:26px 0 48px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-bottom:var(--h2-bezel)">
          <span class="h2-logo" style="font-size:16px">sploot</span><span class="h2-plate">${LIB.total.toLocaleString()}</span>
        </div>
        <div style="padding:12px;display:flex;flex-direction:column;gap:12px">
          <div class="h2-input" style="min-width:0"><span class="h2-prompt">&gt;</span><span>cat losing it</span></div>
          <div class="h2-grid g2">${M.slice(0, 4).map(x => h2mon(x)).join('')}</div>
        </div>
        <div class="h2-dock"><button type="button" class="on">pile</button><button type="button">search</button><button type="button">upload</button><button type="button">bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'switchboard · broadcast control room'], ['type', 'anton / space grotesk / ibm plex mono + vt323 readouts'],
        ['move', 'maximalism lives in instrumentation: every component carries a live readout'],
        ['density', 'instrument packed'], ['motion', 'electromechanical: fill, flick, blip']])}
    </div>
  </div>`;
  themeToggle(mount.querySelector('.hall2'));
  const vu = mount.querySelector('#hall2-vu');
  const vuRead = mount.querySelector('#hall2-vu-read');
  const vuGo = mount.querySelector('#hall2-vu-go');
  if (vu && vuGo) {
    let hot = false;
    vuGo.onclick = () => {
      hot = !hot;
      vu.style.width = hot ? '94%' : '8%';
      if (vuRead) vuRead.textContent = hot ? '0.94' : '0.08';
      vuGo.textContent = hot ? 'reset the meter' : 'run signal check';
    };
  }
  const sw = mount.querySelector('#hall2-sw');
  const swLabel = mount.querySelector('#hall2-sw-label');
  if (sw) sw.onclick = () => {
    const on = sw.getAttribute('aria-pressed') !== 'true';
    sw.setAttribute('aria-pressed', String(on));
    if (swLabel) swLabel.textContent = on ? 'match ring · on' : 'match ring · off';
  };
  const blipWrap = mount.querySelector('#hall2-blip');
  const blipGo = mount.querySelector('#hall2-blip-go');
  if (blipWrap && blipGo) blipGo.onclick = () => {
    const mon = blipWrap.querySelector('.h2-mon');
    if (!mon) return;
    mon.classList.remove('blip'); void mon.offsetWidth; mon.classList.add('blip');
  };
};

/* ======================================================================
   HALL-3 · gumball — sticker-bomb candy shop
   ====================================================================== */

function h3slab(m, state = '', pill = true) {
  const word = state === 'dim' ? 'meh' : matchWord(m.score);
  const veil =
    state === 'load' ? `<div class="h3-veil"><span class="h3-veiltag">chewing&hellip;</span></div>` :
    state === 'err'  ? `<div class="h3-veil"><span class="h3-veiltag err">gumball stuck · embed failed</span></div>` : '';
  const corner =
    state === 'match' ? `<span class="h3-corner">closest match</span>` :
    state === 'near'  ? `<span class="h3-corner near">nearby</span>` :
    state === 'sel'   ? `<span class="h3-corner sel">picked</span>` : '';
  return `
  <article class="h3-slab ${state}">
    <span class="h3-slab-tab">${esc(m.file)}</span>
    ${m.banger ? '<span class="h3-star">banger</span>' : ''}
    ${corner}
    <div class="h3-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}${veil}</div>
    <div class="h3-cap">${esc(m.cap)}${state === 'err' ? ' <button type="button" class="h3-btn compact">unstick it</button>' : ''}</div>
    ${pill ? `<div class="h3-pillrow"><span class="h3-pill">match ${(m.score / 100).toFixed(2)}</span><span class="h3-pill soft">${word}</span></div>` : ''}
  </article>`;
}

function h3console(q = 'cat losing it') {
  return `
  <div class="h3-machine">
    <div class="h3-machine-head"><span>the wish machine</span><span>insert words</span></div>
    <div class="h3-machine-body">
      <div class="h3-field"><span class="h3-fieldmark">&gt;</span><span class="h3-q">${esc(q)}</span><span class="h3-caret"></span></div>
      <button type="button" class="h3-btn primary">find it</button>
    </div>
    <div class="h3-machine-meta">
      <span class="h3-dot gum"></span><span>${LIB.total.toLocaleString()} in the jar</span>
      <span class="h3-dot sky"></span><span>${LIB.model}</span>
      <span class="h3-dot mint"></span><span>${LIB.dim} dim</span>
      <span class="h3-dot lemon"></span><span>${LIB.latency}ms</span>
    </div>
  </div>`;
}

function h3statusbar() {
  const cells = [['jar', `${LIB.total.toLocaleString()}`], ['machine', LIB.model],
    ['chewing', `${LIB.queued}`], ['speed', `${LIB.latency}ms`], ['open', 'yes']];
  return `<div class="h3-statusbar">${cells.map(c => `<span class="cell"><b>${c[0]}</b> ${c[1]}</span>`).join('')}</div>`;
}

SPECS['HALL-3'] = (mount) => {
  css('HALL-3', `
  @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&display=swap');
  /* Hallmark · pre-emit critique: P5 H4 E4 S5 R4 V5
   * macrostructure: poster wall · theme: custom candy shop
   * axes: candy-pink light paper (cocoa dark) · display-heavy shrikhand · multi-candy anchored on gum pink */
  .hall3 {
    --h3-paper:#fff1f6; --h3-card:#ffffff; --h3-tint:#ffe3ee; --h3-ink:#2b0f1e; --h3-deep:#2b0f1e;
    --h3-gum:#ff4fa0; --h3-tang:#ff8a00; --h3-sky:#3ec5ff; --h3-mint:#3ddc97; --h3-lemon:#ffd23f;
    --h3-gum-ink:#b0176a; --h3-sky-ink:#076d9c; --h3-tang-ink:#a85400;
    --h3-line:3px solid var(--h3-ink); --h3-hair:2px solid var(--h3-ink);
    --h3-pop:0 6px 0 var(--h3-ink); --h3-pop-big:0 9px 0 var(--h3-ink);
    --h3-ring:0 0 0 5px var(--h3-card), 0 0 0 8px var(--h3-ink);
    --h3-dotbg:rgba(255,79,160,.08);
    --h3-r:22px; --h3-r-pill:999px;
    --h3-fast:120ms; --h3-base:220ms; --h3-snap:cubic-bezier(.34,1.7,.5,1); --h3-ease:cubic-bezier(.2,.8,.2,1);
    --h3-display:'Shrikhand',cursive; --h3-body:'Baloo 2',sans-serif; --h3-mono:'Space Mono',monospace;
    font-family:var(--h3-body); font-weight:500; color:var(--h3-ink); min-height:100dvh; display:flex; flex-direction:column;
    overflow-x:clip;
    background:radial-gradient(var(--h3-dotbg) 3px, transparent 3px), var(--h3-paper);
    background-size:26px 26px, auto;
  }
  .hall3.theme-dark {
    --h3-paper:#241019; --h3-card:#341a26; --h3-tint:#2c141f; --h3-ink:#ffe9f4;
    --h3-gum:#ff5ea8; --h3-tang:#ff9524; --h3-sky:#4bc9ff; --h3-mint:#45e3a1; --h3-lemon:#ffd84d;
    --h3-gum-ink:#ff7ab8; --h3-sky-ink:#6cd2ff; --h3-tang-ink:#ffa64d;
    --h3-line:3px solid var(--h3-ink); --h3-hair:2px solid var(--h3-ink);
    --h3-pop:0 6px 0 var(--h3-ink); --h3-pop-big:0 9px 0 var(--h3-ink);
    --h3-ring:0 0 0 5px var(--h3-card), 0 0 0 8px var(--h3-ink);
    --h3-dotbg:rgba(255,94,168,.09);
    background:radial-gradient(var(--h3-dotbg) 3px, transparent 3px), var(--h3-paper);
    background-size:26px 26px, auto;
  }
  .hall3 :is(button,a,input):focus-visible { outline:4px solid var(--h3-sky-ink); outline-offset:3px; border-radius:4px; }
  .hall3 .h3-wrap { width:100%; max-width:1160px; margin:0 auto; padding:0 clamp(16px,4vw,48px); min-width:0; }
  .hall3 .meme-media { background:var(--h3-tint); }

  /* masthead */
  .h3-mast { display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:14px clamp(16px,4vw,48px);
    border-bottom:var(--h3-line); background:var(--h3-card); }
  .h3-logo { font-family:var(--h3-display); font-size:30px; color:var(--h3-gum-ink); transform:rotate(-2deg); }
  .h3-mastnav { margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; }
  .h3-mastnav a { color:var(--h3-ink); text-decoration:none; font-family:var(--h3-mono); font-size:11px;
    border:var(--h3-hair); border-radius:var(--h3-r-pill); padding:8px 14px; min-height:36px;
    display:inline-flex; align-items:center; background:var(--h3-card);
    transition:transform var(--h3-fast) var(--h3-snap); }
  .h3-mastnav a:hover { background:var(--h3-lemon); color:var(--h3-deep); transform:rotate(-2deg) scale(1.05); }
  .hall3.theme-dark .h3-mastnav a:hover { color:#2b0f1e; }

  /* hero: tilted poster blocks */
  .h3-hero { padding-top:48px; padding-bottom:20px; display:flex; flex-direction:column; gap:24px; align-items:flex-start; }
  .h3-block { display:inline-block; font-family:var(--h3-display); font-size:clamp(36px,6.5vw,84px); line-height:1.1;
    padding:.05em .35em .12em; border:var(--h3-line); border-radius:var(--h3-r); box-shadow:var(--h3-pop-big);
    overflow-wrap:anywhere; min-width:0; }
  .h3-block.a { background:var(--h3-gum); color:var(--h3-deep); transform:rotate(-1.6deg); }
  .h3-block.b { background:var(--h3-sky); color:var(--h3-deep); transform:rotate(1.1deg); margin-left:clamp(8px,4vw,56px); }
  .hall3.theme-dark .h3-block.a, .hall3.theme-dark .h3-block.b { color:#2b0f1e; }
  .h3-sub { font-size:clamp(15px,2vw,19px); max-width:520px; font-weight:700; }

  /* starburst */
  .h3-star { position:absolute; top:-14px; right:-10px; z-index:2; width:74px; height:74px; display:grid;
    place-items:center; font-family:var(--h3-mono); font-weight:700; font-size:10px; color:var(--h3-deep);
    background:var(--h3-lemon); transform:rotate(10deg);
    clip-path:polygon(50% 0%,60% 12%,75% 5%,78% 21%,94% 20%,88% 35%,100% 44%,88% 55%,96% 70%,80% 71%,78% 88%,63% 80%,50% 94%,38% 80%,23% 88%,21% 71%,4% 70%,12% 55%,0% 44%,12% 35%,6% 20%,22% 21%,25% 5%,40% 12%); }
  .hall3.theme-dark .h3-star { color:#2b0f1e; }
  .h3-star.demo { position:static; transform:rotate(-6deg); flex:none; }
  @keyframes h3pop { 0% { opacity:0; transform:scale(.2) rotate(-40deg); }
    62% { opacity:1; transform:scale(1.18) rotate(14deg); } 100% { opacity:1; transform:scale(1) rotate(10deg); } }
  .h3-star.pop { animation:h3pop 320ms var(--h3-snap); }

  /* buttons: gumball capsules */
  .h3-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; font-family:var(--h3-body);
    font-weight:800; font-size:15px; border:var(--h3-line); border-radius:var(--h3-r-pill);
    background:var(--h3-card); color:var(--h3-ink); padding:11px 24px; min-height:44px; box-shadow:var(--h3-pop);
    transition:transform var(--h3-fast) var(--h3-snap), box-shadow var(--h3-fast) var(--h3-ease); }
  .h3-btn:hover { transform:translateY(-2px); box-shadow:0 8px 0 var(--h3-ink); }
  .h3-btn:active { transform:translateY(5px); box-shadow:0 1px 0 var(--h3-ink); }
  .h3-btn.primary { background:var(--h3-gum); color:var(--h3-deep); }
  .h3-btn.tang { background:var(--h3-tang); color:var(--h3-deep); }
  .hall3.theme-dark .h3-btn.primary, .hall3.theme-dark .h3-btn.tang { color:#2b0f1e; }
  .h3-btn.ghost { box-shadow:none; background:transparent; border-width:2px; }
  .h3-btn.compact { min-height:32px; padding:3px 12px; font-size:12px; box-shadow:none; border-width:2px; }
  .h3-btn.icon { width:44px; padding:0; border-radius:50%; }
  @keyframes h3boing { 0% { transform:scale(1,1); } 30% { transform:scale(1.08,.82); }
    60% { transform:scale(.94,1.1); } 100% { transform:scale(1,1); } }
  .h3-btn.boing { animation:h3boing 340ms var(--h3-snap); }

  /* sticker slab */
  .h3-slab { position:relative; border:var(--h3-line); border-radius:var(--h3-r); background:var(--h3-card);
    box-shadow:var(--h3-ring); margin:10px 8px 4px; min-width:0; }
  .h3-slab:nth-child(odd) { transform:rotate(-.9deg); }
  .h3-slab:nth-child(even) { transform:rotate(.8deg); }
  .h3-slab-tab { position:absolute; top:-12px; left:12px; z-index:2; font-family:var(--h3-mono); font-size:9px;
    border:var(--h3-hair); border-radius:var(--h3-r-pill); background:var(--h3-lemon); color:var(--h3-deep);
    padding:2px 10px; max-width:70%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .hall3.theme-dark .h3-slab-tab { color:#2b0f1e; }
  .h3-corner { position:absolute; bottom:-10px; right:10px; z-index:2; font-family:var(--h3-mono); font-weight:700;
    font-size:9px; border:var(--h3-hair); border-radius:var(--h3-r-pill); background:var(--h3-gum);
    color:var(--h3-deep); padding:3px 10px; transform:rotate(-2deg); }
  .h3-corner.near { background:var(--h3-sky); } .h3-corner.sel { background:var(--h3-mint); }
  .hall3.theme-dark .h3-corner { color:#2b0f1e; }
  .h3-art { display:grid; place-items:center; overflow:hidden; background:var(--h3-tint);
    border-radius:calc(var(--h3-r) - 4px) calc(var(--h3-r) - 4px) 0 0; position:relative; }
  .h3-cap { padding:9px 12px; font-size:13px; font-weight:700; line-height:1.3; border-top:var(--h3-hair);
    display:flex; justify-content:space-between; align-items:center; gap:8px; overflow-wrap:anywhere; }
  .h3-pillrow { display:flex; gap:6px; padding:0 10px 10px; flex-wrap:wrap; }
  .h3-pill { font-family:var(--h3-mono); font-size:9px; font-weight:700; border:var(--h3-hair);
    border-radius:var(--h3-r-pill); background:var(--h3-lemon); color:var(--h3-deep); padding:2px 9px; }
  .h3-pill.soft { background:var(--h3-tint); color:var(--h3-ink); }
  .hall3.theme-dark .h3-pill { color:#2b0f1e; }
  .hall3.theme-dark .h3-pill.soft { color:var(--h3-ink); }
  .h3-slab.match { box-shadow:0 0 0 5px var(--h3-gum), 0 0 0 8px var(--h3-ink); }
  .h3-slab.near { box-shadow:0 0 0 5px var(--h3-sky), 0 0 0 8px var(--h3-ink); }
  .h3-slab.dim { opacity:.45; filter:grayscale(.5); transform:rotate(0); }
  .h3-slab.sel { box-shadow:0 0 0 5px var(--h3-mint), 0 0 0 8px var(--h3-ink); border-width:4px; }
  .h3-slab.load .meme-media { opacity:.3; filter:grayscale(1); }
  .h3-slab.err .meme-media { opacity:.25; filter:grayscale(1); }
  .h3-veil { position:absolute; inset:0; display:grid; place-items:center; }
  .h3-veiltag { font-family:var(--h3-mono); font-size:10px; font-weight:700; border:var(--h3-hair);
    border-radius:var(--h3-r-pill); background:var(--h3-lemon); color:var(--h3-deep); padding:5px 12px; }
  .h3-veiltag.err { background:var(--h3-tang); }
  .hall3.theme-dark .h3-veiltag { color:#2b0f1e; }

  /* wish machine */
  .h3-machine { border:var(--h3-line); border-radius:var(--h3-r); background:var(--h3-card); box-shadow:var(--h3-pop-big);
    max-width:760px; width:100%; overflow:hidden; }
  .h3-machine-head { display:flex; justify-content:space-between; gap:10px; font-family:var(--h3-display); font-size:18px;
    background:var(--h3-gum); color:var(--h3-deep); padding:10px 18px; border-bottom:var(--h3-line); }
  .hall3.theme-dark .h3-machine-head { color:#2b0f1e; }
  .h3-machine-head span:last-child { font-family:var(--h3-mono); font-size:10px; align-self:center; }
  .h3-machine-body { display:flex; gap:12px; padding:16px; align-items:center; }
  .h3-field { flex:1; display:flex; align-items:center; gap:10px; border:var(--h3-line); border-radius:var(--h3-r-pill);
    background:var(--h3-paper); font-family:var(--h3-mono); font-size:15px; padding:12px 18px; min-width:0; }
  .h3-fieldmark { color:var(--h3-gum-ink); font-weight:700; }
  .h3-q { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .h3-caret { width:9px; height:19px; border-radius:3px; background:var(--h3-gum); animation:h3blink 1s steps(1) infinite; }
  @keyframes h3blink { 50% { opacity:0; } }
  .h3-machine-meta { display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-family:var(--h3-mono);
    font-size:10px; border-top:var(--h3-hair); background:var(--h3-tint); padding:9px 16px; }
  .h3-dot { width:12px; height:12px; border-radius:50%; border:2px solid var(--h3-ink); flex:none; }
  .h3-dot.gum { background:var(--h3-gum); } .h3-dot.sky { background:var(--h3-sky); }
  .h3-dot.mint { background:var(--h3-mint); } .h3-dot.lemon { background:var(--h3-lemon); }

  /* misc components */
  .h3-input { display:flex; align-items:center; gap:10px; border:var(--h3-line); border-radius:var(--h3-r-pill);
    background:var(--h3-card); font-family:var(--h3-mono); font-size:14px; padding:11px 16px; min-width:min(280px,100%); }
  .h3-tabs { position:relative; display:flex; border:var(--h3-line); border-radius:var(--h3-r-pill);
    background:var(--h3-card); width:max-content; max-width:100%; padding:4px; }
  .h3-tabs .jelly { position:absolute; top:4px; left:4px; height:calc(100% - 8px); width:calc((100% - 8px) / 3);
    background:var(--h3-gum); border-radius:var(--h3-r-pill); transition:transform var(--h3-base) var(--h3-snap); }
  .h3-tab { position:relative; z-index:1; flex:1; font-family:var(--h3-body); font-weight:800; font-size:13px;
    padding:9px 18px; min-height:40px; min-width:92px; background:none; border:0; border-radius:var(--h3-r-pill); color:var(--h3-ink); }
  .h3-tab[aria-selected="true"] { color:var(--h3-deep); }
  .hall3.theme-dark .h3-tab[aria-selected="true"] { color:#2b0f1e; }
  .h3-toast { display:inline-flex; gap:10px; align-items:center; border:var(--h3-line); border-radius:var(--h3-r-pill);
    background:var(--h3-mint); color:var(--h3-deep); box-shadow:var(--h3-pop); font-weight:800; font-size:14px; padding:10px 20px; }
  .hall3.theme-dark .h3-toast { color:#2b0f1e; }
  .h3-stat { border:var(--h3-line); border-radius:var(--h3-r); background:var(--h3-card); box-shadow:var(--h3-pop);
    padding:14px 18px; min-width:150px; transform:rotate(-.7deg); }
  .h3-stat:nth-child(even) { transform:rotate(.7deg); }
  .h3-stat b { display:block; font-family:var(--h3-display); font-size:36px; line-height:1.1; color:var(--h3-gum-ink); }
  .h3-stat span { font-family:var(--h3-mono); font-size:10px; }
  .h3-empty { border:var(--h3-line); border-radius:var(--h3-r); background:var(--h3-card); box-shadow:var(--h3-ring);
    padding:32px; max-width:460px; display:flex; flex-direction:column; gap:14px; align-items:flex-start; margin:10px 8px; }
  .h3-statusbar { display:flex; flex-wrap:wrap; gap:8px; border-top:var(--h3-line); background:var(--h3-card);
    font-family:var(--h3-mono); font-size:10px; padding:8px 14px; }
  .h3-statusbar .cell { border:var(--h3-hair); border-radius:var(--h3-r-pill); padding:3px 12px; }
  .h3-statusbar .cell b { color:var(--h3-gum-ink); font-weight:700; }

  .h3-sec { margin-top:56px; padding:0 0 22px; display:flex; gap:12px; align-items:center; }
  .h3-sec b { font-family:var(--h3-display); font-size:22px; background:var(--h3-sky); color:var(--h3-deep);
    border:var(--h3-hair); border-radius:var(--h3-r-pill); padding:2px 16px 6px; transform:rotate(-2deg); }
  .hall3.theme-dark .h3-sec b { color:#2b0f1e; }
  .h3-sec span { font-family:var(--h3-mono); font-size:11px; }
  .h3-shape { border:var(--h3-line); background:var(--h3-card); width:132px; height:88px; display:grid;
    place-items:center; font-family:var(--h3-mono); font-size:9px; text-align:center; padding:6px; }
  .h3-row { display:flex; gap:22px; flex-wrap:wrap; align-items:flex-start; }
  .h3-row.center { align-items:center; }

  /* compositions */
  .h3-bench { border:var(--h3-line); border-radius:var(--h3-r); background:var(--h3-paper); overflow:hidden; }
  .h3-bench-bar { display:flex; gap:12px; align-items:center; padding:14px 18px; border-bottom:var(--h3-line);
    background:var(--h3-card); flex-wrap:wrap; }
  .h3-bench-main { display:flex; gap:18px; padding:20px 14px; }
  .h3-rail { display:flex; flex-direction:column; gap:10px; min-width:216px; }
  .h3-pilebtn { display:flex; justify-content:space-between; align-items:center; gap:10px; border:var(--h3-hair);
    border-radius:var(--h3-r-pill); background:var(--h3-card); font-family:var(--h3-body); font-weight:700;
    font-size:13px; padding:9px 16px; color:var(--h3-ink); }
  .h3-pilebtn b { font-family:var(--h3-mono); font-size:11px; }
  .h3-pilebtn.on { border:var(--h3-line); background:var(--h3-lemon); color:var(--h3-deep); box-shadow:var(--h3-pop); }
  .hall3.theme-dark .h3-pilebtn.on { color:#2b0f1e; }
  .h3-grid { display:grid; gap:18px; grid-template-columns:repeat(4,minmax(0,1fr)); min-width:0; flex:1; }
  .h3-grid.g2 { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .h3-grid .h3-slab { margin:12px 4px 8px; }
  .h3-phone { width:390px; max-width:100%; border:var(--h3-line); border-radius:28px; box-shadow:var(--h3-pop-big);
    background:var(--h3-paper); overflow:hidden; }
  .h3-dock { display:flex; gap:6px; border-top:var(--h3-line); background:var(--h3-card); padding:8px; }
  .h3-dock button { flex:1; min-height:44px; background:var(--h3-paper); border:var(--h3-hair);
    border-radius:var(--h3-r-pill); color:var(--h3-ink); font-family:var(--h3-body); font-weight:800; font-size:11px; }
  .h3-dock button.on { background:var(--h3-gum); color:var(--h3-deep); }
  .hall3.theme-dark .h3-dock button.on { color:#2b0f1e; }

  @media (prefers-reduced-motion: reduce) {
    .hall3 *, .hall3 *::before, .hall3 *::after { animation:none !important; transition:none !important; }
  }
  @media (max-width: 900px) {
    .h3-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .h3-bench-main { flex-direction:column; }
    .h3-rail { flex-direction:row; flex-wrap:wrap; min-width:0; }
  }
  @media (max-width: 480px) {
    .h3-grid { grid-template-columns:repeat(1,minmax(0,1fr)); }
    .h3-grid.g2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .h3-machine-body { flex-direction:column; align-items:stretch; }
    .h3-mastnav { margin-left:0; }
    .h3-block.b { margin-left:0; }
  }
  `);
  const M = MEMES;
  mount.innerHTML = `
  <div class="hall3">
    <header class="h3-mast">
      <span class="h3-logo">sploot</span>
      <nav class="h3-mastnav"><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </header>

    <section class="h3-wrap h3-hero">
      <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
        <span class="h3-star demo" style="width:86px;height:86px">${LIB.total.toLocaleString()}<br>inside</span>
        <span class="h3-pill" style="font-size:11px;padding:5px 14px">no folders. just vibes.</span>
      </div>
      <h1 style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0;max-width:100%">
        <span class="h3-block a">type words.</span>
        <span class="h3-block b">get the picture.</span>
      </h1>
      <p class="h3-sub">the machine sorts the pile while you sleep. every meme comes out shiny.</p>
      <div class="h3-row center">
        <button type="button" class="h3-btn primary">find it</button>
        <button type="button" class="h3-btn">shuffle the pile</button>
      </div>
      ${h3console()}
      <div class="h3-grid" style="width:100%">${M.slice(0, 4).map((x, i) => h3slab(x, i === 0 ? 'match' : '', i === 0)).join('')}</div>
    </section>

    <div class="h3-wrap"><div class="h3-sec"><b>one</b><span>foundations · candy, capsules, sticker rings</span></div></div>
    <div class="h3-wrap">${swatches([
      ['ink', '#2b0f1e', '#fff1f6'], ['paper', '#fff1f6'], ['card', '#ffffff'], ['gum', '#ff4fa0'],
      ['tangerine', '#ff8a00'], ['sky', '#3ec5ff'], ['mint', '#3ddc97'], ['lemon', '#ffd23f']])}
      <div class="h3-row" style="margin-top:22px">
        <div class="h3-shape" style="border-width:2px">2px outline · quiet</div>
        <div class="h3-shape">3px outline · loud</div>
        <div class="h3-shape" style="border-radius:var(--h3-r)">22px corner · slab</div>
        <div class="h3-shape" style="border-radius:999px">capsule · controls</div>
        <div class="h3-shape" style="box-shadow:var(--h3-pop)">gumdrop shadow</div>
        <div class="h3-shape" style="box-shadow:var(--h3-ring);border-radius:var(--h3-r)">sticker ring</div>
        <div class="h3-shape" style="clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);width:100px">star</div>
      </div>
      <p style="margin-top:14px;font-family:var(--h3-mono);font-size:10px">a 12px candy grid with fat 20px gutters. nothing touches, everything bounces.</p>
    </div>

    <div class="h3-wrap"><div class="h3-sec"><b>two</b><span>type specimen</span></div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="font-family:var(--h3-display);font-size:clamp(32px,5vw,54px);color:var(--h3-gum-ink)">display · shrikhand</div>
        <div style="font-size:17px;max-width:560px">body · baloo 2. round and readable. the pile sorts itself into piles while you sleep and nobody files a thing.</div>
        <div style="font-family:var(--h3-mono);font-size:12px">label · space mono</div>
        <div style="font-family:var(--h3-mono);font-size:10px;opacity:.7">metadata · vec 0413 · ${LIB.latency}ms · ${LIB.model}</div>
        <div style="font-family:var(--h3-mono);font-size:26px;font-variant-numeric:tabular-nums">${LIB.total.toLocaleString()} · 0.94 · ${LIB.latency}ms</div>
        <div style="font-size:13px;max-width:430px;border-left:4px solid var(--h3-gum);padding-left:12px;font-weight:500">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me is now framed above my desk like a diploma.</div>
      </div>
    </div>

    <div class="h3-wrap"><div class="h3-sec"><b>three</b><span>components · the candy kit</span></div>
      <div style="display:flex;flex-direction:column;gap:30px">
        ${h3console('sad frog')}
        <div class="h3-grid">
          ${h3slab(M[0], 'match')}${h3slab(M[1], 'near')}${h3slab(M[2], 'dim')}${h3slab(M[3], '')}
        </div>
        <div class="h3-grid">
          ${h3slab(M[4], 'sel')}${h3slab(M[5], 'load')}${h3slab(M[6], 'err')}
          <div class="h3-empty">
            <span class="h3-star demo">empty</span>
            <p style="font-size:15px;font-weight:700">zero memes in the machine. zero thoughts in the head. put a coin in.</p>
            <button type="button" class="h3-btn primary">upload chaos</button>
          </div>
        </div>
        <div class="h3-row center">
          <button type="button" class="h3-btn primary">find it</button>
          <button type="button" class="h3-btn tang">shuffle the pile</button>
          <button type="button" class="h3-btn ghost">secondary</button>
          <button type="button" class="h3-btn compact">compact</button>
          <button type="button" class="h3-btn icon">&#10005;</button>
          <span class="h3-pill" style="font-size:11px;padding:5px 14px">sticker · fresh</span>
          <span class="h3-star demo">banger</span>
        </div>
        <div class="h3-row center">
          <div class="h3-input"><span class="h3-fieldmark">&gt;</span><span>text input</span><span class="h3-caret"></span></div>
          <div class="h3-tabs" id="hall3-tabs-sheet"><span class="jelly"></span>
            <button type="button" class="h3-tab" aria-selected="true">all</button>
            <button type="button" class="h3-tab" aria-selected="false">bangers</button>
            <button type="button" class="h3-tab" aria-selected="false">recent</button></div>
          <div class="h3-toast">plop. saved to the pile.</div>
        </div>
        <div class="h3-row">
          <div class="h3-stat"><span>folders required</span><b>0</b></div>
          <div class="h3-stat"><span>gumballs in the jar</span><b>${LIB.total.toLocaleString()}</b></div>
          <div class="h3-stat"><span>still chewing</span><b>${LIB.queued}</b></div>
        </div>
        ${h3statusbar()}
      </div>
    </div>

    <div class="h3-wrap"><div class="h3-sec"><b>four</b><span>motion · elastic, on interaction only</span></div>
      <div class="h3-row center">
        <button type="button" class="h3-btn primary" id="hall3-boing">press me · boing</button>
        <div style="display:flex;gap:12px;align-items:center">
          <span class="h3-star demo" id="hall3-star">banger</span>
          <button type="button" class="h3-btn compact" id="hall3-star-go">replay pop</button>
        </div>
        <div class="h3-tabs" id="hall3-tabs-demo"><span class="jelly"></span>
          <button type="button" class="h3-tab" aria-selected="true">all</button>
          <button type="button" class="h3-tab" aria-selected="false">bangers</button>
          <button type="button" class="h3-tab" aria-selected="false">recent</button></div>
      </div>
      <p style="margin-top:12px;font-family:var(--h3-mono);font-size:10px">reduced motion: everything lands placed, never bounced.</p>
    </div>

    <div class="h3-wrap"><div class="h3-sec"><b>five</b><span>compositions · the shop floor + the handheld</span></div>
      <div class="h3-bench">
        <div class="h3-bench-bar">
          <span class="h3-logo" style="font-size:22px">sploot</span>
          <div class="h3-field" style="flex:1;max-width:420px;padding:9px 16px"><span class="h3-fieldmark">&gt;</span><span class="h3-q">search the pile</span></div>
          <button type="button" class="h3-btn compact">upload</button>
          <button type="button" class="h3-btn compact">bangers</button>
          <button type="button" class="h3-btn compact">shuffle</button>
        </div>
        <div class="h3-bench-main">
          <div class="h3-rail">${PILES.slice(0, 5).map((p, i) => `<button type="button" class="h3-pilebtn ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}</div>
          <div class="h3-grid">${M.slice(0, 8).map(x => h3slab(x, '', false)).join('')}</div>
        </div>
        ${h3statusbar()}
      </div>
      <div class="h3-phone" style="margin:28px 0 52px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:var(--h3-line);background:var(--h3-card)">
          <span class="h3-logo" style="font-size:19px">sploot</span>
          <span class="h3-pill" style="font-size:10px">${LIB.total.toLocaleString()}</span>
        </div>
        <div style="padding:14px 10px;display:flex;flex-direction:column;gap:12px">
          <div class="h3-input" style="min-width:0;margin:0 4px"><span class="h3-fieldmark">&gt;</span><span>cat losing it</span></div>
          <div class="h3-grid g2">${M.slice(0, 4).map(x => h3slab(x, '', false)).join('')}</div>
        </div>
        <div class="h3-dock"><button type="button" class="on">pile</button><button type="button">search</button><button type="button">upload</button><button type="button">bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'gumball · sticker-bomb candy shop'], ['type', 'shrikhand / baloo 2 / space mono'],
        ['move', 'maximalism lives in silhouette: no component is a plain rectangle'],
        ['density', 'fat and round'], ['motion', 'elastic: boing, pop, jelly']])}
    </div>
  </div>`;
  themeToggle(mount.querySelector('.hall3'));
  const boing = mount.querySelector('#hall3-boing');
  if (boing) boing.onclick = () => {
    boing.classList.remove('boing'); void boing.offsetWidth; boing.classList.add('boing');
  };
  const star = mount.querySelector('#hall3-star');
  const starGo = mount.querySelector('#hall3-star-go');
  if (star && starGo) starGo.onclick = () => {
    star.classList.remove('pop'); void star.offsetWidth; star.classList.add('pop');
  };
  const wireTabs = (id) => {
    const box = mount.querySelector(id);
    if (!box) return;
    const jelly = box.querySelector('.jelly');
    const tabs = Array.from(box.querySelectorAll('.h3-tab'));
    tabs.forEach((t, i) => t.onclick = () => {
      tabs.forEach(x => x.setAttribute('aria-selected', 'false'));
      t.setAttribute('aria-selected', 'true');
      if (jelly) jelly.style.transform = `translateX(${i * 100}%)`;
    });
  };
  wireTabs('#hall3-tabs-sheet');
  wireTabs('#hall3-tabs-demo');
};

})();

(() => {

/* ======================================================================
   HALL-4 · broadsheet — the morning edition.
   NEW system rule: above-the-fold newspaper composition. The page is a
   folded broadsheet. A visible fold divides the hero zone (above fold)
   from column-ruled newsprint below. Every meme card carries a dateline/
   byline/lede structure. Misregistration is still elevation (AFD-1);
   ink outlines bind everything (AFD-3). The page genre is the newspaper.
   ====================================================================== */

const matchWord = (s) => s >= 90 ? 'closest match' : s >= 75 ? 'strong match' : 'related';

function h4article(m, state = '', scoreTag = true) {
  const word = state === 'match' ? 'CLOSEST MATCH' : state === 'near' ? 'ADJACENT' : state === 'dim' ? 'BURIED' :
    state === 'sel' ? 'PULLED FOR PRINT' : state === 'load' ? 'PRESS WARMING' : state === 'err' ? 'HOLD THE PRESS' : matchWord(m.score).toUpperCase();
  const veil =
    state === 'load' ? `<div class="h4-veil"><span class="h4-veiltag">typesetting&hellip;</span></div>` :
    state === 'err'  ? `<div class="h4-veil"><span class="h4-veiltag err2">plate jam &middot; embed failed</span></div>` : '';
  const pull =
    state === 'match' ? `<span class="h4-pull">closest match</span>` :
    state === 'sel'   ? `<span class="h4-pull sel">pulled for print</span>` : '';
  return `
  <article class="h4-story ${state}">
    <div class="h4-dateline"><span>vec ${m.vec}</span><span>${esc(m.file)}</span></div>
    <div class="h4-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}${veil}${pull}
      ${m.banger ? '<span class="h4-starlet">banger</span>' : ''}</div>
    <div class="h4-lede">${esc(m.cap)}${state === 'err' ? ' <button type="button" class="h4-btn compact">re-set type</button>' : ''}</div>
    ${scoreTag ? `<div class="h4-byline"><b>${(m.score / 100).toFixed(2)}</b> <span>${word}</span></div>` : ''}
  </article>`;
}

function h4rubber(txt, clr = '') {
  return `<span class="h4-rubber ${clr}">${txt}</span>`;
}

function h4console(q = 'cat losing it') {
  return `
  <div class="h4-desk">
    <div class="h4-desk-head"><span>classified dispatch</span><span>form c-1</span></div>
    <div class="h4-desk-body">
      <div class="h4-field"><span class="h4-fieldmark">&gt;</span><span class="h4-q">${esc(q)}</span><span class="h4-caret"></span></div>
      <button type="button" class="h4-btn primary">find it</button>
    </div>
    <div class="h4-desk-meta">
      <span>index ${LIB.total.toLocaleString()} plates</span><span>ink ${LIB.model}</span>
      <span>${LIB.dim} channels</span><span>${LIB.latency}ms per pull</span>
    </div>
  </div>`;
}

function h4statusbar() {
  const cells = [['edition', `no. ${LIB.total.toLocaleString()}`], ['press', LIB.model],
    ['composing', `${LIB.queued}`], ['latency', `${LIB.latency}ms`], ['running', 'yes', 1]];
  return `<div class="h4-statusbar">${cells.map(c =>
    `<span class="cell">${c[2] ? '<i></i>' : ''}<b>${c[0]}</b> ${c[1]}</span>`).join('')}</div>`;
}

SPECS['HALL-4'] = (mount) => {
  css('HALL-4', `
  /* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5
   * macrostructure: broadsheet newspaper · theme: custom newsroom
   * axes: warm newsprint light (press-ink dark) · high-contrast serif · riso red accent */
  .hall4 {
    --h4-paper:#f5efe0; --h4-card:#faf6eb; --h4-tint:#efe7d2; --h4-ink:#1b1712; --h4-deep:#1b1712;
    --h4-red:#ff4438; --h4-blue:#0078bf; --h4-green:#00a95c; --h4-yellow:#ffe800; --h4-pink:#ffd3e4;
    --h4-red-ink:#c22417; --h4-blue-ink:#005f96; --h4-green-ink:#00714a;
    --h4-hair:2px solid var(--h4-ink); --h4-hair-d:2px dashed var(--h4-ink);
    --h4-thick:3px solid var(--h4-ink); --h4-col:2px dotted var(--h4-ink);
    --h4-miss:5px 5px 0 var(--h4-red); --h4-miss2:5px 5px 0 var(--h4-red), 10px 10px 0 var(--h4-blue);
    --h4-miss-lg:7px 7px 0 var(--h4-red), 14px 14px 0 var(--h4-blue);
    --h4-ring:0 0 0 4px var(--h4-red), 10px 10px 0 var(--h4-blue);
    --h4-dot:rgba(27,23,18,.06);
    --h4-fast:90ms; --h4-base:180ms; --h4-ease:cubic-bezier(.2,.8,.2,1);
    --h4-display:'DM Serif Display',serif; --h4-body:'Fraunces',serif; --h4-mono:'IBM Plex Mono',monospace;
    --h4-hand:'Caveat',cursive;
    min-height:100dvh; display:flex; flex-direction:column;
    font-family:var(--h4-body); color:var(--h4-ink);
    overflow-x:clip;
    background:
      radial-gradient(var(--h4-dot) 1px, transparent 1.4px) 0 0 / 16px 16px,
      var(--h4-paper);
  }
  .hall4.theme-dark {
    --h4-paper:#191410; --h4-card:#221b14; --h4-tint:#2c231a; --h4-ink:#f2ead4;
    --h4-red:#ff5c4e; --h4-blue:#3ea8ee; --h4-green:#34d48a; --h4-yellow:#e6c632; --h4-pink:#5a2c3e;
    --h4-red-ink:#ff7f72; --h4-blue-ink:#7cc6f4; --h4-green-ink:#5ce0a2;
    --h4-hair:2px solid var(--h4-ink); --h4-hair-d:2px dashed var(--h4-ink);
    --h4-thick:3px solid var(--h4-ink); --h4-col:2px dotted var(--h4-ink);
    --h4-miss:5px 5px 0 var(--h4-red); --h4-miss2:5px 5px 0 var(--h4-red), 10px 10px 0 var(--h4-blue);
    --h4-ring:0 0 0 4px var(--h4-red), 10px 10px 0 var(--h4-blue);
    --h4-dot:rgba(242,234,212,.05);
  }
  .hall4 :is(button,a,input):focus-visible { outline:3px solid var(--h4-red); outline-offset:3px; }
  .hall4 .h4-wrap { width:100%; max-width:1140px; margin:0 auto; padding:0 clamp(14px,4vw,44px); min-width:0; }
  .hall4 .meme-media { background:var(--h4-tint); }

  /*━━━ nameplate masthead ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-mast { border-bottom:var(--h4-thick); background:var(--h4-paper); }
  .h4-mast-top { display:flex; justify-content:space-between; align-items:center; gap:12px;
    padding:10px clamp(14px,4vw,44px); border-bottom:var(--h4-hair);
    font-family:var(--h4-mono); font-size:10px; text-transform:uppercase; }
  .h4-mast-top b { font-weight:400; color:var(--h4-red-ink); }
  .h4-nameplate { display:flex; flex-direction:column; align-items:center; padding:14px 0 8px; }
  .h4-flag { font-family:var(--h4-display); font-weight:400; font-size:clamp(36px,7.2vw,76px);
    line-height:1.02; text-align:center; letter-spacing:.02em; }
  .h4-flag em { font-style:italic; }
  .h4-nameplate p { font-family:var(--h4-mono); font-size:10px; text-transform:uppercase; letter-spacing:.12em;
    margin:2px 0 0; padding-top:6px; border-top:var(--h4-hair); width:100%; text-align:center; }
  .h4-nav { display:flex; justify-content:center; gap:0; border-top:var(--h4-hair); flex-wrap:wrap; }
  .h4-nav a { color:var(--h4-ink); text-decoration:none; font-family:var(--h4-mono); font-size:11px;
    padding:9px 18px; min-height:36px; display:inline-flex; align-items:center;
    border-right:var(--h4-hair); text-transform:uppercase; }
  .h4-nav a:first-child { border-left:var(--h4-hair); }
  .h4-nav a:hover { background:var(--h4-yellow); color:var(--h4-deep); }
  .hall4.theme-dark .h4-nav a:hover { color:#1b1712; }

  /*━━━ fold line ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-fold { width:100%; border-top:var(--h4-hair-d); padding:2px 0; margin:28px 0 4px;
    text-align:center; font-family:var(--h4-mono); font-size:9px; text-transform:uppercase;
    position:relative; }
  .h4-fold::before, .h4-fold::after { content:""; position:absolute; top:-2px;
    width:12px; height:12px; border:2px solid var(--h4-ink); border-radius:50%;
    background:var(--h4-paper); transform:translateY(-50%); }
  .h4-fold::before { left:0; } .h4-fold::after { right:0; }
  .hall4.theme-dark .h4-fold::before, .hall4.theme-dark .h4-fold::after { background:var(--h4-paper); }

  /*━━━ hero ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-hero { padding-top:36px; display:flex; flex-direction:column; gap:24px; }
  .h4-hed { font-family:var(--h4-display); font-weight:400; font-size:clamp(32px,5.8vw,68px);
    line-height:1.08; max-width:16ch; letter-spacing:.01em; }
  .h4-hed em { font-style:italic; }
  .h4-deck { font-family:var(--h4-body); font-size:clamp(16px,2.2vw,22px); max-width:640px;
    font-style:italic; color:var(--h4-ink); opacity:.85; line-height:1.4; }
  .h4-hero-note { font-family:var(--h4-mono); font-size:12px; text-transform:uppercase;
    border-left:var(--h4-thick); border-color:var(--h4-red); padding-left:12px; max-width:480px; }

  /*━━━ rubber stamp (annotation layer) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-rubber { display:inline-block; font-family:var(--h4-mono); font-weight:600; font-size:10px;
    text-transform:uppercase; letter-spacing:.08em; color:var(--h4-red);
    border:3px double var(--h4-red); padding:4px 10px; transform:rotate(-3deg);
    background:transparent; }
  .h4-rubber.blue { color:var(--h4-blue-ink); border-color:var(--h4-blue-ink); }
  .h4-rubber.green { color:var(--h4-green); border-color:var(--h4-green); }
  .h4-rubber.big { font-size:14px; padding:7px 14px; }
  .h4-rubber.mini { font-size:8px; padding:1px 5px; border-width:2px; }
  .h4-rubber-over { position:absolute; top:38%; left:50%; transform:translate(-50%,-50%) rotate(-6deg);
    background:var(--h4-card); z-index:2; }

  /*━━━ starburst (toybox DNA) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-star { display:inline-grid; place-items:center; width:76px; height:76px; flex:none;
    clip-path:polygon(100% 50%, 80.9% 58.3%, 93.3% 75%, 72.6% 72.6%, 75% 93.3%, 58.3% 80.9%,
      50% 100%, 41.7% 80.9%, 25% 93.3%, 27.4% 72.6%, 6.7% 75%, 19.1% 58.3%, 0% 50%, 19.1% 41.7%,
      6.7% 25%, 27.4% 27.4%, 25% 6.7%, 41.7% 19.1%, 50% 0%, 58.3% 19.1%, 75% 6.7%,
      72.6% 27.4%, 93.3% 25%, 80.9% 41.7%);
    background:var(--h4-yellow); filter:drop-shadow(2px 3px 0 rgba(27,23,18,.85));
    transform:rotate(8deg); }
  .h4-star span { font-family:var(--h4-mono); font-size:9px; font-weight:700; color:var(--h4-deep);
    text-align:center; max-width:52px; line-height:1.15; }
  .hall4.theme-dark .h4-star span { color:#1b1712; }
  .h4-starlet { position:absolute; top:8px; right:8px; z-index:2; width:48px; height:48px;
    display:grid; place-items:center; font-family:var(--h4-mono); font-size:8px; font-weight:700;
    color:var(--h4-deep); background:var(--h4-yellow); border:2px solid var(--h4-ink);
    border-radius:50%; transform:rotate(8deg); }
  .hall4.theme-dark .h4-starlet { color:#1b1712; }
  .h4-star-demo { position:static; transform:rotate(-4deg); }

  /*━━━ buttons: press blocks ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px;
    min-height:44px; padding:10px 20px; font-family:var(--h4-mono); font-weight:600; font-size:13px;
    text-transform:uppercase; border:var(--h4-hair); background:var(--h4-card); color:var(--h4-ink);
    box-shadow:var(--h4-miss);
    transition:transform var(--h4-fast) var(--h4-ease), box-shadow var(--h4-fast) var(--h4-ease); }
  .h4-btn:hover { transform:translate(-2px,-2px); box-shadow:7px 7px 0 var(--h4-red), 12px 12px 0 var(--h4-blue); }
  .h4-btn:active { transform:translate(5px,5px); box-shadow:0 0 0 var(--h4-red); }
  .h4-btn.primary { background:var(--h4-red); color:#fff; box-shadow:5px 5px 0 var(--h4-blue); }
  .h4-btn.primary:hover { box-shadow:7px 7px 0 var(--h4-blue), 12px 12px 0 var(--h4-ink); }
  .h4-btn.ghost { box-shadow:none; border-style:dashed; }
  .h4-btn.compact { min-height:32px; padding:4px 12px; font-size:10px; box-shadow:3px 3px 0 var(--h4-red); }
  .h4-btn.icon { width:44px; padding:0; }

  /*━━━ search desk: classified dispatch ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-desk { border:var(--h4-thick); background:var(--h4-card); box-shadow:var(--h4-miss-lg);
    max-width:800px; width:100%; overflow:hidden; }
  .h4-desk-head { display:flex; justify-content:space-between; gap:10px; font-family:var(--h4-mono);
    font-size:11px; text-transform:uppercase; padding:8px 14px; border-bottom:var(--h4-thick);
    background:var(--h4-tint); }
  .h4-desk-head span:last-child { color:var(--h4-red-ink); }
  .h4-desk-body { display:flex; gap:14px; padding:16px; align-items:center; }
  .h4-field { flex:1; display:flex; align-items:center; gap:10px; border:var(--h4-hair);
    background:var(--h4-paper); padding:12px 14px; font-family:var(--h4-mono); font-size:15px; min-width:0; }
  .h4-fieldmark { color:var(--h4-red-ink); }
  .h4-q { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .h4-caret { width:9px; height:19px; background:var(--h4-red); animation:h4blink 1s steps(1) infinite; }
  @keyframes h4blink { 50% { opacity:0; } }
  .h4-desk-meta { display:flex; gap:14px; flex-wrap:wrap; font-family:var(--h4-mono); font-size:10px;
    border-top:var(--h4-hair-d); padding:8px 14px; opacity:.75; }

  /*━━━ meme story: article card ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-story { position:relative; border:var(--h4-hair); background:var(--h4-card);
    box-shadow:var(--h4-miss); min-width:0;
    transition:transform var(--h4-fast) var(--h4-ease), box-shadow var(--h4-fast) var(--h4-ease); }
  .h4-story:hover { transform:translate(-2px,-3px); box-shadow:7px 7px 0 var(--h4-red); }
  .h4-dateline { display:flex; justify-content:space-between; gap:8px; font-family:var(--h4-mono);
    font-size:9px; text-transform:uppercase; padding:5px 10px; border-bottom:var(--h4-hair);
    background:var(--h4-tint); white-space:nowrap; overflow:hidden; }
  .h4-art { position:relative; display:grid; place-items:center; overflow:hidden; background:var(--h4-tint); }
  .h4-lede { padding:9px 10px; font-size:13.5px; line-height:1.35; border-top:var(--h4-hair);
    display:flex; justify-content:space-between; align-items:center; gap:8px; overflow-wrap:anywhere; }
  .h4-byline { display:flex; justify-content:space-between; align-items:center; gap:8px;
    border-top:var(--h4-hair-d); padding:6px 10px; font-family:var(--h4-mono); font-size:10px; }
  .h4-byline b { font-family:var(--h4-display); font-size:14px; font-weight:400; }
  .h4-pull { position:absolute; top:10px; left:10px; z-index:2; font-family:var(--h4-mono);
    font-weight:700; font-size:9px; text-transform:uppercase; color:var(--h4-red-ink);
    border:2px solid var(--h4-red-ink); background:var(--h4-card); padding:4px 9px; }
  .h4-pull.sel { color:var(--h4-blue-ink); border-color:var(--h4-blue-ink); }
  .h4-story.match { box-shadow:var(--h4-ring); border-width:3px; }
  .h4-story.near { box-shadow:5px 5px 0 var(--h4-blue); }
  .h4-story.dim { opacity:.4; filter:grayscale(.6); box-shadow:none; }
  .h4-story.sel { border-width:3px; box-shadow:var(--h4-miss2); }
  .h4-story.sel::before, .h4-story.sel::after { content:""; position:absolute; top:-8px; z-index:3;
    width:42px; height:14px; background:var(--h4-yellow); border:1px solid var(--h4-ink);
    transform:rotate(-36deg); }
  .h4-story.sel::before { left:-10px; } .h4-story.sel::after { right:-10px; transform:rotate(36deg); }
  .h4-story.load .meme-media { opacity:.3; filter:grayscale(1); }
  .h4-story.err { border-color:var(--h4-red); box-shadow:5px 5px 0 var(--h4-red); }
  .h4-story.err .h4-dateline { border-bottom-color:var(--h4-red); color:var(--h4-red); }
  .h4-veil { position:absolute; inset:0; display:grid; place-items:center;
    background:repeating-linear-gradient(45deg, transparent 0 10px, var(--h4-dot) 10px 20px); }
  .h4-veiltag { font-family:var(--h4-mono); font-size:10px; text-transform:uppercase;
    border:var(--h4-hair); background:var(--h4-yellow); color:var(--h4-deep); padding:5px 11px; }
  .hall4.theme-dark .h4-veiltag { color:#1b1712; }
  .h4-veiltag.err2 { background:var(--h4-red); color:#fff; }

  /*━━━ section label (typographic) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-sec { display:flex; gap:12px; align-items:baseline; margin-top:52px; padding:10px 0 20px;
    border-top:var(--h4-thick); font-family:var(--h4-mono); font-size:11px; text-transform:uppercase; }
  .h4-sec b { background:var(--h4-ink); color:var(--h4-paper); padding:3px 10px; font-weight:600; }
  .h4-sec i { font-family:var(--h4-hand); font-style:normal; font-size:17px; opacity:.65;
    text-transform:none; margin-left:auto; }
  .h4-row { display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start; }
  .h4-row.center { align-items:center; }
  .h4-shape { border:var(--h4-hair); background:var(--h4-card); width:132px; height:86px;
    display:grid; place-items:center; text-align:center; font-family:var(--h4-mono); font-size:9px; padding:6px; }
  .h4-grid { display:grid; gap:22px; }
  .h4-g4 { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .h4-g2 { grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }

  /*━━━ columns (newspaper) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-columns { display:flex; gap:0; }
  .h4-col { flex:1; min-width:0; padding:0 22px; display:flex; flex-direction:column; gap:18px; }
  .h4-col:first-child { padding-left:0; }
  .h4-col:last-child { padding-right:0; }
  .h4-col + .h4-col { border-left:var(--h4-col); }

  /*━━━ stat block ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-stat { border:var(--h4-hair); background:var(--h4-card); box-shadow:var(--h4-miss);
    padding:14px 18px; min-width:160px; }
  .h4-stat .lb { font-family:var(--h4-mono); font-size:10px; text-transform:uppercase; opacity:.7; }
  .h4-stat .vl { font-family:var(--h4-display); font-weight:400; font-size:38px; line-height:1.1; }
  .h4-stat.red { background:var(--h4-red); color:#fff; box-shadow:5px 5px 0 var(--h4-blue); }
  .h4-stat.red .lb { opacity:.8; }
  .h4-stat.ylw { background:var(--h4-yellow); color:var(--h4-deep); }
  .hall4.theme-dark .h4-stat.ylw { color:#1b1712; }

  /*━━━ input, tabs, toast ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-input { display:flex; align-items:center; gap:10px; border:var(--h4-hair);
    background:var(--h4-card); font-family:var(--h4-mono); font-size:14px;
    padding:11px 14px; min-width:min(260px,100%); }
  .h4-tabs { display:flex; border:var(--h4-hair); background:var(--h4-card); }
  .h4-tab { font-family:var(--h4-mono); font-size:12px; text-transform:uppercase;
    padding:11px 18px; min-height:44px; background:none; border:0;
    border-right:var(--h4-hair-d); color:var(--h4-ink); cursor:pointer; }
  .h4-tab:last-child { border-right:0; }
  .h4-tab.on { background:var(--h4-red); color:#fff; font-weight:700; }
  .h4-toast { display:inline-flex; gap:10px; align-items:center; border:var(--h4-hair);
    background:var(--h4-green); color:#fff; box-shadow:var(--h4-miss);
    font-family:var(--h4-mono); font-size:12px; text-transform:uppercase; padding:10px 16px; }
  .h4-empty { border:var(--h4-thick); background:var(--h4-card); box-shadow:var(--h4-miss-lg);
    padding:32px; max-width:460px; display:flex; flex-direction:column; gap:14px; align-items:flex-start; }
  .h4-empty .h4-hand-note { font-family:var(--h4-hand); font-size:22px; opacity:.65;
    transform:rotate(-1.5deg); }

  /*━━━ machinery bar: edition line ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-statusbar { display:flex; flex-wrap:wrap; border-top:var(--h4-thick);
    background:var(--h4-ink); color:var(--h4-paper); font-family:var(--h4-mono); font-size:10px; }
  .h4-statusbar .cell { display:flex; gap:8px; align-items:center; padding:9px 14px;
    border-right:1px dashed var(--h4-paper); }
  .h4-statusbar .cell b { text-transform:uppercase; opacity:.5; font-weight:400; }
  .h4-statusbar .cell i { width:8px; height:8px; border-radius:50%; background:var(--h4-green); }

  /*━━━ compositions: workbench + phone ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  .h4-bench { border:var(--h4-thick); background:var(--h4-card); box-shadow:var(--h4-miss-lg); }
  .h4-bench-bar { display:flex; align-items:center; gap:14px; padding:12px 18px;
    border-bottom:var(--h4-thick); background:var(--h4-tint); flex-wrap:wrap; }
  .h4-bench-flag { font-family:var(--h4-display); font-size:20px; }
  .h4-bench-main { display:flex; gap:20px; padding:20px; }
  .h4-rail { display:flex; flex-direction:column; gap:10px; min-width:220px; }
  .h4-pilebtn { display:flex; justify-content:space-between; align-items:center; gap:10px;
    border:var(--h4-hair-d); background:var(--h4-card); font-family:var(--h4-mono);
    font-size:11px; padding:9px 14px; color:var(--h4-ink); cursor:pointer; text-transform:uppercase; }
  .h4-pilebtn b { font-family:var(--h4-display); font-size:14px; font-weight:400; }
  .h4-pilebtn.on { border-style:solid; background:var(--h4-yellow); color:var(--h4-deep);
    font-weight:600; box-shadow:var(--h4-miss); }
  .hall4.theme-dark .h4-pilebtn.on { color:#1b1712; }
  .h4-phone { width:390px; max-width:100%; border:var(--h4-thick); box-shadow:var(--h4-miss-lg);
    background:var(--h4-paper); overflow:hidden; }
  .h4-dock { display:flex; border-top:var(--h4-thick); background:var(--h4-ink); }
  .h4-dock button { flex:1; min-height:48px; background:none; border:0;
    border-right:1px dashed var(--h4-paper); color:var(--h4-paper);
    font-family:var(--h4-mono); font-size:10px; text-transform:uppercase; }
  .h4-dock button.on { background:var(--h4-red); color:#fff; font-weight:700; }

  /*━━━ motion ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━*/
  @keyframes h4stamp { 0% { opacity:0; transform:scale(1.8) rotate(-20deg); }
    58% { opacity:1; transform:scale(.84) rotate(4deg); } 100% { opacity:1; transform:scale(1) rotate(-3deg); } }
  .h4-demo-stamp.go { animation:h4stamp 220ms var(--h4-ease); }
  @keyframes h4print { 0% { box-shadow:0 0 0 4px transparent, 0 0 0 transparent; }
    55% { box-shadow:0 0 0 4px var(--h4-red), 0 0 0 transparent; }
    100% { box-shadow:var(--h4-ring); } }
  .h4-demo-reveal.go .h4-story { animation:h4print 360ms var(--h4-ease) forwards; }

  @media (prefers-reduced-motion: reduce) {
    .hall4 *, .hall4 *::before, .hall4 *::after { animation:none !important; transition:none !important; }
    .h4-demo-stamp.go { opacity:1; }
    .h4-demo-reveal.go .h4-story { box-shadow:var(--h4-ring); }
  }
  @media (max-width: 900px) {
    .h4-g4 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .h4-columns { flex-direction:column; gap:20px; }
    .h4-col + .h4-col { border-left:0; border-top:var(--h4-col); padding:20px 0 0; }
    .h4-col { padding:0; }
    .h4-bench-main { flex-direction:column; }
    .h4-rail { flex-direction:row; flex-wrap:wrap; min-width:0; }
  }
  @media (max-width: 480px) {
    .h4-g4 { grid-template-columns:repeat(1,minmax(0,1fr)); }
    .h4-g2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .h4-desk-body { flex-direction:column; align-items:stretch; }
    .h4-nav a { padding:8px 10px; font-size:10px; border-right:0; }
    .h4-hed { font-size:clamp(28px,11vw,42px); }
  }`);

  const M = MEMES;
  mount.innerHTML = `
  <div class="hall4">
    <header class="h4-mast">
      <div class="h4-mast-top">
        <span><b>daily</b> &#183; ${LIB.total.toLocaleString()} plates &#183; press edition</span>
        <span>est. 2026</span>
      </div>
      <div class="h4-nameplate">
        <div class="h4-flag">the sploot <em>daily</em> herald</div>
        <p>all the memes that fit, we print &#183; no folders, just vibes</p>
      </div>
      <nav class="h4-nav">
        <a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a>
      </nav>
    </header>

    <!-- ── above the fold: hero + lead stories ── -->
    <section class="h4-wrap h4-hero">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <span class="h4-rubber">above the fold</span>
        <span class="h4-rubber blue mini">printing now</span>
      </div>
      <h1 class="h4-hed">type words. <em>get the picture.</em></h1>
      <p class="h4-deck">the press indexes every plate by meaning. when you search, it pulls the closest match from the archives. nobody files a thing.</p>
      <p class="h4-hero-note">THE PILE IS DEEP. ${LIB.total.toLocaleString()} MEMES. ZERO FOLDERS. THE MACHINE DECIDES.</p>
      ${h4console()}
      <div class="h4-grid h4-g4">
        ${M.slice(0, 4).map((x, i) => h4article(x, i === 0 ? 'match' : '', i === 0)).join('')}
      </div>
      <button type="button" class="h4-btn primary">find it</button>
    </section>

    <!-- ── the fold ── -->
    <div class="h4-wrap"><div class="h4-fold">&#8212;&#8212; fold &#8212;&#8212;</div></div>

    <!-- ── below the fold: column-ruled newsprint ── -->
    <div class="h4-wrap"><div class="h4-sec"><b>01</b><span>foundations</span><i>newsprint, ink, misregistration</i></div></div>
    <div class="h4-wrap">${swatches([
      ['ink', '#1b1712', '#f5efe0'], ['newsprint', '#f5efe0'], ['card-stock', '#faf6eb'],
      ['press red', '#ff4438', '#fff'], ['press blue', '#0078bf', '#fff'],
      ['press green', '#00a95c', '#fff'], ['press yellow', '#ffe800'], ['pink', '#ffd3e4']])}
      <div class="h4-row" style="margin-top:20px">
        <div class="h4-shape">2px ink rule</div>
        <div class="h4-shape" style="border-width:3px">3px ink · hero</div>
        <div class="h4-shape" style="border-style:dashed">dashed · ticker</div>
        <div class="h4-shape" style="border-style:dotted">dotted · column rule</div>
        <div class="h4-shape" style="box-shadow:var(--h4-miss)">1-color misregister</div>
        <div class="h4-shape" style="box-shadow:var(--h4-miss-lg)">2-color misregister</div>
        <div class="h4-shape" style="border-radius:0">radius 0 · paper is square</div>
      </div>
      <p style="margin-top:16px;font-family:var(--h4-mono);font-size:10px;opacity:.75">spacing rides a 22px baseline &#183; elevation is never gray blur, always a colored offset print &#183; the page folds where the editor decides</p>
    </div>

    <div class="h4-wrap"><div class="h4-sec"><b>02</b><span>typography</span><i>the newsroom drawer</i></div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="h4-hed" style="font-size:clamp(30px,5vw,56px)">display &middot; DM serif display</div>
        <div style="font-family:var(--h4-body);font-size:18px;max-width:540px;font-style:italic">deck &middot; fraunces italic. the pile sorts itself into piles while you sleep and the press never closes.</div>
        <div style="font-family:var(--h4-body);font-size:15px;max-width:560px">body &middot; fraunces roman. a readable literary serif that carries the weight of a thousand memes without taking itself too seriously.</div>
        <div style="font-family:var(--h4-mono);font-size:12px;text-transform:uppercase">label &middot; ibm plex mono, uppercase, on the rack</div>
        <div style="font-family:var(--h4-mono);font-size:10px;opacity:.7">metadata &middot; vec 0413 &middot; ${LIB.latency}ms &middot; ${LIB.model}</div>
        <div style="font-family:var(--h4-mono);font-size:26px;font-variant-numeric:tabular-nums">${LIB.total.toLocaleString()} &middot; 0.94 &middot; ${LIB.latency}ms</div>
        <div style="font-family:var(--h4-body);font-size:13.5px;max-width:430px;border-left:3px solid var(--h4-red);padding-left:12px;font-style:italic">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me is now framed above my desk like a diploma, in italic running text beneath the fold, column-right.</div>
        <div style="font-family:var(--h4-hand);font-size:22px;opacity:.65;transform:rotate(-1deg)">marginalia &middot; caveat, for notes the editor scribbles in the margin</div>
      </div>
    </div>

    <div class="h4-wrap"><div class="h4-sec"><b>03</b><span>components</span><i>every story is printed matter</i></div>
      <div style="display:flex;flex-direction:column;gap:30px">

        <!-- ── column layout: two stories side by side ── -->
        ${h4console('sad frog')}

        <div class="h4-grid h4-g4">
          ${h4article(M[0], 'match')}${h4article(M[1], 'near')}${h4article(M[2], 'dim')}${h4article(M[3], '')}
        </div>
        <div class="h4-grid h4-g4">
          ${h4article(M[4], 'sel')}${h4article(M[5], 'load')}${h4article(M[6], 'err')}
          <div class="h4-empty">
            ${h4rubber('nothing filed', 'green')}
            <p style="font-size:15.5px">the press is warm and the plates are empty. upload chaos and we go to print.</p>
            <p class="h4-hand-note">first issue is always the weirdest.</p>
            <button type="button" class="h4-btn primary">upload chaos</button>
          </div>
        </div>
        <div class="h4-row center">
          <button type="button" class="h4-btn primary">find it</button>
          <button type="button" class="h4-btn">shuffle the pile</button>
          <button type="button" class="h4-btn ghost">secondary</button>
          <button type="button" class="h4-btn compact">compact</button>
          <button type="button" class="h4-btn icon" aria-label="close">&#10005;</button>
          <span class="h4-rubber">banger</span>
          <span class="h4-rubber blue mini">classified</span>
          <div class="h4-star h4-star-demo"><span>banger!</span></div>
        </div>
        <div class="h4-row center">
          <div class="h4-input"><span class="h4-fieldmark">&gt;</span><span>text input</span><span class="h4-caret"></span></div>
          <div class="h4-tabs"><button type="button" class="h4-tab on">all</button><button type="button" class="h4-tab">bangers</button><button type="button" class="h4-tab">recent</button></div>
          <div class="h4-toast">sent to press &middot; filed in the pile</div>
        </div>
        <div class="h4-row">
          <div class="h4-stat red"><div class="lb">folders required</div><div class="vl">0</div></div>
          <div class="h4-stat"><div class="lb">plates printed</div><div class="vl">${LIB.total.toLocaleString()}</div></div>
          <div class="h4-stat ylw"><div class="lb">bangers</div><div class="vl">37</div></div>
        </div>
        ${h4statusbar()}
      </div>
    </div>

    <div class="h4-wrap"><div class="h4-sec"><b>04</b><span>motion</span><i>the press only moves when you touch it</i></div>
      <div class="h4-row center">
        <button type="button" class="h4-btn primary">press me &middot; misregister collapses</button>
        <button type="button" class="h4-btn h4-go-stamp">stamp the edition</button>
        <span class="h4-rubber big h4-demo-stamp" style="visibility:hidden">banger!</span>
        <button type="button" class="h4-btn h4-go-print">replay match reveal</button>
        <div class="h4-demo-reveal" style="width:150px">${h4article(M[2], '', false).replace('h4-story', 'h4-story').replace('h4-byline', 'h4-byline').replace('h4-starlet', 'h4-starlet')}</div>
      </div>
      <p style="margin-top:14px;font-family:var(--h4-mono);font-size:10px;opacity:.75">prefers-reduced-motion: every stamp, reveal and offset transition collapses to an instant state change.</p>
    </div>

    <div class="h4-wrap"><div class="h4-sec"><b>05</b><span>compositions</span><i>workbench + pocket edition</i></div></div>
    <div class="h4-wrap" style="padding-bottom:12px">
      <div class="h4-bench">
        <div class="h4-bench-bar">
          <span class="h4-bench-flag">the sploot daily herald</span>
          <div class="h4-field" style="flex:1;max-width:420px"><span class="h4-fieldmark">&gt;</span><span class="h4-q">search the pile</span><span class="h4-caret"></span></div>
          <button type="button" class="h4-btn compact">upload</button>
          <button type="button" class="h4-btn compact">bangers</button>
          <button type="button" class="h4-btn compact">shuffle</button>
        </div>
        <div class="h4-bench-main">
          <div class="h4-rail">
            ${PILES.slice(0, 5).map((p, i) => `<button type="button" class="h4-pilebtn ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}
          </div>
          <div class="h4-grid h4-g4" style="flex:1">${M.slice(0, 8).map(x => h4article(x, '', false)).join('')}</div>
        </div>
        ${h4statusbar()}
      </div>
    </div>
    <div class="h4-wrap" style="padding-top:26px;padding-bottom:48px">
      <div class="h4-phone">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:var(--h4-thick);background:var(--h4-card)">
          <span style="font-family:var(--h4-display);font-size:17px">sploot daily</span>
          <span style="font-family:var(--h4-mono);font-size:10px;opacity:.7">${LIB.total.toLocaleString()} plates</span>
        </div>
        <div style="padding:14px;display:flex;flex-direction:column;gap:14px">
          <div class="h4-input" style="min-width:0"><span class="h4-fieldmark">&gt;</span><span>cat losing it</span><span class="h4-caret"></span></div>
          <div class="h4-grid h4-g2">${M.slice(0, 4).map((x, i) => h4article(x, i === 0 ? 'match' : '', false)).join('')}</div>
        </div>
        <div class="h4-dock"><button type="button" class="on">pile</button><button type="button">search</button><button type="button">upload</button><button type="button">bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'broadsheet · above-the-fold newspaper edition'], ['type', 'dm serif display / fraunces / ibm plex mono'],
        ['move', 'the page is a newspaper: dateline+byline on every card, column rules, and an explicit fold dividing the hero from columned newsprint below'],
        ['density', 'column-guttered tight'], ['motion', 'press mechanics: stamp, register, reveal, touch-initiated only']])}
    </div>
  </div>`;

  const root = mount.querySelector('.hall4');
  themeToggle(root);

  const stampBtn = root.querySelector('.h4-go-stamp');
  const stampEl = root.querySelector('.h4-demo-stamp');
  if (stampBtn && stampEl) stampBtn.onclick = () => {
    stampEl.style.visibility = 'visible';
    stampEl.classList.remove('go');
    void stampEl.offsetWidth;
    stampEl.classList.add('go');
  };

  const printBtn = root.querySelector('.h4-go-print');
  const printEl = root.querySelector('.h4-demo-reveal');
  if (printBtn && printEl) printBtn.onclick = () => {
    printEl.classList.remove('go');
    void printEl.offsetWidth;
    printEl.classList.add('go');
  };
};

})();
