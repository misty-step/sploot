/* lab 034 · lane IMPEC — three hypermaximalist complete-system propositions.
   IMPEC-1 ink flood broadsheet · IMPEC-2 quantized sticker bomb · IMPEC-3 phosphor scoreboard */
'use strict';

(() => {

/* ============================================================ IMPEC-1
   ink flood broadsheet. system rule: color arrives as full-bleed
   floods, one saturated field per zone; objects stay flat, hairline
   ruled, radius 0, shadow 0. maximalism = drenched area + monumental
   condensed type. everything moves by one hard wipe. */

function i1Sw(list) {
  return `<div class="i1-swrow">${list.map(([n, c, fg]) => `
    <div class="i1-sw" style="background:${c};color:${fg}">${n}<br><b>${c}</b></div>`).join('')}</div>`;
}
function i1Cell(m, state = '', score = false) {
  const bands = {
    match: `<div class="i1-band" style="background:var(--fb);color:#fff">match · ${(m.score / 100).toFixed(2)}</div>`,
    near: `<div class="i1-band" style="background:var(--fa);color:#131313">near · ${(m.score / 100).toFixed(2)}</div>`,
    dim: `<div class="i1-band" style="background:var(--paper2);color:var(--mut)">low · ${(m.score / 100).toFixed(2)}</div>`,
    selected: `<div class="i1-band" style="background:var(--ink);color:var(--paper)">selected ✓</div>`,
  };
  return `
  <figure class="i1-cell ${state}">
    ${bands[state] || ''}
    <div class="i1-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>
    <figcaption class="i1-cap">
      <span class="i1-idx">${m.vec}</span>
      <span class="i1-captext">${esc(m.cap)}</span>
      ${m.banger ? '<span class="i1-banger"><i></i>banger</span>' : ''}
    </figcaption>
    ${score ? `<div class="i1-score"><b>${(m.score / 100).toFixed(2)}</b><span>${m.score >= 90 ? 'closest match' : m.score >= 75 ? 'strong match' : 'related'}</span></div>` : ''}
  </figure>`;
}
function i1Console(q = 'cat losing it') {
  return `
  <div class="i1-console">
    <div class="i1-conhead"><span>semantic search</span><span>${LIB.model} · ${LIB.dim}d</span></div>
    <div class="i1-conbody">
      <div class="i1-field" tabindex="0"><span class="pre">›</span><span class="q">${esc(q)}</span><span class="i1-caret"></span></div>
      <button class="i1-btn primary">find it</button>
    </div>
    <div class="i1-conmeta">
      <span>index <b>${LIB.total.toLocaleString()}</b></span><span class="dots"></span>
      <span>queued <b>${LIB.queued}</b></span><span class="dots"></span>
      <span>last query <b>${LIB.latency}ms</b></span>
    </div>
  </div>`;
}
function i1Status() {
  return `
  <div class="i1-status">
    <span><b>index</b> ${LIB.total.toLocaleString()} vec</span>
    <span><b>model</b> ${LIB.model}</span>
    <span><b>queue</b> ${LIB.queued} embedding</span>
    <span><b>latency</b> ${LIB.latency}ms</span>
    <span class="live"><i></i>live</span>
  </div>`;
}

SPECS['IMPEC-1'] = (mount) => {
  css('IMPEC-1', `
  .impec1{
    --ink:#131313; --paper:#ffffff; --paper2:#efefec; --mut:#525252;
    --fa:#ff4d00; --fb:#1a2fe0; --fc:#ffd400; --fd:#ff6ec7; --fe:#00c853; --alert:#cf1e00;
    --rule:1px solid var(--ink); --frame:5px solid var(--ink);
    --wipe:180ms cubic-bezier(.16,1,.3,1);
    --disp:'Anton',sans-serif; --body:'Space Grotesk',sans-serif; --mono:'IBM Plex Mono',monospace;
    font-family:var(--body); color:var(--ink); background:var(--paper);
    min-height:100dvh; display:flex; flex-direction:column;
  }
  .impec1.theme-dark{
    --ink:#f2f2f2; --paper:#101013; --paper2:#1c1c21; --mut:#ababaf; --fb:#3d55ff;
    --rule:1px solid var(--ink); --frame:5px solid var(--ink);
  }
  .impec1 :focus-visible{ outline:3px solid var(--fb); outline-offset:2px; }
  .impec1 .wrap{ max-width:1160px; margin:0 auto; width:100%; padding:0 clamp(16px,4vw,48px); }

  /* masthead + flood index */
  .impec1 .i1-mast{ display:flex; align-items:center; gap:20px; padding:14px 0; border-bottom:var(--rule); }
  .impec1 .i1-logo{ font-family:var(--disp); font-size:26px; letter-spacing:0; }
  .impec1 .i1-nav{ margin-left:auto; display:flex; gap:18px; font-family:var(--mono); font-size:12px; }
  .impec1 .i1-nav a{ color:var(--ink); text-decoration:none; padding:12px 2px; }
  .impec1 .i1-nav a:hover{ color:var(--fb); text-decoration:underline; text-underline-offset:4px; }
  .impec1 .i1-inkdex{ display:flex; height:10px; }
  .impec1 .i1-inkdex i{ flex:1; }

  /* hero flood */
  .impec1 .i1-hero{ background:var(--fa); color:#131313; padding:clamp(36px,7vw,84px) 0 clamp(28px,5vw,56px); }
  .impec1 .i1-h1{ font-family:var(--disp); font-size:clamp(44px,8.5vw,92px); line-height:.94; letter-spacing:0; text-wrap:balance; max-width:14ch; }
  .impec1 .i1-hero p{ font-size:clamp(16px,2vw,20px); max-width:52ch; margin:18px 0 26px; font-weight:500; }
  .impec1 .i1-hero .i1-console{ background:var(--paper); color:var(--ink); }

  /* flood section headers */
  .impec1 .i1-sec{ margin-top:clamp(36px,6vw,64px); padding:10px 0 12px; display:flex; align-items:baseline; gap:16px; color:#131313; }
  .impec1 .i1-sec h2{ font-family:var(--disp); font-size:clamp(26px,4vw,40px); line-height:1; letter-spacing:0; }
  .impec1 .i1-sec span{ margin-left:auto; font-family:var(--mono); font-size:11px; }
  .impec1 .i1-body{ padding:26px 0 8px; }

  /* swatches + shapes */
  .impec1 .i1-swrow{ display:flex; flex-wrap:wrap; }
  .impec1 .i1-sw{ flex:1; min-width:104px; padding:14px 10px 12px; font-family:var(--mono); font-size:10px; border-top:3px solid var(--ink); }
  .impec1 .i1-sw b{ font-size:11px; }
  .impec1 .i1-shapes{ display:flex; gap:18px; flex-wrap:wrap; margin-top:22px; }
  .impec1 .i1-shape{ width:128px; height:84px; display:grid; place-items:center; text-align:center;
    font-family:var(--mono); font-size:10px; background:var(--paper2); }
  .impec1 .i1-note{ font-family:var(--mono); font-size:11px; color:var(--mut); margin-top:16px; }

  /* type specimen */
  .impec1 .i1-type{ display:flex; flex-direction:column; gap:14px; }
  .impec1 .i1-type .disp{ font-family:var(--disp); font-size:clamp(38px,6vw,60px); line-height:.96; }
  .impec1 .i1-type .body{ font-size:17px; max-width:62ch; }
  .impec1 .i1-type .label{ font-family:var(--mono); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .impec1 .i1-type .meta{ font-family:var(--mono); font-size:11px; color:var(--mut); }
  .impec1 .i1-type .tab{ font-family:var(--mono); font-size:26px; font-variant-numeric:tabular-nums; }
  .impec1 .i1-type .capln{ font-size:13px; max-width:46ch; padding-top:8px; border-top:var(--rule); }

  /* console */
  .impec1 .i1-console{ border:var(--frame); background:var(--paper); }
  .impec1 .i1-conhead{ display:flex; justify-content:space-between; gap:12px; padding:8px 14px;
    background:var(--ink); color:var(--paper); font-family:var(--mono); font-size:11px; }
  .impec1 .i1-conbody{ display:flex; gap:12px; padding:14px; align-items:stretch; }
  .impec1 .i1-field{ flex:1; display:flex; align-items:center; gap:10px; border:var(--rule);
    padding:12px 14px; font-family:var(--mono); font-size:15px; background:var(--paper); min-height:48px; }
  .impec1 .i1-field .pre{ color:var(--fb); font-weight:700; }
  .impec1 .i1-caret{ width:9px; height:20px; background:var(--fb); animation:i1blink 1.1s steps(1) infinite; }
  @keyframes i1blink{ 50%{ opacity:0; } }
  .impec1 .i1-conmeta{ display:flex; align-items:center; gap:12px; padding:9px 14px; border-top:var(--rule);
    font-family:var(--mono); font-size:11px; }
  .impec1 .i1-conmeta .dots{ flex:1; border-bottom:1px dotted var(--mut); }

  /* buttons: the wipe */
  .impec1 .i1-btn{ position:relative; isolation:isolate; overflow:hidden; display:inline-flex; align-items:center;
    justify-content:center; gap:8px; min-height:48px; padding:12px 22px; border:2px solid var(--ink);
    background:var(--paper); color:var(--ink); font-family:var(--mono); font-weight:600; font-size:13px;
    text-transform:uppercase; letter-spacing:.03em; transition:color var(--wipe), transform 90ms ease-out; }
  .impec1 .i1-btn::before{ content:""; position:absolute; inset:0; z-index:-1; background:var(--ink);
    transform:scaleX(0); transform-origin:left; transition:transform var(--wipe); }
  .impec1 .i1-btn:hover::before{ transform:scaleX(1); }
  .impec1 .i1-btn:hover{ color:var(--paper); }
  .impec1 .i1-btn:active{ transform:translateY(2px); }
  .impec1 .i1-btn.primary{ background:var(--ink); color:var(--paper); }
  .impec1 .i1-btn.primary::before{ background:var(--fb); }
  .impec1 .i1-btn.primary:hover{ color:#fff; }
  .impec1 .i1-btn.compact{ min-height:38px; padding:7px 12px; font-size:11px; }
  .impec1 .i1-btn.iconb{ min-height:38px; width:38px; padding:0; }

  /* tag + banger */
  .impec1 .i1-tag{ display:inline-flex; align-items:center; gap:7px; font-family:var(--mono); font-size:12px;
    padding:5px 10px; border:var(--rule); background:var(--paper); }
  .impec1 .i1-tag i{ width:9px; height:9px; background:var(--fd); }
  .impec1 .i1-banger{ display:inline-flex; align-items:center; gap:5px; flex:none; font-family:var(--mono);
    font-size:10px; font-weight:600; text-transform:uppercase; }
  .impec1 .i1-banger i{ width:9px; height:9px; background:var(--fa); }

  /* meme cell */
  .impec1 .i1-cell{ border:var(--rule); background:var(--paper); display:flex; flex-direction:column; }
  .impec1 .i1-band{ font-family:var(--mono); font-size:10px; text-transform:uppercase; padding:5px 9px; }
  .impec1 .i1-art{ background:var(--paper2); display:grid; place-items:center; overflow:hidden; }
  .impec1 .meme-media{ background:var(--paper2); }
  .impec1 .i1-cap{ display:flex; align-items:baseline; gap:8px; padding:8px 9px; border-top:var(--rule); font-size:12px; line-height:1.35; }
  .impec1 .i1-idx{ font-family:var(--mono); font-size:10px; color:var(--mut); flex:none; }
  .impec1 .i1-captext{ flex:1; font-weight:500; }
  .impec1 .i1-score{ display:flex; justify-content:space-between; padding:6px 9px; border-top:var(--rule);
    font-family:var(--mono); font-size:10px; text-transform:uppercase; background:var(--fc); color:#131313; }
  .impec1 .i1-cell.match{ border:4px solid var(--fb); }
  .impec1 .i1-cell.near{ border:2px solid var(--fa); }
  .impec1 .i1-cell.dim .i1-art, .impec1 .i1-cell.dim .i1-cap{ opacity:.4; filter:grayscale(.6); }
  .impec1 .i1-cell.selected{ border:var(--frame); }
  .impec1 .i1-loadbar{ height:8px; background:var(--paper2); overflow:hidden; position:relative; }
  .impec1 .i1-loadbar i{ position:absolute; inset:0; background:var(--fb); transform:scaleX(.3); transform-origin:left; animation:i1sweep 1.2s cubic-bezier(.16,1,.3,1) infinite alternate; }
  @keyframes i1sweep{ to{ transform:scaleX(1); } }
  .impec1 .i1-errband{ background:var(--alert); color:#fff; font-family:var(--mono); font-size:10px; text-transform:uppercase; padding:5px 9px; }

  /* stat, input, tabs, toast, empty */
  .impec1 .i1-stat{ border-top:3px solid var(--ink); padding:10px 2px 0; min-width:150px; }
  .impec1 .i1-stat .v{ font-family:var(--disp); font-size:46px; line-height:1; font-variant-numeric:tabular-nums; }
  .impec1 .i1-stat .l{ font-family:var(--mono); font-size:11px; color:var(--mut); }
  .impec1 .i1-status{ display:flex; flex-wrap:wrap; gap:0; background:var(--ink); color:var(--paper);
    font-family:var(--mono); font-size:11px; }
  .impec1 .i1-status>span{ padding:9px 14px; border-right:1px dotted var(--mut); display:flex; gap:8px; align-items:center; }
  .impec1 .i1-status b{ font-weight:400; opacity:.65; text-transform:uppercase; }
  .impec1 .i1-status .live i{ width:9px; height:9px; background:var(--fe); display:inline-block; }
  .impec1 .i1-tabs{ display:flex; gap:22px; border-bottom:var(--rule); }
  .impec1 .i1-tab{ background:none; border:0; padding:12px 2px; font-family:var(--mono); font-size:13px;
    color:var(--mut); border-bottom:4px solid transparent; margin-bottom:-1px; min-height:44px; }
  .impec1 .i1-tab.on{ color:var(--ink); font-weight:700; border-bottom-color:var(--fb); }
  .impec1 .i1-toast{ display:inline-flex; align-items:center; gap:10px; background:var(--ink); color:var(--paper);
    padding:12px 16px; font-family:var(--mono); font-size:12px; }
  .impec1 .i1-toast i{ width:10px; height:10px; background:var(--fe); }
  .impec1 .i1-empty{ background:var(--fd); color:#131313; padding:30px; display:flex; flex-direction:column; gap:10px; align-items:flex-start; }
  .impec1 .i1-empty h3{ font-family:var(--disp); font-size:30px; line-height:1; }
  .impec1 .i1-empty p{ font-size:15px; max-width:38ch; }
  .impec1 .i1-empty .i1-btn{ border-color:#131313; color:#131313; background:transparent; }
  .impec1 .i1-empty .i1-btn::before{ background:#131313; }
  .impec1 .i1-empty .i1-btn:hover{ color:var(--fd); }

  /* grids */
  .impec1 .i1-grid{ display:grid; gap:18px; grid-template-columns:repeat(4,1fr); }
  .impec1 .i1-row{ display:flex; gap:14px; flex-wrap:wrap; align-items:center; }

  /* motion demos */
  .impec1 .i1-motion{ background:var(--fc); color:#131313; padding-bottom:40px; }
  .impec1 .i1-motion .i1-cell{ max-width:240px; background:var(--paper); color:var(--ink); }
  .impec1 .i1-reveal .i1-band{ transform:scaleX(0); transform-origin:left; }
  .impec1 .i1-reveal.go .i1-band{ animation:i1wipein 240ms cubic-bezier(.16,1,.3,1) forwards; }
  @keyframes i1wipein{ to{ transform:scaleX(1); } }
  .impec1 .i1-toastdemo{ opacity:0; transform:translateY(8px); transition:opacity var(--wipe), transform var(--wipe); }
  .impec1 .i1-toastdemo.show{ opacity:1; transform:none; }

  /* compositions */
  .impec1 .i1-bench{ border:var(--rule); }
  .impec1 .i1-benchhead{ display:flex; align-items:center; gap:16px; padding:10px 16px; border-bottom:var(--rule); }
  .impec1 .i1-benchbody{ display:flex; gap:0; }
  .impec1 .i1-rail{ width:220px; flex:none; border-right:var(--rule); }
  .impec1 .i1-pile{ display:flex; justify-content:space-between; gap:10px; width:100%; text-align:left; background:none;
    border:0; border-bottom:var(--rule); color:var(--ink); padding:11px 14px; font-family:var(--mono); font-size:12px; min-height:44px; }
  .impec1 .i1-pile:hover{ background:var(--paper2); }
  .impec1 .i1-pile.on{ background:var(--fc); color:#131313; font-weight:700; }
  .impec1 .i1-phone{ width:390px; max-width:100%; border:var(--frame); background:var(--paper); }
  .impec1 .i1-dock{ display:flex; background:var(--ink); }
  .impec1 .i1-dock button{ flex:1; min-height:52px; background:none; border:0; border-right:1px dotted var(--mut);
    color:var(--paper); font-family:var(--mono); font-size:11px; }
  .impec1 .i1-dock button.on{ background:var(--fb); color:#fff; }

  @media (max-width:700px){
    .impec1 .i1-grid{ grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .impec1 .i1-conbody{ flex-direction:column; }
    .impec1 .i1-benchbody{ flex-direction:column; }
    .impec1 .i1-rail{ width:100%; border-right:0; border-bottom:var(--rule); }
    .impec1 .i1-nav{ gap:10px; font-size:11px; }
  }
  @media (prefers-reduced-motion:reduce){
    .impec1 *, .impec1 *::before, .impec1 *::after{ animation:none !important; transition:none !important; }
    .impec1 .i1-reveal .i1-band{ transform:none; }
    .impec1 .i1-toastdemo{ transform:none; }
  }`);

  const M = MEMES;
  mount.innerHTML = `
  <div class="impec1">
    <div class="wrap">
      <div class="i1-mast">
        <span class="i1-logo">sploot</span>
        <nav class="i1-nav"><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
      </div>
    </div>
    <div class="i1-inkdex"><i style="background:var(--fa)"></i><i style="background:var(--fb)"></i><i style="background:var(--fc)"></i><i style="background:var(--fd)"></i><i style="background:var(--fe)"></i></div>

    <div class="i1-hero">
      <div class="wrap">
        <h1 class="i1-h1">type words. get the picture.</h1>
        <p>sploot is your private meme archive with semantic search. no folders. just vibes.</p>
        ${i1Console()}
      </div>
    </div>

    <div class="wrap">
      <div class="i1-grid" style="margin-top:26px">${M.slice(0, 4).map((x, i) => i1Cell(x, i === 0 ? 'match' : '', i === 0)).join('')}</div>
    </div>

    <div class="i1-sec" style="background:var(--fc)"><div class="wrap" style="display:flex;align-items:baseline;gap:16px;width:100%"><h2>foundations</h2><span>tokens · shape · rhythm</span></div></div>
    <div class="wrap i1-body">
      ${i1Sw([['ink', '#131313', '#fff'], ['paper', '#ffffff', '#131313'], ['paper 2', '#efefec', '#131313'], ['flood a', '#ff4d00', '#131313'], ['flood b', '#1a2fe0', '#fff'], ['flood c', '#ffd400', '#131313'], ['flood d', '#ff6ec7', '#131313'], ['flood e', '#00c853', '#131313'], ['alert', '#cf1e00', '#fff']])}
      <div class="i1-shapes">
        <div class="i1-shape" style="border:var(--rule)">hairline · every object</div>
        <div class="i1-shape" style="border:2px solid var(--ink)">2px · interactive</div>
        <div class="i1-shape" style="border:var(--frame)">5px · selected</div>
        <div class="i1-shape" style="background:var(--fb);color:#fff">flood · zones only</div>
        <div class="i1-shape" style="border:var(--rule);border-radius:0">radius 0 · always</div>
        <div class="i1-shape" style="border:var(--rule);box-shadow:none">elevation 0 · flat press</div>
      </div>
      <p class="i1-note">spacing rides an 8px scale with big jumps: 8 · 14 · 26 · 64. density spikes inside zones, air lives between them.</p>
    </div>

    <div class="i1-sec" style="background:var(--fd)"><div class="wrap" style="display:flex;align-items:baseline;gap:16px;width:100%"><h2>type</h2><span>anton · space grotesk · plex mono</span></div></div>
    <div class="wrap i1-body">
      <div class="i1-type">
        <div class="disp">shuffle the pile</div>
        <div class="body">body is space grotesk. the archive sorts itself into piles while you sleep, and nothing asks you to name a folder.</div>
        <div class="label">label · plex mono upper</div>
        <div class="meta">metadata · vec 0413 · siglip-base · 212ms</div>
        <div class="tab">1,482 · 0.94 · 212ms</div>
        <div class="capln">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me is now framed above my desk like a diploma.</div>
      </div>
    </div>

    <div class="i1-sec" style="background:var(--fa)"><div class="wrap" style="display:flex;align-items:baseline;gap:16px;width:100%"><h2>the kit</h2><span>every component, every state</span></div></div>
    <div class="wrap i1-body" style="display:flex;flex-direction:column;gap:30px">
      ${i1Console('sad frog')}
      <div class="i1-grid">
        ${i1Cell(M[1])}
        ${i1Cell(M[0], 'match', true)}
        ${i1Cell(M[2], 'near')}
        ${i1Cell(M[3], 'dim')}
      </div>
      <div class="i1-grid">
        ${i1Cell(M[4], 'selected')}
        <figure class="i1-cell"><div class="i1-band" style="background:var(--paper2)">embedding · queue 2</div><div class="i1-art" style="aspect-ratio:1/1;display:grid;place-items:center"><span style="font-family:var(--mono);font-size:11px">reading the image…</span></div><div class="i1-loadbar"><i></i></div><figcaption class="i1-cap"><span class="i1-idx">wait</span><span class="i1-captext">loading state</span></figcaption></figure>
        <figure class="i1-cell"><div class="i1-errband">embed failed · err 500</div><div class="i1-art" style="aspect-ratio:1/1;display:grid;place-items:center"><span style="font-family:var(--mono);font-size:12px">the model looked away.</span></div><figcaption class="i1-cap"><span class="i1-captext">error state</span><button class="i1-btn compact">retry</button></figcaption></figure>
        <div class="i1-empty">
          <h3>the pile is empty.</h3>
          <p>zero thoughts. that changes the second you upload chaos.</p>
          <button class="i1-btn">upload chaos</button>
        </div>
      </div>
      <div class="i1-row">
        <button class="i1-btn primary">find it</button>
        <button class="i1-btn">shuffle the pile</button>
        <button class="i1-btn compact">compact</button>
        <button class="i1-btn iconb" aria-label="close">✕</button>
        <span class="i1-tag"><i></i>cats being unwell</span>
        <span class="i1-banger"><i></i>banger</span>
      </div>
      <div class="i1-row">
        <div class="i1-field" style="max-width:340px"><span class="pre">›</span><span class="q">text input</span><span class="i1-caret"></span></div>
        <div class="i1-tabs"><button class="i1-tab on">all</button><button class="i1-tab">bangers</button><button class="i1-tab">recent</button></div>
        <div class="i1-toast"><i></i>saved to the pile</div>
      </div>
      <div class="i1-row" style="gap:34px;align-items:flex-end">
        <div class="i1-stat"><div class="v">0</div><div class="l">folders required</div></div>
        <div class="i1-stat"><div class="v">1,482</div><div class="l">memes indexed</div></div>
        <div class="i1-stat"><div class="v">37</div><div class="l">bangers</div></div>
      </div>
      ${i1Status()}
    </div>

    <div class="i1-sec" style="background:var(--fc)"><div class="wrap" style="display:flex;align-items:baseline;gap:16px;width:100%"><h2>motion</h2><span>one grammar: the hard wipe</span></div></div>
    <div class="i1-motion">
      <div class="wrap i1-body">
        <div class="i1-row" style="align-items:flex-start">
          <button class="i1-btn primary" id="i1-press">press me · <b id="i1-pressn">0</b></button>
          <button class="i1-btn" id="i1-replay">replay match reveal</button>
          <button class="i1-btn" id="i1-toastgo">save something</button>
          <div class="i1-reveal" id="i1-revealcell">${i1Cell(M[2], 'match')}</div>
          <div class="i1-toast i1-toastdemo" id="i1-toastdemo"><i></i>saved to the pile</div>
        </div>
        <p class="i1-note" style="color:#131313">reduced motion: every wipe and slide collapses to an instant cut. nothing in the pile moves on its own.</p>
      </div>
    </div>

    <div class="i1-sec" style="background:var(--fb);color:#fff"><div class="wrap" style="display:flex;align-items:baseline;gap:16px;width:100%"><h2 style="color:#fff">compositions</h2><span style="color:#fff">workbench · phone</span></div></div>
    <div class="wrap i1-body" style="display:flex;flex-direction:column;gap:34px;padding-bottom:48px">
      <div class="i1-bench">
        <div class="i1-benchhead">
          <span class="i1-logo" style="font-size:17px">sploot</span>
          <div class="i1-field" style="flex:1;max-width:420px;min-height:40px;padding:8px 12px"><span class="pre">›</span><span class="q">search the pile</span></div>
          <nav class="i1-nav" style="margin-left:auto"><a href="#0">upload</a><a href="#0">bangers</a><a href="#0">shuffle</a></nav>
        </div>
        <div class="i1-benchbody">
          <div class="i1-rail">${PILES.map((p, i) => `<button class="i1-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}</div>
          <div class="i1-grid" style="flex:1;padding:16px;gap:14px">${M.slice(0, 8).map(x => i1Cell(x)).join('')}</div>
        </div>
        ${i1Status()}
      </div>
      <div class="i1-phone">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:var(--rule)">
          <span class="i1-logo" style="font-size:15px">sploot</span>
          <span class="i1-note" style="margin:0">1,482 vec</span>
        </div>
        <div style="padding:12px;display:flex;flex-direction:column;gap:12px">
          <div class="i1-field" style="min-height:44px"><span class="pre">›</span><span class="q">cat losing it</span><span class="i1-caret"></span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${M.slice(0, 4).map(x => i1Cell(x)).join('')}</div>
        </div>
        <div class="i1-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'ink flood broadsheet'], ['type', 'anton / space grotesk / ibm plex mono'], ['move', 'color arrives as full-bleed floods; objects stay flat and hairline'], ['density', 'high inside zones, air between'], ['motion', 'one hard wipe, interaction only']])}
    </div>
  </div>`;

  themeToggle(mount.querySelector('.impec1'));
  const pressBtn = mount.querySelector('#i1-press');
  const pressN = mount.querySelector('#i1-pressn');
  let n1 = 0;
  if (pressBtn) pressBtn.onclick = () => { n1 += 1; pressN.textContent = n1; };
  const rev = mount.querySelector('#i1-revealcell');
  const replay = mount.querySelector('#i1-replay');
  if (replay && rev) replay.onclick = () => { rev.classList.remove('go'); void rev.offsetWidth; rev.classList.add('go'); };
  const toast = mount.querySelector('#i1-toastdemo');
  const toastGo = mount.querySelector('#i1-toastgo');
  let t1;
  if (toastGo && toast) toastGo.onclick = () => {
    toast.classList.add('show');
    clearTimeout(t1);
    t1 = setTimeout(() => toast.classList.remove('show'), 1600);
  };
};

/* __IMPEC2__ */

})();

(() => {

/* ============================================================ IMPEC-2
   quantized sticker bomb. system rule: every element is a self-contained
   sticker — independent background, chunky border, its own shadow, friendly
   lean rotation. maximalism = dense multiplicity of colored objects.
   nothing spans full-bleed. everything piles up. 
   fonts: bungee / bricolage grotesque / space mono (all preloaded). */

function i2Sw(list) {
  return `<div class="i2-swrow">${list.map(([n, c, fg]) => `
    <div class="i2-sw" style="background:${c};color:${fg || 'var(--ink)'}">${n}<br><b>${c}</b></div>`).join('')}</div>`;
}

function i2Cell(m, state = '', score = false, sc) {
  const stickers = ['var(--sA)','var(--sB)','var(--sC)','var(--sD)','var(--sE)','var(--sF)'];
  const scolor = sc || stickers[parseInt(m.vec) % 6];
  const bands = {
    match: `<div class="i2-band" style="background:var(--sB);color:var(--ink)">match \u00b7 ${(m.score / 100).toFixed(2)}</div>`,
    near: `<div class="i2-band" style="background:var(--sE);color:var(--ink)">near \u00b7 ${(m.score / 100).toFixed(2)}</div>`,
    dim: `<div class="i2-band" style="background:var(--mut);color:var(--paper)">low \u00b7 ${(m.score / 100).toFixed(2)}</div>`,
    selected: `<div class="i2-band" style="background:var(--sF);color:var(--paper)">selected \u2713</div>`,
  };
  return `
  <figure class="i2-cell ${state}" style="--sticker:${scolor}">
    ${bands[state] || ''}
    <div class="i2-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>
    <figcaption class="i2-cap">
      <span class="i2-idx">${m.vec}</span>
      <span class="i2-captext">${esc(m.cap)}</span>
      ${m.banger ? '<span class="i2-banger"><i></i>banger</span>' : ''}
    </figcaption>
    ${score ? `<div class="i2-score"><b>${(m.score / 100).toFixed(2)}</b><span>${m.score >= 90 ? 'closest match' : m.score >= 75 ? 'strong match' : 'related'}</span></div>` : ''}
  </figure>`;
}

function i2Console(q = 'cat losing it') {
  return `
  <div class="i2-console">
    <div class="i2-conhead"><i></i><span>zero tags. all vibes.</span><span>sticky</span></div>
    <div class="i2-conbody">
      <div class="i2-field" tabindex="0"><span class="i2-pre">\u276f</span><span class="q">${esc(q)}</span><span class="i2-caret"></span></div>
      <button class="i2-btn primary">find it</button>
    </div>
    <div class="i2-conmeta"><span>index <b>${LIB.total.toLocaleString()}</b></span><i></i><span>queued <b>${LIB.queued}</b></span><i></i><span>last <b>${LIB.latency}ms</b></span></div>
  </div>`;
}

function i2Status() {
  return `
  <div class="i2-status">
    <span><i style="background:var(--sD)"></i><b>index</b> ${LIB.total.toLocaleString()}</span>
    <span><b>model</b> ${LIB.model}</span>
    <span><b>queue</b> ${LIB.queued}</span>
    <span><b>latency</b> ${LIB.latency}ms</span>
    <span class="i2-live"><i></i>stuck</span>
  </div>`;
}

SPECS['IMPEC-2'] = (mount) => {
  css('IMPEC-2', `
  .impec2{
    --ink:#1a1a1a; --paper:#faf5f0; --paper2:#f0eae2; --mut:#8b8b8b;
    --sA:#ff44dd; --sB:#33ccff; --sC:#ffee33; --sD:#44ff66; --sE:#ff6633; --sF:#aa44ff; --alert:#e6194d;
    --stick-border:3px solid var(--ink); --stick-shadow:6px 6px 0 var(--ink);
    --disp:'Bungee',sans-serif; --body:'Bricolage Grotesque',sans-serif; --mono:'Space Mono',monospace;
    font-family:var(--body); color:var(--ink); background:var(--paper);
    min-height:100dvh; display:flex; flex-direction:column;
  }
  .impec2.theme-dark{
    --ink:#eee; --paper:#1a1a1a; --paper2:#252525; --mut:#999;
    --stick-border:3px solid var(--ink); --stick-shadow:6px 6px 0 var(--ink);
  }
  .impec2 :focus-visible{ outline:3px solid var(--sB); outline-offset:3px; border-radius:2px; }
  .impec2 .i2-wrap{ max-width:1140px; margin:0 auto; width:100%; padding:0 clamp(14px,3.5vw,44px); }

  /* masthead: sticker strip */
  .impec2 .i2-mast{ display:flex; align-items:center; gap:16px; padding:12px 0; margin:0 clamp(14px,3.5vw,44px); border-bottom:var(--stick-border); }
  .impec2 .i2-logo{ font-family:var(--disp); font-size:24px; letter-spacing:0; transform:rotate(-1deg); }
  .impec2 .i2-nav{ margin-left:auto; display:flex; gap:14px; }
  .impec2 .i2-nav a{ display:inline-block; font-family:var(--mono); font-size:11px; text-transform:uppercase; color:var(--ink); text-decoration:none; padding:10px 14px; background:var(--sC); border:var(--stick-border); box-shadow:var(--stick-shadow); }
  .impec2 .i2-nav a:hover{ transform:translate(-2px,-2px); box-shadow:8px 8px 0 var(--ink); }

  /* hero: sticker cluster */
  .impec2 .i2-hero{ padding:clamp(28px,5vw,64px) 0 clamp(24px,4vw,48px); }
  .impec2 .i2-h1{ font-family:var(--disp); font-size:clamp(38px,7vw,80px); line-height:.96; letter-spacing:-.02em; text-wrap:balance; max-width:14ch; text-transform:uppercase; }
  .impec2 .i2-h1 .hl{ background:var(--sA); color:var(--paper); display:inline-block; padding:0 8px; transform:rotate(1deg); }
  .impec2 .i2-hero p{ font-size:clamp(15px,1.8vw,19px); max-width:50ch; margin:14px 0 22px; font-weight:500; }

  /* section headers: sticker tabs */
  .impec2 .i2-sec{ padding:16px 0 12px; border-top:var(--stick-border); margin-top:clamp(30px,5vw,56px); display:flex; align-items:baseline; gap:14px; }
  .impec2 .i2-sec h2{ font-family:var(--disp); font-size:clamp(22px,3.5vw,34px); line-height:1; text-transform:uppercase; letter-spacing:0; }
  .impec2 .i2-sec h2 i{ display:inline-block; width:14px; height:14px; margin-right:8px; background:var(--sA); transform:rotate(8deg); vertical-align:middle; }
  .impec2 .i2-sec span{ margin-left:auto; font-family:var(--mono); font-size:10px; text-transform:uppercase; color:var(--mut); }
  .impec2 .i2-body{ padding:20px 0 6px; display:flex; flex-direction:column; gap:26px; }

  /* swatches + shapes */
  .impec2 .i2-swrow{ display:flex; flex-wrap:wrap; gap:6px; }
  .impec2 .i2-sw{ flex:1; min-width:96px; padding:12px 8px 10px; font-family:var(--mono); font-size:9px; border:var(--stick-border); box-shadow:var(--stick-shadow); background:var(--paper); }
  .impec2 .i2-sw b{ font-size:10px; }
  .impec2 .i2-shapes{ display:flex; gap:14px; flex-wrap:wrap; }
  .impec2 .i2-shape{ width:124px; height:76px; display:grid; place-items:center; text-align:center; font-family:var(--mono); font-size:9px; background:var(--paper2); border:var(--stick-border); box-shadow:var(--stick-shadow); }
  .impec2 .i2-shape.blue{ background:var(--sB); }
  .impec2 .i2-shape.pink{ background:var(--sA); color:var(--paper); }
  .impec2 .i2-note{ font-family:var(--mono); font-size:11px; color:var(--mut); padding-top:8px; border-top:2px dotted var(--mut); }

  /* type specimen */
  .impec2 .i2-types { display:flex; flex-direction:column; gap:12px; }
  .impec2 .i2-types .disp{ font-family:var(--disp); font-size:clamp(34px,5.5vw,52px); line-height:.96; letter-spacing:-.02em; text-transform:uppercase; }
  .impec2 .i2-types .body{ font-size:16px; max-width:58ch; }
  .impec2 .i2-types .label{ font-family:var(--mono); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .impec2 .i2-types .meta{ font-family:var(--mono); font-size:10px; color:var(--mut); }
  .impec2 .i2-types .tab{ font-family:var(--mono); font-size:24px; font-variant-numeric:tabular-nums; }
  .impec2 .i2-types .capln{ font-size:13px; max-width:44ch; padding-top:8px; border-top:2px dotted var(--ink); }

  /* console: sticky note */
  .impec2 .i2-console{ border:var(--stick-border); box-shadow:var(--stick-shadow); background:var(--sC); color:var(--ink); transform:rotate(-.5deg); }
  .impec2 .i2-conhead{ display:flex; align-items:center; gap:10px; padding:8px 14px; font-family:var(--mono); font-size:10px; text-transform:uppercase; border-bottom:var(--stick-border); background:color-mix(in srgb, var(--sC) 80%, var(--ink)); }
  .impec2 .i2-conhead i{ width:10px; height:10px; background:var(--sA); border:2px solid var(--ink); }
  .impec2 .i2-conhead span:last-child{ margin-left:auto; }
  .impec2 .i2-conbody{ display:flex; gap:10px; padding:14px; align-items:stretch; }
  .impec2 .i2-field{ flex:1; display:flex; align-items:center; gap:10px; border:var(--stick-border); padding:11px 14px; font-family:var(--mono); font-size:14px; background:var(--paper); min-height:48px; }
  .impec2 .i2-pre{ color:var(--sA); font-weight:700; font-size:16px; }
  .impec2 .i2-caret{ width:9px; height:18px; background:var(--sA); animation:i2blink 1s steps(1) infinite; }
  @keyframes i2blink{ 50%{ opacity:0; } }
  .impec2 .i2-conmeta{ display:flex; align-items:center; gap:10px; padding:8px 14px; border-top:var(--stick-border); font-family:var(--mono); font-size:10px; }
  .impec2 .i2-conmeta i{ width:4px; height:4px; background:var(--ink); border-radius:50%; }

  /* buttons: sticker tabs */
  .impec2 .i2-btn{ display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:48px; padding:10px 20px; border:var(--stick-border); background:var(--paper); color:var(--ink); font-family:var(--mono); font-weight:700; font-size:12px; text-transform:uppercase; box-shadow:var(--stick-shadow); transition:transform 120ms cubic-bezier(.16,1,.3,1), box-shadow 120ms cubic-bezier(.16,1,.3,1); }
  .impec2 .i2-btn:hover{ transform:translate(-3px,-3px); box-shadow:9px 9px 0 var(--ink); }
  .impec2 .i2-btn:active{ transform:translate(3px,3px); box-shadow:3px 3px 0 var(--ink); }
  .impec2 .i2-btn.primary{ background:var(--sA); color:var(--paper); border-color:var(--sA); box-shadow:6px 6px 0 var(--ink); }
  .impec2 .i2-btn.primary:hover{ background:color-mix(in srgb, var(--sA) 85%, var(--ink)); }
  .impec2 .i2-btn.compact{ min-height:38px; padding:6px 12px; font-size:10px; }
  .impec2 .i2-btn.icon{ min-height:38px; width:38px; padding:0; }

  /* tag sticker + banger */
  .impec2 .i2-tag{ display:inline-flex; align-items:center; gap:7px; font-family:var(--mono); font-size:11px; padding:5px 10px; border:var(--stick-border); background:var(--sB); color:var(--ink); box-shadow:4px 4px 0 var(--ink); transform:rotate(.8deg); }
  .impec2 .i2-tag i{ width:8px; height:8px; background:var(--sA); border:2px solid var(--ink); }
  .impec2 .i2-banger{ display:inline-flex; align-items:center; gap:5px; flex:none; font-family:var(--mono); font-size:9px; font-weight:700; text-transform:uppercase; }
  .impec2 .i2-banger i{ width:8px; height:8px; background:var(--sA); border:2px solid var(--ink); transform:scale(1.2); }

  /* meme cell: sticker */
  .impec2 .i2-cell{ border:var(--stick-border); background:var(--sticker,var(--sC)); box-shadow:var(--stick-shadow); position:relative; }
  .impec2 .i2-cell .i2-art{ background:var(--paper); margin:2px; display:grid; place-items:center; overflow:hidden; }
  .impec2 .i2-cell .meme-media{ background:var(--paper); }
  .impec2 .i2-band{ font-family:var(--mono); font-size:9px; text-transform:uppercase; padding:4px 9px; margin:2px 2px 0; font-weight:700; }
  .impec2 .i2-cap{ display:flex; align-items:baseline; gap:8px; padding:7px 9px; font-size:12px; line-height:1.35; margin:0 2px 2px; background:var(--paper); flex:1; }
  .impec2 .i2-idx{ font-family:var(--mono); font-size:9px; color:var(--mut); flex:none; }
  .impec2 .i2-captext{ flex:1; font-weight:500; }
  .impec2 .i2-score{ display:flex; justify-content:space-between; padding:5px 9px; font-family:var(--mono); font-size:9px; text-transform:uppercase; background:var(--sC); color:var(--ink); margin:0 2px 2px; border-top:2px solid var(--ink); }
  .impec2 .i2-cell.match{ box-shadow:0 0 0 3px var(--sB), 6px 6px 0 var(--ink); }
  .impec2 .i2-cell.near{ box-shadow:0 0 0 3px var(--sE), 6px 6px 0 var(--ink); }
  .impec2 .i2-cell.dim .i2-art, .impec2 .i2-cell.dim .i2-cap{ opacity:.45; filter:grayscale(.5); }
  .impec2 .i2-cell.selected{ border:5px solid var(--sF); }
  .impec2 .i2-load{ display:flex; align-items:center; justify-content:center; gap:8px; font-family:var(--mono); font-size:10px; color:var(--mut); background:repeating-linear-gradient(45deg, var(--paper2), var(--paper2) 10px, var(--paper) 10px, var(--paper) 20px); min-height:60px; }
  .impec2 .i2-err{ background:var(--alert); color:#fff; font-family:var(--mono); font-size:10px; text-transform:uppercase; padding:4px 8px; margin:2px 2px 0; }

  /* stat blocks: sticker blocks */
  .impec2 .i2-stat{ border:var(--stick-border); background:var(--paper2); box-shadow:var(--stick-shadow); padding:10px 12px; min-width:146px; transform:rotate(.5deg); }
  .impec2 .i2-stat .v{ font-family:var(--disp); font-size:40px; line-height:1; font-variant-numeric:tabular-nums; }
  .impec2 .i2-stat .l{ font-family:var(--mono); font-size:10px; color:var(--mut); text-transform:uppercase; }
  .impec2 .i2-stat .l i{ display:inline-block; width:7px; height:7px; margin-right:5px; background:var(--sD); }

  /* status bar: sticker strip */
  .impec2 .i2-status{ display:flex; flex-wrap:wrap; gap:0; border:var(--stick-border); background:var(--ink); color:var(--paper); font-family:var(--mono); font-size:10px; }
  .impec2 .i2-status > span{ padding:8px 12px; display:flex; gap:7px; align-items:center; border-right:2px solid var(--mut); }
  .impec2 .i2-status b{ font-weight:400; opacity:.6; text-transform:uppercase; }
  .impec2 .i2-status i{ width:8px; height:8px; display:inline-block; }
  .impec2 .i2-live i{ background:var(--sD); }
  .impec2 .i2-live i::after{ content:''; display:block; width:100%; height:100%; background:var(--sD); opacity:.4; animation:i2pulse 1.4s ease-in-out infinite; }
  @keyframes i2pulse{ 0%,100%{ opacity:.4; } 50%{ opacity:1; } }

  /* tabs: sticker row */
  .impec2 .i2-tabs{ display:flex; gap:0; }
  .impec2 .i2-tab{ background:var(--paper2); border:var(--stick-border); padding:10px 16px; font-family:var(--mono); font-size:12px; color:var(--ink); min-height:44px; margin:0 -1px; position:relative; }
  .impec2 .i2-tab.on{ background:var(--sA); color:var(--paper); z-index:1; box-shadow:var(--stick-shadow); transform:translateY(-2px); }
  .impec2 .i2-toast{ display:inline-flex; align-items:center; gap:10px; background:var(--sD); color:var(--ink); border:var(--stick-border); padding:10px 16px; font-family:var(--mono); font-size:11px; font-weight:700; box-shadow:4px 4px 0 var(--ink); transform:rotate(.4deg); }
  .impec2 .i2-toast i{ width:10px; height:10px; background:var(--ink); display:inline-block; }

  /* empty state */
  .impec2 .i2-empty{ background:var(--paper2); border:var(--stick-border); padding:28px; display:flex; flex-direction:column; gap:12px; align-items:flex-start; box-shadow:6px 6px 0 var(--mut); }
  .impec2 .i2-empty h3{ font-family:var(--disp); font-size:28px; line-height:1; text-transform:uppercase; }
  .impec2 .i2-empty p{ font-size:14px; max-width:36ch; }
  .impec2 .i2-empty .tape{ width:40px; height:6px; background:var(--sC); border:2px solid var(--ink); transform:rotate(-3deg); margin-bottom:4px; }

  /* grids */
  .impec2 .i2-grid{ display:grid; gap:16px; grid-template-columns:repeat(4,1fr); }
  .impec2 .i2-row{ display:flex; gap:12px; flex-wrap:wrap; align-items:center; }

  /* motion demos */
  .impec2 .i2-motion{ background:var(--sB); padding-bottom:36px; color:var(--ink); }
  .impec2 .i2-sticker-demo{ display:inline-block; position:relative; }
  .impec2 .i2-stamp{ opacity:0; transform:scale(1.4) rotate(-8deg); transition:opacity 220ms cubic-bezier(.16,1,.3,1), transform 220ms cubic-bezier(.16,1,.3,1); }
  .impec2 .i2-stamp.go{ opacity:1; transform:scale(1) rotate(-2deg); }
  .impec2 .i2-bounce{ transition:transform 340ms cubic-bezier(.34,1.56,.64,1); }
  .impec2 .i2-bounce.go{ transform:translateY(-8px); }
  .impec2 .i2-tapedemo{ transition:transform 200ms cubic-bezier(.16,1,.3,1); }
  .impec2 .i2-tapedemo:hover{ transform:translateY(-4px) rotate(2deg); }

  /* compositions */
  .impec2 .i2-bench{ border:var(--stick-border); background:var(--paper); }
  .impec2 .i2-benchhead{ display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:var(--stick-border); }
  .impec2 .i2-benchhead .i2-field{ min-height:40px; padding:8px 12px; font-size:12px; max-width:380px; }
  .impec2 .i2-benchbody{ display:flex; gap:0; }
  .impec2 .i2-rail{ width:200px; flex:none; border-right:var(--stick-border); padding:4px; background:var(--paper2); }
  .impec2 .i2-pile{ display:flex; justify-content:space-between; width:100%; text-align:left; background:none; border:var(--stick-border); color:var(--ink); padding:8px 10px; font-family:var(--mono); font-size:11px; margin-bottom:4px; min-height:40px; }
  .impec2 .i2-pile:hover{ transform:translate(-2px,-2px); box-shadow:4px 4px 0 var(--ink); }
  .impec2 .i2-pile.on{ background:var(--sA); color:var(--paper); font-weight:700; box-shadow:var(--stick-shadow); }
  .impec2 .i2-phone{ width:390px; max-width:100%; border:var(--stick-border); background:var(--paper); }
  .impec2 .i2-phhead{ display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-bottom:var(--stick-border); }
  .impec2 .i2-phbody{ display:flex; flex-direction:column; gap:10px; padding:12px; }
  .impec2 .i2-phgrid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .impec2 .i2-dock{ display:flex; border-top:var(--stick-border); background:var(--ink); }
  .impec2 .i2-dock button{ flex:1; min-height:50px; background:none; border:0; color:var(--paper); font-family:var(--mono); font-size:10px; text-transform:uppercase; border-right:2px solid var(--mut); }
  .impec2 .i2-dock button:last-child{ border-right:0; }
  .impec2 .i2-dock button.on{ background:var(--sA); color:var(--paper); font-weight:700; }

  @media (max-width:700px){
    .impec2 .i2-grid{ grid-template-columns:repeat(2,1fr); gap:12px; }
    .impec2 .i2-conbody{ flex-direction:column; }
    .impec2 .i2-benchbody{ flex-direction:column; }
    .impec2 .i2-rail{ width:100%; border-right:0; border-bottom:var(--stick-border); }
    .impec2 .i2-nav{ gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    .impec2 .i2-nav a{ font-size:10px; padding:7px 10px; }
    .impec2 .i2-field{ font-size:13px; }
  }
  @media (prefers-reduced-motion:reduce){
    .impec2 *, .impec2 *::before, .impec2 *::after{ animation:none !important; transition:none !important; }
    .impec2 .i2-stamp{ transform:none; opacity:1; }
    .impec2 .i2-bounce{ transform:none; }
    .impec2 .i2-tapedemo{ transform:none; }
    .impec2 .i2-live i::after{ display:none; }
  }`);

  const M = MEMES;
  mount.innerHTML = `
  <div class="impec2">
    <div class="i2-mast">
      <span class="i2-logo">sploot</span>
      <nav class="i2-nav"><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </div>

    <div class="i2-hero i2-wrap">
      <h1 class="i2-h1">type words.<br>get the <span class="hl">picture</span>.</h1>
      <p>sploot is your private meme archive with semantic search. no folders. just vibes.</p>
      ${i2Console()}
    </div>

    <div class="i2-wrap i2-grid">${M.slice(0, 4).map((x, i) => i2Cell(x, i === 0 ? 'match' : '', i === 0)).join('')}</div>

    <div class="i2-wrap">
      <div class="i2-sec"><h2><i></i>foundations</h2><span>tokens \u00b7 shape \u00b7 rhythm</span></div>
    </div>
    <div class="i2-wrap i2-body">
      ${i2Sw([['ink', '#1a1a1a', '#fff'], ['paper', '#faf5f0', '#1a1a1a'], ['paper 2', '#f0eae2', '#1a1a1a'], ['sticker A', '#ff44dd', '#fff'], ['sticker B', '#33ccff', '#1a1a1a'], ['sticker C', '#ffee33', '#1a1a1a'], ['sticker D', '#44ff66', '#1a1a1a'], ['sticker E', '#ff6633', '#1a1a1a'], ['sticker F', '#aa44ff', '#fff']])}
      <div class="i2-shapes">
        <div class="i2-shape">3px border \u00b7 every sticker</div>
        <div class="i2-shape" style="border-width:5px">5px \u00b7 selected</div>
        <div class="i2-shape" style="box-shadow:4px 4px 0 var(--ink)">small shadow</div>
        <div class="i2-shape" style="box-shadow:var(--stick-shadow)">std shadow</div>
        <div class="i2-shape" style="transform:rotate(-2deg)">rotated sticker</div>
        <div class="i2-shape pink" style="box-shadow:6px 6px 0 var(--sA)">colored shadow</div>
        <div class="i2-shape blue" style="transform:rotate(1.5deg)">lean right</div>
      </div>
      <p class="i2-note">spacing: 8px step inside stickers, 16\u201326px between them. density comes from counting the stickers, not filling the gaps.</p>
    </div>

    <div class="i2-wrap">
      <div class="i2-sec"><h2><i></i>type</h2><span>bungee \u00b7 bricolage grotesque \u00b7 space mono</span></div>
    </div>
    <div class="i2-wrap i2-body">
      <div class="i2-types">
        <div class="disp">shuffle the pile</div>
        <div class="body">body is bricolage grotesque. the archive sorts itself into piles while you sleep, and nothing asks you to name a folder.</div>
        <div class="label">label \u00b7 space mono uppercase</div>
        <div class="meta">metadata \u00b7 vec 0413 \u00b7 siglip-base \u00b7 212ms</div>
        <div class="tab">1,482 \u00b7 0.94 \u00b7 212ms</div>
        <div class="capln">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me is now framed above my desk like a diploma.</div>
      </div>
    </div>

    <div class="i2-wrap">
      <div class="i2-sec"><h2><i></i>the kit</h2><span>every component, every state</span></div>
    </div>
    <div class="i2-wrap i2-body">
      ${i2Console('sad frog')}
      <div class="i2-grid">
        ${i2Cell(M[1])}
        ${i2Cell(M[0], 'match', true)}
        ${i2Cell(M[2], 'near')}
        ${i2Cell(M[3], 'dim')}
      </div>
      <div class="i2-grid">
        ${i2Cell(M[4], 'selected')}
        <figure class="i2-cell"><div class="i2-band" style="background:var(--paper2);color:var(--mut)">embedding \u00b7 queue 2</div><div class="i2-load" style="aspect-ratio:1/1"><span>loading</span></div><figcaption class="i2-cap"><span class="i2-idx">wait</span><span class="i2-captext">loading state</span></figcaption></figure>
        <figure class="i2-cell"><div class="i2-err">embed failed \u00b7 err 500</div><div class="i2-load" style="aspect-ratio:1/1;background:var(--paper)"><span style="font-family:var(--mono);font-size:11px">the model looked away.</span></div><figcaption class="i2-cap"><span class="i2-captext">error state</span><button class="i2-btn compact">retry</button></figcaption></figure>
        <div class="i2-empty">
          <div class="tape"></div>
          <h3>the pile is empty.</h3>
          <p>zero thoughts. that changes the second you upload chaos.</p>
          <button class="i2-btn primary">upload chaos</button>
        </div>
      </div>
      <div class="i2-row">
        <button class="i2-btn primary">find it</button>
        <button class="i2-btn">shuffle the pile</button>
        <button class="i2-btn compact">compact</button>
        <button class="i2-btn icon" aria-label="close">\u2715</button>
        <span class="i2-tag"><i></i>cats being unwell</span>
        <span class="i2-banger"><i></i>banger</span>
      </div>
      <div class="i2-row">
        <div class="i2-field" style="max-width:320px;min-height:44px"><span class="i2-pre">\u276f</span><span class="q">text input</span><span class="i2-caret"></span></div>
        <div class="i2-tabs"><button class="i2-tab on">all</button><button class="i2-tab">bangers</button><button class="i2-tab">recent</button></div>
        <div class="i2-toast"><i></i>saved to the pile</div>
      </div>
      <div class="i2-row" style="gap:30px;align-items:flex-end">
        <div class="i2-stat"><div class="v">0</div><div class="l"><i></i>folders required</div></div>
        <div class="i2-stat" style="background:var(--sC);transform:rotate(-.4deg)"><div class="v">1,482</div><div class="l"><i></i>memes indexed</div></div>
        <div class="i2-stat" style="background:var(--sA);color:var(--paper);transform:rotate(.7deg)"><div class="v">37</div><div class="l" style="color:var(--paper)"><i></i>bangers</div></div>
      </div>
      ${i2Status()}
    </div>

    <div class="i2-wrap">
      <div class="i2-sec"><h2><i></i>motion</h2><span>sticker peel \u00b7 bounce \u00b7 stamp</span></div>
    </div>
    <div class="i2-motion">
      <div class="i2-wrap i2-body">
        <div class="i2-row" style="align-items:flex-start">
          <button class="i2-btn" id="i2-stickbtn">\u2713 stamp it <b id="i2-stampn">0</b></button>
          <button class="i2-btn" id="i2-revealstamp">reveal sticker</button>
          <div class="i2-sticker-demo">
            <span class="i2-tag i2-stamp" id="i2-stampel" style="font-size:14px;padding:10px 18px"><i></i>certified banger</span>
          </div>
          <button class="i2-btn" id="i2-bouncebtn">bounce demo</button>
          <span class="i2-tag i2-bounce" id="i2-bounceel" style="transition:transform 340ms cubic-bezier(.34,1.56,.64,1);display:inline-flex"><i></i>hello sticker</span>
        </div>
        <p class="i2-note" style="margin-top:14px">reduced-motion: all sticker animations become instant static placement. no peel, no bounce, no stamp.</p>
      </div>
    </div>

    <div class="i2-wrap">
      <div class="i2-sec"><h2><i></i>compositions</h2><span>workbench \u00b7 phone</span></div>
    </div>
    <div class="i2-wrap i2-body" style="padding-bottom:48px">
      <div class="i2-bench">
        <div class="i2-benchhead">
          <span class="i2-logo" style="font-size:16px">sploot</span>
          <div class="i2-field" tabindex="0" style="flex:1"><span class="i2-pre">\u276f</span><span>search the pile</span></div>
          <nav class="i2-nav" style="margin-left:auto"><a href="#0">upload</a><a href="#0">bangers</a><a href="#0">shuffle</a></nav>
        </div>
        <div class="i2-benchbody">
          <div class="i2-rail">${PILES.map((p, i) => `<button class="i2-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}</div>
          <div class="i2-grid" style="flex:1;padding:12px;gap:12px">${M.slice(0, 8).map(x => i2Cell(x)).join('')}</div>
        </div>
        ${i2Status()}
      </div>
      <div class="i2-phone">
        <div class="i2-phhead"><span class="i2-logo" style="font-size:14px">sploot</span><span class="i2-note" style="margin:0">1,482 vec</span></div>
        <div class="i2-phbody">
          <div class="i2-field" style="min-height:44px"><span class="i2-pre">\u276f</span><span>cat losing it</span><span class="i2-caret"></span></div>
          <div class="i2-phgrid">${M.slice(0, 4).map(x => i2Cell(x)).join('')}</div>
        </div>
        <div class="i2-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'quantized sticker bomb'], ['type', 'bungee / bricolage grotesque / space mono'], ['move', 'every element is an independent sticker; the page collects, never spans'], ['density', 'high, objects pile and overlap'], ['motion', 'sticker stamp peel bounce, interaction only']])}
    </div>
  </div>`;

  themeToggle(mount.querySelector('.impec2'));
  const stampBtn = mount.querySelector('#i2-stickbtn');
  const stampN = mount.querySelector('#i2-stampn');
  let n2 = 0;
  if (stampBtn) stampBtn.onclick = () => { n2 += 1; stampN.textContent = n2; };
  const revSt = mount.querySelector('#i2-revealstamp');
  const stEl = mount.querySelector('#i2-stampel');
  if (revSt && stEl) revSt.onclick = () => { stEl.classList.remove('go'); void stEl.offsetWidth; stEl.classList.add('go'); };
  const bounceBtn = mount.querySelector('#i2-bouncebtn');
  const bounceEl = mount.querySelector('#i2-bounceel');
  if (bounceBtn && bounceEl) bounceBtn.onclick = () => { bounceEl.classList.remove('go'); void bounceEl.offsetWidth; bounceEl.classList.add('go'); };
};

})();

(() => {

/* ============================================================ IMPEC-3
   phosphor scoreboard. system rule: the interface IS its machinery; every
   metric, wire, and panel is visible. deep recessed panels hold glowing
   phosphor readouts. maximalism = technical maximalism: showing everything.
   fonts: unbounded / vt323 / space grotesk (all preloaded). */

function i3Sw(list) {
  return `<div class="i3-swrow">${list.map(([n, c, fg]) => `
    <div class="i3-sw" style="background:${c};color:${fg || 'var(--ink)'}">${n}<br><b>${c}</b></div>`).join('')}</div>`;
}

function i3Cell(m, state = '', score = false) {
  const bands = {
    match: `<div class="i3-band" style="background:var(--p-cyan);color:var(--panel)">match \u00b7 ${(m.score / 100).toFixed(2)}</div>`,
    near: `<div class="i3-band" style="background:var(--p-amber);color:var(--panel)">near \u00b7 ${(m.score / 100).toFixed(2)}</div>`,
    dim: `<div class="i3-band" style="background:var(--panel-light);color:var(--mut)">low \u00b7 ${(m.score / 100).toFixed(2)}</div>`,
    selected: `<div class="i3-band" style="background:var(--p-magenta);color:var(--paper)">selected \u2713</div>`,
  };
  return `
  <figure class="i3-cell ${state}">
    ${bands[state] || ''}
    <div class="i3-screen" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>
    <figcaption class="i3-cap">
      <span class="i3-vec">vec ${m.vec}</span>
      <span class="i3-captext">${esc(m.cap)}</span>
      ${m.banger ? '<span class="i3-banger"><i></i>banger</span>' : ''}
    </figcaption>
    ${score ? `<div class="i3-score"><b class="i3-gl">${(m.score / 100).toFixed(2)}</b><span>${m.score >= 90 ? 'closest match' : m.score >= 75 ? 'strong match' : 'related'}</span></div>` : ''}
  </figure>`;
}

function i3Console(q = 'cat losing it') {
  return `
  <div class="i3-console">
    <div class="i3-conhead"><span class="i3-gl i3-glg">sploot shell</span><span>v3.1.4</span><span class="i3-flex"></span><span class="i3-led"></span><span class="i3-led amber"></span><span class="i3-led red"></span></div>
    <div class="i3-conbody">
      <div class="i3-prompt"><span class="i3-gl i3-glg">$</span></div>
      <div class="i3-field" tabindex="0"><span class="q">${esc(q)}</span><span class="i3-caret"></span></div>
      <button class="i3-btn primary">search</button>
    </div>
    <div class="i3-conmeta">
      <span><b class="i3-glg">idx</b> ${LIB.total.toLocaleString()}</span>
      <span><b class="i3-gla">q</b> ${LIB.queued}</span>
      <span><b class="i3-glc">rt</b> ${LIB.latency}ms</span>
      <span><b>model</b> ${LIB.model}</span>
      <span class="i3-flex"></span>
      <span class="i3-led" style="--led:var(--p-green)"></span>online
    </div>
  </div>`;
}

function i3Status() {
  return `
  <div class="i3-status">
    <div class="i3-stcell"><span class="i3-stl">index</span><span class="i3-stv i3-gl i3-glc">${LIB.total.toLocaleString()}</span></div>
    <div class="i3-stcell"><span class="i3-stl">model</span><span class="i3-stv">${LIB.model}</span></div>
    <div class="i3-stcell"><span class="i3-stl">queue</span><span class="i3-stv i3-gl i3-gla">${LIB.queued}</span></div>
    <div class="i3-stcell"><span class="i3-stl">latency</span><span class="i3-stv i3-gl i3-glc">${LIB.latency}ms</span></div>
    <div class="i3-stcell"><span class="i3-stl">status</span><span class="i3-stv"><i class="i3-led" style="--led:var(--p-green)"></i>live</span></div>
  </div>`;
}

SPECS['IMPEC-3'] = (mount) => {
  css('IMPEC-3', `
  .impec3{
    --ink:#0d1117; --paper:#e6e9ef; --panel:#1f2937; --panel-light:#d1d5db;
    --p-green:#00ff41; --p-amber:#ffb000; --p-cyan:#00d4ff; --p-magenta:#ff00aa; --p-red:#ff3355; --mut:#6b7280;
    --bezel:4px solid var(--ink); --well:inset 0 2px 8px rgba(0,0,0,.35),inset 0 0 0 1px rgba(0,0,0,.15);
    --glow-g:0 0 8px color-mix(in srgb, var(--p-green) 50%, transparent),0 0 2px var(--p-green);
    --glow-a:0 0 8px color-mix(in srgb, var(--p-amber) 50%, transparent),0 0 2px var(--p-amber);
    --glow-c:0 0 8px color-mix(in srgb, var(--p-cyan) 50%, transparent),0 0 2px var(--p-cyan);
    --disp:'Unbounded',sans-serif; --crt:'VT323',monospace; --body:'Space Grotesk',sans-serif;
    font-family:var(--body); color:var(--ink);
    min-height:100dvh; display:flex; flex-direction:column;
  }
  .impec3.theme-dark{
    --ink:#e6e9ef; --paper:#0d1117; --panel:#161b22; --panel-light:#1a1d23;
    --bezel:4px solid var(--ink); --well:inset 0 2px 8px rgba(0,0,0,.5),inset 0 0 0 1px rgba(0,0,0,.3);
    --glow-g:0 0 8px color-mix(in srgb, var(--p-green) 60%, transparent),0 0 2px var(--p-green);
    --glow-a:0 0 8px color-mix(in srgb, var(--p-amber) 60%, transparent),0 0 2px var(--p-amber);
    --glow-c:0 0 8px color-mix(in srgb, var(--p-cyan) 60%, transparent),0 0 2px var(--p-cyan);
  }
  .impec3 :focus-visible{ outline:3px solid var(--p-cyan); outline-offset:3px; border-radius:4px; }
  .impec3 .i3-wrap{ max-width:1160px; margin:0 auto; width:100%; padding:0 clamp(14px,3.5vw,44px); }

  .impec3 .i3-gl{ text-shadow:var(--glow-g); }
  .impec3 .i3-glc{ text-shadow:var(--glow-c); }
  .impec3 .i3-gla{ text-shadow:var(--glow-a); }
  .impec3 .i3-glg{ text-shadow:var(--glow-g); }

  /* masthead */
  .impec3 .i3-mast{ display:flex; align-items:center; gap:18px; padding:10px clamp(14px,3.5vw,44px); border-bottom:var(--bezel); background:var(--panel); }
  .impec3 .i3-mast-left{ display:flex; align-items:center; gap:12px; }
  .impec3 .i3-logo{ font-family:var(--disp); font-size:22px; letter-spacing:0; color:var(--p-cyan); }
  .impec3 .i3-mastnav{ display:flex; gap:16px; margin-left:auto; }
  .impec3 .i3-mastnav a{ font-family:var(--crt); font-size:14px; color:var(--ink); text-decoration:none; }
  .impec3 .i3-mastnav a:hover{ color:var(--p-cyan); text-shadow:var(--glow-c); }

  /* hero panel */
  .impec3 .i3-hero{ padding:clamp(28px,5vw,56px) 0; }
  .impec3 .i3-hero .i3-panel{ background:var(--panel); border:var(--bezel); box-shadow:var(--well); padding:clamp(20px,3vw,36px) clamp(20px,3vw,36px); }
  .impec3 .i3-hero .i3-panel h1{ font-family:var(--disp); font-size:clamp(34px,6vw,68px); line-height:.92; letter-spacing:-.02em; text-wrap:balance; max-width:14ch; }
  .impec3 .i3-hero .i3-panel h1 .gl{ color:var(--p-green); text-shadow:var(--glow-g); }
  .impec3 .i3-hero .i3-panel .gl{ color:var(--p-cyan); text-shadow:var(--glow-c); }
  .impec3 .i3-hero .i3-panel p{ font-size:clamp(15px,1.8vw,19px); max-width:52ch; margin:12px 0 20px; font-family:var(--crt); line-height:1.5; }

  /* section headers */
  .impec3 .i3-sec{ padding:10px 0; margin-top:clamp(30px,5vw,48px); display:flex; align-items:center; gap:14px; border-bottom:var(--bezel); background:var(--panel); padding:8px clamp(14px,3.5vw,44px); }
  .impec3 .i3-sec h2{ font-family:var(--disp); font-size:clamp(16px,2.5vw,24px); line-height:1; font-weight:400; text-transform:uppercase; letter-spacing:.04em; }
  .impec3 .i3-sec h2 i{ display:inline-block; width:8px; height:8px; background:var(--p-cyan); margin-right:8px; vertical-align:middle; }
  .impec3 .i3-sec .i3-tagline{ margin-left:auto; font-family:var(--crt); font-size:12px; color:var(--mut); }

  .impec3 .i3-body{ padding:22px 0 8px; display:flex; flex-direction:column; gap:24px; }

  /* swatches as panel readouts */
  .impec3 .i3-swrow{ display:flex; flex-wrap:wrap; gap:2px; }
  .impec3 .i3-sw{ flex:1; min-width:80px; padding:10px 6px 8px; font-family:var(--crt); font-size:12px; text-align:center; border:1px solid rgba(255,255,255,.15); }
  .impec3 .i3-sw b{ display:block; font-family:var(--mono); font-size:8px; font-weight:400; text-transform:uppercase; }
  .impec3 .i3-shapes{ display:flex; gap:12px; flex-wrap:wrap; }
  .impec3 .i3-shape{ width:118px; height:68px; display:grid; place-items:center; text-align:center; font-family:var(--crt); font-size:11px; background:var(--panel); border:var(--bezel); box-shadow:var(--well); }
  .impec3 .i3-note{ font-family:var(--crt); font-size:12px; color:var(--mut); }

  /* type specimen */
  .impec3 .i3-types{ display:flex; flex-direction:column; gap:12px; }
  .impec3 .i3-types .disp{ font-family:var(--disp); font-size:clamp(30px,5vw,46px); line-height:.94; letter-spacing:-.02em; }
  .impec3 .i3-types .body{ font-size:16px; max-width:58ch; }
  .impec3 .i3-types .label{ font-family:var(--crt); font-size:15px; color:var(--p-green); text-shadow:var(--glow-g); }
  .impec3 .i3-types .meta{ font-family:var(--crt); font-size:13px; color:var(--mut); }
  .impec3 .i3-types .tab{ font-family:var(--crt); font-size:28px; font-variant-numeric:tabular-nums; }
  .impec3 .i3-types .capln{ font-size:13px; max-width:44ch; padding-top:8px; border-top:1px solid var(--p-cyan); }

  /* console: terminal panel */
  .impec3 .i3-console{ background:var(--panel); border:var(--bezel); box-shadow:var(--well); overflow:hidden; }
  .impec3 .i3-conhead{ display:flex; align-items:center; gap:12px; padding:8px 14px; background:rgba(0,0,0,.3); font-family:var(--crt); font-size:13px; border-bottom:1px solid rgba(255,255,255,.08); }
  .impec3 .i3-flex{ flex:1; }
  .impec3 .i3-led{ width:9px; height:9px; --led:var(--p-green); background:var(--led); border-radius:50%; box-shadow:0 0 6px var(--led); display:inline-block; }
  .impec3 .i3-led.amber{ --led:var(--p-amber); }
  .impec3 .i3-led.red{ --led:var(--p-red); }
  .impec3 .i3-conbody{ display:flex; gap:0; align-items:stretch; padding:14px; }
  .impec3 .i3-prompt{ display:flex; align-items:center; padding:0 12px 0 0; font-family:var(--crt); font-size:18px; }
  .impec3 .i3-field{ flex:1; display:flex; align-items:center; gap:10px; background:rgba(0,0,0,.35); padding:10px 14px; font-family:var(--crt); font-size:18px; min-height:48px; color:var(--p-green); text-shadow:var(--glow-g); border:1px solid rgba(255,255,255,.08); }
  .impec3 .i3-caret{ width:10px; height:22px; background:var(--p-green); box-shadow:var(--glow-g); animation:i3blink 1.1s steps(1) infinite; }
  @keyframes i3blink{ 50%{ opacity:0; } }
  .impec3 .i3-conmeta{ display:flex; align-items:center; gap:16px; padding:7px 14px; border-top:1px solid rgba(255,255,255,.08); font-family:var(--crt); font-size:13px; }
  .impec3 .i3-conmeta b{ font-weight:400; }

  /* buttons: chunky arcade keys */
  .impec3 .i3-btn{ display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:48px; padding:10px 22px; border:var(--bezel); background:var(--panel); color:var(--ink); font-family:var(--crt); font-size:16px; box-shadow:var(--well); transition:transform 80ms ease-out, box-shadow 80ms ease-out; position:relative; }
  .impec3 .i3-btn::after{ content:''; position:absolute; inset:0; background:rgba(255,255,255,.05); opacity:0; transition:opacity 80ms; }
  .impec3 .i3-btn:hover::after{ opacity:1; }
  .impec3 .i3-btn:active{ transform:translateY(3px); box-shadow:inset 0 2px 8px rgba(0,0,0,.5); }
  .impec3 .i3-btn.primary{ background:var(--p-cyan); color:var(--panel); border-color:var(--p-cyan); box-shadow:0 0 12px color-mix(in srgb, var(--p-cyan) 40%, transparent), var(--bezel); }
  .impec3 .i3-btn.primary:active{ box-shadow:inset 0 2px 8px rgba(0,0,0,.4), 0 0 8px color-mix(in srgb, var(--p-cyan) 30%, transparent); }
  .impec3 .i3-btn.compact{ min-height:38px; padding:6px 14px; font-size:14px; }
  .impec3 .i3-btn.iconb{ min-height:38px; width:38px; padding:0; }

  /* tag + banger badge */
  .impec3 .i3-tag{ display:inline-flex; align-items:center; gap:7px; font-family:var(--crt); font-size:13px; padding:4px 10px; border:var(--bezel); background:var(--panel); box-shadow:var(--well); color:var(--p-amber); }
  .impec3 .i3-tag i{ width:7px; height:7px; background:var(--p-cyan); border-radius:50%; display:inline-block; }
  .impec3 .i3-banger{ display:inline-flex; align-items:center; gap:5px; flex:none; font-family:var(--crt); font-size:12px; color:var(--p-magenta); }
  .impec3 .i3-banger i{ width:8px; height:8px; background:var(--p-magenta); border-radius:50%; box-shadow:0 0 6px var(--p-magenta); }

  /* meme cell: monitor */
  .impec3 .i3-cell{ background:var(--panel); border:var(--bezel); box-shadow:var(--well); }
  .impec3 .i3-cell .i3-screen{ background:rgba(0,0,0,.4); display:grid; place-items:center; overflow:hidden; }
  .impec3 .i3-cell .meme-media{ background:rgba(0,0,0,.4); }
  .impec3 .i3-band{ font-family:var(--crt); font-size:11px; padding:4px 10px; }
  .impec3 .i3-cap{ display:flex; align-items:baseline; gap:8px; padding:7px 10px; font-size:13px; line-height:1.35; border-top:1px solid rgba(255,255,255,.08); }
  .impec3 .i3-vec{ font-family:var(--crt); font-size:12px; color:var(--p-cyan); flex:none; }
  .impec3 .i3-captext{ flex:1; }
  .impec3 .i3-score{ display:flex; justify-content:space-between; padding:5px 10px; font-family:var(--crt); font-size:12px; border-top:1px solid rgba(255,255,255,.08); background:rgba(0,0,0,.2); }
  .impec3 .i3-cell.match{ border-color:var(--p-cyan); box-shadow:0 0 0 2px var(--p-cyan), var(--well); }
  .impec3 .i3-cell.near{ border-color:var(--p-amber); box-shadow:0 0 0 2px var(--p-amber), var(--well); }
  .impec3 .i3-cell.dim .i3-screen, .impec3 .i3-cell.dim .i3-cap{ opacity:.4; filter:grayscale(.6); }
  .impec3 .i3-cell.selected{ border:6px solid var(--p-magenta); box-shadow:0 0 12px color-mix(in srgb, var(--p-magenta) 40%, transparent), var(--well); }
  .impec3 .i3-load{ display:grid; place-items:center; min-height:60px; background:rgba(0,0,0,.4); font-family:var(--crt); font-size:14px; color:var(--p-amber); }
  .impec3 .i3-err{ background:var(--p-red); color:var(--panel); font-family:var(--crt); font-size:11px; padding:4px 10px; }

  /* stat panel */
  .impec3 .i3-stat{ background:var(--panel); border:var(--bezel); box-shadow:var(--well); padding:10px 14px; min-width:146px; }
  .impec3 .i3-stat .v{ font-family:var(--crt); font-size:38px; line-height:1; font-variant-numeric:tabular-nums; color:var(--p-green); text-shadow:var(--glow-g); }
  .impec3 .i3-stat .l{ font-family:var(--crt); font-size:12px; color:var(--mut); }

  /* status bar: machine panel */
  .impec3 .i3-status{ display:flex; flex-wrap:wrap; gap:0; background:var(--panel); border:var(--bezel); box-shadow:var(--well); }
  .impec3 .i3-stcell{ display:flex; gap:8px; align-items:center; padding:8px 14px; border-right:2px solid rgba(255,255,255,.08); }
  .impec3 .i3-stl{ font-family:var(--crt); font-size:11px; color:var(--mut); text-transform:uppercase; }
  .impec3 .i3-stv{ font-family:var(--crt); font-size:13px; display:flex; align-items:center; gap:6px; }

  /* tabs */
  .impec3 .i3-tabs{ display:flex; gap:0; background:var(--panel); border:var(--bezel); box-shadow:var(--well); }
  .impec3 .i3-tab{ background:none; border:0; padding:10px 18px; font-family:var(--crt); font-size:14px; color:var(--mut); min-height:44px; border-right:1px solid rgba(255,255,255,.08); }
  .impec3 .i3-tab.on{ color:var(--p-cyan); text-shadow:var(--glow-c); background:rgba(0,0,0,.25); }
  .impec3 .i3-toast{ display:inline-flex; align-items:center; gap:10px; background:var(--panel); border:var(--bezel); box-shadow:var(--well); padding:10px 16px; font-family:var(--crt); font-size:14px; color:var(--p-green); }
  .impec3 .i3-toast i{ width:10px; height:10px; background:var(--p-green); border-radius:50%; box-shadow:0 0 8px var(--p-green); }

  /* empty state */
  .impec3 .i3-empty{ background:var(--panel); border:var(--bezel); box-shadow:var(--well); padding:28px; display:flex; flex-direction:column; gap:14px; align-items:flex-start; }
  .impec3 .i3-empty h3{ font-family:var(--disp); font-size:24px; line-height:1; }
  .impec3 .i3-empty h3 .gl{ color:var(--p-amber); text-shadow:var(--glow-a); }
  .impec3 .i3-empty p{ font-size:14px; max-width:36ch; font-family:var(--crt); }
  .impec3 .i3-empty .i3-btn{ background:var(--p-amber); color:var(--panel); border-color:var(--p-amber); }

  /* grids */
  .impec3 .i3-grid{ display:grid; gap:16px; grid-template-columns:repeat(4,1fr); }
  .impec3 .i3-row{ display:flex; gap:12px; flex-wrap:wrap; align-items:center; }

  /* motion */
  .impec3 .i3-motion{ background:var(--panel); border-top:var(--bezel); border-bottom:var(--bezel); padding-bottom:36px; }
  .impec3 .i3-scan{ overflow:hidden; position:relative; }
  .impec3 .i3-scan::after{ content:''; position:absolute; top:0; left:-100%; width:50%; height:100%; background:linear-gradient(90deg, transparent, rgba(0,255,65,.08), transparent); transition:none; }
  .impec3 .i3-scan.scanning::after{ animation:i3scanline .5s linear; }
  @keyframes i3scanline{ 0%{ left:-100%; } 100%{ left:150%; } }
  .impec3 .i3-fade{ opacity:0; transform:translateY(6px); transition:opacity 220ms ease-out, transform 220ms ease-out; }
  .impec3 .i3-fade.show{ opacity:1; transform:none; }
  .impec3 .i3-digit{ transition:all 100ms; }
  .impec3 .i3-pulse{ transition:opacity 120ms; }

  /* compositions */
  .impec3 .i3-bench{ background:var(--panel); border:var(--bezel); box-shadow:var(--well); }
  .impec3 .i3-benchhead{ display:flex; align-items:center; gap:14px; padding:8px 14px; border-bottom:var(--bezel); }
  .impec3 .i3-benchhead .i3-field{ flex:1; max-width:400px; min-height:40px; padding:7px 12px; font-size:16px; }
  .impec3 .i3-benchbody{ display:flex; gap:0; }
  .impec3 .i3-rail{ width:200px; flex:none; border-right:var(--bezel); }
  .impec3 .i3-pile{ display:flex; justify-content:space-between; width:100%; text-align:left; background:none; border:0; border-bottom:1px solid rgba(255,255,255,.08); color:var(--ink); padding:10px 14px; font-family:var(--crt); font-size:14px; min-height:44px; }
  .impec3 .i3-pile:hover{ background:rgba(0,0,0,.15); }
  .impec3 .i3-pile.on{ color:var(--p-cyan); text-shadow:var(--glow-c); background:rgba(0,0,0,.25); }
  .impec3 .i3-phone{ width:390px; max-width:100%; border:var(--bezel); box-shadow:var(--well); background:var(--panel); }
  .impec3 .i3-phhead{ display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:var(--bezel); }
  .impec3 .i3-phhead .i3-logo{ font-size:14px; }
  .impec3 .i3-phbody{ display:flex; flex-direction:column; gap:10px; padding:12px; }
  .impec3 .i3-phgrid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .impec3 .i3-dock{ display:flex; border-top:var(--bezel); background:rgba(0,0,0,.3); }
  .impec3 .i3-dock button{ flex:1; min-height:50px; background:none; border:0; color:var(--mut); font-family:var(--crt); font-size:13px; border-right:1px solid rgba(255,255,255,.08); }
  .impec3 .i3-dock button.on{ color:var(--p-cyan); text-shadow:var(--glow-c); background:rgba(0,0,0,.25); }

  @media (max-width:700px){
    .impec3 .i3-grid{ grid-template-columns:repeat(2,1fr); gap:12px; }
    .impec3 .i3-conbody{ flex-direction:column; gap:8px; }
    .impec3 .i3-benchbody{ flex-direction:column; }
    .impec3 .i3-rail{ width:100%; border-right:0; border-bottom:var(--bezel); }
    .impec3 .i3-mastnav{ gap:8px; }
    .impec3 .i3-mastnav a{ font-size:12px; }
  }
  @media (prefers-reduced-motion:reduce){
    .impec3 *, .impec3 *::before, .impec3 *::after{ animation:none !important; transition:none !important; }
    .impec3 .i3-scan::after{ display:none; }
    .impec3 .i3-fade{ opacity:1; transform:none; }
    .impec3 .i3-caret{ opacity:1; }
    .impec3 .i3-led{ box-shadow:none; }
    .impec3 i3-gl, .impec3 .i3-glc, .impec3 .i3-gla, .impec3 .i3-glg{ text-shadow:none; }
  }`);

  const M = MEMES;
  mount.innerHTML = `
  <div class="impec3">
    <div class="i3-mast">
      <div class="i3-mast-left"><span class="i3-logo">sploot</span><span class="i3-led" style="--led:var(--p-green)"></span></div>
      <nav class="i3-mastnav"><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </div>

    <div class="i3-hero i3-wrap">
      <div class="i3-panel">
        <h1>type words.<br>get the <span class="gl">picture</span>.</h1>
        <p>sploot is your private meme archive with semantic search. no folders. just vibes. <span class="gl" style="color:var(--p-green)">the machine is sorting.</span></p>
        ${i3Console()}
      </div>
    </div>

    <div class="i3-wrap i3-grid">${M.slice(0, 4).map((x, i) => i3Cell(x, i === 0 ? 'match' : '', i === 0)).join('')}</div>

    <div class="i3-sec"><h2><i></i>foundations</h2><span class="i3-tagline">tokens \u00b7 shape \u00b7 rhythm</span></div>
    <div class="i3-wrap i3-body">
      ${i3Sw([['ink', '#0d1117', '#e6e9ef'], ['paper', '#e6e9ef', '#0d1117'], ['panel', '#1f2937', '#e6e9ef'], ['phos green', '#00ff41', '#0d1117'], ['phos amber', '#ffb000', '#0d1117'], ['phos cyan', '#00d4ff', '#0d1117'], ['phos magenta', '#ff00aa', '#0d1117'], ['phos red', '#ff3355', '#0d1117'], ['muted', '#6b7280', '#e6e9ef']])}
      <div class="i3-shapes">
        <div class="i3-shape">4px bezel<br>every panel</div>
        <div class="i3-shape" style="border-width:2px">2px \u00b7 inner</div>
        <div class="i3-shape" style="box-shadow:var(--well)">inset well<br>recessed</div>
        <div class="i3-shape" style="box-shadow:var(--well);background:var(--paper)">light well</div>
        <div class="i3-shape" style="border-radius:6px">6px r \u00b7 panel</div>
        <div class="i3-shape" style="background:var(--p-green);color:var(--panel)">phosphor</div>
      </div>
      <p class="i3-note">spacing: every element is a panel. gap between panels = 16\u201324px. inside a panel = 10\u201314px. hard grid, no surprises.</p>
    </div>

    <div class="i3-sec"><h2><i></i>typography</h2><span class="i3-tagline">unbounded \u00b7 vt323 \u00b7 space grotesk</span></div>
    <div class="i3-wrap i3-body">
      <div class="i3-types">
        <div class="disp">shuffle the pile</div>
        <div class="body">body is space grotesk. the archive sorts itself into piles while you sleep, and nothing asks you to name a folder.</div>
        <div class="label">label \u00b7 vt323 phosphor green</div>
        <div class="meta">metadata \u00b7 vec 0413 \u00b7 siglip-base \u00b7 212ms</div>
        <div class="tab i3-glc">1,482 \u00b7 0.94 \u00b7 212ms</div>
        <div class="capln">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me is now framed above my desk like a diploma.</div>
      </div>
    </div>

    <div class="i3-sec"><h2><i></i>the kit</h2><span class="i3-tagline">every component, every state</span></div>
    <div class="i3-wrap i3-body">
      ${i3Console('sad frog')}
      <div class="i3-grid">
        ${i3Cell(M[1])}
        ${i3Cell(M[0], 'match', true)}
        ${i3Cell(M[2], 'near')}
        ${i3Cell(M[3], 'dim')}
      </div>
      <div class="i3-grid">
        ${i3Cell(M[4], 'selected')}
        <figure class="i3-cell"><div class="i3-band" style="background:rgba(0,0,0,.3);color:var(--p-amber)">embedding \u00b7 queue 2</div><div class="i3-load" style="aspect-ratio:1/1">processing&hellip;</div><figcaption class="i3-cap"><span class="i3-vec">\u2316</span><span class="i3-captext">loading state</span></figcaption></figure>
        <figure class="i3-cell"><div class="i3-err">embed failed \u00b7 err 500</div><div class="i3-load" style="aspect-ratio:1/1"><span>the model looked away.</span></div><figcaption class="i3-cap"><span class="i3-captext">error state</span><button class="i3-btn compact">retry</button></figcaption></figure>
        <div class="i3-empty">
          <h3>the pile is <span class="gl">empty</span>.</h3>
          <p>zero thoughts. the terminal is waiting for your first upload.</p>
          <button class="i3-btn primary">upload chaos</button>
        </div>
      </div>
      <div class="i3-row">
        <button class="i3-btn primary">find it</button>
        <button class="i3-btn">shuffle the pile</button>
        <button class="i3-btn compact">compact</button>
        <button class="i3-btn iconb" aria-label="close">\u2715</button>
        <span class="i3-tag"><i></i>cats being unwell</span>
        <span class="i3-banger"><i></i>banger</span>
      </div>
      <div class="i3-row">
        <div class="i3-field" style="max-width:320px;min-height:44px"><span>text input</span><span class="i3-caret"></span></div>
        <div class="i3-tabs"><button class="i3-tab on">all</button><button class="i3-tab">bangers</button><button class="i3-tab">recent</button></div>
        <div class="i3-toast"><i></i>saved to the pile</div>
      </div>
      <div class="i3-row" style="gap:28px;align-items:flex-end">
        <div class="i3-stat"><div class="v">0</div><div class="l">folders required</div></div>
        <div class="i3-stat"><div class="v">1,482</div><div class="l">memes indexed</div></div>
        <div class="i3-stat"><div class="v">37</div><div class="l">bangers</div></div>
      </div>
      ${i3Status()}
    </div>

    <div class="i3-sec"><h2><i></i>motion</h2><span class="i3-tagline">scan \u00b7 phosphor fade \u00b7 digital</span></div>
    <div class="i3-motion">
      <div class="i3-wrap i3-body">
        <div class="i3-row" style="align-items:flex-start">
          <button class="i3-btn" id="i3-scanbtn">scan cell</button>
          <button class="i3-btn" id="i3-glowbtn">phosphor fade</button>
          <div class="i3-scan" id="i3-scancell" style="width:180px">${i3Cell(M[1])}</div>
          <span class="i3-toast i3-fade" id="i3-phosphor-el"><i></i>phosphor ready</span>
          <button class="i3-btn" id="i3-countbtn" style="font-family:var(--crt);font-size:28px">${LIB.total.toLocaleString()}</button>
        </div>
        <p class="i3-note">reduced-motion: all scan, glow, and digital transitions become instant state changes. the machine stops glowing and just sits there.</p>
      </div>
    </div>

    <div class="i3-sec"><h2><i></i>compositions</h2><span class="i3-tagline">workbench \u00b7 phone</span></div>
    <div class="i3-wrap i3-body" style="padding-bottom:48px">
      <div class="i3-bench">
        <div class="i3-benchhead">
          <span class="i3-logo" style="font-size:15px">sploot</span>
          <div class="i3-field" tabindex="0" style="flex:1"><span>search the pile</span></div>
          <nav class="i3-mastnav" style="margin-left:auto"><a href="#0">upload</a><a href="#0">bangers</a><a href="#0">shuffle</a></nav>
        </div>
        <div class="i3-benchbody">
          <div class="i3-rail">${PILES.map((p, i) => `<button class="i3-pile ${i === 0 ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('')}</div>
          <div class="i3-grid" style="flex:1;padding:12px;gap:12px">${M.slice(0, 8).map(x => i3Cell(x)).join('')}</div>
        </div>
        ${i3Status()}
      </div>
      <div class="i3-phone">
        <div class="i3-phhead"><span class="i3-logo">sploot</span><span style="font-family:var(--crt);font-size:13px;color:var(--p-cyan)">${LIB.total.toLocaleString()} vec</span></div>
        <div class="i3-phbody">
          <div class="i3-field" style="min-height:44px"><span>cat losing it</span><span class="i3-caret"></span></div>
          <div class="i3-phgrid">${M.slice(0, 4).map(x => i3Cell(x)).join('')}</div>
        </div>
        <div class="i3-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'phosphor scoreboard'], ['type', 'unbounded / vt323 / space grotesk'], ['move', 'the interface IS its machinery; every metric, wire, and panel is visible'], ['density', 'moderate, panels breathe but carry dense readouts'], ['motion', 'scan-line refresh, phosphor fade, digital transition']])}
    </div>
  </div>`;

  themeToggle(mount.querySelector('.impec3'));
  const scanBtn = mount.querySelector('#i3-scanbtn');
  const scanCell = mount.querySelector('#i3-scancell');
  if (scanBtn && scanCell) scanBtn.onclick = () => { scanCell.classList.remove('scanning'); void scanCell.offsetWidth; scanCell.classList.add('scanning'); };
  const glowBtn = mount.querySelector('#i3-glowbtn');
  const glowEl = mount.querySelector('#i3-phosphor-el');
  let gT;
  if (glowBtn && glowEl) glowBtn.onclick = () => { glowEl.classList.add('show'); clearTimeout(gT); gT = setTimeout(() => glowEl.classList.remove('show'), 1800); };
  const countBtn = mount.querySelector('#i3-countbtn');
  if (countBtn) {
    let cv = parseInt(LIB.total);
    countBtn.onclick = () => { cv += 1; countBtn.textContent = cv.toLocaleString(); };
  }
};

})();

(() => {

/* ============================================================ IMPEC-4
   registry \u00b7 the specimen archive.
   System rule: every visual decision is a named --tkn-* custom property
   organized by semantic layer. Components never use raw values \u2014 only
   token references. The UI wears its token registry openly: foundations
   includes a visible token reference card. Maximalism = a thoroughly
   catalogued, cross-referenced vocabulary where overprint\'s cream paper
   and misregistration offsets coexist with toybox\'s ink outlines,
   starburst stickers, and arcade drop heights, all tokenized.
   New move: the token registry \u2014 a formal -tkn namespace with
   subcategories (surface, ink, elev, stamp, anno, tilt, border, radius,
   motion, type) and a living reference card visible in foundations.
   Type: bungee / bricolage grotesque / space mono / caveat (all preloaded). */

const I4_TILTS = ['i4-t0', 'i4-t1', 'i4-t2', 'i4-t3'];
const I4_TABC = ['var(--tkn-ink-cherry)', 'var(--tkn-ink-denim)', 'var(--tkn-ink-honey)', 'var(--tkn-ink-tangerine)', 'var(--tkn-ink-violet)', 'var(--tkn-ink-mint)'];

function i4Star(txt, extra = '') {
  return `<span class="i4-star ${extra}"><span>${esc(txt)}</span></span>`;
}

function i4Stamp(txt, extra = '') {
  return `<span class="i4-stamp ${extra}">${esc(txt)}</span>`;
}

function i4Cell(m, state = '', i = 0, stub = false) {
  const tclr = I4_TABC[i % 6];
  return `
  <div class="i4-cw ${I4_TILTS[i % 4]}">
    <div class="i4-cell ${state}">
      <span class="i4-tape"></span>
      <div class="i4-ctab" style="background:${tclr}"><span>${esc(m.file)}</span><span>vec ${m.vec}</span></div>
      <div class="i4-art" style="aspect-ratio:${m.aspect}">${memeImg(m)}
        ${state === 'loading' ? '<div class="i4-loading"><i></i><i></i><i></i><span>embedding</span></div>' : ''}
      </div>
      <div class="i4-cap"><span>${esc(m.cap)}</span>${m.banger ? i4Star('banger!', 'i4-star-corner') : ''}</div>
      ${state === 'match' ? i4Stamp('top match', 'i4-ml') : ''}
      ${state === 'error' ? i4Stamp('misprint', 'red i4-ml') : ''}
      ${state === 'selected' ? i4Stamp('picked', 'green i4-ml') : ''}
    </div>
    ${stub ? `<div class="i4-stub"><b>${(m.score / 100).toFixed(2)}</b><span>${m.score >= 90 ? 'closest match' : m.score >= 75 ? 'strong match' : 'related'}</span><i></i></div>` : ''}
  </div>`;
}

function i4Console(q = 'cat losing it') {
  return `
  <div class="i4-console">
    <div class="i4-conhead"><span>search request slip</span><span>token 04-A</span><span>route /api/search</span></div>
    <div class="i4-conshelf">
      <div class="i4-field"><span class="i4-prompt">&gt;</span><span class="i4-q">${esc(q)}</span><span class="i4-caret"></span></div>
      <button class="i4-btn primary">find it</button>
    </div>
    <div class="i4-conmeta">
      <span>index ${LIB.total.toLocaleString()} vec</span><span>model ${LIB.model}</span>
      <span>dim ${LIB.dim}</span><span>${LIB.latency}ms</span>
    </div>
  </div>`;
}

function i4TokenCard() {
  const tokens = [
    ['surface.paper', '--tkn-surface-paper'],
    ['surface.card', '--tkn-surface-card'],
    ['ink.body', '--tkn-ink-body'],
    ['ink.muted', '--tkn-ink-mut'],
    ['ink.cherry', '--tkn-ink-cherry'],
    ['ink.denim', '--tkn-ink-denim'],
    ['ink.honey', '--tkn-ink-honey'],
    ['ink.mint', '--tkn-ink-mint'],
    ['ink.tangerine', '--tkn-ink-tangerine'],
    ['ink.violet', '--tkn-ink-violet'],
    ['elev.l0', '--tkn-elev-l0'],
    ['elev.l1', '--tkn-elev-l1'],
    ['elev.l2', '--tkn-elev-l2'],
    ['elev.lg', '--tkn-elev-lg'],
    ['stamp.sm', '--tkn-stamp-sm'],
    ['stamp.md', '--tkn-stamp-md'],
    ['stamp.lg', '--tkn-stamp-lg'],
    ['anno.size-sm', '--tkn-anno-sm'],
    ['anno.size-lg', '--tkn-anno-lg'],
    ['tilt.0', '--tkn-tilt-0'],
    ['tilt.1', '--tkn-tilt-1'],
    ['tilt.2', '--tkn-tilt-2'],
    ['tilt.3', '--tkn-tilt-3'],
    ['border.toy', '--tkn-border-toy'],
    ['border.hero', '--tkn-border-hero'],
    ['radius.sm', '--tkn-radius-sm'],
    ['radius.md', '--tkn-radius-md'],
    ['radius.pill', '--tkn-radius-pill'],
  ];
  return `<div class="i4-token-card">
    <div class="i4-tc-head"><b>token registry</b><span>v1 \u00b7 28 tokens</span></div>
    <div class="i4-tc-body">${tokens.map(([name, prop]) =>
      `<div class="i4-token-row"><span class="i4-tn">${name}</span><code>${prop}</code></div>`
    ).join('')}</div>
  </div>`;
}

function i4Status() {
  const cells = [
    ['index', `${LIB.total.toLocaleString()} vec`], ['model', LIB.model],
    ['queue', `${LIB.queued} embedding`], ['latency', `${LIB.latency}ms`], ['press', 'ready', true],
  ];
  return `<div class="i4-status">${cells.map(c =>
    `<span class="cell ${c[2] ? 'ok' : ''}"><b>${c[0]}</b>${c[1]}</span>`
  ).join('')}<span class="i4-colophon">est. 2026 \u00b7 cat. no. 004</span></div>`;
}

SPECS['IMPEC-4'] = (mount) => {
  css('IMPEC-4', `
  .impec4 {
    --tkn-surface-paper:#e5d7bd; --tkn-surface-paper2:#f0e6d2; --tkn-surface-card:#f5ecd9;
    --tkn-ink-body:#241e17; --tkn-ink-mut:rgba(36,30,23,.62); --tkn-ink-dot:rgba(36,30,23,.07);
    --tkn-ink-cherry:#e8325e; --tkn-ink-denim:#1f72c0; --tkn-ink-honey:#f0c800;
    --tkn-ink-mint:#1f9d4f; --tkn-ink-tangerine:#f05a1e; --tkn-ink-violet:#7a3bc9;
    --tkn-ink-red:#d9281a; --tkn-ink-green:#1f9d4f;
    --tkn-elev-l0:transparent 0 0; --tkn-elev-l1:4px 4px 0 var(--tkn-ink-cherry);
    --tkn-elev-l2:6px 6px 0 var(--tkn-ink-denim);
    --tkn-elev-lg:6px 6px 0 var(--tkn-ink-cherry), 12px 12px 0 var(--tkn-ink-denim);
    --tkn-elev-ring:0 0 0 4px var(--tkn-ink-cherry), 9px 9px 0 var(--tkn-ink-denim);
    --tkn-stamp-sm:8px 0; --tkn-stamp-md:12px 0; --tkn-stamp-lg:18px 0;
    --tkn-anno-sm:70px; --tkn-anno-lg:100px;
    --tkn-tilt-0:-1.1deg; --tkn-tilt-1:.7deg; --tkn-tilt-2:-.4deg; --tkn-tilt-3:1.2deg;
    --tkn-border-toy:2px solid var(--tkn-ink-body); --tkn-border-hero:4px solid var(--tkn-ink-body);
    --tkn-radius-sm:6px; --tkn-radius-md:14px; --tkn-radius-pill:999px;
    --tkn-tape:rgba(240,200,0,.5);
    --tkn-starpath:polygon(100% 50%, 80.9% 58.3%, 93.3% 75%, 72.6% 72.6%, 75% 93.3%, 58.3% 80.9%, 50% 100%, 41.7% 80.9%, 25% 93.3%, 27.4% 72.6%, 6.7% 75%, 19.1% 58.3%, 0% 50%, 19.1% 41.7%, 6.7% 25%, 27.4% 27.4%, 25% 6.7%, 41.7% 19.1%, 50% 0%, 58.3% 19.1%, 75% 6.7%, 72.6% 27.4%, 93.3% 25%, 80.9% 41.7%);
    --tkn-motion-fast:90ms; --tkn-motion-slow:180ms;
    --tkn-motion-spring:cubic-bezier(.34,1.56,.64,1);
    --tkn-motion-ease:cubic-bezier(.2,.8,.2,1);
    --tkn-type-display:'Bungee',cursive; --tkn-type-body:'Bricolage Grotesque',sans-serif;
    --tkn-type-mono:'Space Mono',monospace; --tkn-type-hand:'Caveat',cursive;
    min-height:100dvh; display:flex; flex-direction:column;
    font-family:var(--tkn-type-body); color:var(--tkn-ink-body);
    background:radial-gradient(var(--tkn-ink-dot) 1.2px,transparent 1.6px) 0 0 / 16px 16px, var(--tkn-surface-paper);
  }
  .impec4.theme-dark {
    --tkn-surface-paper:#211a12; --tkn-surface-paper2:#2b2318; --tkn-surface-card:#30271a;
    --tkn-ink-body:#f0e6d2; --tkn-ink-mut:rgba(240,230,210,.66); --tkn-ink-dot:rgba(240,230,210,.06);
    --tkn-ink-cherry:#f05078; --tkn-ink-denim:#3d95e0; --tkn-ink-honey:#f0c800;
    --tkn-ink-mint:#30b869; --tkn-ink-tangerine:#ff7840; --tkn-ink-violet:#a060e8;
    --tkn-ink-red:#f0452a; --tkn-ink-green:#30b869;
    --tkn-elev-l1:4px 4px 0 var(--tkn-ink-cherry);
    --tkn-elev-l2:6px 6px 0 var(--tkn-ink-denim);
    --tkn-elev-lg:6px 6px 0 var(--tkn-ink-cherry),12px 12px 0 var(--tkn-ink-denim);
    --tkn-elev-ring:0 0 0 4px var(--tkn-ink-cherry),9px 9px 0 var(--tkn-ink-denim);
    --tkn-border-toy:2px solid var(--tkn-ink-body); --tkn-border-hero:4px solid var(--tkn-ink-body);
    --tkn-tape:rgba(240,200,0,.35);
  }
  .impec4 :focus-visible { outline:3px dashed var(--tkn-ink-cherry); outline-offset:3px; border-radius:var(--tkn-radius-sm); }
  .impec4 .i4-wrap { width:100%; max-width:1140px; margin:0 auto; padding:0 clamp(14px,4vw,44px); }
  .impec4 .i4-row { display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start; }
  .impec4 .i4-sec { display:flex; gap:12px; align-items:baseline; margin-top:52px; padding:10px 0 20px;
    border-top:var(--tkn-border-toy); font-family:var(--tkn-type-mono); font-size:11px; text-transform:lowercase; letter-spacing:.1em; }
  .impec4 .i4-sec b { background:var(--tkn-ink-body); color:var(--tkn-surface-paper); padding:2px 9px; font-weight:600; }
  .impec4 .i4-sec i { font-family:var(--tkn-type-hand); font-style:normal; font-size:17px; color:var(--tkn-ink-mut); letter-spacing:0; }
  .impec4 .i4-body { padding:10px 0 20px; display:flex; flex-direction:column; gap:24px; }

  /* tilt set - tokenized */
  .impec4 .i4-t0 { transform:rotate(var(--tkn-tilt-0)); }
  .impec4 .i4-t1 { transform:rotate(var(--tkn-tilt-1)); }
  .impec4 .i4-t2 { transform:rotate(var(--tkn-tilt-2)); }
  .impec4 .i4-t3 { transform:rotate(var(--tkn-tilt-3)); }

  /* masthead */
  .impec4 .i4-mast { display:flex; align-items:center; justify-content:space-between; gap:16px;
    padding:14px clamp(14px,4vw,44px); border-bottom:var(--tkn-border-hero); background:var(--tkn-surface-card); }
  .impec4 .i4-logo { font-family:var(--tkn-type-display); font-size:28px; letter-spacing:.01em;
    text-shadow:3px 2px 0 var(--tkn-ink-cherry),-2px -2px 0 var(--tkn-ink-denim); }
  .impec4 .i4-mast nav { display:flex; gap:14px; font-family:var(--tkn-type-mono); font-size:12px; }
  .impec4 .i4-mast nav a { color:var(--tkn-ink-body); text-decoration:none; border-bottom:2px dotted var(--tkn-ink-mut); padding:2px 0; }
  .impec4 .i4-mast nav a:hover { border-bottom:2px solid var(--tkn-ink-cherry); color:var(--tkn-ink-cherry); }

  /* token registry card - the signature element */
  .impec4 .i4-token-card { border:var(--tkn-border-toy); background:var(--tkn-surface-card);
    box-shadow:var(--tkn-elev-l1); font-family:var(--tkn-type-mono); font-size:9px;
    max-width:320px; overflow:hidden; }
  .impec4 .i4-tc-head { display:flex; justify-content:space-between; padding:8px 12px;
    background:var(--tkn-ink-body); color:var(--tkn-surface-paper); font-size:9px; text-transform:lowercase; }
  .impec4 .i4-tc-head b { color:var(--tkn-ink-cherry); font-weight:600; }
  .impec4 .i4-tc-body { padding:6px 12px 8px; display:flex; flex-direction:column; gap:2px; }
  .impec4 .i4-token-row { display:flex; gap:8px; align-items:baseline; }
  .impec4 .i4-tn { color:var(--tkn-ink-mut); min-width:72px; font-size:8px; text-transform:lowercase; }
  .impec4 .i4-token-row code { font-size:8px; color:var(--tkn-ink-body); font-family:inherit; }

  /* starburst sticker - tokenized annotation layer */
  .impec4 .i4-star { display:inline-grid; place-items:center; width:var(--tkn-anno-lg); height:var(--tkn-anno-lg); flex:none;
    clip-path:var(--tkn-starpath); background:var(--tkn-ink-honey);
    filter:drop-shadow(2px 3px 0 var(--tkn-ink-body)); transform:rotate(8deg); }
  .impec4 .i4-star span { font-family:var(--tkn-type-display); font-size:10px; color:var(--tkn-ink-body); text-align:center;
    max-width:56px; line-height:1.15; transform:rotate(-2deg); }
  .impec4 .i4-star.green { background:var(--tkn-ink-mint); }
  .impec4 .i4-star.pink { background:var(--tkn-ink-cherry); color:var(--tkn-surface-paper); }
  .impec4 .i4-star-corner { position:absolute; top:-16px; right:-14px; z-index:3; width:var(--tkn-anno-sm); height:var(--tkn-anno-sm); }
  .impec4 .i4-star-corner span { font-size:8px; }

  /* rubber stamps - the annotation layer from the print room */
  .impec4 .i4-stamp { display:inline-block; font-family:var(--tkn-type-mono); font-weight:600; font-size:11px;
    text-transform:uppercase; letter-spacing:.08em; color:var(--tkn-ink-cherry);
    border:3px double var(--tkn-ink-cherry); padding:4px 10px; transform:rotate(-3deg); background:transparent; }
  .impec4 .i4-stamp.red { color:var(--tkn-ink-red); border-color:var(--tkn-ink-red); }
  .impec4 .i4-stamp.green { color:var(--tkn-ink-green); border-color:var(--tkn-ink-green); }
  .impec4 .i4-stamp.denim { color:var(--tkn-ink-denim); border-color:var(--tkn-ink-denim); }
  .impec4 .i4-ml { position:absolute; top:30%; left:50%; transform:translate(-50%,-50%) rotate(-6deg);
    background:var(--tkn-surface-card); z-index:2; padding:8px 16px; }

  /* console: the request slip */
  .impec4 .i4-console { border:var(--tkn-border-hero); background:var(--tkn-surface-card); box-shadow:var(--tkn-elev-lg); max-width:820px; }
  .impec4 .i4-conhead { display:flex; justify-content:space-between; gap:10px; background:var(--tkn-ink-body);
    color:var(--tkn-surface-paper); font-family:var(--tkn-type-mono); font-size:11px; text-transform:lowercase; padding:7px 14px; }
  .impec4 .i4-conshelf { display:flex; gap:12px; padding:16px; align-items:center;
    background:repeating-linear-gradient(transparent,transparent 26px,var(--tkn-ink-dot) 26px,var(--tkn-ink-dot) 27px), var(--tkn-surface-card); }
  .impec4 .i4-field { flex:1; display:flex; align-items:center; gap:10px; border:var(--tkn-border-toy);
    background:var(--tkn-surface-paper2); padding:12px 14px; font-family:var(--tkn-type-mono); font-size:15px; min-width:0; }
  .impec4 .i4-prompt { opacity:.5; }
  .impec4 .i4-q { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .impec4 .i4-caret { width:10px; height:20px; background:var(--tkn-ink-cherry); flex:none; animation:i4blink 1s steps(1) infinite; }
  @keyframes i4blink { 50% { opacity:0; } }
  .impec4 .i4-conmeta { display:flex; gap:16px; flex-wrap:wrap; border-top:2px dashed var(--tkn-ink-body);
    padding:8px 14px; font-family:var(--tkn-type-mono); font-size:10px; color:var(--tkn-ink-mut); }

  /* buttons: toy outlines + misregistration elevation + arcade depress */
  .impec4 .i4-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px;
    min-height:46px; padding:10px 22px; font-family:var(--tkn-type-mono); font-weight:600; font-size:13px;
    text-transform:lowercase; border:var(--tkn-border-toy); background:var(--tkn-surface-card); color:var(--tkn-ink-body);
    box-shadow:var(--tkn-elev-l1); border-radius:var(--tkn-radius-pill);
    transition:transform var(--tkn-motion-fast) var(--tkn-motion-ease), box-shadow var(--tkn-motion-fast) var(--tkn-motion-ease); }
  .impec4 .i4-btn:hover { transform:translate(-2px,-2px); box-shadow:6px 6px 0 var(--tkn-ink-cherry),10px 10px 0 var(--tkn-ink-denim); }
  .impec4 .i4-btn:active { transform:translateY(5px) scale(.97,.94); box-shadow:0 0 0 var(--tkn-ink-cherry); }
  .impec4 .i4-btn.primary { background:var(--tkn-ink-cherry); color:var(--tkn-surface-paper); box-shadow:var(--tkn-elev-l2); }
  .impec4 .i4-btn.primary:hover { box-shadow:6px 6px 0 var(--tkn-ink-denim),10px 10px 0 var(--tkn-ink-body); }
  .impec4 .i4-btn.quiet { box-shadow:none; border-style:dashed; border-radius:0; }
  .impec4 .i4-btn.sm { min-height:36px; padding:5px 14px; font-size:11px; box-shadow:2px 2px 0 var(--tkn-ink-cherry); }
  .impec4 .i4-btn.sm:active { transform:translateY(2px) scale(.98,.96); }
  .impec4 .i4-btn.icon { width:46px; padding:0; }

  /* tag / sticker pill */
  .impec4 .i4-tag { display:inline-flex; align-items:center; gap:6px; font-family:var(--tkn-type-body); font-weight:700;
    font-size:13px; border:var(--tkn-border-toy); border-radius:var(--tkn-radius-pill); padding:5px 12px;
    background:var(--tkn-ink-denim); color:var(--tkn-surface-paper); }
  .impec4 .i4-tag.honey { background:var(--tkn-ink-honey); color:var(--tkn-ink-body); }
  .impec4 .i4-tag.mint { background:var(--tkn-ink-mint); color:var(--tkn-surface-paper); }
  .impec4 .i4-tag.tangerine { background:var(--tkn-ink-tangerine); color:var(--tkn-surface-paper); }
  .impec4 .i4-tag.violet { background:var(--tkn-ink-violet); color:var(--tkn-surface-paper); }

  /* banger marker */
  .impec4 .i4-banger { display:inline-flex; align-items:center; gap:5px; flex:none; font-family:var(--tkn-type-mono);
    font-size:10px; font-weight:700; text-transform:uppercase; }
  .impec4 .i4-banger i { width:9px; height:9px; background:var(--tkn-ink-cherry); transform:rotate(45deg); }

  /* meme cell: specimen card */
  .impec4 .i4-cw { position:relative; }
  .impec4 .i4-cell { position:relative; border:var(--tkn-border-toy); border-radius:var(--tkn-radius-md);
    background:var(--tkn-surface-card); box-shadow:var(--tkn-elev-l1); overflow:hidden;
    transition:transform var(--tkn-motion-fast) var(--tkn-motion-ease), box-shadow var(--tkn-motion-fast) var(--tkn-motion-ease); }
  .impec4 .i4-cell:hover { transform:translateY(-3px); box-shadow:var(--tkn-elev-l2); }
  .impec4 .i4-tape { position:absolute; top:-8px; left:50%; width:64px; height:18px; margin-left:-32px;
    background:var(--tkn-tape); border:1px solid rgba(36,30,23,.15); transform:rotate(-2deg); z-index:2;
    border-radius:2px; }
  .impec4 .i4-ctab { display:flex; justify-content:space-between; gap:8px; padding:6px 12px;
    font-family:var(--tkn-type-mono); font-size:9px; color:var(--tkn-surface-paper);
    border-bottom:var(--tkn-border-toy); white-space:nowrap; overflow:hidden; }
  .impec4 .i4-art { display:grid; place-items:center; overflow:hidden; background:var(--tkn-surface-paper2);
    margin:8px; border:2px solid var(--tkn-ink-body); border-radius:var(--tkn-radius-sm); }
  .impec4 .i4-art .meme-media { background:var(--tkn-surface-paper2); }
  .impec4 .i4-cap { display:flex; justify-content:space-between; align-items:center; gap:8px;
    padding:8px 12px 12px; font-size:13px; line-height:1.35; font-weight:500; }
  .impec4 .i4-stub { position:relative; display:flex; align-items:center; gap:10px; margin:0 10px;
    border:var(--tkn-border-toy); border-top:2px dashed var(--tkn-ink-body);
    background:var(--tkn-ink-honey); color:var(--tkn-ink-body);
    font-family:var(--tkn-type-mono); font-size:10px; padding:5px 10px; border-radius:0 0 var(--tkn-radius-sm) var(--tkn-radius-sm); }
  .impec4 .i4-stub b { font-size:13px; font-weight:700; }
  .impec4 .i4-stub i { margin-left:auto; width:10px; height:10px; border:2px solid var(--tkn-ink-body); border-radius:50%; }
  .impec4 .i4-cell.match { box-shadow:var(--tkn-elev-ring); }
  .impec4 .i4-cell.near { outline:3px dashed var(--tkn-ink-denim); outline-offset:3px; }
  .impec4 .i4-cell.dim { opacity:.45; filter:grayscale(.65) contrast(.92); box-shadow:none; }
  .impec4 .i4-cell.selected { border-width:3px; box-shadow:var(--tkn-elev-lg); }
  .impec4 .i4-cell.selected::before,.impec4 .i4-cell.selected::after { content:""; position:absolute; width:46px; height:16px;
    background:var(--tkn-tape); border:1px solid rgba(36,30,23,.15); z-index:2; }
  .impec4 .i4-cell.selected::before { top:-8px; left:-14px; transform:rotate(-38deg); }
  .impec4 .i4-cell.selected::after { top:-8px; right:-14px; transform:rotate(38deg); }
  .impec4 .i4-cell.error { border-color:var(--tkn-ink-red); }
  .impec4 .i4-cell.error .i4-ctab { border-bottom-color:var(--tkn-ink-red); }
  .impec4 .i4-loading { display:flex; gap:8px; align-items:center; justify-content:center;
    font-family:var(--tkn-type-mono); font-size:10px; color:var(--tkn-ink-mut); position:absolute; inset:auto 0 0 0; padding:8px; background:var(--tkn-surface-card); }
  .impec4 .i4-loading i { width:8px; height:8px; border-radius:50%; background:var(--tkn-ink-cherry); animation:i4boil 700ms var(--tkn-motion-spring) infinite alternate; }
  .impec4 .i4-loading i:nth-child(2) { animation-delay:120ms; background:var(--tkn-ink-denim); }
  .impec4 .i4-loading i:nth-child(3) { animation-delay:240ms; background:var(--tkn-ink-mint); }
  @keyframes i4boil { from { transform:translateY(2px); } to { transform:translateY(-5px); } }

  /* stat blocks */
  .impec4 .i4-stat { border:var(--tkn-border-toy); border-radius:var(--tkn-radius-md); background:var(--tkn-surface-card);
    box-shadow:var(--tkn-elev-l1); padding:12px 16px; min-width:150px; }
  .impec4 .i4-stat .lb { font-family:var(--tkn-type-mono); font-size:10px; color:var(--tkn-ink-mut); text-transform:lowercase; }
  .impec4 .i4-stat .vl { font-family:var(--tkn-type-display); font-size:36px; line-height:1.15; }
  .impec4 .i4-stat.honey { background:var(--tkn-ink-honey); color:var(--tkn-ink-body); }
  .impec4 .i4-stat.honey .lb { color:rgba(36,30,23,.65); }
  .impec4 .i4-stat.cherry { background:var(--tkn-ink-cherry); color:var(--tkn-surface-paper); }
  .impec4 .i4-stat.cherry .lb { color:rgba(245,236,217,.75); }
  .impec4 .i4-stat.denim { background:var(--tkn-ink-denim); color:var(--tkn-surface-paper); }
  .impec4 .i4-stat.denim .lb { color:rgba(245,236,217,.75); }

  /* status bar */
  .impec4 .i4-status { display:flex; flex-wrap:wrap; align-items:center; border-top:var(--tkn-border-hero);
    background:var(--tkn-ink-body); color:var(--tkn-surface-paper); font-family:var(--tkn-type-mono); font-size:11px; }
  .impec4 .i4-status .cell { display:flex; gap:8px; align-items:center; padding:9px 14px;
    border-right:1px dashed rgba(245,236,217,.35); }
  .impec4 .i4-status .cell b { text-transform:lowercase; opacity:.55; font-weight:400; }
  .impec4 .i4-status .ok::after { content:""; width:8px; height:8px; border-radius:50%; background:var(--tkn-ink-mint); }
  .impec4 .i4-colophon { margin-left:auto; padding:4px 14px; font-family:var(--tkn-type-hand); font-size:16px; opacity:.7; }

  /* input, tabs, toast, empty */
  .impec4 .i4-input { display:flex; align-items:center; gap:10px; border:var(--tkn-border-toy); border-radius:var(--tkn-radius-pill);
    background:var(--tkn-surface-paper2); padding:11px 18px; font-family:var(--tkn-type-mono); font-size:14px; min-width:260px; }
  .impec4 .i4-tabs { display:flex; align-items:flex-end; }
  .impec4 .i4-tab { font-family:var(--tkn-type-mono); font-size:12px; text-transform:lowercase; padding:10px 18px; min-height:44px;
    border:var(--tkn-border-toy); border-bottom:0; background:var(--tkn-surface-paper2); margin-right:-2px; cursor:pointer;
    border-radius:var(--tkn-radius-sm) var(--tkn-radius-sm) 0 0; color:var(--tkn-ink-body); }
  .impec4 .i4-tab.on { background:var(--tkn-ink-honey); color:var(--tkn-ink-body); font-weight:600; padding-top:14px;
    box-shadow:var(--tkn-elev-l2); position:relative; z-index:1; }
  .impec4 .i4-tabrule { border-bottom:var(--tkn-border-toy); }
  .impec4 .i4-toast { display:inline-flex; gap:12px; align-items:center; border:2px dashed var(--tkn-ink-mint);
    color:var(--tkn-ink-mint); background:var(--tkn-surface-card); padding:11px 16px;
    font-family:var(--tkn-type-mono); font-size:12px; border-radius:var(--tkn-radius-sm); box-shadow:var(--tkn-elev-l1); }
  .impec4 .i4-empty { border:var(--tkn-border-hero); border-radius:var(--tkn-radius-md); background:var(--tkn-surface-card);
    box-shadow:var(--tkn-elev-lg); padding:32px; max-width:440px; display:flex; flex-direction:column; gap:14px; align-items:flex-start; }
  .impec4 .i4-empty .hand { font-family:var(--tkn-type-hand); font-size:22px; color:var(--tkn-ink-mut); transform:rotate(-1.5deg); }

  /* hero */
  .impec4 .i4-hero { padding-top:46px; display:flex; flex-direction:column; gap:24px; }
  .impec4 .i4-h1 { font-family:var(--tkn-type-display); font-size:clamp(38px,7.2vw,84px); line-height:1.04; letter-spacing:.01em;
    text-shadow:4px 3px 0 var(--tkn-ink-cherry),-3px -2px 0 var(--tkn-ink-denim); max-width:12ch; }
  .impec4 .i4-hero-note { font-size:17px; max-width:52ch; }
  .impec4 .i4-hero-note .hand { font-family:var(--tkn-type-hand); font-size:21px; color:var(--tkn-ink-cherry); }

  /* foundation specimens */
  .impec4 .i4-shape { border:var(--tkn-border-toy); border-radius:var(--tkn-radius-sm); background:var(--tkn-surface-paper2);
    width:132px; height:84px; display:grid; place-items:center; text-align:center;
    font-family:var(--tkn-type-mono); font-size:9px; padding:6px; }
  .impec4 .i4-shape-frame { display:flex; gap:14px; flex-wrap:wrap; }

  /* grids */
  .impec4 .i4-grid { display:grid; gap:22px; }
  .impec4 .g4 { grid-template-columns:repeat(4,1fr); }
  .impec4 .g2 { grid-template-columns:repeat(2,1fr); }

  /* type specimen */
  .impec4 .i4-types { display:flex; flex-direction:column; gap:14px; }
  .impec4 .i4-types .disp { font-family:var(--tkn-type-display); font-size:46px; line-height:1.1; letter-spacing:.01em; }
  .impec4 .i4-types .body { font-size:17px; max-width:560px; }
  .impec4 .i4-types .label { font-family:var(--tkn-type-mono); font-size:12px; color:var(--tkn-ink-mut); }
  .impec4 .i4-types .meta { font-family:var(--tkn-type-mono); font-size:10px; color:var(--tkn-ink-mut); }
  .impec4 .i4-types .tab { font-family:var(--tkn-type-mono); font-size:26px; font-variant-numeric:tabular-nums; }
  .impec4 .i4-types .capln { font-size:13.5px; max-width:430px; border-left:3px solid var(--tkn-ink-cherry); padding-left:12px; }
  .impec4 .i4-types .hand { font-family:var(--tkn-type-hand); font-size:22px; color:var(--tkn-ink-mut); transform:rotate(-1deg); }

  /* workbench + phone */
  .impec4 .i4-bench { border:var(--tkn-border-hero); border-radius:var(--tkn-radius-md); background:var(--tkn-surface-paper2);
    box-shadow:var(--tkn-elev-lg); overflow:hidden; }
  .impec4 .i4-bench-head { display:flex; align-items:center; gap:14px; padding:12px 18px; border-bottom:var(--tkn-border-hero);
    background:var(--tkn-surface-card); flex-wrap:wrap; }
  .impec4 .i4-pilerail { display:flex; flex-direction:column; gap:10px; min-width:210px; }
  .impec4 .i4-pile { display:flex; justify-content:space-between; align-items:center; gap:10px;
    border:var(--tkn-border-toy); border-radius:var(--tkn-radius-pill); background:var(--tkn-surface-card);
    padding:9px 16px; font-family:var(--tkn-type-mono); font-size:11px; cursor:pointer;
    box-shadow:3px 3px 0 var(--tkn-ink-body); }
  .impec4 .i4-pile.on { background:var(--tkn-ink-honey); color:var(--tkn-ink-body); font-weight:600; box-shadow:var(--tkn-elev-l2); }
  .impec4 .i4-pile b { font-weight:700; font-variant-numeric:tabular-nums; }
  .impec4 .i4-phone { width:min(390px,100%); border:var(--tkn-border-hero); border-radius:var(--tkn-radius-md);
    background:var(--tkn-surface-paper); box-shadow:var(--tkn-elev-lg); overflow:hidden; }
  .impec4 .i4-phstatus { display:flex; justify-content:space-between; align-items:center; padding:10px 14px;
    border-bottom:var(--tkn-border-toy); background:var(--tkn-surface-card); }
  .impec4 .i4-phbody { padding:14px; display:flex; flex-direction:column; gap:14px; }
  .impec4 .i4-dock { display:flex; border-top:var(--tkn-border-hero); background:var(--tkn-ink-body); }
  .impec4 .i4-dock button { flex:1; min-height:52px; background:none; border:0;
    border-right:1px dashed rgba(245,236,217,.35); color:var(--tkn-surface-paper);
    font-family:var(--tkn-type-mono); font-size:10px; text-transform:lowercase; }
  .impec4 .i4-dock button.on { background:var(--tkn-ink-cherry); color:var(--tkn-surface-paper); font-weight:600; }
  .impec4 .i4-dock button:last-child { border-right:0; }

  /* motion */
  @keyframes i4slam { 0% { opacity:0; transform:scale(2.1) rotate(-18deg); } 62% { opacity:1; transform:scale(.9) rotate(2deg); } 100% { opacity:1; transform:scale(1) rotate(-3deg); } }
  .impec4 .i4-demo-stamp.go { animation:i4slam var(--tkn-motion-slow) var(--tkn-motion-spring); }
  @keyframes i4squish { 0% { transform:scale(1); } 40% { transform:scale(.93,.88); } 100% { transform:scale(1); } }
  .impec4 .i4-demo-boop.go .i4-cell { animation:i4squish 260ms var(--tkn-motion-spring); }
  @keyframes i4print { 0% { box-shadow:0 0 0 4px transparent,0 0 0 transparent; } 55% { box-shadow:0 0 0 4px var(--tkn-ink-cherry),0 0 0 transparent; } 100% { box-shadow:var(--tkn-elev-ring); } }
  .impec4 .i4-demo-print.go .i4-cell { animation:i4print 340ms var(--tkn-motion-ease) forwards; }
  .impec4 .i4-demo-count { font-family:var(--tkn-type-display); font-size:32px; letter-spacing:.01em; }

  @media (prefers-reduced-motion:reduce) {
    .impec4 *, .impec4 *::before, .impec4 *::after { animation:none !important; transition:none !important; }
    .impec4 .i4-demo-stamp.go { opacity:1; }
    .impec4 .i4-caret { opacity:1; }
    .impec4 .i4-loading i { animation:none; background:var(--tkn-ink-cherry); }
  }
  @media (max-width:700px) {
    .impec4 .g4 { grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
    .impec4 .i4-conshelf { flex-direction:column; align-items:stretch; }
    .impec4 .i4-bench-head { flex-direction:column; }
    .impec4 .i4-pilerail { min-width:0; }
    .impec4 .i4-mast nav { gap:10px; font-size:10px; flex-wrap:wrap; }
    .impec4 .i4-token-card { max-width:100%; }
    .impec4 .i4-input { min-width:0; }
  }
  @media (max-width:420px) {
    .impec4 .g2 { grid-template-columns:1fr; }
  }`);

  const M = MEMES;
  mount.innerHTML = `
  <div class="impec4">
    <div class="i4-mast">
      <span class="i4-logo">sploot</span>
      <nav><a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a><a href="#0">sign in</a></nav>
    </div>

    <div class="i4-wrap i4-hero">
      ${i4Stamp('registry edition', 'denim i4-t1')}
      <h1 class="i4-h1">type words. get the picture.</h1>
      <p class="i4-hero-note">sploot catalogs your entire meme brain onto one searchable pile. every visual decision is a declared token. no folders. just vibes. <span class="hand">cross-reference at every corner.</span></p>
      <div class="i4-row" style="align-items:flex-start">
        ${i4Console()}
        ${i4TokenCard()}
      </div>
      <div class="i4-grid g4">${M.slice(0,4).map((x,i) => i4Cell(x,i===0?'match':'',i,i===0)).join('')}</div>
    </div>

    <div class="i4-wrap"><div class="i4-sec"><b>02</b> foundations <i>tokens, inks, substrate</i></div></div>
    <div>${swatches([['ink body','#241e17','#f0e6d2'],['paper cream','#e5d7bd'],['card','#f5ecd9'],['paper 2','#f0e6d2'],['cherry','#e8325e','#f0e6d2'],['denim','#1f72c0','#f0e6d2'],['honey','#f0c800','#241e17'],['mint','#1f9d4f','#f0e6d2'],['tangerine','#f05a1e','#f0e6d2'],['violet','#7a3bc9','#f0e6d2']])}</div>
    <div class="i4-wrap" style="padding-top:20px">
      <div class="i4-shape-frame">
        <div class="i4-shape" style="box-shadow:var(--tkn-elev-l0)">elev.0 \u00b7 flat</div>
        <div class="i4-shape" style="box-shadow:var(--tkn-elev-l1)">elev.1 \u00b7 raised</div>
        <div class="i4-shape" style="box-shadow:var(--tkn-elev-l2)">elev.2 \u00b7 floating</div>
        <div class="i4-shape" style="box-shadow:var(--tkn-elev-lg)">elev.lg \u00b7 hero</div>
        <div class="i4-shape" style="border:var(--tkn-border-toy)">toy border \u00b7 2px</div>
        <div class="i4-shape" style="border:var(--tkn-border-hero)">hero border \u00b7 4px</div>
        <div class="i4-shape" style="border-radius:var(--tkn-radius-pill)">pill \u00b7 buttons</div>
        <div class="i4-shape" style="border-radius:var(--tkn-radius-md)">radius md \u00b7 14px</div>
        <div class="i4-shape" style="transform:rotate(var(--tkn-tilt-0))">tilt 0</div>
        <div class="i4-shape" style="transform:rotate(var(--tkn-tilt-1))">tilt 1</div>
        <div class="i4-shape" style="transform:rotate(var(--tkn-tilt-2))">tilt 2</div>
        <div class="i4-shape" style="transform:rotate(var(--tkn-tilt-3))">tilt 3</div>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:20px">
        <div class="i4-star" style="width:var(--tkn-anno-sm);height:var(--tkn-anno-sm)"><span>sticker</span></div>
        <div class="i4-star green" style="width:var(--tkn-anno-sm);height:var(--tkn-anno-sm)"><span>rare</span></div>
        <div class="i4-star"><span>banger</span></div>
        ${i4Stamp('match', '')} ${i4Stamp('misprint', 'red')} ${i4Stamp('saved', 'green')}
        <span class="i4-tape" style="position:static;margin:0;width:80px;height:18px"></span>
      </div>
      <p style="margin-top:16px;font-family:var(--tkn-type-mono);font-size:10px;color:var(--tkn-ink-mut)">spacing rides a 22px baseline \u00b7 elevation is always colored misregistration, never gray blur \u00b7 tokens govern every value \u00b7 tilt from a fixed 4-step registry</p>
    </div>

    <div class="i4-wrap"><div class="i4-sec"><b>03</b> typography <i>bungee \u00b7 bricolage grotesque \u00b7 space mono \u00b7 caveat</i></div>
      <div class="i4-types">
        <div class="disp">display \u00b7 bungee \u00b7 46px</div>
        <div class="body">body \u00b7 bricolage grotesque. the pile sorts itself while you sleep and never asks you to name a folder.</div>
        <div class="label">label \u00b7 space mono, lowercase readouts</div>
        <div class="meta">metadata \u00b7 vec 0413 \u00b7 212ms \u00b7 siglip-base \u00b7 768d</div>
        <div class="tab">1,482 \u00b7 0.94 \u00b7 212ms</div>
        <div class="capln">long caption wrap: me explaining to the group chat why the spreadsheet cell that broke me now hangs above my desk like a diploma.</div>
        <div class="hand">marginalia \u00b7 caveat, for notes the archivist scribbles on the sleeve</div>
      </div>
    </div>

    <div class="i4-wrap"><div class="i4-sec"><b>04</b> components <i>everything is catalogued</i></div>
      <div class="i4-body">
        ${i4Console('sad frog')}
        <div class="i4-grid g4">
          ${i4Cell(M[0],'match',0,true)}
          ${i4Cell(M[1],'near',1)}
          ${i4Cell(M[2],'dim',2)}
          ${i4Cell(M[3],'',3)}
        </div>
        <div class="i4-grid g4">
          ${i4Cell(M[4],'selected',4)}
          <div class="i4-cw"><div class="i4-cell">
            <div class="i4-ctab" style="background:var(--tkn-ink-tangerine)"><span>uploading\u2026</span><span>queue ${LIB.queued}</span></div>
            <div class="i4-art" style="aspect-ratio:1/1">${memeImg(M[5])}<div class="i4-loading"><i></i><i></i><i></i><span>embedding</span></div></div>
            <div class="i4-cap"><span>loading \u00b7 the press is warm</span></div>
          </div></div>
          <div class="i4-cw"><div class="i4-cell error">
            <div class="i4-ctab" style="background:var(--tkn-ink-red);color:var(--tkn-surface-paper)"><span>failed.png</span><span>err 500</span></div>
            <div class="i4-art" style="aspect-ratio:1/1;display:grid;place-items:center"><span style="font-family:var(--tkn-type-mono);font-size:11px">the embedding smudged. run it again.</span></div>
            <div class="i4-cap" style="display:flex;justify-content:space-between;gap:8px"><span>error state</span><button class="i4-btn sm">retry</button></div>
            ${i4Stamp('misprint','red i4-ml')}</div></div>
          <div class="i4-empty i4-t0">
            ${i4Stamp('nothing filed','green')}
            <p style="font-size:15.5px">the pile is empty and the press is idle. upload chaos and we start printing.</p>
            <p class="hand">first sheet is always the weirdest.</p>
            <button class="i4-btn primary">upload chaos</button>
          </div>
        </div>
        <div class="i4-row" style="align-items:center">
          <button class="i4-btn primary">find it</button>
          <button class="i4-btn">shuffle the pile</button>
          <button class="i4-btn quiet">secondary</button>
          <button class="i4-btn sm">compact</button>
          <button class="i4-btn sm icon" aria-label="close">\u2715</button>
          <span class="i4-tag">sticker \u00b7 denim</span>
          <span class="i4-tag honey">sticker \u00b7 honey</span>
          <span class="i4-tag mint">rare \u00b7 mint</span>
          <span class="i4-banger"><i></i>banger</span>
          ${i4Star('banger!','i4-t1')}
        </div>
        <div class="i4-row" style="align-items:center">
          <div class="i4-input"><span style="opacity:.5">&gt;</span><span>text input</span><span class="i4-caret"></span></div>
          <div>
            <div class="i4-tabs"><div class="i4-tab on">all</div><div class="i4-tab">bangers</div><div class="i4-tab">recent</div></div>
            <div class="i4-tabrule" style="width:280px"></div>
          </div>
          <div class="i4-toast">\u2713 saved to the pile \u00b7 stamped and catalogued</div>
        </div>
        <div class="i4-row">
          <div class="i4-stat honey i4-t0"><div class="lb">folders required</div><div class="vl">0</div></div>
          <div class="i4-stat i4-t1"><div class="lb">memes indexed</div><div class="vl">${LIB.total.toLocaleString()}</div></div>
          <div class="i4-stat cherry i4-t3"><div class="lb">bangers</div><div class="vl">37</div></div>
          <div class="i4-stat denim i4-t2"><div class="lb">active tokens</div><div class="vl">28</div></div>
        </div>
        ${i4Status()}
      </div>
    </div>

    <div class="i4-wrap"><div class="i4-sec"><b>05</b> motion <i>stamp, boop, print \u2014 interactive only</i></div>
      <div class="i4-row" style="align-items:center">
        <button class="i4-btn primary">press me \u00b7 arcade depress</button>
        <button class="i4-btn i4-go-slam">stamp it</button>
        ${i4Stamp('banger!','i4-demo-stamp')}
        <button class="i4-btn i4-go-boop">boop the card</button>
        <div class="i4-demo-boop" style="width:150px">${i4Cell(M[2],'',1).replace('i4-cw i4-t1','i4-cw')}</div>
        <button class="i4-btn i4-go-print">replay match</button>
        <div class="i4-demo-print" style="width:150px">${i4Cell(M[2],'',2).replace('i4-cw i4-t2','i4-cw')}</div>
        <button class="i4-btn i4-demo-count" id="i4-countbtn">0</button>
      </div>
      <p style="margin-top:14px;font-family:var(--tkn-type-mono);font-size:10px;color:var(--tkn-ink-mut)">prefers-reduced-motion: every slam, boop, squish, and print transition collapses to an instant state change.</p>
    </div>

    <div class="i4-wrap"><div class="i4-sec"><b>06</b> compositions <i>workbench and pocket catalog</i></div></div>
    <div class="i4-wrap">
      <div class="i4-bench">
        <div class="i4-bench-head">
          <span class="i4-logo" style="font-size:19px">sploot</span>
          <div class="i4-field" style="flex:1;max-width:420px;min-width:160px"><span class="i4-prompt">&gt;</span><span class="i4-q">search the pile</span><span class="i4-caret"></span></div>
          <button class="i4-btn sm">upload</button><button class="i4-btn sm">bangers</button><button class="i4-btn sm">shuffle</button>
        </div>
        <div style="display:flex;gap:20px;padding:20px;flex-wrap:wrap">
          <div class="i4-pilerail">
            ${PILES.slice(0,5).map((p,i) => `<div class="i4-pile ${i===0?'on':''}"><span>${esc(p.name)}</span><b>${p.n}</b></div>`).join('')}
          </div>
          <div class="i4-grid g4" style="flex:1;min-width:0">${M.slice(0,8).map((x,i) => i4Cell(x,'',i)).join('')}</div>
        </div>
        ${i4Status()}
      </div>
    </div>
    <div class="i4-wrap" style="padding-top:26px;padding-bottom:48px">
      <div class="i4-phone">
        <div class="i4-phstatus"><span class="i4-logo" style="font-size:17px">sploot</span><span style="font-family:var(--tkn-type-mono);font-size:10px;color:var(--tkn-ink-mut)">${LIB.total.toLocaleString()} vec</span></div>
        <div class="i4-phbody">
          <div class="i4-input" style="min-width:0"><span style="opacity:.5">&gt;</span><span>cat losing it</span><span class="i4-caret"></span></div>
          <div class="i4-grid g2">${M.slice(0,4).map((x,i) => i4Cell(x,i===0?'match':'',i)).join('')}</div>
        </div>
        <div class="i4-dock"><button class="on">pile</button><button>search</button><button>upload</button><button>bangers</button></div>
      </div>
    </div>

    <div style="margin-top:auto">
      ${labSpec([['system', 'registry \u00b7 the specimen archive'], ['type', 'bungee / bricolage grotesque / space mono / caveat'], ['move', 'token registry: every visual decision is a named --tkn-* property; components never use raw values'], ['density', 'high, catalogued ephemera with air at section boundaries'], ['motion', 'stamp slam, squish boop, match reveal print \u2014 interaction only']])}
    </div>
  </div>`;

  const root4 = mount.querySelector('.impec4');
  themeToggle(root4);

  const slamBtn = root4.querySelector('.i4-go-slam');
  const slamStamp = root4.querySelector('.i4-demo-stamp');
  if (slamBtn && slamStamp) slamBtn.onclick = () => {
    slamStamp.style.visibility = 'visible';
    slamStamp.classList.remove('go'); void slamStamp.offsetWidth; slamStamp.classList.add('go');
  };

  const boopBtn = root4.querySelector('.i4-go-boop');
  const boopCell = root4.querySelector('.i4-demo-boop');
  if (boopBtn && boopCell) boopBtn.onclick = () => {
    boopCell.classList.remove('go'); void boopCell.offsetWidth; boopCell.classList.add('go');
  };

  const printBtn = root4.querySelector('.i4-go-print');
  const printCell = root4.querySelector('.i4-demo-print');
  if (printBtn && printCell) printBtn.onclick = () => {
    printCell.classList.remove('go'); void printCell.offsetWidth; printCell.classList.add('go');
  };

  const countBtn = root4.querySelector('#i4-countbtn');
  let i4n = 0;
  if (countBtn) countBtn.onclick = () => { i4n += 1; countBtn.textContent = i4n; };
};

})();
