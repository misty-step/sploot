/* lab 035 · BASE lane — the shipped views (post-fixpack screenshots).
   Baselines are truthful captures, not rebuilds: what production renders
   today, for side-by-side judgment against the layout propositions. */
'use strict';

(() => {
  const shot = (id, file, note) => {
    SPECS[id] = (m) => {
      m.innerHTML = `
      <div class="t-shelf" style="min-height:100dvh">
        <div style="flex:1;overflow:auto;background:#333">
          <img src="baseline/${file}" alt="${note}" style="display:block;width:100%;max-width:1440px;margin:0 auto">
        </div>
        ${labSpec([['baseline', note], ['capture', 'live QA rig, post-fixpack 2026-07-10'], ['note', 'screenshot, not a rebuild — interactions not live']])}
      </div>`;
    };
  };
  shot('BASE-LAND', 'land.png', 'shipped signed-out landing (light)');
  shot('BASE-FEED', 'feed.png', 'shipped /app feed incl. header nav + filter bar (light)');
  shot('BASE-DET', 'det.png', 'shipped meme detail (dark capture, full page)');
  shot('BASE-UP', 'up.png', 'shipped upload (dark capture, full page)');
  shot('BASE-SET', 'set.png', 'shipped settings (dark capture, full page)');
  SPECS['BASE-NAV'] = SPECS['BASE-FEED']; // nav/filter chrome lives in the feed capture
})();
