/* lanes/taste.js · TASTE lane · metric-based taste (anti-default dials).
   Every dimension below is a declared dial, counted at 1440x900 and stated
   in each option's notes. Seed DNA absorbed: fzf mechanics (filter-as-you-
   type, token highlight, score column, visible hotkeys in mono).
   Locked type scale for BOTH options: 0.6 / 0.72 / 0.9 / 1.2rem. */

const QT = ['cat', 'vibrating', '3am'];
const pct = (s) => `${Math.round(parseFloat(s) * 100)}%`;
const hl = (t) => QT.reduce((acc, w) => acc.replace(new RegExp(`\\b(${w})\\b`, 'gi'), '<mark>$1</mark>'), t);

/* ==================================================================== */
/* TASTE-1 · the finder is the interface                                */
/* ==================================================================== */

const T1_CSS = `<style>
[data-opt="TASTE-1"] { display:grid; grid-template-columns:500px minmax(0,1fr); font-size:0.9rem; }
[data-opt="TASTE-1"] mark { background:var(--sploot-cyan); color:#1c1547; padding:0 5px; border-radius:var(--sploot-radius-pill); }
[data-opt="TASTE-1"] .kbd { flex:none; display:inline-flex; align-items:center; justify-content:center; min-width:20px; padding:1px 7px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); font-family:var(--font-mono); font-size:0.6rem; font-weight:700; background:var(--sploot-panel); color:var(--sploot-ink); box-shadow:var(--sploot-sticker-shadow); }

/* -- finder pane (the whole retrieval surface) -- */
[data-opt="TASTE-1"] .finder { position:sticky; top:0; display:flex; flex-direction:column; height:100dvh; overflow:hidden; border-right:3px solid var(--sploot-ink); background:var(--sploot-paper-warm); }
[data-opt="TASTE-1"] .fprompt { padding:12px 14px 10px; border-bottom:3px solid var(--sploot-ink); }
[data-opt="TASTE-1"] .fptop { display:flex; align-items:center; gap:8px; }
[data-opt="TASTE-1"] .fbar { flex:1; min-width:0; display:flex; align-items:center; gap:10px; min-height:44px; padding:4px 16px; border:3px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); box-shadow:var(--sploot-shadow-sm); }
[data-opt="TASTE-1"] .fbar input { flex:1; min-width:0; border:0; background:transparent; color:var(--sploot-ink); font:inherit; font-size:0.9rem; font-weight:700; }
[data-opt="TASTE-1"] .fbar--off { opacity:0.55; }
[data-opt="TASTE-1"] .fmachine { display:flex; justify-content:space-between; gap:8px; margin:8px 2px 0; font-family:var(--font-mono); font-size:0.6rem; font-weight:700; opacity:0.78; }
[data-opt="TASTE-1"] .fmachine span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* -- piles: mono filter lines, not a pill rail -- */
[data-opt="TASTE-1"] .fpiles { display:flex; flex-direction:column; border-bottom:3px solid var(--sploot-ink); }
[data-opt="TASTE-1"] .pline { display:flex; justify-content:space-between; align-items:center; gap:8px; min-height:32px; padding:2px 14px; border:0; background:transparent; color:var(--sploot-ink); font-family:var(--font-mono); font-size:0.72rem; font-weight:700; text-transform:lowercase; text-align:left; cursor:pointer; }
[data-opt="TASTE-1"] .pline:hover { background:var(--sploot-yellow); color:#1c1547; }
[data-opt="TASTE-1"] .pline--on { background:var(--sploot-yellow); color:#1c1547; }
[data-opt="TASTE-1"] .pline b { font-weight:400; opacity:0.72; white-space:nowrap; }

/* -- result rows -- */
[data-opt="TASTE-1"] .flist { flex:1; overflow:auto; }
[data-opt="TASTE-1"] .frow { position:relative; display:flex; align-items:center; gap:10px; min-height:52px; padding:4px 12px; border-bottom:1px solid var(--sploot-grid-line); }
[data-opt="TASTE-1"] .frow:hover { background:var(--sploot-panel); }
[data-opt="TASTE-1"] .frow-open { position:absolute; inset:0; z-index:1; border:0; background:transparent; cursor:pointer; padding:0; }
[data-opt="TASTE-1"] .fscore { width:44px; flex:none; font-family:var(--font-mono); font-size:0.72rem; font-weight:700; text-align:right; }
[data-opt="TASTE-1"] .fthumb { width:40px; height:40px; flex:none; display:grid; place-items:center; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-ctl); background:var(--sploot-panel); color:var(--sploot-ink); overflow:hidden; }
[data-opt="TASTE-1"] .fmain { flex:1; min-width:0; }
[data-opt="TASTE-1"] .fcap { display:block; font-size:0.72rem; font-weight:700; line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
[data-opt="TASTE-1"] .ffile { display:block; font-family:var(--font-mono); font-size:0.6rem; opacity:0.6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
[data-opt="TASTE-1"] .fheart { flex:none; color:var(--sploot-magenta); display:inline-flex; }
[data-opt="TASTE-1"] .fstamp { flex:none; font-family:var(--font-mono); font-size:0.6rem; font-weight:700; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); padding:1px 8px; background:var(--sploot-lime); color:#1c1547; }
[data-opt="TASTE-1"] .fstamp--near { background:var(--sploot-orange); }
[data-opt="TASTE-1"] .fmark { flex:none; display:grid; place-items:center; width:22px; height:22px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-purple); color:var(--sploot-on-purple); }
[data-opt="TASTE-1"] .frow--match { background:var(--sploot-panel); outline:3px solid var(--sploot-lime); outline-offset:-3px; z-index:2; }
[data-opt="TASTE-1"] .frow--near { outline:2px dashed var(--sploot-orange); outline-offset:-4px; }
[data-opt="TASTE-1"] .frow--dim { opacity:0.38; filter:saturate(0.25); }
[data-opt="TASTE-1"] .frow--marked { background:var(--sploot-panel); outline:3px solid var(--sploot-purple); outline-offset:-3px; }
[data-opt="TASTE-1"] .fskel { display:block; height:9px; margin:3px 0; border-radius:var(--sploot-radius-pill); background:var(--sploot-ink); opacity:0.16; }
[data-opt="TASTE-1"] .fskel--s { width:55%; }

/* -- finder footer: hotkeys / bulk bar -- */
[data-opt="TASTE-1"] .fkeys { display:flex; flex-wrap:wrap; align-items:center; gap:6px 14px; border-top:3px solid var(--sploot-ink); padding:8px 14px; font-family:var(--font-mono); font-size:0.6rem; font-weight:700; }
[data-opt="TASTE-1"] .fkeys span { display:inline-flex; align-items:center; gap:5px; }
[data-opt="TASTE-1"] .fbulk { display:flex; align-items:center; gap:8px; border-top:3px solid var(--sploot-ink); padding:8px 12px; background:var(--sploot-panel); }
[data-opt="TASTE-1"] .fbulk b { font-size:0.9rem; }
[data-opt="TASTE-1"] .fbulk .of { font-family:var(--font-mono); font-size:0.6rem; opacity:0.7; }

/* -- fzf-style zero / empty panels inside the list -- */
[data-opt="TASTE-1"] .fpanel { margin:14px 12px; padding:16px; }
[data-opt="TASTE-1"] .fpanel h3 { margin:6px 0 8px; font-family:var(--font-display); font-size:1.2rem; font-weight:400; }
[data-opt="TASTE-1"] .fpanel p { margin:0 0 8px; font-size:0.9rem; }
[data-opt="TASTE-1"] .fpanel .zt { display:inline-block; font-family:var(--font-mono); font-size:0.6rem; font-weight:700; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); padding:1px 8px; background:var(--sploot-red); color:var(--sploot-on-red); }
[data-opt="TASTE-1"] .fstep { display:flex; gap:10px; align-items:baseline; margin:0 0 8px; font-size:0.9rem; }
[data-opt="TASTE-1"] .fstep b { font-family:var(--font-mono); font-size:0.6rem; opacity:0.7; }

/* -- preview shelf (the grid, demoted) -- */
[data-opt="TASTE-1"] .pv { min-width:0; padding:0 18px 28px; }
[data-opt="TASTE-1"] .pvstrap { display:flex; justify-content:space-between; align-items:center; min-height:24px; padding:6px 2px 4px; font-family:var(--font-mono); font-size:0.6rem; font-weight:700; }
[data-opt="TASTE-1"] .pvgrid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
[data-opt="TASTE-1"] .ptile { position:relative; display:flex; flex-direction:column; overflow:hidden; border:3px solid var(--sploot-ink); border-radius:var(--sploot-radius-inner); background:var(--sploot-panel); box-shadow:var(--sploot-shadow-sm); }
[data-opt="TASTE-1"] .ptile-media { aspect-ratio:1; display:grid; place-items:center; border-bottom:2px solid var(--sploot-ink); background:var(--sploot-paper-warm); color:var(--sploot-ink); }
[data-opt="TASTE-1"] .ptile-cap { display:flex; align-items:center; gap:6px; min-height:26px; padding:2px 8px; }
[data-opt="TASTE-1"] .ptile-cap p { margin:0; flex:1; min-width:0; font-size:0.72rem; font-weight:700; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
[data-opt="TASTE-1"] .ptile-cap .fheart svg { width:13px; height:13px; }
[data-opt="TASTE-1"] .ptile-open { position:absolute; inset:0 0 26px 0; z-index:2; border:0; background:transparent; cursor:pointer; padding:0; }
[data-opt="TASTE-1"] .pstamp { position:absolute; top:6px; right:6px; z-index:3; font-family:var(--font-mono); font-size:0.6rem; font-weight:700; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); padding:1px 8px; background:var(--sploot-lime); color:#1c1547; box-shadow:var(--sploot-sticker-shadow); }
[data-opt="TASTE-1"] .pstamp--near { background:var(--sploot-orange); }
[data-opt="TASTE-1"] .pcheck { position:absolute; top:6px; left:6px; z-index:3; display:grid; place-items:center; width:22px; height:22px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-purple); color:var(--sploot-on-purple); }
[data-opt="TASTE-1"] .ptile--match { outline:4px solid var(--sploot-lime); outline-offset:0; z-index:1; }
[data-opt="TASTE-1"] .ptile--near { outline:3px dashed var(--sploot-orange); outline-offset:2px; }
[data-opt="TASTE-1"] .ptile--dim { opacity:0.35; filter:saturate(0.2); }
[data-opt="TASTE-1"] .ptile--selected { outline:4px solid var(--sploot-purple); outline-offset:0; }
[data-opt="TASTE-1"] .pvempty { max-width:520px; margin:60px auto; padding:24px; text-align:center; }
[data-opt="TASTE-1"] .pvempty h2 { margin:0 0 8px; font-family:var(--font-display); font-size:1.2rem; font-weight:400; }
[data-opt="TASTE-1"] .pvempty p { margin:0 0 14px; font-size:0.9rem; }

/* -- detail: pane takeover inspector (instead of the grid) -- */
[data-opt="TASTE-1"] .inspector { max-width:840px; display:flex; flex-direction:column; }
[data-opt="TASTE-1"] .ins-head { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:3px solid var(--sploot-ink); }
[data-opt="TASTE-1"] .ins-file { color:#1c1547; padding:2px 10px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); font-family:var(--font-mono); font-size:0.6rem; font-weight:700; }
[data-opt="TASTE-1"] .ins-ix { font-size:0.6rem; opacity:0.7; }
[data-opt="TASTE-1"] .ins-media { margin:12px; padding:28px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-inner); background:var(--sploot-paper-warm); display:grid; place-items:center; color:var(--sploot-ink); }
[data-opt="TASTE-1"] .ins-body { display:flex; gap:14px; padding:0 14px 14px; align-items:flex-start; flex-wrap:wrap; }
[data-opt="TASTE-1"] .ins-cap { flex:1; min-width:220px; }
[data-opt="TASTE-1"] .ins-cap > p { margin:0 0 12px; font-size:0.9rem; font-weight:700; }
[data-opt="TASTE-1"] .ins-actions { display:flex; align-items:center; gap:6px; }
[data-opt="TASTE-1"] .ins-machine { margin:0; padding:10px 12px; border:2px dashed var(--sploot-ink); border-radius:var(--sploot-radius-inner); font-family:var(--font-mono); font-size:0.6rem; font-weight:700; min-width:200px; }
[data-opt="TASTE-1"] .ins-machine div { display:flex; justify-content:space-between; gap:14px; padding:2px 0; }
[data-opt="TASTE-1"] .ins-machine dt { opacity:0.6; }
[data-opt="TASTE-1"] .ins-machine dd { margin:0; }

@media (max-width:1199px) { [data-opt="TASTE-1"] { grid-template-columns:420px minmax(0,1fr); } [data-opt="TASTE-1"] .pvgrid { grid-template-columns:repeat(3,1fr); } }
@media (max-width:767px) {
  [data-opt="TASTE-1"] { grid-template-columns:1fr; }
  [data-opt="TASTE-1"] .pv { display:none; }
  [data-opt="TASTE-1"] .pv--detail { display:block; padding:0; }
  [data-opt="TASTE-1"] .pv--detail .pvstrap { display:none; }
  [data-opt="TASTE-1"] .finder { position:static; height:auto; min-height:100dvh; border-right:0; }
  [data-opt="TASTE-1"] .fpiles { order:0; flex-direction:row; overflow-x:auto; }
  [data-opt="TASTE-1"] .pline { flex:none; min-height:44px; }
  [data-opt="TASTE-1"] .flist { order:1; overflow:visible; }
  [data-opt="TASTE-1"] .fbulk { order:2; }
  [data-opt="TASTE-1"] .fprompt { order:3; position:sticky; bottom:0; z-index:20; background:var(--sploot-paper-warm); border-bottom:0; border-top:3px solid var(--sploot-ink); padding-bottom:calc(12px + env(safe-area-inset-bottom)); }
  [data-opt="TASTE-1"] .fkeys { display:none; }
  [data-opt="TASTE-1"] .frow { min-height:60px; }
  [data-opt="TASTE-1"] .fthumb { width:48px; height:48px; }
  [data-opt="TASTE-1"] .fscore { width:36px; font-size:0.6rem; }
  [data-opt="TASTE-1"] .sploot-ctl { width:44px; height:44px; }
  [data-opt="TASTE-1"] .inspector { position:fixed; inset:0; z-index:60; margin:0; max-width:none; border-radius:0; overflow:auto; }
  [data-opt="TASTE-1"] .ins-media { padding:16px; }
}
</style>`;

function t1Row(m, { mode = 'plain', score = false, marked = false } = {}) {
  const cls = ['frow'];
  if (mode === 'match') cls.push('frow--match');
  if (mode === 'near') cls.push('frow--near');
  if (mode === 'dim') cls.push('frow--dim');
  if (marked) cls.push('frow--marked');
  const sc = score && m.score ? pct(m.score) : '··';
  const stamp = mode === 'match'
    ? '<span class="fstamp animate-sploot-stamp">match</span>'
    : mode === 'near' ? '<span class="fstamp fstamp--near">near</span>' : '';
  const mk = marked ? `<span class="fmark">${LAB.icon('check', 12)}</span>` : '';
  const heart = m.banger ? `<span class="fheart">${LAB.icon('heartFill', 14)}</span>` : '';
  return `<div class="${cls.join(' ')}">
    <button class="frow-open" aria-label="open ${m.cap}"></button>
    <span class="fscore sploot-tabular">${sc}</span>
    <span class="fthumb">${LAB.doodle(m.kind, { label: m.kind, size: '68%' })}</span>
    <span class="fmain"><span class="fcap">${score ? hl(m.cap) : m.cap}</span><span class="ffile">${m.file} · ${m.index}</span></span>
    ${heart}${mk}${stamp}
  </div>`;
}

function t1SkelRow() {
  return `<div class="frow"><span class="fscore">··</span><span class="fthumb animate-sploot-pulse"></span><span class="fmain"><span class="fskel animate-sploot-pulse"></span><span class="fskel fskel--s animate-sploot-pulse"></span></span></div>`;
}

function t1Prompt({ query = '', left, right, disabled = false, pulse = false } = {}) {
  return `<div class="fprompt">
    <div class="fptop">
      <div class="fbar${disabled ? ' fbar--off' : ''}">${LAB.icon('search', 16)}<input value="${query}" placeholder="type words. get the picture." aria-label="search the pile" ${disabled ? 'disabled' : ''}/><span class="kbd">/</span></div>
      <button class="sploot-ctl" aria-label="upload">${LAB.icon('upload')}</button>
      <button class="sploot-ctl" aria-label="shuffle">${LAB.icon('shuffle')}</button>
    </div>
    <p class="fmachine${pulse ? ' animate-sploot-pulse' : ''}"><span>${left}</span><span>${right}</span></p>
  </div>`;
}

function t1Piles() {
  const all = `<button class="pline pline--on"><span>all memes</span><b>${LAB.stats.total} total</b></button>`;
  const rows = LAB.piles.map((p) =>
    `<button class="pline"><span>${p.conf < 0.56 ? 'maybe · ' : ''}${p.label}</span><b>${p.count} in pile · ${Math.round(p.conf * 100)}%</b></button>`).join('');
  return `<nav class="fpiles" aria-label="piles">${all}${rows}</nav>`;
}

function t1Keys() {
  const k = (key, label) => `<span><b class="kbd">${key}</b> ${label}</span>`;
  return `<div class="fkeys" aria-label="hotkeys">${k('↑↓', 'move')}${k('enter', 'open')}${k('tab', 'mark')}${k('/', 'focus')}${k('u', 'upload')}${k('s', 'shuffle')}${k('b', 'bangers')}${k('esc', 'clear')}</div>`;
}

function t1Bulk() {
  return `<div class="fbulk">
    <b>3 marked</b><span class="of">of ${LAB.stats.total} in the pile</span>
    <span style="flex:1"></span>
    <button class="sploot-ctl" aria-label="banger the marked">${LAB.icon('heart')}</button>
    <button class="sploot-ctl" aria-label="share the marked">${LAB.icon('share')}</button>
    <button class="sploot-ctl" aria-label="trash the marked">${LAB.icon('trash')}</button>
    <button class="sploot-ctl" aria-label="clear marks">${LAB.icon('x')}</button>
  </div>`;
}

function t1Tile(m, st = 'default', opts = {}) {
  const cls = ['ptile', 'sploot-press-sm'];
  if (st === 'match') cls.push('ptile--match');
  if (st === 'near') cls.push('ptile--near');
  if (st === 'dim') cls.push('ptile--dim');
  if (st === 'selected') cls.push('ptile--selected');
  const stamp = st === 'match'
    ? `<span class="pstamp animate-sploot-stamp">match ${pct(m.score)}</span>`
    : st === 'near' ? `<span class="pstamp pstamp--near">near ${pct(m.score)}</span>` : '';
  const chk = st === 'selected' ? `<span class="pcheck">${LAB.icon('check', 12)}</span>` : '';
  const heart = m.banger ? `<span class="fheart">${LAB.icon('heartFill', 13)}</span>` : '';
  return `<article class="${cls.join(' ')}" aria-label="${m.cap}">
    <button class="ptile-open" aria-label="open ${m.cap}"></button>
    <div class="ptile-media${opts.pulse ? ' animate-sploot-pulse' : ''}">${LAB.doodle(m.kind, { label: m.cap, size: '46%' })}</div>
    <div class="ptile-cap"><p>${opts.hl ? hl(m.cap) : m.cap}</p>${heart}</div>
    ${chk}${stamp}
  </article>`;
}

function t1Detail() {
  const m = LAB.corpus.find((x) => x.role === 'match') || LAB.corpus[0];
  return `
  <div class="pvstrap"><span>detail · 1 of ${LAB.stats.total} in the pile</span><span>esc returns to the shelf</span></div>
  <section class="inspector sploot-card" role="dialog" aria-modal="false" aria-label="meme detail: ${m.cap}">
    <div class="ins-head">
      <span class="ins-file tone-${m.tone}">${m.file}</span>
      <span class="mono ins-ix">${m.index}</span>
      <span style="flex:1"></span>
      <span class="kbd">esc</span>
      <button class="sploot-ctl" aria-label="close detail">${LAB.icon('x')}</button>
    </div>
    <div class="ins-media">${LAB.doodle(m.kind, { label: m.cap, size: '240' })}</div>
    <div class="ins-body">
      <div class="ins-cap">
        <p>${m.cap}</p>
        <div class="ins-actions">
          <button class="sploot-ctl" aria-label="banger" aria-pressed="${m.banger}">${LAB.icon(m.banger ? 'heartFill' : 'heart')}</button>
          <button class="sploot-ctl" aria-label="share">${LAB.icon('share')}</button>
          <button class="sploot-ctl" aria-label="trash">${LAB.icon('trash')}</button>
          <span style="flex:1"></span>
          <button class="sploot-ctl" aria-label="previous meme">${LAB.icon('arrowL')}</button><span class="kbd">k</span>
          <button class="sploot-ctl" aria-label="next meme">${LAB.icon('arrowR')}</button><span class="kbd">j</span>
        </div>
      </div>
      <dl class="ins-machine">
        <div><dt>index</dt><dd>${m.index}</dd></div>
        <div><dt>match</dt><dd>${pct(m.score)} · cos ${m.score}</dd></div>
        <div><dt>scorer</dt><dd>clip-vit-b32</dd></div>
        <div><dt>route</dt><dd>/api/search</dd></div>
      </dl>
    </div>
  </section>`;
}

function t1Render(state) {
  const C = LAB.corpus;
  const S = LAB.stats;
  const hits = C.filter((m) => m.role);
  const rest = C.filter((m) => !m.role);
  const strap = (l, r) => `<div class="pvstrap"><span>${l}</span><span>${r}</span></div>`;
  const grid = (tiles) => `<div class="pvgrid">${tiles}</div>`;

  let prompt; let piles = t1Piles(); let list; let foot = t1Keys();
  let pv;

  if (state === 'searching') {
    prompt = t1Prompt({ query: LAB.query, left: `scoring "${LAB.query}" against ${S.embedded} vectors`, right: 'scorer clip', pulse: true });
    list = C.slice(0, 6).map((m) => t1Row(m, { mode: 'dim' })).join('') + [1, 2, 3, 4, 5, 6].map(t1SkelRow).join('');
    pv = strap(`the pile · ${S.total} saved · scoring`, S.storage) + grid(C.slice(0, 16).map((m) => t1Tile(m, 'dim', { pulse: true })).join(''));
  } else if (state === 'results') {
    prompt = t1Prompt({ query: LAB.query, left: `4 hits · ${S.total} in the pile`, right: 'scorer clip · 41ms' });
    list = hits.map((m) => t1Row(m, { mode: m.role, score: true })).join('')
      + rest.map((m) => t1Row(m, { mode: 'dim', score: true })).join('');
    pv = strap(`4 hits for "${LAB.query}"`, `${S.total} in the pile`)
      + grid(hits.map((m) => t1Tile(m, m.role, { hl: true })).join('') + rest.slice(0, 12).map((m) => t1Tile(m, 'dim')).join(''));
  } else if (state === 'zero') {
    prompt = t1Prompt({ query: LAB.zeroQuery, left: `0 hits · ${S.total} in the pile`, right: 'scorer clip · 38ms' });
    const nearPiles = LAB.piles.slice(0, 2).map((p) => `<button class="pline"><span>${p.label}</span><b>${p.count} in pile</b></button>`).join('');
    list = `<div class="fpanel sploot-card">
        <span class="zt">0 hits</span>
        <h3>nothing in the pile matches</h3>
        <p>"${LAB.zeroQuery}" scored under 0.20 everywhere. the pile holds no such thing.</p>
        <p>try fewer words. or feed it more chaos.</p>
        <p class="mono" style="font-size:0.6rem;opacity:0.7;margin-bottom:2px;">closest piles by vibe</p>
        ${nearPiles}
      </div>`;
    pv = strap(`0 hits for "${LAB.zeroQuery}"`, `${S.total} in the pile`) + grid(C.slice(0, 16).map((m) => t1Tile(m, 'dim')).join(''));
  } else if (state === 'empty') {
    prompt = t1Prompt({ query: '', left: '0 in the pile · nothing embedded yet', right: 'idle', disabled: true });
    piles = '';
    list = `<div class="fpanel sploot-card">
        <h3>the pile is empty</h3>
        <p>search unlocks after the first upload. three ways in:</p>
        <div class="fstep"><b>01</b><span>grab the extension. right click any image. sploot it.</span></div>
        <div class="fstep"><b>02</b><span>on your phone, share to sploot from any app.</span></div>
        <div class="fstep"><b>03</b><span>or drag files onto this window. we sort the chaos.</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          <button class="btn btn--blue sploot-press">${LAB.icon('upload')} upload your first meme</button>
          <button class="btn sploot-press">${LAB.icon('link')} get the extension</button>
        </div>
      </div>`;
    pv = `<div class="pvempty sploot-card">${LAB.doodle('ghost', { label: 'empty shelf', size: '110' })}<h2>no memes yet</h2><p>the shelf stays dotted until you feed it.</p></div>`;
  } else if (state === 'selected') {
    prompt = t1Prompt({ query: '', left: `${S.total} in the pile · ${S.embedded} embedded · queue ${S.queue}`, right: S.storage });
    const sel = [0, 5, 9];
    list = C.map((m) => t1Row(m, { marked: sel.includes(m.id) })).join('');
    foot = t1Bulk();
    pv = strap(`the pile · ${S.total} saved · 3 marked`, S.storage)
      + grid(C.slice(0, 16).map((m) => t1Tile(m, sel.includes(m.id) ? 'selected' : 'default')).join(''));
  } else if (state === 'detail') {
    prompt = t1Prompt({ query: LAB.query, left: `4 hits · ${S.total} in the pile`, right: 'scorer clip · 41ms' });
    list = hits.map((m) => t1Row(m, { mode: m.role === 'match' ? 'match' : 'plain', score: true })).join('')
      + rest.slice(0, 10).map((m) => t1Row(m, { mode: 'dim', score: true })).join('');
    pv = t1Detail();
  } else {
    prompt = t1Prompt({ query: '', left: `${S.total} in the pile · ${S.embedded} embedded · queue ${S.queue}`, right: S.storage });
    list = C.map((m) => t1Row(m, {})).join('');
    pv = strap(`the pile · ${S.total} saved · newest first`, S.storage) + grid(C.slice(0, 16).map((m) => t1Tile(m)).join(''));
  }

  return `${T1_CSS}
  <div class="opt bg-sploot-workbench" data-opt="TASTE-1">
    <aside class="finder" aria-label="finder">
      ${piles}
      <div class="flist">${list}</div>
      ${foot}
      ${prompt}
    </aside>
    <main class="pv${state === 'detail' ? ' pv--detail' : ''} bg-sploot-workbench">${pv}</main>
  </div>`;
}

/* ==================================================================== */
/* TASTE-2 · zero chrome above the grid                                 */
/* ==================================================================== */

const T2_CSS = `<style>
[data-opt="TASTE-2"] { display:flex; flex-direction:column; min-height:100dvh; font-size:0.9rem; }
[data-opt="TASTE-2"] mark { background:var(--sploot-cyan); color:#1c1547; padding:0 5px; border-radius:var(--sploot-radius-pill); }
[data-opt="TASTE-2"] .kbd { flex:none; display:inline-flex; align-items:center; justify-content:center; min-width:20px; padding:1px 7px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); font-family:var(--font-mono); font-size:0.6rem; font-weight:700; background:var(--sploot-panel); color:var(--sploot-ink); box-shadow:var(--sploot-sticker-shadow); }
[data-opt="TASTE-2"] .feed { flex:1; padding:12px 12px 10px; }
[data-opt="TASTE-2"] .sheet { display:grid; grid-template-columns:repeat(8,1fr); gap:10px; }

/* -- tile: media + one caption line. no filename tab, no action rail -- */
[data-opt="TASTE-2"] .t { position:relative; display:flex; flex-direction:column; overflow:hidden; border:3px solid var(--sploot-ink); border-radius:var(--sploot-radius-inner); background:var(--sploot-panel); box-shadow:var(--sploot-shadow-sm); }
[data-opt="TASTE-2"] .t-media { aspect-ratio:1; display:grid; place-items:center; border-bottom:2px solid var(--sploot-ink); background:var(--sploot-paper-warm); color:var(--sploot-ink); }
[data-opt="TASTE-2"] .t-cap { display:flex; align-items:center; gap:5px; min-height:24px; padding:2px 7px; }
[data-opt="TASTE-2"] .t-cap p { margin:0; flex:1; min-width:0; font-size:0.72rem; font-weight:700; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
[data-opt="TASTE-2"] .t-pct { flex:none; font-family:var(--font-mono); font-size:0.6rem; font-weight:700; }
[data-opt="TASTE-2"] .t-heart { flex:none; color:var(--sploot-magenta); display:inline-flex; }
[data-opt="TASTE-2"] .t-heart svg { width:13px; height:13px; }
[data-opt="TASTE-2"] .t-open { position:absolute; inset:0 0 24px 0; z-index:2; border:0; background:transparent; cursor:pointer; padding:0; }
[data-opt="TASTE-2"] .t-stamp { position:absolute; top:6px; right:6px; z-index:3; font-family:var(--font-mono); font-size:0.6rem; font-weight:700; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); padding:1px 8px; background:var(--sploot-lime); color:#1c1547; box-shadow:var(--sploot-sticker-shadow); }
[data-opt="TASTE-2"] .t-stamp--near { background:var(--sploot-orange); }
[data-opt="TASTE-2"] .t-check { position:absolute; top:6px; left:6px; z-index:3; display:grid; place-items:center; width:22px; height:22px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-purple); color:var(--sploot-on-purple); }
[data-opt="TASTE-2"] .t--match { outline:4px solid var(--sploot-lime); outline-offset:0; z-index:1; }
[data-opt="TASTE-2"] .t--near { outline:3px dashed var(--sploot-orange); outline-offset:2px; }
[data-opt="TASTE-2"] .t--dim { opacity:0.3; filter:saturate(0.2); }
[data-opt="TASTE-2"] .t--selected { outline:4px solid var(--sploot-purple); outline-offset:0; }

/* -- bottom chrome: pile deck + command strip. nothing above the grid -- */
[data-opt="TASTE-2"] .bottom { position:sticky; bottom:0; z-index:30; display:flex; flex-direction:column; }
[data-opt="TASTE-2"] .pilerow { display:flex; gap:8px; overflow-x:auto; padding:8px 12px; background:var(--sploot-paper); border-top:3px solid var(--sploot-ink); }
[data-opt="TASTE-2"] .pchip { flex:none; display:inline-flex; align-items:center; gap:8px; min-height:44px; padding:4px 16px; border:3px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); color:var(--sploot-ink); font-family:var(--font-mono); font-size:0.72rem; font-weight:700; text-transform:lowercase; box-shadow:var(--sploot-shadow-sm); cursor:pointer; }
[data-opt="TASTE-2"] .pchip b { font-weight:400; opacity:0.7; }
[data-opt="TASTE-2"] .pchip--on { background:var(--sploot-yellow); color:#1c1547; }
[data-opt="TASTE-2"] .strip { display:flex; align-items:center; gap:10px; padding:8px 12px calc(8px + env(safe-area-inset-bottom)); background:var(--sploot-panel); border-top:3px solid var(--sploot-ink); }
[data-opt="TASTE-2"] .sbar { flex:1; min-width:0; display:flex; align-items:center; gap:10px; min-height:44px; padding:4px 16px; border:3px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-paper-warm); box-shadow:var(--sploot-shadow-sm); }
[data-opt="TASTE-2"] .sbar input { flex:1; min-width:0; border:0; background:transparent; color:var(--sploot-ink); font:inherit; font-size:0.9rem; font-weight:700; }
[data-opt="TASTE-2"] .scount { font-family:var(--font-mono); font-size:0.6rem; font-weight:700; white-space:nowrap; }
[data-opt="TASTE-2"] .schip { flex:none; font-family:var(--font-mono); font-size:0.6rem; font-weight:700; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); padding:3px 10px; box-shadow:var(--sploot-sticker-shadow); }
[data-opt="TASTE-2"] .schip--scan { background:var(--sploot-orange); color:#1c1547; }
[data-opt="TASTE-2"] .schip--hit { background:var(--sploot-lime); color:#1c1547; }
[data-opt="TASTE-2"] .schip--zero { background:var(--sploot-red); color:var(--sploot-on-red); }
[data-opt="TASTE-2"] .strip--bulk b { font-size:0.9rem; }
[data-opt="TASTE-2"] .strip--bulk .of { font-family:var(--font-mono); font-size:0.6rem; opacity:0.7; white-space:nowrap; }

/* -- big state cards -- */
[data-opt="TASTE-2"] .bigcard { max-width:560px; margin:40px auto 24px; padding:24px; }
[data-opt="TASTE-2"] .bigcard h2 { margin:6px 0 10px; font-family:var(--font-display); font-size:1.2rem; font-weight:400; }
[data-opt="TASTE-2"] .bigcard p { margin:0 0 10px; font-size:0.9rem; }
[data-opt="TASTE-2"] .bigcard .zt { display:inline-block; font-family:var(--font-mono); font-size:0.6rem; font-weight:700; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); padding:1px 8px; background:var(--sploot-red); color:var(--sploot-on-red); }
[data-opt="TASTE-2"] .step { display:flex; gap:10px; align-items:baseline; margin:0 0 8px; font-size:0.9rem; }
[data-opt="TASTE-2"] .step b { font-family:var(--font-mono); font-size:0.6rem; opacity:0.7; }

/* -- detail: true modal, metadata beside the media -- */
[data-opt="TASTE-2"] .dlg { position:fixed; inset:0; z-index:50; display:grid; place-items:center; padding:20px; }
[data-opt="TASTE-2"] .dlg-scrim { position:absolute; inset:0; background:var(--sploot-void); opacity:0.82; }
[data-opt="TASTE-2"] .dlg-card { position:relative; z-index:1; display:flex; width:100%; max-width:980px; max-height:92dvh; overflow:auto; }
[data-opt="TASTE-2"] .dlg-media { flex:1.4; min-width:0; margin:14px; padding:28px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-inner); background:var(--sploot-paper-warm); display:grid; place-items:center; color:var(--sploot-ink); }
[data-opt="TASTE-2"] .dlg-side { flex:1; min-width:240px; padding:14px 14px 14px 0; display:flex; flex-direction:column; gap:10px; }
[data-opt="TASTE-2"] .dlg-file { align-self:flex-start; color:#1c1547; padding:2px 10px; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); font-family:var(--font-mono); font-size:0.6rem; font-weight:700; }
[data-opt="TASTE-2"] .dlg-head { display:flex; align-items:center; gap:8px; }
[data-opt="TASTE-2"] .dlg-cap { margin:0; font-size:0.9rem; font-weight:700; }
[data-opt="TASTE-2"] .dlg-actions { display:flex; align-items:center; gap:6px; }
[data-opt="TASTE-2"] .dlg-machine { margin:0; padding:10px 12px; border:2px dashed var(--sploot-ink); border-radius:var(--sploot-radius-inner); font-family:var(--font-mono); font-size:0.6rem; font-weight:700; }
[data-opt="TASTE-2"] .dlg-machine div { display:flex; justify-content:space-between; gap:14px; padding:2px 0; }
[data-opt="TASTE-2"] .dlg-machine dt { opacity:0.6; }
[data-opt="TASTE-2"] .dlg-machine dd { margin:0; }

@media (max-width:1199px) { [data-opt="TASTE-2"] .sheet { grid-template-columns:repeat(6,1fr); } }
@media (max-width:767px) {
  [data-opt="TASTE-2"] .sheet { grid-template-columns:repeat(3,1fr); gap:8px; }
  [data-opt="TASTE-2"] .feed { padding:8px 8px 6px; }
  [data-opt="TASTE-2"] .scount { display:none; }
  [data-opt="TASTE-2"] .shint { display:none; }
  [data-opt="TASTE-2"] .sbar .kbd { display:none; }
  [data-opt="TASTE-2"] .sploot-ctl { width:44px; height:44px; }
  [data-opt="TASTE-2"] .dlg { padding:0; }
  [data-opt="TASTE-2"] .dlg-card { flex-direction:column; height:100dvh; max-height:100dvh; border-radius:0; }
  [data-opt="TASTE-2"] .dlg-media { flex:none; }
  [data-opt="TASTE-2"] .dlg-side { padding:0 14px calc(14px + env(safe-area-inset-bottom)); }
}
</style>`;

function t2Tile(m, st = 'default', opts = {}) {
  const cls = ['t', 'sploot-press-sm'];
  if (st === 'match') cls.push('t--match');
  if (st === 'near') cls.push('t--near');
  if (st === 'dim') cls.push('t--dim');
  if (st === 'selected') cls.push('t--selected');
  const stamp = st === 'match'
    ? `<span class="t-stamp animate-sploot-stamp">match ${pct(m.score)}</span>`
    : st === 'near' ? `<span class="t-stamp t-stamp--near">near ${pct(m.score)}</span>` : '';
  const chk = st === 'selected' ? `<span class="t-check">${LAB.icon('check', 12)}</span>` : '';
  const heart = m.banger ? `<span class="t-heart">${LAB.icon('heartFill', 13)}</span>` : '';
  return `<article class="${cls.join(' ')}" aria-label="${m.cap}">
    <button class="t-open" aria-label="open ${m.cap}"></button>
    <div class="t-media${opts.pulse ? ' animate-sploot-pulse' : ''}">${LAB.doodle(m.kind, { label: m.cap, size: '46%' })}</div>
    <div class="t-cap"><p>${opts.hl ? hl(m.cap) : m.cap}</p>${heart}</div>
    ${chk}${stamp}
  </article>`;
}

function t2Piles() {
  const all = `<button class="pchip pchip--on sploot-press-sm">all memes <b>${LAB.stats.total} total</b></button>`;
  const rows = LAB.piles.map((p) =>
    `<button class="pchip sploot-press-sm">${p.conf < 0.56 ? 'maybe · ' : ''}${p.label} <b>${p.count} in pile</b></button>`).join('');
  return `<nav class="pilerow" aria-label="piles">${all}${rows}</nav>`;
}

function t2Strip({ query = '', count, chip = '', pulse = false, disabled = false } = {}) {
  return `<div class="strip">
    <div class="sbar">${LAB.icon('search', 16)}<input value="${query}" placeholder="type words. get the picture." aria-label="search the pile" ${disabled ? 'disabled' : ''}/><span class="kbd">/</span></div>
    <span class="scount sploot-tabular${pulse ? ' animate-sploot-pulse' : ''}">${count}</span>
    ${chip}
    <button class="sploot-ctl" aria-label="upload">${LAB.icon('upload')}</button>
    <button class="sploot-ctl" aria-label="shuffle">${LAB.icon('shuffle')}</button>
  </div>`;
}

function t2BulkStrip() {
  return `<div class="strip strip--bulk">
    <b>3 selected</b><span class="of">of ${LAB.stats.total} in the pile</span>
    <span style="flex:1"></span>
    <button class="sploot-ctl" aria-label="banger the selected">${LAB.icon('heart')}</button>
    <button class="sploot-ctl" aria-label="share the selected">${LAB.icon('share')}</button>
    <button class="sploot-ctl" aria-label="trash the selected">${LAB.icon('trash')}</button>
    <button class="sploot-ctl" aria-label="clear selection">${LAB.icon('x')}</button>
  </div>`;
}

function t2Detail() {
  const m = LAB.corpus.find((x) => x.role === 'match') || LAB.corpus[0];
  return `<div class="dlg" role="dialog" aria-modal="true" aria-label="meme detail: ${m.cap}">
    <div class="dlg-scrim"></div>
    <div class="dlg-card sploot-card">
      <div class="dlg-media">${LAB.doodle(m.kind, { label: m.cap, size: '240' })}</div>
      <div class="dlg-side">
        <div class="dlg-head">
          <span class="dlg-file tone-${m.tone}">${m.file}</span>
          <span style="flex:1"></span>
          <span class="kbd">esc</span>
          <button class="sploot-ctl" aria-label="close detail">${LAB.icon('x')}</button>
        </div>
        <p class="dlg-cap">${m.cap}</p>
        <div class="dlg-actions">
          <button class="sploot-ctl" aria-label="banger" aria-pressed="${m.banger}">${LAB.icon(m.banger ? 'heartFill' : 'heart')}</button>
          <button class="sploot-ctl" aria-label="share">${LAB.icon('share')}</button>
          <button class="sploot-ctl" aria-label="trash">${LAB.icon('trash')}</button>
          <span style="flex:1"></span>
          <button class="sploot-ctl" aria-label="previous meme">${LAB.icon('arrowL')}</button>
          <button class="sploot-ctl" aria-label="next meme">${LAB.icon('arrowR')}</button>
        </div>
        <dl class="dlg-machine">
          <div><dt>index</dt><dd>${m.index}</dd></div>
          <div><dt>match</dt><dd>${pct(m.score)} · cos ${m.score}</dd></div>
          <div><dt>scorer</dt><dd>clip-vit-b32</dd></div>
          <div><dt>route</dt><dd>/api/search</dd></div>
          <div><dt>status</dt><dd>embedded</dd></div>
        </dl>
      </div>
    </div>
  </div>`;
}

function t2Render(state) {
  const C = LAB.corpus;
  const S = LAB.stats;
  const hits = C.filter((m) => m.role);
  const rest = C.filter((m) => !m.role);
  const sheet = (tiles) => `<div class="sheet">${tiles}</div>`;

  let feed; let piles = t2Piles(); let strip; let modal = '';

  if (state === 'searching') {
    feed = sheet(C.map((m) => t2Tile(m, 'dim', { pulse: true })).join(''));
    strip = t2Strip({ query: LAB.query, count: `scoring "${LAB.query}" against ${S.embedded} vectors`, chip: '<span class="schip schip--scan animate-sploot-pulse">scoring</span>', pulse: true });
  } else if (state === 'results') {
    feed = sheet(hits.map((m) => t2Tile(m, m.role, { hl: true })).join('') + rest.map((m) => t2Tile(m, 'dim')).join(''));
    strip = t2Strip({ query: LAB.query, count: `showing 4 of ${S.total} in the pile`, chip: '<span class="schip schip--hit animate-sploot-pop">4 hits</span>' });
  } else if (state === 'zero') {
    feed = `<div class="bigcard sploot-card">
        <span class="zt">0 hits</span>
        <h2>nothing matches</h2>
        <p>"${LAB.zeroQuery}" scored under 0.20 against all ${S.embedded} embedded memes. the pile holds no such thing.</p>
        <p>try fewer words. or upload the thing you wish existed.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn sploot-press">${LAB.icon('x')} clear query</button>
          <button class="btn btn--blue sploot-press">${LAB.icon('upload')} upload chaos</button>
        </div>
      </div>` + sheet(C.slice(0, 16).map((m) => t2Tile(m, 'dim')).join(''));
    strip = t2Strip({ query: LAB.zeroQuery, count: `showing 0 of ${S.total} in the pile`, chip: '<span class="schip schip--zero">0 hits</span>' });
  } else if (state === 'empty') {
    feed = `<div class="bigcard sploot-card">
        ${LAB.doodle('ghost', { label: 'empty pile', size: '90' })}
        <h2>the pile is empty</h2>
        <p>search unlocks after the first upload. three ways in:</p>
        <div class="step"><b>01</b><span>grab the extension. right click any image. sploot it.</span></div>
        <div class="step"><b>02</b><span>on your phone, share to sploot from any app.</span></div>
        <div class="step"><b>03</b><span>or drag files onto this window. we sort the chaos.</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          <button class="btn btn--blue sploot-press">${LAB.icon('upload')} upload your first meme</button>
          <button class="btn sploot-press">${LAB.icon('link')} get the extension</button>
        </div>
      </div>`;
    piles = '';
    strip = t2Strip({ query: '', count: '0 in the pile', disabled: true });
  } else if (state === 'selected') {
    const sel = [0, 5, 9];
    feed = sheet(C.map((m) => t2Tile(m, sel.includes(m.id) ? 'selected' : 'default')).join(''));
    strip = t2BulkStrip();
  } else if (state === 'detail') {
    feed = sheet(C.map((m) => t2Tile(m)).join(''));
    strip = t2Strip({ query: '', count: `${S.total} in the pile · ${S.embedded} embedded · queue ${S.queue}` });
    modal = t2Detail();
  } else {
    feed = sheet(C.map((m) => t2Tile(m)).join(''));
    strip = t2Strip({ query: '', count: `${S.total} in the pile · ${S.embedded} embedded · queue ${S.queue}` });
  }

  return `${T2_CSS}
  <div class="opt bg-sploot-workbench" data-opt="TASTE-2">
    <main class="feed" aria-label="the pile">${feed}</main>
    <div class="bottom">${piles}${strip}</div>
    ${modal}
  </div>`;
}

/* ==================================================================== */

export const SPECS = {
  'TASTE-1': {
    name: 'finder pane',
    lane: 'taste',
    move: 'inverts the brief: a full-height fzf finder pane IS the interface; the grid demotes to a preview shelf beside it',
    notes: 'declared dials, counted at 1440x900: finder pane 500px wide; 13 finder rows at 52px + 14 preview tiles (4 cols, 1:1) visible = 27 retrieval objects per viewport; chrome above the preview grid = one 24px machine strap (ceiling 32px, defended); type scale locked to 0.6/0.72/0.9/1.2rem, nothing off-scale. deleted from the baseline: the top command bar (the finder prompt replaces it), the pile pill rail (piles become mono filter lines with count + confidence, cheaper per pile and always visible), per-tile filename tabs and hover action rails (filenames live on finder rows, actions live in detail and the bulk bar; neither aided visual scan). scores render as human percent; raw cosine only in the detail machine block. selection is fzf tab-to-mark on rows; bulk bar docks in the finder footer. detail is a pane takeover with role=dialog, aria-modal=false while docked on desktop; runtime must stamp aria-modal=true and trap focus when it goes fullscreen on mobile. mobile: prompt + upload/shuffle ctls dock at the BOTTOM (thumb-first), piles become a horizontal 44px line above the list, hotkey footer dies (no keyboard, no rent). tile radius is 10 from the scale: 18 eats corners under 220px.',
    render(state) { return t1Render(state); },
  },
  'TASTE-2': {
    name: 'counted sheet',
    lane: 'taste',
    move: 'zero chrome above the grid: a full-bleed 8x4 counted tile sheet with ALL chrome in one fzf-style command strip docked at the bottom',
    notes: 'declared dials, counted at 1440x900: chrome above the grid = 0px, hard ceiling 0, defended; all chrome is a bottom deck of 126px (44px pile chips row + 44px strip, borders included; ceiling 130px); 32 full tiles visible (8 cols x 4 rows of ~190px, 5th row peeking as scroll affordance); mobile 390x844 = 3 cols x 5 rows = 15 tiles; type scale locked to 0.6/0.72/0.9/1.2rem. deleted from the baseline: the entire top bar (search reads as fast at the bottom and buys back ~110px of grid), per-tile filename tabs and action rails (filename and actions live in detail only; the tile is media + one caption line), upload/shuffle as pill buttons (now ink minis in the strip). the strip is the state machine: browse = counts, searching = pulsing orange scoring chip + vector count, results = lime hits chip + showing-4-of-612, zero = red 0-hits chip + zero card over the dimmed sheet; the three are unmistakable at a glance. selection morphs the strip into the bulk bar. detail is a true centered modal (role=dialog, aria-modal=true, labeled close, visible esc chip) with the metadata ledger BESIDE the media, never over it; scrim is flat void at 0.82 opacity, no blur. mobile is the same structure honestly: the strip was already at the thumb. tile radius 10 from the scale: 18 eats corners at 168px.',
    render(state) { return t2Render(state); },
  },
};
