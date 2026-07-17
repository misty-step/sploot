/* lanes/emil.js · gallery-lab-001 · lane: emil
   philosophy: fluid physical interaction. the gallery is a place, not a page.
   the thing you touch is the thing that moves. detail grows out of the tile
   you touched and snaps back to its slot on close. sheets slide from screen
   edges with visible grabbers. gestures get named in machine text where the
   machine speaks. nothing teleports; everything has a home it returns to. */

const pct = (s) => `${Math.round(parseFloat(s) * 100)}%`;

/* own tile builder on the shared .cell grammar. whole-tile open is one inset
   overlay button (z1, transparent, never covers the artwork visually); rail
   minis and chips are siblings stacked above it (z2). every state marker
   renders inside the article, inside the card transform. */
function tile(item, o = {}) {
  const L = globalThis.LAB;
  const st = o.state || 'default';
  const cls = ['cell'];
  if (o.cls) cls.push(o.cls);
  if (st === 'match') cls.push('cell--match');
  if (st === 'near') cls.push('cell--near');
  if (st === 'dim') cls.push('cell--dim');
  if (st === 'selected') cls.push('cell--selected');
  const open = o.open === false ? '' : `<button class="tile-open" aria-label="open ${item.cap}"></button>`;
  const badge = st === 'match' ? `<span class="cell-badge animate-sploot-stamp">match ${pct(item.score)}</span>` : '';
  const grab = st === 'selected' ? `<span class="grab-chip animate-sploot-stamp">${L.icon('check', 12)} grabbed</span>` : '';
  const tab = o.tab === false ? '' : `<div class="cell-tab tone-${item.tone}"><span>${item.file}</span><span>${item.index}</span></div>`;
  const scoreTxt = o.score && item.role ? `${item.role} ${pct(item.score)}` : '';
  const heart = item.banger ? `<span class="cap-heart" role="img" aria-label="banger">${L.icon('heartFill', 12)}</span>` : '';
  const cap = o.caption === false
    ? ''
    : `<div class="cell-caption"><p>${item.cap}</p>${heart}${scoreTxt ? `<b class="sploot-tabular">${scoreTxt}</b>` : ''}</div>`;
  const rail = o.rail ? railRow(item) : '';
  return `<article class="${cls.join(' ')}" data-id="${item.id}">${open}${badge}${grab}${tab}
    <div class="cell-media" style="aspect-ratio:${o.aspect ?? item.aspect};">${L.doodle(item.kind, { label: item.cap, size: '52%' })}</div>${cap}${rail}</article>`;
}

function railRow(item) {
  const L = globalThis.LAB;
  return `<div class="tile-rail">
    <button class="sploot-ctl" aria-pressed="${item.banger}" aria-label="${item.banger ? 'banger. tap to unmark' : 'mark as banger'}">${L.icon(item.banger ? 'heartFill' : 'heart', 16)}</button>
    <button class="sploot-ctl" aria-label="share">${L.icon('share', 16)}</button>
    <button class="sploot-ctl" aria-label="trash">${L.icon('trash', 16)}</button>
  </div>`;
}

function socket(label, o = {}) {
  return `<div class="socket" aria-hidden="true" style="aspect-ratio:${o.aspect || 1};"><span class="mono">${label}</span></div>`;
}

function pileChips() {
  const L = globalThis.LAB;
  return `<button class="pill pill--on">all memes<small>${L.stats.total} in the pile</small></button>`
    + L.piles.map((p) => `<button class="pill">${p.conf < 0.56 ? 'maybe ' : ''}${p.label}<small>${p.count} in pile</small></button>`).join('');
}

/* ================================================================
   EMIL-1 · the shelf that opens
   left pile drawer pinned to the screen edge with a visible grabber;
   uniform 6-col shelf; detail EXPANDS IN PLACE inside the grid (rows
   part around it) and snaps back to its slot. nothing ever leaves
   the page; the page is the place.
   ================================================================ */

const CSS1 = `<style>
[data-opt="EMIL-1"] { display:grid; grid-template-columns:272px minmax(0,1fr); align-items:stretch; }
[data-opt="EMIL-1"] .tile-open { position:absolute; inset:0; z-index:1; border:0; background:transparent; border-radius:inherit; cursor:pointer; }
[data-opt="EMIL-1"] .tile-rail { position:relative; z-index:2; display:flex; gap:6px; justify-content:flex-end; padding:6px 10px; border-top:2px dashed var(--sploot-ink); }
[data-opt="EMIL-1"] .grab-chip { position:absolute; left:8px; top:8px; z-index:3; display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-purple); color:var(--sploot-on-purple); font-family:var(--font-mono); font-size:0.58rem; font-weight:700; }
[data-opt="EMIL-1"] .cap-heart { flex-shrink:0; display:inline-flex; color:var(--sploot-magenta); }

[data-opt="EMIL-1"] .drawer { position:relative; display:flex; flex-direction:column; gap:12px; padding:18px 20px 16px 16px; background:var(--sploot-paper-warm); border-right:3px solid var(--sploot-ink); }
[data-opt="EMIL-1"] .drawer-grab { position:absolute; right:-10px; top:50%; margin-top:-32px; width:16px; height:64px; border:3px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); box-shadow:var(--sploot-shadow-sm); z-index:5; }
[data-opt="EMIL-1"] .drawer h1 { margin:0; font-size:1.25rem; }
[data-opt="EMIL-1"] .machine-top { margin:0; font-size:0.58rem; opacity:0.65; }
[data-opt="EMIL-1"] .pilelist { display:flex; flex-direction:column; gap:8px; }
[data-opt="EMIL-1"] .pilelist .pill { width:100%; }
[data-opt="EMIL-1"] .dim-note { margin:0; font-size:0.62rem; opacity:0.7; border:2px dashed var(--sploot-ink); border-radius:var(--sploot-radius-inner); padding:10px; }
[data-opt="EMIL-1"] .statgrid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
[data-opt="EMIL-1"] .stat { display:flex; flex-direction:column; gap:2px; padding:6px 9px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-inner); background:var(--sploot-panel); }
[data-opt="EMIL-1"] .stat .sk { font-family:var(--font-mono); font-size:0.55rem; opacity:0.7; }
[data-opt="EMIL-1"] .stat .sv { font-family:var(--font-display); font-weight:400; font-size:0.95rem; }
[data-opt="EMIL-1"] .drawer .machine { margin-top:auto; margin-bottom:0; font-family:var(--font-mono); font-size:0.58rem; opacity:0.7; border-top:2px dashed var(--sploot-ink); padding-top:8px; }

[data-opt="EMIL-1"] .main { display:flex; flex-direction:column; min-width:0; }
[data-opt="EMIL-1"] .strip { display:flex; align-items:center; gap:12px; padding:12px 20px; border-bottom:3px solid var(--sploot-ink); background:var(--sploot-paper); position:sticky; top:0; z-index:20; }
[data-opt="EMIL-1"] .searchbar { flex:1; display:flex; align-items:center; gap:10px; min-height:44px; padding:6px 18px; border:3px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); box-shadow:var(--sploot-shadow-sm); font-weight:700; }
[data-opt="EMIL-1"] .searchbar input { border:0; background:transparent; flex:1; font:inherit; color:var(--sploot-ink); min-width:0; }
[data-opt="EMIL-1"] .statusline { font-family:var(--font-mono); font-size:0.66rem; white-space:nowrap; opacity:0.85; }
[data-opt="EMIL-1"] .gridwrap { flex:1; padding:16px 20px 48px; }
[data-opt="EMIL-1"] .grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; grid-auto-flow:dense; align-items:start; }
[data-opt="EMIL-1"] .scanline, [data-opt="EMIL-1"] .foundline { display:flex; align-items:center; gap:8px; margin:0 0 12px; font-weight:700; }
[data-opt="EMIL-1"] .scanline { font-family:var(--font-mono); font-size:0.7rem; }

[data-opt="EMIL-1"] .expanded { grid-column:span 3; grid-row:span 2; display:flex; flex-direction:column; overflow:hidden; background:var(--sploot-panel); border:var(--sploot-border-thick); border-radius:var(--sploot-radius); box-shadow:var(--sploot-shadow-lg); }
[data-opt="EMIL-1"] .exp-origin { display:flex; align-items:center; gap:6px; padding:8px 12px; border-bottom:2px dashed var(--sploot-ink); font-size:0.6rem; }
[data-opt="EMIL-1"] .exp-body { display:grid; grid-template-columns:1.3fr 1fr; gap:12px; padding:12px; }
[data-opt="EMIL-1"] .exp-media { margin:0; display:flex; align-items:center; justify-content:center; padding:24px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-inner); background:var(--sploot-paper-warm); color:var(--sploot-ink); }
[data-opt="EMIL-1"] .exp-meta { display:flex; flex-direction:column; gap:10px; min-width:0; align-items:flex-start; }
[data-opt="EMIL-1"] .exp-cap { margin:0; font-weight:700; }
[data-opt="EMIL-1"] .kv { margin:0; font-family:var(--font-mono); font-size:0.62rem; opacity:0.85; }
[data-opt="EMIL-1"] .exp-meta .tile-rail { border-top:0; padding:0; }
[data-opt="EMIL-1"] .esc-hint { margin:0; font-family:var(--font-mono); font-size:0.6rem; opacity:0.75; }
[data-opt="EMIL-1"] .esc-hint kbd { border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); padding:1px 8px; font-family:var(--font-mono); }

[data-opt="EMIL-1"] .zerocard { display:flex; gap:16px; align-items:center; max-width:640px; margin:0 auto 16px; padding:20px; }
[data-opt="EMIL-1"] .zerocard h2 { margin:0 0 6px; font-size:1.2rem; }
[data-opt="EMIL-1"] .zerocard p { margin:0 0 12px; }
[data-opt="EMIL-1"] .zerocard svg { flex-shrink:0; }
[data-opt="EMIL-1"] .zrow { display:flex; gap:10px; flex-wrap:wrap; }

[data-opt="EMIL-1"] .onboard { max-width:680px; margin:32px auto 0; display:flex; flex-direction:column; gap:16px; }
[data-opt="EMIL-1"] .obcard { padding:24px; }
[data-opt="EMIL-1"] .obcard h2 { margin:0 0 6px; font-size:1.4rem; }
[data-opt="EMIL-1"] .obcard > p { margin:0 0 14px; }
[data-opt="EMIL-1"] .steps { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px; }
[data-opt="EMIL-1"] .step { display:flex; flex-direction:column; gap:6px; padding:10px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-inner); background:var(--sploot-paper-warm); }
[data-opt="EMIL-1"] .step b { font-size:0.8rem; }
[data-opt="EMIL-1"] .step p { margin:0; font-size:0.7rem; }
[data-opt="EMIL-1"] .dropzone { display:grid; place-items:center; min-height:96px; border:3px dashed var(--sploot-ink); border-radius:var(--sploot-radius); margin-bottom:14px; }
[data-opt="EMIL-1"] .dropzone .mono { font-size:0.66rem; opacity:0.75; }
[data-opt="EMIL-1"] .ghostrow { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }

[data-opt="EMIL-1"] .tray { position:fixed; right:20px; bottom:20px; z-index:35; display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:12px 16px; background:var(--sploot-panel); border:var(--sploot-border); border-radius:var(--sploot-radius); box-shadow:var(--sploot-shadow-lg); }
[data-opt="EMIL-1"] .traycount { font-size:0.66rem; font-weight:700; }
[data-opt="EMIL-1"] .proxies { display:flex; gap:6px; }
[data-opt="EMIL-1"] .proxy { width:44px; height:44px; display:grid; place-items:center; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-inner); background:var(--sploot-paper-warm); color:var(--sploot-ink); }
[data-opt="EMIL-1"] .trayhint { width:100%; margin:0; font-size:0.58rem; opacity:0.7; }

[data-opt="EMIL-1"] .socket { border:3px dashed var(--sploot-ink); border-radius:var(--sploot-radius); opacity:0.5; display:grid; place-items:center; }
[data-opt="EMIL-1"] .socket .mono { font-size:0.6rem; }
[data-opt="EMIL-1"] .msheet { display:none; }

@media (max-width: 767px) {
  [data-opt="EMIL-1"] { grid-template-columns:1fr; }
  [data-opt="EMIL-1"] .drawer { display:none; }
  [data-opt="EMIL-1"] .strip { padding:10px 12px; }
  [data-opt="EMIL-1"] .strip .searchbar, [data-opt="EMIL-1"] .strip .btn { display:none; }
  [data-opt="EMIL-1"] .strip h1 { margin:0; font-size:1.05rem; font-family:var(--font-display); font-weight:400; }
  [data-opt="EMIL-1"] .grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  [data-opt="EMIL-1"] .gridwrap { padding:10px 10px 210px; }
  [data-opt="EMIL-1"] .expanded { grid-column:span 2; }
  [data-opt="EMIL-1"] .exp-body { grid-template-columns:1fr; }
  [data-opt="EMIL-1"] .steps { grid-template-columns:1fr; }
  [data-opt="EMIL-1"] .ghostrow { grid-template-columns:repeat(2,1fr); }
  [data-opt="EMIL-1"] .msheet { display:flex; flex-direction:column; gap:8px; position:fixed; left:0; right:0; bottom:0; z-index:30; background:var(--sploot-panel); border-top:3px solid var(--sploot-ink); border-radius:var(--sploot-radius) var(--sploot-radius) 0 0; padding:2px 12px calc(10px + env(safe-area-inset-bottom)); }
  [data-opt="EMIL-1"] .msheet .grab { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-height:44px; border:0; background:transparent; color:var(--sploot-ink); }
  [data-opt="EMIL-1"] .msheet .grab .bar { width:56px; height:6px; border-radius:var(--sploot-radius-pill); background:var(--sploot-ink); }
  [data-opt="EMIL-1"] .msheet .glabel { font-family:var(--font-mono); font-size:0.56rem; opacity:0.65; }
  [data-opt="EMIL-1"] .mrow { display:flex; gap:8px; align-items:center; }
  [data-opt="EMIL-1"] .mrow .searchbar { display:flex; box-shadow:none; background:var(--sploot-paper-warm); }
  [data-opt="EMIL-1"] .mrow .sploot-ctl { width:44px; height:44px; flex-shrink:0; }
  [data-opt="EMIL-1"] .chips { display:flex; gap:8px; overflow-x:auto; padding-bottom:2px; }
  [data-opt="EMIL-1"] .chips .pill { flex:none; }
  [data-opt="EMIL-1"] .mstatus { margin:0; font-size:0.58rem; opacity:0.7; border-top:2px dashed var(--sploot-ink); padding-top:6px; }
  [data-opt="EMIL-1"][data-st="selected"] .msheet { display:none; }
  [data-opt="EMIL-1"] .tray { left:0; right:0; bottom:0; border-radius:var(--sploot-radius) var(--sploot-radius) 0 0; border-bottom:0; box-shadow:none; }
}
</style>`;

function e1Stat(k, v) {
  return `<div class="stat"><span class="sk">${k}</span><b class="sv sploot-tabular">${v}</b></div>`;
}

function e1Chrome(state, opts) {
  const L = globalThis.LAB;
  const s = L.stats;
  const empty = !!opts.empty;
  const piles = empty
    ? `<p class="dim-note mono">no piles yet. piles grow out of your saves on their own, no folders required.</p>`
    : `<div class="pilelist" role="group" aria-label="piles">
        <button class="pill pill--on">all memes<small>${s.total} in the pile</small></button>
        ${L.piles.map((p) => `<button class="pill">${p.conf < 0.56 ? 'maybe ' : ''}${p.label}<small>${p.count} in pile · ${Math.round(p.conf * 100)}% sure</small></button>`).join('')}
      </div>`;
  const stats = empty
    ? `<div class="statgrid">${e1Stat('memes', '0')}${e1Stat('embedded', '0')}${e1Stat('queue', '0')}${e1Stat('storage', '0 b')}</div>`
    : `<div class="statgrid">${e1Stat('memes', s.total)}${e1Stat('embedded', s.embedded)}${e1Stat('queue', s.queue)}${e1Stat('storage', s.storage)}</div>`;
  const status = opts.status || `${s.total} in the pile · ${s.embedded} embedded · queue ${s.queue}`;
  const searchbar = `<div class="searchbar">${L.icon('search')}<input value="${opts.query || ''}" placeholder="type words. get the picture." aria-label="search the pile" /></div>`;
  return `<div class="opt" data-opt="EMIL-1" data-st="${state}">${CSS1}
  <aside class="drawer animate-sploot-slide-up" aria-label="piles and library stats">
    <span class="drawer-grab" aria-hidden="true"></span>
    <h1 class="display">the pile</h1>
    <p class="machine-top mono">drag edge to widen · the shelf stays put</p>
    ${piles}
    ${stats}
    <p class="machine">v-48 index · clip scorer · route /api/search</p>
  </aside>
  <main class="main">
    <div class="strip">
      <h1 class="display" style="display:none;">the pile</h1>
      ${searchbar}
      <button class="btn btn--blue sploot-press">${L.icon('upload')} upload</button>
      <button class="btn sploot-press">${L.icon('shuffle')} shuffle</button>
      <span class="statusline sploot-tabular">${status}</span>
    </div>
    <div class="gridwrap bg-sploot-workbench">${opts.body}</div>
  </main>
  <nav class="msheet" aria-label="commands">
    <button class="grab" aria-label="drag up for piles and tools"><span class="bar"></span><span class="glabel">piles live down here · drag up</span></button>
    <div class="mrow">
      <div class="searchbar">${L.icon('search')}<input value="${opts.query || ''}" placeholder="type words. get the picture." aria-label="search the pile" /></div>
      <button class="sploot-ctl" aria-label="upload">${L.icon('upload')}</button>
      <button class="sploot-ctl" aria-label="shuffle">${L.icon('shuffle')}</button>
    </div>
    <div class="chips">${empty ? '' : pileChips()}</div>
    <p class="mstatus mono sploot-tabular">${status}</p>
  </nav>
  ${opts.tray || ''}</div>`;
}

function e1Grid(cells) {
  return `<div class="grid">${cells}</div>`;
}

function e1Render(state) {
  const L = globalThis.LAB;
  const C = L.corpus;
  const s = L.stats;

  if (state === 'empty') {
    const step = (ic, t, d) => `<div class="step">${L.icon(ic, 20)}<b>${t}</b><p>${d}</p></div>`;
    return e1Chrome(state, {
      empty: true,
      status: '0 in the pile · the machine is ready',
      body: `<div class="onboard">
        <div class="sploot-card obcard animate-sploot-pop">
          <h2 class="display">the shelf is bare</h2>
          <p>zero memes so far. here is how the pile starts:</p>
          <div class="steps">
            ${step('camera', 'screenshot it', 'anything cursed on your screen counts.')}
            ${step('link', 'clip it', 'the extension grabs images from any tab.')}
            ${step('upload', 'drop it', 'drag files onto this shelf. they settle into slots.')}
          </div>
          <div class="dropzone"><span class="mono">drag chaos here · it rubber-bands into place</span></div>
          <button class="btn btn--blue sploot-press">${L.icon('upload')} upload your first meme</button>
        </div>
        <div class="ghostrow">${socket('open slot')}${socket('open slot')}${socket('open slot')}${socket('open slot')}</div>
      </div>`,
    });
  }

  if (state === 'searching') {
    return e1Chrome(state, {
      query: L.query,
      status: `<span class="animate-sploot-pulse">scanning ${s.embedded} embedded …</span>`,
      body: `<p class="scanline animate-sploot-pulse">${L.icon('sparkle', 16)} reading the shelf for "${L.query}" · nothing moves until it lands</p>
        ${e1Grid(C.map((m) => tile(m, { state: 'dim', aspect: 1 })).join(''))}`,
    });
  }

  if (state === 'results') {
    return e1Chrome(state, {
      query: L.query,
      status: `1 match · 3 near · of ${s.total} total`,
      body: `<p class="foundline">found it on the shelf. 1 match, 3 near, the rest are asleep.</p>
        ${e1Grid(C.map((m) => tile(m, { state: m.role || 'dim', score: true, rail: !!m.role, aspect: 1 })).join(''))}`,
    });
  }

  if (state === 'zero') {
    return e1Chrome(state, {
      query: L.zeroQuery,
      status: `0 matches · all ${s.total} still on the shelf`,
      body: `<div class="zerocard sploot-card animate-sploot-pop">
          ${L.doodle('ghost', { label: 'nothing here', size: '72' })}
          <div>
            <h2 class="display">zero hits</h2>
            <p>"${L.zeroQuery}" matches nothing here. the shelf did not move; all ${s.total} memes sit below, unbothered.</p>
            <div class="zrow">
              <button class="btn sploot-press">${L.icon('x')} clear search</button>
              <button class="btn btn--blue sploot-press">${L.icon('upload')} upload it instead</button>
            </div>
          </div>
        </div>
        ${e1Grid(C.map((m) => tile(m, { state: 'dim', aspect: 1 })).join(''))}`,
    });
  }

  if (state === 'selected') {
    const picked = [0, 5, 9];
    const tray = `<aside class="tray animate-sploot-slide-up" role="region" aria-label="grabbed memes tray">
      <span class="traycount mono sploot-tabular">3 grabbed · of ${s.total}</span>
      <div class="proxies" aria-hidden="true">${picked.map((i) => `<span class="proxy">${L.doodle(C[i].kind, { size: '26' })}</span>`).join('')}</div>
      <button class="sploot-ctl" aria-label="banger all three">${L.icon('heart')}</button>
      <button class="sploot-ctl" aria-label="share all three">${L.icon('share')}</button>
      <button class="sploot-ctl" aria-label="trash all three">${L.icon('trash')}</button>
      <button class="btn sploot-press">${L.icon('x', 16)} drop all</button>
      <p class="trayhint mono">tap a tile to grab it · it hops down into this tray</p>
    </aside>`;
    return e1Chrome(state, {
      status: `3 grabbed · ${s.total} in the pile`,
      body: e1Grid(C.map((m) => tile(m, { state: picked.includes(m.id) ? 'selected' : 'default', aspect: 1 })).join('')),
      tray,
    });
  }

  if (state === 'detail') {
    const m = C[0];
    const expanded = `<section class="expanded animate-sploot-pop" role="dialog" aria-modal="true" aria-label="expanded view: ${m.cap}">
      <div class="exp-origin mono">${L.icon('expand', 14)} grew from its slot · ${m.index} · snaps back on close</div>
      <div class="exp-body">
        <figure class="exp-media" style="aspect-ratio:${m.aspect};">${L.doodle(m.kind, { label: m.cap, size: '60%' })}</figure>
        <div class="exp-meta">
          <span class="sticker tone-${m.tone}">${m.file}</span>
          <p class="exp-cap">${m.cap}</p>
          <p class="kv">${m.index} · clip scorer · last query read match ${pct(m.score)} (${m.score} cosine)</p>
          <p class="kv">kind: ${m.kind} · status: embedded</p>
          ${railRow(m)}
          <button class="btn sploot-press" aria-label="close and return to its slot">${L.icon('x', 16)} put it back</button>
          <p class="esc-hint"><kbd>esc</kbd> also puts it back · the grid never moves under you</p>
        </div>
      </div>
    </section>`;
    return e1Chrome(state, {
      status: `1 open · ${s.total} in the pile`,
      body: e1Grid(expanded + C.slice(1).map((m2) => tile(m2, { aspect: 1 })).join('')),
    });
  }

  return e1Chrome(state, { body: e1Grid(C.map((m) => tile(m, { aspect: 1 })).join('')) });
}

/* ================================================================
   EMIL-2 · thumb console
   the inversion: mobile is the primary design and desktop derives
   from it. zero top chrome on any breakpoint. one bottom command
   sheet (peek / half / full, visible grabber) runs search, piles,
   selection and results on desktop AND mobile. results get pulled
   off the shelf into the sheet's tray, leaving dashed sockets;
   detail lifts the tile to center stage, socket marks its home.
   ================================================================ */

const CSS2 = `<style>
[data-opt="EMIL-2"] { position:relative; display:block; }
[data-opt="EMIL-2"] .tile-open { position:absolute; inset:0; z-index:1; border:0; background:transparent; border-radius:inherit; cursor:pointer; }
[data-opt="EMIL-2"] .tile-rail { position:relative; z-index:2; display:flex; gap:6px; justify-content:flex-end; padding:6px 10px; border-top:2px dashed var(--sploot-ink); }
[data-opt="EMIL-2"] .grab-chip { position:absolute; left:8px; top:8px; z-index:3; display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-purple); color:var(--sploot-on-purple); font-family:var(--font-mono); font-size:0.58rem; font-weight:700; }
[data-opt="EMIL-2"] .cap-heart { flex-shrink:0; display:inline-flex; color:var(--sploot-magenta); }
[data-opt="EMIL-2"] .held { transform:rotate(-1.4deg); }

[data-opt="EMIL-2"] .shelf { display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); gap:10px; align-content:start; min-height:100dvh; padding:14px 14px 240px; }
[data-opt="EMIL-2"] .cell-media { margin:6px; padding:8px; }
[data-opt="EMIL-2"] .cell-caption { padding:4px 8px; border-top-width:2px; }
[data-opt="EMIL-2"] .cell-caption p { font-size:0.62rem; }
[data-opt="EMIL-2"] .socket { border:3px dashed var(--sploot-ink); border-radius:var(--sploot-radius); opacity:0.5; display:grid; place-items:center; min-height:120px; }
[data-opt="EMIL-2"] .socket .mono { font-size:0.58rem; text-align:center; padding:4px; }
[data-opt="EMIL-2"] .bare { grid-column:1 / -1; display:flex; flex-direction:column; gap:12px; padding-top:24px; }
[data-opt="EMIL-2"] .bare p { margin:0; font-size:0.66rem; opacity:0.75; }
[data-opt="EMIL-2"] .socketrow { display:grid; grid-template-columns:repeat(8,1fr); gap:10px; }

[data-opt="EMIL-2"] .sheet { position:fixed; left:50%; transform:translateX(-50%); bottom:0; width:min(760px, calc(100% - 20px)); z-index:30; display:flex; flex-direction:column; gap:8px; background:var(--sploot-panel); border:3px solid var(--sploot-ink); border-bottom:0; border-radius:var(--sploot-radius) var(--sploot-radius) 0 0; padding:2px 14px calc(10px + env(safe-area-inset-bottom)); }
[data-opt="EMIL-2"] .sheet .grab { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-height:44px; border:0; background:transparent; color:var(--sploot-ink); }
[data-opt="EMIL-2"] .sheet .grab .bar { width:58px; height:6px; border-radius:var(--sploot-radius-pill); background:var(--sploot-ink); }
[data-opt="EMIL-2"] .glabel { font-family:var(--font-mono); font-size:0.56rem; opacity:0.65; }
[data-opt="EMIL-2"] .srow { display:flex; gap:8px; align-items:center; }
[data-opt="EMIL-2"] .searchbar { flex:1; display:flex; align-items:center; gap:8px; min-height:44px; padding:4px 16px; border:3px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-paper-warm); font-weight:700; }
[data-opt="EMIL-2"] .searchbar input { border:0; background:transparent; flex:1; font:inherit; color:var(--sploot-ink); min-width:0; }
[data-opt="EMIL-2"] .srow .sploot-ctl { width:44px; height:44px; flex-shrink:0; }
[data-opt="EMIL-2"] .chips { display:flex; gap:8px; overflow-x:auto; padding:2px 0 4px; }
[data-opt="EMIL-2"] .chips .pill { flex:none; }
[data-opt="EMIL-2"] .machine { margin:0; font-family:var(--font-mono); font-size:0.58rem; opacity:0.7; border-top:2px dashed var(--sploot-ink); padding-top:6px; }
[data-opt="EMIL-2"] .ghint { display:flex; align-items:center; gap:6px; margin:0; font-family:var(--font-mono); font-size:0.6rem; opacity:0.7; }

[data-opt="EMIL-2"] .pulling { display:flex; flex-direction:column; gap:6px; padding:6px 0; }
[data-opt="EMIL-2"] .pulling .pulse { display:flex; align-items:center; gap:8px; margin:0; font-family:var(--font-mono); font-size:0.66rem; font-weight:700; }
[data-opt="EMIL-2"] .trayhead { margin:0; font-family:var(--font-mono); font-size:0.62rem; font-weight:700; }
[data-opt="EMIL-2"] .tray { display:flex; gap:10px; overflow-x:auto; padding:6px 2px 8px; }
[data-opt="EMIL-2"] .traycell { flex:0 0 172px; }

[data-opt="EMIL-2"] .zerotray { display:flex; gap:14px; align-items:flex-start; padding:8px 0 4px; }
[data-opt="EMIL-2"] .zerotray svg { flex-shrink:0; }
[data-opt="EMIL-2"] .zline { margin:0 0 4px; font-weight:700; }
[data-opt="EMIL-2"] .zsub { margin:0 0 10px; font-family:var(--font-mono); font-size:0.62rem; opacity:0.8; }
[data-opt="EMIL-2"] .zbtns { display:flex; gap:8px; flex-wrap:wrap; }

[data-opt="EMIL-2"] .bulk { display:flex; flex-direction:column; gap:8px; padding:4px 0; }
[data-opt="EMIL-2"] .bulkcount { margin:0; font-family:var(--font-mono); font-size:0.66rem; font-weight:700; }
[data-opt="EMIL-2"] .bulkbtns { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }

[data-opt="EMIL-2"] .edu { display:flex; flex-direction:column; gap:10px; padding:6px 0; }
[data-opt="EMIL-2"] .edu h2 { margin:0; font-size:1.3rem; }
[data-opt="EMIL-2"] .edu > p { margin:0; }
[data-opt="EMIL-2"] .steps { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
[data-opt="EMIL-2"] .step { display:flex; flex-direction:column; gap:6px; padding:10px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-inner); background:var(--sploot-paper-warm); }
[data-opt="EMIL-2"] .step b { font-size:0.8rem; }
[data-opt="EMIL-2"] .step p { margin:0; font-size:0.7rem; }
[data-opt="EMIL-2"] .edu .btn { align-self:flex-start; }

[data-opt="EMIL-2"] .stage { position:fixed; inset:0; z-index:40; display:grid; place-items:center; padding:18px; pointer-events:none; }
[data-opt="EMIL-2"] .stage-card { pointer-events:auto; width:min(880px, 100%); max-height:calc(100dvh - 36px); overflow:auto; background:var(--sploot-panel); border:var(--sploot-border-thick); border-radius:var(--sploot-radius); box-shadow:var(--sploot-shadow-lg); }
[data-opt="EMIL-2"] .stage-grab { width:100%; display:flex; flex-direction:column; align-items:center; gap:3px; min-height:44px; padding:8px; border:0; border-bottom:2px dashed var(--sploot-ink); background:transparent; color:var(--sploot-ink); }
[data-opt="EMIL-2"] .stage-grab .bar { width:58px; height:6px; border-radius:var(--sploot-radius-pill); background:var(--sploot-ink); }
[data-opt="EMIL-2"] .stage-grab .mono { font-size:0.58rem; opacity:0.7; }
[data-opt="EMIL-2"] .stage-body { display:grid; grid-template-columns:1.35fr 1fr; gap:14px; padding:14px; }
[data-opt="EMIL-2"] .stage-media { margin:0; display:flex; align-items:center; justify-content:center; padding:24px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-inner); background:var(--sploot-paper-warm); color:var(--sploot-ink); }
[data-opt="EMIL-2"] .stage-meta { display:flex; flex-direction:column; gap:10px; align-items:flex-start; min-width:0; }
[data-opt="EMIL-2"] .scap { margin:0; font-weight:700; }
[data-opt="EMIL-2"] .kv { margin:0; font-family:var(--font-mono); font-size:0.62rem; opacity:0.85; }
[data-opt="EMIL-2"] .stage-meta .tile-rail { border-top:0; padding:0; }
[data-opt="EMIL-2"] .stagenav { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:auto; }
[data-opt="EMIL-2"] .esc-hint { margin:0; font-family:var(--font-mono); font-size:0.6rem; opacity:0.75; }
[data-opt="EMIL-2"] .esc-hint kbd { border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); padding:1px 8px; font-family:var(--font-mono); }

@media (max-width: 767px) {
  [data-opt="EMIL-2"] .shelf { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; padding:10px 10px 270px; }
  [data-opt="EMIL-2"] .socketrow { grid-template-columns:repeat(2,1fr); }
  [data-opt="EMIL-2"] .sheet { width:calc(100% - 12px); }
  [data-opt="EMIL-2"] .steps { grid-template-columns:1fr; }
  [data-opt="EMIL-2"] .stage { padding:8px; }
  [data-opt="EMIL-2"] .stage-body { grid-template-columns:1fr; }
  [data-opt="EMIL-2"] .traycell { flex-basis:150px; }
}
</style>`;

function e2Chrome(state, opts) {
  const L = globalThis.LAB;
  const s = L.stats;
  const status = opts.status || `${s.total} in the pile · ${s.embedded} embedded · queue ${s.queue} · ${s.storage}`;
  return `<div class="opt" data-opt="EMIL-2" data-st="${state}">${CSS2}
  <main class="shelf bg-sploot-workbench" aria-label="the pile">${opts.body}</main>
  <section class="sheet animate-sploot-slide-up" role="region" aria-label="command sheet, ${opts.sheet || 'peek'} height">
    <button class="grab" aria-label="${opts.grabLabel || 'drag the sheet up for more'}"><span class="bar"></span><span class="glabel">${opts.grabText || 'the console lives down here · drag up for more'}</span></button>
    <div class="srow">
      <div class="searchbar">${L.icon('search')}<input value="${opts.query || ''}" placeholder="type words. get the picture." aria-label="search the pile" /></div>
      <button class="sploot-ctl" aria-label="upload">${L.icon('upload')}</button>
      <button class="sploot-ctl" aria-label="shuffle">${L.icon('shuffle')}</button>
    </div>
    ${opts.inner ?? `<div class="chips">${pileChips()}</div>`}
    <p class="machine sploot-tabular">${status}</p>
  </section>
  ${opts.stage || ''}</div>`;
}

function e2Render(state) {
  const L = globalThis.LAB;
  const C = L.corpus;
  const s = L.stats;
  const shelfTile = (m, o = {}) => tile(m, { tab: false, aspect: 1, ...o });

  if (state === 'empty') {
    const step = (ic, t, d) => `<div class="step">${L.icon(ic, 20)}<b>${t}</b><p>${d}</p></div>`;
    return e2Chrome(state, {
      sheet: 'full',
      grabText: 'sheet fully up · this is the whole console',
      status: '0 in the pile · index empty · waiting',
      body: `<div class="bare">
        <p class="mono">the shelf is bare · 0 memes · every slot below is open</p>
        <div class="socketrow">${Array.from({ length: 8 }, () => socket('open slot')).join('')}</div>
      </div>`,
      inner: `<div class="edu animate-sploot-slide-up">
        <h2 class="display">start the pile</h2>
        <p>zero memes so far. three ways in:</p>
        <div class="steps">
          ${step('camera', 'screenshot it', 'anything cursed on your screen counts.')}
          ${step('link', 'clip it', 'the extension grabs images from any tab.')}
          ${step('upload', 'drop it', 'drag files anywhere on the shelf. they rubber-band into slots.')}
        </div>
        <button class="btn btn--blue sploot-press">${L.icon('upload')} upload the first one</button>
      </div>`,
    });
  }

  if (state === 'searching') {
    return e2Chrome(state, {
      sheet: 'half',
      query: L.query,
      grabText: 'sheet at half · results land here',
      status: `searching · ${s.total} in the pile`,
      inner: `<div class="pulling">
        <p class="pulse animate-sploot-pulse">${L.icon('sparkle', 16)} pulling matches for "${L.query}" from ${s.embedded} embedded …</p>
        <p class="ghint">swipe down to cancel · the shelf stays where you left it</p>
      </div>`,
      body: C.map((m) => shelfTile(m, { state: 'dim' })).join(''),
    });
  }

  if (state === 'results') {
    const hits = C.filter((m) => m.role);
    return e2Chrome(state, {
      sheet: 'half',
      query: L.query,
      grabText: 'sheet at half · 4 in the tray',
      status: `1 match · 3 near · for "${L.query}"`,
      inner: `<p class="trayhead">4 pulled off the shelf · ${s.total - hits.length} stay put · ${s.total} total</p>
      <div class="tray" role="list" aria-label="results tray">
        ${hits.map((m) => `<div class="traycell" role="listitem">${tile(m, { state: m.role, score: true, rail: true, aspect: 1, tab: false })}</div>`).join('')}
      </div>
      <p class="ghint">${L.icon('arrowL', 12)} swipe the tray · tap one to lift it ${L.icon('arrowR', 12)}</p>`,
      body: C.map((m) => (m.role ? socket('in the tray', { aspect: 1 }) : shelfTile(m, { state: 'dim' }))).join(''),
    });
  }

  if (state === 'zero') {
    return e2Chrome(state, {
      sheet: 'half',
      query: L.zeroQuery,
      grabText: 'sheet at half · the tray came back empty',
      status: `0 matches · ${s.total} in the pile, untouched`,
      inner: `<div class="zerotray">
        ${L.doodle('ghost', { label: 'empty tray', size: '56' })}
        <div>
          <p class="zline">zero hits. "${L.zeroQuery}" pulled nothing off the shelf.</p>
          <p class="zsub">all ${s.total} memes stay put above. tweak the words, or upload the thing you imagined.</p>
          <div class="zbtns">
            <button class="btn sploot-press">${L.icon('x', 16)} clear</button>
            <button class="btn btn--blue sploot-press">${L.icon('upload')} upload</button>
          </div>
        </div>
      </div>`,
      body: C.map((m) => shelfTile(m)).join(''),
    });
  }

  if (state === 'selected') {
    const picked = [0, 5, 9];
    return e2Chrome(state, {
      sheet: 'half',
      grabText: 'sheet at half · bulk moves ready',
      status: `3 in hand · of ${s.total} in the pile`,
      inner: `<div class="bulk">
        <p class="bulkcount sploot-tabular">3 in hand · of ${s.total}</p>
        <div class="bulkbtns">
          <button class="btn sploot-press">${L.icon('heart', 16)} banger all</button>
          <button class="btn sploot-press">${L.icon('share', 16)} share</button>
          <button class="btn btn--red sploot-press">${L.icon('trash', 16)} trash</button>
          <button class="sploot-ctl" aria-label="drop all three">${L.icon('x')}</button>
        </div>
        <p class="ghint">long-press grabs a tile · tap again drops it back on the shelf</p>
      </div>`,
      body: C.map((m) => shelfTile(m, picked.includes(m.id) ? { state: 'selected', cls: 'held' } : {})).join(''),
    });
  }

  if (state === 'detail') {
    const m = C[0];
    const stage = `<div class="stage">
      <div class="stage-card animate-sploot-pop" role="dialog" aria-modal="true" aria-label="lifted: ${m.cap}">
        <button class="stage-grab" aria-label="put it back, swipe down"><span class="bar"></span><span class="mono">swipe down to put it back</span></button>
        <div class="stage-body">
          <figure class="stage-media" style="aspect-ratio:${m.aspect};">${L.doodle(m.kind, { label: m.cap, size: '60%' })}</figure>
          <div class="stage-meta">
            <span class="sticker tone-${m.tone}">${m.file}</span>
            <p class="scap">${m.cap}</p>
            <p class="kv">${m.index} · clip scorer · match ${pct(m.score)} (${m.score} cosine)</p>
            <p class="kv">kind: ${m.kind} · status: embedded</p>
            ${railRow(m)}
            <div class="stagenav">
              <button class="sploot-ctl" aria-label="previous meme, flick right">${L.icon('arrowL')}</button>
              <button class="sploot-ctl" aria-label="next meme, flick left">${L.icon('arrowR')}</button>
              <button class="btn sploot-press" aria-label="close and return to the shelf">${L.icon('x', 16)} put it back</button>
            </div>
            <p class="esc-hint"><kbd>esc</kbd> drops it into its socket below</p>
          </div>
        </div>
      </div>
    </div>`;
    return e2Chrome(state, {
      grabText: 'shelf parked · one meme lifted',
      status: `detail open · slot ${m.index} held open on the shelf`,
      body: C.map((m2) => (m2.id === m.id ? socket('lifted from here', { aspect: 1 }) : shelfTile(m2, { state: 'dim' }))).join(''),
      stage,
    });
  }

  return e2Chrome(state, { body: C.map((m) => shelfTile(m)).join('') });
}

/* ================================================================ */

export const SPECS = {
  'EMIL-1': {
    name: 'the shelf that opens',
    lane: 'emil',
    move: 'left pile drawer with a visible edge grabber over a uniform 6-col shelf; detail expands in place inside the grid and snaps back to its slot',
    notes: 'grid crops to square for shelf rhythm; true aspect returns in the expanded card. tile rails render on match tiles, the tray and the expanded card only, to hold 6-col density (hover reveal is the prod path). the expanded card is inline so page scroll keeps working, but prod still needs a focus trap while it is open. mobile search lives in the bottom sheet; the top strip keeps counts only.',
    render(state) {
      return e1Render(state);
    },
  },
  'EMIL-2': {
    name: 'thumb console',
    lane: 'emil',
    move: 'inverted chrome: zero top bar on any breakpoint; one bottom command sheet (peek, half, full) runs search, piles, selection and results; hits get pulled into the sheet tray and detail lifts the tile off the shelf, leaving a dashed socket',
    notes: 'the sheet peek costs about 170px of viewport at all times; that is the bet: commands under the thumb beat chrome at the top, on desktop too. sheet heights are staged in static markup; prod needs a drag controller with snap points at peek, half and full. the lifted stage has no scrim on purpose, the dimmed shelf is the backdrop; prod needs a focus trap and inert on the shelf.',
    render(state) {
      return e2Render(state);
    },
  },
};
