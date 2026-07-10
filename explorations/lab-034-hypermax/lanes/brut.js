/* lab 034 · lane BRUT — industrial brutalism & tactical telemetry.
   Three complete-system propositions: BRUT-1 field manual (swiss print),
   BRUT-2 target acquisition (crt telemetry), BRUT-3 broadsheet (swiss poster).
   Runs after parts.js; uses SPECS, css, esc, memeImg, labSpec, themeToggle,
   MEMES, PILES, LIB. */
'use strict';

(() => {

/* shared labeled swatch strip (theme-truthful: chips ride var()) */
function swx(list) {
  return `<div class="bswx">${list.map(([name, ref, hexes, use]) => `
    <div class="it"><i style="background:${ref}"></i><b>${name}</b><span>${hexes}</span><span>${use}</span></div>`).join('')}</div>`;
}

/* ================================================================
   BRUT-1 · THE FIELD MANUAL — swiss industrial print
   system rule: everything lives in a compartment. 1px rules, crosshair
   registration marks, red requisition ink. maximalism = annotation density.
   ================================================================ */

const B1LBL = { '': 'filed', match: 'match', near: 'near', dim: 'cold', selected: 'selected', loading: 'queue', error: 'err 500' };

function b1Cell(m, state = '') {
  const lbl = B1LBL[state] || 'filed';
  const fill = state === 'near'
    ? `<i class="hatch" style="width:${m.score}%"></i>`
    : `<i style="width:${state === 'loading' ? 8 : m.score}%"></i>`;
  let art = `<div class="art" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>`;
  if (state === 'loading') art = `<div class="art b1load" style="aspect-ratio:${m.aspect}"><span class="m">embedding…</span></div>`;
  if (state === 'error') art = `<div class="art b1errart" style="aspect-ratio:${m.aspect}"><span class="m">embed failed. the model looked away.</span></div>`;
  return `
  <figure class="b1cell ${state === 'error' ? 'errc' : state}">
    ${state === 'match' ? '<span class="stamp">match®</span>' : ''}
    <div class="hd"><span>${esc(m.file)}</span><span>vec/${m.vec}</span></div>
    ${art}
    <figcaption class="cap"><span>${esc(m.cap)}</span>${m.banger ? '<span class="b1banger">banger</span>' : ''}</figcaption>
    <div class="ft"><span class="rail">${fill}</span><b>${(m.score / 100).toFixed(2)}</b><span>${lbl}</span>${state === 'error' ? '<button class="b1btn sm">retry</button>' : ''}</div>
  </figure>`;
}

function b1Console(q) {
  return `
  <div class="b1console">
    <div class="cbar"><span>[ sploot search console ]</span><span>form 22-b</span><span class="crt">rev 2.6</span></div>
    <div class="cfield">
      <div class="b1in" style="flex:1"><span class="pr">&gt;</span><span class="q">${esc(q)}</span><i class="caret"></i></div>
      <button class="b1btn primary">find it</button>
      <button class="b1btn icon" aria-label="shuffle the pile">⇄</button>
    </div>
    <div class="cmeta m"><span>index/${LIB.total.toLocaleString()}</span><span>model/${LIB.model}</span><span>dim/${LIB.dim}</span><span>lat/${LIB.latency}ms</span><span>route //api/search</span><span class="rt">queue ${LIB.queued}</span></div>
  </div>`;
}

function b1Status() {
  const c = [['index', `${LIB.total.toLocaleString()} vec`], ['model', LIB.model], ['queue', `${LIB.queued} embedding`], ['dim', LIB.dim], ['lat', `${LIB.latency}ms`], ['status', 'live ■', 1]];
  return `<div class="b1status">${c.map(([k, v, ok]) => `<span class="cell ${ok ? 'ok' : ''}"><b>${k}</b>${v}</span>`).join('')}<span class="cell tail">sploot® industrial archive systems</span></div>`;
}

SPECS['BRUT-1'] = (mount) => {
  css('BRUT-1', `
  .brut1 {
    --paper:#F4F4F0; --paper2:#E9E7E0; --ink:#111111; --ink2:rgba(17,17,17,.62);
    --red:#E61919; --red-ink:#B80D0D; --red-fill:#C71414; --on-red:#FFFFFF;
    --b1:1px solid var(--ink); --b2:2px solid var(--ink); --b4:4px solid var(--ink);
    --mach:'Space Mono',monospace; --disp:'Archivo Black',sans-serif;
    --body:'Space Grotesk',sans-serif; --serif:'Instrument Serif',serif;
    --tick:90ms;
    min-height:100dvh; display:flex; flex-direction:column; overflow-x:hidden;
    background:var(--paper); color:var(--ink); font-family:var(--body);
  }
  .brut1.theme-dark {
    --paper:#121212; --paper2:#1B1B1B; --ink:#EAEAEA; --ink2:rgba(234,234,234,.62);
    --red:#FF2A2A; --red-ink:#FF6B5E; --red-fill:#FF2A2A; --on-red:#0A0A0A;
    --b1:1px solid var(--ink); --b2:2px solid var(--ink); --b4:4px solid var(--ink);
  }
  .brut1 :focus-visible { outline:3px solid var(--red); outline-offset:2px; }
  .brut1 .m { font-family:var(--mach); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
  .brut1 .rt { color:var(--red-ink); }
  .brut1 a { color:inherit; }
  .brut1 .meme-media { background:var(--paper2); }
  .brut1 .pad { padding:22px clamp(16px,4vw,48px); display:flex; flex-direction:column; gap:22px; align-items:flex-start; }
  .brut1 .row { display:flex; flex-wrap:wrap; gap:14px; align-items:center; }

  /* compartment grid primitive: razor 1px rules via gap on ink */
  .brut1 .cgrid { display:grid; gap:1px; background:var(--ink); border:var(--b2); }
  .brut1 .cgrid > * { background:var(--paper); }
  .brut1 .g4 { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .brut1 .cgrid .b1cell { border:0; }
  .brut1 .cgrid .b1cell::before, .brut1 .cgrid .b1cell::after { display:none; }

  /* masthead */
  .brut1 .mast { display:flex; align-items:stretch; flex-wrap:wrap; border-bottom:var(--b2); }
  .brut1 .mast .logo { font-family:var(--disp); font-size:20px; text-transform:uppercase; padding:10px 16px; border-right:var(--b2); display:flex; align-items:center; }
  .brut1 .logo sup { font-family:var(--mach); font-size:9px; color:var(--red-ink); margin-left:2px; }
  .brut1 .mast nav { display:flex; flex-wrap:wrap; }
  .brut1 .mast nav a { display:flex; align-items:center; min-height:44px; padding:0 14px; border-right:var(--b1); font-family:var(--mach); font-size:11px; text-transform:uppercase; letter-spacing:.08em; text-decoration:none; }
  .brut1 .mast nav a:hover { background:var(--ink); color:var(--paper); }
  .brut1 .mast .doc { margin-left:auto; display:flex; align-items:center; padding:0 16px; border-left:var(--b1); }

  /* hero */
  .brut1 .hero { position:relative; padding:clamp(26px,5vw,60px) clamp(16px,4vw,48px) clamp(26px,4vw,44px); border-bottom:var(--b2); display:flex; flex-direction:column; gap:20px; align-items:flex-start; }
  .brut1 .hero h1 { font-family:var(--disp); text-transform:uppercase; font-size:clamp(40px,9vw,124px); line-height:.85; letter-spacing:-.02em; }
  .brut1 .hero h1 .u { box-shadow:inset 0 -.14em 0 var(--red); }
  .brut1 .hero .sub { font-family:var(--mach); font-size:13px; line-height:1.6; max-width:58ch; }
  .brut1 .hero .marg { position:absolute; right:10px; top:12px; writing-mode:vertical-rl; font-family:var(--mach); font-size:9px; text-transform:uppercase; letter-spacing:.14em; color:var(--ink2); }

  /* section headers with giant numeral */
  .brut1 .sec { display:flex; align-items:baseline; gap:16px; flex-wrap:wrap; border-top:var(--b4); border-bottom:var(--b1); padding:10px clamp(16px,4vw,48px); margin-top:clamp(26px,5vw,52px); }
  .brut1 .sec b { font-family:var(--disp); font-size:clamp(26px,4vw,44px); line-height:1; }
  .brut1 .sec .crt { margin-left:auto; color:var(--red-ink); }

  /* swatches */
  .brut1 .bswx { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:1px; background:var(--ink); border:var(--b2); width:100%; }
  .brut1 .bswx .it { background:var(--paper); display:flex; flex-direction:column; font-family:var(--mach); font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  .brut1 .bswx .it i { height:46px; border-bottom:var(--b1); }
  .brut1 .bswx .it b, .brut1 .bswx .it span { padding:2px 8px; }
  .brut1 .bswx .it b { padding-top:7px; font-size:10px; }
  .brut1 .bswx .it span:last-child { color:var(--ink2); padding-bottom:8px; }

  /* shape specimens */
  .brut1 .shape { width:130px; height:84px; display:grid; place-items:center; text-align:center; font-family:var(--mach); font-size:9px; text-transform:uppercase; background:var(--paper2); border:var(--b2); padding:4px; }
  .brut1 .shape.hair { border-width:1px; }
  .brut1 .shape.sel { border-width:4px; }
  .brut1 .shape.plate { box-shadow:0 0 0 3px var(--paper), 0 0 0 5px var(--ink); }
  .brut1 .shape.hatchy { background:repeating-linear-gradient(45deg, var(--paper2) 0 8px, var(--paper) 8px 16px); }
  .brut1 .shape.xh { position:relative; }
  .brut1 .shape.xh::before { content:'+'; position:absolute; top:-9px; left:-7px; font:700 13px var(--mach); color:var(--red-ink); }

  /* type specimen */
  .brut1 .trow { display:grid; grid-template-columns:120px 1fr; gap:14px; align-items:baseline; border-top:var(--b1); padding:12px 0; width:100%; }
  .brut1 .trow .lab { color:var(--ink2); }
  .brut1 .tdisp { font-family:var(--disp); text-transform:uppercase; font-size:clamp(34px,5vw,60px); line-height:.9; }
  .brut1 .tbody { font-size:17px; max-width:58ch; }
  .brut1 .tnum { font-family:var(--mach); font-size:26px; font-variant-numeric:tabular-nums; }
  .brut1 .tcap { font-size:13px; max-width:46ch; border-left:3px solid var(--red); padding-left:12px; line-height:1.5; }
  .brut1 .tserif { position:relative; font-family:var(--serif); font-style:italic; font-size:clamp(22px,3.4vw,36px); max-width:30ch; line-height:1.2; padding:6px 0; }
  .brut1 .tserif::after { content:''; position:absolute; inset:0; background-image:radial-gradient(var(--ink) .8px, transparent .8px); background-size:5px 5px; opacity:.14; pointer-events:none; }

  /* console */
  .brut1 .b1console { width:100%; max-width:860px; border:var(--b2); background:var(--paper); }
  .brut1 .cbar { display:flex; gap:16px; padding:7px 12px; background:var(--ink); color:var(--paper); font-family:var(--mach); font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
  .brut1 .cbar .crt { margin-left:auto; color:var(--red); }
  .brut1 .cfield { display:flex; gap:10px; padding:12px; border-bottom:var(--b1); flex-wrap:wrap; }
  .brut1 .cmeta { display:flex; flex-wrap:wrap; gap:14px; padding:8px 12px; background:var(--paper2); font-size:9px; }
  .brut1 .cmeta .rt { margin-left:auto; color:var(--red-ink); }

  /* input */
  .brut1 .b1in { display:flex; align-items:center; gap:9px; min-height:44px; min-width:220px; padding:0 12px; border:var(--b2); background:var(--paper); font-family:var(--mach); font-size:14px; }
  .brut1 .b1in .pr { color:var(--red-ink); }
  .brut1 .b1in .q { flex:1; }
  .brut1 .caret { width:9px; height:18px; background:var(--red); animation:b1blink 1s steps(1) infinite; }

  /* buttons */
  .brut1 .b1btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 18px; border:var(--b2); background:var(--paper); color:var(--ink); font-family:var(--mach); font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:.06em; cursor:pointer; transition:transform var(--tick) steps(2,end); }
  .brut1 .b1btn:hover { background:var(--ink); color:var(--paper); }
  .brut1 .b1btn:active { transform:translate(2px,2px); }
  .brut1 .b1btn.primary { background:var(--red-fill); color:var(--on-red); }
  .brut1 .b1btn.sm { min-height:30px; padding:0 10px; font-size:10px; border-width:1px; }
  .brut1 .b1btn.icon { width:44px; padding:0; }
  .brut1 .b1btn.pressed { animation:b1press 160ms steps(2,end); }

  /* tags, banger, toast, tabs */
  .brut1 .b1tag { font-family:var(--mach); font-size:11px; padding:6px 10px; border:var(--b1); }
  .brut1 .b1tag::before { content:'[ '; color:var(--red-ink); }
  .brut1 .b1tag::after { content:' ]'; color:var(--red-ink); }
  .brut1 .b1banger { flex:none; background:var(--red-fill); color:var(--on-red); font-family:var(--mach); font-weight:700; font-size:9px; text-transform:uppercase; padding:2px 6px; transform:rotate(-2deg); }
  .brut1 .b1toast { display:inline-flex; gap:10px; align-items:center; border:var(--b2); border-left:8px solid var(--red); background:var(--paper); padding:10px 14px; font-family:var(--mach); font-size:12px; }
  .brut1 .b1tabs { display:flex; border:var(--b2); width:max-content; }
  .brut1 .b1tab { min-height:44px; padding:0 16px; background:var(--paper); color:var(--ink); border:0; border-right:var(--b1); font-family:var(--mach); font-size:11px; text-transform:uppercase; cursor:pointer; }
  .brut1 .b1tab:last-child { border-right:0; }
  .brut1 .b1tab.on { background:var(--ink); color:var(--paper); box-shadow:inset 0 -4px 0 var(--red); font-weight:700; }

  /* stat blocks */
  .brut1 .b1stat { padding:12px 14px; display:flex; flex-direction:column; gap:4px; min-width:150px; }
  .brut1 .b1stat .v { font-family:var(--disp); font-size:38px; line-height:1; }

  /* status bar */
  .brut1 .b1status { display:flex; flex-wrap:wrap; align-items:stretch; border-top:var(--b2); background:var(--ink); color:var(--paper); font-family:var(--mach); font-size:10px; text-transform:uppercase; letter-spacing:.06em; width:100%; }
  .brut1 .b1status .cell { display:flex; gap:8px; align-items:center; padding:8px 14px; border-right:1px solid var(--paper2); }
  .brut1 .b1status .cell b { opacity:.6; font-weight:400; }
  .brut1 .b1status .ok { color:var(--red); }
  .brut1 .b1status .tail { margin-left:auto; border-right:0; opacity:.6; }

  /* meme cell */
  .brut1 .b1cell { position:relative; display:flex; flex-direction:column; border:var(--b2); background:var(--paper); }
  .brut1 .b1cell::before { content:'+'; position:absolute; top:-10px; left:-8px; font:700 13px var(--mach); color:var(--red-ink); z-index:2; }
  .brut1 .b1cell::after { content:'+'; position:absolute; bottom:-10px; right:-8px; font:700 13px var(--mach); color:var(--red-ink); z-index:2; }
  .brut1 .b1cell .hd { display:flex; justify-content:space-between; gap:8px; padding:5px 8px; font-family:var(--mach); font-size:9px; text-transform:uppercase; border-bottom:var(--b1); white-space:nowrap; overflow:hidden; }
  .brut1 .b1cell .art { display:grid; place-items:center; overflow:hidden; background:var(--paper2); border-bottom:var(--b1); }
  .brut1 .b1cell .cap { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 9px; font-size:12.5px; line-height:1.4; font-weight:500; }
  .brut1 .b1cell .ft { display:flex; align-items:center; gap:8px; border-top:var(--b1); padding:6px 8px; font-family:var(--mach); font-size:9px; text-transform:uppercase; }
  .brut1 .b1cell .rail { flex:1; height:7px; border:var(--b1); position:relative; min-width:40px; }
  .brut1 .b1cell .rail i { position:absolute; top:0; left:0; bottom:0; background:var(--red); }
  .brut1 .b1cell .rail .hatch { background:repeating-linear-gradient(45deg, var(--red) 0 4px, transparent 4px 8px); }
  .brut1 .b1cell.match { border-color:var(--red); box-shadow:0 0 0 2px var(--paper), 0 0 0 4px var(--red); z-index:3; }
  .brut1 .b1cell.match .hd { background:var(--red-fill); color:var(--on-red); border-color:var(--red); }
  .brut1 .b1cell .stamp { position:absolute; top:26px; right:-9px; z-index:4; transform:rotate(4deg); background:var(--red-fill); color:var(--on-red); border:2px solid var(--paper); font-family:var(--mach); font-weight:700; font-size:11px; text-transform:uppercase; padding:4px 8px; }
  .brut1 .b1cell.near { border-style:dashed; }
  .brut1 .b1cell.dim { opacity:.4; filter:grayscale(.7); }
  .brut1 .b1cell.selected { border-width:4px; }
  .brut1 .b1cell.selected .hd { background:var(--ink); color:var(--paper); }
  .brut1 .b1cell.errc { border-color:var(--red); }
  .brut1 .b1cell.errc .hd { background:var(--red-fill); color:var(--on-red); }
  .brut1 .b1errart { background:repeating-linear-gradient(45deg, transparent 0 9px, rgba(230,25,25,.12) 9px 18px) var(--paper2); text-align:center; padding:10px; }
  .brut1 .b1load { background:repeating-linear-gradient(45deg, var(--paper2) 0 12px, var(--paper) 12px 24px); animation:b1shift .7s steps(6) infinite; }
  .brut1 .b1lockwrap.flick .b1cell { animation:b1lockA 240ms steps(2,end); }
  .brut1 .b1stampd { display:inline-block; background:var(--red-fill); color:var(--on-red); border:2px solid var(--ink); font-family:var(--mach); font-weight:700; font-size:12px; text-transform:uppercase; padding:6px 10px; transform:rotate(-3deg); }
  .brut1 .b1stampd.play { animation:b1stampA 150ms steps(2,end); }

  /* empty state */
  .brut1 .b1empty { border:var(--b4); background:var(--paper2); padding:28px; display:flex; flex-direction:column; gap:12px; align-items:flex-start; max-width:480px; }
  .brut1 .b1empty .big { font-family:var(--disp); text-transform:uppercase; font-size:clamp(26px,4vw,40px); line-height:.9; }

  /* workbench */
  .brut1 .bench { width:100%; border:var(--b2); background:var(--paper); }
  .brut1 .bb-bar { display:flex; gap:12px; align-items:center; flex-wrap:wrap; padding:10px 14px; border-bottom:var(--b2); }
  .brut1 .bb-bar .logo { font-family:var(--disp); font-size:17px; text-transform:uppercase; }
  .brut1 .bb-body { display:flex; gap:16px; padding:16px; align-items:flex-start; }
  .brut1 .bb-rail { display:flex; flex-direction:column; gap:8px; min-width:210px; }
  .brut1 .bb-pile { display:flex; justify-content:space-between; gap:10px; padding:9px 10px; min-height:40px; border:var(--b1); background:var(--paper); font-family:var(--mach); font-size:11px; cursor:pointer; text-align:left; color:var(--ink); }
  .brut1 .bb-pile b { color:var(--red-ink); }
  .brut1 .bb-pile.on { border:var(--b2); box-shadow:inset 4px 0 0 var(--red); font-weight:700; }

  /* phone */
  .brut1 .b1phone { width:390px; max-width:100%; border:var(--b4); background:var(--paper); }
  .brut1 .ph-mast { display:flex; justify-content:space-between; align-items:center; padding:9px 12px; border-bottom:var(--b2); }
  .brut1 .ph-dock { display:flex; border-top:var(--b2); }
  .brut1 .ph-dock button { flex:1; min-height:52px; background:var(--paper); color:var(--ink); border:0; border-right:var(--b1); font-family:var(--mach); font-size:10px; text-transform:uppercase; cursor:pointer; }
  .brut1 .ph-dock button:last-child { border-right:0; }
  .brut1 .ph-dock button.on { background:var(--ink); color:var(--paper); box-shadow:inset 0 -4px 0 var(--red); }

  @keyframes b1blink { 50% { opacity:0; } }
  @keyframes b1shift { to { background-position:24px 0; } }
  @keyframes b1press { 0% { transform:translate(2px,2px); background:var(--red-fill); color:var(--on-red); } }
  @keyframes b1stampA { 0% { opacity:0; transform:scale(1.7) rotate(-14deg); } 100% { opacity:1; transform:scale(1) rotate(-3deg); } }
  @keyframes b1lockA { 0%, 50% { filter:invert(1); } 25%, 100% { filter:invert(0); } }
  @media (prefers-reduced-motion: reduce) {
    .brut1 *, .brut1 *::before, .brut1 *::after { animation:none !important; transition:none !important; }
  }
  @media (max-width:720px) {
    .brut1 .g4 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .brut1 .bb-body { flex-direction:column; }
    .brut1 .bb-rail { flex-direction:row; flex-wrap:wrap; min-width:0; }
    .brut1 .trow { grid-template-columns:1fr; gap:4px; }
    .brut1 .mast .doc { border-left:0; padding:8px 14px; }
    .brut1 .b1in { min-width:0; width:100%; }
    .brut1 .cfield .b1btn { flex:1; }
  }
  `);

  const M = MEMES;
  mount.innerHTML = `
  <div class="brut1">
    <header class="mast">
      <span class="logo">sploot<sup>®</sup></span>
      <nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">upload</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
      <span class="doc m rt">doc spl-034 · rev 2.6</span>
    </header>

    <section class="hero">
      <span class="marg">filed under: memes / all of them</span>
      <span class="m rt">[ private meme archive · index ${LIB.total.toLocaleString()} ]</span>
      <h1>type words.<br>get the <span class="u">picture.</span></h1>
      <p class="sub">no folders. just vibes. every image is filed by what it means, cross-referenced by a machine that never sleeps and never asks questions.</p>
      ${b1Console('cat losing it')}
      <div class="cgrid g4" style="width:100%">${M.slice(0, 4).map((x, i) => b1Cell(x, i === 0 ? 'match' : '')).join('')}</div>
    </section>

    <div class="sec"><b>01</b><span class="m">[ foundations ]</span><span class="m crt rt">sheet 1/6 · tokens, rules, plates</span></div>
    <div class="pad">
      ${swx([
        ['paper', 'var(--paper)', '#F4F4F0 / #121212', 'substrate'],
        ['paper 2', 'var(--paper2)', '#E9E7E0 / #1B1B1B', 'compartment fill'],
        ['ink', 'var(--ink)', '#111111 / #EAEAEA', 'carbon ink'],
        ['hazard red', 'var(--red)', '#E61919 / #FF2A2A', 'graphic accent'],
        ['red ink', 'var(--red-ink)', '#B80D0D / #FF6B5E', 'small red text, aa'],
        ['red fill', 'var(--red-fill)', '#C71414 / #FF2A2A', 'stamps + primary'],
      ])}
      <div class="row">
        <div class="shape hair">1px · rule</div>
        <div class="shape">2px · object</div>
        <div class="shape sel">4px · selected</div>
        <div class="shape plate">double plate · elevation</div>
        <div class="shape hatchy">hatch · pending</div>
        <div class="shape xh">crosshair · registration</div>
        <div class="shape">radius 0 · always</div>
      </div>
      <p class="m" style="color:var(--ink2)">spacing rides an 8px machine grid. compartments meet at 1px rules. nothing floats, nothing rounds, nothing casts a soft shadow.</p>
    </div>

    <div class="sec"><b>02</b><span class="m">[ type ]</span><span class="m crt rt">sheet 2/6 · four voices, one rationed</span></div>
    <div class="pad" style="gap:0">
      <div class="trow"><span class="m lab">display</span><div class="tdisp">upload chaos</div></div>
      <div class="trow"><span class="m lab">body</span><div class="tbody">space grotesk carries the sentences. the pile sorts itself into semantic piles while you sleep. no folders were harmed.</div></div>
      <div class="trow"><span class="m lab">label</span><div class="m">space mono upper · form 22-b · [ requisition ]</div></div>
      <div class="trow"><span class="m lab">metadata</span><div class="m" style="font-size:10px;color:var(--ink2)">vec/0413 · sim 0.94 · 212ms · siglip-base · 768d</div></div>
      <div class="trow"><span class="m lab">tabular</span><div class="tnum">1,482 · 0.94 · 212ms · 768</div></div>
      <div class="trow"><span class="m lab">caption</span><div class="tcap">long caption wrap test: me explaining to the group chat why the spreadsheet cell that broke me is now framed above my desk like a diploma.</div></div>
      <div class="trow"><span class="m lab">serif</span><div><div class="tserif">a beautiful archive of extremely stupid images</div><p class="m" style="font-size:9px;color:var(--ink2);margin-top:6px">instrument serif appears once per page, under a halftone veil. that is the entire budget.</p></div></div>
    </div>

    <div class="sec"><b>03</b><span class="m">[ components ]</span><span class="m crt rt">sheet 3/6 · the kit</span></div>
    <div class="pad">
      ${b1Console('sad frog')}
      <div class="cgrid g4" style="width:100%">
        ${b1Cell(M[1])}${b1Cell(M[0], 'match')}${b1Cell(M[2], 'near')}${b1Cell(M[3], 'dim')}
        ${b1Cell(M[4], 'selected')}${b1Cell(M[5], 'loading')}${b1Cell(M[7], 'error')}
        <div class="b1empty" style="border:0;max-width:none"><span class="big">nothing filed.</span><p style="font-size:14px;max-width:36ch">the pile is empty. zero thoughts. upload chaos and the machine starts filing.</p><button class="b1btn primary">upload chaos</button></div>
      </div>
      <div class="row">
        <button class="b1btn primary">find it</button>
        <button class="b1btn">shuffle the pile</button>
        <button class="b1btn sm">compact</button>
        <button class="b1btn icon" aria-label="close">✕</button>
        <span class="b1tag">reaction faces</span>
        <span class="b1tag">cats being unwell</span>
        <span class="b1banger">banger</span>
      </div>
      <div class="row">
        <div class="b1in"><span class="pr">&gt;</span><span class="q">text input</span><i class="caret"></i></div>
        <div class="b1tabs" role="tablist"><button class="b1tab on">all</button><button class="b1tab">bangers</button><button class="b1tab">recent</button></div>
        <div class="b1toast">■ saved to the pile. filed under vibes.</div>
      </div>
      <div class="cgrid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));width:100%;max-width:640px">
        <div class="b1stat"><span class="m" style="color:var(--ink2)">folders required</span><span class="v">0</span></div>
        <div class="b1stat"><span class="m" style="color:var(--ink2)">memes indexed</span><span class="v">1,482</span></div>
        <div class="b1stat"><span class="m rt">bangers</span><span class="v" style="color:var(--red)">37</span></div>
      </div>
    </div>
    ${b1Status()}

    <div class="sec"><b>04</b><span class="m">[ motion ]</span><span class="m crt rt">sheet 4/6 · mechanical, interaction only</span></div>
    <div class="pad">
      <div class="row">
        <button class="b1btn primary" id="b1-press">press me</button>
        <button class="b1btn" id="b1-stamp-go">certify banger</button>
        <span class="b1stampd" id="b1-stamp" hidden>banger®</span>
        <button class="b1btn" id="b1-lock-go">run match</button>
      </div>
      <div class="b1lockwrap" id="b1-lock-cell" style="width:min(300px,100%)">${b1Cell(M[0])}</div>
      <p class="m" style="color:var(--ink2)">motion is steps(), 90 to 240ms, fired by hands only. prefers-reduced-motion collapses every move to an instant state change.</p>
    </div>

    <div class="sec"><b>05</b><span class="m">[ compositions ]</span><span class="m crt rt">sheet 5/6 · workbench + field unit</span></div>
    <div class="pad">
      <div class="bench">
        <div class="bb-bar">
          <span class="logo">sploot<sup>®</sup></span>
          <div class="b1in" style="flex:1;max-width:460px"><span class="pr">&gt;</span><span class="q">search the pile</span><i class="caret"></i></div>
          <button class="b1btn primary">find it</button>
          <button class="b1btn">upload chaos</button>
        </div>
        <div class="bb-body">
          <aside class="bb-rail">
            <span class="m rt">automatic piles</span>
            ${PILES.map((p, i) => `<button class="bb-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}
          </aside>
          <div class="cgrid g4" style="flex:1">${M.slice(0, 8).map(x => b1Cell(x)).join('')}</div>
        </div>
        ${b1Status()}
      </div>
      <div class="b1phone">
        <div class="ph-mast"><span class="logo" style="font-family:var(--disp);font-size:15px;text-transform:uppercase">sploot<sup>®</sup></span><span class="m rt">1,482 filed</span></div>
        <div style="padding:10px;display:flex;flex-direction:column;gap:10px">
          <div class="b1in" style="min-width:0"><span class="pr">&gt;</span><span class="q">cat losing it</span><i class="caret"></i></div>
          <div class="cgrid" style="grid-template-columns:1fr 1fr">${M.slice(0, 4).map((x, i) => b1Cell(x, i === 0 ? 'match' : '')).join('')}</div>
        </div>
        <div class="ph-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'the field manual · swiss industrial print'], ['type', 'archivo black / space grotesk / space mono + rationed instrument serif'], ['move', '1px-rule compartments; annotation density is the maximalism'], ['density', 'bimodal: dense compartments vs giant headers'], ['motion', 'steps() mechanical, interaction only']])}
    </div>
  </div>`;

  const root = mount.querySelector('.brut1');
  themeToggle(root);
  const press = mount.querySelector('#b1-press');
  if (press) press.addEventListener('click', () => {
    press.classList.remove('pressed'); void press.offsetWidth; press.classList.add('pressed');
  });
  const sgo = mount.querySelector('#b1-stamp-go'), st = mount.querySelector('#b1-stamp');
  if (sgo && st) sgo.addEventListener('click', () => {
    st.hidden = false; st.classList.remove('play'); void st.offsetWidth; st.classList.add('play');
  });
  const lgo = mount.querySelector('#b1-lock-go'), lc = mount.querySelector('#b1-lock-cell');
  if (lgo && lc) { let on = false; lgo.addEventListener('click', () => {
    on = !on; lc.innerHTML = b1Cell(MEMES[0], on ? 'match' : '');
    lc.classList.remove('flick'); void lc.offsetWidth; lc.classList.add('flick');
    lgo.textContent = on ? 'release match' : 'run match';
  }); }
};


/* ================================================================
   BRUT-2 · THE TERMINAL — crt telemetry / tactical interface
   system rule: the entire interface is a terminal session;
   phosphor persistence + data-stream density are the maximalism.
   fonts: VT323 + IBM Plex Mono (both preloaded).
   ================================================================ */

const B2LBL = { '': 'idle', match: 'match✓', near: 'trace', dim: 'faint', selected: 'lock', loading: 'poll…', error: 'err/e' };

function b2Cell(m, state = '') {
  const lbl = B2LBL[state] || 'idle';
  let body = `<div class="b2art" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>`;
  if (state === 'loading') body = `<div class="b2art b2load" style="aspect-ratio:${m.aspect}"><span class="b2load-txt">[ embedding… ${m.file} ]</span></div>`;
  if (state === 'error') body = `<div class="b2art b2errart" style="aspect-ratio:${m.aspect}"><span class="b2err-txt">[[ CORRUPT SEGMENT ]]</span><span class="b2err-txt">vec/${m.vec} failed checksum</span></div>`;
  const scorebar = state === 'loading'
    ? '<span class="b2rail"><i class="b2rail-sweep" style="width:24%"></i></span>'
    : `<span class="b2rail"><i style="width:${m.score}%"></i></span>`;
  return `
  <div class="b2cell ${state === 'error' ? 'b2errc' : state}">
    <div class="b2hd"><span>&lt;${esc(m.file)}&gt;</span><span>0x${m.vec}</span></div>
    ${body}
    <div class="b2cap"><span>${esc(m.cap)}</span>${m.banger ? '<span class="b2banger">BANG</span>' : ''}</div>
    <div class="b2ft">${scorebar}<span class="b2val">${(m.score / 100).toFixed(2)}</span><span>[${lbl}]</span>${state === 'error' ? '<button class="b2btn sm">retry</button>' : ''}</div>
  </div>`;
}

function b2Terminal(q) {
  return `
  <div class="b2term">
    <div class="b2term-bar"><span>tty1 · sploot archive terminal</span><span>rev 3.1</span><span class="b2term-led"></span></div>
    <div class="b2term-body">
      <div class="b2term-line"><span class="b2term-path">sploot@archive:~$</span><span>search --q="${esc(q)}" --mode=vec</span></div>
      <div class="b2term-line"><span>[${'█'.repeat(18)}]</span><span>t=212ms · n=1482 · model=siglip-base · dim=768</span></div>
      <div class="b2term-line"><span class="b2term-match">&gt;&gt; MATCH 94%</span><span>0x0413 · cats-arguing.jpg</span></div>
      <div class="b2term-line b2term-dim"><span>&gt;  NEAR 91%</span><span>0x0088 · weball_final.png</span></div>
      <div class="b2term-line b2term-dim"><span>&gt;  NEAR 88%</span><span>0x1201 · hundo.png</span></div>
      <div class="b2term-line b2term-dim"><span>&gt;  ...</span><span>${LIB.total - 3} more results</span></div>
      <div class="b2term-line"><span class="b2term-path">sploot@archive:~$</span><span class="b2caret">█</span></div>
    </div>
    <div class="b2term-ft"><span>idx/${LIB.total.toLocaleString()}</span><span>mdl/${LIB.model}</span><span>route /api/search</span><span>q:${LIB.queued}</span><span class="b2term-ok">live ■</span></div>
  </div>`;
}

function b2StatusBar() {
  const c = [['index', `${LIB.total.toLocaleString()} vec`], ['model', LIB.model], ['dim', LIB.dim], ['queue', `${LIB.queued} pending`], ['lat', `${LIB.latency}ms`], ['status', 'live ■', 1]];
  return `<div class="b2status">${c.map(([k, v, ok]) => `<span class="b2s-cell ${ok ? 'b2s-ok' : ''}"><b>${k}</b>${v}</span>`).join('')}<span class="b2s-cell b2s-tail">sploot archive v3.1 · all circuits nominal</span></div>`;
}

function b2Swx(list) {
  return `<div class="b2swx">${list.map(([name, ref, hexes, use]) => `
    <div class="b2swx-it"><i style="background:${ref}"></i><b>${name}</b><span>${hexes}</span><span>${use}</span></div>`).join('')}</div>`;
}

SPECS['BRUT-2'] = (mount) => {
  css('BRUT-2', `
  .brut2 {
    --paper:#F6F4EC; --paper2:#EBE7DE; --ink:#1C1C1C; --ink2:rgba(28,28,28,.5);
    --red:#D40000; --red-ink:#A00000; --red-fill:#CC0000; --on-red:#FFFFFF;
    --green:#2D7D2D; --b1:1px solid var(--ink); --b2:2px solid var(--ink); --b3:3px solid var(--ink);
    --term:'IBM Plex Mono',monospace; --disp:'VT323',monospace; --sans:'IBM Plex Mono',monospace; --serif:'Fraunces',serif;
    --tick:90ms;
    min-height:100dvh; display:flex; flex-direction:column; overflow-x:hidden;
    background:var(--paper); color:var(--ink); font-family:var(--term);
  }
  .brut2.theme-dark {
    --paper:#0C0E0A; --paper2:#101410; --ink:#C8D8C0; --ink2:rgba(200,216,192,.45);
    --red:#FF3A3A; --red-ink:#FF6B5E; --red-fill:#FF2A2A; --on-red:#0A0A0A;
    --green:#4AF626; --b1:1px solid var(--ink); --b2:2px solid var(--ink); --b3:3px solid var(--ink);
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,.04) 2px, rgba(0,0,0,.04) 4px),
      radial-gradient(ellipse at center, rgba(200,216,192,.015) 0%, transparent 70%);
  }
  .brut2 :focus-visible { outline:3px solid var(--red); outline-offset:2px; }
  .brut2 a { color:inherit; }
  .brut2 .meme-media { background:var(--paper2); }
  .brut2 .pad { padding:22px clamp(14px,4vw,42px); display:flex; flex-direction:column; gap:22px; align-items:flex-start; }
  .brut2 .row { display:flex; flex-wrap:wrap; gap:14px; align-items:center; }
  .brut2 .cgrid { display:grid; gap:1px; background:var(--ink); border:var(--b2); }
  .brut2 .cgrid > * { background:var(--paper); }
  .brut2 .g4 { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .brut2 .cgrid .b2cell { border:0; }
  .brut2 .cgrid .b2cell::before, .brut2 .cgrid .b2cell::after { display:none; }

  /* masthead */
  .brut2 .mast { display:flex; align-items:stretch; flex-wrap:wrap; border-bottom:var(--b2); font-family:var(--term); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
  .brut2 .mast .logo { font-family:var(--disp); font-size:24px; text-transform:none; padding:8px 16px; border-right:var(--b2); display:flex; align-items:center; }
  .brut2 .mast .logo .dot { color:var(--green); }
  .brut2 .mast nav { display:flex; flex-wrap:wrap; }
  .brut2 .mast nav a { display:flex; align-items:center; min-height:44px; padding:0 14px; border-right:var(--b1); text-decoration:none; }
  .brut2 .mast nav a:hover { background:var(--ink); color:var(--paper); }
  .brut2 .mast .rev { margin-left:auto; display:flex; align-items:center; padding:0 16px; border-left:var(--b1); font-size:9px; color:var(--ink2); }

  /* hero */
  .brut2 .hero { padding:clamp(22px,5vw,50px) clamp(14px,4vw,42px) clamp(22px,4vw,40px); border-bottom:var(--b2); display:flex; flex-direction:column; gap:16px; align-items:flex-start; }
  .brut2 .hero h1 { font-family:var(--disp); font-size:clamp(38px,9vw,110px); line-height:.82; letter-spacing:.02em; text-transform:none; }
  .brut2 .hero h1 .hl { color:var(--red-ink); }
  .brut2 .hero .sub { font-size:13px; line-height:1.6; max-width:60ch; }
  .brut2 .hero .sub .b { color:var(--red-ink); }

  /* section headers */
  .brut2 .sec { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; border-top:var(--b3); border-bottom:var(--b1); padding:10px clamp(14px,4vw,42px); margin-top:clamp(22px,5vw,46px); font-family:var(--term); text-transform:uppercase; font-size:11px; letter-spacing:.1em; }
  .brut2 .sec b { font-family:var(--disp); font-size:clamp(28px,4vw,44px); line-height:1; text-transform:none; }
  .brut2 .sec .tag { margin-left:auto; color:var(--red-ink); }

  /* swatch strip */
  .brut2 .b2swx { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:1px; background:var(--ink); border:var(--b2); width:100%; }
  .brut2 .b2swx-it { background:var(--paper); display:flex; flex-direction:column; font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  .brut2 .b2swx-it i { height:46px; border-bottom:var(--b1); }
  .brut2 .b2swx-it b, .brut2 .b2swx-it span { padding:2px 8px; }
  .brut2 .b2swx-it b { padding-top:7px; font-size:10px; }
  .brut2 .b2swx-it span:last-child { color:var(--ink2); padding-bottom:8px; }

  /* shape specimens */
  .brut2 .shp { width:120px; height:80px; display:grid; place-items:center; text-align:center; font-size:8px; text-transform:uppercase; letter-spacing:.06em; background:var(--paper2); border:var(--b2); padding:4px; }
  .brut2 .shp.ha { border-width:1px; }
  .brut2 .shp.th { border-width:4px; }
  .brut2 .shp.plate { box-shadow:0 0 0 2px var(--paper), 0 0 0 4px var(--ink); }
  .brut2 .shp.scan { background:repeating-linear-gradient(0deg, var(--paper) 0 10px, var(--paper2) 10px 20px); }
  .brut2 .shp.xh { position:relative; }
  .brut2 .shp.xh::before { content:'+'; position:absolute; top:-7px; left:-6px; font:700 12px var(--term); color:var(--red-ink); }

  /* type specimen */
  .brut2 .trow { display:grid; grid-template-columns:120px 1fr; gap:14px; align-items:baseline; border-top:var(--b1); padding:12px 0; width:100%; }
  .brut2 .trow .lab { color:var(--ink2); font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
  .brut2 .tdisp { font-family:var(--disp); font-size:clamp(34px,5vw,60px); line-height:.9; letter-spacing:.02em; }
  .brut2 .tbody { font-size:16px; max-width:56ch; }
  .brut2 .tnum { font-size:26px; font-variant-numeric:tabular-nums; }
  .brut2 .tcap { font-size:13px; max-width:44ch; border-left:3px solid var(--red); padding-left:12px; line-height:1.5; }
  .brut2 .tserif { font-family:var(--serif); font-style:italic; font-size:clamp(20px,3vw,32px); max-width:28ch; line-height:1.15; padding:6px 0; position:relative; }
  .brut2 .tserif::after { content:''; position:absolute; inset:0; background-image:radial-gradient(var(--ink) .6px, transparent .6px); background-size:4px 4px; opacity:.12; pointer-events:none; }

  /* terminal console */
  .brut2 .b2term { width:100%; max-width:860px; border:var(--b2); background:var(--paper); }
  .brut2 .b2term-bar { display:flex; gap:14px; padding:7px 12px; background:var(--ink); color:var(--paper); font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
  .brut2 .b2term-led { margin-left:auto; width:8px; height:8px; background:var(--green); }
  .brut2 .b2term-body { padding:10px 12px; display:flex; flex-direction:column; gap:4px; font-size:12px; border-bottom:var(--b1); }
  .brut2 .b2term-line { display:flex; gap:8px; }
  .brut2 .b2term-path { color:var(--red-ink); }
  .brut2 .b2term-match { color:var(--green); }
  .brut2 .b2term-dim { opacity:.5; }
  .brut2 .b2caret { color:var(--green); animation:b2blink 0.9s steps(1) infinite; }
  .brut2 .b2term-ft { display:flex; flex-wrap:wrap; gap:12px; padding:6px 12px; background:var(--paper2); font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  .brut2 .b2term-ok { margin-left:auto; color:var(--green); }

  /* buttons */
  .brut2 .b2btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 18px; border:var(--b2); background:var(--paper); color:var(--ink); font-family:var(--term); font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.06em; cursor:pointer; transition:transform var(--tick) steps(2,end); }
  .brut2 .b2btn:hover { background:var(--ink); color:var(--paper); }
  .brut2 .b2btn:active { transform:translate(2px,2px); }
  .brut2 .b2btn.primary { background:var(--red-fill); color:var(--on-red); }
  .brut2 .b2btn.sm { min-height:30px; padding:0 10px; font-size:9px; border-width:1px; }
  .brut2 .b2btn.icon { width:44px; padding:0; }
  .brut2 .b2btn.flash { animation:b2flash 140ms steps(2,end); }

  /* tags, banger, toast, tabs, input */
  .brut2 .b2tag { font-size:10px; padding:5px 9px; border:var(--b1); text-transform:uppercase; letter-spacing:.06em; }
  .brut2 .b2tag::before { content:'<'; color:var(--red-ink); }
  .brut2 .b2tag::after { content:'>'; color:var(--red-ink); }
  .brut2 .b2banger { flex:none; background:var(--red-fill); color:var(--on-red); font-weight:700; font-size:9px; text-transform:uppercase; letter-spacing:.08em; padding:2px 6px; }
  .brut2 .b2toast { display:inline-flex; gap:10px; align-items:center; border:var(--b2); border-left:6px solid var(--green); background:var(--paper); padding:9px 12px; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .brut2 .b2tabs { display:flex; border:var(--b2); width:max-content; }
  .brut2 .b2tab { min-height:44px; padding:0 16px; background:var(--paper); color:var(--ink); border:0; border-right:var(--b1); font-size:10px; text-transform:uppercase; letter-spacing:.06em; cursor:pointer; }
  .brut2 .b2tab:last-child { border-right:0; }
  .brut2 .b2tab.on { background:var(--ink); color:var(--paper); box-shadow:inset 0 -3px 0 var(--green); font-weight:700; }
  .brut2 .b2in { display:flex; align-items:center; gap:9px; min-height:44px; min-width:220px; padding:0 12px; border:var(--b2); background:var(--paper); font-size:13px; text-transform:uppercase; letter-spacing:.04em; }
  .brut2 .b2in .pr { color:var(--red-ink); }
  .brut2 .b2in .caret { width:9px; height:18px; background:var(--green); animation:b2blink 0.9s steps(1) infinite; }

  /* stats */
  .brut2 .b2stat { padding:12px 14px; display:flex; flex-direction:column; gap:4px; min-width:150px; }
  .brut2 .b2stat .v { font-family:var(--disp); font-size:38px; line-height:1; }

  /* status bar */
  .brut2 .b2status { display:flex; flex-wrap:wrap; align-items:stretch; border-top:var(--b2); background:var(--ink); color:var(--paper); font-size:10px; text-transform:uppercase; letter-spacing:.06em; width:100%; }
  .brut2 .b2s-cell { display:flex; gap:8px; align-items:center; padding:8px 14px; border-right:1px solid var(--paper2); }
  .brut2 .b2s-cell b { opacity:.6; font-weight:400; }
  .brut2 .b2s-ok { color:var(--green); }
  .brut2 .b2s-tail { margin-left:auto; border-right:0; opacity:.5; }

  /* meme cell */
  .brut2 .b2cell { position:relative; display:flex; flex-direction:column; border:var(--b2); background:var(--paper); }
  .brut2 .b2cell::before { content:'+'; position:absolute; top:-10px; left:-8px; font:700 12px var(--term); color:var(--red-ink); z-index:2; }
  .brut2 .b2cell::after { content:'+'; position:absolute; bottom:-10px; right:-8px; font:700 12px var(--term); color:var(--red-ink); z-index:2; }
  .brut2 .b2hd { display:flex; justify-content:space-between; gap:8px; padding:5px 8px; font-size:9px; text-transform:uppercase; letter-spacing:.06em; border-bottom:var(--b1); white-space:nowrap; overflow:hidden; }
  .brut2 .b2art { display:grid; place-items:center; overflow:hidden; background:var(--paper2); border-bottom:var(--b1); }
  .brut2 .b2cap { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 9px; font-size:12px; line-height:1.4; }
  .brut2 .b2ft { display:flex; align-items:center; gap:8px; border-top:var(--b1); padding:6px 8px; font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  .brut2 .b2rail { flex:1; height:6px; border:var(--b1); position:relative; min-width:40px; }
  .brut2 .b2rail i { position:absolute; top:0; left:0; bottom:0; background:var(--green); }
  .brut2 .b2rail-sweep { animation:b2sweep 1.2s steps(8) infinite; }
  .brut2 .b2val { color:var(--red-ink); }
  .brut2 .b2cell.match { border-color:var(--green); box-shadow:0 0 0 2px var(--paper), 0 0 0 4px var(--green); z-index:3; }
  .brut2 .b2cell.match .b2hd { background:var(--green); color:var(--paper); border-color:var(--green); }
  .brut2 .b2cell.near { border-style:dashed; border-color:var(--red-ink); }
  .brut2 .b2cell.dim { opacity:.35; filter:grayscale(.6); }
  .brut2 .b2cell.selected { border-width:4px; }
  .brut2 .b2cell.selected .b2hd { background:var(--ink); color:var(--paper); }
  .brut2 .b2cell.b2errc { border-color:var(--red); }
  .brut2 .b2cell.b2errc .b2hd { background:var(--red-fill); color:var(--on-red); }
  .brut2 .b2errart { display:grid; place-items:center; text-align:center; gap:4px; background:repeating-linear-gradient(45deg, transparent 0 8px, rgba(255,42,42,.08) 8px 16px) var(--paper2); padding:10px; }
  .brut2 .b2err-txt { font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
  .brut2 .b2load { display:grid; place-items:center; background:repeating-linear-gradient(0deg, var(--paper2) 0 8px, var(--paper) 8px 16px); animation:b2slide .6s steps(4) infinite; }
  .brut2 .b2load-txt { font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink2); }
  .brut2 .b2stamp { display:inline-block; border:2px solid var(--green); padding:6px 10px; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--green); transform:rotate(-2deg); }
  .brut2 .b2stamp.pop { animation:b2pop 140ms steps(2,end); }

  /* empty state */
  .brut2 .b2empty { border:var(--b3); border-style:dashed; background:var(--paper2); padding:24px; display:flex; flex-direction:column; gap:12px; align-items:flex-start; max-width:480px; }
  .brut2 .b2empty .big { font-family:var(--disp); font-size:clamp(24px,4vw,36px); line-height:.9; }

  /* workbench */
  .brut2 .bench { width:100%; border:var(--b2); background:var(--paper); }
  .brut2 .bb-bar { display:flex; gap:12px; align-items:center; flex-wrap:wrap; padding:10px 14px; border-bottom:var(--b2); }
  .brut2 .bb-bar .logo { font-family:var(--disp); font-size:20px; }
  .brut2 .bb-bar .logo .dot { color:var(--green); }
  .brut2 .bb-body { display:flex; gap:16px; padding:16px; align-items:flex-start; }
  .brut2 .bb-rail { display:flex; flex-direction:column; gap:8px; min-width:200px; }
  .brut2 .bb-pile { display:flex; justify-content:space-between; gap:10px; padding:8px 10px; min-height:38px; border:var(--b1); background:var(--paper); font-size:10px; text-transform:uppercase; letter-spacing:.04em; cursor:pointer; text-align:left; color:var(--ink); }
  .brut2 .bb-pile b { color:var(--red-ink); }
  .brut2 .bb-pile.on { border:var(--b2); box-shadow:inset 3px 0 0 var(--green); font-weight:700; }

  /* phone */
  .brut2 .b2phone { width:390px; max-width:100%; border:var(--b3); background:var(--paper); }
  .brut2 .ph-mast { display:flex; justify-content:space-between; align-items:center; padding:9px 12px; border-bottom:var(--b2); }
  .brut2 .ph-mast .logo { font-family:var(--disp); font-size:20px; }
  .brut2 .ph-dock { display:flex; border-top:var(--b2); }
  .brut2 .ph-dock button { flex:1; min-height:52px; background:var(--paper); color:var(--ink); border:0; border-right:var(--b1); font-size:9px; text-transform:uppercase; letter-spacing:.06em; cursor:pointer; }
  .brut2 .ph-dock button:last-child { border-right:0; }
  .brut2 .ph-dock button.on { background:var(--ink); color:var(--paper); box-shadow:inset 0 -3px 0 var(--green); }

  /* b2grid for cgrid variant */
  .brut2 .b2grid { display:grid; gap:1px; background:var(--ink); border:var(--b2); }
  .brut2 .b2grid > * { background:var(--paper); }
  .brut2 .b2grid.g2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .brut2 .b2grid .b2cell { border:0; }
  .brut2 .b2grid .b2cell::before, .brut2 .b2grid .b2cell::after { display:none; }

  @keyframes b2blink { 50% { opacity:0; } }
  @keyframes b2sweep { to { width:100%; } }
  @keyframes b2slide { to { background-position:0 32px; } }
  @keyframes b2flash { 0% { background:var(--red-fill); color:var(--on-red); transform:translate(3px,3px); } }
  @keyframes b2pop { 0% { opacity:0; transform:scale(1.5) rotate(-10deg); } 100% { opacity:1; transform:scale(1) rotate(-2deg); } }
  @keyframes b2boot { 0% { opacity:0.3; transform:translateY(1px); } 50% { opacity:1; } 100% { opacity:0.3; } }
  @media (prefers-reduced-motion: reduce) {
    .brut2 *, .brut2 *::before, .brut2 *::after { animation:none !important; transition:none !important; }
  }
  @media (max-width:720px) {
    .brut2 .g4 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .brut2 .bb-body { flex-direction:column; }
    .brut2 .bb-rail { flex-direction:row; flex-wrap:wrap; min-width:0; }
    .brut2 .trow { grid-template-columns:1fr; gap:4px; }
    .brut2 .b2in { min-width:0; width:100%; }
  }
  `);

  const M = MEMES;
  mount.innerHTML = `
  <div class="brut2">
    <header class="mast">
      <span class="logo">spl<span class="dot">●</span>t</span>
      <nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">upload</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
      <span class="rev">rev 3.1 · terminal</span>
    </header>

    <section class="hero">
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink2)">[ private archive · ${LIB.total.toLocaleString()} vectors indexed ]</span>
      <h1>type words.<br>get the <span class="hl">picture.</span></h1>
      <p class="sub">no folders. <span class="b">just vibes.</span> the terminal indexes every image by meaning. it never sleeps and it never asks permission.</p>
      ${b2Terminal('cat losing it')}
      <div class="cgrid g4" style="width:100%">${M.slice(0, 4).map((x, i) => b2Cell(x, i === 0 ? 'match' : '')).join('')}</div>
    </section>

    <div class="sec"><b>01</b><span>[ foundations ]</span><span class="tag">sheet 1/6 · tokens rules plates</span></div>
    <div class="pad">
      ${b2Swx([
        ['substrate', 'var(--paper)', '#F6F4EC / #0C0E0A', 'substrate'],
        ['paper 2', 'var(--paper2)', '#EBE7DE / #101410', 'fill zone'],
        ['ink', 'var(--ink)', '#1C1C1C / #C8D8C0', 'carbon / phosphor'],
        ['hazard red', 'var(--red)', '#D40000 / #FF3A3A', 'graphic accent'],
        ['red ink', 'var(--red-ink)', '#A00000 / #FF6B5E', 'small red text, aa'],
        ['phosphor', 'var(--green)', '#2D7D2D / #4AF626', 'match · live · led'],
      ])}
      <div class="row">
        <div class="shp ha">1px · signal trace</div>
        <div class="shp">2px · object bound</div>
        <div class="shp th">4px · locked / selected</div>
        <div class="shp plate">double plate · elevation</div>
        <div class="shp scan">scanline · live poll</div>
        <div class="shp xh">crosshair · pin</div>
        <div class="shp">radius 0 · always</div>
      </div>
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink2)">spacing on a 8px machine grid. elements are separated by 1px rules or terminal whitespace. nothing floats, nothing rounds.</p>
    </div>

    <div class="sec"><b>02</b><span>[ type ]</span><span class="tag">sheet 2/6 · four voices</span></div>
    <div class="pad" style="gap:0">
      <div class="trow"><span class="lab">display</span><div class="tdisp">upload chaos</div></div>
      <div class="trow"><span class="lab">body</span><div class="tbody">ibm plex mono carries every line of text. the pile sorts itself into semantic clusters while you sleep. no folders were compiled.</div></div>
      <div class="trow"><span class="lab">label</span><div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em">[ label · terminal upper ] · [ &lt;metadata&gt; ]</div></div>
      <div class="trow"><span class="lab">metadata</span><div style="font-size:9px;color:var(--ink2);text-transform:uppercase;letter-spacing:.06em">0x0413 · sim 0.94 · 212ms · siglip-base · 768d · /api/search</div></div>
      <div class="trow"><span class="lab">tabular</span><div class="tnum">1,482 · 0.94 · 212ms · 768</div></div>
      <div class="trow"><span class="lab">caption</span><div class="tcap">long caption wrap test: me explaining to the group chat why the spreadsheet cell that broke me is now framed above my desk like a diploma.</div></div>
      <div class="trow"><span class="lab">serif</span><div><div class="tserif">a beautiful archive of extremely stupid images</div><p style="font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink2);margin-top:6px">fraunces italic appears once per page under halftone veil. that is the entire serif budget.</p></div></div>
    </div>

    <div class="sec"><b>03</b><span>[ components ]</span><span class="tag">sheet 3/6 · the kit</span></div>
    <div class="pad">
      ${b2Terminal('sad frog')}
      <div class="cgrid g4" style="width:100%">
        ${b2Cell(M[1])}${b2Cell(M[0], 'match')}${b2Cell(M[2], 'near')}${b2Cell(M[3], 'dim')}
        ${b2Cell(M[4], 'selected')}${b2Cell(M[5], 'loading')}${b2Cell(M[7], 'error')}
        <div class="b2empty" style="border:0;max-width:none"><span class="big">[ empty stream ]</span><p style="font-size:13px;max-width:38ch">the pile is an empty buffer. zero thoughts detected. upload chaos and the terminal starts indexing.</p><button class="b2btn primary">upload chaos</button></div>
      </div>
      <div class="row">
        <button class="b2btn primary">find it</button>
        <button class="b2btn">shuffle the pile</button>
        <button class="b2btn sm">compact</button>
        <button class="b2btn icon" aria-label="close">✕</button>
        <span class="b2tag">reaction faces</span>
        <span class="b2tag">cats being unwell</span>
        <span class="b2banger">BANG</span>
      </div>
      <div class="row">
        <div class="b2in"><span class="pr">&gt;</span><span>text input</span><span class="caret"></span></div>
        <div class="b2tabs" role="tablist"><button class="b2tab on">all</button><button class="b2tab">bangers</button><button class="b2tab">recent</button></div>
        <div class="b2toast">■ saved to pile. filed under vibes.</div>
      </div>
      <div class="cgrid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));width:100%;max-width:640px">
        <div class="b2stat"><span style="font-size:9px;text-transform:uppercase;color:var(--ink2)">folders required</span><span class="v">0</span></div>
        <div class="b2stat"><span style="font-size:9px;text-transform:uppercase;color:var(--ink2)">memes indexed</span><span class="v">1,482</span></div>
        <div class="b2stat"><span style="font-size:9px;text-transform:uppercase;color:var(--red-ink)">bangers</span><span class="v" style="color:var(--red)">37</span></div>
      </div>
    </div>
    ${b2StatusBar()}

    <div class="sec"><b>04</b><span>[ motion ]</span><span class="tag">sheet 4/6 · interaction only</span></div>
    <div class="pad">
      <div class="row">
        <button class="b2btn primary" id="b2-press">press me</button>
        <button class="b2btn" id="b2-stamp-go">certify banger</button>
        <span class="b2stamp" id="b2-stamp" hidden>&lt;BANGER&gt;</span>
        <button class="b2btn" id="b2-boot-go">run boot</button>
      </div>
      <div class="b2grid g2" style="width:min(460px,100%)" id="b2-boot-cell">${b2Cell(M[0])}${b2Cell(M[1])}</div>
      <p style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink2)">motion is steps(), 90 to 140ms, fired by interaction. prefers-reduced-motion collapses everything to an instant state change. the scanline sweep is a background-position animation; in reduced motion it is static.</p>
    </div>

    <div class="sec"><b>05</b><span>[ compositions ]</span><span class="tag">sheet 5/6 · workbench + field unit</span></div>
    <div class="pad">
      <div class="bench">
        <div class="bb-bar">
          <span class="logo">spl<span class="dot">●</span>t</span>
          <div class="b2in" style="flex:1;max-width:440px"><span class="pr">&gt;</span><span>search the pile</span><span class="caret"></span></div>
          <button class="b2btn primary">find it</button>
          <button class="b2btn">upload chaos</button>
        </div>
        <div class="bb-body">
          <aside class="bb-rail">
            <span style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink2);padding:4px 0">[ automatic piles ]</span>
            ${PILES.map((p, i) => `<button class="bb-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}
          </aside>
          <div class="cgrid g4" style="flex:1">${M.slice(0, 8).map(x => b2Cell(x)).join('')}</div>
        </div>
        ${b2StatusBar()}
      </div>
      <div class="b2phone">
        <div class="ph-mast"><span class="logo">spl<span class="dot">●</span>t</span><span style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink2)">1,482 filed</span></div>
        <div style="padding:10px;display:flex;flex-direction:column;gap:10px">
          <div class="b2in" style="min-width:0"><span class="pr">&gt;</span><span>cat losing it</span><span class="caret"></span></div>
          <div class="b2grid g2">${M.slice(0, 4).map((x, i) => b2Cell(x, i === 0 ? 'match' : '')).join('')}</div>
        </div>
        <div class="ph-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'the terminal · crt telemetry'], ['type', 'vt323 / ibm plex mono + rationed fraunces italic'], ['move', 'the interface IS a terminal; phosphor persistence + data-stream density are the maximalism'], ['density', 'terminal scrollback + scanline scan'], ['motion', 'steps() mechanical, blink caret, poll sweep']])}
    </div>
  </div>`;

  const root = mount.querySelector('.brut2');
  themeToggle(root);
  const press = root.querySelector('#b2-press');
  if (press) press.addEventListener('click', () => {
    press.classList.remove('flash'); void press.offsetWidth; press.classList.add('flash');
  });
  const sgo = root.querySelector('#b2-stamp-go'), st = root.querySelector('#b2-stamp');
  if (sgo && st) sgo.addEventListener('click', () => {
    st.hidden = false; st.classList.remove('pop'); void st.offsetWidth; st.classList.add('pop');
  });
  const bgo = root.querySelector('#b2-boot-go'), bc = root.querySelector('#b2-boot-cell');
  if (bgo && bc) { let on = false; bgo.addEventListener('click', () => {
    on = !on; bc.innerHTML = on
      ? b2Cell(MEMES[0], 'match') + b2Cell(MEMES[1], 'match')
      : b2Cell(MEMES[0]) + b2Cell(MEMES[1]);
    bgo.textContent = on ? 'release lock' : 'run boot';
  }); }
};



})();

/* ================================================================
   BRUT-3 · THE DECLASSIFIED WALL — evidence locker / redaction bureaucracy
   system rule: everything is evidence pinned to the wall; redaction bars,
   authentication stamps, and chain-of-custody metadata are the maximalism.
   fonts: Bricolage Grotesque, Barlow Condensed, Fraunces, Space Mono
   (all preloaded). @import: none.
   ================================================================ */

(() => {
'use strict';

const B3LBL = { '': 'filed', match: 'verified', near: 'related', dim: 'cold trail', selected: 'review', loading: 'processing', error: 'redacted' };

function b3Cell(m, state = '') {
  const lbl = B3LBL[state] || 'filed';
  const pin = state === 'match'
    ? '<span class="b3pin" style="top:-16px;left:12px;color:var(--accent);">●</span>'
    : '';
  let art = `<div class="b3art" style="aspect-ratio:${m.aspect}">${memeImg(m)}<div class="b3dither"></div></div>`;
  if (state === 'loading') art = `<div class="b3art b3load" style="aspect-ratio:${m.aspect}"><div class="b3prog"><span>processing</span><div class="b3bar"><i></i></div><span>${m.file}</span></div></div>`;
  if (state === 'error') art = `<div class="b3art b3err" style="aspect-ratio:${m.aspect}"><div class="b3err-box"><span class="b3err-stamp">redacted</span><span>this evidence has been sealed.</span><span>exhibit ${m.vec} withdrawn.</span></div></div>`;
  return `
  <div class="b3cell ${state === 'error' ? 'b3cell-e' : ''} ${state === 'match' ? 'b3cell-m' : ''} ${state === 'selected' ? 'b3cell-s' : ''} ${state === 'near' ? 'b3cell-n' : ''} ${state === 'dim' ? 'b3cell-d' : ''}">
    ${pin}
    <div class="b3hd"><span class="b3evid">EXHIBIT-${m.vec}</span><span class="b3date">${state === 'loading' ? 'PENDING' : new Date(2025, 5, 16 + m.score % 12).toISOString().slice(0, 10)}</span></div>
    ${art}
    <div class="b3cap"><span>${esc(m.cap)}</span>${m.banger ? '<span class="b3banger">BANGER</span>' : ''}</div>
    <div class="b3ft"><span class="b3lbl">${lbl}</span><span class="b3score">${(m.score / 100).toFixed(2)}</span>${state === 'error' ? '<button class="b3btn sm">unseal</button>' : ''}</div>
    ${state === 'match' ? '<div class="b3stamp">VERIFIED<br><small>'.concat(new Date().toISOString().slice(0, 10)).concat('</small></div>') : ''}
    <div class="b3redact" style="top:${30 + m.score % 20}%;height:${8 + m.score % 10}%"></div>
  </div>`;
}

function b3Dossier(q) {
  return `
  <div class="b3dossier">
    <div class="b3dos-hd">
      <span>REQUEST FOR SEARCH</span>
      <span>AUTHORITY: SPLOOT ARCHIVE · CLASS: UNRESTRICTED</span>
      <span class="b3dos-ref">REF: #SPL-${LIB.total}-${Math.floor(Date.now() / 1000) % 900 + 100}</span>
    </div>
    <div class="b3dos-body">
      <div class="b3dos-field">
        <span class="b3dos-label">SEARCH TERM:</span>
        <span class="b3dos-redacted">${esc(q)}</span>
      </div>
      <div class="b3dos-field">
        <span class="b3dos-label">SCOPE:</span>
        <span>${LIB.total.toLocaleString()} indexed vectors · model ${LIB.model} · ${LIB.dim}d · latency ~${LIB.latency}ms</span>
      </div>
      <div class="b3dos-field b3dos-result">
        <span class="b3dos-label">FINDINGS:</span>
        <span>match 94% · exhibit-0413 · cats-arguing.jpg · ———</span>
      </div>
      <button class="b3dos-submit">EXECUTE SEARCH</button>
    </div>
    <div class="b3dos-ft">
      <span>DATE: ${new Date().toISOString().slice(0, 10)}</span>
      <span>AGENT: ANON</span>
      <span>CASE: ${String.fromCharCode(65 + LIB.total % 26)}-${LIB.dim}-${LIB.queued}${LIB.latency % 10}</span>
      <span class="b3dos-stamp">● LIVE</span>
    </div>
  </div>`;
}

function b3EvidenceBar() {
  const c = [['index', `${LIB.total.toLocaleString()} files`], ['embedded', `${LIB.embedded} of ${LIB.total}`], ['queue', `${LIB.queued} pending`], ['model', LIB.model], ['status', 'live ■', 1]];
  return `<div class="b3evibar">${c.map(([k, v, ok]) => `<span class="b3evi-cell ${ok ? 'b3evi-ok' : ''}"><b>${k}</b>${v}</span>`).join('')}<span class="b3evi-cell b3evi-tail">sploot evidence lockup · all exhibits accounted for</span></div>`;
}

function b3Swx(list) {
  return `<div class="b3swx">${list.map(([name, ref, hexes, use]) => `
    <div class="b3swx-it"><i style="background:${ref}"></i><b>${name}</b><span>${hexes}</span><span>${use}</span></div>`).join('')}</div>`;
}

SPECS['BRUT-3'] = (mount) => {
  css('BRUT-3', `
  .brut3 {
    --paper:#F2EDE0; --paper2:#E6DFCD; --ink:#141414; --ink2:rgba(20,20,20,.55);
    --red:#C81010; --red-ink:#9B0000; --red-fill:#B80D0D; --on-red:#FFFFFF;
    --accent:#C81010; --b1:1px solid var(--ink); --b2:2px solid var(--ink); --b3:3px solid var(--ink);
    --disp:'Bricolage Grotesque',sans-serif; --sans:'Space Grotesk',sans-serif;
    --cond:'Barlow Condensed',sans-serif; --serif:'Fraunces',serif;
    --meta:'Space Mono',monospace; --tick:100ms;
    min-height:100dvh; display:flex; flex-direction:column; overflow-x:hidden;
    background:var(--paper); color:var(--ink); font-family:var(--sans);
  }
  .brut3.theme-dark {
    --paper:#14120E; --paper2:#1C1A14; --ink:#E8E0D4; --ink2:rgba(232,224,212,.5);
    --red:#FF3B3B; --red-ink:#FF6B5E; --red-fill:#FF2A2A; --on-red:#0A0A0A;
    --accent:#FF3B3B; --b1:1px solid var(--ink); --b2:2px solid var(--ink); --b3:3px solid var(--ink);
  }
  .brut3 :focus-visible { outline:3px solid var(--red); outline-offset:2px; }
  .brut3 a { color:inherit; }
  .brut3 .meme-media { background:var(--paper2); }
  .brut3 .pad { padding:22px clamp(14px,4vw,42px); display:flex; flex-direction:column; gap:22px; align-items:flex-start; }
  .brut3 .row { display:flex; flex-wrap:wrap; gap:14px; align-items:center; }
  .brut3 .cgrid { display:grid; gap:1px; background:var(--ink); border:var(--b2); }
  .brut3 .cgrid > * { background:var(--paper); }
  .brut3 .g4 { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .brut3 .cgrid .b3cell { border:0; }
  .brut3 .cgrid .b3redact { display:none; }

  /* masthead */
  .brut3 .mast { display:flex; align-items:stretch; flex-wrap:wrap; border-bottom:var(--b3); background:var(--ink); color:var(--paper); }
  .brut3 .mast .logo { font-family:var(--disp); font-size:22px; font-weight:800; text-transform:uppercase; padding:8px 16px; border-right:2px solid var(--paper2); display:flex; align-items:center; gap:8px; }
  .brut3 .mast .logo .ev { font-family:var(--meta); font-size:9px; text-transform:uppercase; color:var(--red); border:1px solid var(--red); padding:2px 6px; }
  .brut3 .mast nav { display:flex; flex-wrap:wrap; }
  .brut3 .mast nav a { display:flex; align-items:center; min-height:44px; padding:0 16px; border-right:1px solid rgba(255,255,255,.15); font-family:var(--cond); font-size:14px; text-transform:uppercase; letter-spacing:.06em; text-decoration:none; }
  .brut3 .mast nav a:hover { background:var(--red-fill); }
  .brut3 .mast .case { margin-left:auto; display:flex; align-items:center; padding:0 16px; font-family:var(--meta); font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:rgba(255,255,255,.5); }

  /* hero */
  .brut3 .hero { position:relative; padding:clamp(24px,5vw,56px) clamp(14px,4vw,42px) clamp(24px,4vw,42px); border-bottom:var(--b3); display:flex; flex-direction:column; gap:18px; align-items:flex-start; }
  .brut3 .hero .cls { font-family:var(--cond); font-size:17px; text-transform:uppercase; letter-spacing:.14em; color:var(--red-ink); }
  .brut3 .hero h1 { font-family:var(--disp); font-weight:800; font-size:clamp(44px,10vw,130px); line-height:.82; letter-spacing:-.025em; text-transform:uppercase; max-width:14ch; }
  .brut3 .hero h1 .box { background:var(--ink); color:var(--paper); padding:0 .12em; }
  .brut3 .hero .sub { font-size:15px; line-height:1.5; max-width:52ch; }
  .brut3 .hero .sub .rd { background:var(--ink); color:var(--paper); padding:0 4px; }
  .brut3 .hero .cords { position:absolute; right:14px; bottom:10px; font-family:var(--meta); font-size:8px; text-transform:uppercase; letter-spacing:.12em; color:var(--ink2); }

  /* section headers */
  .brut3 .sec { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; border-top:var(--b3); border-bottom:var(--b1); padding:10px clamp(14px,4vw,42px); margin-top:clamp(22px,5vw,46px); }
  .brut3 .sec b { font-family:var(--disp); font-weight:800; font-size:clamp(28px,4vw,44px); line-height:1; text-transform:uppercase; }
  .brut3 .sec .ref { margin-left:auto; font-family:var(--meta); font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink2); }

  /* swatch strip */
  .brut3 .b3swx { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:1px; background:var(--ink); border:var(--b2); width:100%; }
  .brut3 .b3swx-it { background:var(--paper); display:flex; flex-direction:column; font-family:var(--meta); font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  .brut3 .b3swx-it i { height:46px; border-bottom:var(--b1); }
  .brut3 .b3swx-it b, .brut3 .b3swx-it span { padding:2px 8px; }
  .brut3 .b3swx-it b { padding-top:7px; font-size:10px; }
  .brut3 .b3swx-it span:last-child { color:var(--ink2); padding-bottom:8px; }

  /* shape specimens */
  .brut3 .shp { width:120px; height:80px; display:grid; place-items:center; text-align:center; font-family:var(--meta); font-size:8px; text-transform:uppercase; letter-spacing:.05em; background:var(--paper2); border:var(--b2); padding:4px; }
  .brut3 .shp.ha { border-width:1px; }
  .brut3 .shp.th { border-width:4px; }
  .brut3 .shp.plate { box-shadow:0 0 0 2px var(--paper), 0 0 0 5px var(--ink); }
  .brut3 .shp.dth { position:relative; }
  .brut3 .shp.dth::after { content:''; position:absolute; inset:0; background-image:radial-gradient(var(--ink) .7px, transparent .7px); background-size:5px 5px; opacity:.14; }
  .brut3 .shp.redx { position:relative; }
  .brut3 .shp.redx::before { content:'■'; position:absolute; top:8px; right:8px; font-size:18px; color:var(--red-fill); }

  /* type specimen */
  .brut3 .trow { display:grid; grid-template-columns:120px 1fr; gap:14px; align-items:baseline; border-top:var(--b1); padding:12px 0; width:100%; }
  .brut3 .trow .lab { color:var(--ink2); font-family:var(--meta); font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  .brut3 .tdisp { font-family:var(--disp); font-weight:800; text-transform:uppercase; font-size:clamp(36px,5.4vw,62px); line-height:.86; letter-spacing:-.02em; }
  .brut3 .tcond { font-family:var(--cond); font-weight:800; font-size:clamp(28px,4vw,46px); line-height:1; text-transform:uppercase; letter-spacing:.04em; }
  .brut3 .tbody { font-size:17px; max-width:56ch; }
  .brut3 .tnum { font-family:var(--meta); font-size:26px; font-variant-numeric:tabular-nums; }
  .brut3 .tcap { font-size:13px; max-width:44ch; border-left:4px solid var(--ink); padding:2px 12px; line-height:1.5; background:var(--paper2); }
  .brut3 .tserif { font-family:var(--serif); font-style:italic; font-size:clamp(20px,3vw,32px); max-width:28ch; line-height:1.15; padding:6px 0; border-bottom:var(--b2); border-bottom-style:dashed; }
  .brut3 .tredaction { display:inline; background:var(--ink); color:var(--paper); padding:0 6px; line-height:1.6; }

  /* dossier (search console) */
  .brut3 .b3dossier { width:100%; max-width:860px; border:var(--b2); background:var(--paper); }
  .brut3 .b3dos-hd { display:flex; gap:14px; flex-wrap:wrap; padding:8px 14px; background:var(--ink); color:var(--paper); font-family:var(--cond); font-size:14px; text-transform:uppercase; letter-spacing:.08em; }
  .brut3 .b3dos-ref { margin-left:auto; font-family:var(--meta); font-size:9px; opacity:.7; }
  .brut3 .b3dos-body { padding:14px; display:flex; flex-direction:column; gap:10px; border-bottom:var(--b1); }
  .brut3 .b3dos-field { display:flex; gap:10px; align-items:baseline; font-size:13px; }
  .brut3 .b3dos-label { font-family:var(--cond); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--red-ink); min-width:100px; flex:none; }
  .brut3 .b3dos-redacted { background:var(--ink); color:var(--paper); padding:1px 8px; }
  .brut3 .b3dos-result { border-top:var(--b1); padding-top:10px; font-family:var(--meta); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .brut3 .b3dos-submit { display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:0 24px; background:var(--ink); color:var(--paper); border:0; font-family:var(--cond); font-weight:700; font-size:15px; text-transform:uppercase; letter-spacing:.12em; cursor:pointer; align-self:flex-start; }
  .brut3 .b3dos-submit:hover { background:var(--red-fill); }
  .brut3 .b3dos-ft { display:flex; flex-wrap:wrap; gap:14px; padding:8px 14px; background:var(--paper2); font-family:var(--meta); font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  .brut3 .b3dos-stamp { margin-left:auto; color:var(--red); }

  /* buttons */
  .brut3 .b3btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 20px; border:var(--b2); background:var(--paper); color:var(--ink); font-family:var(--cond); font-weight:700; font-size:14px; text-transform:uppercase; letter-spacing:.1em; cursor:pointer; transition:transform var(--tick); }
  .brut3 .b3btn:hover { background:var(--ink); color:var(--paper); }
  .brut3 .b3btn:active { transform:scale(.96); }
  .brut3 .b3btn.primary { background:var(--red-fill); color:var(--on-red); }
  .brut3 .b3btn.sm { min-height:30px; padding:0 10px; font-size:11px; border-width:1px; font-family:var(--meta); letter-spacing:.04em; }
  .brut3 .b3btn.icon { width:44px; padding:0; }
  .brut3 .b3btn.hit { animation:b3hit 140ms; }

  /* tags, banger, toast, tabs, input */
  .brut3 .b3tag { font-family:var(--cond); font-size:13px; font-weight:700; text-transform:uppercase; padding:6px 10px; border:var(--b1); letter-spacing:.06em; }
  .brut3 .b3banger { flex:none; background:var(--red-fill); color:var(--on-red); font-family:var(--cond); font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.12em; padding:3px 8px; transform:rotate(1.5deg); }
  .brut3 .b3toast { display:inline-flex; gap:10px; align-items:center; border:var(--b2); border-left:8px solid var(--ink); background:var(--paper); padding:10px 14px; font-family:var(--cond); font-size:13px; text-transform:uppercase; letter-spacing:.06em; font-weight:700; }
  .brut3 .b3tabs { display:flex; border:var(--b2); width:max-content; }
  .brut3 .b3tab { min-height:44px; padding:0 18px; background:var(--paper); color:var(--ink); border:0; border-right:var(--b1); font-family:var(--cond); font-weight:700; font-size:13px; text-transform:uppercase; letter-spacing:.06em; cursor:pointer; }
  .brut3 .b3tab:last-child { border-right:0; }
  .brut3 .b3tab.on { background:var(--ink); color:var(--paper); }
  .brut3 .b3in { display:flex; align-items:center; gap:9px; min-height:44px; min-width:220px; padding:0 14px; border:var(--b2); background:var(--paper); font-family:var(--meta); font-size:14px; text-transform:uppercase; letter-spacing:.04em; }
  .brut3 .b3in .q { flex:1; }
  .brut3 .b3in .post { font-family:var(--cond); font-size:11px; color:var(--red-ink); font-weight:700; }

  /* stats */
  .brut3 .b3stat { padding:14px 16px; display:flex; flex-direction:column; gap:6px; min-width:150px; border-left:4px solid var(--ink); }
  .brut3 .b3stat .v { font-family:var(--disp); font-weight:800; font-size:42px; line-height:1; text-transform:uppercase; }

  /* status bar */
  .brut3 .b3evibar { display:flex; flex-wrap:wrap; align-items:stretch; border-top:var(--b3); background:var(--ink); color:var(--paper); font-family:var(--meta); font-size:10px; text-transform:uppercase; letter-spacing:.06em; width:100%; }
  .brut3 .b3evi-cell { display:flex; gap:8px; align-items:center; padding:8px 14px; border-right:1px solid var(--paper2); }
  .brut3 .b3evi-cell b { opacity:.5; font-weight:400; }
  .brut3 .b3evi-ok { color:var(--red); }
  .brut3 .b3evi-tail { margin-left:auto; border-right:0; opacity:.5; }

  /* meme cell */
  .brut3 .b3cell { position:relative; display:flex; flex-direction:column; border:var(--b2); background:var(--paper); transform:rotate(${0.6})deg; }
  .brut3 .b3cell:nth-child(even) { transform:rotate(-0.4deg); }
  .brut3 .b3pin { position:absolute; z-index:5; font-size:16px; }
  .brut3 .b3hd { display:flex; justify-content:space-between; gap:8px; padding:5px 8px; background:var(--ink); color:var(--paper); font-family:var(--meta); font-size:8px; text-transform:uppercase; letter-spacing:.06em; white-space:nowrap; overflow:hidden; }
  .brut3 .b3evid { font-weight:700; }
  .brut3 .b3date { opacity:.7; }
  .brut3 .b3art { display:grid; place-items:center; overflow:hidden; background:var(--paper2); border-bottom:var(--b1); position:relative; }
  .brut3 .b3dither { position:absolute; inset:0; background-image:radial-gradient(var(--ink) .5px, transparent .5px); background-size:4px 4px; opacity:.09; pointer-events:none; }
  .brut3 .b3cap { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 9px; font-size:13px; line-height:1.4; font-weight:500; }
  .brut3 .b3ft { display:flex; align-items:center; gap:8px; border-top:var(--b1); padding:6px 8px; font-family:var(--meta); font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  .brut3 .b3lbl { color:var(--red-ink); font-weight:700; }
  .brut3 .b3score { margin-left:auto; }
  .brut3 .b3stamp { position:absolute; bottom:-10px; right:-8px; z-index:4; background:var(--red-fill); color:var(--on-red); border:2px solid var(--paper); font-family:var(--cond); font-weight:800; font-size:14px; text-transform:uppercase; letter-spacing:.08em; padding:4px 8px; transform:rotate(3deg); text-align:center; }
  .brut3 .b3stamp small { font-family:var(--meta); font-size:7px; letter-spacing:.04em; }
  .brut3 .b3redact { position:absolute; left:0; right:0; background:var(--ink); z-index:3; border-top:1px solid var(--paper); border-bottom:1px solid var(--paper); }
  .brut3 .b3cell-m { border-color:var(--red); border-width:4px; }
  .brut3 .b3cell-m .b3hd { background:var(--red-fill); }
  .brut3 .b3cell-n { border-style:dashed; opacity:.85; }
  .brut3 .b3cell-d { opacity:.35; filter:grayscale(.5); }
  .brut3 .b3cell-s { border-width:4px; box-shadow:0 0 0 2px var(--paper), 0 0 0 6px var(--ink); }
  .brut3 .b3cell-e { border-color:var(--red); }
  .brut3 .b3cell-e .b3hd { background:var(--red-fill); }
  .brut3 .b3err { display:grid; place-items:center; padding:10px; }
  .brut3 .b3err-box { display:flex; flex-direction:column; gap:6px; align-items:center; text-align:center; }
  .brut3 .b3err-stamp { font-family:var(--cond); font-weight:800; font-size:18px; text-transform:uppercase; letter-spacing:.12em; color:var(--red); border:2px solid var(--red); padding:4px 10px; transform:rotate(-4deg); }
  .brut3 .b3err-box span:nth-child(2), .brut3 .b3err-box span:nth-child(3) { font-family:var(--meta); font-size:9px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink2); }
  .brut3 .b3prog { display:flex; flex-direction:column; gap:6px; align-items:center; }
  .brut3 .b3prog span { font-family:var(--meta); font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  .brut3 .b3prog span:last-child { font-size:8px; color:var(--ink2); }
  .brut3 .b3bar { width:80%; height:6px; border:1px solid var(--ink); background:var(--paper); }
  .brut3 .b3bar i { display:block; height:100%; background:var(--red); animation:b3prog 1.4s steps(10) infinite; }
  .brut3 .b3load { background:repeating-linear-gradient(45deg, var(--paper2) 0 10px, var(--paper) 10px 20px); }

  /* empty state */
  .brut3 .b3empty { border:var(--b3); background:var(--paper2); padding:28px; display:flex; flex-direction:column; gap:12px; align-items:flex-start; max-width:480px; position:relative; }
  .brut3 .b3empty .big { font-family:var(--disp); font-weight:800; font-size:clamp(26px,4vw,40px); text-transform:uppercase; line-height:.9; }
  .brut3 .b3empty::after { content:'CLASSIFIED'; position:absolute; top:12px; right:-8px; font-family:var(--cond); font-weight:800; font-size:11px; color:var(--red); border:1px solid var(--red); padding:3px 8px; transform:rotate(3deg); letter-spacing:.1em; }

  /* workbench */
  .brut3 .bench { width:100%; border:var(--b2); background:var(--paper); }
  .brut3 .bb-bar { display:flex; gap:12px; align-items:center; flex-wrap:wrap; padding:10px 14px; border-bottom:var(--b2); background:var(--ink); color:var(--paper); }
  .brut3 .bb-bar .logo { font-family:var(--disp); font-weight:800; font-size:18px; text-transform:uppercase; }
  .brut3 .bb-bar .logo .ev { font-family:var(--meta); font-size:8px; border:1px solid var(--red); color:var(--red); padding:1px 5px; margin-left:6px; }
  .brut3 .bb-body { display:flex; gap:16px; padding:16px; align-items:flex-start; }
  .brut3 .bb-rail { display:flex; flex-direction:column; gap:8px; min-width:210px; }
  .brut3 .bb-pile { display:flex; justify-content:space-between; gap:10px; padding:9px 10px; min-height:40px; border:var(--b1); background:var(--paper); font-family:var(--cond); font-size:13px; text-transform:uppercase; letter-spacing:.04em; cursor:pointer; text-align:left; color:var(--ink); }
  .brut3 .bb-pile b { color:var(--red-ink); }
  .brut3 .bb-pile.on { border:var(--b2); border-left:4px solid var(--ink); font-weight:700; background:var(--paper2); }

  /* phone */
  .brut3 .b3phone { width:390px; max-width:100%; border:var(--b3); background:var(--paper); }
  .brut3 .ph-mast { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:var(--b2); background:var(--ink); color:var(--paper); }
  .brut3 .ph-mast .logo { font-family:var(--disp); font-weight:800; font-size:16px; text-transform:uppercase; }
  .brut3 .ph-dock { display:flex; border-top:var(--b2); }
  .brut3 .ph-dock button { flex:1; min-height:52px; background:var(--paper); color:var(--ink); border:0; border-right:var(--b1); font-family:var(--cond); font-weight:700; font-size:13px; text-transform:uppercase; letter-spacing:.06em; cursor:pointer; }
  .brut3 .ph-dock button:last-child { border-right:0; }
  .brut3 .ph-dock button.on { background:var(--ink); color:var(--paper); }

  /* redaction strip demo */
  .brut3 .b3r-strip { display:flex; gap:4px; flex-wrap:wrap; }
  .brut3 .b3r-bar { height:12px; background:var(--ink); flex:1; min-width:40px; }
  .brut3 .b3r-label { font-family:var(--meta); font-size:8px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink2); white-space:nowrap; }
  .brut3 .b3stampd { display:inline-block; background:var(--red-fill); color:var(--on-red); border:2px solid var(--ink); font-family:var(--cond); font-weight:800; font-size:14px; text-transform:uppercase; letter-spacing:.1em; padding:6px 12px; transform:rotate(-3deg); }
  .brut3 .b3stampd.pop { animation:b3stampA 160ms; }

  @keyframes b3hit { 0% { transform:scale(.92); background:var(--ink); color:var(--paper); } 100% { transform:scale(1); } }
  @keyframes b3prog { to { width:100%; } }
  @keyframes b3stampA { 0% { opacity:0; transform:scale(2) rotate(-16deg); } 70% { opacity:1; transform:scale(.9) rotate(2deg); } 100% { opacity:1; transform:scale(1) rotate(-3deg); } }
  @media (prefers-reduced-motion: reduce) {
    .brut3 *, .brut3 *::before, .brut3 *::after { animation:none !important; transition:none !important; }
  }
  @media (max-width:720px) {
    .brut3 .g4 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .brut3 .bb-body { flex-direction:column; }
    .brut3 .bb-rail { flex-direction:row; flex-wrap:wrap; min-width:0; }
    .brut3 .trow { grid-template-columns:1fr; gap:4px; }
    .brut3 .b3in { min-width:0; width:100%; }
  }
  `);

  const M = MEMES;
  mount.innerHTML = `
  <div class="brut3">
    <header class="mast">
      <span class="logo">sploot <span class="ev">evidence</span></span>
      <nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">upload</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
      <span class="case">case #SPL-${LIB.dim}-${LIB.queued}${LIB.latency % 10} · declassified</span>
    </header>

    <section class="hero">
      <span class="cls">[ declassified · unrestricted distribution ]</span>
      <span style="font-family:var(--meta);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink2)">archive contains ${LIB.total.toLocaleString()} photographic exhibits</span>
      <h1>type<br>words.<br>get the<br><span class="box">picture.</span></h1>
      <p class="sub">no folders. <span class="rd">just vibes.</span> every image is tagged and filed by its evidentiary meaning. the archive is indexed. the archive is watching.</p>
      ${b3Dossier('cat losing it')}
      <div class="cgrid g4" style="width:100%">${M.slice(0, 4).map((x, i) => b3Cell(x, i === 0 ? 'match' : '')).join('')}</div>
      <span class="cords">φ:${LIB.dim}° λ:${LIB.latency}ms · ${LIB.model}</span>
    </section>

    <div class="sec"><b>01</b><span style="font-family:var(--cond);font-size:13px;text-transform:uppercase;letter-spacing:.08em">[ foundations ]</span><span class="ref">EXHIBIT A-1 · tokens, rules, marks</span></div>
    <div class="pad">
      ${b3Swx([
        ['exhibit paper', 'var(--paper)', '#F2EDE0 / #14120E', 'substrate'],
        ['paper 2', 'var(--paper2)', '#E6DFCD / #1C1A14', 'secondary fill'],
        ['investigation ink', 'var(--ink)', '#141414 / #E8E0D4', 'carbon / light'],
        ['evidence red', 'var(--red)', '#C81010 / #FF3B3B', 'stamps · verdicts'],
        ['red ink', 'var(--red-ink)', '#9B0000 / #FF6B5E', 'labels · aa'],
        ['red fill', 'var(--red-fill)', '#B80D0D / #FF2A2A', 'stamps · primary'],
      ])}
      <div class="row">
        <div class="shp ha">1px · chain link</div>
        <div class="shp">2px · exhibit edge</div>
        <div class="shp th">4px · verified / review</div>
        <div class="shp plate">double plate · sealed</div>
        <div class="shp dth">halftone · evidence scan</div>
        <div class="shp redx">redacted · classified</div>
        <div class="shp">radius 0 · always</div>
      </div>
      <div class="b3r-strip" style="width:100%;max-width:520px">
        <span class="b3r-label">[redaction key]</span>
        <div class="b3r-bar"></div>
        <div class="b3r-bar" style="flex:2"></div>
        <div class="b3r-bar" style="flex:.6"></div>
        <div class="b3r-bar" style="flex:1.4"></div>
      </div>
      <p style="font-family:var(--meta);font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink2)">spacing: 8px machinery grid. elements sit at slight rotations. redaction bars and evidence stamps layer over content. nothing is soft.</p>
    </div>

    <div class="sec"><b>02</b><span style="font-family:var(--cond);font-size:13px;text-transform:uppercase;letter-spacing:.08em">[ type ]</span><span class="ref">EXHIBIT A-2 · five voices, one dossier</span></div>
    <div class="pad" style="gap:0">
      <div class="trow"><span class="lab">display</span><div class="tdisp">upload chaos</div></div>
      <div class="trow"><span class="lab">condensed</span><div class="tcond">the pile sorts itself at night</div></div>
      <div class="trow"><span class="lab">body</span><div class="tbody">space grotesk carries the sentences. the pile organizes into semantic clusters while you sleep. no folders were compromised.</div></div>
      <div class="trow"><span class="lab">label</span><div style="font-family:var(--meta);font-size:10px;text-transform:uppercase;letter-spacing:.08em">space mono upper · [ EXHIBIT TAG ]</div></div>
      <div class="trow"><span class="lab">metadata</span><div style="font-family:var(--meta);font-size:9px;color:var(--ink2);text-transform:uppercase;letter-spacing:.06em">EXHIBIT-0413 · sim 0.94 · 212ms · siglip-base · 768d · ref /api/search</div></div>
      <div class="trow"><span class="lab">tabular</span><div class="tnum">1,482 · 0.94 · 212ms · 768</div></div>
      <div class="trow"><span class="lab">caption</span><div class="tcap">long caption wrap test: me explaining to the group chat why the spreadsheet cell that broke me is now <span class="tredaction">classified above my desk</span> like a diploma.</div></div>
      <div class="trow"><span class="lab">serif</span><div><div class="tserif">a beautiful archive of extremely stupid images</div><p style="font-family:var(--meta);font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink2);margin-top:6px">fraunces italic under a dashed border. one appearance per page. that is the serif budget.</p></div></div>
    </div>

    <div class="sec"><b>03</b><span style="font-family:var(--cond);font-size:13px;text-transform:uppercase;letter-spacing:.08em">[ components ]</span><span class="ref">EXHIBIT A-3 · the kit</span></div>
    <div class="pad">
      ${b3Dossier('sad frog')}
      <div class="cgrid g4" style="width:100%">
        ${b3Cell(M[1])}${b3Cell(M[0], 'match')}${b3Cell(M[2], 'near')}${b3Cell(M[3], 'dim')}
        ${b3Cell(M[4], 'selected')}${b3Cell(M[5], 'loading')}${b3Cell(M[7], 'error')}
        <div class="b3empty" style="border:0;max-width:none"><span class="big">no exhibits on file</span><p style="font-size:14px;max-width:36ch">the evidence locker is empty. zero exhibits. upload chaos and the archive starts processing.</p><button class="b3btn primary">upload chaos</button></div>
      </div>
      <div class="row">
        <button class="b3btn primary">find it</button>
        <button class="b3btn">shuffle the pile</button>
        <button class="b3btn sm">compact</button>
        <button class="b3btn icon" aria-label="close">✕</button>
        <span class="b3tag">reaction faces</span>
        <span class="b3tag">cats being unwell</span>
        <span class="b3banger">BANGER</span>
      </div>
      <div class="row">
        <div class="b3in"><span class="q">text input</span><span class="post">[ENTER]</span></div>
        <div class="b3tabs" role="tablist"><button class="b3tab on">all</button><button class="b3tab">bangers</button><button class="b3tab">recent</button></div>
        <div class="b3toast">■ filed under vibes. no further action required.</div>
      </div>
      <div class="cgrid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));width:100%;max-width:640px">
        <div class="b3stat"><span style="font-family:var(--meta);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink2)">folders required</span><span class="v">0</span></div>
        <div class="b3stat"><span style="font-family:var(--meta);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink2)">exhibits indexed</span><span class="v">1,482</span></div>
        <div class="b3stat"><span style="font-family:var(--meta);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--red-ink)">bangers</span><span class="v" style="color:var(--red)">37</span></div>
      </div>
    </div>
    ${b3EvidenceBar()}

    <div class="sec"><b>04</b><span style="font-family:var(--cond);font-size:13px;text-transform:uppercase;letter-spacing:.08em">[ motion ]</span><span class="ref">EXHIBIT A-4 · interaction only</span></div>
    <div class="pad">
      <div class="row">
        <button class="b3btn primary" id="b3-press">press me</button>
        <button class="b3btn" id="b3-stamp-go">stamp verdict</button>
        <span class="b3stampd" id="b3-stamp" hidden>VERIFIED</span>
        <button class="b3btn" id="b3-class-go">toggle class</button>
      </div>
      <div id="b3-class-cell" style="width:min(280px,100%)">${b3Cell(M[0])}</div>
      <p style="font-family:var(--meta);font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink2)">motion is 100 to 160ms, interaction only. prefers-reduced-motion collapses everything to an instant state change. the progress bar sweep is a background-width animation; static in reduced motion.</p>
    </div>

    <div class="sec"><b>05</b><span style="font-family:var(--cond);font-size:13px;text-transform:uppercase;letter-spacing:.08em">[ compositions ]</span><span class="ref">EXHIBIT A-5 · workbench + field unit</span></div>
    <div class="pad">
      <div class="bench">
        <div class="bb-bar">
          <span class="logo">sploot<span class="ev">evidence</span></span>
          <div class="b3in" style="flex:1;max-width:460px;background:var(--paper);color:var(--ink)"><span class="q">search the pile</span><span class="post">[ENTER]</span></div>
          <button class="b3btn primary" style="background:var(--paper);color:var(--ink)">find it</button>
          <button class="b3btn" style="background:var(--paper);color:var(--ink)">upload chaos</button>
        </div>
        <div class="bb-body">
          <aside class="bb-rail">
            <span style="font-family:var(--meta);font-size:9px;text-transform:uppercase;color:var(--ink2);padding:4px 0">automatic piles</span>
            ${PILES.map((p, i) => `<button class="bb-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}
          </aside>
          <div class="cgrid g4" style="flex:1">${M.slice(0, 8).map(x => b3Cell(x)).join('')}</div>
        </div>
        ${b3EvidenceBar()}
      </div>
      <div class="b3phone">
        <div class="ph-mast"><span class="logo">sploot</span><span style="font-family:var(--meta);font-size:9px;text-transform:uppercase;opacity:.7">1,482 filed</span></div>
        <div style="padding:10px;display:flex;flex-direction:column;gap:10px">
          <div class="b3in" style="min-width:0"><span class="q">cat losing it</span><span class="post">[GO]</span></div>
          <div class="cgrid" style="grid-template-columns:1fr 1fr">${M.slice(0, 4).map((x, i) => b3Cell(x, i === 0 ? 'match' : '')).join('')}</div>
        </div>
        <div class="ph-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'the declassified wall · evidence locker'], ['type', 'bricolage grotesque / barlow condensed / fraunces italic / space mono'], ['move', 'everything is evidence pinned to the wall; redaction bars + authentication stamps are the maximalism'], ['density', 'bimodal: dossiers vs stamped evidence with redaction overlays'], ['motion', 'interaction only, 100-160ms, hard state changes']])}
    </div>
  </div>`;

  const root = mount.querySelector('.brut3');
  themeToggle(root);
  const press = root.querySelector('#b3-press');
  if (press) press.addEventListener('click', () => {
    press.classList.remove('hit'); void press.offsetWidth; press.classList.add('hit');
  });
  const sgo = root.querySelector('#b3-stamp-go'), st = root.querySelector('#b3-stamp');
  if (sgo && st) sgo.addEventListener('click', () => {
    st.hidden = false; st.classList.remove('pop'); void st.offsetWidth; st.classList.add('pop');
  });
  const cgo = root.querySelector('#b3-class-go'), cc = root.querySelector('#b3-class-cell');
  if (cgo && cc) { let on = false; cgo.addEventListener('click', () => {
    on = !on; cc.innerHTML = b3Cell(MEMES[0], on ? 'match' : '');
    cgo.textContent = on ? 'declassify' : 'toggle class';
  }); }
};

})();

/* ================================================================
   BRUT-4 · THE IMPOSITION FLOOR — press-floor precision
   system rule: registration is the ornament. every element carries
   crop marks, density bars, imposition guides, and registration
   crosshairs as functional chrome. the interface IS a working
   press floor, not a print-room archive. seed DNA (riso inks,
   cream paper, CMY offset) reinterpreted through swiss industrial
   rigor: zero radius, one accent (hazard red), steps() motion,
   visible compartmentalization.
   fonts: archivo black, bricolage grotesque, space mono, caveat,
   instrument serif (all preloaded). @import: none.
   ================================================================ */

(() => {
'use strict';

function b4density(pct, label) {
  return '<span class="b4dens"><i class="b4dens-b" style="width:' + Math.min(100, pct) + '%"></i><i class="b4dens-m" style="left:' + Math.min(100, pct) + '%">' + (label || (pct / 100).toFixed(2)) + '</i></span>';
}

function b4grayWedge(n) {
  var steps = [100, 85, 70, 55, 40, 25, 10, 0];
  return '<span class="b4wedge">' + steps.map(function(s) { return '<i style="background:rgba(26,26,26,' + (s / 100) + ')"></i>'; }).join('') + '<b>' + n + ' steps</b></span>';
}

function b4Cell(m, state, i, showScore) {
  state = state || ''; i = i || 0; showScore = showScore || false;
  var lbl = state === 'match' ? 'in register' : state === 'near' ? 'near register' : state === 'dim' ? 'out of gamut' : state === 'selected' ? 'on press' : state === 'loading' ? 'on feed' : state === 'error' ? 'misregister' : 'sheet ok';
  var art = '<div class="b4art" style="aspect-ratio:' + m.aspect + '">' + memeImg(m) + '</div>';
  if (state === 'loading') art = '<div class="b4art b4art-load" style="aspect-ratio:' + m.aspect + '"><span class="b4art-msg">feeding sheet ' + m.vec + '…</span><span class="b4art-bar"><i></i></span></div>';
  if (state === 'error') art = '<div class="b4art b4art-err" style="aspect-ratio:' + m.aspect + '"><span class="b4art-msg">registration lost</span><span class="b4art-msg">sheet ' + m.vec + ' — run again</span></div>';
  return '\n  <div class="b4cellwrap">\n    <div class="b4cell' + (state === 'error' ? ' b4cell-e' : '') + (state === 'match' ? ' b4cell-m' : '') + (state === 'near' ? ' b4cell-n' : '') + (state === 'dim' ? ' b4cell-d' : '') + (state === 'selected' ? ' b4cell-s' : '') + '">\n      <span class="b4reg-x">+</span><span class="b4reg-x tr">+</span><span class="b4reg-x bl">+</span><span class="b4reg-x br">+</span>\n      <span class="b4crop tl"></span><span class="b4crop tr"></span><span class="b4crop bl"></span><span class="b4crop br"></span>\n      <div class="b4hd"><span>' + esc(m.file) + '</span><span>sheet ' + m.vec + '</span></div>\n      ' + art + '\n      <div class="b4cap"><span>' + esc(m.cap) + '</span>' + (m.banger ? '<span class="b4banger">banger</span>' : '') + '</div>\n      <div class="b4ft">\n        <span class="b4ft-lbl">' + lbl + '</span>\n        ' + b4density(m.score, (m.score / 100).toFixed(2)) + '\n        ' + (showScore ? '<span class="b4ft-score">' + (m.score / 100).toFixed(2) + '</span>' : '') + '\n        ' + (state === 'error' ? '<button class="b4btn sm">rerun</button>' : '') + '\n      </div>\n      ' + (state === 'match' ? '<div class="b4verdict">✓ register</div>' : '') + '\n    </div>\n  </div>';
}

function b4Console(q) {
  q = q || 'cat losing it';
  return '\n  <div class="b4console">\n    <span class="b4reg-x">+</span><span class="b4reg-x tr">+</span><span class="b4reg-x bl">+</span><span class="b4reg-x br">+</span>\n    <div class="b4con-top">\n      <span>press control — search console</span>\n      <span>form spl-4 · rev ' + LIB.dim + '.' + LIB.queued + '</span>\n      <span class="b4con-led"></span>\n    </div>\n    <div class="b4con-body">\n      <div class="b4field"><span class="b4field-pr">&gt;</span><span class="b4field-q">' + esc(q) + '</span><span class="b4field-care"></span></div>\n      <button class="b4btn primary">run press</button>\n    </div>\n    <div class="b4con-ft">\n      <span><b>index</b>' + LIB.total.toLocaleString() + ' sheets</span>\n      <span><b>model</b>' + LIB.model + '</span>\n      <span><b>dim</b>' + LIB.dim + '</span>\n      <span><b>route</b>/api/search</span>\n      <span class="b4con-lat"><b>latency</b>' + LIB.latency + 'ms</span>\n      ' + b4grayWedge(LIB.total) + '\n    </div>\n    <div class="b4con-bar">\n      <i style="background:var(--ink-cyan)"></i>\n      <i style="background:var(--ink-magenta)"></i>\n      <i style="background:var(--ink-yellow)"></i>\n      <i style="background:var(--ink-red)"></i>\n    </div>\n  </div>';
}

function b4StatusBar() {
  var c = [['index', LIB.total.toLocaleString() + ' sheets'], ['embedded', LIB.embedded + ' of ' + LIB.total], ['queue', LIB.queued + ' on feed'], ['model', LIB.model], ['press', 'running ■', 1]];
  return '<div class="b4stbar">' + c.map(function(x, i) { return '<span class="b4stb-cell' + (x[2] ? ' b4stb-ok' : '') + '"><b>' + x[0] + '</b>' + x[1] + '</span>'; }).join('') + '<span class="b4stb-cell b4stb-tail">sploot imposition floor · ' + LIB.total.toLocaleString() + ' impressions</span></div>';
}

function b4Swx(list) {
  return '<div class="b4swx">' + list.map(function(x) {
    return '\n    <div class="b4swx-it"><i style="background:' + x[1] + '"></i><b>' + x[0] + '</b><span>' + x[2] + '</span><span>' + x[3] + '</span></div>';
  }).join('') + '</div>';
}

SPECS['BRUT-4'] = function(mount) {
  css('BRUT-4', `
  .brut4 {
    --paper:#F0ECE2; --paper2:#E6E1D4; --ink:#1A1A1A; --ink2:rgba(26,26,26,.58);
    --red:#E61919; --red-ink:#B30F0F; --red-fill:#CC1414; --on-red:#FFFFFF;
    --ink-cyan:#0088c0; --ink-magenta:#e84890; --ink-yellow:#ddc800;
    --green:#00a05a; --ink-red:var(--red);
    --b1:1px solid var(--ink); --b2:2px solid var(--ink); --b3:3px solid var(--ink);
    --disp:'Archivo Black',sans-serif; --body:'Bricolage Grotesque',sans-serif;
    --mono:'Space Mono',monospace; --hand:'Caveat',cursive;
    --serif:'Instrument Serif',serif; --tick:100ms;
    min-height:100dvh; display:flex; flex-direction:column; overflow-x:hidden;
    background:var(--paper); color:var(--ink); font-family:var(--body);
  }
  .brut4.theme-dark {
    --paper:#16140F; --paper2:#1E1C16; --ink:#E8E2D2; --ink2:rgba(232,226,210,.55);
    --red:#FF3A3A; --red-ink:#FF6B5E; --red-fill:#FF2A2A; --on-red:#0A0A0A;
    --ink-cyan:#28A8DD; --ink-magenta:#FF66AA; --ink-yellow:#F5D800;
    --green:#2EC27E; --ink-red:var(--red);
    --b1:1px solid var(--ink); --b2:2px solid var(--ink); --b3:3px solid var(--ink);
  }
  .brut4 :focus-visible { outline:3px solid var(--red); outline-offset:2px; }
  .brut4 a { color:inherit; }
  .brut4 .meme-media { background:var(--paper2); }
  .brut4 .pad { padding:22px clamp(14px,4vw,42px); display:flex; flex-direction:column; gap:22px; align-items:flex-start; }
  .brut4 .row { display:flex; flex-wrap:wrap; gap:14px; align-items:center; }
  .brut4 .cgrid { display:grid; gap:1px; background:var(--ink); border:var(--b2); }
  .brut4 .cgrid>* { background:var(--paper); }
  .brut4 .g4 { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .brut4 .cgrid .b4cell { border:0; }
  .brut4 .cgrid .b4reg-x,.brut4 .cgrid .b4crop { display:none; }

  .brut4 .b4reg-x { position:absolute; z-index:6; font:700 11px var(--mono); color:var(--red-ink); pointer-events:none; width:12px; height:12px; display:grid; place-items:center; }
  .brut4 .b4reg-x { top:-6px; left:-6px; }
  .brut4 .b4reg-x.tr { top:-6px; left:auto; right:-6px; }
  .brut4 .b4reg-x.bl { top:auto; bottom:-6px; left:-6px; }
  .brut4 .b4reg-x.br { top:auto; bottom:-6px; left:auto; right:-6px; }

  .brut4 .b4crop { position:absolute; z-index:5; pointer-events:none; }
  .brut4 .b4crop.tl { top:-2px; left:-2px; width:8px; height:8px; border-top:1px solid var(--red); border-left:1px solid var(--red); }
  .brut4 .b4crop.tr { top:-2px; right:-2px; width:8px; height:8px; border-top:1px solid var(--red); border-right:1px solid var(--red); }
  .brut4 .b4crop.bl { bottom:-2px; left:-2px; width:8px; height:8px; border-bottom:1px solid var(--red); border-left:1px solid var(--red); }
  .brut4 .b4crop.br { bottom:-2px; right:-2px; width:8px; height:8px; border-bottom:1px solid var(--red); border-right:1px solid var(--red); }

  .brut4 .b4dens { flex:1; height:8px; position:relative; min-width:60px; border:1px solid var(--ink2); background:var(--paper2); }
  .brut4 .b4dens-b { display:block; height:100%; position:absolute; top:0; left:0; background:var(--ink); }
  .brut4 .b4dens-m { position:absolute; top:-4px; font-family:var(--mono); font-size:7px; color:var(--red-ink); transform:translateX(-50%); white-space:nowrap; }

  .brut4 .b4wedge { display:inline-flex; gap:1px; height:14px; align-items:stretch; border:1px solid var(--ink2); }
  .brut4 .b4wedge i { width:10px; }
  .brut4 .b4wedge b { font-family:var(--mono); font-size:7px; padding:0 5px; white-space:nowrap; font-weight:400; line-height:14px; color:var(--ink2); }

  .brut4 .mast { display:flex; align-items:stretch; flex-wrap:wrap; border-bottom:var(--b3); background:var(--ink); color:var(--paper); }
  .brut4 .mast .logo { font-family:var(--disp); font-size:19px; text-transform:uppercase; letter-spacing:-.01em; padding:8px 16px; border-right:2px solid rgba(255,255,255,.2); display:flex; align-items:center; gap:8px; }
  .brut4 .mast .logo .press-tag { font-family:var(--mono); font-size:8px; text-transform:uppercase; color:var(--red); border:1px solid var(--red); padding:1px 5px; letter-spacing:.08em; }
  .brut4 .mast nav { display:flex; flex-wrap:wrap; }
  .brut4 .mast nav a { display:flex; align-items:center; min-height:44px; padding:0 16px; border-right:1px solid rgba(255,255,255,.15); font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.08em; text-decoration:none; }
  .brut4 .mast nav a:hover { background:var(--red-fill); }
  .brut4 .mast .mast-count { margin-left:auto; display:flex; align-items:center; padding:0 16px; font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:rgba(255,255,255,.5); }

  .brut4 .hero { position:relative; padding:clamp(26px,5vw,56px) clamp(14px,4vw,42px) clamp(26px,4vw,42px); border-bottom:var(--b3); display:flex; flex-direction:column; gap:18px; align-items:flex-start; }
  .brut4 .hero .hero-strip { font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:var(--red-ink); }
  .brut4 .hero h1 { font-family:var(--disp); font-size:clamp(42px,10vw,128px); line-height:.82; letter-spacing:-.025em; text-transform:uppercase; max-width:14ch; }
  .brut4 .hero h1 .hl { color:var(--red); }
  .brut4 .hero .hero-sub { font-size:15px; line-height:1.5; max-width:54ch; }
  .brut4 .hero .hero-sub .rd { background:var(--ink); color:var(--paper); padding:1px 5px; }
  .brut4 .hero .imp-note { position:absolute; right:14px; bottom:10px; font-family:var(--mono); font-size:8px; text-transform:uppercase; letter-spacing:.12em; color:var(--ink2); }

  .brut4 .sec { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; border-top:var(--b3); border-bottom:var(--b1); padding:10px clamp(14px,4vw,42px); margin-top:clamp(22px,5vw,46px); }
  .brut4 .sec b { font-family:var(--disp); font-size:clamp(28px,4vw,44px); line-height:1; text-transform:uppercase; }
  .brut4 .sec .sec-tag { margin-left:auto; font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink2); }

  .brut4 .b4swx { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:1px; background:var(--ink); border:var(--b2); width:100%; }
  .brut4 .b4swx-it { background:var(--paper); display:flex; flex-direction:column; font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  .brut4 .b4swx-it i { height:46px; border-bottom:var(--b1); }
  .brut4 .b4swx-it b,.brut4 .b4swx-it span { padding:2px 8px; }
  .brut4 .b4swx-it b { padding-top:7px; font-size:10px; }
  .brut4 .b4swx-it span:last-child { color:var(--ink2); padding-bottom:8px; }

  .brut4 .shp { width:126px; height:84px; display:grid; place-items:center; text-align:center; font-family:var(--mono); font-size:8px; text-transform:uppercase; letter-spacing:.04em; background:var(--paper2); border:var(--b2); padding:4px; position:relative; }
  .brut4 .shp.ha { border-width:1px; }
  .brut4 .shp.th { border-width:4px; }
  .brut4 .shp.dbl { box-shadow:0 0 0 2px var(--paper),0 0 0 5px var(--ink); }
  .brut4 .shp.dash { border-style:dashed; }
  .brut4 .shp.xh::after { content:'+'; position:absolute; top:-8px; left:-6px; font:700 12px var(--mono); color:var(--red-ink); }
  .brut4 .shp.bar { border-bottom-width:6px; border-bottom-color:var(--red); }
  .brut4 .shp.strip { background:linear-gradient(90deg, var(--ink-cyan) 0 25%, var(--ink-magenta) 25% 50%, var(--ink-yellow) 50% 75%, var(--ink-red) 75% 100%); border-color:var(--ink-cyan); }

  .brut4 .trow { display:grid; grid-template-columns:120px 1fr; gap:14px; align-items:baseline; border-top:var(--b1); padding:12px 0; width:100%; }
  .brut4 .trow .lab { color:var(--ink2); font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  .brut4 .tdisp { font-family:var(--disp); text-transform:uppercase; font-size:clamp(34px,5.4vw,62px); line-height:.86; letter-spacing:-.025em; }
  .brut4 .tbody { font-size:17px; max-width:56ch; }
  .brut4 .tnum { font-family:var(--mono); font-size:26px; font-variant-numeric:tabular-nums; }
  .brut4 .tcap { font-size:13px; max-width:44ch; border-left:3px solid var(--red); padding-left:12px; line-height:1.5; }
  .brut4 .tserif { position:relative; font-family:var(--serif); font-style:italic; font-size:clamp(22px,3.4vw,36px); max-width:30ch; line-height:1.15; padding:6px 0; }
  .brut4 .tserif::after { content:''; position:absolute; inset:0; background-image:radial-gradient(var(--ink) .8px, transparent .8px); background-size:5px 5px; opacity:.14; pointer-events:none; }
  .brut4 .thand { font-family:var(--hand); font-size:22px; color:var(--ink2); transform:rotate(-1deg); }

  .brut4 .b4console { position:relative; width:100%; max-width:860px; border:var(--b2); background:var(--paper); }
  .brut4 .b4con-top { display:flex; gap:14px; flex-wrap:wrap; padding:7px 12px; background:var(--ink); color:var(--paper); font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
  .brut4 .b4con-led { margin-left:auto; width:8px; height:8px; background:var(--green); }
  .brut4 .b4con-body { display:flex; gap:10px; padding:12px; border-bottom:var(--b1); flex-wrap:wrap; }
  .brut4 .b4con-ft { display:flex; flex-wrap:wrap; gap:14px; align-items:center; padding:7px 12px; background:var(--paper2); font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.04em; }
  .brut4 .b4con-ft b { font-weight:400; color:var(--ink2); }
  .brut4 .b4con-lat { margin-left:auto; color:var(--red-ink); }
  .brut4 .b4con-bar { display:flex; height:8px; gap:0; }
  .brut4 .b4con-bar i { flex:1; }

  .brut4 .b4field { display:flex; align-items:center; gap:9px; flex:1; min-height:44px; min-width:220px; padding:0 14px; border:var(--b2); background:var(--paper); font-family:var(--mono); font-size:14px; text-transform:uppercase; letter-spacing:.04em; }
  .brut4 .b4field-pr { color:var(--red-ink); }
  .brut4 .b4field-q { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .brut4 .b4field-care { width:9px; height:18px; background:var(--red); animation:b4blink 1s steps(1) infinite; flex:none; }

  .brut4 .b4btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 20px; border:var(--b2); background:var(--paper); color:var(--ink); font-family:var(--mono); font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.08em; cursor:pointer; transition:transform var(--tick) steps(2,end); }
  .brut4 .b4btn:hover { background:var(--ink); color:var(--paper); }
  .brut4 .b4btn:active { transform:translate(2px,2px); }
  .brut4 .b4btn.primary { background:var(--red-fill); color:var(--on-red); }
  .brut4 .b4btn.sm { min-height:30px; padding:0 10px; font-size:9px; border-width:1px; }
  .brut4 .b4btn.icon { width:44px; padding:0; }
  .brut4 .b4btn.press { animation:b4press 120ms steps(2,end); }

  .brut4 .b4tag { font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.06em; padding:6px 10px; border:var(--b1); }
  .brut4 .b4tag::before { content:'[ '; color:var(--red-ink); }
  .brut4 .b4tag::after { content:' ]'; color:var(--red-ink); }
  .brut4 .b4banger { flex:none; font-family:var(--mono); font-weight:700; font-size:9px; text-transform:uppercase; letter-spacing:.08em; background:var(--red-fill); color:var(--on-red); padding:2px 6px; }
  .brut4 .b4toast { display:inline-flex; gap:10px; align-items:center; border:var(--b2); border-left:8px solid var(--green); background:var(--paper); padding:10px 14px; font-family:var(--mono); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .brut4 .b4tabs { display:flex; border:var(--b2); width:max-content; }
  .brut4 .b4tab { min-height:44px; padding:0 18px; background:var(--paper); color:var(--ink); border:0; border-right:var(--b1); font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.06em; cursor:pointer; }
  .brut4 .b4tab:last-child { border-right:0; }
  .brut4 .b4tab.on { background:var(--ink); color:var(--paper); box-shadow:inset 0 -4px 0 var(--red); font-weight:700; }

  .brut4 .b4stat { padding:14px 16px; display:flex; flex-direction:column; gap:6px; min-width:150px; border-left:4px solid var(--ink); }
  .brut4 .b4stat .v { font-family:var(--disp); font-size:42px; line-height:1; text-transform:uppercase; }
  .brut4 .b4stat.red { border-left-color:var(--red); }
  .brut4 .b4stat.red .v { color:var(--red); }
  .brut4 .b4stat-imp { font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink2); }

  .brut4 .b4stbar { display:flex; flex-wrap:wrap; align-items:stretch; border-top:var(--b3); background:var(--ink); color:var(--paper); font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.06em; width:100%; }
  .brut4 .b4stb-cell { display:flex; gap:8px; align-items:center; padding:8px 14px; border-right:1px solid var(--paper2); }
  .brut4 .b4stb-cell b { opacity:.5; font-weight:400; }
  .brut4 .b4stb-ok { color:var(--green); }
  .brut4 .b4stb-tail { margin-left:auto; border-right:0; opacity:.5; }

  .brut4 .b4cellwrap { position:relative; }
  .brut4 .b4cell { position:relative; display:flex; flex-direction:column; border:var(--b2); background:var(--paper); }
  .brut4 .b4hd { display:flex; justify-content:space-between; gap:8px; padding:5px 8px; background:var(--ink); color:var(--paper); font-family:var(--mono); font-size:8px; text-transform:uppercase; letter-spacing:.06em; white-space:nowrap; overflow:hidden; }
  .brut4 .b4art { display:grid; place-items:center; overflow:hidden; background:var(--paper2); border-bottom:var(--b1); }
  .brut4 .b4cap { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 9px; font-size:12.5px; line-height:1.35; font-weight:500; }
  .brut4 .b4ft { display:flex; align-items:center; gap:8px; border-top:var(--b1); padding:5px 8px; font-family:var(--mono); font-size:8px; text-transform:uppercase; letter-spacing:.04em; }
  .brut4 .b4ft-lbl { color:var(--red-ink); white-space:nowrap; }
  .brut4 .b4ft-score { font-weight:700; font-variant-numeric:tabular-nums; }
  .brut4 .b4verdict { position:absolute; bottom:-8px; right:-6px; z-index:4; background:var(--red-fill); color:var(--on-red); border:2px solid var(--paper); font-family:var(--mono); font-weight:700; font-size:10px; text-transform:uppercase; letter-spacing:.08em; padding:3px 8px; }
  .brut4 .b4cell-m { border-color:var(--red); border-width:3px; }
  .brut4 .b4cell-m .b4hd { background:var(--red-fill); }
  .brut4 .b4cell-n .b4hd { background:var(--ink-cyan); }
  .brut4 .b4cell-d { opacity:.4; filter:grayscale(.65); }
  .brut4 .b4cell-s { border-width:4px; box-shadow:0 0 0 2px var(--paper),0 0 0 5px var(--ink); }
  .brut4 .b4cell-e { border-color:var(--red); }
  .brut4 .b4cell-e .b4hd { background:var(--red-fill); }
  .brut4 .b4art-load { display:flex; flex-direction:column; gap:8px; align-items:center; justify-content:center; background:repeating-linear-gradient(45deg, var(--paper2) 0 10px, var(--paper) 10px 20px); }
  .brut4 .b4art-msg { font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink2); }
  .brut4 .b4art-bar { width:80%; height:6px; border:1px solid var(--ink); background:var(--paper); }
  .brut4 .b4art-bar i { display:block; height:100%; background:var(--ink); animation:b4feed 1.2s steps(8) infinite; }
  .brut4 .b4art-err { display:flex; flex-direction:column; gap:6px; align-items:center; justify-content:center; background:repeating-linear-gradient(45deg, transparent 0 8px, rgba(230,25,25,.08) 8px 16px) var(--paper2); }
  .brut4 .b4art-err .b4art-msg:first-child { font-weight:700; color:var(--red-ink); }

  .brut4 .b4cell .b4reg-x { font-size:9px; top:-5px; left:-5px; width:10px; height:10px; }
  .brut4 .b4cell .b4reg-x.tr { top:-5px; left:auto; right:-5px; }
  .brut4 .b4cell .b4reg-x.bl { top:auto; bottom:-5px; left:-5px; }
  .brut4 .b4cell .b4reg-x.br { top:auto; bottom:-5px; left:auto; right:-5px; }

  .brut4 .b4empty { border:var(--b3); background:var(--paper2); padding:28px; display:flex; flex-direction:column; gap:12px; align-items:flex-start; max-width:480px; position:relative; }
  .brut4 .b4empty .big { font-family:var(--disp); font-size:clamp(26px,4vw,40px); text-transform:uppercase; line-height:.9; }
  .brut4 .b4empty::after { content:'PRESS IDLE'; position:absolute; top:10px; right:-9px; font-family:var(--mono); font-weight:700; font-size:9px; letter-spacing:.08em; color:var(--red); border:1px solid var(--red); padding:3px 7px; text-transform:uppercase; }

  .brut4 .b4stampd { display:inline-block; background:var(--red-fill); color:var(--on-red); border:2px solid var(--ink); font-family:var(--mono); font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:.08em; padding:6px 10px; transform:rotate(-3deg); }
  .brut4 .b4stampd.fire { animation:b4stampA 150ms steps(2,end); }

  .brut4 .bench { width:100%; border:var(--b2); background:var(--paper); position:relative; }
  .brut4 .bb-bar { display:flex; gap:12px; align-items:center; flex-wrap:wrap; padding:10px 14px; border-bottom:var(--b2); background:var(--ink); color:var(--paper); }
  .brut4 .bb-bar .logo { font-family:var(--disp); font-size:18px; text-transform:uppercase; }
  .brut4 .bb-body { display:flex; gap:16px; padding:16px; align-items:flex-start; }
  .brut4 .bb-rail { display:flex; flex-direction:column; gap:8px; min-width:210px; }
  .brut4 .bb-pile { display:flex; justify-content:space-between; gap:10px; padding:9px 10px; min-height:40px; border:var(--b1); background:var(--paper); font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.04em; cursor:pointer; text-align:left; color:var(--ink); position:relative; }
  .brut4 .bb-pile b { color:var(--red-ink); }
  .brut4 .bb-pile.on { border:var(--b2); box-shadow:inset 4px 0 0 var(--red); font-weight:700; }
  .brut4 .bb-pile::before { content:'+'; position:absolute; top:-7px; left:-6px; font:700 10px var(--mono); color:var(--red-ink); }

  .brut4 .b4phone { width:390px; max-width:100%; border:var(--b3); background:var(--paper); }
  .brut4 .ph-mast { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:var(--b2); background:var(--ink); color:var(--paper); }
  .brut4 .ph-mast .logo { font-family:var(--disp); font-size:16px; text-transform:uppercase; }
  .brut4 .ph-dock { display:flex; border-top:var(--b2); }
  .brut4 .ph-dock button { flex:1; min-height:52px; background:var(--paper); color:var(--ink); border:0; border-right:var(--b1); font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.06em; cursor:pointer; }
  .brut4 .ph-dock button:last-child { border-right:0; }
  .brut4 .ph-dock button.on { background:var(--ink); color:var(--paper); box-shadow:inset 0 -4px 0 var(--red); }

  .brut4 .b4demo-dens { width:min(340px,100%); padding:14px; display:flex; flex-direction:column; gap:10px; }
  .brut4 .b4demo-dens .b4demo-num { font-family:var(--disp); font-size:44px; line-height:1; font-variant-numeric:tabular-nums; }
  .brut4 .b4demo-dens .b4demo-track { height:12px; border:var(--b1); background:var(--paper2); position:relative; }
  .brut4 .b4demo-dens .b4demo-track i { display:block; height:100%; background:var(--ink); width:0; }

  @keyframes b4blink { 50% { opacity:0; } }
  @keyframes b4press { 0% { transform:translate(2px,2px); background:var(--red-fill); color:var(--on-red); } }
  @keyframes b4feed { to { width:100%; } }
  @keyframes b4stampA { 0% { opacity:0; transform:scale(1.8) rotate(-14deg); } 100% { opacity:1; transform:scale(1) rotate(-3deg); } }
  @keyframes b4lockA { 0%,50% { filter:invert(1); } 25%,100% { filter:invert(0); } }
  @media (prefers-reduced-motion: reduce) {
    .brut4 *, .brut4 *::before, .brut4 *::after { animation:none !important; transition:none !important; }
  }
  @media (max-width:720px) {
    .brut4 .g4 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .brut4 .bb-body { flex-direction:column; }
    .brut4 .bb-rail { flex-direction:row; flex-wrap:wrap; min-width:0; }
    .brut4 .trow { grid-template-columns:1fr; gap:4px; }
    .brut4 .b4field { min-width:0; width:100%; }
    .brut4 .b4con-body { flex-direction:column; }
    .brut4 .b4con-ft { gap:8px; }
  }
  `);

  var M = MEMES;
  mount.innerHTML = `
  <div class="brut4">
    <header class="mast">
      <span class="logo">sploot <span class="press-tag">press</span></span>
      <nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">upload</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
      <span class="mast-count">impression ${LIB.total.toLocaleString()} · rev ${LIB.dim}-${LIB.queued}</span>
    </header>

    <section class="hero">
      <span class="hero-strip">[ imposition floor · ${LIB.total.toLocaleString()} sheets on press ]</span>
      <h1>type words.<br>get the<br><span class="hl">picture.</span></h1>
      <p class="hero-sub">no folders. <span class="rd">just vibes.</span> every sheet is imposed, registered, and measured. the press indexes by meaning and never loses registration.</p>
      ${b4Console('cat losing it')}
      <div class="cgrid g4" style="width:100%">${M.slice(0, 4).map(function(x, i) { return b4Cell(x, i === 0 ? 'match' : '', i, i === 0); }).join('')}</div>
      <span class="imp-note">sheet ${LIB.total} · φ:${LIB.dim}° · λ:${LIB.latency}ms</span>
    </section>

    <div class="sec"><b>01</b><span style="font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em">[ foundations ]</span><span class="sec-tag">plate 1/6 · tokens, rules, registration</span></div>
    <div class="pad">
      ${b4Swx([
        ['press sheet', 'var(--paper)', '#F0ECE2 / #16140F', 'substrate'],
        ['under-sheet', 'var(--paper2)', '#E6E1D4 / #1E1C16', 'secondary fill'],
        ['carbon ink', 'var(--ink)', '#1A1A1A / #E8E2D2', 'carbon / phosphor'],
        ['hazard red', 'var(--red)', '#E61919 / #FF3A3A', 'sole accent \u2014 aa'],
        ['cyan ink', 'var(--ink-cyan)', '#0088C0 / #28A8DD', 'density strip ch. 1'],
        ['magenta ink', 'var(--ink-magenta)', '#E84890 / #FF66AA', 'density strip ch. 2'],
        ['yellow ink', 'var(--ink-yellow)', '#DDC800 / #F5D800', 'density strip ch. 3'],
        ['key / red', 'var(--ink-red)', '#E61919 / #FF3A3A', 'density strip ch. 4'],
      ])}
      <div class="row">
        <div class="shp ha">1px · hairline</div>
        <div class="shp">2px · plate edge</div>
        <div class="shp th">4px · selected</div>
        <div class="shp dbl">double plate · register</div>
        <div class="shp dash">dashed · imposition guide</div>
        <div class="shp xh">crosshair · registration</div>
        <div class="shp bar">ink density bar · measure</div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        ${b4density(94, '0.94')}
        ${b4grayWedge(LIB.total)}
        <span style="font-family:var(--mono);font-size:8px;text-transform:uppercase;color:var(--ink2)">density bar + step wedge \u2014 encode match score and index depth as functional chrome</span>
      </div>
      <p style="font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink2)">base unit: 8px press grid. all corners 0 radius. elevation is plate layers separated by paper. red is the ONLY accent \u2014 cyan, magenta, yellow exist as density-strip channels, never as decoration.</p>
    </div>

    <div class="sec"><b>02</b><span style="font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em">[ type ]</span><span class="sec-tag">plate 2/6 · press faces + one margin note</span></div>
    <div class="pad" style="gap:0">
      <div class="trow"><span class="lab">display</span><div class="tdisp">upload chaos</div></div>
      <div class="trow"><span class="lab">body</span><div class="tbody">bricolage grotesque carries the sentences. the pile imposes itself into semantic forms while the press rests. no folders were fed.</div></div>
      <div class="trow"><span class="lab">label</span><div style="font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em">[ label · space mono upper ]</div></div>
      <div class="trow"><span class="lab">metadata</span><div style="font-family:var(--mono);font-size:9px;color:var(--ink2);text-transform:uppercase;letter-spacing:.05em">sheet 0413 · sim 0.94 · 212ms · siglip-base · 768d · /api/search</div></div>
      <div class="trow"><span class="lab">tabular</span><div class="tnum">1,482 · 0.94 · 212ms · 768</div></div>
      <div class="trow"><span class="lab">caption</span><div class="tcap">long caption wrap test: me explaining to the group chat why the spreadsheet cell that broke me is now printed and framed above my desk like a diploma.</div></div>
      <div class="trow"><span class="lab">serif</span><div><div class="tserif">a beautiful archive of extremely stupid images</div><p style="font-family:var(--mono);font-size:8px;text-transform:uppercase;color:var(--ink2);margin-top:6px">instrument serif italic appears once per page under a halftone veil. one appearance. that is the entire serif budget.</p></div></div>
      <div class="trow"><span class="lab">marginalia</span><div class="thand">notes the press operator scribbles on the sleeve · caveat</div></div>
    </div>

    <div class="sec"><b>03</b><span style="font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em">[ components ]</span><span class="sec-tag">plate 3/6 · the press kit</span></div>
    <div class="pad">
      ${b4Console('sad frog')}
      <div class="cgrid g4" style="width:100%">
        ${b4Cell(M[1], '', 1)}${b4Cell(M[0], 'match', 0, true)}${b4Cell(M[2], 'near', 2)}${b4Cell(M[3], 'dim', 3)}
        ${b4Cell(M[4], 'selected', 4)}${b4Cell(M[5], 'loading', 5)}${b4Cell(M[7], 'error', 6)}
        <div class="b4empty" style="border:0;max-width:none"><span class="big">no sheets on press</span><p style="font-size:14px;max-width:38ch">the feed is empty. zero impressions. upload chaos and the press starts running.</p><button class="b4btn primary">load feed</button></div>
      </div>
      <div class="row">
        <button class="b4btn primary">run press</button>
        <button class="b4btn">shuffle the pile</button>
        <button class="b4btn sm">compact</button>
        <button class="b4btn sm icon" aria-label="close">✕</button>
        <span class="b4tag">reaction faces</span>
        <span class="b4tag">cats being unwell</span>
        <span class="b4banger">banger</span>
      </div>
      <div class="row">
        <div class="b4field"><span class="b4field-pr">&gt;</span><span class="b4field-q">text input</span><span class="b4field-care"></span></div>
        <div class="b4tabs" role="tablist"><button class="b4tab on">all</button><button class="b4tab">bangers</button><button class="b4tab">recent</button></div>
        <div class="b4toast">\u25a0 sheet filed. registration confirmed.</div>
      </div>
      <div class="cgrid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));width:100%;max-width:640px">
        <div class="b4stat"><span class="b4stat-imp">folders required</span><span class="v">0</span></div>
        <div class="b4stat"><span class="b4stat-imp">sheets imposed</span><span class="v">1,482</span></div>
        <div class="b4stat red"><span class="b4stat-imp">bangers</span><span class="v">37</span></div>
      </div>
    </div>
    ${b4StatusBar()}

    <div class="sec"><b>04</b><span style="font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em">[ motion ]</span><span class="sec-tag">plate 4/6 · press cycle, mechanical only</span></div>
    <div class="pad">
      <div class="row">
        <button class="b4btn primary" id="b4-press">press cycle</button>
        <button class="b4btn" id="b4-stamp-go">stamp register</button>
        <span class="b4stampd" id="b4-stamp" hidden>REGISTER</span>
        <button class="b4btn" id="b4-lock-go">run register check</button>
        <button class="b4btn" id="b4-dens-go">fill density</button>
      </div>
      <div id="b4-lock-cell" style="width:min(280px,100%)">${b4Cell(M[0])}</div>
      <div id="b4-dens-demo" class="b4dens-demo" style="display:none">
        <span class="b4demo-num" id="b4-dens-val">0.00</span>
        <div class="b4demo-track"><i id="b4-dens-fill"></i></div>
      </div>
      <p style="font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink2)">motion is steps(), 100 to 150ms, fired by interaction only. prefers-reduced-motion collapses every cycle to an instant state change. density bars jump to their value.</p>
    </div>

    <div class="sec"><b>05</b><span style="font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em">[ compositions ]</span><span class="sec-tag">plate 5/6 · workbench + press card</span></div>
    <div class="pad">
      <div class="bench">
        <div class="bb-bar">
          <span class="logo">sploot <span class="press-tag" style="color:var(--red);border-color:var(--red);font-size:7px">press</span></span>
          <div class="b4field" style="flex:1;max-width:460px;background:var(--paper);color:var(--ink)"><span class="b4field-pr">&gt;</span><span class="b4field-q">search the pile</span><span class="b4field-care"></span></div>
          <button class="b4btn primary" style="background:var(--paper);color:var(--ink)">find it</button>
          <button class="b4btn" style="background:var(--paper);color:var(--ink)">upload chaos</button>
        </div>
        <div class="bb-body">
          <aside class="bb-rail">
            <span style="font-family:var(--mono);font-size:9px;text-transform:uppercase;color:var(--ink2);padding:4px 0">automatic piles</span>
            ${PILES.map(function(p, i) { return '<button class="bb-pile ' + (i === 0 ? 'on' : '') + '"><span>' + esc(p.name) + '</span><b>' + p.n + '</b></button>'; }).join('')}
          </aside>
          <div class="cgrid g4" style="flex:1">${M.slice(0, 8).map(function(x, i) { return b4Cell(x, '', i); }).join('')}</div>
        </div>
        ${b4StatusBar()}
      </div>
      <div class="b4phone">
        <div class="ph-mast"><span class="logo">sploot</span><span style="font-family:var(--mono);font-size:9px;text-transform:uppercase;opacity:.7">1,482 on press</span></div>
        <div style="padding:10px;display:flex;flex-direction:column;gap:10px">
          <div class="b4field" style="min-width:0"><span class="b4field-pr">&gt;</span><span class="b4field-q">cat losing it</span><span class="b4field-care"></span></div>
          <div class="cgrid" style="grid-template-columns:1fr 1fr">${M.slice(0, 4).map(function(x, i) { return b4Cell(x, i === 0 ? 'match' : '', i); }).join('')}</div>
        </div>
        <div class="ph-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'the imposition floor · press-floor precision'], ['type', 'archivo black / bricolage grotesque / space mono / caveat + rationed instrument serif'], ['move', 'registration is the ornament: every element carries crop marks, density bars, imposition guides, and registration crosshairs as functional chrome'], ['density', 'bimodal: dense instrument panels vs press-break heroes'], ['motion', 'steps() mechanical, press cycle only on interaction']])}
    </div>
  </div>`;

  var root = mount.querySelector('.brut4');
  themeToggle(root);
  var pressBtn = root.querySelector('#b4-press');
  if (pressBtn) pressBtn.addEventListener('click', function() {
    pressBtn.classList.remove('press'); void pressBtn.offsetWidth; pressBtn.classList.add('press');
  });
  var sgo = root.querySelector('#b4-stamp-go'), st = root.querySelector('#b4-stamp');
  if (sgo && st) sgo.addEventListener('click', function() {
    st.hidden = false; st.classList.remove('fire'); void st.offsetWidth; st.classList.add('fire');
  });
  var lgo = root.querySelector('#b4-lock-go'), lc = root.querySelector('#b4-lock-cell');
  if (lgo && lc) { var on = false; lgo.addEventListener('click', function() {
    on = !on; lc.innerHTML = b4Cell(MEMES[0], on ? 'match' : '', 0, on);
    lc.classList.remove('flick'); void lc.offsetWidth; lc.classList.add('flick');
    lgo.textContent = on ? 'release register' : 'run register check';
  }); }
  var dgo = root.querySelector('#b4-dens-go'), dd = root.querySelector('#b4-dens-demo');
  var dfill = root.querySelector('#b4-dens-fill'), dval = root.querySelector('#b4-dens-val');
  if (dgo && dd && dfill && dval) dgo.addEventListener('click', function() {
    dd.style.display = 'flex';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { dval.textContent = '0.94'; dfill.style.width = '94%'; return; }
    dfill.style.width = '0%'; dval.textContent = '0.00';
    requestAnimationFrame(function() { dfill.style.width = '94%'; });
    var t0 = performance.now();
    (function tick(t) {
      var p = Math.min(1, (t - t0) / 520);
      dval.textContent = ((p * 94) / 100).toFixed(2);
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  });
};

})();
