/* lab 034 · lane SOFT · glossy agency-tier maximalism. three propositions:
   SOFT-1 velvet vault (material depth), SOFT-2 candy marquee (z-axis scale),
   SOFT-3 grand salon (deco ornament density). */
'use strict';

(() => {

/* ══════════════════════════════════════════════════════════════════════
   SOFT-1 · VELVET VAULT
   system rule: every object is cased twice. an outer machined tray and an
   inner lacquered core with concentric radii. maximalism lives in material
   depth: jewel accents, engraved metadata, plush diffused shadows.
   ══════════════════════════════════════════════════════════════════════ */

function s1Cell(m, state = '', score = false) {
  const chip = { match: 'match', near: 'near', dim: 'cold', selected: 'picked ✓' }[state];
  return `
  <figure class="s1-cell ${state}">
    <div class="s1-cell-core">
      <div class="s1-cell-head"><span>${esc(m.file)}</span><span>vec ${m.vec}</span></div>
      <div class="s1-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>
      <figcaption class="s1-cell-cap"><span>${esc(m.cap)}</span>${m.banger ? '<span class="s1-banger">banger</span>' : ''}</figcaption>
      ${score ? `<div class="s1-scorebar"><b>${(m.score / 100).toFixed(2)}</b><span>${m.score >= 90 ? 'closest match' : m.score >= 75 ? 'strong match' : 'related'}</span></div>` : ''}
    </div>
    ${chip ? `<span class="s1-statechip c-${state}">${chip}</span>` : ''}
  </figure>`;
}

function s1Console(q = 'cat losing it') {
  return `
  <div class="s1-console">
    <div class="s1-console-core">
      <div class="s1-rail">
        <span class="s1-jewel e"></span><span class="s1-jewel s"></span><span class="s1-jewel r"></span>
        <b>semantic search console</b>
        <span class="s1-rail-meta">${LIB.model} · ${LIB.dim}d</span>
      </div>
      <div class="s1-shelf">
        <label class="s1-field"><span class="pfx">›</span><input value="${esc(q)}" aria-label="search the pile"></label>
        <button class="s1-btn primary">find it <span class="orb">→</span></button>
      </div>
      <div class="s1-engrave">index ${LIB.total.toLocaleString()} vec · queue ${LIB.queued} embedding · ${LIB.latency}ms · /api/search</div>
    </div>
  </div>`;
}

function s1Status() {
  const cells = [['index', `${LIB.total.toLocaleString()} vec`], ['model', LIB.model],
    ['queue', `${LIB.queued} embedding`], ['latency', `${LIB.latency}ms`], ['status', 'live', 1]];
  return `<div class="s1-status">${cells.map(c =>
    `<span class="cell${c[2] ? ' ok' : ''}"><b>${c[0]}</b>${c[1]}</span>`).join('')}</div>`;
}

function s1Sec(n, t) {
  return `<div class="s1-sec"><span class="s1-secnum">${n}</span><span>${t}</span><i></i></div>`;
}

function s1Swatch(list) {
  return `<div class="s1-swatches">${list.map(([n, c, fg]) => `
    <div class="s1-swatch"><span class="chipwell"><span class="chip" style="background:${c}"></span></span>
    <b>${n}</b><span style="color:${fg || 'inherit'}">${c}</span></div>`).join('')}</div>`;
}

SPECS['SOFT-1'] = (mount) => {
  css('SOFT-1', `
  .soft1 {
    --bg:#f6f0e2; --tray:#ebe1cc; --surface:#fffdf5; --surface2:#f2ebda;
    --ink:#261d10; --ink-soft:#6d6250; --line:rgba(38,29,16,.14); --line2:rgba(38,29,16,.32);
    --emerald:#0c6b50; --on-emerald:#effff8;
    --sapphire:#2447d1; --on-sapphire:#f0f3ff;
    --ruby:#ac1040; --on-ruby:#fff0f4;
    --amber:#f0b02b; --on-amber:#2b1e04;
    --focus:#2447d1;
    --r:26px; --r-in:19px;
    --shadow:0 30px 60px -28px rgba(38,29,16,.42), 0 3px 8px rgba(38,29,16,.07);
    --shadow-up:0 42px 80px -30px rgba(38,29,16,.48), 0 5px 12px rgba(38,29,16,.08);
    --hl:inset 0 1px 0 rgba(255,255,255,.7);
    --ease:cubic-bezier(0.32,0.72,0,1); --spring:cubic-bezier(0.34,1.56,0.64,1);
    min-height:100dvh; display:flex; flex-direction:column; overflow-x:clip;
    font-family:'Space Grotesk',sans-serif; font-size:16px; color:var(--ink); background:var(--bg);
  }
  .soft1.theme-dark {
    --bg:#161009; --tray:#0f0b06; --surface:#241b11; --surface2:#1e160d;
    --ink:#f4ebd7; --ink-soft:#b7a88b; --line:rgba(244,235,215,.15); --line2:rgba(244,235,215,.36);
    --emerald:#2ec795; --on-emerald:#052318;
    --sapphire:#98acff; --on-sapphire:#0a1030;
    --ruby:#ff6f95; --on-ruby:#340010;
    --amber:#f0b02b; --on-amber:#2b1e04;
    --focus:#98acff;
    --shadow:0 30px 60px -24px rgba(0,0,0,.85), 0 3px 8px rgba(0,0,0,.4);
    --shadow-up:0 42px 80px -26px rgba(0,0,0,.9), 0 5px 12px rgba(0,0,0,.45);
    --hl:inset 0 1px 0 rgba(255,255,255,.09);
  }
  .soft1 :is(a,button,input,[tabindex]):focus-visible {
    outline:3px solid var(--focus); outline-offset:3px; border-radius:8px;
  }
  .soft1 .s1-wrap { width:100%; max-width:1220px; margin:0 auto; padding:0 clamp(16px,4vw,48px); }
  .soft1 .s1-sec {
    display:flex; align-items:center; gap:14px; margin:clamp(56px,8vw,92px) 0 26px;
    font-family:'IBM Plex Mono',monospace; font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-soft);
  }
  .soft1 .s1-secnum {
    display:inline-grid; place-items:center; width:34px; height:34px; border-radius:50%;
    border:1px solid var(--line2); font-weight:600; color:var(--ink); background:var(--surface); box-shadow:var(--hl);
  }
  .soft1 .s1-sec i { flex:1; border-top:1px solid var(--line); }

  /* the double bezel: tray + core */
  .soft1 .s1-tray {
    background:var(--tray); border:1px solid var(--line); border-radius:var(--r);
    padding:7px; box-shadow:var(--shadow);
  }
  .soft1 .s1-core {
    background:var(--surface); border:1px solid var(--line); border-radius:var(--r-in);
    box-shadow:var(--hl);
  }

  /* masthead: floating cased bar */
  .soft1 .s1-mast { position:sticky; top:0; z-index:20; padding:14px clamp(16px,4vw,48px) 6px; }
  .soft1 .s1-mast-tray {
    max-width:1220px; margin:0 auto; background:var(--tray); border:1px solid var(--line);
    border-radius:999px; padding:6px; box-shadow:var(--shadow);
  }
  .soft1 .s1-mast-core {
    display:flex; align-items:center; gap:18px; background:var(--surface); border:1px solid var(--line);
    border-radius:999px; padding:8px 10px 8px 20px; box-shadow:var(--hl);
  }
  .soft1 .s1-logo { font-family:'Fraunces',serif; font-weight:900; font-size:22px; letter-spacing:-.02em; }
  .soft1 .s1-logo i { font-style:normal; color:var(--emerald); }
  .soft1.theme-dark .s1-logo i { color:var(--emerald); }
  .soft1 .s1-nav { margin-left:auto; display:flex; gap:4px; flex-wrap:wrap; }
  .soft1 .s1-nav a {
    color:var(--ink-soft); text-decoration:none; font-size:13px; font-weight:500;
    padding:9px 14px; border-radius:999px; transition:color .35s var(--ease), background .35s var(--ease);
  }
  .soft1 .s1-nav a:hover { color:var(--ink); background:var(--surface2); }

  /* buttons: cased pills with nested orb */
  .soft1 .s1-btn {
    display:inline-flex; align-items:center; gap:10px; min-height:48px; padding:6px 8px 6px 22px;
    border:1px solid var(--line2); border-radius:999px; background:var(--surface); color:var(--ink);
    font:600 14px 'Space Grotesk',sans-serif; box-shadow:var(--hl), var(--shadow);
    transition:transform .45s var(--spring), box-shadow .45s var(--ease);
  }
  .soft1 .s1-btn:hover { transform:translateY(-3px); box-shadow:var(--hl), var(--shadow-up); }
  .soft1 .s1-btn:active { transform:scale(.965); }
  .soft1 .s1-btn .orb {
    display:inline-grid; place-items:center; width:34px; height:34px; border-radius:50%;
    background:rgba(0,0,0,.1); font-size:15px; transition:transform .45s var(--spring);
  }
  .soft1 .s1-btn:hover .orb { transform:translate(3px,-1px) scale(1.06); }
  .soft1 .s1-btn.primary { background:var(--emerald); color:var(--on-emerald); border-color:transparent; }
  .soft1 .s1-btn.primary .orb { background:rgba(255,255,255,.18); }
  .soft1 .s1-btn.ruby { background:var(--ruby); color:var(--on-ruby); border-color:transparent; }
  .soft1 .s1-btn.ruby .orb { background:rgba(255,255,255,.18); }
  .soft1 .s1-btn.compact { min-height:36px; padding:4px 14px; font-size:12.5px; box-shadow:var(--hl); }
  .soft1 .s1-btn.iconb { min-height:44px; width:44px; padding:0; justify-content:center; }

  /* sticker + banger */
  .soft1 .s1-sticker {
    display:inline-flex; align-items:center; gap:8px; padding:7px 16px; border-radius:999px;
    background:var(--amber); color:var(--on-amber); font:700 12.5px 'IBM Plex Mono',monospace;
    letter-spacing:.02em; box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 10px 24px -12px rgba(38,29,16,.5);
  }
  .soft1 .s1-banger {
    flex:none; font:700 10px 'IBM Plex Mono',monospace; letter-spacing:.08em; text-transform:uppercase;
    background:var(--ruby); color:var(--on-ruby); border-radius:999px; padding:3px 9px;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.25);
  }

  /* eyebrow */
  .soft1 .s1-eyebrow {
    display:inline-flex; align-items:center; gap:8px; padding:6px 14px; border-radius:999px;
    border:1px solid var(--line2); background:var(--surface); box-shadow:var(--hl);
    font:600 10.5px 'IBM Plex Mono',monospace; letter-spacing:.22em; text-transform:uppercase; color:var(--ink-soft);
  }
  .soft1 .s1-eyebrow::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--emerald); }

  /* hero */
  .soft1 .s1-hero { display:grid; grid-template-columns:1.15fr .85fr; gap:clamp(24px,4vw,56px); align-items:center; padding-top:clamp(40px,6vw,80px); }
  .soft1 .s1-h1 {
    font-family:'Fraunces',serif; font-weight:900; letter-spacing:-.03em; line-height:.95;
    font-size:clamp(46px,7.2vw,108px); margin:22px 0 18px;
  }
  .soft1 .s1-h1 em { font-style:italic; font-weight:600; color:var(--emerald); }
  .soft1 .s1-sub { font-size:17px; line-height:1.55; max-width:46ch; color:var(--ink-soft); }
  .soft1 .s1-hero-stack { display:flex; flex-direction:column; gap:18px; }
  .soft1 .s1-hero-stack .s1-cell:nth-child(1) { transform:rotate(-1.4deg); }
  .soft1 .s1-hero-stack .s1-cell:nth-child(2) { transform:rotate(1.2deg); margin-top:-6px; }

  /* console */
  .soft1 .s1-console { background:var(--tray); border:1px solid var(--line); border-radius:var(--r); padding:7px; box-shadow:var(--shadow); }
  .soft1 .s1-console-core { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-in); box-shadow:var(--hl); overflow:hidden; }
  .soft1 .s1-rail {
    display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid var(--line);
    font:600 10.5px 'IBM Plex Mono',monospace; letter-spacing:.18em; text-transform:uppercase; color:var(--ink-soft);
  }
  .soft1 .s1-rail b { font-weight:600; }
  .soft1 .s1-rail-meta { margin-left:auto; letter-spacing:.08em; }
  .soft1 .s1-jewel { width:9px; height:9px; border-radius:50%; box-shadow:inset 0 1px 1px rgba(255,255,255,.6), 0 1px 2px rgba(0,0,0,.3); }
  .soft1 .s1-jewel.e { background:var(--emerald); } .soft1 .s1-jewel.s { background:var(--sapphire); } .soft1 .s1-jewel.r { background:var(--ruby); }
  .soft1 .s1-shelf { display:flex; gap:12px; padding:16px; align-items:center; }
  .soft1 .s1-field {
    flex:1; display:flex; align-items:center; gap:10px; min-height:48px; padding:0 18px;
    background:var(--surface2); border:1px solid var(--line2); border-radius:999px; box-shadow:inset 0 2px 5px rgba(0,0,0,.08);
  }
  .soft1 .s1-field .pfx { color:var(--ink-soft); }
  .soft1 .s1-field input { flex:1; min-width:0; border:0; background:none; color:var(--ink); font:500 15px 'IBM Plex Mono',monospace; }
  .soft1 .s1-field input:focus { outline:none; }
  .soft1 .s1-field:focus-within { border-color:var(--focus); box-shadow:inset 0 2px 5px rgba(0,0,0,.08), 0 0 0 3px color-mix(in srgb, var(--focus) 25%, transparent); }
  .soft1 .s1-engrave {
    padding:9px 18px; border-top:1px solid var(--line); background:var(--surface2);
    font:500 10.5px 'IBM Plex Mono',monospace; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-soft);
  }

  /* meme cell */
  .soft1 .s1-cell {
    position:relative; margin:0; background:var(--tray); border:1px solid var(--line);
    border-radius:var(--r); padding:7px; box-shadow:var(--shadow);
    transition:transform .45s var(--spring), box-shadow .45s var(--ease);
  }
  .soft1 .s1-cell:hover { transform:translateY(-4px); box-shadow:var(--shadow-up); }
  .soft1 .s1-cell-core { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-in); box-shadow:var(--hl); overflow:hidden; }
  .soft1 .s1-cell-head {
    display:flex; justify-content:space-between; gap:8px; padding:7px 12px;
    font:500 9.5px 'IBM Plex Mono',monospace; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-soft);
    border-bottom:1px solid var(--line); white-space:nowrap; overflow:hidden;
  }
  .soft1 .s1-art { display:grid; place-items:center; background:var(--surface2); }
  .soft1 .meme-media { background:var(--surface2); }
  .soft1 .s1-cell-cap {
    display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 12px;
    font-size:12.5px; font-weight:500; line-height:1.4; border-top:1px solid var(--line);
  }
  .soft1 .s1-scorebar {
    display:flex; justify-content:space-between; align-items:center; padding:7px 12px; border-top:1px solid var(--line);
    background:var(--surface2); font:600 10px 'IBM Plex Mono',monospace; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-soft);
  }
  .soft1 .s1-scorebar b { font-size:13px; color:var(--ink); font-variant-numeric:tabular-nums; }
  .soft1 .s1-statechip {
    position:absolute; top:-10px; right:14px; padding:4px 12px; border-radius:999px;
    font:700 10px 'IBM Plex Mono',monospace; letter-spacing:.1em; text-transform:uppercase;
    box-shadow:0 8px 18px -8px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.3);
  }
  .soft1 .s1-cell.match { box-shadow:0 0 0 3px var(--emerald), var(--shadow-up); }
  .soft1 .s1-statechip.c-match { background:var(--emerald); color:var(--on-emerald); }
  .soft1 .s1-cell.near { box-shadow:0 0 0 2px var(--amber), var(--shadow); }
  .soft1 .s1-statechip.c-near { background:var(--amber); color:var(--on-amber); }
  .soft1 .s1-cell.dim { opacity:.45; filter:saturate(.4); }
  .soft1 .s1-statechip.c-dim { background:var(--surface); color:var(--ink-soft); border:1px solid var(--line2); }
  .soft1 .s1-cell.selected { box-shadow:0 0 0 3px var(--sapphire), var(--shadow-up); }
  .soft1 .s1-statechip.c-selected { background:var(--sapphire); color:var(--on-sapphire); }
  .soft1 .s1-loadart {
    display:grid; place-items:center; font:600 10px 'IBM Plex Mono',monospace; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-soft);
    background:repeating-linear-gradient(-45deg, var(--surface2), var(--surface2) 10px, var(--surface) 10px, var(--surface) 20px);
  }

  /* stat block */
  .soft1 .s1-stat { min-width:170px; background:var(--tray); border:1px solid var(--line); border-radius:var(--r); padding:7px; box-shadow:var(--shadow); }
  .soft1 .s1-stat .core { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-in); box-shadow:var(--hl); padding:16px 18px; }
  .soft1 .s1-stat .lbl { font:600 10px 'IBM Plex Mono',monospace; letter-spacing:.18em; text-transform:uppercase; color:var(--ink-soft); }
  .soft1 .s1-stat .val { font-family:'Fraunces',serif; font-weight:900; font-size:40px; line-height:1.1; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
  .soft1 .s1-stat.jewel .core { background:var(--emerald); color:var(--on-emerald); border-color:transparent; }
  .soft1 .s1-stat.jewel .lbl { color:var(--on-emerald); opacity:.75; }

  /* status bar */
  .soft1 .s1-status {
    display:flex; flex-wrap:wrap; gap:0; border-radius:999px; overflow:hidden;
    border:1px solid var(--line2); background:var(--surface); box-shadow:var(--hl), var(--shadow); width:max-content; max-width:100%;
  }
  .soft1 .s1-status .cell {
    display:flex; gap:8px; align-items:center; padding:11px 18px; border-right:1px solid var(--line);
    font:500 11px 'IBM Plex Mono',monospace; letter-spacing:.06em;
  }
  .soft1 .s1-status .cell:last-child { border-right:0; }
  .soft1 .s1-status .cell b { font-weight:600; text-transform:uppercase; font-size:9.5px; letter-spacing:.16em; color:var(--ink-soft); }
  .soft1 .s1-status .ok::after { content:"●"; color:var(--emerald); font-size:9px; }

  /* tabs */
  .soft1 .s1-tabs { display:inline-flex; gap:4px; padding:5px; border-radius:999px; background:var(--tray); border:1px solid var(--line); box-shadow:var(--shadow); }
  .soft1 .s1-tab {
    border:0; background:none; color:var(--ink-soft); font:600 13px 'Space Grotesk',sans-serif;
    min-height:38px; padding:0 18px; border-radius:999px; transition:background .35s var(--ease), color .35s var(--ease);
  }
  .soft1 .s1-tab.on { background:var(--surface); color:var(--ink); box-shadow:var(--hl), 0 6px 14px -8px rgba(0,0,0,.4); }

  /* toast */
  .soft1 .s1-toast {
    display:inline-flex; align-items:center; gap:12px; padding:6px; border-radius:999px;
    background:var(--tray); border:1px solid var(--line); box-shadow:var(--shadow);
  }
  .soft1 .s1-toast .core { display:inline-flex; align-items:center; gap:10px; background:var(--surface); border:1px solid var(--line); border-radius:999px; padding:9px 18px; box-shadow:var(--hl); font-size:13.5px; font-weight:500; }
  .soft1 .s1-toast .tick { display:inline-grid; place-items:center; width:22px; height:22px; border-radius:50%; background:var(--emerald); color:var(--on-emerald); font-size:11px; }

  /* empty state */
  .soft1 .s1-empty { max-width:480px; }
  .soft1 .s1-empty .core { padding:34px 30px; display:flex; flex-direction:column; align-items:flex-start; gap:16px; }
  .soft1 .s1-empty h3 { font-family:'Fraunces',serif; font-weight:900; font-size:30px; letter-spacing:-.02em; }
  .soft1 .s1-empty p { color:var(--ink-soft); font-size:15px; line-height:1.55; }

  /* swatches */
  .soft1 .s1-swatches { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:14px; }
  .soft1 .s1-swatch {
    background:var(--surface); border:1px solid var(--line); border-radius:var(--r-in); box-shadow:var(--hl), var(--shadow);
    padding:10px; font:600 10.5px 'IBM Plex Mono',monospace; letter-spacing:.08em; text-transform:uppercase;
    display:flex; flex-direction:column; gap:4px;
  }
  .soft1 .s1-swatch .chipwell { display:block; background:var(--surface2); border-radius:12px; padding:5px; border:1px solid var(--line); }
  .soft1 .s1-swatch .chip { display:block; height:44px; border-radius:8px; box-shadow:inset 0 1px 1px rgba(255,255,255,.4); }
  .soft1 .s1-swatch span:last-child { color:var(--ink-soft); }
  .soft1 .s1-shape { width:150px; height:96px; display:grid; place-items:center; text-align:center; font:600 9.5px 'IBM Plex Mono',monospace; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-soft); }

  /* workbench */
  .soft1 .s1-bench { background:var(--tray); border:1px solid var(--line); border-radius:var(--r); padding:7px; box-shadow:var(--shadow); }
  .soft1 .s1-bench-core { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-in); box-shadow:var(--hl); overflow:hidden; }
  .soft1 .s1-bench-bar { display:flex; align-items:center; gap:14px; padding:12px 18px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
  .soft1 .s1-bench-main { display:flex; gap:18px; padding:18px; }
  .soft1 .s1-rail-piles { display:flex; flex-direction:column; gap:8px; min-width:210px; }
  .soft1 .s1-pile {
    display:flex; justify-content:space-between; gap:10px; align-items:center; min-height:44px; padding:0 16px;
    border:1px solid var(--line2); border-radius:999px; background:var(--surface); box-shadow:var(--hl);
    font:500 12.5px 'Space Grotesk',sans-serif; color:var(--ink); cursor:pointer;
    transition:transform .35s var(--spring), box-shadow .35s var(--ease);
  }
  .soft1 .s1-pile:hover { transform:translateX(3px); }
  .soft1 .s1-pile b { font:600 11px 'IBM Plex Mono',monospace; color:var(--ink-soft); }
  .soft1 .s1-pile.on { background:var(--emerald); color:var(--on-emerald); border-color:transparent; }
  .soft1 .s1-pile.on b { color:var(--on-emerald); opacity:.8; }

  /* phone */
  .soft1 .s1-phone { width:390px; max-width:100%; flex:none; background:var(--tray); border:1px solid var(--line); border-radius:40px; padding:9px; box-shadow:var(--shadow-up); }
  .soft1 .s1-phone-core { background:var(--surface); border:1px solid var(--line); border-radius:32px; box-shadow:var(--hl); overflow:hidden; }
  .soft1 .s1-dock { display:flex; gap:4px; padding:8px; border-top:1px solid var(--line); background:var(--surface2); }
  .soft1 .s1-dock button {
    flex:1; min-height:46px; border:0; border-radius:999px; background:none; color:var(--ink-soft);
    font:600 10.5px 'IBM Plex Mono',monospace; letter-spacing:.08em; text-transform:uppercase;
  }
  .soft1 .s1-dock button.on { background:var(--emerald); color:var(--on-emerald); box-shadow:inset 0 1px 0 rgba(255,255,255,.2); }

  .soft1 .s1-grid { display:grid; gap:20px; }
  .soft1 .g4 { grid-template-columns:repeat(4,1fr); }
  .soft1 .s1-row { display:flex; gap:16px; flex-wrap:wrap; align-items:center; }
  .soft1 .s1-note { font:500 11px 'IBM Plex Mono',monospace; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-soft); }

  @keyframes s1Bloom {
    0% { box-shadow:0 0 0 0 var(--emerald), var(--shadow); transform:scale(.97); }
    55% { box-shadow:0 0 0 8px var(--emerald), var(--shadow-up); transform:scale(1.015); }
    100% { box-shadow:0 0 0 3px var(--emerald), var(--shadow-up); transform:scale(1); }
  }
  .soft1 .s1-bloom { animation:s1Bloom .6s var(--spring) both; }
  @keyframes s1Pop {
    0% { opacity:0; transform:scale(.4) rotate(-14deg); }
    65% { opacity:1; transform:scale(1.12) rotate(4deg); }
    100% { opacity:1; transform:scale(1) rotate(0); }
  }
  .soft1 .s1-pop { animation:s1Pop .5s var(--spring) both; }
  @keyframes s1Settle {
    0% { transform:translateY(14px) scale(.98); opacity:0; }
    100% { transform:translateY(0) scale(1); opacity:1; }
  }
  .soft1 .s1-settle { animation:s1Settle .7s var(--ease) both; }

  @media (prefers-reduced-motion: reduce) {
    .soft1 *, .soft1 *::before, .soft1 *::after { animation:none !important; transition:none !important; }
  }
  @media (max-width: 980px) {
    .soft1 .s1-hero { grid-template-columns:1fr; }
    .soft1 .s1-bench-main { flex-direction:column; }
    .soft1 .s1-rail-piles { flex-direction:row; flex-wrap:wrap; min-width:0; }
  }
  @media (max-width: 700px) {
    .soft1 .g4 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .soft1 .s1-grid { gap:12px; }
    .soft1 .s1-nav a { padding:9px 8px; font-size:12px; }
    .soft1 .s1-shelf { flex-direction:column; align-items:stretch; }
    .soft1 .s1-hero-stack .s1-cell { transform:none; margin-top:0; }
    .soft1 .s1-status { border-radius:24px; width:100%; }
  }
  `);

  const M = MEMES;
  mount.innerHTML = `
  <div class="soft1">
    <div class="s1-mast"><div class="s1-mast-tray"><div class="s1-mast-core">
      <span class="s1-logo">sploot<i>.</i></span>
      <nav class="s1-nav"><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">upload</a><a href="#0">settings</a></nav>
      <button class="s1-btn primary" style="min-height:40px">sign in <span class="orb">→</span></button>
    </div></div></div>

    <div class="s1-wrap s1-hero">
      <div>
        <span class="s1-eyebrow">private meme archive · ${LIB.total.toLocaleString()} cased</span>
        <h1 class="s1-h1">type words.<br>get the <em>picture.</em></h1>
        <p class="s1-sub">no folders. just vibes. every meme gets cased in the vault, embedded by ${LIB.model}, and retrieved in ${LIB.latency}ms flat.</p>
        <div class="s1-row" style="margin-top:26px">
          <button class="s1-btn primary">open the vault <span class="orb">→</span></button>
          <button class="s1-btn">shuffle the pile <span class="orb">⤨</span></button>
        </div>
        <div style="margin-top:30px">${s1Console()}</div>
      </div>
      <div class="s1-hero-stack">${s1Cell(M[0], 'match', true)}${s1Cell(M[2])}</div>
    </div>

    <div class="s1-wrap">${s1Sec('01', 'foundations · jewel palette, casework, elevation')}
      ${s1Swatch([['ink', '#261d10'], ['cream', '#f6f0e2'], ['tray', '#ebe1cc'], ['lacquer', '#fffdf5'], ['emerald', '#0c6b50'], ['sapphire', '#2447d1'], ['ruby', '#ac1040'], ['amber', '#f0b02b']])}
      <div class="s1-row" style="margin-top:22px">
        <div class="s1-tray s1-shape">tray · r26 outer case</div>
        <div class="s1-core s1-shape">core · r19 concentric</div>
        <div class="s1-tray s1-shape" style="border-radius:999px">pill · controls</div>
        <div class="s1-core s1-shape" style="box-shadow:var(--hl), var(--shadow)">float · plush shadow</div>
        <div class="s1-core s1-shape" style="box-shadow:var(--hl), var(--shadow-up)">lift · hover tier</div>
      </div>
      <p class="s1-note" style="margin-top:16px">spacing breathes on an 8px scale with clamp(56, 8vw, 92) between sections. density: plush.</p>
    </div>

    <div class="s1-wrap">${s1Sec('02', 'typography')}
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="font-family:'Fraunces',serif;font-weight:900;font-size:clamp(40px,6vw,74px);letter-spacing:-.03em;line-height:.98">display · fraunces black <em style="font-weight:600;color:var(--emerald)">with italic</em></div>
        <div style="font-size:17px;max-width:58ch;line-height:1.55">body · space grotesk. the vault sorts itself into semantic piles while you sleep. no folders were harmed in the making of this archive.</div>
        <div style="font:600 12px 'IBM Plex Mono',monospace;letter-spacing:.18em;text-transform:uppercase">label · ibm plex mono caps</div>
        <div style="font:500 11px 'IBM Plex Mono',monospace;color:var(--ink-soft)">metadata · vec 0413 · ${LIB.latency}ms · ${LIB.model}</div>
        <div style="font:600 28px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums">1,482 · 0.94 · 212ms</div>
        <div style="font-size:14px;max-width:46ch;line-height:1.6;border-left:2px solid var(--amber);padding-left:14px;color:var(--ink-soft)">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me is now cased in velvet and hung above my desk like a diploma.</div>
      </div>
    </div>

    <div class="s1-wrap">${s1Sec('03', 'components · the casework kit')}
      <div style="display:flex;flex-direction:column;gap:30px">
        ${s1Console('sad frog')}
        <div class="s1-grid g4" style="padding-top:10px">
          ${s1Cell(M[0], 'match', true)}${s1Cell(M[1], 'near')}${s1Cell(M[3], 'dim')}${s1Cell(M[5])}
        </div>
        <div class="s1-grid g4" style="padding-top:10px">
          ${s1Cell(M[4], 'selected')}
          <figure class="s1-cell"><div class="s1-cell-core">
            <div class="s1-cell-head"><span>uploading…</span><span>queue 2</span></div>
            <div class="s1-art s1-loadart" style="aspect-ratio:1/1">embedding…</div>
            <figcaption class="s1-cell-cap"><span>loading state</span></figcaption>
          </div></figure>
          <figure class="s1-cell" style="box-shadow:0 0 0 2px var(--ruby), var(--shadow)"><div class="s1-cell-core">
            <div class="s1-cell-head" style="color:var(--ruby)"><span>failed.png</span><span>err 500</span></div>
            <div class="s1-art" style="aspect-ratio:1/1;place-items:center"><span class="s1-note" style="color:var(--ruby)">embed failed</span></div>
            <figcaption class="s1-cell-cap"><span>the machine had a moment</span><button class="s1-btn compact">retry</button></figcaption>
          </div><span class="s1-statechip" style="background:var(--ruby);color:var(--on-ruby)">error</span></figure>
          <div class="s1-tray s1-empty"><div class="s1-core core" style="padding:0"><div class="core" style="padding:34px 30px;display:flex;flex-direction:column;gap:14px;align-items:flex-start">
            <span class="s1-sticker">the vault is empty</span>
            <h3 style="font-family:'Fraunces',serif;font-weight:900;font-size:28px;letter-spacing:-.02em">zero memes. zero thoughts.</h3>
            <p style="color:var(--ink-soft);font-size:15px;line-height:1.55">upload chaos and the vault cases each one in velvet, embeds it, and files it under whatever it actually is.</p>
            <button class="s1-btn primary">upload chaos <span class="orb">↑</span></button>
          </div></div></div>
        </div>
        <div class="s1-row">
          <button class="s1-btn primary">find it <span class="orb">→</span></button>
          <button class="s1-btn">secondary</button>
          <button class="s1-btn ruby">bangers <span class="orb">♥</span></button>
          <button class="s1-btn compact">compact</button>
          <button class="s1-btn iconb" aria-label="close">✕</button>
          <span class="s1-sticker">it's a search box. for memes.</span>
          <span class="s1-banger">banger</span>
        </div>
        <div class="s1-row">
          <label class="s1-field" style="max-width:340px;flex:1"><span class="pfx">›</span><input value="text input" aria-label="demo input"></label>
          <div class="s1-tabs" role="tablist"><button class="s1-tab on">all</button><button class="s1-tab">bangers</button><button class="s1-tab">recent</button></div>
          <div class="s1-toast"><span class="core"><span class="tick">✓</span>saved to the pile. filed under cats being unwell.</span></div>
        </div>
        <div class="s1-row">
          <div class="s1-stat jewel"><div class="core"><div class="lbl">folders required</div><div class="val">0</div></div></div>
          <div class="s1-stat"><div class="core"><div class="lbl">memes cased</div><div class="val">1,482</div></div></div>
          <div class="s1-stat"><div class="core"><div class="lbl">bangers</div><div class="val">37</div></div></div>
        </div>
        ${s1Status()}
      </div>
    </div>

    <div class="s1-wrap">${s1Sec('04', 'motion · spring physics, interaction only')}
      <div class="s1-row">
        <button class="s1-btn primary" id="s1-press">press me · orb nudges <span class="orb">→</span></button>
        <button class="s1-btn" id="s1-bloom-go">replay match bloom</button>
        <button class="s1-btn" id="s1-stamp-go">stamp a banger</button>
        <span class="s1-banger" id="s1-stamp" style="display:none;font-size:13px;padding:6px 14px">banger</span>
      </div>
      <div style="max-width:280px;margin-top:22px" id="s1-bloom-cell">${s1Cell(M[2], '', true)}</div>
      <p class="s1-note" style="margin-top:18px">prefers-reduced-motion collapses every spring, bloom, and settle to an instant state change.</p>
    </div>

    <div class="s1-wrap">${s1Sec('05', 'compositions · workbench + phone')}
      <div class="s1-bench"><div class="s1-bench-core">
        <div class="s1-bench-bar">
          <span class="s1-logo" style="font-size:17px">sploot<i>.</i></span>
          <label class="s1-field" style="flex:1;max-width:420px;min-height:44px"><span class="pfx">›</span><input value="search the pile" aria-label="workbench search"></label>
          <button class="s1-btn compact">upload</button>
          <button class="s1-btn compact">shuffle</button>
          <button class="s1-btn ruby compact">bangers</button>
        </div>
        <div class="s1-bench-main">
          <div class="s1-rail-piles">
            ${PILES.slice(0, 5).map((p, i) => `<button class="s1-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}
          </div>
          <div class="s1-grid g4" style="flex:1">${M.slice(0, 8).map(x => s1Cell(x)).join('')}</div>
        </div>
        <div style="padding:0 18px 18px">${s1Status()}</div>
      </div></div>
      <div style="margin:34px 0 44px">
        <div class="s1-phone"><div class="s1-phone-core">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line)">
            <span class="s1-logo" style="font-size:16px">sploot<i>.</i></span><span class="s1-note">1,482 cased</span>
          </div>
          <div style="padding:14px;display:flex;flex-direction:column;gap:14px">
            <label class="s1-field" style="min-height:46px"><span class="pfx">›</span><input value="cat losing it" aria-label="phone search"></label>
            <div class="s1-grid" style="grid-template-columns:1fr 1fr;gap:12px">${M.slice(0, 4).map(x => s1Cell(x)).join('')}</div>
          </div>
          <div class="s1-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
        </div></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'velvet vault'], ['type', 'fraunces 900 / space grotesk / ibm plex mono'], ['move', 'everything cased twice: machined tray + lacquered core, concentric radii'], ['density', 'plush, generous, jewel-accented'], ['motion', 'spring physics · 450ms cubic-bezier(.34,1.56,.64,1) · interaction only']])}
    </div>
  </div>`;

  themeToggle(mount.querySelector('.soft1'));

  const bloomGo = mount.querySelector('#s1-bloom-go');
  const bloomCell = mount.querySelector('#s1-bloom-cell .s1-cell');
  if (bloomGo && bloomCell) bloomGo.addEventListener('click', () => {
    bloomCell.classList.remove('s1-bloom'); void bloomCell.offsetWidth; bloomCell.classList.add('s1-bloom');
  });
  const stampGo = mount.querySelector('#s1-stamp-go');
  const stamp = mount.querySelector('#s1-stamp');
  if (stampGo && stamp) stampGo.addEventListener('click', () => {
    stamp.style.display = 'inline-flex';
    stamp.classList.remove('s1-pop'); void stamp.offsetWidth; stamp.classList.add('s1-pop');
  });
  const press = mount.querySelector('#s1-press');
  if (press) press.addEventListener('click', () => {
    press.classList.remove('s1-settle'); void press.offsetWidth; press.classList.add('s1-settle');
  });
  mount.querySelectorAll('.soft1 .s1-tabs').forEach(group => {
    group.addEventListener('click', (e) => {
      const t = e.target.closest('.s1-tab'); if (!t) return;
      group.querySelectorAll('.s1-tab').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
    });
  });
};

/* ══════════════════════════════════════════════════════════════════════
   SOFT-2 · CANDY MARQUEE
   system rule: the pile is a dealt hand. glossy candy-shell cards stack on
   the z-axis under colossal marquee type. maximalism lives in scale and
   layering: overlap, rotation, lacquer gloss, island pills.
   ══════════════════════════════════════════════════════════════════════ */

function s2Cell(m, state = '', score = false) {
  const chip = { match: 'match', near: 'near', dim: 'cold', selected: 'picked ✓' }[state];
  return `
  <figure class="s2-cell ${state}">
    <div class="s2-cell-head"><span>${esc(m.file)}</span><span>vec ${m.vec}</span></div>
    <div class="s2-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>
    <figcaption class="s2-cap"><span>${esc(m.cap)}</span>${m.banger ? '<span class="s2-banger">banger</span>' : ''}</figcaption>
    ${score ? `<div class="s2-score"><b>${(m.score / 100).toFixed(2)}</b><span>${m.score >= 90 ? 'closest match' : m.score >= 75 ? 'strong match' : 'related'}</span></div>` : ''}
    ${chip ? `<span class="s2-chip x-${state}">${chip}</span>` : ''}
  </figure>`;
}

function s2Console(q = 'cat losing it') {
  return `
  <div class="s2-console">
    <div class="s2-console-top"><b>search console</b>
      <span class="s2-leds"><i style="background:var(--mint)"></i><i style="background:var(--lemon)"></i><i style="background:var(--flamingo)"></i></span>
    </div>
    <div class="s2-console-shelf">
      <label class="s2-field"><span>›</span><input value="${esc(q)}" aria-label="search the pile"></label>
      <button class="s2-btn primary">find it <span class="orb">→</span></button>
    </div>
    <div class="s2-console-meta"><span>index ${LIB.total.toLocaleString()} vec</span><span>${LIB.model}</span><span>${LIB.dim}d</span><span>${LIB.latency}ms</span></div>
  </div>`;
}

function s2Status() {
  const cells = [['index', `${LIB.total.toLocaleString()} vec`], ['model', LIB.model],
    ['queue', `${LIB.queued} embedding`], ['latency', `${LIB.latency}ms`], ['live', '●', 1]];
  return `<div class="s2-status">${cells.map(c =>
    `<span class="cell${c[2] ? ' ok' : ''}"><b>${c[0]}</b>${c[1]}</span>`).join('')}</div>`;
}

function s2Sec(n, t) {
  return `<div class="s2-sec"><span class="num">${n}</span><span class="ttl">${t}</span></div>`;
}

SPECS['SOFT-2'] = (mount) => {
  css('SOFT-2', `
  .soft2 {
    --bg:#fff2e8; --bg2:#ffe9dc; --card:#fffdfa; --ink:#26141c; --ink-soft:#7c626e;
    --line:rgba(38,20,28,.12); --line2:rgba(38,20,28,.3);
    --flamingo:#d61b62; --on-flamingo:#fff2f6;
    --tangerine:#ff7a1f; --on-tangerine:#2b1300;
    --lemon:#ffd21f; --on-lemon:#2b2100;
    --mint:#0fbf82; --on-mint:#04281b;
    --sky:#2456e0; --on-sky:#eef3ff;
    --focus:#2456e0;
    --r:28px; --r-in:18px;
    --shadow:0 26px 55px -22px rgba(38,20,28,.4), 0 3px 8px rgba(38,20,28,.08);
    --shadow-up:0 40px 80px -26px rgba(38,20,28,.48), 0 5px 12px rgba(38,20,28,.1);
    --gloss:linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0) 45%);
    --ease:cubic-bezier(0.32,0.72,0,1); --spring:cubic-bezier(0.34,1.56,0.64,1);
    min-height:100dvh; display:flex; flex-direction:column; overflow-x:clip;
    font-family:'Bricolage Grotesque',sans-serif; font-size:16px; color:var(--ink); background:var(--bg);
  }
  .soft2.theme-dark {
    --bg:#170e13; --bg2:#211219; --card:#2a1a22; --ink:#ffeef4; --ink-soft:#c497a8;
    --line:rgba(255,238,244,.14); --line2:rgba(255,238,244,.34);
    --flamingo:#ff5c97; --on-flamingo:#38001a;
    --tangerine:#ff9147; --on-tangerine:#2b1300;
    --lemon:#ffd84d; --on-lemon:#2b2100;
    --mint:#31d99c; --on-mint:#04281b;
    --sky:#8fa8ff; --on-sky:#0a1030;
    --focus:#8fa8ff;
    --shadow:0 26px 55px -18px rgba(0,0,0,.85), 0 3px 8px rgba(0,0,0,.4);
    --shadow-up:0 40px 80px -22px rgba(0,0,0,.9), 0 5px 12px rgba(0,0,0,.45);
    --gloss:linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,0) 45%);
  }
  .soft2 :is(a,button,input,[tabindex]):focus-visible { outline:3px solid var(--focus); outline-offset:3px; border-radius:10px; }
  .soft2 .s2-wrap { width:100%; max-width:1220px; margin:0 auto; padding:0 clamp(16px,4vw,48px); }
  .soft2 .s2-sec { display:flex; align-items:center; gap:14px; margin:clamp(56px,8vw,96px) 0 28px; }
  .soft2 .s2-sec .num {
    display:inline-grid; place-items:center; min-width:44px; height:44px; border-radius:999px;
    background:var(--ink); color:var(--bg); font:800 15px 'Space Mono',monospace;
  }
  .soft2 .s2-sec .ttl { font:800 clamp(20px,3vw,30px) 'Bricolage Grotesque',sans-serif; letter-spacing:-.02em; }

  /* island mast */
  .soft2 .s2-mast { position:sticky; top:0; z-index:20; display:flex; justify-content:center; padding:16px 16px 4px; }
  .soft2 .s2-mast-pill {
    display:flex; align-items:center; gap:6px; padding:7px 7px 7px 20px; border-radius:999px;
    background:var(--card); border:1px solid var(--line); box-shadow:var(--shadow);
    position:relative; overflow:hidden; max-width:100%;
  }
  .soft2 .s2-mast-pill::before { content:""; position:absolute; inset:0; background:var(--gloss); pointer-events:none; border-radius:inherit; }
  .soft2 .s2-logo { font-family:'Unbounded',sans-serif; font-weight:900; font-size:17px; letter-spacing:-.02em; }
  .soft2 .s2-logo i { font-style:normal; color:var(--flamingo); }
  .soft2 .s2-mast-pill nav { display:flex; gap:2px; flex-wrap:wrap; }
  .soft2 .s2-mast-pill a {
    position:relative; color:var(--ink-soft); text-decoration:none; font-weight:600; font-size:13px;
    padding:10px 13px; border-radius:999px; transition:color .35s var(--ease), background .35s var(--ease);
  }
  .soft2 .s2-mast-pill a:hover { color:var(--ink); background:var(--bg2); }

  /* candy buttons: gloss pill + nested orb */
  .soft2 .s2-btn {
    position:relative; overflow:hidden; display:inline-flex; align-items:center; gap:10px;
    min-height:50px; padding:6px 9px 6px 22px; border:0; border-radius:999px;
    background:var(--card); color:var(--ink); font:700 14.5px 'Bricolage Grotesque',sans-serif;
    box-shadow:var(--shadow), inset 0 0 0 1px var(--line2);
    transition:transform .45s var(--spring), box-shadow .45s var(--ease);
  }
  .soft2 .s2-btn::before { content:""; position:absolute; inset:0; border-radius:inherit; background:var(--gloss); pointer-events:none; }
  .soft2 .s2-btn:hover { transform:translateY(-3px) scale(1.02); box-shadow:var(--shadow-up), inset 0 0 0 1px var(--line2); }
  .soft2 .s2-btn:active { transform:scale(.955); }
  .soft2 .s2-btn .orb {
    position:relative; display:inline-grid; place-items:center; width:36px; height:36px; border-radius:50%;
    background:rgba(0,0,0,.12); transition:transform .45s var(--spring);
  }
  .soft2 .s2-btn:hover .orb { transform:translate(3px,-2px) scale(1.08); }
  .soft2 .s2-btn.primary { background:var(--flamingo); color:var(--on-flamingo); box-shadow:var(--shadow); }
  .soft2 .s2-btn.primary .orb { background:rgba(255,255,255,.22); }
  .soft2 .s2-btn.sky { background:var(--sky); color:var(--on-sky); box-shadow:var(--shadow); }
  .soft2 .s2-btn.sky .orb { background:rgba(255,255,255,.22); }
  .soft2 .s2-btn.compact { min-height:38px; padding:4px 16px; font-size:12.5px; }
  .soft2 .s2-btn.iconb { min-height:46px; width:46px; padding:0; justify-content:center; }

  .soft2 .s2-sticker {
    position:relative; overflow:hidden; display:inline-flex; align-items:center; padding:8px 18px; border-radius:999px;
    background:var(--lemon); color:var(--on-lemon); font:700 13px 'Space Mono',monospace;
    transform:rotate(-2deg); box-shadow:var(--shadow);
  }
  .soft2 .s2-sticker::before { content:""; position:absolute; inset:0; border-radius:inherit; background:var(--gloss); pointer-events:none; }
  .soft2 .s2-banger {
    flex:none; font:700 10px 'Space Mono',monospace; text-transform:uppercase; letter-spacing:.06em;
    background:var(--flamingo); color:var(--on-flamingo); border-radius:999px; padding:4px 10px;
  }

  /* marquee hero */
  .soft2 .s2-hero { padding-top:clamp(36px,6vw,72px); display:flex; flex-direction:column; gap:8px; }
  .soft2 .s2-h1 {
    font-family:'Unbounded',sans-serif; font-weight:900; letter-spacing:-.04em; line-height:1.02;
    font-size:clamp(34px,7.4vw,104px); margin:14px 0 6px;
  }
  .soft2 .s2-h1 .hl { background:var(--lemon); color:var(--on-lemon); border-radius:14px; padding:0 .14em; box-decoration-break:clone; -webkit-box-decoration-break:clone; }
  .soft2 .s2-sub { font-size:17.5px; font-weight:500; color:var(--ink-soft); max-width:52ch; line-height:1.55; }

  /* the dealt hand */
  .soft2 .s2-deck { display:flex; padding:44px 0 22px; justify-content:center; }
  .soft2 .s2-deck .s2-cell { width:230px; flex:none; transition:transform .55s var(--spring), box-shadow .45s var(--ease); }
  .soft2 .s2-deck .s2-cell + .s2-cell { margin-left:-66px; }
  .soft2 .s2-deck .s2-cell:nth-child(1) { transform:rotate(-5deg) translateY(10px); }
  .soft2 .s2-deck .s2-cell:nth-child(2) { transform:rotate(-1.5deg) translateY(-6px); z-index:1; }
  .soft2 .s2-deck .s2-cell:nth-child(3) { transform:rotate(2deg) translateY(4px); z-index:2; }
  .soft2 .s2-deck .s2-cell:nth-child(4) { transform:rotate(5.5deg) translateY(16px); z-index:3; }
  .soft2 .s2-deck .s2-cell:hover { transform:translateY(-16px) rotate(0deg) scale(1.04); z-index:9; box-shadow:var(--shadow-up), inset 0 0 0 1px var(--line); }
  .soft2 .s2-deck.is-fanned .s2-cell:nth-child(1) { transform:rotate(-11deg) translate(-34px,18px); }
  .soft2 .s2-deck.is-fanned .s2-cell:nth-child(2) { transform:rotate(-4deg) translate(-12px,-10px); }
  .soft2 .s2-deck.is-fanned .s2-cell:nth-child(3) { transform:rotate(4deg) translate(12px,-2px); }
  .soft2 .s2-deck.is-fanned .s2-cell:nth-child(4) { transform:rotate(11deg) translate(34px,24px); }

  /* candy card */
  .soft2 .s2-cell {
    position:relative; margin:0; background:var(--card); border-radius:var(--r); padding:9px;
    box-shadow:var(--shadow), inset 0 0 0 1px var(--line);
    transition:transform .45s var(--spring), box-shadow .45s var(--ease), opacity .45s var(--ease);
  }
  .soft2 .s2-cell::before { content:""; position:absolute; inset:0; border-radius:inherit; background:var(--gloss); pointer-events:none; z-index:1; }
  .soft2 .s2-cell:hover { transform:translateY(-5px); box-shadow:var(--shadow-up), inset 0 0 0 1px var(--line); }
  .soft2 .s2-cell-head {
    display:flex; justify-content:space-between; gap:8px; padding:4px 10px 8px;
    font:700 9.5px 'Space Mono',monospace; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-soft);
    white-space:nowrap; overflow:hidden;
  }
  .soft2 .s2-art { display:grid; place-items:center; background:var(--bg2); border-radius:var(--r-in); overflow:hidden; }
  .soft2 .meme-media { background:var(--bg2); }
  .soft2 .s2-cap { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 10px 4px; font-size:12.5px; font-weight:600; line-height:1.35; }
  .soft2 .s2-score {
    display:flex; justify-content:space-between; align-items:center; margin:8px 2px 2px; padding:7px 12px;
    border-radius:999px; background:var(--bg2); font:700 10px 'Space Mono',monospace; text-transform:uppercase; color:var(--ink-soft);
  }
  .soft2 .s2-score b { font-size:13px; color:var(--ink); font-variant-numeric:tabular-nums; }
  .soft2 .s2-chip {
    position:absolute; top:-11px; left:16px; z-index:2; padding:5px 13px; border-radius:999px;
    font:700 10px 'Space Mono',monospace; text-transform:uppercase; letter-spacing:.06em;
    box-shadow:0 8px 18px -8px rgba(0,0,0,.5);
  }
  .soft2 .s2-cell.match { box-shadow:0 0 0 4px var(--mint), var(--shadow-up); }
  .soft2 .s2-chip.x-match { background:var(--mint); color:var(--on-mint); }
  .soft2 .s2-cell.near { box-shadow:0 0 0 3px var(--tangerine), var(--shadow); }
  .soft2 .s2-chip.x-near { background:var(--tangerine); color:var(--on-tangerine); }
  .soft2 .s2-cell.dim { opacity:.45; filter:saturate(.35); }
  .soft2 .s2-chip.x-dim { background:var(--card); color:var(--ink-soft); box-shadow:inset 0 0 0 1px var(--line2); }
  .soft2 .s2-cell.selected { box-shadow:0 0 0 4px var(--sky), var(--shadow-up); }
  .soft2 .s2-chip.x-selected { background:var(--sky); color:var(--on-sky); }
  .soft2 .s2-loadart {
    display:grid; place-items:center; border-radius:var(--r-in); color:var(--ink-soft);
    font:700 10px 'Space Mono',monospace; text-transform:uppercase; letter-spacing:.12em;
    background:repeating-linear-gradient(-45deg, var(--bg2), var(--bg2) 12px, var(--card) 12px, var(--card) 24px);
  }

  /* console */
  .soft2 .s2-console {
    position:relative; overflow:hidden; background:var(--card); border-radius:var(--r);
    box-shadow:var(--shadow), inset 0 0 0 1px var(--line); padding:8px;
  }
  .soft2 .s2-console::before { content:""; position:absolute; inset:0; border-radius:inherit; background:var(--gloss); pointer-events:none; }
  .soft2 .s2-console-top {
    display:flex; align-items:center; justify-content:space-between; padding:8px 14px 10px;
    font:700 11px 'Space Mono',monospace; text-transform:uppercase; letter-spacing:.14em; color:var(--ink-soft);
  }
  .soft2 .s2-leds { display:flex; gap:6px; }
  .soft2 .s2-leds i { width:10px; height:10px; border-radius:50%; box-shadow:inset 0 1px 1px rgba(255,255,255,.6); }
  .soft2 .s2-console-shelf { display:flex; gap:10px; align-items:center; position:relative; }
  .soft2 .s2-field {
    flex:1; display:flex; align-items:center; gap:10px; min-height:52px; padding:0 20px; border-radius:999px;
    background:var(--bg2); box-shadow:inset 0 2px 6px rgba(0,0,0,.1), inset 0 0 0 1px var(--line);
  }
  .soft2 .s2-field span { color:var(--ink-soft); font-weight:700; }
  .soft2 .s2-field input { flex:1; min-width:0; border:0; background:none; color:var(--ink); font:600 15px 'Space Mono',monospace; }
  .soft2 .s2-field input:focus { outline:none; }
  .soft2 .s2-field:focus-within { box-shadow:inset 0 2px 6px rgba(0,0,0,.1), 0 0 0 3px color-mix(in srgb, var(--focus) 30%, transparent); }
  .soft2 .s2-console-meta {
    display:flex; gap:16px; flex-wrap:wrap; padding:12px 14px 6px; position:relative;
    font:700 10px 'Space Mono',monospace; text-transform:uppercase; letter-spacing:.1em; color:var(--ink-soft);
  }

  /* stat */
  .soft2 .s2-stat {
    position:relative; overflow:hidden; min-width:172px; border-radius:var(--r); padding:18px 20px;
    background:var(--card); box-shadow:var(--shadow), inset 0 0 0 1px var(--line);
  }
  .soft2 .s2-stat::before { content:""; position:absolute; inset:0; border-radius:inherit; background:var(--gloss); pointer-events:none; }
  .soft2 .s2-stat .lbl { font:700 10px 'Space Mono',monospace; text-transform:uppercase; letter-spacing:.14em; color:var(--ink-soft); }
  .soft2 .s2-stat .val { font-family:'Unbounded',sans-serif; font-weight:900; font-size:34px; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
  .soft2 .s2-stat.candy { background:var(--flamingo); color:var(--on-flamingo); }
  .soft2 .s2-stat.candy .lbl { color:var(--on-flamingo); opacity:.8; }

  /* status capsule */
  .soft2 .s2-status {
    display:flex; flex-wrap:wrap; width:max-content; max-width:100%; border-radius:999px; overflow:hidden;
    background:var(--ink); color:var(--bg); box-shadow:var(--shadow);
  }
  .soft2 .s2-status .cell { display:flex; gap:8px; align-items:center; padding:12px 18px; font:600 11px 'Space Mono',monospace; }
  .soft2 .s2-status .cell + .cell { border-left:1px solid color-mix(in srgb, var(--bg) 22%, transparent); }
  .soft2 .s2-status .cell b { text-transform:uppercase; font-size:9.5px; letter-spacing:.12em; opacity:.6; font-weight:700; }
  .soft2 .s2-status .ok { color:var(--mint); }

  /* tabs */
  .soft2 .s2-tabs { display:inline-flex; gap:4px; padding:6px; border-radius:999px; background:var(--bg2); box-shadow:inset 0 2px 5px rgba(0,0,0,.08), inset 0 0 0 1px var(--line); }
  .soft2 .s2-tab {
    border:0; background:none; color:var(--ink-soft); font:700 13px 'Bricolage Grotesque',sans-serif;
    min-height:40px; padding:0 20px; border-radius:999px; transition:all .35s var(--ease);
  }
  .soft2 .s2-tab.on { background:var(--ink); color:var(--bg); box-shadow:0 6px 14px -8px rgba(0,0,0,.5); }

  /* toast */
  .soft2 .s2-toast {
    position:relative; overflow:hidden; display:inline-flex; align-items:center; gap:12px;
    padding:12px 22px; border-radius:999px; background:var(--mint); color:var(--on-mint);
    font-weight:700; font-size:14px; box-shadow:var(--shadow);
  }
  .soft2 .s2-toast::before { content:""; position:absolute; inset:0; border-radius:inherit; background:var(--gloss); pointer-events:none; }

  /* empty */
  .soft2 .s2-empty {
    position:relative; overflow:hidden; max-width:460px; border-radius:var(--r); padding:36px 32px;
    background:var(--card); box-shadow:var(--shadow), inset 0 0 0 1px var(--line);
    display:flex; flex-direction:column; gap:16px; align-items:flex-start;
  }
  .soft2 .s2-empty::before { content:""; position:absolute; inset:0; border-radius:inherit; background:var(--gloss); pointer-events:none; }
  .soft2 .s2-empty h3 { font-family:'Unbounded',sans-serif; font-weight:900; font-size:24px; letter-spacing:-.03em; }
  .soft2 .s2-empty p { color:var(--ink-soft); font-size:15px; line-height:1.55; font-weight:500; }
  .soft2 .s2-empty > * { position:relative; }

  /* swatches */
  .soft2 .s2-swatches { display:flex; flex-wrap:wrap; gap:14px; }
  .soft2 .s2-swatch {
    flex:1; min-width:130px; border-radius:22px; padding:14px 14px 12px; box-shadow:var(--shadow);
    font:700 10.5px 'Space Mono',monospace; text-transform:uppercase; letter-spacing:.06em;
    position:relative; overflow:hidden;
  }
  .soft2 .s2-swatch::before { content:""; position:absolute; inset:0; background:var(--gloss); pointer-events:none; }
  .soft2 .s2-swatch b { display:block; font-size:12px; }
  .soft2 .s2-shape { width:150px; height:96px; display:grid; place-items:center; text-align:center; font:700 9.5px 'Space Mono',monospace; text-transform:uppercase; color:var(--ink-soft); }

  /* workbench */
  .soft2 .s2-bench { background:var(--card); border-radius:var(--r); box-shadow:var(--shadow), inset 0 0 0 1px var(--line); overflow:hidden; }
  .soft2 .s2-bench-bar { display:flex; align-items:center; gap:12px; padding:14px 18px; border-bottom:1px solid var(--line); flex-wrap:wrap; background:var(--bg2); }
  .soft2 .s2-bench-main { display:flex; gap:18px; padding:18px; }
  .soft2 .s2-piles { display:flex; flex-direction:column; gap:8px; min-width:210px; }
  .soft2 .s2-pile {
    display:flex; justify-content:space-between; align-items:center; gap:10px; min-height:46px; padding:0 18px;
    border:0; border-radius:999px; background:var(--bg2); color:var(--ink); font:600 13px 'Bricolage Grotesque',sans-serif;
    box-shadow:inset 0 0 0 1px var(--line); cursor:pointer; transition:transform .35s var(--spring);
  }
  .soft2 .s2-pile:hover { transform:translateX(4px); }
  .soft2 .s2-pile b { font:700 11px 'Space Mono',monospace; color:var(--ink-soft); }
  .soft2 .s2-pile.on { background:var(--flamingo); color:var(--on-flamingo); }
  .soft2 .s2-pile.on b { color:var(--on-flamingo); opacity:.85; }

  /* phone */
  .soft2 .s2-phone {
    width:390px; max-width:100%; border-radius:44px; background:var(--card);
    box-shadow:var(--shadow-up), inset 0 0 0 1px var(--line); padding:10px; overflow:hidden;
  }
  .soft2 .s2-phone-core { border-radius:36px; overflow:hidden; background:var(--bg); box-shadow:inset 0 0 0 1px var(--line); }
  .soft2 .s2-dock { display:flex; gap:4px; padding:8px; background:var(--card); }
  .soft2 .s2-dock button {
    flex:1; min-height:48px; border:0; border-radius:999px; background:none; color:var(--ink-soft);
    font:700 10.5px 'Space Mono',monospace; text-transform:uppercase; letter-spacing:.04em;
  }
  .soft2 .s2-dock button.on { background:var(--ink); color:var(--bg); }

  .soft2 .s2-grid { display:grid; gap:22px; }
  .soft2 .g4 { grid-template-columns:repeat(4,1fr); }
  .soft2 .s2-row { display:flex; gap:16px; flex-wrap:wrap; align-items:center; }
  .soft2 .s2-note { font:700 10.5px 'Space Mono',monospace; text-transform:uppercase; letter-spacing:.1em; color:var(--ink-soft); }

  @keyframes s2Jelly {
    0% { transform:scale(1,1); } 28% { transform:scale(.9,1.08); } 52% { transform:scale(1.08,.92); }
    74% { transform:scale(.97,1.03); } 100% { transform:scale(1,1); }
  }
  .soft2 .s2-jelly { animation:s2Jelly .62s var(--spring) both; }
  @keyframes s2Pop {
    0% { opacity:0; transform:scale(.3) rotate(-18deg); }
    62% { opacity:1; transform:scale(1.18) rotate(5deg); }
    100% { opacity:1; transform:scale(1) rotate(-2deg); }
  }
  .soft2 .s2-popin { animation:s2Pop .5s var(--spring) both; }

  @media (prefers-reduced-motion: reduce) {
    .soft2 *, .soft2 *::before, .soft2 *::after { animation:none !important; transition:none !important; }
  }
  @media (max-width: 980px) {
    .soft2 .s2-bench-main { flex-direction:column; }
    .soft2 .s2-piles { flex-direction:row; flex-wrap:wrap; min-width:0; }
  }
  @media (max-width: 700px) {
    .soft2 .g4 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .soft2 .s2-grid { gap:12px; }
    .soft2 .s2-deck { flex-wrap:wrap; gap:14px; }
    .soft2 .s2-deck .s2-cell, .soft2 .s2-deck.is-fanned .s2-cell { transform:none !important; margin-left:0; width:calc(50% - 7px); }
    .soft2 .s2-console-shelf { flex-direction:column; align-items:stretch; }
    .soft2 .s2-mast-pill nav a { padding:10px 8px; font-size:12px; }
    .soft2 .s2-status { border-radius:26px; width:100%; }
  }
  `);

  const M = MEMES;
  mount.innerHTML = `
  <div class="soft2">
    <div class="s2-mast"><div class="s2-mast-pill">
      <span class="s2-logo">sploot<i>!</i></span>
      <nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">upload</a><a href="#0">settings</a></nav>
      <button class="s2-btn primary" style="min-height:42px">sign in <span class="orb">→</span></button>
    </div></div>

    <div class="s2-wrap s2-hero">
      <span class="s2-sticker">it's a search box. for memes.</span>
      <h1 class="s2-h1">type words.<br>get the <span class="hl">picture.</span></h1>
      <p class="s2-sub">no folders. just vibes. the pile deals itself like a hand of glossy cards and the right one is always on top.</p>
      <div class="s2-row" style="margin-top:12px">
        <button class="s2-btn primary">open the pile <span class="orb">→</span></button>
        <button class="s2-btn">shuffle the pile <span class="orb">⤨</span></button>
      </div>
      <div class="s2-deck" id="s2-hero-deck">${M.slice(0, 4).map((x, i) => s2Cell(x, i === 1 ? 'match' : '')).join('')}</div>
      ${s2Console()}
    </div>

    <div class="s2-wrap">${s2Sec('01', 'foundations. candy shells, gloss, radii.')}
      <div class="s2-swatches">
        <div class="s2-swatch" style="background:#26141c;color:#fff2e8"><b>ink</b>#26141c</div>
        <div class="s2-swatch" style="background:#fff2e8;color:#26141c;box-shadow:var(--shadow),inset 0 0 0 1px var(--line)"><b>peach</b>#fff2e8</div>
        <div class="s2-swatch" style="background:#d61b62;color:#fff2f6"><b>flamingo</b>#d61b62</div>
        <div class="s2-swatch" style="background:#ff7a1f;color:#2b1300"><b>tangerine</b>#ff7a1f</div>
        <div class="s2-swatch" style="background:#ffd21f;color:#2b2100"><b>lemon</b>#ffd21f</div>
        <div class="s2-swatch" style="background:#0fbf82;color:#04281b"><b>mint</b>#0fbf82</div>
        <div class="s2-swatch" style="background:#2456e0;color:#eef3ff"><b>sky</b>#2456e0</div>
      </div>
      <div class="s2-row" style="margin-top:22px">
        <div class="s2-shape" style="border-radius:28px;background:var(--card);box-shadow:var(--shadow),inset 0 0 0 1px var(--line)">shell · r28</div>
        <div class="s2-shape" style="border-radius:18px;background:var(--bg2);box-shadow:inset 0 2px 6px rgba(0,0,0,.1)">well · inset</div>
        <div class="s2-shape" style="border-radius:999px;background:var(--card);box-shadow:var(--shadow),inset 0 0 0 1px var(--line)">pill · controls</div>
        <div class="s2-shape" style="border-radius:28px;background:var(--card);box-shadow:var(--shadow-up),inset 0 0 0 1px var(--line)">lift · hover tier</div>
        <div class="s2-shape" style="border-radius:28px;background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,0) 45%),var(--flamingo);color:var(--on-flamingo)">candy gloss · named move</div>
      </div>
      <p class="s2-note" style="margin-top:16px">the one sanctioned gradient: a top gloss band on every shell. spacing rides an 8px scale, sections breathe at clamp(56, 8vw, 96).</p>
    </div>

    <div class="s2-wrap">${s2Sec('02', 'typography. marquee scale.')}
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="font-family:'Unbounded',sans-serif;font-weight:900;font-size:clamp(34px,5.5vw,64px);letter-spacing:-.04em;line-height:1">display · unbounded 900</div>
        <div style="font-size:17.5px;font-weight:500;max-width:56ch;line-height:1.55">body · bricolage grotesque. the pile deals, stacks, and fans itself while you type. shuffle it whenever.</div>
        <div style="font:700 12px 'Space Mono',monospace;text-transform:uppercase;letter-spacing:.14em">label · space mono caps</div>
        <div style="font:600 11px 'Space Mono',monospace;color:var(--ink-soft)">metadata · vec 0088 · ${LIB.latency}ms · ${LIB.model}</div>
        <div style="font:700 28px 'Space Mono',monospace;font-variant-numeric:tabular-nums">1,482 · 0.94 · 212ms</div>
        <div style="font-size:14px;font-weight:500;max-width:46ch;line-height:1.6;border-left:3px solid var(--flamingo);padding-left:14px;color:var(--ink-soft)">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me deserves a spot in the dealt hand, face up, forever.</div>
      </div>
    </div>

    <div class="s2-wrap">${s2Sec('03', 'components. the candy kit.')}
      <div style="display:flex;flex-direction:column;gap:32px">
        ${s2Console('sad frog')}
        <div class="s2-grid g4" style="padding-top:12px">
          ${s2Cell(M[0], 'match', true)}${s2Cell(M[1], 'near')}${s2Cell(M[3], 'dim')}${s2Cell(M[5])}
        </div>
        <div class="s2-grid g4" style="padding-top:12px">
          ${s2Cell(M[4], 'selected')}
          <figure class="s2-cell">
            <div class="s2-cell-head"><span>uploading…</span><span>queue 2</span></div>
            <div class="s2-art s2-loadart" style="aspect-ratio:1/1">embedding…</div>
            <figcaption class="s2-cap"><span>loading state</span></figcaption>
          </figure>
          <figure class="s2-cell" style="box-shadow:0 0 0 3px var(--tangerine), var(--shadow)">
            <div class="s2-cell-head" style="color:var(--tangerine)"><span>failed.png</span><span>err 500</span></div>
            <div class="s2-art" style="aspect-ratio:1/1;place-items:center"><span class="s2-note" style="color:var(--tangerine)">embed failed</span></div>
            <figcaption class="s2-cap"><span>the machine fumbled it</span><button class="s2-btn compact">retry</button></figcaption>
            <span class="s2-chip" style="background:var(--tangerine);color:var(--on-tangerine)">error</span>
          </figure>
          <div class="s2-empty">
            <span class="s2-sticker" style="transform:rotate(-1.5deg)">the pile is empty</span>
            <h3>zero cards dealt.</h3>
            <p>zero thoughts, head empty. upload chaos and the pile starts dealing itself into piles you never asked for but absolutely needed.</p>
            <button class="s2-btn primary">upload chaos <span class="orb">↑</span></button>
          </div>
        </div>
        <div class="s2-row">
          <button class="s2-btn primary">find it <span class="orb">→</span></button>
          <button class="s2-btn">secondary</button>
          <button class="s2-btn sky">bangers <span class="orb">♥</span></button>
          <button class="s2-btn compact">compact</button>
          <button class="s2-btn iconb" aria-label="close">✕</button>
          <span class="s2-sticker">sticker</span>
          <span class="s2-banger">banger</span>
        </div>
        <div class="s2-row">
          <label class="s2-field" style="max-width:340px;flex:1"><span>›</span><input value="text input" aria-label="demo input"></label>
          <div class="s2-tabs" role="tablist"><button class="s2-tab on">all</button><button class="s2-tab">bangers</button><button class="s2-tab">recent</button></div>
          <div class="s2-toast">✓ saved to the pile</div>
        </div>
        <div class="s2-row">
          <div class="s2-stat candy"><div class="lbl">folders required</div><div class="val">0</div></div>
          <div class="s2-stat"><div class="lbl">cards in the pile</div><div class="val">1,482</div></div>
          <div class="s2-stat"><div class="lbl">bangers</div><div class="val">37</div></div>
        </div>
        ${s2Status()}
      </div>
    </div>

    <div class="s2-wrap">${s2Sec('04', 'motion. jelly springs, on input only.')}
      <div class="s2-row">
        <button class="s2-btn primary" id="s2-jelly-go">jelly press <span class="orb">→</span></button>
        <button class="s2-btn" id="s2-fan-go">fan the deck</button>
        <button class="s2-btn" id="s2-pop-go">pop a banger</button>
        <span class="s2-banger" id="s2-pop" style="display:none;font-size:13px;padding:6px 14px">banger</span>
      </div>
      <div class="s2-deck" id="s2-demo-deck" style="justify-content:flex-start;padding:36px 0 10px">${M.slice(4, 8).map(x => s2Cell(x)).join('')}</div>
      <p class="s2-note" style="margin-top:14px">prefers-reduced-motion drops every jelly, fan, and pop to an instant state swap.</p>
    </div>

    <div class="s2-wrap">${s2Sec('05', 'compositions. workbench + phone.')}
      <div class="s2-bench">
        <div class="s2-bench-bar">
          <span class="s2-logo" style="font-size:15px">sploot<i>!</i></span>
          <label class="s2-field" style="flex:1;max-width:420px;min-height:44px"><span>›</span><input value="search the pile" aria-label="workbench search"></label>
          <button class="s2-btn compact">upload</button>
          <button class="s2-btn compact">shuffle</button>
          <button class="s2-btn sky compact">bangers</button>
        </div>
        <div class="s2-bench-main">
          <div class="s2-piles">
            ${PILES.slice(0, 5).map((p, i) => `<button class="s2-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}
          </div>
          <div class="s2-grid g4" style="flex:1">${M.slice(0, 8).map(x => s2Cell(x)).join('')}</div>
        </div>
        <div style="padding:0 18px 18px">${s2Status()}</div>
      </div>
      <div style="margin:34px 0 44px">
        <div class="s2-phone"><div class="s2-phone-core">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 18px">
            <span class="s2-logo" style="font-size:15px">sploot<i>!</i></span><span class="s2-note">1,482 dealt</span>
          </div>
          <div style="padding:0 14px 14px;display:flex;flex-direction:column;gap:14px">
            <label class="s2-field" style="min-height:48px"><span>›</span><input value="cat losing it" aria-label="phone search"></label>
            <div class="s2-grid" style="grid-template-columns:1fr 1fr;gap:12px">${M.slice(0, 4).map(x => s2Cell(x)).join('')}</div>
          </div>
          <div class="s2-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
        </div></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'candy marquee'], ['type', 'unbounded 900 / bricolage grotesque / space mono'], ['move', 'the pile is a dealt hand: z-stacked gloss cards under marquee type'], ['density', 'colossal scale, deliberate overlap'], ['motion', 'jelly springs + fan spreads · cubic-bezier(.34,1.56,.64,1) · input only']])}
    </div>
  </div>`;

  themeToggle(mount.querySelector('.soft2'));

  const jelly = mount.querySelector('#s2-jelly-go');
  if (jelly) jelly.addEventListener('click', () => {
    jelly.classList.remove('s2-jelly'); void jelly.offsetWidth; jelly.classList.add('s2-jelly');
  });
  const fanGo = mount.querySelector('#s2-fan-go');
  const decks = [mount.querySelector('#s2-demo-deck'), mount.querySelector('#s2-hero-deck')];
  if (fanGo) fanGo.addEventListener('click', () => {
    decks.forEach(d => { if (d) d.classList.toggle('is-fanned'); });
  });
  const popGo = mount.querySelector('#s2-pop-go');
  const pop = mount.querySelector('#s2-pop');
  if (popGo && pop) popGo.addEventListener('click', () => {
    pop.style.display = 'inline-flex';
    pop.classList.remove('s2-popin'); void pop.offsetWidth; pop.classList.add('s2-popin');
  });
  mount.querySelectorAll('.soft2 .s2-tabs').forEach(group => {
    group.addEventListener('click', (e) => {
      const t = e.target.closest('.s2-tab'); if (!t) return;
      group.querySelectorAll('.s2-tab').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
    });
  });
};

/* ══════════════════════════════════════════════════════════════════════
   SOFT-3 · GRAND SALON
   system rule: deco double-rule frames and brass plaques on every artifact.
   the archive is a hotel salon: memes hang like lobby art, metadata is
   engraved brass. maximalism lives in systematic ornament density.
   ══════════════════════════════════════════════════════════════════════ */

function s3Cell(m, state = '', score = false) {
  const ribbon = { match: `closest match · ${(m.score / 100).toFixed(2)}`, near: 'near match', dim: 'deep archive', selected: 'selected ✓' }[state];
  return `
  <figure class="s3-cell ${state}">
    <div class="s3-mat">
      <div class="s3-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>
    </div>
    <figcaption class="s3-plaque"><span class="sheenband"></span>
      <b>${esc(m.cap)}</b>
      <span class="meta">${esc(m.file)} · vec ${m.vec}${score ? ` · ${(m.score / 100).toFixed(2)}` : ''}</span>
      ${m.banger ? '<span class="s3-banger">✦ banger</span>' : ''}
    </figcaption>
    ${ribbon ? `<span class="s3-ribbon r-${state}">${ribbon}</span>` : ''}
  </figure>`;
}

function s3Console(q = 'cat losing it') {
  return `
  <div class="s3-console">
    <div class="s3-console-rail"><span class="orn">✦</span><b>the concierge desk · semantic search</b><span class="orn">✦</span></div>
    <div class="s3-console-shelf">
      <label class="s3-field"><span class="pfx">›</span><input value="${esc(q)}" aria-label="search the pile"></label>
      <button class="s3-btn primary">find it <span class="orb">→</span></button>
    </div>
    <div class="s3-console-meta">index ${LIB.total.toLocaleString()} vec · ${LIB.model} · ${LIB.dim}d · ${LIB.latency}ms · /api/search</div>
  </div>`;
}

function s3Status() {
  const cells = [['index', `${LIB.total.toLocaleString()} vec`], ['model', LIB.model],
    ['queue', `${LIB.queued} embedding`], ['latency', `${LIB.latency}ms`], ['status', 'live', 1]];
  return `<div class="s3-status">${cells.map(c =>
    `<span class="cell${c[2] ? ' ok' : ''}"><b>${c[0]}</b>${c[1]}</span>`).join('')}</div>`;
}

function s3Sec(n, t) {
  return `<div class="s3-sec"><i></i><span class="plq">no. ${n} · ${t}</span><i></i></div>`;
}

SPECS['SOFT-3'] = (mount) => {
  css('SOFT-3', `
  .soft3 {
    --bg:#f6efdf; --bg2:#efe5cd; --surface:#fdf8ec; --noir:#1d160c;
    --ink:#1d160c; --ink-soft:#6f6350; --gold:#a8811e; --bronze:#7a5c10;
    --wine:#7c1d2e; --on-wine:#fbeee0;
    --on-noir:#f6efdf;
    --focus:#7c1d2e;
    --line:rgba(29,22,12,.16);
    --frame:1px solid #a8811e;
    --shadow:0 24px 50px -24px rgba(29,22,12,.45), 0 2px 6px rgba(29,22,12,.08);
    --shadow-up:0 36px 70px -26px rgba(29,22,12,.5), 0 4px 10px rgba(29,22,12,.1);
    --ease:cubic-bezier(0.32,0.72,0,1); --spring:cubic-bezier(0.34,1.56,0.64,1);
    min-height:100dvh; display:flex; flex-direction:column; overflow-x:clip;
    font-family:'Space Grotesk',sans-serif; font-size:16px; color:var(--ink); background:var(--bg);
  }
  .soft3.theme-dark {
    --bg:#141008; --bg2:#0e0b05; --surface:#1f1810; --noir:#e9dfc6;
    --ink:#f1e7d0; --ink-soft:#b3a37f; --gold:#d9ad4e; --bronze:#d9ad4e;
    --wine:#e0637a; --on-wine:#33000c;
    --on-noir:#141008;
    --focus:#d9ad4e;
    --line:rgba(241,231,208,.16);
    --frame:1px solid #d9ad4e;
    --shadow:0 24px 50px -20px rgba(0,0,0,.85), 0 2px 6px rgba(0,0,0,.4);
    --shadow-up:0 36px 70px -22px rgba(0,0,0,.9), 0 4px 10px rgba(0,0,0,.45);
  }
  .soft3 :is(a,button,input,[tabindex]):focus-visible { outline:3px double var(--focus); outline-offset:3px; }
  .soft3 .s3-wrap { width:100%; max-width:1180px; margin:0 auto; padding:0 clamp(16px,4vw,48px); }

  /* deco section plaque: flanking double rules */
  .soft3 .s3-sec { display:flex; align-items:center; gap:18px; margin:clamp(56px,8vw,96px) 0 30px; }
  .soft3 .s3-sec i { flex:1; border-top:1px solid var(--gold); border-bottom:1px solid var(--gold); height:4px; }
  .soft3 .s3-sec .plq {
    border:var(--frame); outline:1px solid var(--gold); outline-offset:3px; padding:8px 22px;
    font:600 11px 'Space Mono',monospace; letter-spacing:.24em; text-transform:uppercase; color:var(--bronze);
    background:var(--surface);
  }

  /* the double rule frame: border + offset outline */
  .soft3 .s3-frame { border:var(--frame); outline:1px solid var(--gold); outline-offset:4px; background:var(--surface); box-shadow:var(--shadow); }

  /* masthead */
  .soft3 .s3-mast { border-bottom:1px solid var(--gold); box-shadow:0 1px 0 var(--bg), 0 3px 0 var(--gold); background:var(--surface); position:relative; z-index:5; }
  .soft3 .s3-mast-in { max-width:1180px; margin:0 auto; padding:16px clamp(16px,4vw,48px); display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
  .soft3 .s3-logo { font-family:'DM Serif Display',serif; font-size:26px; letter-spacing:.01em; }
  .soft3 .s3-logo .orn { color:var(--gold); font-size:16px; vertical-align:middle; }
  .soft3 .s3-nav { margin-left:auto; display:flex; gap:22px; flex-wrap:wrap; }
  .soft3 .s3-nav a {
    color:var(--ink-soft); text-decoration:none; font:600 11px 'Space Mono',monospace;
    letter-spacing:.2em; text-transform:uppercase; padding:12px 2px; border-bottom:1px solid transparent;
    transition:color .35s var(--ease), border-color .35s var(--ease);
  }
  .soft3 .s3-nav a:hover { color:var(--bronze); border-bottom:1px solid var(--gold); }

  /* hero */
  .soft3 .s3-hero { text-align:center; padding-top:clamp(44px,7vw,90px); display:flex; flex-direction:column; align-items:center; gap:18px; }
  .soft3 .s3-ornrow { color:var(--gold); font-size:15px; letter-spacing:1.2em; padding-left:1.2em; }
  .soft3 .s3-kicker { font:600 11px 'Space Mono',monospace; letter-spacing:.32em; text-transform:uppercase; color:var(--bronze); }
  .soft3 .s3-h1 { font-family:'DM Serif Display',serif; font-size:clamp(48px,8vw,120px); line-height:.98; letter-spacing:-.01em; }
  .soft3 .s3-h1 .it { font-family:'Instrument Serif',serif; font-style:italic; color:var(--wine); }
  .soft3.theme-dark .s3-h1 .it { color:var(--wine); }
  .soft3 .s3-sub { font-size:17px; line-height:1.6; color:var(--ink-soft); max-width:52ch; }

  /* buttons: double gold ring pills */
  .soft3 .s3-btn {
    display:inline-flex; align-items:center; gap:10px; min-height:48px; padding:6px 10px 6px 24px;
    border:var(--frame); outline:1px solid var(--gold); outline-offset:3px; border-radius:999px;
    background:var(--surface); color:var(--ink); font:600 13px 'Space Mono',monospace; letter-spacing:.1em; text-transform:uppercase;
    box-shadow:var(--shadow); transition:transform .4s var(--spring), box-shadow .4s var(--ease);
  }
  .soft3 .s3-btn:hover { transform:translateY(-2px); box-shadow:var(--shadow-up); }
  .soft3 .s3-btn:active { transform:translateY(1px) scale(.98); }
  .soft3 .s3-btn .orb {
    display:inline-grid; place-items:center; width:32px; height:32px; border-radius:50%;
    border:1px solid var(--gold); font-size:14px; transition:transform .4s var(--spring);
  }
  .soft3 .s3-btn:hover .orb { transform:translateX(3px); }
  .soft3 .s3-btn.primary { background:var(--noir); color:var(--on-noir); }
  .soft3 .s3-btn.primary .orb { border-color:color-mix(in srgb, var(--on-noir) 45%, transparent); }
  .soft3 .s3-btn.wine { background:var(--wine); color:var(--on-wine); border-color:var(--wine); }
  .soft3 .s3-btn.wine .orb { border-color:color-mix(in srgb, var(--on-wine) 45%, transparent); }
  .soft3 .s3-btn.compact { min-height:36px; padding:2px 16px; font-size:11px; outline-offset:2px; box-shadow:none; }
  .soft3 .s3-btn.iconb { min-height:44px; width:44px; padding:0; justify-content:center; }

  .soft3 .s3-sticker {
    display:inline-flex; align-items:center; gap:8px; padding:8px 18px;
    border:var(--frame); outline:1px solid var(--gold); outline-offset:3px;
    background:var(--surface); color:var(--bronze); font:600 11px 'Space Mono',monospace; letter-spacing:.18em; text-transform:uppercase;
  }
  .soft3 .s3-banger { flex:none; font:600 10px 'Space Mono',monospace; letter-spacing:.14em; text-transform:uppercase; color:var(--bronze); }

  /* framed meme cell: lobby art + brass plaque */
  .soft3 .s3-cell { position:relative; margin:0; display:flex; flex-direction:column; transition:transform .45s var(--spring); }
  .soft3 .s3-cell:hover { transform:translateY(-4px); }
  .soft3 .s3-mat { border:var(--frame); outline:1px solid var(--gold); outline-offset:4px; background:var(--surface); box-shadow:var(--shadow); padding:12px; }
  .soft3 .s3-art { display:grid; place-items:center; border:1px solid var(--line); background:var(--bg2); }
  .soft3 .meme-media { background:var(--bg2); }
  .soft3 .s3-plaque {
    position:relative; overflow:hidden; margin:14px auto 0; width:calc(100% - 28px);
    border:var(--frame); background:var(--surface); box-shadow:var(--shadow);
    padding:9px 14px; text-align:center; display:flex; flex-direction:column; gap:3px;
  }
  .soft3 .s3-plaque b { font-family:'Instrument Serif',serif; font-style:italic; font-weight:400; font-size:15px; line-height:1.3; }
  .soft3 .s3-plaque .meta { font:500 9.5px 'Space Mono',monospace; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-soft); }
  .soft3 .s3-plaque .sheenband {
    position:absolute; inset:0; pointer-events:none; transform:translateX(-130%);
    background:linear-gradient(105deg, transparent 40%, rgba(255,255,255,.5) 50%, transparent 60%);
  }
  .soft3.theme-dark .s3-plaque .sheenband { background:linear-gradient(105deg, transparent 40%, rgba(255,236,180,.22) 50%, transparent 60%); }
  @keyframes s3Polish { to { transform:translateX(130%); } }
  .soft3 .s3-cell:hover .sheenband, .soft3 .sheen .sheenband { animation:s3Polish .9s var(--ease) both; }
  .soft3 .s3-ribbon {
    position:absolute; top:-12px; left:50%; transform:translateX(-50%); white-space:nowrap;
    font:600 9.5px 'Space Mono',monospace; letter-spacing:.16em; text-transform:uppercase;
    padding:5px 14px; box-shadow:var(--shadow); z-index:2;
  }
  .soft3 .s3-cell.match .s3-mat { outline-width:3px; }
  .soft3 .s3-ribbon.r-match { background:var(--noir); color:var(--on-noir); border:1px solid var(--gold); }
  .soft3 .s3-ribbon.r-near { background:var(--surface); color:var(--bronze); border:var(--frame); }
  .soft3 .s3-cell.dim { opacity:.45; filter:sepia(.35); }
  .soft3 .s3-ribbon.r-dim { background:var(--bg2); color:var(--ink-soft); border:1px solid var(--line); }
  .soft3 .s3-cell.selected .s3-mat { outline:3px double var(--wine); border-color:var(--wine); }
  .soft3 .s3-ribbon.r-selected { background:var(--wine); color:var(--on-wine); border:1px solid var(--wine); }
  .soft3 .s3-loadart {
    display:grid; place-items:center; color:var(--ink-soft);
    font:600 10px 'Space Mono',monospace; letter-spacing:.2em; text-transform:uppercase;
    background:repeating-linear-gradient(-45deg, var(--bg2), var(--bg2) 10px, var(--surface) 10px, var(--surface) 20px);
  }

  /* console */
  .soft3 .s3-console { border:var(--frame); outline:1px solid var(--gold); outline-offset:5px; background:var(--surface); box-shadow:var(--shadow); }
  .soft3 .s3-console-rail {
    display:flex; align-items:center; justify-content:center; gap:16px; padding:11px 16px; border-bottom:var(--frame);
    font:600 10.5px 'Space Mono',monospace; letter-spacing:.26em; text-transform:uppercase; color:var(--bronze);
  }
  .soft3 .s3-console-rail .orn { color:var(--gold); letter-spacing:0; }
  .soft3 .s3-console-shelf { display:flex; gap:14px; align-items:center; padding:18px; }
  .soft3 .s3-field {
    flex:1; display:flex; align-items:center; gap:10px; min-height:48px; padding:0 18px;
    border:1px solid var(--line); border-bottom:2px solid var(--gold); background:var(--bg2);
  }
  .soft3 .s3-field .pfx { color:var(--bronze); }
  .soft3 .s3-field input { flex:1; min-width:0; border:0; background:none; color:var(--ink); font:500 15px 'Space Mono',monospace; }
  .soft3 .s3-field input:focus { outline:none; }
  .soft3 .s3-field:focus-within { border-bottom-color:var(--wine); box-shadow:0 2px 0 var(--wine); }
  .soft3 .s3-console-meta {
    padding:9px 18px; border-top:1px solid var(--line); text-align:center;
    font:500 10px 'Space Mono',monospace; letter-spacing:.2em; text-transform:uppercase; color:var(--ink-soft);
  }

  /* stat: engraved plaque */
  .soft3 .s3-stat { min-width:180px; border:var(--frame); outline:1px solid var(--gold); outline-offset:4px; background:var(--surface); box-shadow:var(--shadow); padding:18px 20px; text-align:center; }
  .soft3 .s3-stat .lbl { font:600 10px 'Space Mono',monospace; letter-spacing:.24em; text-transform:uppercase; color:var(--bronze); }
  .soft3 .s3-stat .val { font-family:'DM Serif Display',serif; font-size:44px; line-height:1.1; font-variant-numeric:tabular-nums; }
  .soft3 .s3-stat.noir { background:var(--noir); color:var(--on-noir); }
  .soft3 .s3-stat.noir .lbl { color:var(--gold); }

  /* status bar: brass rail */
  .soft3 .s3-status {
    display:flex; flex-wrap:wrap; width:max-content; max-width:100%;
    border:var(--frame); background:var(--noir); color:var(--on-noir); box-shadow:var(--shadow);
  }
  .soft3 .s3-status .cell { display:flex; gap:8px; align-items:center; padding:11px 18px; font:500 11px 'Space Mono',monospace; }
  .soft3 .s3-status .cell + .cell { border-left:1px solid color-mix(in srgb, var(--gold) 55%, transparent); }
  .soft3 .s3-status .cell b { text-transform:uppercase; font-size:9px; letter-spacing:.2em; color:var(--gold); font-weight:600; }
  .soft3 .s3-status .ok::after { content:"●"; color:var(--gold); font-size:9px; }

  /* tabs: deco rail */
  .soft3 .s3-tabs { display:inline-flex; border:var(--frame); outline:1px solid var(--gold); outline-offset:3px; background:var(--surface); }
  .soft3 .s3-tab {
    border:0; background:none; color:var(--ink-soft); font:600 11px 'Space Mono',monospace; letter-spacing:.16em; text-transform:uppercase;
    min-height:44px; padding:0 22px; transition:background .35s var(--ease), color .35s var(--ease);
  }
  .soft3 .s3-tab + .s3-tab { border-left:1px solid var(--gold); }
  .soft3 .s3-tab.on { background:var(--noir); color:var(--on-noir); }

  /* toast */
  .soft3 .s3-toast {
    display:inline-flex; align-items:center; gap:12px; padding:12px 22px;
    border:var(--frame); outline:1px solid var(--gold); outline-offset:3px; background:var(--surface); box-shadow:var(--shadow);
    font-family:'Instrument Serif',serif; font-style:italic; font-size:16px;
  }
  .soft3 .s3-toast .orn { color:var(--gold); font-style:normal; }

  /* empty */
  .soft3 .s3-empty {
    max-width:460px; border:var(--frame); outline:1px solid var(--gold); outline-offset:5px;
    background:var(--surface); box-shadow:var(--shadow); padding:38px 34px; text-align:center;
    display:flex; flex-direction:column; align-items:center; gap:14px;
  }
  .soft3 .s3-empty h3 { font-family:'DM Serif Display',serif; font-size:30px; }
  .soft3 .s3-empty p { color:var(--ink-soft); font-size:15px; line-height:1.6; }

  /* swatches */
  .soft3 .s3-swatches { display:flex; flex-wrap:wrap; gap:18px; }
  .soft3 .s3-swatch {
    flex:1; min-width:140px; border:var(--frame); outline:1px solid var(--gold); outline-offset:3px;
    background:var(--surface); box-shadow:var(--shadow); padding:8px;
    font:600 10px 'Space Mono',monospace; letter-spacing:.12em; text-transform:uppercase; text-align:center;
  }
  .soft3 .s3-swatch .chip { display:block; height:52px; border:1px solid var(--line); margin-bottom:8px; }
  .soft3 .s3-swatch span { color:var(--ink-soft); display:block; }
  .soft3 .s3-shape { width:160px; height:100px; display:grid; place-items:center; text-align:center; font:600 9.5px 'Space Mono',monospace; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-soft); }

  /* workbench */
  .soft3 .s3-bench { border:var(--frame); outline:1px solid var(--gold); outline-offset:5px; background:var(--surface); box-shadow:var(--shadow); }
  .soft3 .s3-bench-bar { display:flex; align-items:center; gap:14px; padding:14px 18px; border-bottom:var(--frame); flex-wrap:wrap; }
  .soft3 .s3-bench-main { display:flex; gap:22px; padding:22px 18px; }
  .soft3 .s3-piles { display:flex; flex-direction:column; gap:10px; min-width:216px; }
  .soft3 .s3-pile {
    display:flex; justify-content:space-between; align-items:center; gap:10px; min-height:44px; padding:0 16px;
    border:1px solid var(--line); border-left:3px solid var(--gold); background:var(--bg2); color:var(--ink);
    font:500 13px 'Space Grotesk',sans-serif; cursor:pointer; transition:transform .35s var(--spring), background .35s var(--ease);
  }
  .soft3 .s3-pile:hover { transform:translateX(4px); }
  .soft3 .s3-pile b { font:600 10.5px 'Space Mono',monospace; color:var(--ink-soft); }
  .soft3 .s3-pile.on { background:var(--noir); color:var(--on-noir); border-color:var(--gold); }
  .soft3 .s3-pile.on b { color:var(--gold); }

  /* phone */
  .soft3 .s3-phone { width:390px; max-width:100%; border:var(--frame); outline:1px solid var(--gold); outline-offset:5px; background:var(--surface); box-shadow:var(--shadow-up); }
  .soft3 .s3-dock { display:flex; border-top:var(--frame); background:var(--surface); }
  .soft3 .s3-dock button {
    flex:1; min-height:50px; border:0; background:none; color:var(--ink-soft);
    font:600 10px 'Space Mono',monospace; letter-spacing:.14em; text-transform:uppercase;
  }
  .soft3 .s3-dock button + button { border-left:1px solid var(--gold); }
  .soft3 .s3-dock button.on { background:var(--noir); color:var(--on-noir); }

  .soft3 .s3-grid { display:grid; gap:30px 22px; }
  .soft3 .g4 { grid-template-columns:repeat(4,1fr); }
  .soft3 .s3-row { display:flex; gap:20px; flex-wrap:wrap; align-items:center; }
  .soft3 .s3-note { font:500 10.5px 'Space Mono',monospace; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-soft); }

  @keyframes s3Curtain {
    0% { transform:scaleY(0); opacity:0; }
    100% { transform:scaleY(1); opacity:1; }
  }
  .soft3 .s3-curtain .s3-art { transform-origin:top; animation:s3Curtain .7s var(--ease) both; }
  @keyframes s3Hang {
    0% { transform:translateY(-16px) rotate(-1.5deg); opacity:0; }
    70% { transform:translateY(3px) rotate(.5deg); opacity:1; }
    100% { transform:translateY(0) rotate(0); opacity:1; }
  }
  .soft3 .s3-hang { animation:s3Hang .6s var(--spring) both; }

  @media (prefers-reduced-motion: reduce) {
    .soft3 *, .soft3 *::before, .soft3 *::after { animation:none !important; transition:none !important; }
  }
  @media (max-width: 980px) {
    .soft3 .s3-bench-main { flex-direction:column; }
    .soft3 .s3-piles { flex-direction:row; flex-wrap:wrap; min-width:0; }
  }
  @media (max-width: 700px) {
    .soft3 .g4 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .soft3 .s3-grid { gap:24px 12px; }
    .soft3 .s3-console-shelf { flex-direction:column; align-items:stretch; }
    .soft3 .s3-nav { gap:12px; }
    .soft3 .s3-status { width:100%; }
    .soft3 .s3-ornrow { letter-spacing:.6em; padding-left:.6em; }
  }
  `);

  const M = MEMES;
  mount.innerHTML = `
  <div class="soft3">
    <div class="s3-mast"><div class="s3-mast-in">
      <span class="s3-logo"><span class="orn">✦</span> sploot <span class="orn">✦</span></span>
      <nav class="s3-nav"><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">upload</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </div></div>

    <div class="s3-wrap s3-hero">
      <span class="s3-ornrow">✦ ✦ ✦</span>
      <span class="s3-kicker">the grand pile · est. whenever · ${LIB.total.toLocaleString()} works</span>
      <h1 class="s3-h1">type words.<br><span class="it">get the picture.</span></h1>
      <p class="s3-sub">no folders. just vibes. every meme hangs in the salon with a brass plaque, and the concierge finds any of them in ${LIB.latency}ms.</p>
      <div class="s3-row" style="justify-content:center">
        <button class="s3-btn primary">enter the salon <span class="orb">→</span></button>
        <button class="s3-btn">shuffle the pile <span class="orb">⤨</span></button>
      </div>
      <div style="width:100%;max-width:760px;margin-top:26px">${s3Console()}</div>
      <div class="s3-grid" style="grid-template-columns:repeat(3,1fr);width:100%;margin-top:34px">
        ${s3Cell(M[0], 'match')}${s3Cell(M[2])}${s3Cell(M[4])}
      </div>
    </div>

    <div class="s3-wrap">${s3Sec('01', 'foundations')}
      <div class="s3-swatches">
        <div class="s3-swatch"><span class="chip" style="background:#1d160c"></span>noir<span>#1d160c</span></div>
        <div class="s3-swatch"><span class="chip" style="background:#f6efdf"></span>champagne<span>#f6efdf</span></div>
        <div class="s3-swatch"><span class="chip" style="background:#fdf8ec"></span>ivory<span>#fdf8ec</span></div>
        <div class="s3-swatch"><span class="chip" style="background:#a8811e"></span>brass<span>#a8811e</span></div>
        <div class="s3-swatch"><span class="chip" style="background:#7a5c10"></span>bronze<span>#7a5c10</span></div>
        <div class="s3-swatch"><span class="chip" style="background:#7c1d2e"></span>wine<span>#7c1d2e</span></div>
      </div>
      <div class="s3-row" style="margin-top:26px">
        <div class="s3-frame s3-shape">double rule · the frame</div>
        <div class="s3-frame s3-shape" style="outline-offset:8px">wide offset · hero tier</div>
        <div class="s3-shape" style="border:1px solid var(--line);background:var(--bg2)">recessed well</div>
        <div class="s3-frame s3-shape" style="border-radius:999px;outline-offset:3px">pill · controls only</div>
        <div class="s3-frame s3-shape" style="box-shadow:var(--shadow-up)">lift · hover tier</div>
      </div>
      <p class="s3-note" style="margin-top:18px">every artifact is framed twice and plaqued once. spacing: 8px scale, salon sections breathe at clamp(56, 8vw, 96).</p>
    </div>

    <div class="s3-wrap">${s3Sec('02', 'typography')}
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="font-family:'DM Serif Display',serif;font-size:clamp(40px,6vw,72px);line-height:1">display · dm serif display</div>
        <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:clamp(26px,4vw,40px);color:var(--wine)">accent italic · instrument serif</div>
        <div style="font-size:17px;max-width:56ch;line-height:1.6">body · space grotesk. the salon hangs every meme with equal ceremony. the cursed food wing is somehow the most visited.</div>
        <div style="font:600 11px 'Space Mono',monospace;letter-spacing:.26em;text-transform:uppercase;color:var(--bronze)">label · space mono engraved caps</div>
        <div style="font:500 10.5px 'Space Mono',monospace;letter-spacing:.14em;color:var(--ink-soft)">metadata · vec 0413 · ${LIB.latency}ms · ${LIB.model}</div>
        <div style="font:500 30px 'Space Mono',monospace;font-variant-numeric:tabular-nums">1,482 · 0.94 · 212ms</div>
        <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:17px;max-width:44ch;line-height:1.55;border-left:1px solid var(--gold);padding-left:16px">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me now hangs in the salon with its own brass plaque and better lighting than my apartment.</div>
      </div>
    </div>

    <div class="s3-wrap">${s3Sec('03', 'components · the salon kit')}
      <div style="display:flex;flex-direction:column;gap:36px">
        ${s3Console('sad frog')}
        <div class="s3-grid g4" style="padding-top:14px">
          ${s3Cell(M[0], 'match')}${s3Cell(M[1], 'near')}${s3Cell(M[3], 'dim')}${s3Cell(M[5])}
        </div>
        <div class="s3-grid g4" style="padding-top:14px">
          ${s3Cell(M[4], 'selected')}
          <figure class="s3-cell"><div class="s3-mat">
            <div class="s3-art s3-loadart" style="aspect-ratio:1/1">embedding…</div></div>
            <figcaption class="s3-plaque"><span class="sheenband"></span><b>awaiting installation</b><span class="meta">uploading · queue 2</span></figcaption>
          </figure>
          <figure class="s3-cell"><div class="s3-mat" style="border-color:var(--wine);outline-color:var(--wine)">
            <div class="s3-art" style="aspect-ratio:1/1;place-items:center"><span class="s3-note" style="color:var(--wine)">embed failed</span></div></div>
            <figcaption class="s3-plaque"><span class="sheenband"></span><b>the machine declined</b><span class="meta">failed.png · err 500</span><button class="s3-btn compact" style="margin:6px auto 0">retry</button></figcaption>
            <span class="s3-ribbon" style="background:var(--wine);color:var(--on-wine);border:1px solid var(--wine)">error</span>
          </figure>
          <div class="s3-empty">
            <span class="s3-ornrow" style="font-size:12px">✦ ✦ ✦</span>
            <h3>the walls are bare.</h3>
            <p>zero memes hung. zero thoughts. upload chaos and the curator gets to work immediately.</p>
            <button class="s3-btn primary">upload chaos <span class="orb">↑</span></button>
          </div>
        </div>
        <div class="s3-row">
          <button class="s3-btn primary">find it <span class="orb">→</span></button>
          <button class="s3-btn">secondary</button>
          <button class="s3-btn wine">bangers <span class="orb">♥</span></button>
          <button class="s3-btn compact">compact</button>
          <button class="s3-btn iconb" aria-label="close">✕</button>
          <span class="s3-sticker">it's a search box. for memes.</span>
          <span class="s3-banger">✦ banger</span>
        </div>
        <div class="s3-row">
          <label class="s3-field" style="max-width:340px;flex:1"><span class="pfx">›</span><input value="text input" aria-label="demo input"></label>
          <div class="s3-tabs" role="tablist"><button class="s3-tab on">all</button><button class="s3-tab">bangers</button><button class="s3-tab">recent</button></div>
          <div class="s3-toast"><span class="orn">✦</span>saved to the pile. filed under cats being unwell.</div>
        </div>
        <div class="s3-row">
          <div class="s3-stat noir"><div class="lbl">folders required</div><div class="val">0</div></div>
          <div class="s3-stat"><div class="lbl">works hung</div><div class="val">1,482</div></div>
          <div class="s3-stat"><div class="lbl">bangers</div><div class="val">37</div></div>
        </div>
        ${s3Status()}
      </div>
    </div>

    <div class="s3-wrap">${s3Sec('04', 'motion · ceremony, on interaction only')}
      <div class="s3-row">
        <button class="s3-btn primary" id="s3-curtain-go">unveil a work <span class="orb">→</span></button>
        <button class="s3-btn" id="s3-polish-go">polish the plaque</button>
        <button class="s3-btn" id="s3-hang-go">hang a banger</button>
      </div>
      <div class="s3-row" style="margin-top:26px;align-items:flex-start">
        <div style="width:250px" id="s3-curtain-cell">${s3Cell(M[2])}</div>
        <div style="width:250px;display:none" id="s3-hang-cell">${s3Cell(M[8])}</div>
      </div>
      <p class="s3-note" style="margin-top:18px">prefers-reduced-motion cancels the curtain, the polish sweep, and the hang. state changes become instant.</p>
    </div>

    <div class="s3-wrap">${s3Sec('05', 'compositions · workbench + phone')}
      <div class="s3-bench">
        <div class="s3-bench-bar">
          <span class="s3-logo" style="font-size:19px"><span class="orn">✦</span> sploot</span>
          <label class="s3-field" style="flex:1;max-width:420px;min-height:44px"><span class="pfx">›</span><input value="search the pile" aria-label="workbench search"></label>
          <button class="s3-btn compact">upload</button>
          <button class="s3-btn compact">shuffle</button>
          <button class="s3-btn wine compact">bangers</button>
        </div>
        <div class="s3-bench-main">
          <div class="s3-piles">
            ${PILES.slice(0, 5).map((p, i) => `<button class="s3-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}
          </div>
          <div class="s3-grid g4" style="flex:1">${M.slice(0, 8).map(x => s3Cell(x)).join('')}</div>
        </div>
        <div style="padding:0 18px 20px">${s3Status()}</div>
      </div>
      <div style="margin:38px 0 48px">
        <div class="s3-phone">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:var(--frame)">
            <span class="s3-logo" style="font-size:17px"><span class="orn">✦</span> sploot</span><span class="s3-note">1,482 hung</span>
          </div>
          <div style="padding:16px 14px;display:flex;flex-direction:column;gap:18px">
            <label class="s3-field" style="min-height:46px"><span class="pfx">›</span><input value="cat losing it" aria-label="phone search"></label>
            <div class="s3-grid" style="grid-template-columns:1fr 1fr;gap:22px 12px">${M.slice(0, 4).map(x => s3Cell(x)).join('')}</div>
          </div>
          <div class="s3-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
        </div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'grand salon'], ['type', 'dm serif display / instrument serif / space grotesk / space mono'], ['move', 'deco double-rule frames + brass plaques on every artifact'], ['density', 'ornament-dense, ceremonial symmetry'], ['motion', 'curtain unveils + brass polish sheen · interaction only']])}
    </div>
  </div>`;

  themeToggle(mount.querySelector('.soft3'));

  const curtainGo = mount.querySelector('#s3-curtain-go');
  const curtainCell = mount.querySelector('#s3-curtain-cell .s3-cell');
  if (curtainGo && curtainCell) curtainGo.addEventListener('click', () => {
    curtainCell.classList.remove('s3-curtain'); void curtainCell.offsetWidth; curtainCell.classList.add('s3-curtain');
  });
  const polishGo = mount.querySelector('#s3-polish-go');
  if (polishGo && curtainCell) polishGo.addEventListener('click', () => {
    curtainCell.classList.remove('sheen'); void curtainCell.offsetWidth; curtainCell.classList.add('sheen');
  });
  const hangGo = mount.querySelector('#s3-hang-go');
  const hangWrap = mount.querySelector('#s3-hang-cell');
  if (hangGo && hangWrap) hangGo.addEventListener('click', () => {
    hangWrap.style.display = 'block';
    const c = hangWrap.querySelector('.s3-cell');
    if (c) { c.classList.remove('s3-hang'); void c.offsetWidth; c.classList.add('s3-hang'); }
  });
  mount.querySelectorAll('.soft3 .s3-tabs').forEach(group => {
    group.addEventListener('click', (e) => {
      const t = e.target.closest('.s3-tab'); if (!t) return;
      group.querySelectorAll('.s3-tab').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
    });
  });
};

})();

(() => {

/* SOFT-4 · GILT ARCADE
   New system rule: every functional object is a numbered collector case.
   A foil sleeve declares hierarchy, a lacquer core carries function, and
   interaction breaks the seal. */

const S4_STAR = 'polygon(100% 50%,80.9% 58.3%,93.3% 75%,72.6% 72.6%,75% 93.3%,58.3% 80.9%,50% 100%,41.7% 80.9%,25% 93.3%,27.4% 72.6%,6.7% 75%,19.1% 58.3%,0% 50%,19.1% 41.7%,6.7% 25%,27.4% 27.4%,25% 6.7%,41.7% 19.1%,50% 0%,58.3% 19.1%,75% 6.7%,72.6% 27.4%,93.3% 25%,80.9% 41.7%)';
const S4_FOILS = ['var(--s4-cyan)', 'var(--s4-pink)', 'var(--s4-gold)', 'var(--s4-orange)'];

function s4Seal(text, extra = '') {
  return `<span class="s4-seal ${extra}"><span>${text}</span></span>`;
}

function s4Cell(m, state = '', i = 0, score = false) {
  return `<article class="s4-case ${state}" style="--s4-case-foil:${S4_FOILS[i % S4_FOILS.length]}">
    <div class="s4-sleeve"><span>sploot archive</span><b>no. ${String(m.vec).padStart(4, '0')}</b></div>
    <div class="s4-core">
      <div class="s4-cardhead"><span>${esc(m.file)}</span><span>vec ${m.vec}</span></div>
      <div class="s4-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}
        ${state === 'loading' ? '<span class="s4-stateplate"><i></i> embedding in lacquer</span>' : ''}
        ${state === 'error' ? '<span class="s4-stateplate errorplate">seal failed · retry</span>' : ''}
      </div>
      <div class="s4-caption"><span>${esc(m.cap)}</span>${score ? `<b>${(m.score / 100).toFixed(2)}</b>` : ''}</div>
    </div>
    ${m.banger ? s4Seal('banger', 'corner') : ''}
    ${state === 'match' ? '<span class="s4-ribbon">closest match</span>' : ''}
  </article>`;
}

function s4Button(text, cls = '') {
  return `<button class="s4-btn ${cls}"><span>${text}</span><i aria-hidden="true">↗</i></button>`;
}

function s4Console(q = 'cat losing it') {
  return `<div class="s4-shell s4-console">
    <div class="s4-shell-label"><span>semantic search · private edition</span><b>no. 0001</b></div>
    <div class="s4-console-core">
      <label class="s4-field"><span>find:</span><input value="${esc(q)}" aria-label="search the pile"><i></i></label>
      ${s4Button('find it', 'primary')}
    </div>
    <div class="s4-console-meta"><span>${LIB.total.toLocaleString()} indexed</span><span>${LIB.model}</span><span>${LIB.dim}d</span><span>${LIB.latency}ms</span></div>
  </div>`;
}

function s4Status() {
  return `<div class="s4-status">
    <span><b>index</b>${LIB.total.toLocaleString()} vec</span><span><b>model</b>${LIB.model}</span>
    <span><b>queue</b>${LIB.queued} embedding</span><span><b>latency</b>${LIB.latency}ms</span>
    <span class="live"><i></i><b>press</b>running</span>
  </div>`;
}

function s4Section(n, text) {
  return `<div class="s4-section"><b>${n}</b><span>${text}</span></div>`;
}

SPECS['SOFT-4'] = (mount) => {
  css('SOFT-4', `
  .soft4 {
    --s4-paper:#f2e7d0; --s4-paper2:#fff9ed; --s4-panel:#fffdf7; --s4-ink:#20152b;
    --s4-muted:#6f6170; --s4-line:rgba(32,21,43,.16); --s4-dot:rgba(32,21,43,.09);
    --s4-pink:#f13891; --s4-cyan:#00a6b8; --s4-orange:#f06b32; --s4-gold:#d5a62e;
    --s4-lime:#a9ce53; --s4-red:#bd2c3d; --s4-foil:#f5ce66;
    --s4-outline:3px solid var(--s4-ink); --s4-hair:1px solid var(--s4-line);
    --s4-miss:4px 4px 0 var(--s4-pink),8px 8px 0 var(--s4-cyan);
    --s4-case-shadow:0 24px 60px rgba(50,32,30,.13),0 3px 0 rgba(32,21,43,.16);
    --s4-lacquer:inset 0 1px 0 rgba(255,255,255,.95),inset 0 -2px 0 rgba(32,21,43,.08),0 12px 30px rgba(63,41,35,.12);
    --s4-focus:0 0 0 4px var(--s4-paper2),0 0 0 7px var(--s4-pink);
    --s4-ease:cubic-bezier(.32,.72,0,1); --s4-spring:cubic-bezier(.34,1.56,.64,1);
    --s4-display:'Syne',sans-serif; --s4-editorial:'Instrument Serif',serif;
    --s4-body:'Bricolage Grotesque',sans-serif; --s4-mono:'Space Mono',monospace;
    min-height:100dvh; width:100%; overflow-x:clip; color:var(--s4-ink); font-family:var(--s4-body);
    background:radial-gradient(var(--s4-dot) 1.2px,transparent 1.5px) 0 0/18px 18px,var(--s4-paper);
  }
  .soft4.theme-dark {
    --s4-paper:#17101d; --s4-paper2:#261c2c; --s4-panel:#2d2132; --s4-ink:#fff3da;
    --s4-muted:#c8b8bf; --s4-line:rgba(255,243,218,.18); --s4-dot:rgba(255,243,218,.07);
    --s4-pink:#ff5fa9; --s4-cyan:#31cad4; --s4-orange:#ff8050; --s4-gold:#f2c95c;
    --s4-lime:#c5e36b; --s4-red:#ff6170; --s4-foil:#f8d875;
    --s4-outline:3px solid var(--s4-ink); --s4-hair:1px solid var(--s4-line);
    --s4-miss:4px 4px 0 var(--s4-pink),8px 8px 0 var(--s4-cyan);
    --s4-case-shadow:0 24px 60px rgba(0,0,0,.3),0 3px 0 rgba(0,0,0,.4);
    --s4-lacquer:inset 0 1px 0 rgba(255,255,255,.15),inset 0 -2px 0 rgba(0,0,0,.28),0 12px 30px rgba(0,0,0,.26);
    --s4-focus:0 0 0 4px var(--s4-paper2),0 0 0 7px var(--s4-foil);
    background:radial-gradient(var(--s4-dot) 1.2px,transparent 1.5px) 0 0/18px 18px,var(--s4-paper);
  }
  .soft4 * { box-sizing:border-box; }
  .soft4 :focus-visible { outline:0; box-shadow:var(--s4-focus); }
  .soft4 button,.soft4 input { font:inherit; }
  .soft4 button { color:inherit; }
  .soft4 .s4-wrap { width:100%; max-width:1180px; margin:0 auto; padding:0 clamp(18px,5vw,64px); }
  .soft4 .s4-section { display:flex; align-items:center; gap:14px; margin-top:clamp(78px,10vw,130px); padding:0 0 24px; border-bottom:var(--s4-hair); }
  .soft4 .s4-section b { display:grid; place-items:center; width:38px; height:38px; border:2px solid var(--s4-ink); border-radius:50%; background:var(--s4-foil); color:#20152b; font:700 11px var(--s4-mono); }
  .soft4 .s4-section span { font:600 11px var(--s4-mono); letter-spacing:.12em; text-transform:uppercase; }
  .soft4 .s4-row { display:flex; flex-wrap:wrap; align-items:flex-start; gap:18px; }
  .soft4 .s4-grid { display:grid; gap:26px; }
  .soft4 .g4 { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .soft4 .g2 { grid-template-columns:repeat(2,minmax(0,1fr)); }

  .soft4 .s4-mast { width:min(1120px,calc(100% - 36px)); margin:22px auto 0; padding:8px 10px 8px 18px; display:flex; align-items:center; justify-content:space-between; gap:18px; border:var(--s4-outline); border-radius:999px; background:var(--s4-panel); box-shadow:var(--s4-lacquer); }
  .soft4 .s4-logo { font:800 22px var(--s4-display); letter-spacing:-.05em; }
  .soft4 .s4-logo i { color:var(--s4-pink); font-style:normal; text-shadow:2px 1px 0 var(--s4-cyan); }
  .soft4 .s4-mast nav { display:flex; gap:3px; flex-wrap:wrap; }
  .soft4 .s4-mast a { min-height:44px; display:inline-flex; align-items:center; padding:0 14px; color:var(--s4-ink); text-decoration:none; border:2px solid transparent; border-radius:999px; font-size:13px; font-weight:650; transition:transform 500ms var(--s4-ease),background 500ms var(--s4-ease),border-color 500ms var(--s4-ease); }
  .soft4 .s4-mast a:hover { transform:translateY(-2px); background:var(--s4-foil); border-color:var(--s4-ink); color:#20152b; }

  .soft4 .s4-hero { min-height:calc(100dvh - 92px); padding-top:clamp(70px,10vw,132px); padding-bottom:90px; display:grid; grid-template-columns:minmax(0,1.08fr) minmax(360px,.92fr); gap:clamp(44px,7vw,100px); align-items:center; }
  .soft4 .s4-edition { display:inline-flex; align-items:center; gap:10px; width:max-content; max-width:100%; padding:8px 14px; border:2px solid var(--s4-ink); border-radius:999px; background:var(--s4-panel); font:700 10px var(--s4-mono); letter-spacing:.13em; text-transform:uppercase; }
  .soft4 .s4-edition::before { content:""; width:10px; height:10px; border-radius:50%; background:var(--s4-pink); box-shadow:4px 0 0 var(--s4-cyan); }
  .soft4 .s4-h1 { margin:24px 0 18px; max-width:10ch; font:800 clamp(52px,7.6vw,104px)/.86 var(--s4-display); letter-spacing:-.075em; }
  .soft4 .s4-h1 em { display:block; margin-left:.62em; color:var(--s4-pink); font:400 1.08em/1 var(--s4-editorial); letter-spacing:-.04em; text-shadow:3px 2px 0 var(--s4-cyan); transform:rotate(-2deg); }
  .soft4 .s4-lede { max-width:47ch; font-size:18px; line-height:1.55; }
  .soft4 .s4-hero-case { position:relative; padding:14px; border:2px solid var(--s4-line); border-radius:38px; background:color-mix(in srgb,var(--s4-panel) 60%,transparent); }
  .soft4 .s4-hero-case .s4-case { transform:rotate(2deg); }

  .soft4 .s4-shell,.soft4 .s4-case { position:relative; padding:7px; border:2px solid var(--s4-ink); border-radius:26px; background:var(--s4-case-foil,var(--s4-foil)); box-shadow:var(--s4-case-shadow); }
  .soft4 .s4-sleeve,.soft4 .s4-shell-label { min-height:31px; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:3px 9px 8px; color:#20152b; font:700 9px var(--s4-mono); letter-spacing:.08em; text-transform:uppercase; }
  .soft4 .s4-sleeve b,.soft4 .s4-shell-label b { font-weight:700; }
  .soft4 .s4-core,.soft4 .s4-console-core { position:relative; overflow:hidden; border:2px solid var(--s4-ink); border-radius:18px; background:var(--s4-panel); box-shadow:var(--s4-lacquer); }
  .soft4 .s4-case { transition:transform 650ms var(--s4-ease),box-shadow 650ms var(--s4-ease); }
  .soft4 .s4-case:hover { transform:translateY(-7px) rotate(-.6deg); box-shadow:0 34px 70px rgba(50,32,30,.18),var(--s4-miss); }
  .soft4 .s4-cardhead { min-height:32px; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 10px; border-bottom:var(--s4-hair); font:600 9px var(--s4-mono); color:var(--s4-muted); white-space:nowrap; overflow:hidden; }
  .soft4 .s4-art { position:relative; display:grid; place-items:center; overflow:hidden; margin:9px; border:2px solid var(--s4-ink); border-radius:12px; background:var(--s4-paper2); }
  .soft4 .s4-art .meme-media { width:100%; height:100%; object-fit:contain; background:var(--s4-paper2); }
  .soft4 .s4-caption { min-height:56px; display:flex; justify-content:space-between; align-items:flex-start; gap:8px; padding:4px 11px 12px; font-size:13px; font-weight:620; line-height:1.35; }
  .soft4 .s4-caption b { flex:none; padding:3px 7px; border:2px solid var(--s4-ink); border-radius:999px; background:var(--s4-foil); color:#20152b; font:700 10px var(--s4-mono); }
  .soft4 .s4-ribbon { position:absolute; top:54px; left:-12px; z-index:2; padding:6px 15px; border:2px solid var(--s4-ink); background:var(--s4-lime); color:#20152b; font:700 9px var(--s4-mono); text-transform:uppercase; transform:rotate(-4deg); }
  .soft4 .s4-case.match { box-shadow:0 0 0 5px var(--s4-lime),var(--s4-case-shadow); }
  .soft4 .s4-case.near { outline:3px dashed var(--s4-cyan); outline-offset:5px; }
  .soft4 .s4-case.dim { opacity:.48; filter:saturate(.35); box-shadow:none; }
  .soft4 .s4-case.selected { transform:translateY(-8px); box-shadow:0 0 0 5px var(--s4-pink),var(--s4-miss); }
  .soft4 .s4-case.error { --s4-case-foil:var(--s4-red); }
  .soft4 .s4-stateplate { position:absolute; inset:auto 12px 12px; display:flex; align-items:center; justify-content:center; gap:8px; padding:8px; border:2px solid var(--s4-ink); border-radius:999px; background:var(--s4-foil); color:#20152b; font:700 9px var(--s4-mono); }
  .soft4 .s4-stateplate i { width:9px; height:9px; border-radius:50%; background:var(--s4-pink); animation:s4pulse 800ms var(--s4-spring) infinite alternate; }
  .soft4 .errorplate { background:var(--s4-red); color:#fff; }

  .soft4 .s4-seal { display:inline-grid; place-items:center; width:82px; height:82px; flex:none; clip-path:${S4_STAR}; background:var(--s4-foil); filter:drop-shadow(2px 3px 0 var(--s4-pink)) drop-shadow(-2px -1px 0 var(--s4-cyan)); transform:rotate(8deg); }
  .soft4 .s4-seal span { max-width:54px; color:#20152b; text-align:center; font:800 10px/1.1 var(--s4-display); text-transform:uppercase; }
  .soft4 .s4-seal.corner { position:absolute; z-index:3; top:-21px; right:-17px; }

  .soft4 .s4-console { max-width:850px; --s4-case-foil:var(--s4-foil); }
  .soft4 .s4-console-core { display:flex; gap:12px; align-items:center; padding:14px; }
  .soft4 .s4-field { flex:1; min-width:0; min-height:54px; display:flex; align-items:center; gap:10px; padding:5px 8px 5px 16px; border:2px solid var(--s4-ink); border-radius:999px; background:var(--s4-paper2); box-shadow:inset 0 2px 8px rgba(32,21,43,.08); }
  .soft4 .s4-field span { color:var(--s4-muted); font:700 10px var(--s4-mono); text-transform:uppercase; }
  .soft4 .s4-field input { width:100%; min-width:0; border:0; outline:0; background:transparent; color:var(--s4-ink); font-weight:650; }
  .soft4 .s4-field i { width:9px; height:22px; flex:none; border-radius:4px; background:var(--s4-pink); animation:s4blink 1s steps(1) infinite; }
  .soft4 .s4-console-meta { display:flex; flex-wrap:wrap; gap:14px; padding:9px 14px 5px; color:#20152b; font:700 9px var(--s4-mono); }

  .soft4 .s4-btn { min-height:48px; display:inline-flex; align-items:center; justify-content:center; gap:12px; padding:5px 6px 5px 20px; border:var(--s4-outline); border-radius:999px; background:var(--s4-panel); box-shadow:0 5px 0 var(--s4-ink); font-weight:750; cursor:pointer; transition:transform 550ms var(--s4-ease),box-shadow 550ms var(--s4-ease),background 550ms var(--s4-ease); }
  .soft4 .s4-btn i { width:34px; height:34px; display:grid; place-items:center; border-radius:50%; background:rgba(32,21,43,.09); color:currentColor; font-style:normal; transition:transform 550ms var(--s4-ease); }
  .soft4 .s4-btn:hover { transform:translateY(-3px); box-shadow:0 8px 0 var(--s4-ink); }
  .soft4 .s4-btn:hover i { transform:translate(3px,-2px) scale(1.06); }
  .soft4 .s4-btn:active { transform:translateY(4px) scale(.98); box-shadow:0 1px 0 var(--s4-ink); }
  .soft4 .s4-btn.primary { background:var(--s4-pink); color:#fff; }
  .soft4 .s4-btn.secondary { background:var(--s4-foil); color:#20152b; }
  .soft4 .s4-btn.compact { min-height:44px; padding-left:14px; font-size:12px; }
  .soft4 .s4-btn.compact i { width:30px; height:30px; }
  .soft4 .s4-btn.icon { width:48px; padding:5px; }
  .soft4 .s4-btn.icon i { width:34px; }

  .soft4 .s4-shape { width:150px; height:96px; padding:10px; display:grid; place-items:center; text-align:center; border:2px solid var(--s4-ink); border-radius:22px; background:var(--s4-panel); color:var(--s4-muted); font:600 9px var(--s4-mono); }
  .soft4 .s4-type { display:grid; grid-template-columns:1.2fr .8fr; gap:44px; align-items:start; }
  .soft4 .s4-type-display { font:800 clamp(46px,7vw,90px)/.9 var(--s4-display); letter-spacing:-.065em; }
  .soft4 .s4-type-display i { display:block; font:400 1.1em var(--s4-editorial); color:var(--s4-pink); }
  .soft4 .s4-type-stack { display:flex; flex-direction:column; gap:16px; }
  .soft4 .s4-note { color:var(--s4-muted); font:600 10px/1.5 var(--s4-mono); }
  .soft4 .s4-longcap { max-width:46ch; padding-left:14px; border-left:4px solid var(--s4-pink); font-size:14px; line-height:1.55; }

  .soft4 .s4-tag { display:inline-flex; align-items:center; min-height:32px; padding:4px 12px; border:2px solid var(--s4-ink); border-radius:999px; background:var(--s4-cyan); color:#20152b; font:700 10px var(--s4-mono); }
  .soft4 .s4-stat { min-width:170px; padding:7px; border:2px solid var(--s4-ink); border-radius:22px; background:var(--s4-foil); box-shadow:var(--s4-lacquer); }
  .soft4 .s4-stat > div { padding:12px 14px; border:2px solid var(--s4-ink); border-radius:14px; background:var(--s4-panel); }
  .soft4 .s4-stat small { display:block; color:var(--s4-muted); font:600 9px var(--s4-mono); }
  .soft4 .s4-stat b { font:800 38px var(--s4-display); font-variant-numeric:tabular-nums; }
  .soft4 .s4-tabs { display:inline-flex; padding:5px; border:2px solid var(--s4-ink); border-radius:999px; background:var(--s4-panel); }
  .soft4 .s4-tab { min-height:40px; padding:7px 16px; border:0; border-radius:999px; background:transparent; cursor:pointer; font-weight:700; }
  .soft4 .s4-tab.on { background:var(--s4-ink); color:var(--s4-paper2); }
  .soft4 .s4-toast { min-height:48px; display:inline-flex; align-items:center; gap:10px; padding:10px 16px; border:2px solid var(--s4-ink); border-radius:18px; background:var(--s4-lime); color:#20152b; box-shadow:var(--s4-miss); font-weight:700; }
  .soft4 .s4-empty { max-width:420px; padding:8px; border:2px solid var(--s4-ink); border-radius:28px; background:var(--s4-foil); box-shadow:var(--s4-case-shadow); }
  .soft4 .s4-empty > div { position:relative; padding:30px 24px; display:flex; flex-direction:column; align-items:flex-start; gap:14px; border:2px solid var(--s4-ink); border-radius:19px; background:var(--s4-panel); }
  .soft4 .s4-empty h3 { font:800 24px var(--s4-display); }
  .soft4 .s4-status { display:flex; flex-wrap:wrap; overflow:hidden; border:2px solid var(--s4-ink); border-radius:18px; background:var(--s4-ink); color:var(--s4-paper2); }
  .soft4 .s4-status span { min-height:40px; display:flex; align-items:center; gap:7px; padding:8px 13px; border-right:1px dotted rgba(255,255,255,.3); font:600 9px var(--s4-mono); }
  .soft4 .s4-status b { opacity:.55; font-weight:500; }
  .soft4 .s4-status .live i { width:9px; height:9px; border-radius:50%; background:var(--s4-lime); }

  .soft4 .s4-unseal-target::after { content:"sealed"; position:absolute; inset:42% auto auto 50%; z-index:4; padding:8px 14px; border:2px solid var(--s4-ink); border-radius:999px; background:var(--s4-red); color:#fff; font:700 10px var(--s4-mono); transform:translate(-50%,-50%) rotate(-6deg); transition:transform 700ms var(--s4-spring),opacity 500ms var(--s4-ease); }
  .soft4 .s4-unseal-target.open::after { opacity:0; transform:translate(-50%,-50%) rotate(22deg) scale(1.8); }
  .soft4 .s4-unseal-target .s4-core { transition:transform 800ms var(--s4-ease); }
  .soft4 .s4-unseal-target.open .s4-core { transform:translateY(12px) rotate(-1deg); }
  .soft4 .s4-stamp-demo { visibility:hidden; }
  .soft4 .s4-stamp-demo.go { visibility:visible; animation:s4stamp 520ms var(--s4-spring); }
  .soft4 .s4-polish-target .s4-core::after { content:""; position:absolute; inset:-30% auto -30% -45%; width:28%; background:rgba(255,255,255,.68); transform:skewX(-18deg) translateX(-250%); pointer-events:none; }
  .soft4 .s4-polish-target.go .s4-core::after { animation:s4polish 900ms var(--s4-ease); }

  .soft4 .s4-bench { overflow:hidden; border:2px solid var(--s4-ink); border-radius:32px; background:var(--s4-paper2); box-shadow:var(--s4-case-shadow); }
  .soft4 .s4-benchbar { display:flex; align-items:center; gap:12px; padding:14px; border-bottom:2px solid var(--s4-ink); background:var(--s4-panel); flex-wrap:wrap; }
  .soft4 .s4-benchmain { display:flex; gap:22px; padding:22px; }
  .soft4 .s4-piles { min-width:205px; display:flex; flex-direction:column; gap:10px; }
  .soft4 .s4-pile { min-height:44px; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 12px; border:2px solid var(--s4-ink); border-radius:14px; background:var(--s4-panel); box-shadow:0 3px 0 var(--s4-ink); font-size:12px; text-align:left; }
  .soft4 .s4-pile.on { background:var(--s4-foil); color:#20152b; }
  .soft4 .s4-pile b { font:700 10px var(--s4-mono); }
  .soft4 .s4-phone { width:min(390px,100%); overflow:hidden; border:3px solid var(--s4-ink); border-radius:34px; background:var(--s4-paper); box-shadow:var(--s4-case-shadow); }
  .soft4 .s4-phonehead { display:flex; align-items:center; justify-content:space-between; padding:14px 17px; border-bottom:2px solid var(--s4-ink); background:var(--s4-panel); }
  .soft4 .s4-dock { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; padding:7px; border-top:2px solid var(--s4-ink); background:var(--s4-panel); }
  .soft4 .s4-dock button { min-height:46px; border:0; border-radius:999px; background:transparent; font-size:11px; font-weight:750; }
  .soft4 .s4-dock button.on { background:var(--s4-ink); color:var(--s4-paper2); }

  @keyframes s4blink { 50% { opacity:0; } }
  @keyframes s4pulse { from { transform:scale(.75); opacity:.5; } to { transform:scale(1.15); opacity:1; } }
  @keyframes s4stamp { 0% { opacity:0; transform:scale(2.4) rotate(-28deg); } 65% { opacity:1; transform:scale(.86) rotate(12deg); } 100% { opacity:1; transform:scale(1) rotate(8deg); } }
  @keyframes s4polish { from { transform:skewX(-18deg) translateX(-250%); } to { transform:skewX(-18deg) translateX(700%); } }
  @media (prefers-reduced-motion:reduce) {
    .soft4 *, .soft4 *::before, .soft4 *::after { animation:none !important; transition:none !important; scroll-behavior:auto !important; }
    .soft4 .s4-stamp-demo.go { visibility:visible; }
  }
  @media (max-width:767px) {
    .soft4 .s4-wrap { padding-left:16px; padding-right:16px; }
    .soft4 .s4-mast { width:calc(100% - 24px); border-radius:26px; align-items:flex-start; flex-direction:column; padding:12px; }
    .soft4 .s4-mast nav { width:100%; display:grid; grid-template-columns:1fr 1fr; }
    .soft4 .s4-mast a { justify-content:center; padding:0 8px; }
    .soft4 .s4-hero { min-height:0; grid-template-columns:1fr; padding-top:72px; gap:48px; }
    .soft4 .s4-hero-case { padding:8px; border-radius:28px; }
    .soft4 .s4-hero-case .s4-case { transform:none; }
    .soft4 .s4-h1 { font-size:clamp(48px,15vw,72px); }
    .soft4 .s4-type { grid-template-columns:1fr; gap:30px; }
    .soft4 .g4 { grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px 12px; }
    .soft4 .s4-console-core { flex-direction:column; align-items:stretch; }
    .soft4 .s4-console-core .s4-btn { width:100%; }
    .soft4 .s4-benchmain { flex-direction:column; padding:14px; }
    .soft4 .s4-piles { min-width:0; }
    .soft4 .s4-bench .g4 { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .soft4 .s4-case { border-radius:20px; padding:5px; }
    .soft4 .s4-core { border-radius:14px; }
    .soft4 .s4-sleeve { font-size:7px; padding-left:5px; padding-right:5px; }
    .soft4 .s4-cardhead { font-size:7px; }
    .soft4 .s4-caption { min-height:48px; padding:2px 8px 9px; font-size:10px; }
    .soft4 .s4-seal.corner { width:58px; height:58px; top:-14px; right:-10px; }
    .soft4 .s4-seal.corner span { font-size:7px; max-width:38px; }
  }
  @media (max-width:420px) {
    .soft4 .s4-wrap { padding-left:12px; padding-right:12px; }
    .soft4 .s4-section { margin-top:72px; }
    .soft4 .s4-row { gap:12px; }
    .soft4 .s4-shape { width:calc(50% - 6px); min-width:0; }
    .soft4 .s4-stat { min-width:calc(50% - 6px); }
    .soft4 .s4-tabs { width:100%; }
    .soft4 .s4-tab { flex:1; padding-left:8px; padding-right:8px; }
    .soft4 .s4-status span { flex:1 1 50%; border-bottom:1px dotted rgba(255,255,255,.25); }
    .soft4 .s4-phone { border-left-width:2px; border-right-width:2px; }
  }`);

  const M = MEMES;
  mount.innerHTML = `<div class="soft4">
    <header class="s4-mast">
      <span class="s4-logo">spl<i>oo</i>t</span>
      <nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </header>

    <main>
      <section class="s4-wrap s4-hero">
        <div>
          <span class="s4-edition">collector edition · run of one</span>
          <h1 class="s4-h1">type words.<em>get the picture.</em></h1>
          <p class="s4-lede">your private meme archive, packed like the good stuff behind the glass. no folders. just vibes. the machine handles the indexing.</p>
          <div style="margin-top:30px">${s4Console()}</div>
        </div>
        <div class="s4-hero-case">${s4Cell(M[0], 'match', 0, true)}</div>
      </section>

      <section>
        <div class="s4-wrap">${s4Section('01', 'foundations · riso inks under foil and lacquer')}</div>
        ${swatches([['collector ink','#20152b','#fff'],['cream stock','#f2e7d0'],['lacquer white','#fffdf7'],['riso pink','#f13891','#fff'],['riso cyan','#00a6b8','#fff'],['press orange','#f06b32','#fff'],['foil gold','#d5a62e'],['machine lime','#a9ce53']])}
        <div class="s4-wrap" style="padding-top:28px">
          <div class="s4-row">
            <div class="s4-shape">2px outer sleeve<br>collector casing</div>
            <div class="s4-shape" style="border-width:3px">3px inner core<br>toy outline</div>
            <div class="s4-shape" style="box-shadow:var(--s4-miss)">cmy misregister<br>special edition</div>
            <div class="s4-shape" style="box-shadow:var(--s4-lacquer)">lacquer inset<br>working surface</div>
            <div class="s4-shape" style="border-radius:999px">pill<br>pressable control</div>
            <div class="s4-shape" style="clip-path:${S4_STAR};border:0;background:var(--s4-foil);color:#20152b">foil seal<br>annotation</div>
          </div>
          <p class="s4-note" style="margin-top:18px">spacing follows a 10px packaging grid · sleeve, bezel, core · depth comes from nested casing, lacquer inset, and cmy edition offsets</p>
        </div>
      </section>

      <section class="s4-wrap">${s4Section('02', 'typography · fashion masthead meets machine label')}
        <div class="s4-type">
          <div class="s4-type-display">private<i>meme archive</i></div>
          <div class="s4-type-stack">
            <p style="font-size:18px;line-height:1.55">body · bricolage grotesque. automatic piles keep the collection tidy while you keep refusing to name folders.</p>
            <p style="font:700 11px var(--s4-mono);letter-spacing:.12em;text-transform:uppercase">label · space mono · collector no. 0413</p>
            <p class="s4-note">metadata · siglip-base · 768d · embedding queue 3</p>
            <p style="font:800 30px var(--s4-display);font-variant-numeric:tabular-nums">1,482 · 0.94 · 212ms</p>
            <p class="s4-longcap">long caption wrap: me explaining why the group chat screenshot is now protected by a foil sleeve and displayed like museum inventory.</p>
          </div>
        </div>
      </section>

      <section class="s4-wrap">${s4Section('03', 'component sheet · every object ships in a collector case')}
        <div style="display:flex;flex-direction:column;gap:36px">
          ${s4Console('sad frog')}
          <div class="s4-grid g4">
            ${s4Cell(M[0], '', 0)}${s4Cell(M[1], 'match', 1, true)}${s4Cell(M[2], 'near', 2)}${s4Cell(M[3], 'dim', 3)}
          </div>
          <div class="s4-grid g4">
            ${s4Cell(M[4], 'selected', 0)}${s4Cell(M[5], 'loading', 1)}${s4Cell(M[6], 'error', 2)}
            <div class="s4-empty"><div>${s4Seal('zero thoughts','corner')}<h3>the case is empty</h3><p>upload chaos. the machine will wrap it nicely.</p>${s4Button('upload chaos','primary')}</div></div>
          </div>
          <div class="s4-row" style="align-items:center">
            ${s4Button('find it','primary')}${s4Button('shuffle the pile','secondary')}${s4Button('compact','compact')}${s4Button('', 'icon')}
            <span class="s4-tag">automatic pile</span>${s4Seal('banger')}
          </div>
          <div class="s4-row" style="align-items:center">
            <label class="s4-field" style="max-width:340px"><span>find:</span><input value="text input" aria-label="text input"><i></i></label>
            <div class="s4-tabs"><button class="s4-tab on">all</button><button class="s4-tab">bangers</button><button class="s4-tab">recent</button></div>
            <div class="s4-toast">✓ saved to the pile</div>
          </div>
          <div class="s4-row">
            <div class="s4-stat"><div><small>folders required</small><b>0</b></div></div>
            <div class="s4-stat" style="background:var(--s4-cyan)"><div><small>memes indexed</small><b>1,482</b></div></div>
            <div class="s4-stat" style="background:var(--s4-pink)"><div><small>bangers</small><b>37</b></div></div>
          </div>
          ${s4Status()}
        </div>
      </section>

      <section class="s4-wrap">${s4Section('04', 'motion · unseal, stamp, polish')}
        <div class="s4-row" style="align-items:center">
          ${s4Button('break the seal','primary s4-go-unseal')}
          ${s4Button('stamp the edition','secondary s4-go-stamp')}
          <span class="s4-stamp-demo">${s4Seal('run of one')}</span>
          ${s4Button('polish the case','s4-go-polish')}
        </div>
        <div class="s4-row" style="margin-top:30px">
          <div style="width:min(230px,100%)">${s4Cell(M[7], 's4-unseal-target', 2)}</div>
          <div style="width:min(230px,100%)">${s4Cell(M[8], 's4-polish-target', 1)}</div>
        </div>
        <p class="s4-note" style="margin-top:18px">prefers-reduced-motion: seals, stamp slams, polish sweeps, blinking cursors, and packaging transitions become instant settled states.</p>
      </section>

      <section>
        <div class="s4-wrap">${s4Section('05', 'compositions · collector workbench and pocket case')}</div>
        <div class="s4-wrap">
          <div class="s4-bench">
            <div class="s4-benchbar"><span class="s4-logo">spl<i>oo</i>t</span><label class="s4-field" style="flex:1;max-width:430px"><span>find:</span><input value="search the pile" aria-label="workbench search"><i></i></label>${s4Button('upload','compact')}${s4Button('bangers','compact')}${s4Button('shuffle','compact')}</div>
            <div class="s4-benchmain">
              <div class="s4-piles">${PILES.slice(0,5).map((p,i) => `<button class="s4-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}</div>
              <div class="s4-grid g4" style="flex:1">${M.slice(0,8).map((m,i) => s4Cell(m,'',i)).join('')}</div>
            </div>
            <div style="padding:0 18px 18px">${s4Status()}</div>
          </div>
          <div style="padding:44px 0 70px">
            <div class="s4-phone">
              <div class="s4-phonehead"><span class="s4-logo" style="font-size:17px">spl<i>oo</i>t</span><span class="s4-note">1,482 cased</span></div>
              <div style="padding:14px;display:flex;flex-direction:column;gap:16px">
                <label class="s4-field"><span>find:</span><input value="cat losing it" aria-label="phone search"><i></i></label>
                <div class="s4-grid g2" style="gap:18px 10px">${M.slice(0,4).map((m,i) => s4Cell(m,i === 0 ? 'match' : '',i)).join('')}</div>
              </div>
              <div class="s4-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
            </div>
          </div>
        </div>
      </section>
    </main>
    <div>${labSpec([['system','gilt arcade · collector edition'],['type','syne / instrument serif / bricolage grotesque / space mono'],['move','every function lives in a numbered collector case: foil sleeve outside, lacquer core inside, interaction breaks the seal'],['density','luxe high, nested and catalogued'],['motion','unseal, foil stamp, lacquer polish · interaction only']])}</div>
  </div>`;

  const root = mount.querySelector('.soft4');
  themeToggle(root);
  const unseal = root.querySelector('.s4-go-unseal');
  const unsealTarget = root.querySelector('.s4-unseal-target');
  if (unseal && unsealTarget) unseal.addEventListener('click', () => unsealTarget.classList.toggle('open'));
  const stamp = root.querySelector('.s4-go-stamp');
  const stampTarget = root.querySelector('.s4-stamp-demo');
  if (stamp && stampTarget) stamp.addEventListener('click', () => {
    stampTarget.classList.remove('go'); void stampTarget.offsetWidth; stampTarget.classList.add('go');
  });
  const polish = root.querySelector('.s4-go-polish');
  const polishTarget = root.querySelector('.s4-polish-target');
  if (polish && polishTarget) polish.addEventListener('click', () => {
    polishTarget.classList.remove('go'); void polishTarget.offsetWidth; polishTarget.classList.add('go');
  });
  root.querySelectorAll('.s4-tabs').forEach(group => group.addEventListener('click', e => {
    const tab = e.target.closest('.s4-tab'); if (!tab) return;
    group.querySelectorAll('.s4-tab').forEach(x => x.classList.remove('on')); tab.classList.add('on');
  }));
};

})();
