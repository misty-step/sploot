/* lanes/afd.js · anthropic frontend design lane · gallery-lab-001
   Two structural pushes on the shipped toybox grammar:
   AFD-1 "the shelf stack" · piles ARE shelves (ledges toys sit on), not chips.
   AFD-2 "wall and remote" · chrome inverted: the grid is wallpaper touching
   all four edges; one floating console toy is the only chrome. */

const PCT = (s, w) => `${w} ${Math.round(parseFloat(s) * 100)}%`;

/* =========================================================================
   AFD-1 · the shelf stack
   ========================================================================= */

const CSS1 = `<style>
[data-opt="AFD-1"] { display:flex; flex-direction:column; min-height:100dvh; }
[data-opt="AFD-1"] .topbar { display:flex; align-items:center; gap:14px; padding:14px 26px; border-bottom:4px solid var(--sploot-ink); background:var(--sploot-paper); }
[data-opt="AFD-1"] .brand { font-size:1.35rem; }
[data-opt="AFD-1"] .searchpill { flex:1; max-width:430px; display:flex; align-items:center; gap:8px; min-height:44px; padding:4px 16px; border:var(--sploot-border); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); box-shadow:var(--sploot-shadow-sm); font-weight:700; }
[data-opt="AFD-1"] .searchpill input { flex:1; min-width:0; border:0; background:transparent; font:inherit; color:var(--sploot-ink); }
[data-opt="AFD-1"] .statline { margin-left:auto; font-size:0.64rem; opacity:0.85; text-align:right; }
[data-opt="AFD-1"] .stack { flex:1; display:flex; flex-direction:column; gap:44px; padding:26px 0 110px; }
[data-opt="AFD-1"] .shelf { padding:0 26px; }
[data-opt="AFD-1"] .shelf-row { display:flex; align-items:flex-end; gap:14px; overflow-x:auto; padding:10px 4px 6px; border-bottom:4px solid var(--sploot-ink); }
[data-opt="AFD-1"] .shelf-foot { display:flex; align-items:center; gap:12px; padding:0 18px; transform:translateY(-50%); }
[data-opt="AFD-1"] .ledgechip { background:var(--sploot-panel); cursor:pointer; }
[data-opt="AFD-1"] .ledgechip small { font-family:var(--font-mono); font-weight:700; font-size:0.6rem; opacity:0.8; margin-left:6px; }
[data-opt="AFD-1"] .ledgechip--maybe { border-style:dashed; }
[data-opt="AFD-1"] .ledgechip--hit { background:var(--sploot-lime); }
[data-opt="AFD-1"] .ledgechip--zero { background:var(--sploot-red); color:var(--sploot-on-red); }
[data-opt="AFD-1"] .shelf-note { font-size:0.62rem; opacity:0.85; background:var(--sploot-paper); padding:2px 10px; border-radius:var(--sploot-radius-pill); }
[data-opt="AFD-1"] .stoy { flex:0 0 auto; }
[data-opt="AFD-1"] .stoy .hit { position:absolute; inset:0; z-index:2; background:transparent; border:0; cursor:pointer; }
[data-opt="AFD-1"] .stoy .cell-caption { padding:5px 8px; }
[data-opt="AFD-1"] .stoy .cell-caption p { font-size:0.62rem; }
[data-opt="AFD-1"] .hh { display:inline-flex; flex-shrink:0; color:var(--sploot-ink); opacity:0.5; }
[data-opt="AFD-1"] .hh--on { color:var(--sploot-magenta); opacity:1; }
[data-opt="AFD-1"] .scoretag { flex-shrink:0; display:inline-flex; align-items:center; gap:3px; font-family:var(--font-mono); font-size:0.55rem; font-weight:700; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); padding:1px 7px; color:#1c1547; }
[data-opt="AFD-1"] .scoretag--match { background:var(--sploot-lime); }
[data-opt="AFD-1"] .scoretag--near { background:var(--sploot-orange); }
[data-opt="AFD-1"] .scoretag--picked { background:var(--sploot-purple); color:var(--sploot-on-purple); }
[data-opt="AFD-1"] .stoy--picked { transform:translateY(-8px); box-shadow:0 13px 0 var(--sploot-shadow-color); }
[data-opt="AFD-1"] .recede { opacity:0.42; filter:saturate(0.3); display:flex; flex-direction:column; gap:44px; }
[data-opt="AFD-1"] .skel { flex:0 0 auto; border:3px dashed var(--sploot-ink); border-radius:var(--sploot-radius); background:var(--sploot-paper-warm); }
[data-opt="AFD-1"] .endcap { flex:0 0 auto; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; width:110px; min-height:110px; margin-bottom:6px; border:3px dashed var(--sploot-ink); border-radius:var(--sploot-radius); background:transparent; color:var(--sploot-ink); font-family:var(--font-mono); font-size:0.62rem; font-weight:700; cursor:pointer; }
[data-opt="AFD-1"] .zerotoy { flex:0 0 auto; width:150px; height:150px; display:flex; align-items:center; justify-content:center; margin-bottom:6px; border:3px dashed var(--sploot-ink); border-radius:var(--sploot-radius); color:var(--sploot-ink); opacity:0.6; }
[data-opt="AFD-1"] .zerocard1 { flex:0 0 auto; display:flex; flex-direction:column; gap:10px; max-width:420px; padding:16px 20px; margin-bottom:6px; border:var(--sploot-border); border-radius:var(--sploot-radius); background:var(--sploot-panel); box-shadow:var(--sploot-shadow); }
[data-opt="AFD-1"] .stepcard { flex:0 0 auto; display:flex; flex-direction:column; align-items:flex-start; gap:8px; width:230px; padding:16px; margin-bottom:6px; border:var(--sploot-border); border-radius:var(--sploot-radius); background:var(--sploot-panel); box-shadow:var(--sploot-shadow); }
[data-opt="AFD-1"] .stepn { font-family:var(--font-mono); font-weight:700; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); padding:1px 9px; color:#1c1547; }
[data-opt="AFD-1"] .drawer { margin:0 26px; overflow:hidden; }
[data-opt="AFD-1"] .drawer-top { display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:3px solid var(--sploot-ink); background:var(--sploot-paper-warm); }
[data-opt="AFD-1"] .dt-label { flex:1; font-size:0.66rem; font-weight:700; }
[data-opt="AFD-1"] .esc-hint { background:var(--sploot-yellow); }
[data-opt="AFD-1"] .drawer-body { display:grid; grid-template-columns:1.35fr 1fr; }
[data-opt="AFD-1"] .drawer-media { display:flex; align-items:center; justify-content:center; min-height:320px; padding:30px; background:var(--sploot-paper-warm); border-right:3px solid var(--sploot-ink); color:var(--sploot-ink); }
[data-opt="AFD-1"] .drawer-meta { display:flex; flex-direction:column; align-items:flex-start; gap:12px; padding:18px; }
[data-opt="AFD-1"] .drawer-meta h2 { margin:0; font-size:1.15rem; text-transform:lowercase; }
[data-opt="AFD-1"] .facts { display:flex; flex-direction:column; gap:4px; width:100%; margin:0; font-size:0.62rem; }
[data-opt="AFD-1"] .facts div { display:flex; justify-content:space-between; gap:10px; border-bottom:2px dashed var(--sploot-ink); padding:3px 0; }
[data-opt="AFD-1"] .facts dt { opacity:0.65; }
[data-opt="AFD-1"] .facts dd { margin:0; text-align:right; }
[data-opt="AFD-1"] .drawer-rail { display:flex; align-items:center; gap:8px; width:100%; margin-top:auto; flex-wrap:wrap; }
[data-opt="AFD-1"] .spring { flex:1; }
[data-opt="AFD-1"] .ctl-lg { width:44px; height:44px; }
[data-opt="AFD-1"] .bulkbox { position:fixed; left:50%; bottom:16px; transform:translateX(-50%); z-index:40; display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap; padding:12px 18px; }
[data-opt="AFD-1"] .bulkbox b { font-size:0.72rem; }
[data-opt="AFD-1"] .ledgedock { display:none; }
[data-opt="AFD-1"] .ctarow { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; padding:0 26px; }
@media (max-width: 767px) {
  [data-opt="AFD-1"] .topbar { padding:10px 14px; gap:10px; }
  [data-opt="AFD-1"] .searchpill, [data-opt="AFD-1"] .hide-m { display:none; }
  [data-opt="AFD-1"] .statline { font-size:0.58rem; }
  [data-opt="AFD-1"] .stack { gap:36px; padding:18px 0 calc(130px + env(safe-area-inset-bottom)); }
  [data-opt="AFD-1"] .shelf { padding:0 12px; }
  [data-opt="AFD-1"] .ledgechip { min-height:44px; }
  [data-opt="AFD-1"] .endcap { width:90px; min-height:90px; }
  [data-opt="AFD-1"] .drawer { margin:0 12px; }
  [data-opt="AFD-1"] .drawer-body { grid-template-columns:1fr; }
  [data-opt="AFD-1"] .drawer-media { border-right:0; border-bottom:3px solid var(--sploot-ink); min-height:230px; }
  [data-opt="AFD-1"] .ledgedock { display:flex; position:fixed; left:0; right:0; bottom:0; z-index:40; gap:8px; justify-content:space-around; padding:10px 12px calc(10px + env(safe-area-inset-bottom)); border-top:4px solid var(--sploot-ink); background:var(--sploot-panel); }
  [data-opt="AFD-1"] .dchip { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-width:64px; min-height:44px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); color:#1c1547; font-family:var(--font-mono); font-size:0.55rem; font-weight:700; box-shadow:var(--sploot-shadow-sm); cursor:pointer; }
  [data-opt="AFD-1"] .bulkbox { left:10px; right:10px; transform:none; bottom:calc(10px + env(safe-area-inset-bottom)); }
}
</style>`;

function tile1(m, o = {}) {
  const st = o.state || 'default';
  const cls = ['cell', 'stoy'];
  if (st === 'match') cls.push('cell--match');
  if (st === 'near') cls.push('cell--near');
  if (st === 'dim') cls.push('cell--dim');
  if (st === 'selected') cls.push('cell--selected', 'stoy--picked');
  const w = Math.round(m.aspect * (o.big ? 190 : 148)) + 36;
  const badge =
    st === 'match' ? `<b class="scoretag scoretag--match animate-sploot-stamp">${PCT(m.score, 'match')}</b>`
    : st === 'near' ? `<b class="scoretag scoretag--near">${PCT(m.score, 'close')}</b>`
    : st === 'selected' ? `<b class="scoretag scoretag--picked">${LAB.icon('check', 11)} picked</b>`
    : '';
  const heart = `<span class="hh${m.banger ? ' hh--on' : ''}" role="img" aria-label="${m.banger ? 'banger' : 'not a banger'}">${LAB.icon(m.banger ? 'heartFill' : 'heart', 13)}</span>`;
  return `<article class="${cls.join(' ')}" style="width:${w}px;" data-id="${m.id}">
    <button class="hit" aria-label="open ${m.cap}"></button>
    <div class="cell-tab tone-${m.tone}"><span>${m.file}</span></div>
    <div class="cell-media" style="aspect-ratio:${m.aspect};">${LAB.doodle(m.kind, { label: m.cap, size: '56%' })}</div>
    <div class="cell-caption"><p>${m.cap}</p>${heart}${badge}</div>
  </article>`;
}

function shelf1({ chip, note, body, aria }) {
  return `<section class="shelf" aria-label="${aria}">
    <div class="shelf-row">${body}</div>
    <div class="shelf-foot">${chip}${note ? `<span class="shelf-note mono">${note}</span>` : ''}</div>
  </section>`;
}

function heroShelf1(items, stFor) {
  const body = items.map((m) => tile1(m, { state: stFor ? stFor(m) : 'default', big: true })).join('');
  return shelf1({
    chip: `<span class="sticker ledgechip tone-yellow">the whole pile<small>${LAB.stats.total} memes</small></span>`,
    note: 'freshly shuffled · newest chaos first',
    body,
    aria: 'all memes',
  });
}

function pileShelves1(state) {
  const kindSets = [['cat'], ['sob', 'speech'], ['fire', 'blob'], ['frog', 'star'], ['moon', 'ghost']];
  const tones = ['tone-cyan', 'tone-magenta', 'tone-orange', 'tone-cyan', 'tone-magenta'];
  return LAB.piles.map((p, i) => {
    const items = LAB.corpus.filter((m) => kindSets[i % kindSets.length].includes(m.kind)).slice(0, 7);
    const maybe = p.conf < 0.56;
    const chip = `<button class="sticker ledgechip sploot-press-sm ${maybe ? 'ledgechip--maybe' : tones[i % tones.length]}">${maybe ? 'maybe ' : ''}${p.label}<small>${p.count} in pile</small></button>`;
    const body = items.map((m) => tile1(m, { state })).join('')
      + `<button class="endcap sploot-press-sm" aria-label="open pile ${p.label}">${LAB.icon('arrowR', 16)}<span>all ${p.count}</span></button>`;
    return shelf1({ chip, body, aria: `pile: ${p.label}` });
  }).join('');
}

function resultsShelf1(state) {
  if (state === 'searching') {
    const body = [166, 210, 150, 188].map((w, i) => `<div class="skel animate-sploot-pulse" style="width:${w}px;height:${150 + (i % 2) * 34}px;margin-bottom:6px;"></div>`).join('');
    return shelf1({
      chip: `<span class="sticker ledgechip tone-cyan animate-sploot-pulse">results · rummaging</span>`,
      note: `scanning ${LAB.stats.embedded} embedded vectors for "${LAB.query}"`,
      body,
      aria: 'search in flight',
    });
  }
  if (state === 'results') {
    const hits = LAB.corpus.filter((m) => m.role);
    const body = hits.map((m) => tile1(m, { state: m.role, big: m.role === 'match' })).join('');
    return shelf1({
      chip: `<span class="sticker ledgechip ledgechip--hit">results · 4 of ${LAB.stats.total}</span>`,
      note: '1 match · 3 close · the rest stayed shelved',
      body,
      aria: 'search results',
    });
  }
  const body = `<div class="zerotoy">${LAB.doodle('ghost', { label: 'zero hits', size: '60%' })}</div>
    <div class="zerocard1 animate-sploot-pop">
      <h2 class="display" style="margin:0;font-size:1.1rem;">zero hits</h2>
      <p style="margin:0;font-size:0.8rem;font-weight:600;">"${LAB.zeroQuery}" rang no bells in ${LAB.stats.total} memes. fewer words usually helps.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn sploot-press">${LAB.icon('shuffle', 16)} shuffle instead</button>
        <button class="btn sploot-press">${LAB.icon('x', 16)} clear search</button>
      </div>
    </div>`;
  return shelf1({
    chip: `<span class="sticker ledgechip ledgechip--zero">results · 0 of ${LAB.stats.total}</span>`,
    note: 'this shelf stayed empty. the piles below are still yours',
    body,
    aria: 'zero results',
  });
}

function emptyStack1() {
  const step = (n, ic, b, s, tone) => `<div class="stepcard">
    <span class="stepn ${tone}">${n}</span>
    ${LAB.icon(ic, 20)}
    <b style="font-size:0.9rem;">${b}</b>
    <small style="font-size:0.72rem;font-weight:600;">${s}</small>
  </div>`;
  const steps = step('1', 'upload', 'smash upload', 'drag in the screenshots. all of them.', 'tone-cyan')
    + step('2', 'sparkle', 'the machine files it', 'embeddings sort each save into piles. you do nothing.', 'tone-yellow')
    + step('3', 'search', 'type words later', 'fuzzy memory in, exact picture out.', 'tone-magenta');
  const stepsShelf = shelf1({
    chip: `<span class="sticker ledgechip tone-cyan">how the pile starts</span>`,
    body: steps,
    aria: 'first steps',
  });
  const bare = shelf1({
    chip: `<span class="sticker ledgechip ledgechip--maybe">a shelf, waiting</span>`,
    body: [140, 180, 120, 160].map((w) => `<div class="skel" style="width:${w}px;height:${90 + (w % 50)}px;opacity:0.35;"></div>`).join(''),
    aria: 'empty shelf',
  });
  const cta = `<div class="ctarow">
    <button class="btn btn--blue sploot-press">${LAB.icon('upload', 16)} upload your first meme</button>
    <button class="btn sploot-press">${LAB.icon('link', 16)} get the extension</button>
  </div>`;
  return stepsShelf + bare + cta;
}

function drawer1(m) {
  return `<section class="drawer sploot-card animate-sploot-slide-up" role="dialog" aria-label="meme detail: ${m.cap}">
    <div class="drawer-top">
      <span class="mono dt-label">on the bench · ${m.index}</span>
      <span class="sticker esc-hint">esc puts it back</span>
      <button class="btn sploot-press" aria-label="close detail">${LAB.icon('x', 16)} close</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-media">${LAB.doodle(m.kind, { label: m.cap, size: '70%' })}</div>
      <div class="drawer-meta">
        <div class="sticker tone-${m.tone}">${m.file}</div>
        <h2>${m.cap}</h2>
        <dl class="mono facts">
          <div><dt>index</dt><dd>${m.index}</dd></div>
          <div><dt>kind</dt><dd>${m.kind}</dd></div>
          <div><dt>shelf</dt><dd>cats being unwell</dd></div>
          <div><dt>last found by</dt><dd>"${LAB.query}" · ${PCT(m.score, 'match')}</dd></div>
        </dl>
        <div class="drawer-rail">
          <button class="sploot-ctl ctl-lg" aria-label="banger" aria-pressed="${m.banger}">${LAB.icon(m.banger ? 'heartFill' : 'heart')}</button>
          <button class="sploot-ctl ctl-lg" aria-label="share">${LAB.icon('share')}</button>
          <button class="sploot-ctl ctl-lg" aria-label="trash">${LAB.icon('trash')}</button>
          <span class="spring"></span>
          <button class="btn sploot-press" aria-label="previous meme">${LAB.icon('arrowL', 16)} prev</button>
          <button class="btn sploot-press" aria-label="next meme">next ${LAB.icon('arrowR', 16)}</button>
        </div>
      </div>
    </div>
  </section>`;
}

function header1(o) {
  return `<header class="topbar">
    <span class="brand display">sploot</span>
    <div class="searchpill">${LAB.icon('search', 16)}<input value="${o.q || ''}" placeholder="type words. get the picture." aria-label="search the pile" /></div>
    <button class="btn btn--blue sploot-press hide-m">${LAB.icon('upload', 16)} upload</button>
    <button class="sploot-ctl hide-m" aria-label="shuffle the pile">${LAB.icon('shuffle')}</button>
    <span class="statline mono">${o.stat}</span>
  </header>`;
}

function dock1(state) {
  const chip = (ic, l, tone, extra = '') => `<button class="dchip sploot-press-sm ${tone}" ${extra}>${LAB.icon(ic, 16)}<span>${l}</span></button>`;
  return `<nav class="ledgedock" aria-label="commands">
    ${chip('search', 'search', 'tone-cyan')}
    ${chip('upload', 'upload', 'tone-yellow')}
    ${chip('shuffle', 'shuffle', 'tone-magenta')}
    ${chip('check', 'select', 'tone-orange', state === 'selected' ? 'aria-pressed="true"' : 'aria-pressed="false"')}
  </nav>`;
}

function bulk1() {
  return `<div class="bulkbox sploot-card animate-sploot-slide-up" role="toolbar" aria-label="bulk actions">
    <b class="mono">3 picked up</b>
    <button class="btn sploot-press">${LAB.icon('share', 16)} share</button>
    <button class="btn sploot-press">${LAB.icon('tag', 16)} tag</button>
    <button class="btn btn--red sploot-press">${LAB.icon('trash', 16)} trash</button>
    <button class="btn sploot-press">put back</button>
  </div>`;
}

function render1(state) {
  const C = LAB.corpus;
  const S = LAB.stats;
  const q = state === 'zero' ? LAB.zeroQuery : state === 'searching' || state === 'results' ? LAB.query : '';
  const stat =
    state === 'empty' ? '0 in the library · the sorter is idle'
    : state === 'results' ? `showing 4 of ${S.total} · ${S.embedded} embedded`
    : state === 'zero' ? `showing 0 of ${S.total}`
    : state === 'selected' ? `3 picked · ${S.total} in the library`
    : `${S.total} in the library · ${S.embedded} embedded · queue ${S.queue} · ${S.storage}`;

  let main = '';
  let after = '';
  if (state === 'empty') {
    main = emptyStack1();
  } else if (state === 'searching' || state === 'results') {
    main = resultsShelf1(state) + `<div class="recede" aria-hidden="true">${heroShelf1(C.slice(0, 10))}${pileShelves1('default')}</div>`;
  } else if (state === 'zero') {
    main = resultsShelf1('zero') + heroShelf1(C.slice(0, 10)) + pileShelves1('default');
  } else if (state === 'detail') {
    main = heroShelf1(C.slice(0, 8)) + drawer1(C[0]) + pileShelves1('default');
  } else {
    const stFor = state === 'selected' ? (m) => ([0, 5, 9].includes(m.id) ? 'selected' : 'default') : null;
    main = heroShelf1(C.slice(0, 12), stFor) + pileShelves1('default');
    if (state === 'selected') after = bulk1();
  }
  const dockHtml = state === 'selected' ? '' : dock1(state);
  return `<div class="opt bg-sploot-workbench" data-opt="AFD-1">${CSS1}${header1({ q, stat })}<main class="stack">${main}</main>${after}${dockHtml}</div>`;
}

/* =========================================================================
   AFD-2 · wall and remote
   ========================================================================= */

const CSS2 = `<style>
[data-opt="AFD-2"] { position:relative; min-height:100dvh; }
[data-opt="AFD-2"] .wall { display:grid; grid-template-columns:repeat(8, 1fr); gap:8px; align-items:start; padding:8px 8px 180px; }
[data-opt="AFD-2"] .t { position:relative; display:flex; flex-direction:column; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-inner); background:var(--sploot-panel); box-shadow:var(--sploot-shadow-sm); overflow:hidden; }
[data-opt="AFD-2"] .hit { position:absolute; inset:0; z-index:2; background:transparent; border:0; border-radius:inherit; cursor:pointer; }
[data-opt="AFD-2"] .t-media { aspect-ratio:1; display:flex; align-items:center; justify-content:center; padding:8px; background:var(--sploot-paper-warm); color:var(--sploot-ink); }
[data-opt="AFD-2"] .t-cap { display:flex; align-items:center; gap:4px; border-top:2px solid var(--sploot-ink); padding:3px 6px; }
[data-opt="AFD-2"] .t-cap p { flex:1; min-width:0; margin:0; font-size:0.58rem; font-weight:700; text-transform:lowercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
[data-opt="AFD-2"] .hh { display:inline-flex; flex-shrink:0; color:var(--sploot-ink); opacity:0.55; }
[data-opt="AFD-2"] .hh--on { color:var(--sploot-magenta); opacity:1; }
[data-opt="AFD-2"] .t-flag { display:flex; align-items:center; gap:4px; border-bottom:2px solid var(--sploot-ink); padding:2px 6px; font-family:var(--font-mono); font-size:0.56rem; font-weight:700; color:#1c1547; }
[data-opt="AFD-2"] .t-flag--match { background:var(--sploot-lime); }
[data-opt="AFD-2"] .t-flag--near { background:var(--sploot-orange); }
[data-opt="AFD-2"] .t-flag--picked { background:var(--sploot-purple); color:var(--sploot-on-purple); }
[data-opt="AFD-2"] .t--match { grid-column:span 2; outline:4px solid var(--sploot-lime); z-index:1; }
[data-opt="AFD-2"] .t--near { outline:3px dashed var(--sploot-orange); outline-offset:2px; }
[data-opt="AFD-2"] .t--picked { outline:3px solid var(--sploot-purple); }
[data-opt="AFD-2"] .t--dim { opacity:0.4; filter:saturate(0.25); }
[data-opt="AFD-2"] .plq { aspect-ratio:1; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:3px; padding:10px; border:3px solid var(--sploot-ink); border-radius:var(--sploot-radius-inner); box-shadow:var(--sploot-shadow-sm); color:#1c1547; font-weight:800; text-transform:lowercase; text-align:left; cursor:pointer; }
[data-opt="AFD-2"] .plq b { font-size:0.78rem; line-height:1.15; }
[data-opt="AFD-2"] .plq small { font-family:var(--font-mono); font-size:0.58rem; font-weight:700; opacity:0.8; }
[data-opt="AFD-2"] .plq--maybe { border-style:dashed; }
[data-opt="AFD-2"] .plq--all { grid-column:span 2; aspect-ratio:auto; min-height:76px; }
[data-opt="AFD-2"] .stepplq { aspect-ratio:auto; min-height:100%; }
[data-opt="AFD-2"] .stepn { align-self:flex-start; font-family:var(--font-mono); font-weight:700; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); padding:0 8px; background:var(--sploot-panel); color:var(--sploot-ink); }
[data-opt="AFD-2"] .ghostcell { aspect-ratio:1; display:flex; align-items:center; justify-content:center; border:2px dashed var(--sploot-ink); border-radius:var(--sploot-radius-inner); color:var(--sploot-ink); opacity:0.3; }
[data-opt="AFD-2"] .console { position:fixed; left:50%; bottom:14px; transform:translateX(-50%); width:min(760px, calc(100vw - 28px)); z-index:30; background:var(--sploot-panel); border:var(--sploot-border); border-radius:var(--sploot-radius); box-shadow:var(--sploot-shadow-lg); overflow:hidden; }
[data-opt="AFD-2"] .c-title { background:var(--sploot-void); color:var(--sploot-on-void); font-family:var(--font-mono); font-size:0.6rem; font-weight:700; padding:5px 14px; letter-spacing:0.04em; }
[data-opt="AFD-2"] .c-row { display:flex; align-items:center; gap:10px; padding:10px 12px; }
[data-opt="AFD-2"] .c-search { flex:1; display:flex; align-items:center; gap:8px; min-height:44px; padding:4px 14px; border:var(--sploot-border); border-radius:var(--sploot-radius-pill); background:var(--sploot-paper-warm); font-weight:700; }
[data-opt="AFD-2"] .c-search input { flex:1; min-width:0; border:0; background:transparent; font:inherit; color:var(--sploot-ink); }
[data-opt="AFD-2"] .c-face { display:flex; align-items:center; gap:8px; flex-wrap:wrap; border-top:2px dashed var(--sploot-ink); padding:8px 14px; font-family:var(--font-mono); font-size:0.66rem; font-weight:700; }
[data-opt="AFD-2"] .facechip { border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); padding:1px 8px; font-weight:700; color:#1c1547; }
[data-opt="AFD-2"] .facechip--match { background:var(--sploot-lime); }
[data-opt="AFD-2"] .facechip--zero { background:var(--sploot-red); color:var(--sploot-on-red); }
[data-opt="AFD-2"] .ctl-on { background:var(--sploot-magenta); color:#1c1547; }
[data-opt="AFD-2"] .ctl-lg { width:44px; height:44px; }
[data-opt="AFD-2"] .zerocard { position:fixed; left:50%; top:38%; transform:translate(-50%, -50%); z-index:20; display:flex; flex-direction:column; align-items:center; gap:10px; max-width:min(420px, calc(100vw - 40px)); padding:22px 26px; text-align:center; color:var(--sploot-ink); }
[data-opt="AFD-2"] .zerocard h2 { margin:0; font-size:1.2rem; }
[data-opt="AFD-2"] .zerocard p { margin:0; font-size:0.82rem; font-weight:600; }
[data-opt="AFD-2"] .zc-row { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
[data-opt="AFD-2"] .bay { position:fixed; inset:0; z-index:50; display:flex; flex-direction:column; overflow:auto; }
[data-opt="AFD-2"] .bay-top { display:flex; align-items:center; gap:10px; padding:12px 16px; border-bottom:3px solid var(--sploot-ink); background:var(--sploot-paper); }
[data-opt="AFD-2"] .bay-top .mono { flex:1; font-size:0.66rem; font-weight:700; }
[data-opt="AFD-2"] .esc-hint { background:var(--sploot-yellow); }
[data-opt="AFD-2"] .bay-mid { flex:1; display:flex; align-items:center; justify-content:center; gap:16px; padding:18px; }
[data-opt="AFD-2"] .bay-card { display:grid; grid-template-columns:1.4fr 1fr; width:100%; max-width:900px; overflow:hidden; }
[data-opt="AFD-2"] .bay-media { display:flex; align-items:center; justify-content:center; min-height:340px; padding:26px; background:var(--sploot-paper-warm); border-right:3px solid var(--sploot-ink); color:var(--sploot-ink); }
[data-opt="AFD-2"] .bay-meta { display:flex; flex-direction:column; align-items:flex-start; gap:12px; padding:18px; }
[data-opt="AFD-2"] .bay-meta h2 { margin:0; font-size:1.15rem; text-transform:lowercase; }
[data-opt="AFD-2"] .facts { display:flex; flex-direction:column; gap:4px; width:100%; margin:0; font-size:0.62rem; }
[data-opt="AFD-2"] .facts div { display:flex; justify-content:space-between; gap:10px; border-bottom:2px dashed var(--sploot-ink); padding:3px 0; }
[data-opt="AFD-2"] .facts dt { opacity:0.65; }
[data-opt="AFD-2"] .facts dd { margin:0; text-align:right; }
[data-opt="AFD-2"] .bay-rail { display:flex; gap:8px; margin-top:auto; }
[data-opt="AFD-2"] .bay-foot { padding:10px 16px; border-top:3px solid var(--sploot-ink); background:var(--sploot-paper); font-family:var(--font-mono); font-size:0.6rem; font-weight:700; text-align:center; }
[data-opt="AFD-2"] .bay-nav-m { display:none; }
@media (max-width: 767px) {
  [data-opt="AFD-2"] .wall { grid-template-columns:repeat(3, 1fr); padding:8px 8px calc(240px + env(safe-area-inset-bottom)); }
  [data-opt="AFD-2"] .console { left:8px; right:8px; bottom:calc(8px + env(safe-area-inset-bottom)); transform:none; width:auto; }
  [data-opt="AFD-2"] .c-row { flex-wrap:wrap; }
  [data-opt="AFD-2"] .c-search { flex:1 1 100%; }
  [data-opt="AFD-2"] .console .sploot-ctl { width:44px; height:44px; }
  [data-opt="AFD-2"] .bay-card { grid-template-columns:1fr; }
  [data-opt="AFD-2"] .bay-media { border-right:0; border-bottom:3px solid var(--sploot-ink); min-height:240px; }
  [data-opt="AFD-2"] .bay-side { display:none; }
  [data-opt="AFD-2"] .bay-nav-m { display:flex; gap:8px; width:100%; margin-top:4px; }
  [data-opt="AFD-2"] .bay-nav-m .btn { flex:1; }
}
</style>`;

function tile2(m, st = 'default') {
  const flag =
    st === 'match' ? `<div class="t-flag t-flag--match animate-sploot-stamp">${PCT(m.score, 'match')}</div>`
    : st === 'near' ? `<div class="t-flag t-flag--near">${PCT(m.score, 'close')}</div>`
    : st === 'selected' ? `<div class="t-flag t-flag--picked">${LAB.icon('check', 10)} picked</div>`
    : '';
  const cls = ['t', 'sploot-press-sm'];
  if (st === 'dim') cls.push('t--dim');
  if (st === 'match') cls.push('t--match');
  if (st === 'near') cls.push('t--near');
  if (st === 'selected') cls.push('t--picked');
  return `<article class="${cls.join(' ')}" data-id="${m.id}">
    <button class="hit" aria-label="open ${m.cap}"></button>
    ${flag}
    <div class="t-media">${LAB.doodle(m.kind, { label: m.cap, size: '58%' })}</div>
    <div class="t-cap"><p>${m.cap}</p><span class="hh${m.banger ? ' hh--on' : ''}" role="img" aria-label="${m.banger ? 'banger' : 'not a banger'}">${LAB.icon(m.banger ? 'heartFill' : 'heart', 11)}</span></div>
  </article>`;
}

function plaque2(p, i, dim) {
  const tones = ['tone-cyan', 'tone-magenta', 'tone-yellow', 'tone-orange'];
  const maybe = p.conf < 0.56;
  return `<button class="plq sploot-press-sm ${tones[i % 4]}${maybe ? ' plq--maybe' : ''}${dim ? ' t--dim' : ''}" aria-label="filter pile: ${p.label}">
    ${LAB.icon('filter', 14)}
    <b>${maybe ? 'maybe ' : ''}${p.label}</b>
    <small>${p.count} in pile</small>
  </button>`;
}

function wall2(state) {
  const stFor = (m) => {
    if (state === 'searching' || state === 'zero') return 'dim';
    if (state === 'results') return m.role === 'match' ? 'match' : m.role === 'near' ? 'near' : 'dim';
    if (state === 'selected') return [0, 5, 9].includes(m.id) ? 'selected' : 'default';
    return 'default';
  };
  const dimPlq = state !== 'browse' && state !== 'selected' && state !== 'detail';
  const cells = [`<button class="plq plq--all tone-yellow sploot-press-sm" aria-label="show all memes">${LAB.icon('grid', 14)}<b>the whole pile</b><small>${LAB.stats.total} memes · ${LAB.stats.embedded} embedded</small></button>`];
  let pi = 0;
  LAB.corpus.forEach((m, i) => {
    cells.push(tile2(m, stFor(m)));
    if ((i + 1) % 9 === 0 && pi < LAB.piles.length) {
      cells.push(plaque2(LAB.piles[pi], pi, dimPlq));
      pi += 1;
    }
  });
  return `<main class="wall" aria-label="the pile">${cells.join('')}</main>`;
}

function emptyWall2() {
  const steps = [
    { n: '1', ic: 'upload', b: 'smash upload', s: 'anything cursed works', t: 'tone-cyan' },
    { n: '2', ic: 'link', b: 'or grab the extension', s: 'it catches strays from the browser', t: 'tone-yellow' },
    { n: '3', ic: 'search', b: 'type words later', s: 'the picture just shows up', t: 'tone-magenta' },
  ];
  const kinds = ['cat', 'frog', 'ghost', 'star', 'blob', 'moon'];
  const cells = [];
  for (let i = 0; i < 27; i += 1) {
    const s = i === 4 ? 0 : i === 13 ? 1 : i === 22 ? 2 : -1;
    if (s >= 0) {
      const st = steps[s];
      cells.push(`<div class="plq stepplq ${st.t}"><span class="stepn mono">${st.n}</span>${LAB.icon(st.ic, 16)}<b>${st.b}</b><small>${st.s}</small></div>`);
    } else {
      cells.push(`<div class="ghostcell">${LAB.doodle(kinds[i % kinds.length], { label: '', size: '40%' })}</div>`);
    }
  }
  return `<main class="wall" aria-label="empty library">${cells.join('')}</main>`;
}

function console2(state) {
  const S = LAB.stats;
  const q = state === 'zero' ? LAB.zeroQuery : state === 'searching' || state === 'results' ? LAB.query : '';
  let face = '';
  if (state === 'browse' || state === 'detail') face = `<span>${S.total} in the library · ${S.embedded} embedded · queue ${S.queue} · ${S.storage}</span>`;
  else if (state === 'searching') face = `<span class="animate-sploot-pulse">rummaging ${S.embedded} vectors for "${LAB.query}" · hold on</span>`;
  else if (state === 'results') face = `<span class="facechip facechip--match">${PCT(LAB.corpus[0].score, 'match')}</span><span>1 direct hit · 3 close · ${S.total - 4} stayed in the pile</span>`;
  else if (state === 'zero') face = `<span class="facechip facechip--zero">0 hits</span><span>"${LAB.zeroQuery}" rang zero bells in ${S.total} memes</span>`;
  else if (state === 'empty') face = `<span>0 in the library · the wall is bare · feed it</span>`;
  else if (state === 'selected') face = `<b>3 picked</b>
    <button class="btn sploot-press">${LAB.icon('share', 16)} share</button>
    <button class="btn sploot-press">${LAB.icon('tag', 16)} tag</button>
    <button class="btn btn--red sploot-press">${LAB.icon('trash', 16)} trash</button>
    <button class="btn sploot-press">drop all</button>`;
  return `<section class="console" role="search" aria-label="sploot console">
    <div class="c-title">sploot console · idx v3 · clip scorer · route /api/search</div>
    <div class="c-row">
      <div class="c-search">${LAB.icon('search', 16)}<input value="${q}" placeholder="type words. get the picture." aria-label="search the pile" /></div>
      <button class="btn btn--blue sploot-press">${LAB.icon('upload', 16)} upload</button>
      <button class="sploot-ctl" aria-label="shuffle the pile">${LAB.icon('shuffle')}</button>
      <button class="sploot-ctl${state === 'selected' ? ' ctl-on' : ''}" aria-label="select memes" aria-pressed="${state === 'selected'}">${LAB.icon('check')}</button>
    </div>
    <div class="c-face">${face}</div>
  </section>`;
}

function zeroCard2() {
  return `<div class="zerocard sploot-card animate-sploot-pop" role="status">
    ${LAB.doodle('ghost', { label: 'zero hits', size: '72' })}
    <h2 class="display">zero hits</h2>
    <p>"${LAB.zeroQuery}" matched nothing. the pile is confused, not mad.</p>
    <div class="zc-row">
      <button class="btn sploot-press">${LAB.icon('shuffle', 16)} shuffle instead</button>
      <button class="btn sploot-press">${LAB.icon('x', 16)} clear search</button>
    </div>
  </div>`;
}

function bay2(m) {
  return `<div class="bay bg-sploot-workbench" role="dialog" aria-modal="true" aria-label="meme detail: ${m.cap}">
    <div class="bay-top">
      <span class="mono">inspection bay · ${m.index}</span>
      <span class="sticker esc-hint">esc closes</span>
      <button class="btn sploot-press" aria-label="close detail">${LAB.icon('x', 16)} close</button>
    </div>
    <div class="bay-mid">
      <button class="sploot-ctl ctl-lg bay-side" aria-label="previous meme">${LAB.icon('arrowL')}</button>
      <div class="bay-card sploot-card">
        <div class="bay-media">${LAB.doodle(m.kind, { label: m.cap, size: '68%' })}</div>
        <div class="bay-meta">
          <div class="sticker tone-${m.tone}">${m.file}</div>
          <h2>${m.cap}</h2>
          <dl class="mono facts">
            <div><dt>index</dt><dd>${m.index}</dd></div>
            <div><dt>kind</dt><dd>${m.kind}</dd></div>
            <div><dt>pile</dt><dd>cats being unwell</dd></div>
            <div><dt>last found by</dt><dd>"${LAB.query}" · ${PCT(m.score, 'match')}</dd></div>
          </dl>
          <div class="bay-rail">
            <button class="sploot-ctl ctl-lg" aria-label="banger" aria-pressed="${m.banger}">${LAB.icon(m.banger ? 'heartFill' : 'heart')}</button>
            <button class="sploot-ctl ctl-lg" aria-label="share">${LAB.icon('share')}</button>
            <button class="sploot-ctl ctl-lg" aria-label="trash">${LAB.icon('trash')}</button>
          </div>
          <div class="bay-nav-m">
            <button class="btn sploot-press" aria-label="previous meme">${LAB.icon('arrowL', 16)} prev</button>
            <button class="btn sploot-press" aria-label="next meme">next ${LAB.icon('arrowR', 16)}</button>
          </div>
        </div>
      </div>
      <button class="sploot-ctl ctl-lg bay-side" aria-label="next meme">${LAB.icon('arrowR')}</button>
    </div>
    <div class="bay-foot">arrows walk the pile · esc puts it back on the wall</div>
  </div>`;
}

function render2(state) {
  const body = state === 'empty' ? emptyWall2() : wall2(state);
  let extra = '';
  if (state === 'zero') extra = zeroCard2();
  if (state === 'detail') extra = bay2(LAB.corpus[0]);
  return `<div class="opt bg-sploot-workbench" data-opt="AFD-2">${CSS2}${body}${console2(state)}${extra}</div>`;
}

/* ========================================================================= */

export const SPECS = {
  'AFD-1': {
    name: 'the shelf stack',
    lane: 'afd',
    move: 'piles are physical shelves, not chips: labeled ledges the toys sit on, and search carpenters a new results shelf at the top of the stack',
    notes: 'shelves scroll horizontally; opening a pile would expand it to a full grid view not mocked here. tile hearts are read-only markers so the 44px floor holds; hearting lives in the drawer and the bulk box. the detail drawer is a non-modal dialog pushed into the stack and needs a real focus trap plus esc handling in product. pile membership is faked by doodle kind.',
    render(state) {
      return render1(state);
    },
  },
  'AFD-2': {
    name: 'wall and remote',
    lane: 'afd',
    move: 'chrome inverted: the grid is wallpaper touching all four viewport edges, piles are candy plaques living inside the grid, and one floating console toy is search bar, stat readout, mobile dock, and bulk tray at once',
    notes: 'the console is the only chrome and changes its face per state; verify it never hides a resting tile (the wall pads its bottom). wall tiles drop captions to a micro strip, so detail must carry full metadata. hearts on wall tiles are markers, not buttons, to hold the 44px floor. inspection bay is a full takeover dialog and needs focus trap, esc, and arrow-key wiring. plaque slots are deterministic every 9 cells; production should place them per pile size.',
    render(state) {
      return render2(state);
    },
  },
};
