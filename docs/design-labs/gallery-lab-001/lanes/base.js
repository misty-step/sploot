/* lanes/base.js · BASE-0 — the shipped /app gallery, round-1 baseline.
   Honest reproduction of apps/web/app/app/page.tsx on origin/master:
   top command bar (search + upload/shuffle), pile filter rail, 4-column
   masonry, mobile bottom command dock, and the CURRENT lightbox: a
   black/80 backdrop-blur overlay with floating circular buttons — kept
   as shipped, even though backdrop-blur is a DESIGN.md anti-pattern.
   The baseline never counts toward the Design Labs Law. */

const CSS = `
<style>
[data-opt="BASE-0"] { display:flex; flex-direction:column; min-height:100dvh; }
[data-opt="BASE-0"] .cmd { border-bottom:3px solid var(--sploot-cyan); background:var(--sploot-paper); padding:10px 24px; }
[data-opt="BASE-0"] .cmd-inner { max-width:1280px; margin:0 auto; display:flex; flex-direction:column; gap:10px; }
[data-opt="BASE-0"] .row { display:flex; align-items:center; gap:12px; }
[data-opt="BASE-0"] .searchbar { flex:1; display:flex; align-items:center; gap:10px; min-height:44px; padding:6px 18px; border:3px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); box-shadow:var(--sploot-shadow-sm); font-weight:700; }
[data-opt="BASE-0"] .searchbar input { border:0; background:transparent; flex:1; font:inherit; color:var(--sploot-ink); min-width:0; }
[data-opt="BASE-0"] .rail { display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; }
[data-opt="BASE-0"] .count { font-family:var(--font-mono); font-size:0.72rem; opacity:0.75; white-space:nowrap; }
[data-opt="BASE-0"] .feed { flex:1; overflow:auto; padding:16px 24px calc(6rem); }
[data-opt="BASE-0"] .masonry { max-width:1280px; margin:0 auto; columns:4; column-gap:16px; }
[data-opt="BASE-0"] .masonry .cell { margin:0 0 16px; break-inside:avoid; }
[data-opt="BASE-0"] .dock { display:none; }
[data-opt="BASE-0"] .lightbox { position:fixed; inset:0; z-index:50; background:rgba(0,0,0,0.8); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:24px; }
[data-opt="BASE-0"] .lb-top { position:fixed; top:16px; left:16px; right:16px; display:flex; justify-content:flex-end; gap:8px; z-index:60; }
[data-opt="BASE-0"] .lb-btn { width:40px; height:40px; border-radius:50%; border:0; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); color:#fff; display:grid; place-items:center; }
[data-opt="BASE-0"] .lb-media { max-width:900px; max-height:90vh; }
[data-opt="BASE-0"] .lb-cap { color:#fff; margin-top:12px; }
[data-opt="BASE-0"] .lb-cap p { margin:0; }
[data-opt="BASE-0"] .lb-cap small { color:rgba(255,255,255,0.8); }
[data-opt="BASE-0"] .alertline { max-width:1280px; margin:0 auto 12px; font-weight:700; }
[data-opt="BASE-0"] .emptywrap { max-width:640px; margin:48px auto; }
@media (max-width: 767px) {
  [data-opt="BASE-0"] .cmd .searchbar, [data-opt="BASE-0"] .cmd .btn, [data-opt="BASE-0"] .count { display:none; }
  [data-opt="BASE-0"] .masonry { columns:2; column-gap:10px; }
  [data-opt="BASE-0"] .masonry .cell { margin-bottom:10px; }
  [data-opt="BASE-0"] .feed { padding:10px 10px calc(7rem + env(safe-area-inset-bottom)); }
  [data-opt="BASE-0"] .dock { display:flex; position:fixed; left:12px; right:12px; bottom:calc(12px + env(safe-area-inset-bottom)); z-index:40; justify-content:space-between; gap:8px; padding:10px 14px; border:3px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); box-shadow:var(--sploot-shadow); }
  [data-opt="BASE-0"] .dock button { display:flex; flex-direction:column; align-items:center; gap:2px; min-width:44px; min-height:44px; justify-content:center; border:2px solid var(--sploot-ink); border-radius:var(--sploot-radius-pill); background:var(--sploot-panel); color:var(--sploot-ink); font-family:var(--font-mono); font-size:0.55rem; font-weight:700; }
}
</style>`;

function grid(items, opts = {}) {
  return `<div class="masonry">${items.map((m) => LAB.cell(m, { state: opts.states?.(m) || 'default', score: opts.score })).join('')}</div>`;
}

function dock() {
  const b = (ic, l) => `<button>${LAB.icon(ic, 16)}<span>${l}</span></button>`;
  return `<nav class="dock" aria-label="commands">${b('upload', 'upload')}${b('search', 'search')}${b('shuffle', 'shuffle')}${b('heart', 'bangers')}${b('tag', 'tags')}</nav>`;
}

function chrome(body, { query = '', hits = null } = {}) {
  const piles = LAB.piles
    .map((p) => `<button class="pill">${p.conf < 0.56 ? 'maybe ' : ''}${p.label}<small>${p.count} in pile</small></button>`)
    .join('');
  return `<div class="opt" data-opt="BASE-0">
  ${CSS}
  <div class="cmd">
    <div class="cmd-inner">
      <div class="row">
        <div class="searchbar">${LAB.icon('search')}<input value="${query}" placeholder="type words. get the picture." aria-label="search" /></div>
        <button class="btn btn--blue sploot-press">${LAB.icon('upload')} upload</button>
        <button class="btn sploot-press">${LAB.icon('shuffle')} shuffle</button>
      </div>
      <div class="row">
        <div class="rail"><button class="pill pill--on">all memes<small>${LAB.stats.total} total</small></button>${piles}</div>
        <span class="count">${hits !== null ? `${hits} matches` : `${LAB.stats.total} memes · ${LAB.stats.embedded} embedded`}</span>
      </div>
    </div>
  </div>
  <div class="feed bg-sploot-workbench">${body}</div>
  ${dock()}
  </div>`;
}

export const SPECS = {
  'BASE-0': {
    name: 'shipped workbench (baseline)',
    lane: 'base',
    move: 'top command bar + pile rail over a 4-col masonry; off-system black/80 blur lightbox; bottom mobile dock',
    notes: 'round-1 baseline; does not count toward the Law. Lightbox reproduced as shipped including the backdrop-blur anti-pattern and missing focus trap. No bulk selection ships today; the selected state shows the grape ring only.',
    render(state) {
      const C = LAB.corpus;
      if (state === 'empty') {
        return chrome(`
          <div class="emptywrap sploot-card" style="padding:28px;text-align:center;">
            <h2 class="display" style="margin:0 0 8px;font-size:1.5rem;">the pile is empty</h2>
            <p style="margin:0 0 16px;">upload chaos. we will sort it. no folders. just vibes.</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
              ${[C[4], C[0], C[2]].map((m, i) => LAB.cell(m, { state: i === 1 ? 'match' : 'dim', caption: false })).join('')}
            </div>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
              <button class="btn btn--blue sploot-press">${LAB.icon('upload')} upload your first meme</button>
              <button class="btn sploot-press">${LAB.icon('link')} get the extension</button>
            </div>
          </div>`);
      }
      if (state === 'searching') {
        return chrome(
          `<div style="max-width:1280px;margin:0 auto;">
            <p class="mono alertline animate-sploot-pulse">searching the pile for "${LAB.query}"…</p>
            ${grid(C.slice(0, 12), { states: () => 'dim' })}
          </div>`,
          { query: LAB.query }
        );
      }
      if (state === 'results') {
        return chrome(
          `<div style="max-width:1280px;margin:0 auto;">
            <p class="alertline">showing <b>4</b> matches for "${LAB.query}"</p>
            ${grid(C, { states: (m) => m.role || 'dim', score: true })}
          </div>`,
          { query: LAB.query, hits: 4 }
        );
      }
      if (state === 'zero') {
        return chrome(
          `<div style="max-width:1280px;margin:0 auto;">
            <p class="alertline">no matches yet for "${LAB.zeroQuery}". try adjusting your search.</p>
            ${grid(C.slice(0, 8), { states: () => 'dim' })}
          </div>`,
          { query: LAB.zeroQuery, hits: 0 }
        );
      }
      if (state === 'selected') {
        return chrome(grid(C, { states: (m) => ([0, 5, 9].includes(m.id) ? 'selected' : 'default') }));
      }
      if (state === 'detail') {
        const m = C[0];
        return chrome(grid(C) + `
          <div class="lightbox" role="dialog" aria-label="${m.cap}">
            <div class="lb-top">
              <button class="lb-btn" aria-label="banger">${LAB.icon('heartFill')}</button>
              <button class="lb-btn" aria-label="share">${LAB.icon('share')}</button>
              <button class="lb-btn" aria-label="delete">${LAB.icon('trash')}</button>
              <button class="lb-btn" aria-label="close">${LAB.icon('x')}</button>
            </div>
            <div>
              <div class="lb-media" style="background:var(--sploot-paper-warm);border-radius:10px;padding:48px;color:var(--sploot-ink);">${LAB.doodle(m.kind, { label: m.cap, size: '320' })}</div>
              <div class="lb-cap"><p>${m.file}</p><small>${m.cap}</small></div>
            </div>
          </div>`);
      }
      return chrome(grid(C));
    },
  },
};
