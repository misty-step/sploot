/* lab 034 · lane AFD — anthropic-frontend-design bench lane.
   Three complete-system propositions: AFD-1 overprint, AFD-2 signal,
   AFD-3 toybox. Each is one system rule pushed to hypermaximalism. */
'use strict';

(() => {

/* ════════════════════════════════════════════════════════════════════
   AFD-1 · OVERPRINT — the riso print-room archive.
   System rule: misregistration is elevation. Every object is printed
   matter and carries annotations: stamps, tape, ticket stubs, tilt.
   ════════════════════════════════════════════════════════════════════ */

const A1_TILT = ['a1-t0', 'a1-t1', 'a1-t2', 'a1-t3'];

function a1Cell(m, state = '', i = 0, stub = false) {
  return `
  <div class="a1-cellwrap ${A1_TILT[i % 4]}">
    <div class="a1-cell ${state}">
      <span class="a1-tapebit"></span>
      <div class="a1-head"><span>${esc(m.file)}</span><span>vec ${m.vec}</span></div>
      <div class="a1-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>
      <div class="a1-cap"><span>${esc(m.cap)}</span>${m.banger ? '<span class="a1-rubber mini">banger</span>' : ''}</div>
      ${state === 'match' ? '<span class="a1-rubber big a1-overlay">closest match</span>' : ''}
      ${state === 'error' ? '<span class="a1-rubber big red a1-overlay">misprint</span>' : ''}
    </div>
    ${stub ? `<div class="a1-stub"><b>${(m.score / 100).toFixed(2)}</b><span>${m.score >= 90 ? 'closest match' : m.score >= 75 ? 'strong pull' : 'related'}</span><i></i></div>` : ''}
  </div>`;
}

function a1Console(q = 'cat losing it') {
  return `
  <div class="a1-console">
    <div class="a1-console-bar"><span>search request slip</span><span>route /api/search</span></div>
    <div class="a1-console-shelf">
      <div class="a1-field"><span class="a1-prompt">&gt;</span><span class="a1-q">${esc(q)}</span><span class="a1-caret"></span></div>
      <button class="a1-btn primary">find it</button>
    </div>
    <div class="a1-console-meta">
      <span>index ${LIB.total.toLocaleString()} vec</span><span>model ${LIB.model}</span>
      <span>dim ${LIB.dim}</span><span>${LIB.latency}ms</span>
    </div>
  </div>`;
}

function a1Status() {
  const cells = [
    ['index', `${LIB.total.toLocaleString()} vec`], ['model', LIB.model],
    ['queue', `${LIB.queued} embedding`], ['latency', `${LIB.latency}ms`], ['press', 'running', true],
  ];
  return `<div class="a1-status">${cells.map(c =>
    `<span class="cell ${c[2] ? 'ok' : ''}"><b>${c[0]}</b>${c[1]}</span>`).join('')}<span class="a1-postmark">est. 2026</span></div>`;
}

SPECS['AFD-1'] = (mount) => {
  css('AFD-1', `
  .afd1 {
    --a1-paper:#e9dbbd; --a1-paper2:#f4ecd8; --a1-card:#f7f0de; --a1-ink:#26201b;
    --a1-mut:rgba(38,32,27,.62); --a1-dot:rgba(38,32,27,.08);
    --a1-pink:#ff48b0; --a1-blue:#0078bf; --a1-orange:#ff6c2f;
    --a1-green:#00a05a; --a1-yellow:#ffe800; --a1-red:#e8321e;
    --a1-b:2px solid var(--a1-ink); --a1-b3:3px solid var(--a1-ink);
    --a1-miss:4px 4px 0 var(--a1-pink);
    --a1-miss2:4px 4px 0 var(--a1-blue);
    --a1-miss-lg:6px 6px 0 var(--a1-pink), 12px 12px 0 var(--a1-blue);
    --a1-ring:0 0 0 4px var(--a1-pink), 9px 9px 0 var(--a1-blue);
    --a1-tape:rgba(255,232,0,.55);
    --a1-fast:90ms; --a1-slow:180ms; --a1-ease:cubic-bezier(.2,.8,.2,1);
    --a1-display:'Shrikhand', cursive; --a1-body:'Bricolage Grotesque', sans-serif;
    --a1-mono:'IBM Plex Mono', monospace; --a1-hand:'Caveat', cursive;
    min-height:100dvh; display:flex; flex-direction:column;
    font-family:var(--a1-body); color:var(--a1-ink);
    background: radial-gradient(var(--a1-dot) 1px, transparent 1.4px) 0 0 / 14px 14px, var(--a1-paper);
  }
  .afd1.theme-dark {
    --a1-paper:#211a12; --a1-paper2:#2b2318; --a1-card:#2e261a; --a1-ink:#f2e8d3;
    --a1-mut:rgba(242,232,211,.66); --a1-dot:rgba(242,232,211,.06);
    --a1-blue:#3fa4e8; --a1-green:#2ec27e; --a1-red:#ff5a45;
    --a1-b:2px solid var(--a1-ink); --a1-b3:3px solid var(--a1-ink);
    --a1-miss:4px 4px 0 var(--a1-pink);
    --a1-miss2:4px 4px 0 var(--a1-blue);
    --a1-miss-lg:6px 6px 0 var(--a1-pink), 12px 12px 0 var(--a1-blue);
    --a1-ring:0 0 0 4px var(--a1-pink), 9px 9px 0 var(--a1-blue);
    --a1-tape:rgba(255,232,0,.35);
  }
  .afd1 :focus-visible { outline:3px dashed var(--a1-pink); outline-offset:3px; }
  .afd1 .a1-wrap { width:100%; max-width:1140px; margin:0 auto; padding:0 clamp(14px, 4vw, 44px); }
  .afd1 .a1-sec { display:flex; gap:12px; align-items:baseline; margin-top:52px; padding:10px 0 20px;
    border-top:var(--a1-b); font-family:var(--a1-mono); font-size:11px; text-transform:lowercase; letter-spacing:.1em; }
  .afd1 .a1-sec b { background:var(--a1-ink); color:var(--a1-paper); padding:2px 9px; font-weight:600; }
  .afd1 .a1-sec i { font-family:var(--a1-hand); font-style:normal; font-size:17px; color:var(--a1-mut); letter-spacing:0; }
  .afd1 .a1-row { display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start; }

  /* tilt set: the only sanctioned chaos */
  .afd1 .a1-t0 { transform:rotate(-1.1deg); } .afd1 .a1-t1 { transform:rotate(.7deg); }
  .afd1 .a1-t2 { transform:rotate(-.4deg); } .afd1 .a1-t3 { transform:rotate(1.2deg); }

  /* masthead */
  .afd1 .a1-mast { display:flex; align-items:center; justify-content:space-between; gap:16px;
    padding:14px clamp(14px, 4vw, 44px); border-bottom:var(--a1-b3); background:var(--a1-paper2); }
  .afd1 .a1-logo { font-family:var(--a1-display); font-size:30px; letter-spacing:.01em;
    text-shadow:3px 2px 0 var(--a1-pink), -2px -2px 0 var(--a1-blue); }
  .afd1 .a1-mast nav { display:flex; gap:16px; font-family:var(--a1-mono); font-size:12px; }
  .afd1 .a1-mast nav a { color:var(--a1-ink); text-decoration:none; border-bottom:2px dotted var(--a1-mut); padding:2px 0; }
  .afd1 .a1-mast nav a:hover { border-bottom:2px solid var(--a1-pink); color:var(--a1-pink); }

  /* stamps: dashed = postage, rubber = verdict */
  .afd1 .a1-stamp { display:inline-block; border:2px dashed var(--a1-ink); background:var(--a1-card);
    font-family:var(--a1-mono); font-size:11px; padding:6px 12px; text-transform:lowercase; }
  .afd1 .a1-stamp.pink { border-color:var(--a1-pink); color:var(--a1-pink); }
  .afd1 .a1-stamp.blue { border-color:var(--a1-blue); color:var(--a1-blue); }
  .afd1 .a1-rubber { display:inline-block; font-family:var(--a1-mono); font-weight:600; font-size:11px;
    text-transform:uppercase; letter-spacing:.08em; color:var(--a1-pink);
    border:3px double var(--a1-pink); padding:3px 9px; transform:rotate(-3deg); background:transparent; }
  .afd1 .a1-rubber.mini { font-size:9px; padding:1px 6px; border-width:2px; border-style:solid; flex:none; }
  .afd1 .a1-rubber.big { font-size:14px; padding:7px 14px; }
  .afd1 .a1-rubber.red { color:var(--a1-red); border-color:var(--a1-red); }
  .afd1 .a1-rubber.green { color:var(--a1-green); border-color:var(--a1-green); }
  .afd1 .a1-overlay { position:absolute; top:34%; left:50%; transform:translate(-50%,-50%) rotate(-8deg);
    background:var(--a1-card); z-index:2; }

  /* buttons: printed blocks, misregistration collapses on press */
  .afd1 .a1-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px;
    min-height:44px; padding:10px 20px; font-family:var(--a1-mono); font-weight:600; font-size:13px;
    text-transform:lowercase; border:var(--a1-b); background:var(--a1-card); color:var(--a1-ink);
    box-shadow:var(--a1-miss); transition:transform var(--a1-fast) var(--a1-ease), box-shadow var(--a1-fast) var(--a1-ease); }
  .afd1 .a1-btn:hover { transform:translate(-2px,-2px); box-shadow:6px 6px 0 var(--a1-pink), 10px 10px 0 var(--a1-blue); }
  .afd1 .a1-btn:active { transform:translate(4px,4px); box-shadow:0 0 0 var(--a1-pink); }
  .afd1 .a1-btn.primary { background:var(--a1-pink); color:#26201b; box-shadow:var(--a1-miss2); }
  .afd1 .a1-btn.primary:hover { box-shadow:6px 6px 0 var(--a1-blue), 10px 10px 0 var(--a1-ink); }
  .afd1 .a1-btn.quiet { box-shadow:none; border-style:dashed; }
  .afd1 .a1-btn.sm { min-height:34px; padding:5px 12px; font-size:11px; box-shadow:2px 2px 0 var(--a1-pink); }
  .afd1 .a1-btn.icon { width:44px; padding:0; }

  /* search console: the request slip */
  .afd1 .a1-console { border:var(--a1-b3); background:var(--a1-card); box-shadow:var(--a1-miss-lg); max-width:820px; }
  .afd1 .a1-console-bar { display:flex; justify-content:space-between; gap:10px; background:var(--a1-ink);
    color:var(--a1-paper); font-family:var(--a1-mono); font-size:11px; text-transform:lowercase; padding:7px 14px; }
  .afd1 .a1-console-shelf { display:flex; gap:12px; padding:16px; align-items:center;
    background:repeating-linear-gradient(transparent, transparent 26px, var(--a1-dot) 26px, var(--a1-dot) 27px), var(--a1-card); }
  .afd1 .a1-field { flex:1; display:flex; align-items:center; gap:10px; border:var(--a1-b);
    background:var(--a1-paper2); padding:12px 14px; font-family:var(--a1-mono); font-size:15px; min-width:0; }
  .afd1 .a1-prompt { opacity:.5; } .afd1 .a1-q { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .afd1 .a1-caret { width:10px; height:20px; background:var(--a1-pink); flex:none; animation:a1blink 1s steps(1) infinite; }
  @keyframes a1blink { 50% { opacity:0; } }
  .afd1 .a1-console-meta { display:flex; gap:16px; flex-wrap:wrap; border-top:2px dashed var(--a1-ink);
    padding:8px 14px; font-family:var(--a1-mono); font-size:10px; color:var(--a1-mut); }

  /* meme cell: the specimen card */
  .afd1 .a1-cellwrap { position:relative; }
  .afd1 .a1-cell { position:relative; border:var(--a1-b); background:var(--a1-card); box-shadow:var(--a1-miss);
    transition:transform var(--a1-fast) var(--a1-ease), box-shadow var(--a1-fast) var(--a1-ease); }
  .afd1 .a1-cell:hover { transform:translate(-2px,-2px) rotate(.3deg); box-shadow:6px 6px 0 var(--a1-pink); }
  .afd1 .a1-tapebit { position:absolute; top:-9px; left:50%; width:64px; height:18px; margin-left:-32px;
    background:var(--a1-tape); border:1px solid rgba(38,32,27,.15); transform:rotate(-2deg); z-index:2; }
  .afd1 .a1-head { display:flex; justify-content:space-between; gap:8px; padding:6px 9px;
    font-family:var(--a1-mono); font-size:9px; text-transform:lowercase; color:var(--a1-mut);
    border-bottom:2px dashed var(--a1-ink); white-space:nowrap; overflow:hidden; }
  .afd1 .a1-art { display:grid; place-items:center; overflow:hidden; background:var(--a1-paper2); }
  .afd1 .a1-art .meme-media { background:var(--a1-paper2); }
  .afd1 .a1-cap { display:flex; justify-content:space-between; align-items:center; gap:8px;
    padding:8px 10px; font-size:12.5px; line-height:1.35; font-weight:500; border-top:var(--a1-b); }
  .afd1 .a1-cell.match { box-shadow:var(--a1-ring); }
  .afd1 .a1-cell.near { outline:3px dashed var(--a1-blue); outline-offset:3px; }
  .afd1 .a1-cell.dim { opacity:.4; filter:grayscale(.65) contrast(.92); box-shadow:none; }
  .afd1 .a1-cell.selected { border-width:3px; box-shadow:var(--a1-miss-lg); }
  .afd1 .a1-cell.selected::before, .afd1 .a1-cell.selected::after { content:""; position:absolute; width:46px; height:16px;
    background:var(--a1-tape); border:1px solid rgba(38,32,27,.15); z-index:2; }
  .afd1 .a1-cell.selected::before { top:-8px; left:-14px; transform:rotate(-38deg); }
  .afd1 .a1-cell.selected::after { top:-8px; right:-14px; transform:rotate(38deg); }
  .afd1 .a1-cell.error { border-color:var(--a1-red); }
  .afd1 .a1-cell.error .a1-head { border-bottom-color:var(--a1-red); color:var(--a1-red); }
  .afd1 .a1-load { display:grid; place-items:center; font-family:var(--a1-mono); font-size:10px; text-transform:lowercase;
    background:repeating-linear-gradient(45deg, var(--a1-paper2), var(--a1-paper2) 9px, var(--a1-card) 9px, var(--a1-card) 18px); }

  /* score stub: perforated ticket under the card */
  .afd1 .a1-stub { position:relative; display:flex; align-items:center; gap:10px; margin:0 10px;
    border:var(--a1-b); border-top:2px dashed var(--a1-ink); background:var(--a1-yellow); color:#26201b;
    font-family:var(--a1-mono); font-size:10px; padding:5px 10px; }
  .afd1 .a1-stub b { font-size:13px; font-weight:700; }
  .afd1 .a1-stub i { margin-left:auto; width:10px; height:10px; border:2px solid #26201b; border-radius:50%; }

  /* stat ledger card */
  .afd1 .a1-stat { border:var(--a1-b); background:var(--a1-card); box-shadow:var(--a1-miss); padding:12px 16px; min-width:150px; }
  .afd1 .a1-stat .lb { font-family:var(--a1-mono); font-size:10px; color:var(--a1-mut); }
  .afd1 .a1-stat .vl { font-family:var(--a1-display); font-size:36px; line-height:1.15; }
  .afd1 .a1-stat.pink { background:var(--a1-pink); color:#26201b; box-shadow:var(--a1-miss2); }
  .afd1 .a1-stat.pink .lb { color:rgba(38,32,27,.7); }
  .afd1 .a1-stat.yellow { background:var(--a1-yellow); color:#26201b; }
  .afd1 .a1-stat.yellow .lb { color:rgba(38,32,27,.7); }

  /* machinery bar: the pressroom postmark strip */
  .afd1 .a1-status { display:flex; flex-wrap:wrap; align-items:center; gap:0; border-top:var(--a1-b3);
    background:var(--a1-ink); color:var(--a1-paper); font-family:var(--a1-mono); font-size:11px; }
  .afd1 .a1-status .cell { display:flex; gap:8px; align-items:center; padding:9px 14px; border-right:1px dashed rgba(244,236,216,.35); }
  .afd1 .a1-status .cell b { text-transform:lowercase; opacity:.55; font-weight:400; }
  .afd1 .a1-status .ok::after { content:""; width:8px; height:8px; border-radius:50%; background:var(--a1-green); }
  .afd1 .a1-postmark { margin-left:auto; padding:4px 14px; font-family:var(--a1-hand); font-size:16px; opacity:.7; }

  /* inputs, tabs, toast */
  .afd1 .a1-input { display:flex; align-items:center; gap:10px; border:var(--a1-b); background:var(--a1-paper2);
    padding:11px 14px; font-family:var(--a1-mono); font-size:14px; min-width:260px; }
  .afd1 .a1-tabs { display:flex; align-items:flex-end; }
  .afd1 .a1-tab { font-family:var(--a1-mono); font-size:12px; text-transform:lowercase; padding:10px 18px; min-height:44px;
    border:var(--a1-b); border-bottom:0; background:var(--a1-paper2); margin-right:-2px; cursor:pointer;
    border-radius:8px 8px 0 0; color:var(--a1-ink); }
  .afd1 .a1-tab.on { background:var(--a1-yellow); color:#26201b; font-weight:600; padding-top:14px; box-shadow:var(--a1-miss2); position:relative; z-index:1; }
  .afd1 .a1-tabrule { border-bottom:var(--a1-b); }
  .afd1 .a1-toast { display:inline-flex; gap:12px; align-items:center; border:2px dashed var(--a1-green);
    color:var(--a1-green); background:var(--a1-card); padding:11px 16px; font-family:var(--a1-mono); font-size:12px;
    box-shadow:var(--a1-miss); }
  .afd1 .a1-empty { border:var(--a1-b3); background:var(--a1-card); box-shadow:var(--a1-miss-lg);
    padding:32px; max-width:440px; display:flex; flex-direction:column; gap:14px; align-items:flex-start; }
  .afd1 .a1-empty .hand { font-family:var(--a1-hand); font-size:22px; color:var(--a1-mut); transform:rotate(-1.5deg); }

  /* hero */
  .afd1 .a1-hero { padding-top:46px; display:flex; flex-direction:column; gap:24px; }
  .afd1 .a1-h1 { font-family:var(--a1-display); font-size:clamp(38px, 7.2vw, 84px); line-height:1.04; letter-spacing:.005em;
    text-shadow:4px 3px 0 var(--a1-pink), -3px -2px 0 var(--a1-blue); max-width:12ch; }
  .afd1 .a1-hero-note { font-size:17px; max-width:52ch; }
  .afd1 .a1-hero-note .hand { font-family:var(--a1-hand); font-size:21px; color:var(--a1-pink); }

  /* foundations specimens */
  .afd1 .a1-shape { border:var(--a1-b); background:var(--a1-paper2); width:132px; height:84px;
    display:grid; place-items:center; text-align:center; font-family:var(--a1-mono); font-size:9px; padding:6px; }

  /* grids */
  .afd1 .a1-grid { display:grid; gap:22px; }
  .afd1 .g4 { grid-template-columns:repeat(4, 1fr); }
  .afd1 .g2 { grid-template-columns:repeat(2, 1fr); }

  /* workbench + phone */
  .afd1 .a1-bench { border:var(--a1-b3); background:var(--a1-paper2); box-shadow:var(--a1-miss-lg); }
  .afd1 .a1-bench-bar { display:flex; align-items:center; gap:14px; padding:10px 16px; border-bottom:var(--a1-b); flex-wrap:wrap; }
  .afd1 .a1-pilerail { display:flex; flex-direction:column; gap:10px; min-width:210px; }
  .afd1 .a1-pile { display:flex; justify-content:space-between; gap:10px; border:2px dashed var(--a1-ink);
    background:var(--a1-card); padding:9px 12px; font-family:var(--a1-mono); font-size:11px; cursor:pointer; }
  .afd1 .a1-pile.on { border-style:solid; background:var(--a1-yellow); color:#26201b; font-weight:600; box-shadow:var(--a1-miss2); }
  .afd1 .a1-phone { width:min(390px, 100%); border:var(--a1-b3); box-shadow:var(--a1-miss-lg); background:var(--a1-paper); overflow:hidden; }
  .afd1 .a1-dock { display:flex; border-top:var(--a1-b3); background:var(--a1-ink); }
  .afd1 .a1-dock button { flex:1; min-height:52px; background:none; border:0; border-right:1px dashed rgba(244,236,216,.35);
    color:var(--a1-paper); font-family:var(--a1-mono); font-size:10px; text-transform:lowercase; }
  .afd1 .a1-dock button.on { background:var(--a1-pink); color:#26201b; font-weight:600; }

  /* motion */
  @keyframes a1slam { 0% { opacity:0; transform:scale(2.1) rotate(-18deg); } 62% { opacity:1; transform:scale(.9) rotate(2deg); } 100% { opacity:1; transform:scale(1) rotate(-3deg); } }
  .afd1 .a1-demo-stamp.go { animation:a1slam var(--a1-slow) var(--a1-ease); }
  @keyframes a1print { 0% { box-shadow:0 0 0 4px transparent, 0 0 0 transparent; } 55% { box-shadow:0 0 0 4px var(--a1-pink), 0 0 0 transparent; } 100% { box-shadow:var(--a1-ring); } }
  .afd1 .a1-demo-print.go .a1-cell { animation:a1print 340ms var(--a1-ease) forwards; }

  @media (prefers-reduced-motion: reduce) {
    .afd1 *, .afd1 *::before, .afd1 *::after { animation:none !important; transition:none !important; }
    .afd1 .a1-demo-stamp.go { opacity:1; }
  }
  @media (max-width:700px) {
    .afd1 .g4 { grid-template-columns:repeat(2, minmax(0,1fr)); }
    .afd1 .a1-console-shelf { flex-direction:column; align-items:stretch; }
    .afd1 .a1-bench-inner { flex-direction:column; }
    .afd1 .a1-pilerail { min-width:0; }
    .afd1 .a1-mast nav { gap:10px; font-size:10px; flex-wrap:wrap; }
  }`);

  const M = MEMES;
  mount.innerHTML = `
  <div class="afd1">
    <div class="a1-mast">
      <span class="a1-logo">sploot</span>
      <nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </div>

    <div class="a1-wrap a1-hero">
      <span class="a1-stamp pink a1-t0">overprint edition · run of one</span>
      <h1 class="a1-h1">type words. get the picture.</h1>
      <p class="a1-hero-note">sploot prints your entire meme brain onto one pile and indexes every sheet.
        no folders. just vibes. <span class="hand">every match gets stamped by hand. by a machine.</span></p>
      ${a1Console()}
      <div class="a1-grid g4">${M.slice(0, 4).map((x, i) => a1Cell(x, i === 0 ? 'match' : '', i, i === 0)).join('')}</div>
    </div>

    <div class="a1-wrap"><div class="a1-sec"><b>02</b> foundations <i>inks, paper, misregistration</i></div></div>
    <div>${swatches([['ink', '#26201b', '#f4ecd8'], ['paper', '#e9dbbd'], ['card', '#f7f0de'], ['riso pink', '#ff48b0'], ['riso blue', '#0078bf', '#fff'], ['riso orange', '#ff6c2f'], ['riso green', '#00a05a', '#fff'], ['riso yellow', '#ffe800'], ['stamp red', '#e8321e', '#fff']])}</div>
    <div class="a1-wrap" style="padding-top:20px">
      <div class="a1-row">
        <div class="a1-shape">2px ink · object</div>
        <div class="a1-shape" style="border-width:3px">3px ink · hero</div>
        <div class="a1-shape" style="border-style:dashed">dashed · postage</div>
        <div class="a1-shape" style="box-shadow:var(--a1-miss)">1-color misregister · raised</div>
        <div class="a1-shape" style="box-shadow:var(--a1-miss-lg)">2-color misregister · floating</div>
        <div class="a1-shape" style="border-radius:0">radius 0 · paper is square</div>
      </div>
      <p style="margin-top:16px;font-family:var(--a1-mono);font-size:10px;color:var(--a1-mut)">spacing rides a 22px baseline sheet · elevation is never gray blur, always a colored offset print · tilt comes from a fixed 4-step set</p>
    </div>

    <div class="a1-wrap"><div class="a1-sec"><b>03</b> typography <i>sign paint over typewriter</i></div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="font-family:var(--a1-display);font-size:50px;line-height:1.1;text-shadow:3px 2px 0 var(--a1-pink)">display · shrikhand</div>
        <div style="font-size:17px;max-width:560px">body · bricolage grotesque. the pile sorts itself while you sleep and never asks you to name a folder.</div>
        <div style="font-family:var(--a1-mono);font-size:12px">label · ibm plex mono, lowercase, printed flat</div>
        <div style="font-family:var(--a1-mono);font-size:10px;color:var(--a1-mut)">metadata · vec 0413 · 212ms · siglip-base · 768d</div>
        <div style="font-family:var(--a1-mono);font-size:26px;font-variant-numeric:tabular-nums">1,482 · 0.94 · 212ms</div>
        <div style="font-size:13.5px;max-width:430px;border-left:3px solid var(--a1-pink);padding-left:12px">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me now hangs above my desk like a diploma.</div>
        <div style="font-family:var(--a1-hand);font-size:22px;color:var(--a1-mut);transform:rotate(-1deg)">marginalia · caveat, for notes the archivist scribbles on the sleeve</div>
      </div>
    </div>

    <div class="a1-wrap"><div class="a1-sec"><b>04</b> components <i>everything is printed matter</i></div>
      <div style="display:flex;flex-direction:column;gap:30px">
        ${a1Console('sad frog')}
        <div class="a1-grid g4">
          ${a1Cell(M[0], 'match', 0, true)}
          ${a1Cell(M[1], 'near', 1)}
          ${a1Cell(M[2], 'dim', 2)}
          ${a1Cell(M[3], '', 3)}
        </div>
        <div class="a1-grid g4">
          <div class="a1-cellwrap a1-t1"><div class="a1-cell selected">
            <div class="a1-head"><span>${esc(M[4].file)}</span><span>vec ${M[4].vec}</span></div>
            <div class="a1-art" style="aspect-ratio:1/1">${memeImg(M[4])}</div>
            <div class="a1-cap"><span>selected · taped down, 3px plate</span></div></div></div>
          <div class="a1-cellwrap a1-t2"><div class="a1-cell">
            <div class="a1-head"><span>uploading…</span><span>queue ${LIB.queued}</span></div>
            <div class="a1-art a1-load" style="aspect-ratio:1/1">printing…</div>
            <div class="a1-cap"><span>loading · the press is warm</span></div></div></div>
          <div class="a1-cellwrap a1-t3"><div class="a1-cell error">
            <div class="a1-head"><span>failed.png</span><span>err 500</span></div>
            <div class="a1-art" style="aspect-ratio:1/1;display:grid;place-items:center"><span style="font-family:var(--a1-mono);font-size:11px">the embedding smudged. run it again.</span></div>
            <div class="a1-cap"><span>error state</span><button class="a1-btn sm">retry</button></div>
            <span class="a1-rubber big red a1-overlay">misprint</span></div></div>
          <div class="a1-empty a1-t0">
            <span class="a1-rubber green">nothing filed</span>
            <p style="font-size:15.5px">the pile is empty and the press is idle. upload chaos and we start printing.</p>
            <p class="hand">first sheet is always the weirdest.</p>
            <button class="a1-btn primary">upload chaos</button>
          </div>
        </div>
        <div class="a1-row" style="align-items:center">
          <button class="a1-btn primary">find it</button>
          <button class="a1-btn">shuffle the pile</button>
          <button class="a1-btn quiet">secondary</button>
          <button class="a1-btn sm">compact</button>
          <button class="a1-btn sm icon" aria-label="close">✕</button>
          <span class="a1-stamp">sticker · postage</span>
          <span class="a1-stamp blue a1-t3">air mail</span>
          <span class="a1-rubber">banger</span>
        </div>
        <div class="a1-row" style="align-items:center">
          <div class="a1-input"><span style="opacity:.5">&gt;</span><span>text input</span><span class="a1-caret"></span></div>
          <div>
            <div class="a1-tabs"><div class="a1-tab on">all</div><div class="a1-tab">bangers</div><div class="a1-tab">recent</div></div>
            <div class="a1-tabrule" style="width:280px"></div>
          </div>
          <div class="a1-toast">✓ saved to the pile · stamped and filed</div>
        </div>
        <div class="a1-row">
          <div class="a1-stat yellow a1-t0"><div class="lb">folders required</div><div class="vl">0</div></div>
          <div class="a1-stat a1-t1"><div class="lb">memes indexed</div><div class="vl">1,482</div></div>
          <div class="a1-stat pink a1-t3"><div class="lb">bangers</div><div class="vl">37</div></div>
        </div>
        ${a1Status()}
      </div>
    </div>

    <div class="a1-wrap"><div class="a1-sec"><b>05</b> motion <i>the press only moves when you touch it</i></div>
      <div class="a1-row" style="align-items:center">
        <button class="a1-btn primary">press me · misregister collapses</button>
        <button class="a1-btn a1-go-slam">stamp it</button>
        <span class="a1-rubber big a1-demo-stamp" style="visibility:hidden">banger!</span>
        <button class="a1-btn a1-go-print">replay match reveal</button>
        <div class="a1-demo-print" style="width:150px">${a1Cell(M[2], '', 1).replace('a1-cellwrap a1-t1', 'a1-cellwrap')}</div>
      </div>
      <p style="margin-top:14px;font-family:var(--a1-mono);font-size:10px;color:var(--a1-mut)">prefers-reduced-motion: every slam, blink and offset transition collapses to an instant state change.</p>
    </div>

    <div class="a1-wrap"><div class="a1-sec"><b>06</b> compositions <i>workbench and pocket edition</i></div></div>
    <div class="a1-wrap">
      <div class="a1-bench">
        <div class="a1-bench-bar">
          <span class="a1-logo" style="font-size:19px">sploot</span>
          <div class="a1-field" style="flex:1;max-width:420px"><span class="a1-prompt">&gt;</span><span class="a1-q">search the pile</span><span class="a1-caret"></span></div>
          <button class="a1-btn sm">upload</button><button class="a1-btn sm">bangers</button><button class="a1-btn sm">shuffle</button>
        </div>
        <div class="a1-bench-inner" style="display:flex;gap:20px;padding:20px">
          <div class="a1-pilerail">
            ${PILES.slice(0, 5).map((p, i) => `<div class="a1-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></div>`).join('')}
          </div>
          <div class="a1-grid g4" style="flex:1">${M.slice(0, 8).map((x, i) => a1Cell(x, '', i)).join('')}</div>
        </div>
        ${a1Status()}
      </div>
    </div>
    <div class="a1-wrap" style="padding-top:26px;padding-bottom:48px">
      <div class="a1-phone">
        <div class="a1-mast" style="padding:10px 14px"><span class="a1-logo" style="font-size:17px">sploot</span><span style="font-family:var(--a1-mono);font-size:10px;color:var(--a1-mut)">1,482 sheets</span></div>
        <div style="padding:14px;display:flex;flex-direction:column;gap:14px">
          <div class="a1-input" style="min-width:0"><span style="opacity:.5">&gt;</span><span>cat losing it</span><span class="a1-caret"></span></div>
          <div class="a1-grid g2">${M.slice(0, 4).map((x, i) => a1Cell(x, i === 0 ? 'match' : '', i)).join('')}</div>
        </div>
        <div class="a1-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'overprint · riso print-room archive'], ['type', 'shrikhand / bricolage grotesque / ibm plex mono / caveat'], ['move', 'misregistration is elevation; every object carries stamps, tape and tilt'], ['density', 'high, layered ephemera'], ['motion', 'stamp slams and press collapses, interaction only']])}
    </div>
  </div>`;

  const root1 = mount.querySelector('.afd1');
  themeToggle(root1);
  const slamBtn = root1.querySelector('.a1-go-slam');
  const slamStamp = root1.querySelector('.a1-demo-stamp');
  if (slamBtn && slamStamp) slamBtn.onclick = () => {
    slamStamp.style.visibility = 'visible';
    slamStamp.classList.remove('go'); void slamStamp.offsetWidth; slamStamp.classList.add('go');
  };
  const printBtn = root1.querySelector('.a1-go-print');
  const printCell = root1.querySelector('.a1-demo-print');
  if (printBtn && printCell) printBtn.onclick = () => {
    printCell.classList.remove('go'); void printCell.offsetWidth; printCell.classList.add('go');
  };
};

/* ════════════════════════════════════════════════════════════════════
   AFD-2 · SIGNAL — the vector control room.
   System rule: similarity score is a first-class visual channel. A
   declared five-band scale drives every cell's rail, brackets, gauge
   and chip. Maximalism is instrumentation density: every surface has
   a readout.
   ════════════════════════════════════════════════════════════════════ */

const a2Band = s => s >= 90 ? 'b5' : s >= 75 ? 'b4' : s >= 60 ? 'b3' : s >= 45 ? 'b2' : 'b1';
const a2BandName = s => s >= 90 ? 'locked' : s >= 75 ? 'strong' : s >= 60 ? 'related' : s >= 45 ? 'faint' : 'noise';

function a2Cell(m, state = '') {
  const b = a2Band(m.score);
  return `
  <div class="a2-cellwrap ${b}">
    <div class="a2-cell ${state}">
      <div class="a2-chead"><span>${esc(m.file)}</span><span>vec ${m.vec}</span></div>
      <div class="a2-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}
        ${state === 'loading' ? '<div class="a2-scan"><span>embedding · pass 2 of 3</span><i></i></div>' : ''}
      </div>
      <div class="a2-cfoot">
        <span class="a2-num">${(m.score / 100).toFixed(2)}</span>
        <span class="a2-meter"><i style="width:${m.score}%"></i></span>
        <span class="a2-bandtag">${a2BandName(m.score)}</span>
        ${m.banger ? '<span class="a2-banger">bgr</span>' : ''}
      </div>
      <span class="a2-cap">${esc(m.cap)}</span>
    </div>
  </div>`;
}

function a2Scale(mini = false) {
  const bands = [['b1', 'noise', '.00'], ['b2', 'faint', '.45'], ['b3', 'related', '.60'], ['b4', 'strong', '.75'], ['b5', 'locked', '.90']];
  return `<div class="a2-scale ${mini ? 'mini' : ''}">${bands.map(b =>
    `<span class="${b[0]}"><i></i>${b[1]}<b>${b[2]}</b></span>`).join('')}</div>`;
}

function a2Console(q = 'cat losing it') {
  return `
  <div class="a2-console a2-frame">
    <div class="a2-fhead"><span>semantic query</span><span>${LIB.model} · ${LIB.dim}d · /api/search</span></div>
    <div class="a2-cshelf">
      <div class="a2-field"><span class="a2-prompt">query:</span><span class="a2-q">${esc(q)}</span><span class="a2-caret"></span></div>
      <button class="a2-btn primary">run query</button>
    </div>
    <div class="a2-cmeta">
      <span>index <b>${LIB.total.toLocaleString()}</b></span>
      <span>embedded <b>${LIB.embedded.toLocaleString()}</b></span>
      <span>latency <b>${LIB.latency}ms</b></span>
      ${a2Scale(true)}
    </div>
  </div>`;
}

function a2Status() {
  const cells = [
    ['index', `${LIB.total.toLocaleString()} vec`], ['model', LIB.model], ['dim', `${LIB.dim}`],
    ['queue', `${LIB.queued}`], ['latency', `${LIB.latency}ms`], ['status', 'live', true],
  ];
  return `<div class="a2-status">${cells.map(c =>
    `<span class="cell ${c[2] ? 'ok' : ''}"><b>${c[0]}</b>${c[1]}</span>`).join('')}${a2Scale(true)}</div>`;
}

SPECS['AFD-2'] = (mount) => {
  css('AFD-2', `
  .afd2 {
    --a2-bg:#eef0ec; --a2-panel:#f9faf7; --a2-ink:#171a1e; --a2-mut:#5b636e;
    --a2-hair:rgba(23,26,30,.28); --a2-hair2:rgba(23,26,30,.14);
    --s5:#ff2e88; --s4:#ff7a1f; --s3:#e0b000; --s2:#0fa892; --s1:#7a8290;
    --a2-r:3px; --a2-t:140ms; --a2-ease:cubic-bezier(.4,0,.2,1);
    --a2-display:'Unbounded', sans-serif; --a2-body:'Space Grotesk', sans-serif;
    --a2-mono:'IBM Plex Mono', monospace;
    min-height:100dvh; display:flex; flex-direction:column;
    font-family:var(--a2-body); color:var(--a2-ink); background:var(--a2-bg);
  }
  .afd2.theme-dark {
    --a2-bg:#101317; --a2-panel:#171b21; --a2-ink:#eef1f4; --a2-mut:#9aa3ae;
    --a2-hair:rgba(238,241,244,.32); --a2-hair2:rgba(238,241,244,.14);
    --s3:#ffd400; --s2:#1fd4bd; --s1:#8f99a6;
  }
  .afd2 :focus-visible { outline:2px solid var(--s5); outline-offset:3px; }
  .afd2 .a2-wrap { width:100%; max-width:1180px; margin:0 auto; padding:0 clamp(14px, 4vw, 44px); }
  .afd2 .a2-sec { display:flex; gap:14px; align-items:baseline; margin-top:54px; padding:8px 0 20px;
    border-top:1px solid var(--a2-ink); font-family:var(--a2-mono); font-size:11px; text-transform:lowercase; }
  .afd2 .a2-sec b { color:var(--s5); font-weight:600; }
  .afd2 .a2-sec span { color:var(--a2-mut); }
  .afd2 .a2-row { display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start; }

  /* framed panel: hairline + ink corner brackets */
  .afd2 .a2-frame { position:relative; border:1px solid var(--a2-hair); background:var(--a2-panel); border-radius:var(--a2-r); }
  .afd2 .a2-frame::before, .afd2 .a2-frame::after { content:""; position:absolute; width:12px; height:12px; pointer-events:none; }
  .afd2 .a2-frame::before { top:-1px; left:-1px; border-top:2px solid var(--a2-ink); border-left:2px solid var(--a2-ink); }
  .afd2 .a2-frame::after { bottom:-1px; right:-1px; border-bottom:2px solid var(--a2-ink); border-right:2px solid var(--a2-ink); }
  .afd2 .a2-fhead { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:8px 14px;
    border-bottom:1px solid var(--a2-hair2); font-family:var(--a2-mono); font-size:10px; text-transform:lowercase; color:var(--a2-mut); }
  .afd2 .a2-fhead span:first-child { color:var(--a2-ink); font-weight:600; }

  /* masthead */
  .afd2 .a2-mast { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;
    padding:14px clamp(14px, 4vw, 44px); border-bottom:1px solid var(--a2-ink); background:var(--a2-panel); }
  .afd2 .a2-logo { font-family:var(--a2-display); font-weight:900; font-size:21px; letter-spacing:-.01em; }
  .afd2 .a2-logo i { font-style:normal; color:var(--s5); }
  .afd2 .a2-mast nav { display:flex; gap:2px; font-family:var(--a2-mono); font-size:11px; text-transform:lowercase; }
  .afd2 .a2-mast nav a { color:var(--a2-mut); text-decoration:none; padding:6px 10px; border-radius:var(--a2-r); }
  .afd2 .a2-mast nav a:hover { color:var(--a2-ink); background:var(--a2-hair2); }

  /* the scale: signature element, repeated at 3 sizes */
  .afd2 .a2-scale { display:flex; gap:0; font-family:var(--a2-mono); font-size:10px; text-transform:lowercase; }
  .afd2 .a2-scale span { display:flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid var(--a2-hair2); margin-left:-1px; }
  .afd2 .a2-scale span i { width:10px; height:10px; border-radius:2px; }
  .afd2 .a2-scale span b { color:var(--a2-mut); font-weight:400; }
  .afd2 .a2-scale .b5 i { background:var(--s5); } .afd2 .a2-scale .b4 i { background:var(--s4); }
  .afd2 .a2-scale .b3 i { background:var(--s3); } .afd2 .a2-scale .b2 i { background:var(--s2); }
  .afd2 .a2-scale .b1 i { background:var(--s1); }
  .afd2 .a2-scale.mini { margin-left:auto; } .afd2 .a2-scale.mini span { padding:3px 7px; gap:4px; font-size:9px; }
  .afd2 .a2-scale.mini span i { width:7px; height:7px; }
  .afd2 .a2-scale.mini span b { display:none; }

  /* band binding for cells */
  .afd2 .b5 { --band:var(--s5); } .afd2 .b4 { --band:var(--s4); } .afd2 .b3 { --band:var(--s3); }
  .afd2 .b2 { --band:var(--s2); } .afd2 .b1 { --band:var(--s1); }

  /* buttons */
  .afd2 .a2-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px;
    min-height:44px; padding:10px 18px; font-family:var(--a2-mono); font-weight:600; font-size:12px;
    text-transform:lowercase; letter-spacing:.04em; border:1px solid var(--a2-ink); border-radius:var(--a2-r);
    background:var(--a2-panel); color:var(--a2-ink); box-shadow:inset 0 -3px 0 var(--a2-hair2);
    transition:box-shadow var(--a2-t) var(--a2-ease), transform var(--a2-t) var(--a2-ease); }
  .afd2 .a2-btn:hover { box-shadow:inset 0 -3px 0 var(--s5); }
  .afd2 .a2-btn:active { transform:translateY(1px); box-shadow:inset 0 2px 0 var(--a2-hair2); }
  .afd2 .a2-btn.primary { background:var(--a2-ink); color:var(--a2-bg); box-shadow:inset 0 -3px 0 var(--s5); }
  .afd2 .a2-btn.primary:hover { box-shadow:inset 0 -6px 0 var(--s5); }
  .afd2 .a2-btn.sm { min-height:34px; padding:5px 12px; font-size:11px; }
  .afd2 .a2-btn.icon { width:44px; padding:0; }

  /* console */
  .afd2 .a2-console { max-width:860px; }
  .afd2 .a2-cshelf { display:flex; gap:12px; padding:16px 14px; align-items:center; }
  .afd2 .a2-field { flex:1; display:flex; align-items:center; gap:10px; border:1px solid var(--a2-ink);
    border-radius:var(--a2-r); background:var(--a2-bg); padding:12px 14px; font-family:var(--a2-mono); font-size:15px; min-width:0; }
  .afd2 .a2-prompt { color:var(--a2-mut); font-size:11px; text-transform:lowercase; }
  .afd2 .a2-q { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .afd2 .a2-caret { width:9px; height:19px; background:var(--s5); flex:none; animation:a2blink 1.1s steps(1) infinite; }
  @keyframes a2blink { 50% { opacity:0; } }
  .afd2 .a2-cmeta { display:flex; gap:16px; flex-wrap:wrap; align-items:center; padding:8px 14px;
    border-top:1px solid var(--a2-hair2); font-family:var(--a2-mono); font-size:10px; color:var(--a2-mut); }
  .afd2 .a2-cmeta b { color:var(--a2-ink); font-weight:600; font-variant-numeric:tabular-nums; }

  /* meme cell: banded instrument */
  .afd2 .a2-cellwrap { position:relative; }
  .afd2 .a2-cell { position:relative; border:1px solid var(--a2-hair); border-left:6px solid var(--band);
    border-radius:var(--a2-r); background:var(--a2-panel); overflow:hidden;
    transition:border-color var(--a2-t) var(--a2-ease), box-shadow var(--a2-t) var(--a2-ease); }
  .afd2 .a2-cell:hover { box-shadow:0 0 0 1px var(--band); }
  .afd2 .a2-chead { display:flex; justify-content:space-between; gap:8px; padding:6px 10px;
    font-family:var(--a2-mono); font-size:9px; text-transform:lowercase; color:var(--a2-mut);
    border-bottom:1px solid var(--a2-hair2); white-space:nowrap; overflow:hidden; }
  .afd2 .a2-art { position:relative; display:grid; place-items:center; overflow:hidden; background:var(--a2-bg); }
  .afd2 .a2-art .meme-media { background:var(--a2-bg); }
  .afd2 .a2-cfoot { display:flex; align-items:center; gap:8px; padding:7px 10px; border-top:1px solid var(--a2-hair2); }
  .afd2 .a2-num { font-family:var(--a2-mono); font-weight:600; font-size:13px; font-variant-numeric:tabular-nums; }
  .afd2 .a2-meter { flex:1; height:4px; background:var(--a2-hair2); border-radius:2px; overflow:hidden; }
  .afd2 .a2-meter i { display:block; height:100%; background:var(--band); }
  .afd2 .a2-bandtag { font-family:var(--a2-mono); font-size:9px; text-transform:lowercase; color:var(--band);
    border:1px solid var(--band); border-radius:2px; padding:1px 5px; }
  .afd2 .b3 .a2-bandtag, .afd2 .b1 .a2-bandtag { color:var(--a2-ink); }
  .afd2 .a2-banger { font-family:var(--a2-mono); font-size:9px; font-weight:600; background:var(--s5); color:#fff;
    border-radius:2px; padding:1px 5px; text-transform:lowercase; }
  .afd2 .a2-cap { display:block; padding:7px 10px 9px; font-size:12.5px; line-height:1.35; font-weight:500; }
  .afd2 .a2-cell.match { border-color:var(--s5); box-shadow:0 0 0 2px var(--s5); }
  .afd2 .a2-cell.match::before, .afd2 .a2-cell.match::after { content:""; position:absolute; width:14px; height:14px; z-index:2; }
  .afd2 .a2-cell.match::before { top:2px; right:2px; border-top:3px solid var(--s5); border-right:3px solid var(--s5); }
  .afd2 .a2-cell.match::after { bottom:2px; left:2px; border-bottom:3px solid var(--s5); border-left:3px solid var(--s5); }
  .afd2 .a2-cell.near { box-shadow:0 0 0 2px var(--s4); border-color:var(--s4); }
  .afd2 .a2-cell.dim { opacity:.42; filter:grayscale(.7); }
  .afd2 .a2-cell.selected { box-shadow:0 0 0 2px var(--a2-ink), 0 0 0 6px var(--band); }
  .afd2 .a2-cell.error { border-left-color:transparent; }
  .afd2 .a2-cell.error { border-image:repeating-linear-gradient(45deg, var(--s4), var(--s4) 6px, var(--a2-ink) 6px, var(--a2-ink) 12px) 1; }
  .afd2 .a2-scan { position:absolute; inset:auto 0 0 0; display:flex; flex-direction:column; gap:5px; padding:8px 10px;
    background:var(--a2-panel); border-top:1px solid var(--a2-hair2); font-family:var(--a2-mono); font-size:9px; color:var(--a2-mut); }
  .afd2 .a2-scan i { display:block; height:3px; background:linear-gradient(90deg, var(--s2) 40%, var(--a2-hair2) 40%); }

  /* stat block: gauge card */
  .afd2 .a2-stat { padding:14px 16px; min-width:170px; }
  .afd2 .a2-stat .lb { font-family:var(--a2-mono); font-size:10px; text-transform:lowercase; color:var(--a2-mut); }
  .afd2 .a2-stat .vl { font-family:var(--a2-display); font-weight:700; font-size:30px; line-height:1.25; font-variant-numeric:tabular-nums; }
  .afd2 .a2-stat .bar { height:5px; background:var(--a2-hair2); border-radius:2px; margin-top:8px; overflow:hidden; }
  .afd2 .a2-stat .bar i { display:block; height:100%; }

  /* status bar */
  .afd2 .a2-status { display:flex; flex-wrap:wrap; align-items:center; border-top:1px solid var(--a2-ink);
    background:var(--a2-panel); font-family:var(--a2-mono); font-size:10px; padding-right:10px; }
  .afd2 .a2-status .cell { display:flex; gap:7px; align-items:center; padding:9px 13px; border-right:1px solid var(--a2-hair2); }
  .afd2 .a2-status .cell b { color:var(--a2-mut); font-weight:400; text-transform:lowercase; }
  .afd2 .a2-status .ok::after { content:""; width:8px; height:8px; border-radius:50%; background:var(--s2); }

  /* inputs, tabs, toast, empty */
  .afd2 .a2-input { display:flex; align-items:center; gap:10px; border:1px solid var(--a2-ink); border-radius:var(--a2-r);
    background:var(--a2-bg); padding:11px 14px; font-family:var(--a2-mono); font-size:14px; min-width:260px; }
  .afd2 .a2-tabs { display:flex; border:1px solid var(--a2-ink); border-radius:var(--a2-r); overflow:hidden; width:max-content; }
  .afd2 .a2-tab { font-family:var(--a2-mono); font-size:11px; text-transform:lowercase; padding:12px 18px; min-height:44px;
    background:var(--a2-panel); color:var(--a2-mut); border-right:1px solid var(--a2-hair2); cursor:pointer; }
  .afd2 .a2-tab:last-child { border-right:0; }
  .afd2 .a2-tab.on { background:var(--a2-ink); color:var(--a2-bg); box-shadow:inset 0 -3px 0 var(--s5); }
  .afd2 .a2-toast { display:inline-flex; gap:12px; align-items:center; border:1px solid var(--s2);
    border-left:6px solid var(--s2); border-radius:var(--a2-r); background:var(--a2-panel);
    padding:11px 16px; font-family:var(--a2-mono); font-size:12px; }
  .afd2 .a2-empty { padding:32px; max-width:440px; display:flex; flex-direction:column; gap:14px; align-items:flex-start; }
  .afd2 .a2-empty .zero { font-family:var(--a2-display); font-weight:900; font-size:44px; color:var(--s5); line-height:1; }

  /* hero */
  .afd2 .a2-hero { padding-top:44px; display:flex; flex-direction:column; gap:24px; }
  .afd2 .a2-eyebrow { font-family:var(--a2-mono); font-size:11px; text-transform:lowercase; letter-spacing:.14em; color:var(--a2-mut); }
  .afd2 .a2-h1 { font-family:var(--a2-display); font-weight:900; font-size:clamp(30px, 5.6vw, 62px); line-height:1.06;
    letter-spacing:-.015em; max-width:16ch; }
  .afd2 .a2-h1 i { font-style:normal; color:var(--s5); }
  .afd2 .a2-shape { border:1px solid var(--a2-hair); border-radius:var(--a2-r); background:var(--a2-panel);
    width:140px; height:84px; display:grid; place-items:center; text-align:center;
    font-family:var(--a2-mono); font-size:9px; color:var(--a2-mut); padding:6px; }

  .afd2 .a2-grid { display:grid; gap:16px; }
  .afd2 .g4 { grid-template-columns:repeat(4, 1fr); }
  .afd2 .g2 { grid-template-columns:repeat(2, 1fr); }

  /* workbench + phone */
  .afd2 .a2-pilerail { display:flex; flex-direction:column; gap:8px; min-width:220px; }
  .afd2 .a2-pile { display:flex; align-items:center; gap:10px; border:1px solid var(--a2-hair2); border-radius:var(--a2-r);
    background:var(--a2-panel); padding:9px 12px; font-family:var(--a2-mono); font-size:11px; cursor:pointer; }
  .afd2 .a2-pile b { margin-left:auto; font-variant-numeric:tabular-nums; }
  .afd2 .a2-pile .pb { width:34px; height:4px; background:var(--a2-hair2); border-radius:2px; overflow:hidden; flex:none; }
  .afd2 .a2-pile .pb i { display:block; height:100%; background:var(--s2); }
  .afd2 .a2-pile.on { border-color:var(--a2-ink); box-shadow:inset 3px 0 0 var(--s5); }
  .afd2 .a2-phone { width:min(390px, 100%); border:1px solid var(--a2-ink); border-radius:6px; background:var(--a2-bg); overflow:hidden; }
  .afd2 .a2-dock { display:flex; border-top:1px solid var(--a2-ink); background:var(--a2-panel); }
  .afd2 .a2-dock button { flex:1; min-height:52px; background:none; border:0; border-right:1px solid var(--a2-hair2);
    color:var(--a2-mut); font-family:var(--a2-mono); font-size:10px; text-transform:lowercase; }
  .afd2 .a2-dock button.on { color:var(--a2-ink); box-shadow:inset 0 -3px 0 var(--s5); }

  /* motion */
  @keyframes a2lock { 0% { box-shadow:0 0 0 14px transparent; } 100% { box-shadow:0 0 0 2px var(--s5); } }
  .afd2 .a2-demo-lock.go .a2-cell.match { animation:a2lock 300ms var(--a2-ease); }
  .afd2 .a2-gauge-demo { min-width:280px; padding:16px; }
  .afd2 .a2-gauge-demo .vl { font-family:var(--a2-display); font-weight:700; font-size:38px; font-variant-numeric:tabular-nums; }
  .afd2 .a2-gauge-demo .bar { height:8px; background:var(--a2-hair2); border-radius:2px; overflow:hidden; margin-top:8px; }
  .afd2 .a2-gauge-demo .bar i { display:block; height:100%; width:0; background:var(--s5); transition:width 520ms var(--a2-ease); }

  @media (prefers-reduced-motion: reduce) {
    .afd2 *, .afd2 *::before, .afd2 *::after { animation:none !important; transition:none !important; }
  }
  @media (max-width:700px) {
    .afd2 .g4 { grid-template-columns:repeat(2, minmax(0,1fr)); }
    .afd2 .a2-cshelf { flex-direction:column; align-items:stretch; }
    .afd2 .a2-scale { flex-wrap:wrap; }
    .afd2 .a2-scale span { margin-top:-1px; }
    .afd2 .a2-scale.mini { margin-left:0; }
    .afd2 .a2-bench-inner { flex-direction:column; }
    .afd2 .a2-pilerail { min-width:0; }
  }`);

  const M = MEMES;
  mount.innerHTML = `
  <div class="afd2">
    <div class="a2-mast">
      <span class="a2-logo">sploot<i>.</i></span>
      <nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </div>

    <div class="a2-wrap a2-hero">
      <span class="a2-eyebrow">semantic instrument for the pile · ${LIB.total.toLocaleString()} vectors under glass</span>
      <h1 class="a2-h1">type words. get the <i>picture.</i></h1>
      <p style="font-size:16px;max-width:56ch;color:var(--a2-mut)">every meme in your pile is a point in ${LIB.dim} dimensions. the console reads the distance out loud. no folders. just vibes.</p>
      ${a2Console()}
      <div class="a2-grid g4">${M.slice(0, 4).map((x, i) => a2Cell(x, i === 0 ? 'match' : '')).join('')}</div>
    </div>

    <div class="a2-wrap"><div class="a2-sec"><b>02</b> foundations <span>· the five-band scale is the whole color story</span></div></div>
    <div>${swatches([['ink', '#171a1e', '#f9faf7'], ['bg porcelain', '#eef0ec'], ['panel', '#f9faf7'], ['s5 locked', '#ff2e88', '#fff'], ['s4 strong', '#ff7a1f', '#fff'], ['s3 related', '#e0b000'], ['s2 faint', '#0fa892', '#fff'], ['s1 noise', '#7a8290', '#fff']])}</div>
    <div class="a2-wrap" style="padding-top:20px">
      <div class="a2-row" style="align-items:center">
        ${a2Scale()}
      </div>
      <div class="a2-row" style="margin-top:16px">
        <div class="a2-shape">hairline · panel</div>
        <div class="a2-shape" style="border:1px solid var(--a2-ink)">ink line · control</div>
        <div class="a2-shape a2-frame">bracketed frame · region</div>
        <div class="a2-shape" style="box-shadow:0 0 0 2px var(--s5)">band ring · state</div>
        <div class="a2-shape" style="border-radius:0">radius 3 · never more</div>
      </div>
      <p style="margin-top:16px;font-family:var(--a2-mono);font-size:10px;color:var(--a2-mut)">spacing rides an 8px instrument grid · elevation is never shadow, always ring intensity · score decides hue, labels repeat it in words</p>
    </div>

    <div class="a2-wrap"><div class="a2-sec"><b>03</b> typography <span>· round techno over grotesk over data</span></div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="font-family:var(--a2-display);font-weight:900;font-size:44px;letter-spacing:-.02em">display · unbounded 900</div>
        <div style="font-size:17px;max-width:560px">body · space grotesk. the pile sorts itself into automatic piles while the instruments watch.</div>
        <div style="font-family:var(--a2-mono);font-size:12px">label · ibm plex mono, lowercase readouts</div>
        <div style="font-family:var(--a2-mono);font-size:10px;color:var(--a2-mut)">metadata · vec 0413 · 212ms · siglip-base · 768d</div>
        <div style="font-family:var(--a2-mono);font-size:26px;font-variant-numeric:tabular-nums">1,482 · 0.94 · 212ms</div>
        <div style="font-size:13.5px;max-width:430px;border-left:3px solid var(--s5);padding-left:12px">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me deserves its own vector.</div>
      </div>
    </div>

    <div class="a2-wrap"><div class="a2-sec"><b>04</b> components <span>· every surface carries a readout</span></div>
      <div style="display:flex;flex-direction:column;gap:30px">
        ${a2Console('sad frog')}
        <div class="a2-grid g4">
          ${a2Cell(M[0], 'match')}
          ${a2Cell(M[3], 'near')}
          ${a2Cell(M[9], 'dim')}
          ${a2Cell(M[5])}
        </div>
        <div class="a2-grid g4">
          <div class="a2-cellwrap b4"><div class="a2-cell selected">
            <div class="a2-chead"><span>${esc(M[4].file)}</span><span>vec ${M[4].vec}</span></div>
            <div class="a2-art" style="aspect-ratio:1/1">${memeImg(M[4])}</div>
            <div class="a2-cfoot"><span class="a2-num">0.79</span><span class="a2-meter"><i style="width:79%"></i></span><span class="a2-bandtag">selected</span></div>
            <span class="a2-cap">selected · double ring, ink then band</span></div></div>
          ${a2Cell(M[7], 'loading')}
          <div class="a2-cellwrap b1"><div class="a2-cell error">
            <div class="a2-chead"><span>failed.png</span><span>err 500</span></div>
            <div class="a2-art" style="aspect-ratio:1/1;display:grid;place-items:center"><span style="font-family:var(--a2-mono);font-size:11px;color:var(--a2-mut);padding:0 14px;text-align:center">embed failed · timeout at 30s. retry runs it back through the model.</span></div>
            <div class="a2-cfoot"><span class="a2-num">0.00</span><span class="a2-meter"><i style="width:0%"></i></span><button class="a2-btn sm">retry</button></div>
            <span class="a2-cap">error · hazard border, no band</span></div></div>
          <div class="a2-empty a2-frame">
            <span class="zero">0.00</span>
            <div class="a2-fhead" style="border:0;padding:0"><span>no signal</span></div>
            <p style="font-size:15px">zero vectors in the index. the instruments are reading nothing. upload chaos to give them a signal.</p>
            <button class="a2-btn primary">upload chaos</button>
          </div>
        </div>
        <div class="a2-row" style="align-items:center">
          <button class="a2-btn primary">run query</button>
          <button class="a2-btn">shuffle the pile</button>
          <button class="a2-btn sm">compact</button>
          <button class="a2-btn sm icon" aria-label="close">✕</button>
          <span class="a2-bandtag" style="--band:var(--s2);font-size:11px;padding:4px 9px">tag · faint band chip</span>
          <span class="a2-banger" style="font-size:11px;padding:3px 8px">banger</span>
        </div>
        <div class="a2-row" style="align-items:center">
          <div class="a2-input"><span class="a2-prompt">query:</span><span>text input</span><span class="a2-caret"></span></div>
          <div class="a2-tabs"><div class="a2-tab on">all</div><div class="a2-tab">bangers</div><div class="a2-tab">recent</div></div>
          <div class="a2-toast">saved to the pile · vector queued</div>
        </div>
        <div class="a2-row">
          <div class="a2-stat a2-frame"><div class="lb">memes indexed</div><div class="vl">1,482</div><div class="bar"><i style="width:100%;background:var(--s2)"></i></div></div>
          <div class="a2-stat a2-frame"><div class="lb">embedded</div><div class="vl">1,479</div><div class="bar"><i style="width:99.8%;background:var(--s5)"></i></div></div>
          <div class="a2-stat a2-frame"><div class="lb">bangers</div><div class="vl">37</div><div class="bar"><i style="width:2.5%;background:var(--s4)"></i></div></div>
          <div class="a2-stat a2-frame"><div class="lb">folders required</div><div class="vl">0</div><div class="bar"><i style="width:0%"></i></div></div>
        </div>
        ${a2Status()}
      </div>
    </div>

    <div class="a2-wrap"><div class="a2-sec"><b>05</b> motion <span>· needles move only when you ask</span></div>
      <div class="a2-row" style="align-items:center">
        <div class="a2-gauge-demo a2-frame">
          <div class="a2-fhead" style="margin:-16px -16px 10px;"><span>similarity gauge</span><span>demo</span></div>
          <div class="vl a2-gauge-num">0.00</div>
          <div class="bar"><i class="a2-gauge-fill"></i></div>
        </div>
        <button class="a2-btn primary a2-go-gauge">run query · fill the gauge</button>
        <button class="a2-btn a2-go-lock">replay lock-on</button>
        <div class="a2-demo-lock" style="width:150px">${a2Cell(M[0], 'match')}</div>
      </div>
      <p style="margin-top:14px;font-family:var(--a2-mono);font-size:10px;color:var(--a2-mut)">prefers-reduced-motion: gauges jump to their value, lock rings appear settled, nothing sweeps.</p>
    </div>

    <div class="a2-wrap"><div class="a2-sec"><b>06</b> compositions <span>· workbench and pocket console</span></div></div>
    <div class="a2-wrap">
      <div class="a2-frame">
        <div class="a2-fhead"><span>sploot · /app workbench</span><span>${LIB.model} · ${LIB.latency}ms</span></div>
        <div style="display:flex;gap:14px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--a2-hair2);flex-wrap:wrap">
          <span class="a2-logo" style="font-size:15px">sploot<i>.</i></span>
          <div class="a2-field" style="flex:1;max-width:420px;min-width:180px"><span class="a2-prompt">query:</span><span class="a2-q">search the pile</span><span class="a2-caret"></span></div>
          <button class="a2-btn sm">upload</button><button class="a2-btn sm">bangers</button><button class="a2-btn sm">shuffle</button>
        </div>
        <div class="a2-bench-inner" style="display:flex;gap:18px;padding:16px">
          <div class="a2-pilerail">
            <div class="a2-fhead" style="border:0;padding:0 0 6px"><span>automatic piles</span></div>
            ${PILES.map((p, i) => `<div class="a2-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><span class="pb"><i style="width:${Math.round(p.n / 2.2)}%"></i></span><b>${p.n}</b></div>`).join('')}
          </div>
          <div class="a2-grid g4" style="flex:1">${M.slice(0, 8).map((x, i) => a2Cell(x, i === 0 ? 'match' : '')).join('')}</div>
        </div>
        ${a2Status()}
      </div>
    </div>
    <div class="a2-wrap" style="padding-top:26px;padding-bottom:48px">
      <div class="a2-phone">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--a2-ink)">
          <span class="a2-logo" style="font-size:15px">sploot<i>.</i></span>
          <span style="font-family:var(--a2-mono);font-size:10px;color:var(--a2-mut)">1,482 vec · live</span>
        </div>
        <div style="padding:14px;display:flex;flex-direction:column;gap:14px">
          <div class="a2-input" style="min-width:0"><span class="a2-prompt">query:</span><span>cat losing it</span><span class="a2-caret"></span></div>
          <div class="a2-grid g2">${M.slice(0, 4).map((x, i) => a2Cell(x, i === 0 ? 'match' : '')).join('')}</div>
        </div>
        <div class="a2-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'signal · vector control room'], ['type', 'unbounded / space grotesk / ibm plex mono'], ['move', 'similarity score is a declared five-band channel driving every cell'], ['density', 'instrument-cluster high'], ['motion', 'gauge fills and lock-ons, interaction only']])}
    </div>
  </div>`;

  const root2 = mount.querySelector('.afd2');
  themeToggle(root2);
  const reduce2 = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gBtn = root2.querySelector('.a2-go-gauge');
  const gNum = root2.querySelector('.a2-gauge-num');
  const gFill = root2.querySelector('.a2-gauge-fill');
  if (gBtn && gNum && gFill) gBtn.onclick = () => {
    const target = 94;
    if (reduce2) { gNum.textContent = '0.94'; gFill.style.width = '94%'; return; }
    gFill.style.width = '0%'; gNum.textContent = '0.00';
    requestAnimationFrame(() => { gFill.style.width = target + '%'; });
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 520);
      gNum.textContent = ((p * target) / 100).toFixed(2);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const lBtn = root2.querySelector('.a2-go-lock');
  const lCell = root2.querySelector('.a2-demo-lock');
  if (lBtn && lCell) lBtn.onclick = () => {
    lCell.classList.remove('go'); void lCell.offsetWidth; lCell.classList.add('go');
  };
};

/* ════════════════════════════════════════════════════════════════════
   AFD-3 · TOYBOX — the cereal-aisle archive.
   System rule: every interactive object is a toy. Thick ink outline,
   arcade drop elevation (press = physically depress), starburst
   stickers as the annotation layer, squash-and-stretch motion.
   ════════════════════════════════════════════════════════════════════ */

const A3_STAR = 'polygon(100% 50%, 80.9% 58.3%, 93.3% 75%, 72.6% 72.6%, 75% 93.3%, 58.3% 80.9%, 50% 100%, 41.7% 80.9%, 25% 93.3%, 27.4% 72.6%, 6.7% 75%, 19.1% 58.3%, 0% 50%, 19.1% 41.7%, 6.7% 25%, 27.4% 27.4%, 25% 6.7%, 41.7% 19.1%, 50% 0%, 58.3% 19.1%, 75% 6.7%, 72.6% 27.4%, 93.3% 25%, 80.9% 41.7%)';
const A3_TABS = ['var(--a3-sky)', 'var(--a3-gum)', 'var(--a3-apple)', 'var(--a3-tang)', 'var(--a3-grape2)', 'var(--a3-banana)'];

function a3Star(txt, extra = '') {
  return `<span class="a3-star ${extra}"><span>${txt}</span></span>`;
}

function a3Cell(m, state = '', i = 0, score = false) {
  return `
  <div class="a3-cellwrap">
    <div class="a3-cell ${state}">
      <div class="a3-ctab" style="background:${A3_TABS[i % 6]}"><span>${esc(m.file)}</span><span>vec ${m.vec}</span></div>
      <div class="a3-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>
      <div class="a3-cap"><span>${esc(m.cap)}</span></div>
      ${score ? `<div class="a3-price">${(m.score / 100).toFixed(2)} <i>match</i></div>` : ''}
    </div>
    ${m.banger ? a3Star('banger!', 'a3-star-corner') : ''}
    ${state === 'match' ? a3Star('top match', 'a3-star-corner left green') : ''}
  </div>`;
}

function a3Console(q = 'cat losing it') {
  return `
  <div class="a3-console">
    <div class="a3-console-top"><span>meme finder 3000</span><span>${LIB.model} · ${LIB.latency}ms</span></div>
    <div class="a3-console-shelf">
      <div class="a3-field"><span class="a3-prompt">find:</span><span class="a3-q">${esc(q)}</span><span class="a3-caret"></span></div>
      <button class="a3-btn primary">find it</button>
    </div>
    <div class="a3-console-meta"><span>index ${LIB.total.toLocaleString()}</span><span>dim ${LIB.dim}</span><span>queue ${LIB.queued}</span><span>route /api/search</span></div>
  </div>`;
}

function a3Status() {
  const cells = [
    ['index', `${LIB.total.toLocaleString()} vec`], ['model', LIB.model],
    ['queue', `${LIB.queued} cooking`], ['latency', `${LIB.latency}ms`], ['machine', 'on', true],
  ];
  return `<div class="a3-status">${cells.map(c =>
    `<span class="cell ${c[2] ? 'ok' : ''}"><b>${c[0]}</b>${c[1]}</span>`).join('')}</div>`;
}

SPECS['AFD-3'] = (mount) => {
  css('AFD-3', `
  @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&display=swap');
  .afd3 {
    --a3-bg:#cfe7ff; --a3-panel:#ffffff; --a3-panel2:#f0f7ff; --a3-ink:#1c1547;
    --a3-mut:rgba(28,21,71,.6);
    --a3-cherry:#ff3355; --a3-tang:#ff9d00; --a3-banana:#ffdd00; --a3-apple:#2ec06e;
    --a3-grape2:#8a5cff; --a3-gum:#ff7ad9; --a3-sky:#39b1ff;
    --a3-focus:#5a2fe0;
    --a3-r:18px; --a3-rs:10px;
    --a3-o:3px solid var(--a3-ink);
    --a3-drop:0 5px 0 var(--a3-ink); --a3-drop-lg:0 9px 0 var(--a3-ink); --a3-drop-dn:0 1px 0 var(--a3-ink);
    --a3-spring:cubic-bezier(.34,1.56,.64,1); --a3-t:150ms;
    --a3-display:'Bungee', cursive; --a3-body:'Baloo 2', sans-serif; --a3-mono:'Space Mono', monospace;
    min-height:100dvh; display:flex; flex-direction:column;
    font-family:var(--a3-body); font-weight:500; color:var(--a3-ink);
    background:
      radial-gradient(rgba(255,255,255,.55) 2px, transparent 2.6px) 0 0 / 26px 26px,
      var(--a3-bg);
  }
  .afd3.theme-dark {
    --a3-bg:#241b52; --a3-panel:#322868; --a3-panel2:#2a2160; --a3-ink:#fff2d9;
    --a3-mut:rgba(255,242,217,.65);
    --a3-focus:#ffdd00;
    --a3-o:3px solid var(--a3-ink);
    --a3-drop:0 5px 0 #120d33; --a3-drop-lg:0 9px 0 #120d33; --a3-drop-dn:0 1px 0 #120d33;
    background:
      radial-gradient(rgba(255,255,255,.07) 2px, transparent 2.6px) 0 0 / 26px 26px,
      var(--a3-bg);
  }
  .afd3 :focus-visible { outline:4px solid var(--a3-focus); outline-offset:3px; border-radius:6px; }
  .afd3 .a3-wrap { width:100%; max-width:1140px; margin:0 auto; padding:0 clamp(14px, 4vw, 44px); }
  .afd3 .a3-sec { display:flex; gap:12px; align-items:center; margin-top:54px; padding:0 0 20px; }
  .afd3 .a3-sec b { font-family:var(--a3-display); font-size:13px; background:var(--a3-ink); color:var(--a3-bg);
    border-radius:999px; padding:6px 14px; }
  .afd3 .a3-sec span { font-family:var(--a3-mono); font-size:11px; color:var(--a3-mut); }
  .afd3 .a3-row { display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start; }

  /* masthead */
  .afd3 .a3-mast { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;
    padding:14px clamp(14px, 4vw, 44px); border-bottom:var(--a3-o); background:var(--a3-panel); }
  .afd3 .a3-logo { font-family:var(--a3-display); font-size:24px; letter-spacing:.02em; }
  .afd3 .a3-logo em { font-style:normal; color:var(--a3-cherry); }
  .afd3 .a3-mast nav { display:flex; gap:8px; }
  .afd3 .a3-mast nav a { font-family:var(--a3-body); font-weight:700; font-size:14px; color:var(--a3-ink);
    text-decoration:none; border:2px solid transparent; border-radius:999px; padding:7px 14px; }
  .afd3 .a3-mast nav a:hover { border-color:var(--a3-ink); background:var(--a3-banana); color:#1c1547; }

  /* starburst sticker: the annotation layer */
  .afd3 .a3-star { display:inline-grid; place-items:center; width:86px; height:86px; flex:none;
    clip-path:${A3_STAR}; background:var(--a3-banana);
    filter:drop-shadow(2px 3px 0 rgba(28,21,71,.9)); transform:rotate(8deg); }
  .afd3 .a3-star span { font-family:var(--a3-display); font-size:10px; color:#1c1547; text-align:center;
    max-width:56px; line-height:1.15; transform:rotate(-2deg); }
  .afd3 .a3-star.green { background:var(--a3-apple); }
  .afd3 .a3-star.gum { background:var(--a3-gum); }
  .afd3 .a3-star-corner { position:absolute; top:-18px; right:-14px; z-index:3; }
  .afd3 .a3-star-corner.left { right:auto; left:-14px; transform:rotate(-10deg); }

  /* buttons: arcade toys, elevation is drop height */
  .afd3 .a3-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px;
    min-height:46px; padding:10px 22px; font-family:var(--a3-body); font-weight:800; font-size:15px;
    border:var(--a3-o); border-radius:999px; background:var(--a3-panel); color:var(--a3-ink);
    box-shadow:var(--a3-drop); transition:transform var(--a3-t) var(--a3-spring), box-shadow var(--a3-t) var(--a3-spring); }
  .afd3 .a3-btn:hover { transform:translateY(-2px); box-shadow:0 7px 0 var(--a3-ink); }
  .afd3.theme-dark .a3-btn:hover { box-shadow:0 7px 0 #120d33; }
  .afd3 .a3-btn:active { transform:translateY(4px) scale(.98, .95); box-shadow:var(--a3-drop-dn); }
  .afd3 .a3-btn.primary { background:var(--a3-banana); color:#1c1547; }
  .afd3 .a3-btn.gum { background:var(--a3-gum); color:#1c1547; }
  .afd3 .a3-btn.sm { min-height:36px; padding:5px 14px; font-size:13px; border-width:2px; box-shadow:0 3px 0 var(--a3-ink); }
  .afd3.theme-dark .a3-btn.sm { box-shadow:0 3px 0 #120d33; }
  .afd3 .a3-btn.sm:hover { transform:translateY(-2px); box-shadow:0 5px 0 var(--a3-ink); }
  .afd3.theme-dark .a3-btn.sm:hover { box-shadow:0 5px 0 #120d33; }
  .afd3 .a3-btn.sm:active { transform:translateY(2px); box-shadow:0 1px 0 var(--a3-ink); }
  .afd3 .a3-btn.icon { width:46px; padding:0; }

  /* tag pill */
  .afd3 .a3-tag { display:inline-flex; align-items:center; gap:6px; font-family:var(--a3-body); font-weight:700;
    font-size:13px; border:2px solid var(--a3-ink); border-radius:999px; padding:5px 12px; background:var(--a3-sky); color:#1c1547; }
  .afd3 .a3-tag.gum { background:var(--a3-gum); } .afd3 .a3-tag.apple { background:var(--a3-apple); }

  /* console: the vending panel */
  .afd3 .a3-console { border:var(--a3-o); border-radius:var(--a3-r); background:var(--a3-panel);
    box-shadow:var(--a3-drop-lg); max-width:820px; overflow:hidden; }
  .afd3 .a3-console-top { display:flex; justify-content:space-between; gap:10px; padding:9px 18px;
    background:var(--a3-ink); color:var(--a3-bg); font-family:var(--a3-display); font-size:12px; }
  .afd3 .a3-console-top span:last-child { font-family:var(--a3-mono); font-size:10px; align-self:center; opacity:.8; }
  .afd3 .a3-console-shelf { display:flex; gap:12px; padding:18px; align-items:center; background:var(--a3-panel); }
  .afd3 .a3-field { flex:1; display:flex; align-items:center; gap:10px; border:var(--a3-o); border-radius:999px;
    background:var(--a3-panel2); padding:12px 18px; font-family:var(--a3-body); font-weight:700; font-size:16px; min-width:0; }
  .afd3 .a3-prompt { font-family:var(--a3-mono); font-size:11px; color:var(--a3-mut); }
  .afd3 .a3-q { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .afd3 .a3-caret { width:10px; height:20px; border-radius:3px; background:var(--a3-cherry); flex:none; animation:a3blink 1s steps(1) infinite; }
  @keyframes a3blink { 50% { opacity:0; } }
  .afd3 .a3-console-meta { display:flex; gap:16px; flex-wrap:wrap; padding:9px 18px; border-top:2px dashed var(--a3-ink);
    font-family:var(--a3-mono); font-size:10px; color:var(--a3-mut); }

  /* meme cell: the trading card */
  .afd3 .a3-cellwrap { position:relative; }
  .afd3 .a3-cell { border:var(--a3-o); border-radius:var(--a3-r); background:var(--a3-panel);
    box-shadow:var(--a3-drop); overflow:hidden;
    transition:transform var(--a3-t) var(--a3-spring), box-shadow var(--a3-t) var(--a3-spring); }
  .afd3 .a3-cell:hover { transform:translateY(-3px) rotate(-.4deg); box-shadow:0 8px 0 var(--a3-ink); }
  .afd3.theme-dark .a3-cell:hover { box-shadow:0 8px 0 #120d33; }
  .afd3 .a3-ctab { display:flex; justify-content:space-between; gap:8px; padding:6px 12px;
    font-family:var(--a3-mono); font-size:9px; color:#1c1547; border-bottom:var(--a3-o);
    white-space:nowrap; overflow:hidden; }
  .afd3 .a3-art { display:grid; place-items:center; overflow:hidden; background:var(--a3-panel2); margin:10px;
    border:2px solid var(--a3-ink); border-radius:var(--a3-rs); }
  .afd3 .a3-art .meme-media { background:var(--a3-panel2); }
  .afd3 .a3-cap { padding:2px 14px 12px; font-size:13.5px; font-weight:700; line-height:1.3; }
  .afd3 .a3-price { display:inline-flex; align-items:baseline; gap:5px; margin:0 14px 12px;
    font-family:var(--a3-display); font-size:15px; background:var(--a3-banana); color:#1c1547;
    border:2px solid var(--a3-ink); border-radius:8px; padding:3px 10px; }
  .afd3 .a3-price i { font-family:var(--a3-mono); font-style:normal; font-size:9px; }
  .afd3 .a3-cell.match { box-shadow:0 0 0 4px var(--a3-apple), var(--a3-drop-lg); }
  .afd3 .a3-cell.near { outline:3px dashed var(--a3-tang); outline-offset:4px; }
  .afd3 .a3-cell.dim { opacity:.5; filter:saturate(.25); box-shadow:none; }
  .afd3 .a3-cell.selected { box-shadow:0 0 0 4px var(--a3-grape2), var(--a3-drop-lg); transform:translateY(-4px); }
  .afd3 .a3-cell.error { border-color:var(--a3-cherry); box-shadow:0 5px 0 var(--a3-cherry); }
  .afd3 .a3-load { display:flex; gap:8px; align-items:center; justify-content:center;
    font-family:var(--a3-mono); font-size:10px; color:var(--a3-mut); }
  .afd3 .a3-load i { width:10px; height:10px; border-radius:50%; background:var(--a3-grape2); animation:a3boil 700ms var(--a3-spring) infinite alternate; }
  .afd3 .a3-load i:nth-child(2) { animation-delay:120ms; background:var(--a3-gum); }
  .afd3 .a3-load i:nth-child(3) { animation-delay:240ms; background:var(--a3-sky); }
  @keyframes a3boil { from { transform:translateY(2px); } to { transform:translateY(-5px); } }

  /* stat block: the price-tag scoreboard */
  .afd3 .a3-stat { border:var(--a3-o); border-radius:var(--a3-r); background:var(--a3-panel);
    box-shadow:var(--a3-drop); padding:14px 18px; min-width:160px; }
  .afd3 .a3-stat .lb { font-family:var(--a3-mono); font-size:10px; color:var(--a3-mut); }
  .afd3 .a3-stat .vl { font-family:var(--a3-display); font-size:34px; line-height:1.15; }
  .afd3 .a3-stat.banana { background:var(--a3-banana); color:#1c1547; }
  .afd3 .a3-stat.banana .lb { color:rgba(28,21,71,.6); }
  .afd3 .a3-stat.gum { background:var(--a3-gum); color:#1c1547; }
  .afd3 .a3-stat.gum .lb { color:rgba(28,21,71,.6); }

  /* machinery bar */
  .afd3 .a3-status { display:flex; flex-wrap:wrap; align-items:center; border-top:var(--a3-o);
    background:var(--a3-ink); color:var(--a3-bg); font-family:var(--a3-mono); font-size:10px; }
  .afd3 .a3-status .cell { display:flex; gap:7px; align-items:center; padding:9px 14px; border-right:2px dotted rgba(207,231,255,.4); }
  .afd3 .a3-status .cell b { opacity:.55; font-weight:400; }
  .afd3 .a3-status .ok::after { content:""; width:9px; height:9px; border-radius:50%; background:var(--a3-apple); }

  /* input, tabs, toast, empty */
  .afd3 .a3-input { display:flex; align-items:center; gap:10px; border:var(--a3-o); border-radius:999px;
    background:var(--a3-panel); padding:11px 18px; font-family:var(--a3-body); font-weight:700; font-size:15px; min-width:260px; }
  .afd3 .a3-tabs { display:inline-flex; gap:6px; border:var(--a3-o); border-radius:999px; padding:5px; background:var(--a3-panel); }
  .afd3 .a3-tab { font-family:var(--a3-body); font-weight:800; font-size:14px; padding:8px 18px; min-height:38px;
    border:0; border-radius:999px; background:transparent; color:var(--a3-ink); cursor:pointer; }
  .afd3 .a3-tab.on { background:var(--a3-ink); color:var(--a3-bg); }
  .afd3 .a3-toast { display:inline-flex; gap:12px; align-items:center; border:var(--a3-o); border-radius:var(--a3-r);
    background:var(--a3-apple); color:#1c1547; box-shadow:var(--a3-drop); padding:12px 18px;
    font-family:var(--a3-body); font-weight:800; font-size:14px; }
  .afd3 .a3-empty { position:relative; border:var(--a3-o); border-radius:var(--a3-r); background:var(--a3-panel);
    box-shadow:var(--a3-drop-lg); padding:34px 28px 28px; max-width:430px; display:flex; flex-direction:column; gap:12px; align-items:flex-start; }

  /* hero */
  .afd3 .a3-hero { padding-top:46px; display:flex; flex-direction:column; gap:24px; }
  .afd3 .a3-h1 { font-family:var(--a3-display); font-size:clamp(30px, 6.4vw, 72px); line-height:1.08; max-width:14ch; }
  .afd3 .a3-h1 em { font-style:normal; color:var(--a3-cherry); }
  .afd3 .a3-shape { border:var(--a3-o); border-radius:var(--a3-r); background:var(--a3-panel);
    width:136px; height:86px; display:grid; place-items:center; text-align:center;
    font-family:var(--a3-mono); font-size:9px; color:var(--a3-mut); padding:6px; }

  .afd3 .a3-grid { display:grid; gap:24px; }
  .afd3 .g4 { grid-template-columns:repeat(4, 1fr); }
  .afd3 .g2 { grid-template-columns:repeat(2, 1fr); }

  /* workbench + phone */
  .afd3 .a3-bench { border:var(--a3-o); border-radius:var(--a3-r); background:var(--a3-panel2); box-shadow:var(--a3-drop-lg); overflow:hidden; }
  .afd3 .a3-bench-bar { display:flex; align-items:center; gap:14px; padding:12px 18px; border-bottom:var(--a3-o);
    background:var(--a3-panel); flex-wrap:wrap; }
  .afd3 .a3-pilerail { display:flex; flex-direction:column; gap:10px; min-width:215px; }
  .afd3 .a3-pile { display:flex; justify-content:space-between; align-items:center; gap:10px; border:2px solid var(--a3-ink);
    border-radius:999px; background:var(--a3-panel); padding:9px 16px; font-family:var(--a3-body); font-weight:700;
    font-size:13px; cursor:pointer; box-shadow:0 3px 0 var(--a3-ink); }
  .afd3.theme-dark .a3-pile { box-shadow:0 3px 0 #120d33; }
  .afd3 .a3-pile b { font-family:var(--a3-mono); font-size:11px; font-weight:400; }
  .afd3 .a3-pile.on { background:var(--a3-banana); color:#1c1547; }
  .afd3 .a3-phone { width:min(390px, 100%); border:var(--a3-o); border-radius:26px; background:var(--a3-bg);
    box-shadow:var(--a3-drop-lg); overflow:hidden; }
  .afd3 .a3-dock { display:flex; gap:6px; border-top:var(--a3-o); background:var(--a3-panel); padding:8px; }
  .afd3 .a3-dock button { flex:1; min-height:46px; background:transparent; border:0; border-radius:999px;
    color:var(--a3-ink); font-family:var(--a3-body); font-weight:800; font-size:12px; }
  .afd3 .a3-dock button.on { background:var(--a3-ink); color:var(--a3-bg); }

  /* motion */
  @keyframes a3pop { 0% { opacity:0; transform:scale(.2) rotate(-40deg); } 65% { opacity:1; transform:scale(1.25) rotate(12deg); } 100% { opacity:1; transform:scale(1) rotate(8deg); } }
  .afd3 .a3-demo-pop { display:inline-block; }
  .afd3 .a3-demo-pop.go { animation:a3pop 320ms var(--a3-spring); }
  @keyframes a3squish { 0% { transform:scale(1); } 40% { transform:scale(.93, .88); } 100% { transform:scale(1); } }
  .afd3 .a3-demo-boop.go .a3-cell { animation:a3squish 260ms var(--a3-spring); }

  @media (prefers-reduced-motion: reduce) {
    .afd3 *, .afd3 *::before, .afd3 *::after { animation:none !important; transition:none !important; }
    .afd3 .a3-demo-pop.go { opacity:1; }
  }
  @media (max-width:700px) {
    .afd3 .g4 { grid-template-columns:repeat(2, minmax(0,1fr)); }
    .afd3 .a3-console-shelf { flex-direction:column; align-items:stretch; }
    .afd3 .a3-bench-inner { flex-direction:column; }
    .afd3 .a3-pilerail { min-width:0; }
    .afd3 .a3-mast nav a { padding:6px 9px; font-size:12px; }
    .afd3 .a3-grid { gap:16px; }
  }`);

  const M = MEMES;
  mount.innerHTML = `
  <div class="afd3">
    <div class="a3-mast">
      <span class="a3-logo">spl<em>oo</em>t</span>
      <nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </div>

    <div class="a3-wrap a3-hero">
      <div class="a3-row" style="align-items:center">
        ${a3Star('new!')}
        <span class="a3-tag gum">the toybox sorts itself</span>
      </div>
      <h1 class="a3-h1">type words. get the <em>picture.</em></h1>
      <p style="font-size:17px;max-width:52ch;font-weight:600">drop every meme you own into the machine and it lines them up on the shelf by meaning. no folders. just vibes.</p>
      ${a3Console()}
      <div class="a3-grid g4">${M.slice(0, 4).map((x, i) => a3Cell(x, i === 0 ? 'match' : '', i, i === 0)).join('')}</div>
    </div>

    <div class="a3-wrap"><div class="a3-sec"><b>02</b><span>foundations · candy shelf, ink outline, drop height</span></div></div>
    <div>${swatches([['ink grape-navy', '#1c1547', '#fff2d9'], ['shelf blue', '#cfe7ff'], ['panel', '#ffffff'], ['cherry', '#ff3355', '#fff'], ['tangerine', '#ff9d00'], ['banana', '#ffdd00'], ['apple', '#2ec06e'], ['grape', '#8a5cff', '#fff'], ['bubblegum', '#ff7ad9'], ['sky', '#39b1ff']])}</div>
    <div class="a3-wrap" style="padding-top:20px">
      <div class="a3-row">
        <div class="a3-shape" style="border-width:2px;border-radius:10px">2px · inner window</div>
        <div class="a3-shape">3px ink · toy shell</div>
        <div class="a3-shape" style="box-shadow:var(--a3-drop)">drop 5 · resting toy</div>
        <div class="a3-shape" style="box-shadow:var(--a3-drop-lg)">drop 9 · floating toy</div>
        <div class="a3-shape" style="border-radius:999px">pill · anything you press</div>
        <div class="a3-shape" style="clip-path:${A3_STAR};border:0;background:var(--a3-banana);color:#1c1547">starburst · annotation</div>
      </div>
      <p style="margin-top:16px;font-family:var(--a3-mono);font-size:10px;color:var(--a3-mut)">spacing rides a 12px toy grid · elevation is drop height, pressing removes it · every color pairs with ink text, ink does the talking</p>
    </div>

    <div class="a3-wrap"><div class="a3-sec"><b>03</b><span>typography · toy letters over rounded body</span></div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="font-family:var(--a3-display);font-size:46px;line-height:1.1">display · bungee</div>
        <div style="font-size:17px;max-width:560px;font-weight:600">body · baloo 2. the pile sorts itself into automatic piles while you sleep, like a toy store restocking overnight.</div>
        <div style="font-family:var(--a3-mono);font-size:12px">label · space mono, flat and factual</div>
        <div style="font-family:var(--a3-mono);font-size:10px;color:var(--a3-mut)">metadata · vec 0413 · 212ms · siglip-base · 768d</div>
        <div style="font-family:var(--a3-mono);font-size:26px;font-variant-numeric:tabular-nums">1,482 · 0.94 · 212ms</div>
        <div style="font-size:14px;font-weight:600;max-width:430px;border-left:4px solid var(--a3-gum);padding-left:12px;border-radius:2px">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me belongs in the display case.</div>
      </div>
    </div>

    <div class="a3-wrap"><div class="a3-sec"><b>04</b><span>components · everything is a toy on a shelf</span></div>
      <div style="display:flex;flex-direction:column;gap:32px">
        ${a3Console('sad frog')}
        <div class="a3-grid g4">
          ${a3Cell(M[0], 'match', 0, true)}
          ${a3Cell(M[3], 'near', 1)}
          ${a3Cell(M[9], 'dim', 2)}
          ${a3Cell(M[5], '', 3)}
        </div>
        <div class="a3-grid g4">
          <div class="a3-cellwrap"><div class="a3-cell selected">
            <div class="a3-ctab" style="background:var(--a3-grape2)"><span style="color:#fff">${esc(M[4].file)}</span><span style="color:#fff">vec ${M[4].vec}</span></div>
            <div class="a3-art" style="aspect-ratio:1/1">${memeImg(M[4])}</div>
            <div class="a3-cap"><span>selected · grape ring, lifted off the shelf</span></div></div></div>
          <div class="a3-cellwrap"><div class="a3-cell">
            <div class="a3-ctab" style="background:var(--a3-sky)"><span>cooking…</span><span>queue ${LIB.queued}</span></div>
            <div class="a3-art a3-load" style="aspect-ratio:1/1"><i></i><i></i><i></i><span>embedding</span></div>
            <div class="a3-cap"><span>loading · the machine is cooking</span></div></div></div>
          <div class="a3-cellwrap"><div class="a3-cell error">
            <div class="a3-ctab" style="background:var(--a3-cherry)"><span style="color:#fff">failed.png</span><span style="color:#fff">err 500</span></div>
            <div class="a3-art" style="aspect-ratio:1/1;display:grid;place-items:center"><span style="font-family:var(--a3-mono);font-size:11px;color:var(--a3-mut);padding:0 12px;text-align:center">this one borked in the machine. hit retry.</span></div>
            <div class="a3-cap" style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span>error state</span><button class="a3-btn sm">retry</button></div></div></div>
          <div class="a3-empty">
            ${a3Star('empty!', 'a3-star-corner')}
            <p style="font-family:var(--a3-display);font-size:18px">the toybox is empty</p>
            <p style="font-size:15px;font-weight:600">zero thoughts in here. upload chaos and watch the shelves fill themselves.</p>
            <button class="a3-btn primary">upload chaos</button>
          </div>
        </div>
        <div class="a3-row" style="align-items:center">
          <button class="a3-btn primary">find it</button>
          <button class="a3-btn">shuffle the pile</button>
          <button class="a3-btn gum">bangers</button>
          <button class="a3-btn sm">compact</button>
          <button class="a3-btn sm icon" aria-label="close">✕</button>
          <span class="a3-tag">sticker pill</span>
          <span class="a3-tag apple">wholesome (rare)</span>
          ${a3Star('banger!')}
        </div>
        <div class="a3-row" style="align-items:center">
          <div class="a3-input"><span class="a3-prompt">find:</span><span>text input</span><span class="a3-caret"></span></div>
          <div class="a3-tabs"><button class="a3-tab on">all</button><button class="a3-tab">bangers</button><button class="a3-tab">recent</button></div>
          <div class="a3-toast">saved to the pile ✓</div>
        </div>
        <div class="a3-row">
          <div class="a3-stat banana"><div class="lb">folders required</div><div class="vl">0</div></div>
          <div class="a3-stat"><div class="lb">memes indexed</div><div class="vl">1,482</div></div>
          <div class="a3-stat gum"><div class="lb">bangers</div><div class="vl">37</div></div>
        </div>
        ${a3Status()}
      </div>
    </div>

    <div class="a3-wrap"><div class="a3-sec"><b>05</b><span>motion · squash, stretch, pop, only when touched</span></div>
      <div class="a3-row" style="align-items:center">
        <button class="a3-btn primary">press me · arcade depress</button>
        <button class="a3-btn a3-go-pop">pop the sticker</button>
        <span class="a3-demo-pop" style="visibility:hidden">${a3Star('banger!', 'gum')}</span>
        <button class="a3-btn a3-go-boop">boop the card</button>
        <div class="a3-demo-boop" style="width:150px">${a3Cell(M[1], '', 1)}</div>
      </div>
      <p style="margin-top:14px;font-family:var(--a3-mono);font-size:10px;color:var(--a3-mut)">prefers-reduced-motion: no squish, no pop, no boil. states switch instantly and stickers appear already settled.</p>
    </div>

    <div class="a3-wrap"><div class="a3-sec"><b>06</b><span>compositions · workbench and pocket toybox</span></div></div>
    <div class="a3-wrap">
      <div class="a3-bench">
        <div class="a3-bench-bar">
          <span class="a3-logo" style="font-size:17px">spl<em>oo</em>t</span>
          <div class="a3-field" style="flex:1;max-width:400px;min-width:180px"><span class="a3-prompt">find:</span><span class="a3-q">search the pile</span><span class="a3-caret"></span></div>
          <button class="a3-btn sm">upload</button><button class="a3-btn sm">bangers</button><button class="a3-btn sm">shuffle</button>
        </div>
        <div class="a3-bench-inner" style="display:flex;gap:20px;padding:20px">
          <div class="a3-pilerail">
            ${PILES.slice(0, 5).map((p, i) => `<div class="a3-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></div>`).join('')}
          </div>
          <div class="a3-grid g4" style="flex:1">${M.slice(0, 8).map((x, i) => a3Cell(x, '', i)).join('')}</div>
        </div>
        ${a3Status()}
      </div>
    </div>
    <div class="a3-wrap" style="padding-top:26px;padding-bottom:48px">
      <div class="a3-phone">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:var(--a3-o);background:var(--a3-panel)">
          <span class="a3-logo" style="font-size:16px">spl<em>oo</em>t</span>
          <span style="font-family:var(--a3-mono);font-size:10px;color:var(--a3-mut)">1,482 toys</span>
        </div>
        <div style="padding:14px;display:flex;flex-direction:column;gap:14px">
          <div class="a3-input" style="min-width:0;background:var(--a3-panel)"><span class="a3-prompt">find:</span><span>cat losing it</span><span class="a3-caret"></span></div>
          <div class="a3-grid g2" style="gap:16px">${M.slice(0, 4).map((x, i) => a3Cell(x, i === 0 ? 'match' : '', i)).join('')}</div>
        </div>
        <div class="a3-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'toybox · cereal-aisle archive'], ['type', 'bungee / baloo 2 / space mono'], ['move', 'every interactive object is a toy; starbursts annotate, pressing removes drop height'], ['density', 'chunky high, strict grid'], ['motion', 'squash and stretch, interaction only']])}
    </div>
  </div>`;

  const root3 = mount.querySelector('.afd3');
  themeToggle(root3);
  const popBtn = root3.querySelector('.a3-go-pop');
  const popStar = root3.querySelector('.a3-demo-pop');
  if (popBtn && popStar) popBtn.onclick = () => {
    popStar.style.visibility = 'visible';
    popStar.classList.remove('go'); void popStar.offsetWidth; popStar.classList.add('go');
  };
  const boopBtn = root3.querySelector('.a3-go-boop');
  const boopCard = root3.querySelector('.a3-demo-boop');
  if (boopBtn && boopCard) boopBtn.onclick = () => {
    boopCard.classList.remove('go'); void boopCard.offsetWidth; boopCard.classList.add('go');
  };
};

})();
(() => {

/* ROUND 2 descendants. Shared markup is deliberately small; each option
   owns a different spatial rule, token system, and interaction grammar. */
function afdR2Cell(p, m, state = '', i = 0) {
  const label = state || 'default';
  return `<article class="${p}-cell ${state}" data-i="${i}">
    <div class="${p}-rail"><span>${esc(m.file)}</span><span>vec ${m.vec}</span></div>
    <div class="${p}-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}<span class="${p}-state">${label}</span></div>
    <div class="${p}-cap"><span>${esc(m.cap)}</span><b>${(m.score / 100).toFixed(2)}</b></div>
    ${m.banger ? `<span class="${p}-banger">banger</span>` : ''}
  </article>`;
}

function afdR2States(p, M) {
  const states = ['', 'match', 'near', 'dim', 'selected', 'loading', 'error'];
  return `<div class="${p}-states">${states.map((s, i) => afdR2Cell(p, M[i], s, i)).join('')}</div>`;
}

function afdR2Piles(p) {
  return `<div class="${p}-piles">${PILES.map((x, i) => `<button type="button" class="${p}-pile ${i === 0 ? 'on' : ''}"><span>${esc(x.name)}</span><b>${x.n}</b></button>`).join('')}</div>`;
}

function afdR2Status(p, noun) {
  return `<div class="${p}-status"><span><b>index</b>${LIB.total.toLocaleString()} vec</span><span><b>model</b>${LIB.model}</span><span><b>queue</b>${LIB.queued} ${noun}</span><span><b>latency</b>${LIB.latency}ms</span><span class="live"><b>machine</b>live</span></div>`;
}

/* ════════════════════════════════════════════════════════════════════
   AFD-4 · PRIZE PRESS
   Hybrid move: the interface is a four-station assembly line. Search
   advances matter through feed, expose, stamp, and prize stations.
   ════════════════════════════════════════════════════════════════════ */
SPECS['AFD-4'] = (mount) => {
  css('AFD-4', `
  .afd4{--paper:#fff3cf;--sheet:#fffaf0;--ink:#20163d;--mut:#6c607c;--cyan:#00a8c6;--mag:#ed2f88;--yel:#ffd928;--red:#e84435;--green:#138a66;--chrome:#d8d9d2;--line:3px solid var(--ink);--lift:5px 5px 0 var(--mag),10px 10px 0 var(--cyan);--press:0 1px 0 var(--ink);--display:'Rubik Mono One',sans-serif;--body:'Bricolage Grotesque',sans-serif;--mono:'Space Mono',monospace;min-height:100dvh;color:var(--ink);font-family:var(--body);background:linear-gradient(90deg,transparent 49%,rgba(32,22,61,.07) 50%,transparent 51%) 0 0/28px 28px,var(--paper);overflow-x:clip}
  .afd4.theme-dark{--paper:#171126;--sheet:#251c39;--ink:#fff1c9;--mut:#c3b6d1;--cyan:#20c5df;--mag:#ff5ca7;--yel:#ffe14d;--red:#ff6b55;--green:#45d3a3;--chrome:#4d4857;--line:3px solid var(--ink);--lift:5px 5px 0 var(--mag),10px 10px 0 var(--cyan);--press:0 1px 0 var(--ink)}
  .afd4 *{box-sizing:border-box}.afd4 :focus-visible{outline:4px solid var(--cyan);outline-offset:3px}.afd4 button,.afd4 input{font:inherit}.afd4 .a4-wrap{width:min(1180px,100%);margin:auto;padding:0 clamp(14px,4vw,44px)}
  .afd4 .a4-mast{position:sticky;top:0;z-index:10;display:flex;gap:18px;align-items:center;justify-content:space-between;padding:12px clamp(14px,4vw,44px);border-bottom:var(--line);background:var(--sheet)}.afd4 .a4-logo{font-family:var(--display);font-size:24px;text-shadow:2px 2px var(--mag),-2px -2px var(--cyan)}.afd4 nav{display:flex;gap:14px;flex-wrap:wrap}.afd4 nav a{color:var(--ink);font-family:var(--mono);font-size:11px;text-decoration:none;border-bottom:2px solid transparent}.afd4 nav a:hover{border-color:var(--mag)}
  .afd4 .a4-hero{padding-top:46px}.afd4 .a4-kicker,.afd4 .a4-sec{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.1em}.afd4 h1{font-family:var(--display);font-size:clamp(38px,7vw,82px);line-height:.98;max-width:13ch;margin:18px 0}.afd4 h1 i{font-style:normal;color:var(--mag);text-shadow:3px 3px 0 var(--cyan)}.afd4 .a4-intro{font-size:18px;max-width:52ch}.afd4 .a4-sec{margin:58px 0 20px;padding:9px 0;border-block:var(--line);display:flex;justify-content:space-between;gap:12px}.afd4 .a4-row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}
  .afd4 .a4-line{display:grid;grid-template-columns:repeat(4,1fr);margin:34px 0 28px;border:var(--line);background:var(--sheet);box-shadow:var(--lift)}.afd4 .a4-station{position:relative;min-height:116px;padding:18px 14px 16px;border-right:var(--line)}.afd4 .a4-station:last-child{border:0}.afd4 .a4-station b{display:grid;place-items:center;width:34px;height:34px;border:2px solid var(--ink);border-radius:50%;background:var(--yel);color:#20163d;font-family:var(--mono)}.afd4 .a4-station span{display:block;margin-top:12px;font-family:var(--mono);font-size:11px}.afd4 .a4-station::after{content:'›';position:absolute;right:-13px;top:36px;z-index:2;width:24px;height:30px;background:var(--ink);color:var(--paper);text-align:center;font-size:23px}.afd4 .a4-station:last-child::after{display:none}.afd4 .a4-line.step-2 .a4-station:nth-child(-n+2),.afd4 .a4-line.step-3 .a4-station:nth-child(-n+3),.afd4 .a4-line.step-4 .a4-station{background:var(--yel);color:#20163d}
  .afd4 .a4-console{border:var(--line);background:var(--chrome);box-shadow:var(--lift);max-width:860px}.afd4 .a4-machine{display:flex;justify-content:space-between;padding:8px 14px;background:var(--ink);color:var(--paper);font-family:var(--mono);font-size:10px}.afd4 .a4-feed{display:flex;gap:12px;padding:16px}.afd4 .a4-field{flex:1;min-width:0;display:flex;align-items:center;gap:9px;border:var(--line);background:var(--sheet);padding:12px 14px}.afd4 .a4-field input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font-family:var(--mono)}.afd4 .a4-btn{min-height:44px;border:var(--line);background:var(--sheet);color:var(--ink);padding:9px 18px;font-weight:800;box-shadow:4px 4px 0 var(--ink);transition:transform 120ms,box-shadow 120ms}.afd4 .a4-btn:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--mag)}.afd4 .a4-btn:active{transform:translate(4px,4px);box-shadow:var(--press)}.afd4 .a4-btn.primary{background:var(--yel);color:#20163d}.afd4 .a4-btn.compact{min-height:36px;padding:5px 10px;font-family:var(--mono);font-size:11px}.afd4 .a4-btn.icon{width:44px;padding:0}
  .afd4 .a4-states,.afd4 .a4-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}.afd4 .a4-states{grid-template-columns:repeat(4,minmax(0,1fr))}.afd4 .a4-cell{position:relative;border:var(--line);background:var(--sheet);box-shadow:4px 4px 0 var(--cyan);min-width:0;transition:transform 140ms,box-shadow 140ms}.afd4 .a4-cell:hover{transform:translateY(-4px)}.afd4 .a4-rail,.afd4 .a4-cap{display:flex;justify-content:space-between;gap:8px;padding:7px 9px;font-family:var(--mono);font-size:9px}.afd4 .a4-rail{border-bottom:2px dashed var(--ink);background:var(--yel);color:#20163d}.afd4 .a4-cap{border-top:2px solid var(--ink);font-family:var(--body);font-size:12px}.afd4 .a4-cap b{font-family:var(--mono)}.afd4 .a4-art{position:relative;display:grid;place-items:center;overflow:hidden;background:var(--paper)}.afd4 .meme-media{width:100%;height:100%;object-fit:contain}.afd4 .a4-state{position:absolute;left:7px;bottom:7px;background:var(--ink);color:var(--paper);padding:3px 6px;font-family:var(--mono);font-size:8px}.afd4 .a4-banger{position:absolute;right:-10px;top:30px;transform:rotate(7deg);background:var(--mag);color:#fff;padding:5px 8px;border:2px solid var(--ink);font-family:var(--display);font-size:8px}.afd4 .a4-cell.match{box-shadow:6px 6px 0 var(--mag),12px 12px 0 var(--cyan)}.afd4 .a4-cell.near{outline:3px dashed var(--cyan);outline-offset:4px}.afd4 .a4-cell.dim{opacity:.42;filter:grayscale(.7)}.afd4 .a4-cell.selected{transform:translateY(-7px);box-shadow:0 7px 0 var(--yel),0 10px 0 var(--ink)}.afd4 .a4-cell.loading .a4-art::after{content:'feeding through press';position:absolute;inset:auto 0 0;padding:10px;background:var(--yel);color:#20163d;font-family:var(--mono);font-size:9px}.afd4 .a4-cell.error{border-color:var(--red)}.afd4 .a4-cell.error .a4-state{background:var(--red)}
  .afd4 .a4-found{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}.afd4 .a4-shape{min-height:92px;border:var(--line);background:var(--sheet);display:grid;place-items:center;text-align:center;padding:10px;font-family:var(--mono);font-size:9px}.afd4 .a4-type{display:grid;grid-template-columns:1.2fr 1fr;gap:24px}.afd4 .a4-type > div{border-left:var(--line);padding-left:16px}.afd4 .a4-display{font-family:var(--display);font-size:40px;line-height:1}.afd4 .a4-label,.afd4 .a4-meta,.afd4 .a4-num{font-family:var(--mono)}.afd4 .a4-label{font-size:12px}.afd4 .a4-meta{font-size:10px;color:var(--mut)}.afd4 .a4-num{font-size:26px;font-variant-numeric:tabular-nums}.afd4 .a4-caption{max-width:42ch;border-bottom:5px solid var(--mag);padding-bottom:8px}
  .afd4 .a4-tag{border:2px dashed var(--ink);padding:6px 10px;background:var(--sheet);font-family:var(--mono);font-size:11px}.afd4 .a4-star{clip-path:polygon(50% 0,61% 27%,85% 15%,73% 39%,100% 50%,73% 61%,85% 85%,61% 73%,50% 100%,39% 73%,15% 85%,27% 61%,0 50%,27% 39%,15% 15%,39% 27%);width:86px;height:86px;display:grid;place-items:center;background:var(--yel);color:#20163d;font-family:var(--display);font-size:9px;text-align:center}.afd4 .a4-stat{border:var(--line);background:var(--sheet);padding:14px 18px;box-shadow:4px 4px 0 var(--cyan)}.afd4 .a4-stat b{display:block;font-family:var(--display);font-size:30px}.afd4 .a4-tabs{display:flex;flex-wrap:wrap}.afd4 .a4-tab{min-height:44px;border:2px solid var(--ink);background:var(--sheet);color:var(--ink);padding:8px 16px;font-family:var(--mono)}.afd4 .a4-tab.on{background:var(--mag);color:#fff}.afd4 .a4-toast,.afd4 .a4-empty{border:var(--line);background:var(--sheet);padding:16px;box-shadow:var(--lift)}.afd4 .a4-empty{max-width:390px}.afd4 .a4-status{display:flex;flex-wrap:wrap;background:var(--ink);color:var(--paper)}.afd4 .a4-status span{padding:9px 12px;border-right:1px dashed currentColor;font-family:var(--mono);font-size:10px}.afd4 .a4-status b{opacity:.55;margin-right:7px}.afd4 .a4-status .live::after{content:'●';color:var(--green);margin-left:7px}
  .afd4 .a4-bench{border:var(--line);background:var(--sheet);box-shadow:var(--lift)}.afd4 .a4-command{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px;border-bottom:var(--line)}.afd4 .a4-command .a4-field{max-width:390px}.afd4 .a4-benchbody{display:grid;grid-template-columns:220px 1fr;gap:18px;padding:18px}.afd4 .a4-piles{display:flex;flex-direction:column;gap:8px}.afd4 .a4-pile{display:flex;justify-content:space-between;gap:8px;min-height:44px;border:2px solid var(--ink);background:var(--sheet);color:var(--ink);padding:9px;font-size:12px;text-align:left}.afd4 .a4-pile.on{background:var(--yel);color:#20163d}.afd4 .a4-phone{width:min(390px,100%);border:var(--line);background:var(--paper);box-shadow:var(--lift);overflow:hidden}.afd4 .a4-phone .a4-grid{grid-template-columns:repeat(2,minmax(0,1fr));padding:12px;gap:12px}.afd4 .a4-dock{display:flex;border-top:var(--line);background:var(--sheet)}.afd4 .a4-dock button{flex:1;min-height:50px;border:0;border-right:2px solid var(--ink);background:transparent;color:var(--ink);font-family:var(--mono);font-size:9px}.afd4 .a4-dock button.on{background:var(--yel);color:#20163d}
  @keyframes a4feed{0%{transform:translateX(-18px);opacity:.2}100%{transform:translateX(0);opacity:1}}.afd4 .a4-demo-feed.go{animation:a4feed 260ms ease-out}.afd4 .a4-demo-stamp.go{transform:rotate(-4deg) scale(.92);background:var(--mag);color:#fff;transition:transform 160ms}.afd4 .a4-motion-note{font-family:var(--mono);font-size:10px;color:var(--mut)}
  @media(prefers-reduced-motion:reduce){.afd4 *,.afd4 *::before,.afd4 *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  @media(max-width:700px){.afd4 .a4-line{grid-template-columns:1fr 1fr}.afd4 .a4-station:nth-child(2){border-right:0}.afd4 .a4-station{border-bottom:var(--line)}.afd4 .a4-station::after{display:none}.afd4 .a4-feed{flex-direction:column}.afd4 .a4-states,.afd4 .a4-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.afd4 .a4-found{grid-template-columns:repeat(2,1fr)}.afd4 .a4-type{grid-template-columns:1fr}.afd4 .a4-benchbody{grid-template-columns:1fr}.afd4 .a4-mast{position:relative}.afd4 nav{gap:8px}.afd4 .a4-banger{right:2px}.afd4 .a4-command .a4-field{width:100%;max-width:none}.afd4 .a4-status span{flex:1 1 45%}}
  `);
  const M = MEMES;
  mount.innerHTML = `<div class="afd4">
    <header class="a4-mast"><span class="a4-logo">sploot press</span><nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav></header>
    <main>
      <section class="a4-wrap a4-hero"><span class="a4-kicker">private meme matter · press line 04</span><h1>type words. get the <i>picture.</i></h1><p class="a4-intro">feed the thought in. the machine prints the closest thing from your pile. no folders. just vibes.</p>
        <div class="a4-line step-1"><div class="a4-station"><b>1</b><span>feed words</span></div><div class="a4-station"><b>2</b><span>expose vectors</span></div><div class="a4-station"><b>3</b><span>stamp matches</span></div><div class="a4-station"><b>4</b><span>collect prize</span></div></div>
        <div class="a4-console"><div class="a4-machine"><span>semantic prize press</span><span>${LIB.model} · ${LIB.latency}ms</span></div><div class="a4-feed"><label class="a4-field"><span>›</span><input aria-label="search the pile" value="cat losing it"></label><button type="button" class="a4-btn primary a4-run">run the press</button></div></div>
      </section>
      <section class="a4-wrap"><div class="a4-sec"><b>foundations</b><span>cmy plates meet toy mechanics</span></div></section>${swatches([['paper','#fff3cf'],['sheet','#fffaf0'],['ink','#20163d','#fff'],['cyan','#00a8c6','#fff'],['magenta','#ed2f88','#fff'],['yellow','#ffd928'],['machine','#d8d9d2']])}
      <section class="a4-wrap" style="padding-top:22px"><div class="a4-found"><div class="a4-shape">3px ink shell</div><div class="a4-shape" style="box-shadow:var(--lift)">cmy lift</div><div class="a4-shape" style="border-style:dashed">perforation</div><div class="a4-shape" style="border-radius:50%">round machine control</div><div class="a4-shape" style="background:var(--chrome)">chrome housing</div></div><p class="a4-motion-note">spacing runs 7 / 14 / 28 / 56 · elevation is paired ink separation · stations consume the page in fours</p></section>
      <section class="a4-wrap"><div class="a4-sec"><b>type specimen</b><span>hard label, friendly body, machine data</span></div><div class="a4-type"><div><div class="a4-display">PRINT THE PILE</div><p>body · bricolage grotesque keeps the press room readable when the shelves get loud.</p><p class="a4-caption">long caption wrap: me explaining why the cat judging my commit history is the exact image the group chat ordered.</p></div><div><p class="a4-label">LABEL · RUBIK MONO ONE</p><p class="a4-meta">metadata · vec 0413 · siglip-base · 768d</p><p class="a4-num">1,482 · 0.94 · 212ms</p></div></div></section>
      <section class="a4-wrap"><div class="a4-sec"><b>component sheet</b><span>each object declares its station</span></div><div style="display:flex;flex-direction:column;gap:30px"><div class="a4-console"><div class="a4-machine"><span>search request</span><span>route /api/search</span></div><div class="a4-feed"><label class="a4-field"><span>›</span><input aria-label="component search" value="sad frog"></label><button type="button" class="a4-btn primary">find it</button></div></div>${afdR2States('a4',M)}<div class="a4-row"><button class="a4-btn primary">upload chaos</button><button class="a4-btn">shuffle the pile</button><button class="a4-btn compact">compact</button><button class="a4-btn icon" aria-label="close">×</button><span class="a4-tag">automatic pile</span><span class="a4-star">banger</span></div><div class="a4-row"><div class="a4-tabs"><button class="a4-tab on">all</button><button class="a4-tab">bangers</button><button class="a4-tab">recent</button></div><div class="a4-toast">saved to the pile · embedding queued</div></div><div class="a4-row"><div class="a4-stat"><span>memes indexed</span><b>1,482</b></div><div class="a4-stat"><span>bangers</span><b>37</b></div><div class="a4-stat"><span>folders required</span><b>0</b></div></div>${afdR2Status('a4','feeding')}<div class="a4-empty"><strong>the feed tray is empty</strong><p>zero thoughts. upload chaos and the press has something to work with.</p><button class="a4-btn primary">upload chaos</button></div></div></section>
      <section class="a4-wrap"><div class="a4-sec"><b>motion</b><span>one object advances one station per action</span></div><div class="a4-row"><button class="a4-btn primary a4-next">advance one station</button><div class="a4-tag a4-demo-feed">feed slip · cat losing it</div><button class="a4-btn a4-stamp">stamp the pull</button><div class="a4-tag a4-demo-stamp">closest match</div></div><p class="a4-motion-note">prefers-reduced-motion: station fill, stamp, and feed states change instantly with no travel.</p></section>
      <section class="a4-wrap"><div class="a4-sec"><b>compositions</b><span>desktop line and pocket press</span></div><div class="a4-bench"><div class="a4-command"><span class="a4-logo" style="font-size:15px">sploot</span><label class="a4-field"><input aria-label="workbench search" value="search the pile"></label><button class="a4-btn compact">upload</button><button class="a4-btn compact">bangers</button><button class="a4-btn compact">shuffle</button></div><div class="a4-benchbody">${afdR2Piles('a4')}<div class="a4-grid">${M.slice(0,8).map((m,i)=>afdR2Cell('a4',m,i===0?'match':'',i)).join('')}</div></div>${afdR2Status('a4','feeding')}</div></section>
      <section class="a4-wrap" style="padding-block:28px 54px"><div class="a4-phone"><div class="a4-command"><span class="a4-logo" style="font-size:14px">sploot</span><span class="a4-meta">${LIB.total.toLocaleString()} vec</span><label class="a4-field" style="flex-basis:100%"><input aria-label="phone search" value="cat losing it"></label></div><div class="a4-grid">${M.slice(0,4).map((m,i)=>afdR2Cell('a4',m,i===0?'match':'',i)).join('')}</div><div class="a4-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div></div></section>
    </main>${labSpec([['system','prize press · hybrid assembly line'],['type','rubik mono one / bricolage grotesque / space mono'],['move','search advances through four physical stations: feed, expose, stamp, collect'],['density','high, station-bounded'],['motion','single-step feed and stamp']])}</div>`;
  const root = mount.querySelector('.afd4'); themeToggle(root);
  const line = root.querySelector('.a4-line'); let step = 1;
  root.querySelectorAll('.a4-run,.a4-next').forEach(btn => btn.addEventListener('click', () => { step = step === 4 ? 1 : step + 1; line.className = `a4-line step-${step}`; const slip=root.querySelector('.a4-demo-feed'); slip.classList.remove('go'); void slip.offsetWidth; slip.classList.add('go'); }));
  root.querySelector('.a4-stamp').addEventListener('click',()=>root.querySelector('.a4-demo-stamp').classList.toggle('go'));
  root.querySelectorAll('.a4-tab').forEach(tab=>tab.addEventListener('click',()=>{root.querySelectorAll('.a4-tab').forEach(x=>x.classList.remove('on'));tab.classList.add('on')}));
};

/* ════════════════════════════════════════════════════════════════════
   AFD-5 · BLACKLIGHT CONTACT ARCHIVE
   Overprint move: every result belongs to a numbered contact sheet;
   CMY channel rails can be isolated like separations at the press.
   ════════════════════════════════════════════════════════════════════ */
SPECS['AFD-5'] = (mount) => {
  css('AFD-5', `
  .afd5{--void:#101013;--board:#19191d;--paper:#eee8d7;--ink:#f8f2de;--mut:#aaa493;--cyan:#00e1ff;--mag:#ff3ca6;--yel:#f4ff40;--red:#ff594f;--green:#55e69e;--rule:1px solid rgba(248,242,222,.34);--frame:2px solid var(--ink);--ghost:4px 0 var(--mag),-4px 0 var(--cyan);--display:'Anton',sans-serif;--body:'Space Grotesk',sans-serif;--mono:'IBM Plex Mono',monospace;min-height:100dvh;background:repeating-linear-gradient(0deg,transparent 0 23px,rgba(248,242,222,.035) 24px),var(--void);color:var(--ink);font-family:var(--body);overflow-x:clip}
  .afd5.theme-dark{--void:#eee7d3;--board:#fffaf0;--paper:#17171b;--ink:#16151a;--mut:#625f58;--cyan:#007b92;--mag:#c90068;--yel:#9ba700;--red:#c52727;--green:#08784d;--rule:1px solid rgba(22,21,26,.32);--frame:2px solid var(--ink);--ghost:4px 0 var(--mag),-4px 0 var(--cyan)}
  .afd5 *{box-sizing:border-box}.afd5 :focus-visible{outline:3px solid var(--yel);outline-offset:4px}.afd5 button,.afd5 input{font:inherit}.afd5 .a5-wrap{width:min(1240px,100%);margin:auto;padding:0 clamp(14px,3vw,36px)}.afd5 .a5-mast{display:grid;grid-template-columns:auto 1fr auto;gap:22px;align-items:center;padding:12px clamp(14px,3vw,36px);border-bottom:var(--frame);background:var(--board)}.afd5 .a5-logo{font-family:var(--display);font-size:28px;letter-spacing:.08em;text-shadow:var(--ghost)}.afd5 nav{display:flex;gap:20px}.afd5 nav a{color:var(--ink);font-family:var(--mono);font-size:10px;text-decoration:none;text-transform:uppercase}.afd5 .a5-clock{font-family:var(--mono);font-size:10px;color:var(--mut)}
  .afd5 .a5-hero{display:grid;grid-template-columns:100px 1fr;gap:24px;padding-top:46px}.afd5 .a5-spine{writing-mode:vertical-rl;transform:rotate(180deg);border-left:var(--frame);font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;padding-left:13px}.afd5 h1{font-family:var(--display);font-size:clamp(54px,10vw,128px);line-height:.82;letter-spacing:.01em;margin:0;text-transform:uppercase}.afd5 h1 span{color:var(--void);-webkit-text-stroke:2px var(--ink);text-shadow:var(--ghost)}.afd5 .a5-lede{max-width:57ch;font-size:17px;margin:22px 0}.afd5 .a5-sec{margin:58px 0 20px;border-block:var(--frame);padding:8px 0;display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em}.afd5 .a5-row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}
  .afd5 .a5-console{border:var(--frame);background:var(--board);max-width:900px}.afd5 .a5-consolehead{display:grid;grid-template-columns:1fr auto;gap:12px;padding:7px 12px;border-bottom:var(--rule);font-family:var(--mono);font-size:9px;text-transform:uppercase}.afd5 .a5-query{display:flex;gap:12px;padding:14px}.afd5 .a5-query label{flex:1;display:flex;gap:9px;align-items:center;border:var(--frame);padding:10px 12px;background:var(--void)}.afd5 input{min-width:0;width:100%;border:0;outline:0;background:transparent;color:var(--ink);font-family:var(--mono)}.afd5 .a5-btn{min-height:44px;border:var(--frame);background:var(--board);color:var(--ink);padding:9px 17px;font-family:var(--mono);font-size:11px;text-transform:uppercase;box-shadow:4px 4px 0 var(--cyan);transition:transform 120ms}.afd5 .a5-btn:hover{transform:translate(-2px,-2px);box-shadow:4px 4px 0 var(--mag)}.afd5 .a5-btn:active{transform:translate(3px,3px);box-shadow:none}.afd5 .a5-btn.primary{background:var(--yel);color:#101013}.afd5 .a5-btn.compact{min-height:34px;padding:5px 9px}.afd5 .a5-btn.icon{width:44px;padding:0}
  .afd5 .a5-channels{display:flex;gap:8px;margin:18px 0}.afd5 .a5-channel{min-height:44px;border:var(--frame);background:transparent;color:var(--ink);padding:8px 13px;font-family:var(--mono);font-size:10px}.afd5 .a5-channel[data-c="c"].on{background:var(--cyan);color:#101013}.afd5 .a5-channel[data-c="m"].on{background:var(--mag);color:white}.afd5 .a5-channel[data-c="y"].on{background:var(--yel);color:#101013}.afd5.channel-c .a5-cell{box-shadow:5px 0 0 var(--cyan)}.afd5.channel-m .a5-cell{box-shadow:5px 0 0 var(--mag)}.afd5.channel-y .a5-cell{box-shadow:5px 0 0 var(--yel)}
  .afd5 .a5-contact,.afd5 .a5-states,.afd5 .a5-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--ink);border:var(--frame)}.afd5 .a5-cell{position:relative;background:var(--board);min-width:0;transition:filter 120ms,transform 120ms}.afd5 .a5-cell:hover{z-index:2;transform:scale(1.015)}.afd5 .a5-rail,.afd5 .a5-cap{display:flex;justify-content:space-between;gap:8px;padding:7px 9px;font-family:var(--mono);font-size:8px}.afd5 .a5-rail{border-bottom:var(--rule);color:var(--mut)}.afd5 .a5-cap{border-top:var(--rule);font-size:10px}.afd5 .a5-art{position:relative;display:grid;place-items:center;overflow:hidden;background:var(--void)}.afd5 .meme-media{width:100%;height:100%;object-fit:contain}.afd5 .a5-state{position:absolute;left:0;bottom:0;padding:3px 6px;background:var(--ink);color:var(--void);font-family:var(--mono);font-size:8px;text-transform:uppercase}.afd5 .a5-banger{position:absolute;right:7px;top:31px;border:2px solid var(--mag);color:var(--mag);padding:4px 7px;font-family:var(--mono);font-size:8px;transform:rotate(-4deg)}.afd5 .a5-cell.match{box-shadow:inset 0 0 0 5px var(--mag)}.afd5 .a5-cell.near{box-shadow:inset 0 0 0 4px var(--cyan)}.afd5 .a5-cell.dim{opacity:.32;filter:grayscale(1)}.afd5 .a5-cell.selected{transform:scale(.94);outline:4px solid var(--yel);z-index:2}.afd5 .a5-cell.loading .a5-art::after{content:'developing 03/04';position:absolute;inset:0;display:grid;place-items:center;background:rgba(16,16,19,.78);color:var(--yel);font-family:var(--mono);font-size:9px}.afd5 .a5-cell.error{background:repeating-linear-gradient(135deg,var(--board) 0 12px,var(--red) 13px 15px)}.afd5 .a5-cell.error .a5-state{background:var(--red);color:white}
  .afd5 .a5-found{display:grid;grid-template-columns:repeat(5,1fr);border:var(--frame)}.afd5 .a5-shape{min-height:100px;display:grid;place-items:center;text-align:center;padding:10px;border-right:var(--rule);font-family:var(--mono);font-size:9px}.afd5 .a5-type{display:grid;grid-template-columns:2fr 1fr;gap:24px}.afd5 .a5-display{font-family:var(--display);font-size:64px;line-height:.9;text-transform:uppercase}.afd5 .a5-label,.afd5 .a5-meta,.afd5 .a5-num{font-family:var(--mono)}.afd5 .a5-label{font-size:11px}.afd5 .a5-meta{font-size:9px;color:var(--mut)}.afd5 .a5-num{font-size:28px;font-variant-numeric:tabular-nums}.afd5 .a5-caption{max-width:44ch;border-left:8px double var(--cyan);padding-left:12px}
  .afd5 .a5-tag{border:1px dashed var(--ink);padding:6px 9px;font-family:var(--mono);font-size:10px}.afd5 .a5-stamp{border:3px double var(--mag);color:var(--mag);padding:7px 12px;font-family:var(--mono);font-size:11px;text-transform:uppercase;transform:rotate(-5deg)}.afd5 .a5-stat{min-width:170px;border:var(--frame);padding:12px;background:var(--board)}.afd5 .a5-stat b{display:block;font-family:var(--display);font-size:38px}.afd5 .a5-tabs{display:flex}.afd5 .a5-tab{min-height:44px;border:var(--frame);margin-right:-2px;background:var(--board);color:var(--ink);padding:8px 14px;font-family:var(--mono);font-size:10px}.afd5 .a5-tab.on{background:var(--ink);color:var(--void);box-shadow:inset 0 -5px var(--mag)}.afd5 .a5-toast,.afd5 .a5-empty{border:var(--frame);padding:16px;background:var(--board)}.afd5 .a5-empty{max-width:390px}.afd5 .a5-status{display:flex;flex-wrap:wrap;border:var(--frame);background:var(--board)}.afd5 .a5-status span{padding:8px 12px;border-right:var(--rule);font-family:var(--mono);font-size:9px}.afd5 .a5-status b{color:var(--mut);margin-right:7px}.afd5 .a5-status .live::after{content:'■';color:var(--green);margin-left:7px}
  .afd5 .a5-bench{border:var(--frame);background:var(--board)}.afd5 .a5-command{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px;border-bottom:var(--frame)}.afd5 .a5-command label{flex:1;min-width:180px;border:var(--frame);padding:9px}.afd5 .a5-benchbody{display:grid;grid-template-columns:220px 1fr;gap:1px;background:var(--ink)}.afd5 .a5-piles{display:flex;flex-direction:column;background:var(--board);padding:12px;gap:5px}.afd5 .a5-pile{display:flex;justify-content:space-between;gap:8px;min-height:44px;border:var(--rule);background:transparent;color:var(--ink);padding:9px;font-family:var(--mono);font-size:9px;text-align:left}.afd5 .a5-pile.on{border-color:var(--yel);color:var(--yel)}.afd5 .a5-grid{border:0}.afd5 .a5-phone{width:min(390px,100%);border:var(--frame);background:var(--void);overflow:hidden}.afd5 .a5-phone .a5-grid{grid-template-columns:repeat(2,minmax(0,1fr));padding:1px}.afd5 .a5-dock{display:flex;border-top:var(--frame)}.afd5 .a5-dock button{flex:1;min-height:50px;border:0;border-right:var(--rule);background:var(--board);color:var(--ink);font-family:var(--mono);font-size:9px}.afd5 .a5-dock button.on{color:var(--yel)}
  @keyframes a5flash{0%{filter:brightness(4)}100%{filter:brightness(1)}}.afd5 .a5-flash.go{animation:a5flash 300ms steps(2)}.afd5 .a5-register.go{text-shadow:6px 0 var(--mag),-6px 0 var(--cyan);transition:text-shadow 180ms}.afd5 .a5-note{font-family:var(--mono);font-size:9px;color:var(--mut)}
  @media(prefers-reduced-motion:reduce){.afd5 *,.afd5 *::before,.afd5 *::after{animation:none!important;transition:none!important}}
  @media(max-width:700px){.afd5 .a5-mast{grid-template-columns:1fr}.afd5 nav{flex-wrap:wrap;gap:10px}.afd5 .a5-hero{grid-template-columns:1fr}.afd5 .a5-spine{writing-mode:horizontal-tb;transform:none;border-left:0;border-bottom:var(--frame);padding:0 0 8px}.afd5 .a5-query{flex-direction:column}.afd5 .a5-contact,.afd5 .a5-states,.afd5 .a5-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.afd5 .a5-found{grid-template-columns:repeat(2,1fr)}.afd5 .a5-type{grid-template-columns:1fr}.afd5 .a5-benchbody{grid-template-columns:1fr}.afd5 .a5-clock{display:none}.afd5 .a5-display{font-size:48px}.afd5 .a5-status span{flex:1 1 45%}}
  `);
  const M=MEMES;
  mount.innerHTML=`<div class="afd5">
    <header class="a5-mast"><span class="a5-logo">sploot / night shift</span><nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav><span class="a5-clock">press open · ${LIB.latency}ms</span></header>
    <main><section class="a5-wrap a5-hero"><div class="a5-spine">contact archive · sheet 001</div><div><h1>find it in <span>the dark.</span></h1><p class="a5-lede">type words. get the picture. every meme lands on a numbered contact sheet, and every ink channel stays inspectable.</p><div class="a5-console"><div class="a5-consolehead"><span>semantic enlarger</span><span>${LIB.model} / ${LIB.dim}d</span></div><div class="a5-query"><label><span>query:</span><input aria-label="search the archive" value="cat losing it"></label><button class="a5-btn primary a5-expose">expose sheet</button></div></div><div class="a5-channels"><button class="a5-channel" data-c="c">C / cyan</button><button class="a5-channel" data-c="m">M / magenta</button><button class="a5-channel" data-c="y">Y / yellow</button></div><div class="a5-contact a5-flash">${M.slice(0,4).map((m,i)=>afdR2Cell('a5',m,i===0?'match':'',i)).join('')}</div></div></section>
      <section class="a5-wrap"><div class="a5-sec"><b>foundations</b><span>night ink / hard proof</span></div></section>${swatches([['void','#101013','#fff'],['board','#19191d','#fff'],['paper ink','#f8f2de'],['cyan','#00e1ff'],['magenta','#ff3ca6','#fff'],['yellow','#f4ff40'],['live','#55e69e']])}<section class="a5-wrap" style="padding-top:20px"><div class="a5-found"><div class="a5-shape">1px archive rule</div><div class="a5-shape" style="border:var(--frame)">2px proof frame</div><div class="a5-shape" style="text-shadow:var(--ghost)">split registration</div><div class="a5-shape" style="background:var(--paper);color:var(--void)">reverse proof</div><div class="a5-shape" style="border:3px double var(--mag)">verdict stamp</div></div><p class="a5-note">spacing runs 6 / 12 / 24 / 48 · elevation is channel displacement · contact cells share edges to maximize archive density</p></section>
      <section class="a5-wrap"><div class="a5-sec"><b>type specimen</b><span>condensed display / neutral reading / data rail</span></div><div class="a5-type"><div><div class="a5-display a5-register">blacklight proof room</div><p>body · space grotesk keeps dense contact sheets calm while the ink does the shouting.</p><p class="a5-caption">long caption wrap: me locating the exact group chat reaction by meaning while the whole archive develops under red light.</p></div><div><p class="a5-label">LABEL / IBM PLEX MONO</p><p class="a5-meta">metadata / vec 0413 / siglip-base / 768d</p><p class="a5-num">1,482 / 0.94 / 212ms</p></div></div></section>
      <section class="a5-wrap"><div class="a5-sec"><b>component sheet</b><span>every state survives monochrome proofing</span></div><div style="display:flex;flex-direction:column;gap:28px"><div class="a5-console"><div class="a5-consolehead"><span>semantic enlarger</span><span>route /api/search</span></div><div class="a5-query"><label><input aria-label="component search" value="sad frog"></label><button class="a5-btn primary">find it</button></div></div>${afdR2States('a5',M)}<div class="a5-row"><button class="a5-btn primary">upload chaos</button><button class="a5-btn">shuffle the pile</button><button class="a5-btn compact">compact</button><button class="a5-btn icon" aria-label="close">×</button><span class="a5-tag">automatic pile</span><span class="a5-stamp">banger</span></div><div class="a5-row"><div class="a5-tabs"><button class="a5-tab on">all</button><button class="a5-tab">bangers</button><button class="a5-tab">recent</button></div><div class="a5-toast">saved to the pile / vector queued</div></div><div class="a5-row"><div class="a5-stat"><span>memes indexed</span><b>1,482</b></div><div class="a5-stat"><span>bangers</span><b>37</b></div><div class="a5-stat"><span>folders required</span><b>0</b></div></div>${afdR2Status('a5','developing')}<div class="a5-empty"><strong>blank contact sheet</strong><p>zero thoughts on this roll. upload chaos to expose the first frame.</p><button class="a5-btn primary">upload chaos</button></div></div></section>
      <section class="a5-wrap"><div class="a5-sec"><b>motion</b><span>darkroom actions, never ambient data</span></div><div class="a5-row"><button class="a5-btn a5-expose2">flash the contact sheet</button><button class="a5-btn a5-register-btn">pull registration apart</button><div class="a5-display a5-register" style="font-size:30px">SPL00T</div></div><p class="a5-note">prefers-reduced-motion: exposures and registration changes appear as immediate settled states.</p></section>
      <section class="a5-wrap"><div class="a5-sec"><b>compositions</b><span>dense contact workbench and pocket roll</span></div><div class="a5-bench"><div class="a5-command"><span class="a5-logo" style="font-size:15px">sploot</span><label><input aria-label="workbench search" value="search the pile"></label><button class="a5-btn compact">upload</button><button class="a5-btn compact">bangers</button><button class="a5-btn compact">shuffle</button></div><div class="a5-benchbody">${afdR2Piles('a5')}<div class="a5-grid">${M.slice(0,8).map((m,i)=>afdR2Cell('a5',m,i===0?'match':'',i)).join('')}</div></div>${afdR2Status('a5','developing')}</div></section>
      <section class="a5-wrap" style="padding-block:28px 54px"><div class="a5-phone"><div class="a5-command"><span class="a5-logo" style="font-size:14px">sploot</span><span class="a5-meta">sheet 001</span><label style="flex-basis:100%"><input aria-label="phone search" value="cat losing it"></label></div><div class="a5-grid">${M.slice(0,4).map((m,i)=>afdR2Cell('a5',m,i===0?'match':'',i)).join('')}</div><div class="a5-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div></div></section>
    </main>${labSpec([['system','blacklight contact archive'],['type','anton / space grotesk / ibm plex mono'],['move','results live on numbered contact sheets with isolatable CMY channel rails'],['density','workbench-dense, shared-edge grid'],['motion','exposure flash and manual registration']])}</div>`;
  const root=mount.querySelector('.afd5');themeToggle(root);
  root.querySelectorAll('.a5-channel').forEach(btn=>btn.addEventListener('click',()=>{root.classList.remove('channel-c','channel-m','channel-y');root.querySelectorAll('.a5-channel').forEach(x=>x.classList.remove('on'));btn.classList.add('on');root.classList.add(`channel-${btn.dataset.c}`)}));
  root.querySelectorAll('.a5-expose,.a5-expose2').forEach(btn=>btn.addEventListener('click',()=>{const sheet=root.querySelector('.a5-flash');sheet.classList.remove('go');void sheet.offsetWidth;sheet.classList.add('go')}));
  root.querySelector('.a5-register-btn').addEventListener('click',()=>root.querySelectorAll('.a5-register').forEach(x=>x.classList.toggle('go')));
  root.querySelectorAll('.a5-tab').forEach(tab=>tab.addEventListener('click',()=>{root.querySelectorAll('.a5-tab').forEach(x=>x.classList.remove('on'));tab.classList.add('on')}));
};

/* ════════════════════════════════════════════════════════════════════
   AFD-6 · CAPSULE ARCADE
   Toybox move: queries are physical turns of a capsule machine. Results
   dispense into a chute; pile navigation is a bank of labeled hoppers.
   ════════════════════════════════════════════════════════════════════ */
SPECS['AFD-6'] = (mount) => {
  css('AFD-6', `
  @import url('https://fonts.googleapis.com/css2?family=Bagel+Fat+One&family=Nunito:wght@600;700;900&display=swap');
  .afd6{--sky:#8bddff;--cab:#fff8e7;--ink:#18204a;--mut:#65709a;--red:#f34262;--blue:#376dff;--yel:#ffdc2e;--green:#30bf7a;--pink:#ff82c8;--orange:#ff914d;--well:#dce9ff;--outline:3px solid var(--ink);--drop:0 7px 0 var(--ink);--drop2:0 11px 0 var(--ink);--display:'Bagel Fat One',cursive;--body:'Nunito',sans-serif;--mono:'Space Mono',monospace;min-height:100dvh;background:radial-gradient(rgba(24,32,74,.13) 1.5px,transparent 2px) 0 0/22px 22px,var(--sky);color:var(--ink);font-family:var(--body);overflow-x:clip}
  .afd6.theme-dark{--sky:#171c43;--cab:#272d5d;--ink:#fff3d4;--mut:#bdc5e3;--red:#ff6680;--blue:#6f92ff;--yel:#ffe25b;--green:#52dda0;--pink:#ff9ed5;--orange:#ffab73;--well:#202653;--outline:3px solid var(--ink);--drop:0 7px 0 #080b22;--drop2:0 11px 0 #080b22}
  .afd6 *{box-sizing:border-box}.afd6 :focus-visible{outline:4px solid var(--yel);outline-offset:3px}.afd6 button,.afd6 input{font:inherit}.afd6 .a6-wrap{width:min(1160px,100%);margin:auto;padding:0 clamp(14px,4vw,44px)}.afd6 .a6-mast{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;padding:13px clamp(14px,4vw,44px);background:var(--cab);border-bottom:var(--outline)}.afd6 .a6-logo{font-family:var(--display);font-size:29px;color:var(--red);-webkit-text-stroke:1px var(--ink)}.afd6 nav{display:flex;gap:8px;flex-wrap:wrap}.afd6 nav a{color:var(--ink);text-decoration:none;border:2px solid var(--ink);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:900;background:var(--cab)}
  .afd6 .a6-hero{padding-top:42px;display:grid;grid-template-columns:1fr 390px;gap:38px;align-items:center}.afd6 h1{font-family:var(--display);font-size:clamp(43px,7vw,86px);line-height:.95;margin:12px 0;color:var(--red);-webkit-text-stroke:2px var(--ink);text-shadow:4px 4px 0 var(--yel)}.afd6 .a6-lede{font-size:18px;font-weight:800;max-width:48ch}.afd6 .a6-kicker{font-family:var(--mono);font-size:10px;text-transform:uppercase}.afd6 .a6-sec{margin:58px 0 20px;display:flex;align-items:center;gap:12px}.afd6 .a6-sec b{font-family:var(--display);font-size:18px;background:var(--red);color:#fff;border:2px solid var(--ink);border-radius:999px;padding:5px 13px}.afd6 .a6-sec span{font-family:var(--mono);font-size:10px;color:var(--mut)}.afd6 .a6-row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}
  .afd6 .a6-machine{border:var(--outline);border-radius:42px 42px 20px 20px;background:var(--cab);box-shadow:var(--drop2);padding:18px}.afd6 .a6-globe{position:relative;min-height:270px;border:var(--outline);border-radius:45% 45% 34% 34%;background:var(--well);overflow:hidden}.afd6 .a6-caps{position:absolute;inset:18px;display:flex;flex-wrap:wrap;align-content:center;justify-content:center;gap:8px}.afd6 .a6-caps i{width:54px;height:54px;border:3px solid var(--ink);border-radius:50%;background:linear-gradient(var(--pink) 50%,var(--cab) 50%)}.afd6 .a6-caps i:nth-child(2n){background:linear-gradient(var(--yel) 50%,var(--cab) 50%)}.afd6 .a6-caps i:nth-child(3n){background:linear-gradient(var(--blue) 50%,var(--cab) 50%)}.afd6 .a6-controls{display:flex;align-items:center;gap:12px;padding-top:16px}.afd6 .a6-query{flex:1;min-width:0;border:var(--outline);border-radius:14px;background:var(--well);padding:10px 12px}.afd6 input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font-weight:900}.afd6 .a6-crank{width:66px;height:66px;border:var(--outline);border-radius:50%;background:var(--yel);color:#18204a;font-family:var(--display);box-shadow:0 5px 0 var(--ink);transition:transform 220ms cubic-bezier(.34,1.56,.64,1)}.afd6 .a6-crank:active{transform:translateY(4px) rotate(45deg);box-shadow:0 1px 0 var(--ink)}.afd6 .a6-chute{margin:16px auto 0;width:60%;min-height:48px;border:var(--outline);border-radius:10px 10px 20px 20px;background:var(--ink);color:var(--cab);display:grid;place-items:center;font-family:var(--mono);font-size:10px}
  .afd6 .a6-btn{min-height:46px;border:var(--outline);border-radius:16px;background:var(--cab);color:var(--ink);padding:9px 18px;font-weight:900;box-shadow:var(--drop);transition:transform 140ms,box-shadow 140ms}.afd6 .a6-btn:hover{transform:translateY(-2px)}.afd6 .a6-btn:active{transform:translateY(6px) scale(.97,.93);box-shadow:0 1px 0 var(--ink)}.afd6 .a6-btn.primary{background:var(--yel);color:#18204a}.afd6 .a6-btn.secondary{background:var(--pink);color:#18204a}.afd6 .a6-btn.compact{min-height:36px;padding:5px 11px;font-size:12px;box-shadow:0 3px 0 var(--ink)}.afd6 .a6-btn.icon{width:46px;padding:0}
  .afd6 .a6-states,.afd6 .a6-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px}.afd6 .a6-cell{position:relative;min-width:0;border:var(--outline);border-radius:24px;background:var(--cab);box-shadow:var(--drop);overflow:hidden;transition:transform 160ms cubic-bezier(.34,1.56,.64,1)}.afd6 .a6-cell:hover{transform:translateY(-4px) rotate(.5deg)}.afd6 .a6-rail,.afd6 .a6-cap{display:flex;justify-content:space-between;gap:8px;padding:7px 11px}.afd6 .a6-rail{background:var(--pink);color:#18204a;border-bottom:var(--outline);font-family:var(--mono);font-size:8px}.afd6 .a6-cap{border-top:2px solid var(--ink);font-size:12px;font-weight:800}.afd6 .a6-cap b{font-family:var(--mono)}.afd6 .a6-art{position:relative;display:grid;place-items:center;overflow:hidden;background:var(--well);margin:9px;border:2px solid var(--ink);border-radius:16px}.afd6 .meme-media{width:100%;height:100%;object-fit:contain}.afd6 .a6-state{position:absolute;left:7px;bottom:7px;border:2px solid var(--ink);border-radius:999px;background:var(--cab);padding:3px 7px;font-family:var(--mono);font-size:8px}.afd6 .a6-banger{position:absolute;right:7px;top:39px;width:62px;height:62px;display:grid;place-items:center;text-align:center;clip-path:polygon(50% 0,61% 27%,85% 15%,73% 39%,100% 50%,73% 61%,85% 85%,61% 73%,50% 100%,39% 73%,15% 85%,27% 61%,0 50%,27% 39%,15% 15%,39% 27%);background:var(--yel);color:#18204a;font-family:var(--display);font-size:9px}.afd6 .a6-cell.match{box-shadow:0 0 0 5px var(--green),var(--drop)}.afd6 .a6-cell.near{outline:4px dashed var(--orange);outline-offset:3px}.afd6 .a6-cell.dim{opacity:.45;filter:saturate(.2)}.afd6 .a6-cell.selected{transform:translateY(-8px);box-shadow:0 12px 0 var(--blue)}.afd6 .a6-cell.loading .a6-art::after{content:'capsule tumbling';position:absolute;inset:0;display:grid;place-items:center;background:rgba(220,233,255,.86);color:#18204a;font-family:var(--mono);font-size:9px}.afd6 .a6-cell.error{border-color:var(--red);box-shadow:0 7px 0 var(--red)}
  .afd6 .a6-found{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}.afd6 .a6-shape{min-height:100px;border:var(--outline);background:var(--cab);border-radius:18px;display:grid;place-items:center;text-align:center;padding:9px;font-family:var(--mono);font-size:9px}.afd6 .a6-type{display:grid;grid-template-columns:1.2fr 1fr;gap:24px}.afd6 .a6-display{font-family:var(--display);font-size:48px;line-height:1;color:var(--red);-webkit-text-stroke:1px var(--ink)}.afd6 .a6-label,.afd6 .a6-meta,.afd6 .a6-num{font-family:var(--mono)}.afd6 .a6-label{font-size:11px}.afd6 .a6-meta{font-size:9px;color:var(--mut)}.afd6 .a6-num{font-size:28px;font-variant-numeric:tabular-nums}.afd6 .a6-caption{max-width:42ch;border:3px dotted var(--pink);border-radius:16px;padding:10px}
  .afd6 .a6-tag{border:2px solid var(--ink);border-radius:999px;background:var(--blue);color:white;padding:6px 11px;font-weight:900;font-size:12px}.afd6 .a6-burst{width:88px;height:88px;display:grid;place-items:center;clip-path:polygon(50% 0,61% 27%,85% 15%,73% 39%,100% 50%,73% 61%,85% 85%,61% 73%,50% 100%,39% 73%,15% 85%,27% 61%,0 50%,27% 39%,15% 15%,39% 27%);background:var(--yel);color:#18204a;font-family:var(--display);font-size:10px;text-align:center}.afd6 .a6-stat{min-width:160px;border:var(--outline);border-radius:18px;background:var(--cab);box-shadow:var(--drop);padding:12px}.afd6 .a6-stat b{display:block;font-family:var(--display);font-size:32px;color:var(--red)}.afd6 .a6-tabs{display:flex;gap:5px;border:var(--outline);border-radius:999px;background:var(--cab);padding:5px}.afd6 .a6-tab{min-height:38px;border:0;border-radius:999px;background:transparent;color:var(--ink);padding:8px 15px;font-weight:900}.afd6 .a6-tab.on{background:var(--ink);color:var(--cab)}.afd6 .a6-toast,.afd6 .a6-empty{border:var(--outline);border-radius:18px;background:var(--green);color:#18204a;padding:15px;font-weight:900;box-shadow:var(--drop)}.afd6 .a6-empty{max-width:390px;background:var(--cab)}.afd6 .a6-status{display:flex;flex-wrap:wrap;background:var(--ink);color:var(--cab)}.afd6 .a6-status span{padding:9px 13px;border-right:1px dotted currentColor;font-family:var(--mono);font-size:9px}.afd6 .a6-status b{opacity:.6;margin-right:7px}.afd6 .a6-status .live::after{content:'●';color:var(--green);margin-left:7px}
  .afd6 .a6-bench{border:var(--outline);border-radius:24px;background:var(--cab);box-shadow:var(--drop2);overflow:hidden}.afd6 .a6-command{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px;border-bottom:var(--outline)}.afd6 .a6-command label{flex:1;min-width:180px;border:var(--outline);border-radius:14px;background:var(--well);padding:9px}.afd6 .a6-benchbody{display:grid;grid-template-columns:220px 1fr;gap:18px;padding:18px;background:var(--well)}.afd6 .a6-piles{display:flex;flex-direction:column;gap:8px}.afd6 .a6-pile{display:flex;justify-content:space-between;gap:8px;min-height:44px;border:2px solid var(--ink);border-radius:999px;background:var(--cab);color:var(--ink);padding:9px 13px;font-size:11px;font-weight:900;text-align:left;box-shadow:0 3px 0 var(--ink)}.afd6 .a6-pile.on{background:var(--yel);color:#18204a}.afd6 .a6-phone{width:min(390px,100%);border:var(--outline);border-radius:32px;background:var(--sky);box-shadow:var(--drop2);overflow:hidden}.afd6 .a6-phone .a6-grid{grid-template-columns:repeat(2,minmax(0,1fr));padding:13px;gap:13px}.afd6 .a6-dock{display:flex;border-top:var(--outline);padding:7px;background:var(--cab);gap:5px}.afd6 .a6-dock button{flex:1;min-height:47px;border:0;border-radius:999px;background:transparent;color:var(--ink);font-size:10px;font-weight:900}.afd6 .a6-dock button.on{background:var(--ink);color:var(--cab)}
  @keyframes a6drop{0%{transform:translateY(-90px) rotate(-80deg);opacity:0}70%{transform:translateY(5px) rotate(8deg);opacity:1}100%{transform:none;opacity:1}}.afd6 .a6-prize.go{animation:a6drop 440ms cubic-bezier(.34,1.56,.64,1)}@keyframes a6mix{to{transform:rotate(12deg)}}.afd6 .a6-machine.mix .a6-caps{animation:a6mix 160ms alternate 2}.afd6 .a6-note{font-family:var(--mono);font-size:9px;color:var(--mut)}
  @media(prefers-reduced-motion:reduce){.afd6 *,.afd6 *::before,.afd6 *::after{animation:none!important;transition:none!important}}
  @media(max-width:700px){.afd6 .a6-hero{grid-template-columns:1fr}.afd6 .a6-machine{max-width:390px}.afd6 .a6-states,.afd6 .a6-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.afd6 .a6-found{grid-template-columns:repeat(2,1fr)}.afd6 .a6-type{grid-template-columns:1fr}.afd6 .a6-benchbody{grid-template-columns:1fr}.afd6 .a6-banger{right:4px}.afd6 .a6-status span{flex:1 1 45%}.afd6 .a6-command label{flex-basis:100%}}
  `);
  const M=MEMES;
  const machine=(compact=false)=>`<div class="a6-machine ${compact?'compact':''}"><div class="a6-globe"><div class="a6-caps">${'<i></i>'.repeat(12)}</div></div><div class="a6-controls"><label class="a6-query"><input aria-label="capsule query" value="cat losing it"></label><button class="a6-crank" aria-label="turn the capsule machine">turn</button></div><div class="a6-chute"><span>prize chute · ready</span></div></div>`;
  mount.innerHTML=`<div class="afd6"><header class="a6-mast"><span class="a6-logo">sploot capsule club</span><nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav></header><main>
    <section class="a6-wrap a6-hero"><div><span class="a6-kicker">one thought · one turn · one suspiciously exact meme</span><h1>turn words into pictures.</h1><p class="a6-lede">type words. get the picture. the machine digs through your private pile and drops the closest match into the chute.</p></div>${machine()}</section>
    <section class="a6-wrap"><div class="a6-sec"><b>foundations</b><span>cabinet shell, capsule wells, arcade depth</span></div></section>${swatches([['sky','#8bddff'],['cabinet','#fff8e7'],['ink','#18204a','#fff'],['prize red','#f34262','#fff'],['lever blue','#376dff','#fff'],['coin yellow','#ffdc2e'],['live green','#30bf7a'],['gum pink','#ff82c8']])}<section class="a6-wrap" style="padding-top:22px"><div class="a6-found"><div class="a6-shape">3px cabinet shell</div><div class="a6-shape" style="border-radius:50%">capsule circle</div><div class="a6-shape" style="box-shadow:var(--drop)">7px shelf drop</div><div class="a6-shape" style="box-shadow:var(--drop2)">11px machine drop</div><div class="a6-shape" style="border-radius:999px">hopper control</div></div><p class="a6-note">spacing runs 8 / 16 / 24 / 40 · elevation is cabinet depth and disappears on press · circles are reserved for capsules and cranks</p></section>
    <section class="a6-wrap"><div class="a6-sec"><b>type specimen</b><span>capsule lettering / soft utility / hard telemetry</span></div><div class="a6-type"><div><div class="a6-display">PRIZE INSIDE</div><p>body · nunito 700 keeps the cabinet friendly without turning every sentence into candy.</p><p class="a6-caption">long caption wrap: me turning the machine for the meme that says the spreadsheet cell broke me without saying any of that.</p></div><div><p class="a6-label">LABEL · SPACE MONO</p><p class="a6-meta">metadata · vec 0413 · siglip-base · 768d</p><p class="a6-num">1,482 · 0.94 · 212ms</p></div></div></section>
    <section class="a6-wrap"><div class="a6-sec"><b>component sheet</b><span>every action belongs to the cabinet</span></div><div style="display:flex;flex-direction:column;gap:30px">${machine(true)}${afdR2States('a6',M)}<div class="a6-row"><button class="a6-btn primary">upload chaos</button><button class="a6-btn">shuffle the pile</button><button class="a6-btn secondary">bangers</button><button class="a6-btn compact">compact</button><button class="a6-btn icon" aria-label="close">×</button><span class="a6-tag">automatic pile</span><span class="a6-burst">banger</span></div><div class="a6-row"><div class="a6-tabs"><button class="a6-tab on">all</button><button class="a6-tab">bangers</button><button class="a6-tab">recent</button></div><div class="a6-toast">saved to the pile · capsule queued</div></div><div class="a6-row"><div class="a6-stat"><span>memes indexed</span><b>1,482</b></div><div class="a6-stat"><span>bangers</span><b>37</b></div><div class="a6-stat"><span>folders required</span><b>0</b></div></div>${afdR2Status('a6','tumbling')}<div class="a6-empty"><strong>the machine is empty</strong><p>zero thoughts in the globe. upload chaos and give the crank something to dispense.</p><button class="a6-btn primary">upload chaos</button></div></div></section>
    <section class="a6-wrap"><div class="a6-sec"><b>motion</b><span>turn, tumble, dispense</span></div><div class="a6-row"><button class="a6-btn primary a6-turn-demo">turn the crank</button><div class="a6-prize" style="width:170px">${afdR2Cell('a6',M[0],'match',0)}</div><button class="a6-btn a6-mix-demo">mix the globe</button></div><p class="a6-note">prefers-reduced-motion: the result appears in the chute without tumbling, rotation, or bounce.</p></section>
    <section class="a6-wrap"><div class="a6-sec"><b>compositions</b><span>hopper workbench and pocket machine</span></div><div class="a6-bench"><div class="a6-command"><span class="a6-logo" style="font-size:16px">sploot</span><label><input aria-label="workbench search" value="search the pile"></label><button class="a6-btn compact">upload</button><button class="a6-btn compact">bangers</button><button class="a6-btn compact">shuffle</button></div><div class="a6-benchbody">${afdR2Piles('a6')}<div class="a6-grid">${M.slice(0,8).map((m,i)=>afdR2Cell('a6',m,i===0?'match':'',i)).join('')}</div></div>${afdR2Status('a6','tumbling')}</div></section>
    <section class="a6-wrap" style="padding-block:28px 54px"><div class="a6-phone"><div class="a6-command"><span class="a6-logo" style="font-size:15px">sploot</span><span class="a6-meta">${LIB.total.toLocaleString()} prizes</span><label><input aria-label="phone search" value="cat losing it"></label></div><div class="a6-grid">${M.slice(0,4).map((m,i)=>afdR2Cell('a6',m,i===0?'match':'',i)).join('')}</div><div class="a6-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div></div></section>
    </main>${labSpec([['system','capsule arcade · semantic prize machine'],['type','bagel fat one / nunito / space mono'],['move','each query is a physical crank turn that dispenses one result from labeled hoppers'],['density','chunky cabinet with packed wells'],['motion','turn, tumble, dispense on request']])}</div>`;
  const root=mount.querySelector('.afd6');themeToggle(root);
  const dispense=btn=>{const scope=btn.closest('.a6-machine');scope.classList.remove('mix');void scope.offsetWidth;scope.classList.add('mix');scope.querySelector('.a6-chute span').textContent='prize chute · closest match 0.94'};
  root.querySelectorAll('.a6-crank').forEach(btn=>btn.addEventListener('click',()=>dispense(btn)));
  root.querySelector('.a6-turn-demo').addEventListener('click',()=>{const prize=root.querySelector('.a6-prize');prize.classList.remove('go');void prize.offsetWidth;prize.classList.add('go')});
  root.querySelector('.a6-mix-demo').addEventListener('click',()=>{const machine=root.querySelector('.a6-machine');machine.classList.remove('mix');void machine.offsetWidth;machine.classList.add('mix')});
  root.querySelectorAll('.a6-tab').forEach(tab=>tab.addEventListener('click',()=>{root.querySelectorAll('.a6-tab').forEach(x=>x.classList.remove('on'));tab.classList.add('on')}));
};

/* ════════════════════════════════════════════════════════════════════
   AFD-7 · PEEL FILE
   Fourth move: the library is a bound sticker album. Piles are tabbed
   spreads, and selection physically peels a sticker onto a tray.
   ════════════════════════════════════════════════════════════════════ */
SPECS['AFD-7'] = (mount) => {
  css('AFD-7', `
  .afd7{--desk:#efb454;--page:#fff5d9;--page2:#f5e6bd;--ink:#30213d;--mut:#75647d;--blue:#207ab7;--pink:#ee4d91;--green:#2d9b69;--red:#d94335;--yel:#ffd529;--tape:rgba(76,184,191,.35);--line:2px solid var(--ink);--book:0 8px 0 #8f5d2c,0 11px 0 var(--ink);--sticker:0 0 0 5px var(--page),0 0 0 7px var(--ink);--display:'Shrikhand',cursive;--body:'Bricolage Grotesque',sans-serif;--mono:'Space Mono',monospace;min-height:100dvh;background:linear-gradient(90deg,rgba(48,33,61,.08) 1px,transparent 1px) 0 0/32px 32px,var(--desk);color:var(--ink);font-family:var(--body);overflow-x:clip}
  .afd7.theme-dark{--desk:#17152a;--page:#2d2742;--page2:#39314f;--ink:#fff0c8;--mut:#c3b5cf;--blue:#4aaee8;--pink:#ff70ad;--green:#52d094;--red:#ff6e5d;--yel:#ffe15a;--tape:rgba(76,184,191,.25);--line:2px solid var(--ink);--book:0 8px 0 #090815,0 11px 0 var(--ink);--sticker:0 0 0 5px var(--page),0 0 0 7px var(--ink)}
  .afd7 *{box-sizing:border-box}.afd7 :focus-visible{outline:4px dotted var(--blue);outline-offset:4px}.afd7 button,.afd7 input{font:inherit}.afd7 .a7-wrap{width:min(1180px,100%);margin:auto;padding:0 clamp(14px,4vw,44px)}.afd7 .a7-mast{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:13px clamp(14px,4vw,44px);background:var(--page);border-bottom:var(--line)}.afd7 .a7-logo{font-family:var(--display);font-size:30px;text-shadow:2px 2px var(--pink)}.afd7 nav{display:flex;gap:14px;flex-wrap:wrap}.afd7 nav a{color:var(--ink);text-decoration:none;font-family:var(--mono);font-size:10px;border-bottom:2px dotted var(--ink)}
  .afd7 .a7-hero{padding-top:46px}.afd7 .a7-cover{position:relative;border:3px solid var(--ink);border-radius:12px 28px 28px 12px;background:var(--page);box-shadow:var(--book);padding:clamp(26px,6vw,66px);min-height:470px;overflow:hidden}.afd7 .a7-cover::before{content:'';position:absolute;left:22px;top:0;bottom:0;border-left:5px double var(--ink)}.afd7 h1{font-family:var(--display);font-size:clamp(48px,8vw,92px);line-height:.95;max-width:10ch;margin:18px 0;color:var(--pink);text-shadow:3px 3px 0 var(--blue)}.afd7 .a7-kicker{font-family:var(--mono);font-size:10px;text-transform:uppercase}.afd7 .a7-lede{font-size:18px;max-width:50ch}.afd7 .a7-cover .a7-sticker{position:absolute;right:7%;top:13%;transform:rotate(8deg);width:180px}.afd7 .a7-sec{margin:58px 0 20px;display:flex;justify-content:space-between;gap:12px;border-bottom:4px double var(--ink);padding-bottom:8px;font-family:var(--mono);font-size:10px;text-transform:uppercase}.afd7 .a7-row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}
  .afd7 .a7-book{position:relative;border:3px solid var(--ink);border-radius:12px 24px 24px 12px;background:var(--page);box-shadow:var(--book);padding:22px}.afd7 .a7-book::before{content:'';position:absolute;left:50%;top:0;bottom:0;width:18px;transform:translateX(-50%);background:linear-gradient(90deg,rgba(48,33,61,.12),transparent,rgba(48,33,61,.12));pointer-events:none}.afd7 .a7-spread{display:grid;grid-template-columns:1fr 1fr;gap:38px}.afd7 .a7-page{min-width:0}.afd7 .a7-pagehead{display:flex;justify-content:space-between;gap:8px;border-bottom:var(--line);padding:0 0 8px;margin-bottom:14px;font-family:var(--mono);font-size:9px}.afd7 .a7-console{border:var(--line);background:var(--page2);padding:12px;transform:rotate(-.5deg)}.afd7 .a7-console label{display:flex;gap:8px;align-items:center;border-bottom:2px solid var(--ink);padding:9px;background:var(--page)}.afd7 input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font-family:var(--mono)}
  .afd7 .a7-btn{min-height:44px;border:var(--line);border-radius:8px;background:var(--page);color:var(--ink);padding:9px 17px;font-weight:800;box-shadow:3px 3px 0 var(--blue);transition:transform 140ms}.afd7 .a7-btn:hover{transform:rotate(-1deg) translateY(-2px)}.afd7 .a7-btn:active{transform:translate(3px,3px);box-shadow:none}.afd7 .a7-btn.primary{background:var(--pink);color:white}.afd7 .a7-btn.compact{min-height:35px;padding:5px 10px;font-family:var(--mono);font-size:10px}.afd7 .a7-btn.icon{width:44px;padding:0}
  .afd7 .a7-states,.afd7 .a7-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}.afd7 .a7-cell{position:relative;min-width:0;background:var(--page);box-shadow:var(--sticker);margin:8px;transform:rotate(-.6deg);transition:transform 180ms cubic-bezier(.2,.9,.2,1)}.afd7 .a7-cell:nth-child(2n){transform:rotate(.7deg)}.afd7 .a7-cell:hover{transform:rotate(0) translateY(-5px)}.afd7 .a7-rail,.afd7 .a7-cap{display:flex;justify-content:space-between;gap:8px;padding:6px 8px}.afd7 .a7-rail{font-family:var(--mono);font-size:8px;border-bottom:1px dashed var(--ink)}.afd7 .a7-cap{font-size:11px}.afd7 .a7-cap b{font-family:var(--mono)}.afd7 .a7-art{position:relative;display:grid;place-items:center;overflow:hidden;background:var(--page2)}.afd7 .meme-media{width:100%;height:100%;object-fit:contain}.afd7 .a7-state{position:absolute;left:6px;bottom:6px;background:var(--yel);color:#30213d;border:1px solid var(--ink);padding:2px 6px;font-family:var(--mono);font-size:8px}.afd7 .a7-banger{position:absolute;right:-8px;top:30px;border:2px solid var(--ink);border-radius:50%;background:var(--pink);color:#fff;width:56px;height:56px;display:grid;place-items:center;font-family:var(--display);font-size:10px;transform:rotate(12deg)}.afd7 .a7-cell.match{box-shadow:0 0 0 5px var(--page),0 0 0 8px var(--green)}.afd7 .a7-cell.near{box-shadow:0 0 0 5px var(--page),0 0 0 8px var(--blue)}.afd7 .a7-cell.dim{opacity:.4;filter:grayscale(.8)}.afd7 .a7-cell.selected{transform:rotate(-3deg) translateY(-10px);box-shadow:0 0 0 5px var(--page),0 0 0 8px var(--pink),10px 12px 0 rgba(48,33,61,.2)}.afd7 .a7-cell.loading .a7-art::after{content:'printing sticker';position:absolute;inset:0;display:grid;place-items:center;background:var(--tape);font-family:var(--mono);font-size:9px}.afd7 .a7-cell.error{box-shadow:0 0 0 5px var(--page),0 0 0 8px var(--red)}
  .afd7 .a7-found{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}.afd7 .a7-shape{min-height:96px;border:var(--line);background:var(--page);display:grid;place-items:center;text-align:center;padding:9px;font-family:var(--mono);font-size:9px}.afd7 .a7-type{display:grid;grid-template-columns:1.2fr 1fr;gap:24px}.afd7 .a7-display{font-family:var(--display);font-size:48px;line-height:1;color:var(--pink)}.afd7 .a7-label,.afd7 .a7-meta,.afd7 .a7-num{font-family:var(--mono)}.afd7 .a7-label{font-size:11px}.afd7 .a7-meta{font-size:9px;color:var(--mut)}.afd7 .a7-num{font-size:28px;font-variant-numeric:tabular-nums}.afd7 .a7-caption{max-width:43ch;background:linear-gradient(transparent 70%,var(--tape) 70%)}
  .afd7 .a7-tag{border:2px dashed var(--ink);background:var(--page);padding:6px 10px;font-family:var(--mono);font-size:10px;transform:rotate(-2deg)}.afd7 .a7-round{width:80px;height:80px;border:3px solid var(--ink);border-radius:50%;background:var(--yel);color:#30213d;display:grid;place-items:center;text-align:center;font-family:var(--display);font-size:11px}.afd7 .a7-stat{min-width:160px;border:var(--line);background:var(--page);padding:12px;box-shadow:4px 4px 0 var(--blue)}.afd7 .a7-stat b{display:block;font-family:var(--display);font-size:34px}.afd7 .a7-tabs{display:flex;gap:0}.afd7 .a7-tab{min-height:44px;border:var(--line);border-radius:9px 9px 0 0;margin-right:-2px;background:var(--page2);color:var(--ink);padding:8px 15px;font-family:var(--mono);font-size:10px}.afd7 .a7-tab.on{background:var(--yel);color:#30213d;transform:translateY(-5px)}.afd7 .a7-toast,.afd7 .a7-empty{border:var(--line);background:var(--page);padding:15px;box-shadow:4px 4px 0 var(--pink)}.afd7 .a7-empty{max-width:390px}.afd7 .a7-status{display:flex;flex-wrap:wrap;background:var(--ink);color:var(--page)}.afd7 .a7-status span{padding:9px 12px;border-right:1px dashed currentColor;font-family:var(--mono);font-size:9px}.afd7 .a7-status b{opacity:.6;margin-right:7px}.afd7 .a7-status .live::after{content:'●';color:var(--green);margin-left:7px}
  .afd7 .a7-bench{border:3px solid var(--ink);border-radius:12px 24px 24px 12px;background:var(--page);box-shadow:var(--book);overflow:hidden}.afd7 .a7-command{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px;border-bottom:var(--line)}.afd7 .a7-command label{flex:1;min-width:180px;border-bottom:2px solid var(--ink);padding:8px}.afd7 .a7-benchbody{display:grid;grid-template-columns:220px 1fr;gap:24px;padding:20px}.afd7 .a7-piles{display:flex;flex-direction:column;gap:6px}.afd7 .a7-pile{display:flex;justify-content:space-between;gap:8px;min-height:44px;border:var(--line);border-radius:0 14px 14px 0;background:var(--page2);color:var(--ink);padding:9px 12px;font-size:11px;text-align:left}.afd7 .a7-pile.on{background:var(--pink);color:white;transform:translateX(6px)}.afd7 .a7-phone{width:min(390px,100%);border:3px solid var(--ink);border-radius:22px;background:var(--page);box-shadow:var(--book);overflow:hidden}.afd7 .a7-phone .a7-grid{grid-template-columns:repeat(2,minmax(0,1fr));padding:12px;gap:12px}.afd7 .a7-dock{display:flex;border-top:var(--line);background:var(--page2)}.afd7 .a7-dock button{flex:1;min-height:50px;border:0;border-right:1px solid var(--ink);background:transparent;color:var(--ink);font-family:var(--mono);font-size:9px}.afd7 .a7-dock button.on{background:var(--yel);color:#30213d}
  @keyframes a7peel{0%{transform:rotate(0) translateY(0) scale(1)}45%{transform:rotate(-8deg) translateY(-22px) scale(1.05)}100%{transform:rotate(2deg) translateY(0) scale(1)}}.afd7 .a7-peel.go{animation:a7peel 420ms cubic-bezier(.2,.9,.2,1)}.afd7 .a7-tape.go{transform:rotate(3deg) scale(1.08);background:var(--tape);transition:transform 180ms}.afd7 .a7-note{font-family:var(--mono);font-size:9px;color:var(--mut)}
  @media(prefers-reduced-motion:reduce){.afd7 *,.afd7 *::before,.afd7 *::after{animation:none!important;transition:none!important}}
  @media(max-width:700px){.afd7 .a7-cover{min-height:520px;padding:24px 20px 220px 42px}.afd7 .a7-cover .a7-sticker{top:auto;bottom:28px;right:50%;transform:translateX(50%) rotate(5deg)}.afd7 .a7-spread{grid-template-columns:1fr;gap:28px}.afd7 .a7-book::before{display:none}.afd7 .a7-states,.afd7 .a7-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.afd7 .a7-found{grid-template-columns:repeat(2,1fr)}.afd7 .a7-type{grid-template-columns:1fr}.afd7 .a7-benchbody{grid-template-columns:1fr}.afd7 .a7-banger{right:2px}.afd7 .a7-status span{flex:1 1 45%}.afd7 .a7-command label{flex-basis:100%}}
  `);
  const M=MEMES;
  mount.innerHTML=`<div class="afd7"><header class="a7-mast"><span class="a7-logo">sploot peel file</span><nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav></header><main>
    <section class="a7-wrap a7-hero"><div class="a7-cover"><span class="a7-kicker">private sticker album · meaning does the filing</span><h1>type words. get the picture.</h1><p class="a7-lede">your memes collect themselves into automatic spreads. no folders. just vibes.</p><div class="a7-sticker">${afdR2Cell('a7',M[0],'match',0)}</div></div></section>
    <section class="a7-wrap"><div class="a7-sec"><b>foundations</b><span>album stock, peel edge, taped annotation</span></div></section>${swatches([['desk','#efb454'],['album page','#fff5d9'],['page shadow','#f5e6bd'],['ink','#30213d','#fff'],['tab blue','#207ab7','#fff'],['sticker pink','#ee4d91','#fff'],['match green','#2d9b69','#fff'],['coin yellow','#ffd529']])}<section class="a7-wrap" style="padding-top:22px"><div class="a7-found"><div class="a7-shape">2px album rule</div><div class="a7-shape" style="box-shadow:var(--sticker)">die-cut sticker rim</div><div class="a7-shape" style="box-shadow:var(--book)">bound book depth</div><div class="a7-shape" style="background:var(--tape)">tape note</div><div class="a7-shape" style="border-radius:50%">round verdict sticker</div></div><p class="a7-note">spacing runs 8 / 16 / 24 / 48 · elevation means peelability · the center gutter always separates browse from action</p></section>
    <section class="a7-wrap"><div class="a7-sec"><b>type specimen</b><span>collector display / readable notes / catalog data</span></div><div class="a7-type"><div><div class="a7-display">the extremely specific pile</div><p>body · bricolage grotesque reads like a good album note instead of a product brochure.</p><p class="a7-caption">long caption wrap: me explaining why this exact cat belongs beside the screenshot that broke the group chat at 2:47am.</p></div><div><p class="a7-label">LABEL · SPACE MONO</p><p class="a7-meta">metadata · vec 0413 · siglip-base · 768d</p><p class="a7-num">1,482 · 0.94 · 212ms</p></div></div></section>
    <section class="a7-wrap"><div class="a7-sec"><b>component sheet</b><span>controls live on the left, collectible matter on the right</span></div><div class="a7-book"><div class="a7-spread"><div class="a7-page"><div class="a7-pagehead"><span>search console</span><span>left page</span></div><div class="a7-console"><label><span>find:</span><input aria-label="search the album" value="sad frog"></label><div class="a7-row" style="margin-top:12px"><button class="a7-btn primary">find it</button><button class="a7-btn">shuffle the pile</button></div><p class="a7-meta">${LIB.model} · ${LIB.dim}d · ${LIB.latency}ms</p></div><div class="a7-row" style="margin-top:20px"><button class="a7-btn primary">upload chaos</button><button class="a7-btn compact">compact</button><button class="a7-btn icon" aria-label="close">×</button><span class="a7-tag">automatic pile</span><span class="a7-round">banger</span></div></div><div class="a7-page"><div class="a7-pagehead"><span>state stickers</span><span>right page</span></div><div class="a7-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">${M.slice(0,4).map((m,i)=>afdR2Cell('a7',m,['match','near','dim','selected'][i],i)).join('')}</div></div></div></div><div style="display:flex;flex-direction:column;gap:28px;margin-top:34px">${afdR2States('a7',M)}<div class="a7-row"><div class="a7-tabs"><button class="a7-tab on">all</button><button class="a7-tab">bangers</button><button class="a7-tab">recent</button></div><div class="a7-toast">saved to the pile · sticker printed</div></div><div class="a7-row"><div class="a7-stat"><span>memes indexed</span><b>1,482</b></div><div class="a7-stat"><span>bangers</span><b>37</b></div><div class="a7-stat"><span>folders required</span><b>0</b></div></div>${afdR2Status('a7','printing')}<div class="a7-empty"><strong>blank spread</strong><p>zero thoughts on these pages. upload chaos and start the peel file.</p><button class="a7-btn primary">upload chaos</button></div></div></section>
    <section class="a7-wrap"><div class="a7-sec"><b>motion</b><span>peel and place, one deliberate gesture</span></div><div class="a7-row"><button class="a7-btn primary a7-peel-btn">peel selected sticker</button><div class="a7-peel" style="width:170px">${afdR2Cell('a7',M[1],'selected',1)}</div><button class="a7-btn a7-tape-btn">tape the note</button><span class="a7-tag a7-tape">closest match · 0.94</span></div><p class="a7-note">prefers-reduced-motion: peel and tape states switch instantly with no lift, rotation, or travel.</p></section>
    <section class="a7-wrap"><div class="a7-sec"><b>compositions</b><span>open desktop album and pocket flipbook</span></div><div class="a7-bench"><div class="a7-command"><span class="a7-logo" style="font-size:16px">sploot</span><label><input aria-label="workbench search" value="search the pile"></label><button class="a7-btn compact">upload</button><button class="a7-btn compact">bangers</button><button class="a7-btn compact">shuffle</button></div><div class="a7-benchbody">${afdR2Piles('a7')}<div class="a7-grid">${M.slice(0,8).map((m,i)=>afdR2Cell('a7',m,i===0?'match':'',i)).join('')}</div></div>${afdR2Status('a7','printing')}</div></section>
    <section class="a7-wrap" style="padding-block:28px 54px"><div class="a7-phone"><div class="a7-command"><span class="a7-logo" style="font-size:15px">sploot</span><span class="a7-meta">spread 001</span><label><input aria-label="phone search" value="cat losing it"></label></div><div class="a7-grid">${M.slice(0,4).map((m,i)=>afdR2Cell('a7',m,i===0?'match':'',i)).join('')}</div><div class="a7-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div></div></section>
    </main>${labSpec([['system','peel file · bound sticker album'],['type','shrikhand / bricolage grotesque / space mono'],['move','piles are bound spreads and selection peels a sticker onto a collection tray'],['density','layered album, disciplined gutter'],['motion','single peel-and-place gesture']])}</div>`;
  const root=mount.querySelector('.afd7');themeToggle(root);
  root.querySelector('.a7-peel-btn').addEventListener('click',()=>{const x=root.querySelector('.a7-peel');x.classList.remove('go');void x.offsetWidth;x.classList.add('go')});
  root.querySelector('.a7-tape-btn').addEventListener('click',()=>root.querySelector('.a7-tape').classList.toggle('go'));
  root.querySelectorAll('.a7-tab').forEach(tab=>tab.addEventListener('click',()=>{root.querySelectorAll('.a7-tab').forEach(x=>x.classList.remove('on'));tab.classList.add('on')}));
  root.querySelectorAll('.a7-pile').forEach(pile=>pile.addEventListener('click',()=>{root.querySelectorAll('.a7-pile').forEach(x=>x.classList.remove('on'));pile.classList.add('on')}));
};

})();

(() => {
/* ROUND 3 · AFD-3 toybox refinements. The shared structure is intentional:
   each specimen changes one compact-control grammar while preserving the
   same product, density, and physical laws for direct comparison. */
const AFD3R_STAR='polygon(50% 0,60% 29%,82% 9%,75% 36%,100% 32%,79% 50%,100% 68%,75% 64%,82% 91%,60% 71%,50% 100%,40% 71%,18% 91%,25% 64%,0 68%,21% 50%,0 32%,25% 36%,18% 9%,40% 29%)';
const icons={
  heart:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>`,
  share:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>`,
  trash:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/></svg>`,
  sun:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  search:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/></svg>`,
  upload:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7"/></svg>`,
  pile:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v5H4zM4 14h16v5H4z"/></svg>`
};
function iconButton(icon,label,extra=''){return `<button type="button" class="ctl ${extra}" aria-label="${label}">${icons[icon]}<span class="sr">${label}</span></button>`}
function rail(banger=true,extra=''){return `<div class="action-rail" aria-label="meme actions">${iconButton('heart',banger?'remove banger':'mark as banger',`${banger?'hearted':''} ${extra}`)}${iconButton('share','share meme',extra)}${iconButton('trash','delete meme',extra)}</div>`}
function card(m,state='',i=0,actual=false){return `<article class="toy-card ${state} ${actual?'actual':''}"><div class="card-tab c${i%6}"><span>${esc(m.file)}</span><span>vec ${m.vec}</span></div><div class="media" style="aspect-ratio:${m.aspect}">${memeImg(m)}${state?`<span class="state">${state}</span>`:''}</div>${state==='loading'?'<div class="loader"><i></i><i></i><i></i> cooking</div>':''}${state==='error'?'<div class="error-copy">this one borked. retry it.</div>':''}<div class="caption"><span>${esc(m.cap)}</span><b>${(m.score/100).toFixed(2)}</b></div>${rail(!!m.banger)}</article>`}
function searchConsole(){return `<div class="console"><div class="console-top"><b>meme finder 3000</b><span>${LIB.model} · ${LIB.latency}ms</span></div><div class="console-body"><label><span>find:</span><input value="cat losing it" aria-label="search the pile"></label><button class="btn primary">find it</button></div><div class="machine"><span>index ${LIB.total.toLocaleString()}</span><span>dim ${LIB.dim}</span><span>queue ${LIB.queued}</span><span>machine <i></i> live</span></div></div>`}
function piles(){return `<div class="piles">${PILES.slice(0,5).map((p,i)=>`<button class="pile ${i===0?'on':''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}</div>`}
function section(title,note){return `<div class="section-head"><b>${title}</b><span>${note}</span></div>`}
function controlsGallery(M){return `<section class="wrap controls-gallery">${section('compact controls at real scale','one grammar, every density, no media overlays')}<div class="control-intro"><div><span class="micro-label">masthead theme control</span>${iconButton('sun','switch theme','mast-control')}</div><div class="desktop-density"><span class="micro-label">desktop compact</span>${iconButton('search','search')}${iconButton('upload','upload')}${iconButton('heart','banger','hearted')}</div><div class="mobile-density"><span class="micro-label">mobile 44px</span>${iconButton('pile','open pile','mobile')}${iconButton('search','search','mobile')}${iconButton('upload','upload','mobile')}</div></div><div class="rail-study"><div><span class="micro-label">actual grid size · 240px</span>${card(M[0],'',0,true)}</div><div class="zoom"><span class="micro-label">2× rail anatomy</span><div class="zoom-rail">${iconButton('heart','default','demo-default')}${iconButton('share','hover','demo-hover')}${iconButton('trash','active','demo-active')}${iconButton('heart','focus visible','demo-focus')}${iconButton('share','disabled','demo-disabled')}</div><div class="state-key"><span>default</span><span>hover</span><span>active</span><span>focus-visible</span><span>disabled</span></div><p>heart is the only banger mark. filled means banger. outline means not. the rail owns space below the caption and never covers the meme.</p></div></div></section>`}
function baseCss(n,grammar){const p=`.afd${n}`;return `
${p}{--bg:#cfe7ff;--panel:#fff;--panel2:#f1f7ff;--ink:#1c1547;--mut:#665f82;--shadow:#1c1547;--red:#e52347;--orange:#d97500;--yellow:#ffdd00;--green:#138a50;--purple:#7547e8;--pink:#ed58bd;--blue:#087bc1;--focus:#4a25c7;--display:'Bungee',cursive;--body:'Baloo 2',sans-serif;--mono:'Space Mono',monospace;min-height:100dvh;color:var(--ink);font-family:var(--body);background:radial-gradient(rgba(255,255,255,.68) 2px,transparent 2.6px) 0 0/26px 26px,var(--bg);overflow-x:clip}
${p}.theme-dark{--bg:#19143d;--panel:#2d255e;--panel2:#241d50;--ink:#fff3dc;--mut:#c8bfda;--shadow:#090720;--red:#ff5d73;--orange:#ffb13b;--yellow:#ffe45c;--green:#55d992;--purple:#a78aff;--pink:#ff8ed7;--blue:#63c3ff;--focus:#ffe45c;background:radial-gradient(rgba(255,255,255,.09) 2px,transparent 2.6px) 0 0/26px 26px,var(--bg)}
${p} *{box-sizing:border-box}${p} button,${p} input{font:inherit}${p} button{color:inherit;cursor:pointer}${p} svg{width:18px;height:18px;display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}${p} .hearted svg{fill:currentColor}${p} .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}${p} :focus-visible{outline:4px solid var(--focus);outline-offset:3px}${p} .wrap{width:min(1160px,100%);margin:auto;padding-inline:clamp(14px,4vw,44px)}
${p} .mast{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px clamp(14px,4vw,44px);background:var(--panel);border-bottom:3px solid var(--ink)}${p} .logo{font-family:var(--display);font-size:25px}${p} .logo i{font-style:normal;color:var(--red)}${p} nav{display:flex;gap:7px;align-items:center;flex-wrap:wrap}${p} nav a{color:var(--ink);text-decoration:none;font-weight:800;padding:7px 10px;border:2px solid transparent;border-radius:999px}${p} nav a:hover{border-color:var(--ink);background:var(--yellow);color:#1c1547}
${p} .hero{padding-top:48px}${p} .eyebrow,${p} .micro-label{font-family:var(--mono);font-size:10px;color:var(--mut)}${p} h1{font-family:var(--display);font-size:clamp(38px,7vw,78px);line-height:1.02;max-width:13ch;margin:14px 0}${p} h1 em{font-style:normal;color:var(--red)}${p} .lede{font-size:18px;font-weight:650;max-width:52ch}${p} .burst{display:grid;place-items:center;width:92px;height:92px;clip-path:${AFD3R_STAR};background:var(--yellow);color:#1c1547;font:10px var(--display);text-align:center;transform:rotate(8deg)}${p} .hero-top{display:flex;align-items:center;gap:18px}
${p} .section-head{display:flex;align-items:center;gap:12px;margin:58px 0 20px}${p} .section-head b{font:12px var(--display);padding:7px 13px;border-radius:999px;background:var(--ink);color:var(--bg)}${p} .section-head span{font:10px var(--mono);color:var(--mut)}${p} .row{display:flex;align-items:flex-start;flex-wrap:wrap;gap:16px}${p} .found{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}${p} .shape{min-height:94px;border:3px solid var(--ink);border-radius:18px;background:var(--panel);display:grid;place-items:center;text-align:center;padding:10px;font:9px var(--mono)}${p} .type-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:25px}${p} .display{font:46px/1.05 var(--display)}${p} .label,${p} .meta,${p} .nums{font-family:var(--mono)}${p} .label{font-size:11px}${p} .meta{font-size:9px;color:var(--mut)}${p} .nums{font-size:25px;font-variant-numeric:tabular-nums}${p} .long{max-width:43ch;border-left:5px solid var(--pink);padding-left:12px}
${p} .console{border:3px solid var(--ink);border-radius:18px;background:var(--panel);box-shadow:0 9px 0 var(--shadow);overflow:hidden;max-width:820px}${p} .console-top,${p} .machine{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:9px 14px;background:var(--ink);color:var(--bg);font:9px var(--mono)}${p} .console-top b{font-family:var(--display)}${p} .console-body{display:flex;gap:12px;padding:16px}${p} .console-body label{flex:1;display:flex;align-items:center;gap:9px;border:3px solid var(--ink);border-radius:999px;padding:10px 14px;background:var(--panel2)}${p} input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--ink)}${p} .machine{border-top:2px dashed var(--ink);background:var(--panel2);color:var(--mut)}${p} .machine i{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green)}
${p} .btn,${p} .pile{border:3px solid var(--ink);border-radius:999px;background:var(--panel);box-shadow:0 5px 0 var(--shadow);min-height:44px;padding:9px 18px;font-weight:800;transition:transform 140ms cubic-bezier(.34,1.56,.64,1),box-shadow 140ms}${p} .btn:hover,${p} .pile:hover{transform:translate(-2px,-2px);box-shadow:2px 7px 0 var(--shadow)}${p} .btn:active,${p} .pile:active{transform:translate(3px,3px) scale(.98,.94);box-shadow:0 1px 0 var(--shadow)}${p} .btn.primary,${p} .pile.on{background:var(--yellow);color:#1c1547}${p} .btn.secondary{background:var(--pink);color:#1c1547}${p} .btn.compact{min-height:36px;padding:5px 12px;font-size:12px;box-shadow:0 3px 0 var(--shadow)}
${p} .grid,${p} .states{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px}${p} .toy-card{position:relative;min-width:0;border:3px solid var(--ink);border-radius:18px;background:var(--panel);box-shadow:0 5px 0 var(--shadow);overflow:hidden;transition:transform 150ms cubic-bezier(.34,1.56,.64,1),box-shadow 150ms}${p} .toy-card:hover{transform:translate(-3px,-3px) rotate(-.3deg);box-shadow:3px 8px 0 var(--shadow)}${p} .card-tab{display:flex;justify-content:space-between;gap:6px;padding:6px 9px;border-bottom:3px solid var(--ink);font:8px var(--mono);color:#1c1547;white-space:nowrap;overflow:hidden}${p} .c0{background:#39b1ff}${p} .c1{background:#ff7ad9}${p} .c2{background:#2ec06e}${p} .c3{background:#ff9d00}${p} .c4{background:#8a5cff;color:#fff}${p} .c5{background:#ffdd00}${p} .media{position:relative;display:grid;place-items:center;overflow:hidden;margin:9px;border:2px solid var(--ink);border-radius:10px;background:var(--panel2)}${p} .meme-media{width:100%;height:100%;object-fit:contain}${p} .caption{display:flex;justify-content:space-between;gap:8px;padding:2px 11px 9px;font-size:12px;font-weight:700}${p} .caption b{font:9px var(--mono)}${p} .state{position:absolute;left:6px;bottom:6px;border:2px solid var(--ink);border-radius:999px;background:var(--yellow);color:#1c1547;padding:2px 6px;font:8px var(--mono)}${p} .match{box-shadow:0 0 0 4px var(--green),0 9px 0 var(--shadow)}${p} .near{outline:3px dashed var(--orange);outline-offset:3px}${p} .dim{opacity:.48;filter:saturate(.25)}${p} .selected{box-shadow:0 0 0 4px var(--purple),0 9px 0 var(--shadow)}${p} .loading .media{opacity:.35}${p} .loader{padding:5px 10px;font:9px var(--mono)}${p} .loader i{display:inline-block;width:7px;height:7px;margin-right:3px;border-radius:50%;background:var(--purple);animation:afd3rboil .6s alternate infinite}${p} .error{border-color:var(--red)}${p} .error-copy{padding:5px 10px;color:var(--red);font:9px var(--mono)}
${p} .action-rail{display:flex;gap:6px;align-items:center;justify-content:flex-end;padding:7px 9px;border-top:2px dashed var(--ink);background:var(--panel2)}${p} .ctl{position:relative;display:grid;place-items:center;flex:none;width:34px;height:34px;padding:0;border:2px solid var(--ink);color:var(--ink);transition:transform 130ms cubic-bezier(.34,1.56,.64,1),box-shadow 130ms,background 130ms}${p} .ctl.mobile{width:44px;height:44px}${p} .demo-disabled{opacity:.36;pointer-events:none}${p} .demo-focus{outline:4px solid var(--focus);outline-offset:3px}${p} .ctl:disabled{opacity:.36;cursor:not-allowed}
${grammar}
${p} .tag{border:2px solid var(--ink);border-radius:999px;background:var(--blue);color:#fff;padding:6px 11px;font-weight:800}${p} .heart-sample{display:flex;align-items:center;gap:8px;font:11px var(--mono)}${p} .stat{min-width:155px;border:3px solid var(--ink);border-radius:18px;background:var(--panel);box-shadow:0 5px 0 var(--shadow);padding:12px}${p} .stat b{display:block;font:30px var(--display)}${p} .tabs{display:flex;gap:5px;border:3px solid var(--ink);border-radius:999px;background:var(--panel);padding:5px}${p} .tab{min-height:38px;border:2px solid transparent;border-radius:999px;background:transparent;padding:6px 13px;font-weight:800;box-shadow:0 0 0 var(--shadow);transition:transform 130ms,box-shadow 130ms}${p} .tab:hover{transform:translate(-2px,-2px);box-shadow:2px 2px 0 var(--shadow);border-color:var(--ink)}${p} .tab:active{transform:translate(1px,1px) scale(.97,.92);box-shadow:none}${p} .tab.on{background:var(--ink);color:var(--bg)}${p} .toast,${p} .empty{border:3px solid var(--ink);border-radius:18px;background:var(--green);color:#081f15;box-shadow:0 5px 0 var(--shadow);padding:14px;font-weight:800}${p} .empty{max-width:380px;background:var(--panel);color:var(--ink)}
${p} .controls-gallery{scroll-margin-top:20px}${p} .control-intro{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}${p} .control-intro>div{border:3px solid var(--ink);border-radius:18px;background:var(--panel);padding:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}${p} .micro-label{width:100%;display:block}${p} .rail-study{display:grid;grid-template-columns:240px 1fr;gap:28px;align-items:start;margin-top:22px}${p} .actual{width:240px}${p} .zoom{border:3px solid var(--ink);border-radius:18px;background:var(--panel);padding:20px;box-shadow:0 8px 0 var(--shadow)}${p} .zoom-rail{display:flex;gap:18px;align-items:center;margin:20px 0}${p} .zoom-rail .ctl{transform:scale(2);transform-origin:center;margin:14px}${p} .zoom-rail .demo-hover{transform:scale(2) translate(-2px,-2px)}${p} .zoom-rail .demo-active{transform:scale(1.9) translate(2px,2px)}${p} .state-key{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;font:8px var(--mono);text-align:center}${p} .zoom p{font-size:13px;max-width:62ch}
${p} .motion-demo{min-width:120px;border:3px solid var(--ink);border-radius:18px;background:var(--panel);box-shadow:0 5px 0 var(--shadow);padding:16px;text-align:center;font-weight:800}${p} .motion-demo.go{animation:afd3rpop 330ms cubic-bezier(.34,1.56,.64,1)}${p} .bench{border:3px solid var(--ink);border-radius:20px;background:var(--panel2);box-shadow:0 9px 0 var(--shadow);overflow:hidden}${p} .bench-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px;border-bottom:3px solid var(--ink);background:var(--panel)}${p} .bench-body{display:grid;grid-template-columns:210px 1fr;gap:18px;padding:18px}${p} .piles{display:flex;flex-direction:column;gap:8px}${p} .pile{display:flex;justify-content:space-between;text-align:left;min-height:42px;padding:7px 12px;font-size:11px}${p} .phone{width:min(390px,100%);border:3px solid var(--ink);border-radius:28px;background:var(--bg);box-shadow:0 9px 0 var(--shadow);overflow:hidden}${p} .phone-head{display:flex;justify-content:space-between;align-items:center;padding:11px;background:var(--panel);border-bottom:3px solid var(--ink)}${p} .phone .grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:12px}${p} .dock{display:flex;justify-content:space-around;gap:6px;padding:8px;background:var(--panel);border-top:3px solid var(--ink)}${p} .dock .ctl{width:44px;height:44px}
@keyframes afd3rboil{to{transform:translateY(-4px)}}@keyframes afd3rpop{40%{transform:scale(.9,1.1)}70%{transform:scale(1.08,.94)}100%{transform:none}}
@media(prefers-reduced-motion:reduce){${p} *,${p} *::before,${p} *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media(max-width:700px){${p} .mast{align-items:flex-start}${p} nav a{padding:5px 6px;font-size:11px}${p} .found{grid-template-columns:repeat(2,1fr)}${p} .type-grid{grid-template-columns:1fr}${p} .grid,${p} .states{grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}${p} .console-body{flex-direction:column}${p} .control-intro{grid-template-columns:1fr}${p} .rail-study{grid-template-columns:1fr}${p} .zoom{min-width:0;overflow:hidden}${p} .zoom-rail{gap:5px;justify-content:space-between}${p} .zoom-rail .ctl{margin:8px;transform:scale(1.45)}${p} .zoom-rail .demo-hover{transform:scale(1.45) translate(-2px,-2px)}${p} .zoom-rail .demo-active{transform:scale(1.35) translate(2px,2px)}${p} .state-key{font-size:6px}${p} .bench-body{grid-template-columns:1fr}${p} .phone{width:100%}${p} .caption{font-size:10px}${p} .action-rail{padding:6px;gap:4px}${p} .toy-card:not(.actual) .ctl{width:30px;height:30px}${p} .section-head{align-items:flex-start}${p} .section-head span{line-height:1.5}}
`;}
function render(n,cfg,mount){const root=`afd${n}`,M=MEMES;mount.innerHTML=`<div class="${root}"><header class="mast"><span class="logo">spl<i>oo</i>t</span><nav><a href="#0">the pile</a><a href="#0">settings</a><a href="#0">sign in</a>${iconButton('sun','switch theme','mast-control')}</nav></header><main>
<section class="wrap hero"><div class="hero-top"><span class="burst">new shelf<br>energy</span><span class="tag">${cfg.label}</span></div><h1>type words. get the <em>picture.</em></h1><p class="lede">drop every meme you own into the machine. it lines them up by meaning. no folders. just vibes.</p>${searchConsole()}<div class="grid" style="margin-top:28px">${M.slice(0,4).map((m,i)=>card(m,i===0?'match':'',i)).join('')}</div></section>
<section class="wrap">${section('foundations','candy shelf, ink shell, anchored arcade depth')}<div class="found"><div class="shape">3px ink toy shell</div><div class="shape" style="box-shadow:0 5px 0 var(--shadow)">5px resting drop</div><div class="shape" style="box-shadow:0 9px 0 var(--shadow)">9px hero drop</div><div class="shape" style="border-radius:999px">pill action</div><div class="shape" style="clip-path:${AFD3R_STAR};border:0;background:var(--yellow);color:#1c1547">starburst annotation</div></div><p class="meta">spacing runs 6 / 12 / 18 / 36 / 54. hover lifts the surface while extending the shadow. press sinks and collapses it.</p></section>
${swatches([['shelf blue','#cfe7ff'],['panel','#ffffff'],['ink','#1c1547','#fff'],['cherry','#e52347','#fff'],['banana','#ffdd00'],['apple','#138a50','#fff'],['grape','#7547e8','#fff'],['bubblegum','#ed58bd','#fff']])}
<section class="wrap">${section('type specimen','toy display, rounded body, machine metadata')}<div class="type-grid"><div><div class="display">the extremely specific pile</div><p>body · baloo 2 keeps the toybox friendly without turning the controls into baby furniture.</p><p class="long">long caption wrap: me explaining why this exact cat belongs beside the screenshot that ended productive work at 2:47am.</p></div><div><p class="label">LABEL · SPACE MONO</p><p class="meta">metadata · vec 0413 · siglip-base · 768d</p><p class="nums">1,482 · 0.94 · 212ms</p></div></div></section>
<section class="wrap">${section('component sheet','the complete shelf, including all seven cell states')}<div style="display:flex;flex-direction:column;gap:28px">${searchConsole()}<div class="states">${['','match','near','dim','selected','loading','error'].map((s,i)=>card(M[i],s,i)).join('')}</div><div class="row"><button class="btn primary">upload chaos</button><button class="btn secondary">shuffle the pile</button><button class="btn compact">compact</button>${iconButton('search','icon button')}<span class="tag">automatic pile</span><span class="heart-sample">${iconButton('heart','banger','hearted')} banger</span></div><div class="row"><div class="stat"><span>memes indexed</span><b>1,482</b></div><div class="stat"><span>bangers</span><b>37</b></div><div class="stat"><span>folders required</span><b>0</b></div><div class="tabs"><button class="tab on">all</button><button class="tab">recent</button></div><div class="toast">saved to the pile</div></div><div class="machine"><span>index ${LIB.total.toLocaleString()}</span><span>queue ${LIB.queued} cooking</span><span>route /api/search</span><span>machine <i></i> live</span></div><div class="empty"><strong>the shelf is suspiciously empty</strong><p>upload chaos. the machine cannot organize a void.</p><button class="btn primary">upload chaos</button></div></div></section>
${controlsGallery(M)}
<section class="wrap">${section('motion','squash, stretch, settle, only after touch')}<div class="row"><button class="btn primary motion-trigger">boop the toy</button><div class="motion-demo">surface lifts<br>shadow anchors</div><button class="btn motion-trigger">pop annotation</button><span class="burst motion-demo">closest<br>match</span></div><p class="meta">prefers-reduced-motion removes travel, squash, bounce, and loading hops. state changes remain immediate.</p></section>
<section class="wrap">${section('compositions','desktop workbench and a true 390px pocket shelf')}<div class="bench"><div class="bench-bar"><span class="logo" style="font-size:16px">spl<i>oo</i>t</span><button class="btn compact">upload</button>${iconButton('search','search')}${iconButton('sun','theme')}</div><div class="bench-body">${piles()}<div class="grid">${M.slice(0,8).map((m,i)=>card(m,i===0?'match':'',i)).join('')}</div></div><div class="machine"><span>the pile</span><span>${LIB.total.toLocaleString()} indexed</span><span>${LIB.queued} cooking</span></div></div><div style="padding-block:28px 54px"><div class="phone"><div class="phone-head"><span class="logo" style="font-size:15px">spl<i>oo</i>t</span>${iconButton('sun','switch theme','mobile')}</div><div class="grid">${M.slice(0,4).map((m,i)=>card(m,i===0?'match':'',i)).join('')}</div><div class="dock">${iconButton('pile','pile','mobile')}${iconButton('search','search','mobile')}${iconButton('upload','upload','mobile')}${iconButton('heart','bangers','mobile hearted')}</div></div></div></section></main>${labSpec([['system','toybox refined · ink toys on a dot-grid shelf'],['type','bungee / baloo 2 / space mono'],['move',cfg.move],['density','chunky shell, disciplined rails, 240px real cell'],['motion','anchored-shadow lift, sink, squash, settle']])}</div>`;
const el=mount.querySelector(`.${root}`);themeToggle(el);el.querySelectorAll('.motion-trigger').forEach((b,i)=>b.addEventListener('click',()=>{const x=el.querySelectorAll('.motion-demo')[i];x.classList.remove('go');void x.offsetWidth;x.classList.add('go')}));el.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{el.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));t.classList.add('on')}));el.querySelectorAll('.pile').forEach(t=>t.addEventListener('click',()=>{el.querySelectorAll('.pile').forEach(x=>x.classList.remove('on'));t.classList.add('on')}));}
const variants={
8:{name:'toybox · ink minis',label:'flat ink minis',move:'flat ink-outline micro-toys fill with candy on hover and compress on press',grammar:`.afd8 .ctl{border-radius:9px;background:transparent;box-shadow:none}.afd8 .ctl:hover,.afd8 .demo-hover{transform:translate(-2px,-2px);background:var(--yellow);color:#1c1547;box-shadow:2px 2px 0 var(--shadow)}.afd8 .ctl:active,.afd8 .demo-active{transform:translate(1px,1px) scale(.92,.88);box-shadow:none;background:var(--pink);color:#1c1547}`},
9:{name:'toybox · candy clicks',label:'candy micro chips',move:'rounded candy chips carry a two-pixel drop, extend on hover, and click flush',grammar:`.afd9 .ctl{border-radius:999px;background:var(--panel);box-shadow:0 2px 0 var(--shadow)}.afd9 .ctl:nth-child(3n+1){background:var(--pink);color:#1c1547}.afd9 .ctl:hover,.afd9 .demo-hover{transform:translate(-2px,-2px);box-shadow:2px 4px 0 var(--shadow);background:var(--yellow);color:#1c1547}.afd9 .ctl:active,.afd9 .demo-active{transform:translate(1px,1px) scale(.96,.9);box-shadow:0 0 0 var(--shadow)}`},
10:{name:'toybox · punch panel',label:'punched inset controls',move:'controls are stamped wells in the toy shell, rising to meet the finger then pressing inward',grammar:`.afd10 .action-rail{background:var(--panel);border-top:3px solid var(--ink)}.afd10 .ctl{border-radius:10px;background:var(--panel2);box-shadow:inset 0 3px 0 rgba(28,21,71,.24),inset 0 0 0 1px var(--ink)}.afd10.theme-dark .ctl{box-shadow:inset 0 3px 0 #090720,inset 0 0 0 1px var(--ink)}.afd10 .ctl:hover,.afd10 .demo-hover{transform:translate(-1px,-1px);background:var(--yellow);color:#1c1547;box-shadow:inset 0 1px 0 rgba(28,21,71,.2),1px 2px 0 var(--shadow)}.afd10 .ctl:active,.afd10 .demo-active{transform:translate(1px,2px) scale(.96);box-shadow:inset 0 4px 0 rgba(28,21,71,.34);background:var(--panel2);color:var(--ink)}`},
11:{name:'toybox · peel tabs',label:'sticker peel icons',move:'die-cut icon stickers cock slightly on hover, peel higher while their shadow anchors, then slap flat',grammar:`.afd11 .ctl{border-radius:11px 13px 10px 14px;background:var(--panel);box-shadow:0 0 0 2px var(--panel),0 0 0 4px var(--ink),2px 3px 0 4px var(--shadow);margin:3px}.afd11 .ctl:nth-child(2){transform:rotate(2deg)}.afd11 .ctl:hover,.afd11 .demo-hover{transform:translate(-2px,-2px) rotate(-4deg);box-shadow:0 0 0 2px var(--panel),0 0 0 4px var(--ink),4px 5px 0 4px var(--shadow);background:var(--yellow);color:#1c1547}.afd11 .ctl:active,.afd11 .demo-active{transform:translate(2px,3px) rotate(0) scale(.94,.9);box-shadow:0 0 0 2px var(--panel),0 0 0 4px var(--ink),0 0 0 4px var(--shadow)}`}
};
SPECS['AFD-8']=mount=>{css('AFD-8',baseCss(8,variants[8].grammar));render(8,variants[8],mount)};
SPECS['AFD-9']=mount=>{css('AFD-9',baseCss(9,variants[9].grammar));render(9,variants[9],mount)};
SPECS['AFD-10']=mount=>{css('AFD-10',baseCss(10,variants[10].grammar));render(10,variants[10],mount)};
SPECS['AFD-11']=mount=>{css('AFD-11',baseCss(11,variants[11].grammar));render(11,variants[11],mount)};
})();
