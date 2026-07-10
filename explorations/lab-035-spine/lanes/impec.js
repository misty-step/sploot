/* lab 035 · IMPEC lane — impeccable design philosophy applied to layout,
   structure, hierarchy, and content. Kit-composed within the locked toybox
   system. Structural CSS only; visual language obeys frame.css. */
'use strict';

(() => {

  /* ────────────────────────────────────────────────────────────
     LAND-1 · split editorial
     Left: value proposition tower (sticky). Right: working search
     console + live demo cells. Next-section piles peek at bottom.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-LAND-1'] = (m) => {
    css('impec-land-1', `
      .impec-l1-split { display: grid; grid-template-columns: 5fr 7fr; gap: 32px; align-items: start; padding: clamp(18px, 4vw, 44px); flex: 1; }
      .impec-l1-left { display: flex; flex-direction: column; gap: 22px; position: sticky; top: 18px; }
      .impec-l1-cta { display: flex; gap: 12px; flex-wrap: wrap; }
      .impec-l1-right { display: flex; flex-direction: column; gap: 18px; }
      .impec-l1-demo { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .impec-l1-peek { display: flex; gap: 10px; flex-wrap: wrap; padding: 14px 0; opacity: .58; }
      @media (max-width: 780px) {
        .impec-l1-split { grid-template-columns: 1fr; }
        .impec-l1-left { position: static; }
        .impec-l1-demo { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 500px) {
        .impec-l1-demo { grid-template-columns: 1fr; }
      }
    `);
    m.innerHTML = `<div class="t-shelf">
      <div class="impec-l1-split">
        <div class="impec-l1-left">
          <h1 class="t-h1">type words.<br><em>get the picture.</em></h1>
          <p style="max-width:44ch;font-size:clamp(14px,1.6vw,18px);line-height:1.4">it is a search box. for memes. drop your chaos in here, describe what you remember, the machine finds it. no folders. just vibes.</p>
          <div class="impec-l1-cta">
            <a href="#0" class="t-btn primary t-press">start the pile</a>
            <a href="#0" class="t-btn secondary t-press">shuffle someone else's</a>
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap">
            <div class="t-stat"><b>${LIB.total.toLocaleString()}</b><span>memes in the pile</span></div>
            <div class="t-stat magenta"><b>${LIB.embedded.toLocaleString()}</b><span>searchable</span></div>
          </div>
        </div>
        <div class="impec-l1-right" style="padding-top:8px">
          ${kConsole('cat losing it')}
          <div class="impec-l1-demo">
            ${MEMES.slice(0, 3).map((meme) => kCell(meme, '', { noRail: true, score: true })).join('')}
          </div>
        </div>
      </div>
      <div class="impec-l1-peek" style="padding-inline:clamp(18px,4vw,44px)">
        <span class="t-note">the pile waits for you &middot;</span>
        ${kPiles(0)}
      </div>
      ${labSpec([['section', 'landing'], ['structure', '5:7 split grid, left tower sticky, right demo console + 3 preview cells'], ['hierarchy', 'headline leads over demo; stat block anchors the claim'], ['density', 'medium — one value-prop tower, one console, one stat row']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     LAND-2 · stacked center-stage
     Headline block top-center. Console as hero centerpiece below.
     Stat row proves scale. Piles as the "what's inside" reveal.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-LAND-2'] = (m) => {
    css('impec-land-2', `
      .impec-l2-stage { display: flex; flex-direction: column; align-items: center; gap: 26px; max-width: 820px; margin: auto; padding: clamp(22px, 5vw, 52px) clamp(14px, 4vw, 44px); flex: 1; }
      .impec-l2-head { text-align: center; display: flex; flex-direction: column; gap: 14px; }
      .impec-l2-head p { max-width: 52ch; margin-inline: auto; font-size: clamp(14px, 1.6vw, 18px); line-height: 1.4; }
      .impec-l2-cta { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
      .impec-l2-stats { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; }
    `);
    m.innerHTML = `<div class="t-shelf">
      <div class="impec-l2-stage">
        <div class="impec-l2-head">
          <h1 class="t-h1">your chaos, <em>sorted.</em></h1>
          <p>a personal meme library that searches by meaning. save anything. find everything. the pile organizes itself while you sleep.</p>
          <div class="impec-l2-cta">
            <a href="#0" class="t-btn primary t-press">get started</a>
            <a href="#0" class="t-btn ink t-press">see the pile</a>
          </div>
        </div>
        ${kConsole('dramatic chipmunk')}
        <div class="impec-l2-stats">
          <div class="t-stat blue"><b>${LIB.dim}</b><span>embedding dimensions</span></div>
          <div class="t-stat"><b>${LIB.embedded.toLocaleString()}</b><span>indexed memes</span></div>
          <div class="t-stat magenta"><b>${LIB.latency}ms</b><span>search latency</span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;width:100%">
          <span class="t-note">sample piles &middot; the machine groups these automatically</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${kPiles(1)}</div>
        </div>
      </div>
      ${labSpec([['section', 'landing'], ['structure', 'single centered column, console as hero, stats below, piles as reveal'], ['hierarchy', 'headline hooks, console proves, stats anchor, piles invite'], ['density', 'medium — one console, three stats, five piles']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     NAV-1 · single command bar
     Logo left, search center, icon cluster right. Filter row
     beneath with tabs + piles. Feed excerpt proves density.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-NAV-1'] = (m) => {
    css('impec-nav-1', `
      .impec-n1-mast { display: flex; align-items: center; gap: 16px; padding: 10px clamp(14px, 4vw, 36px); background: var(--panel); border-bottom: var(--b); flex-wrap: wrap; }
      .impec-n1-search { flex: 1; min-width: 200px; max-width: 480px; display: flex; align-items: center; gap: 8px; border: var(--b); border-radius: var(--r-pill); padding: 8px 14px; background: var(--paper-warm); }
      .impec-n1-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; }
      .impec-n1-acts { display: flex; align-items: center; gap: 8px; }
      .impec-n1-sub { display: flex; align-items: center; gap: 14px; padding: 9px clamp(14px, 4vw, 36px); background: var(--paper-warm); border-bottom: var(--b); flex-wrap: wrap; }
      .impec-n1-tabs { display: flex; gap: 5px; flex-wrap: wrap; }
      .impec-n1-feed { flex: 1; overflow: auto; padding: 18px clamp(14px, 4vw, 36px); }
    `);
    m.innerHTML = `<div class="t-shelf">
      <div class="impec-n1-mast">
        <span class="t-logo">spl<i>oo</i>t</span>
        <div class="impec-n1-search">
          ${ICONS.search}
          <input placeholder="find a meme..." aria-label="search the pile">
        </div>
        <div class="impec-n1-acts">
          ${kCtl('upload', 'upload meme')}
          ${kCtl('shuffle', 'shuffle the pile')}
          ${kCtl('sun', 'switch theme')}
        </div>
      </div>
      <div class="impec-n1-sub">
        <div class="t-tabs">
          <button class="t-tab on">all</button>
          <button class="t-tab">bangers</button>
          <button class="t-tab">recent</button>
        </div>
        <span class="t-note" style="flex:1;min-width:0">${LIB.total.toLocaleString()} memes &middot; ${LIB.embedded.toLocaleString()} indexed</span>
        ${kPiles(0)}
      </div>
      <div class="impec-n1-feed">
        <div class="t-grid">
          ${MEMES.slice(0, 8).map((meme) => kCell(meme)).join('')}
        </div>
      </div>
      ${labSpec([['section', 'nav'], ['structure', 'single-row masthead + subnav filter bar, search centered between logo and icon cluster'], ['hierarchy', 'logo anchors left, search dominates center, actions group right, filters span full width'], ['density', 'tight — compact mast, pile chips inline, 8-cell grid excerpt']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     NAV-2 · two-row header
     Row 1: logo + status readout + actions (upload, theme).
     Row 2: full-width search + filter chips. Feed follows.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-NAV-2'] = (m) => {
    css('impec-nav-2', `
      .impec-n2-mast { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px clamp(14px, 4vw, 36px); background: var(--panel); border-bottom: var(--b); flex-wrap: wrap; }
      .impec-n2-mid { display: flex; align-items: center; gap: 18px; }
      .impec-n2-bar { display: flex; align-items: center; gap: 14px; padding: 9px clamp(14px, 4vw, 36px); background: var(--paper-warm); border-bottom: var(--b); flex-wrap: wrap; }
      .impec-n2-search { flex: 1; display: flex; align-items: center; gap: 8px; border: var(--b); border-radius: var(--r-pill); padding: 8px 14px; background: var(--panel); min-width: 200px; max-width: 600px; }
      .impec-n2-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; }
      .impec-n2-piles { display: flex; gap: 6px; flex-wrap: wrap; }
      .impec-n2-feed { flex: 1; overflow: auto; padding: 18px clamp(14px, 4vw, 36px); }
    `);
    m.innerHTML = `<div class="t-shelf">
      <div class="impec-n2-mast">
        <div class="impec-n2-mid">
          <span class="t-logo">spl<i>oo</i>t</span>
          ${kStatus()}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          ${kCtl('upload', 'upload meme', 'dock')}
          ${kCtl('shuffle', 'shuffle')}
          ${kCtl('sun', 'switch theme')}
          <a href="#0" class="t-btn compact t-press-sm">help</a>
        </div>
      </div>
      <div class="impec-n2-bar">
        <div class="impec-n2-search">
          ${ICONS.search}
          <input placeholder="find a meme..." aria-label="search">
        </div>
        <div class="impec-n2-piles">${kPiles(2)}</div>
        <div class="t-tabs">
          <button class="t-tab on">all</button>
          <button class="t-tab">bangers</button>
        </div>
      </div>
      <div class="impec-n2-feed">
        <div class="t-grid">
          ${MEMES.slice(0, 6).map((meme) => kCell(meme)).join('')}
        </div>
      </div>
      ${labSpec([['section', 'nav'], ['structure', 'two-row: logo+status+actions top, search+piles+tabs bottom, feed below'], ['hierarchy', 'status bar gives real-time proof, search spans full second row, piles+tab share filter row'], ['density', 'tight — two chrome rows feed a 6-cell proof grid']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     FEED-1 · uniform grid, piles-as-header
     Clean 4-column t-grid. Pile chips lead above. Standard cell
     caps + rails. 12 cells for scan rhythm.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-FEED-1'] = (m) => {
    css('impec-feed-1', `
      .impec-f1-piles { display: flex; gap: 8px; padding: 14px clamp(14px, 4vw, 36px); flex-wrap: wrap; align-items: center; }
      .impec-f1-grid { padding: 12px clamp(14px, 4vw, 36px) 28px; }
    `);
    m.innerHTML = `<div class="t-shelf">
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="impec-f1-piles">
        <span class="t-note">piles &middot;</span>
        ${kPiles(0)}
      </div>
      <div class="impec-f1-grid">
        <div class="t-grid">
          ${MEMES.slice(0, 12).map((meme) => kCell(meme)).join('')}
        </div>
      </div>
      ${kStatus()}
      ${labSpec([['section', 'feed'], ['structure', 'masthead, pile header chips, 4-column t-grid, status footer'], ['hierarchy', 'mast frames top, piles as filter suggestion band, grid dominates viewport'], ['density', 'high — 12 cells in uniform 4-col rhythm, caps + rails on every cell']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     FEED-2 · mixed-span masonry, piles-as-side-rail
     Varying column spans (1x/2x) create natural scan break.
     Piles as a vertical rail on the left. Some cells denser
     (no caps), some full. 10 cells with varied metadata.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-FEED-2'] = (m) => {
    css('impec-feed-2', `
      .impec-f2-wrap { display: flex; gap: 18px; padding: 14px clamp(14px, 4vw, 36px); flex: 1; overflow: auto; }
      .impec-f2-rail { display: flex; flex-direction: column; gap: 8px; min-width: 180px; max-width: 200px; position: sticky; top: 0; align-self: start; padding: 8px 0; }
      .impec-f2-grid { flex: 1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; align-content: start; }
      .impec-f2-full { grid-column: span 2; }
      @media (max-width: 900px) {
        .impec-f2-rail { display: none; }
        .impec-f2-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }
      @media (max-width: 700px) {
        .impec-f2-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .impec-f2-full { grid-column: span 2; }
      }
    `);
    m.innerHTML = `<div class="t-shelf">
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="impec-f2-wrap">
        <div class="impec-f2-rail">
          <span class="t-note" style="padding:0 6px">piles</span>
          ${kPiles(0)}
        </div>
        <div class="impec-f2-grid">
          ${kCell(MEMES[0], '', { noRail: true })}
          ${kCell(MEMES[1], '', { noCap: true })}
          ${kCell(MEMES[2], '', { score: true })}
          ${kCell(MEMES[3])}
          ${kCell(MEMES[4])}
          ${kCell(MEMES[5], '', { noRail: true, score: true })}
          ${kCell(MEMES[6], '', { class: 'impec-f2-full', noCap: true })}
          ${kCell(MEMES[7])}
          ${kCell(MEMES[8])}
          ${kCell(MEMES[9])}
        </div>
      </div>
      ${kStatus()}
      ${labSpec([['section', 'feed'], ['structure', 'flex row: left pile rail (sticky), right mixed-span grid with 2x spans'], ['hierarchy', 'piles as persistent taxonomy rail, varied cell density breaks scan monotony'], ['density', 'medium-high — some cells no-cap/score-only, 2x spans punctuate rhythm']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     DET-1 · editorial split
     Large media left (uncropped, aspect preserved). Metadata
     card right (sticky): file, dims, size, vec, date, actions.
     Related section spans full width below.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-DET-1'] = (m) => {
    const meme = MEMES[2];
    css('impec-det-1', `
      .impec-d1-body { display: grid; grid-template-columns: 1fr 340px; gap: 24px; padding: 18px clamp(14px, 4vw, 36px); flex: 1; overflow: auto; align-items: start; }
      .impec-d1-media { border: var(--b); border-radius: var(--r); background: var(--paper-warm); display: grid; place-items: center; overflow: hidden; }
      .impec-d1-media img { width: 100%; height: 100%; object-fit: contain; }
      .impec-d1-side { position: sticky; top: 14px; display: flex; flex-direction: column; gap: 16px; }
      .impec-d1-meta { display: flex; flex-direction: column; gap: 6px; }
      .impec-d1-row { display: flex; justify-content: space-between; font-size: 12px; padding: 7px 0; border-bottom: 1px dashed var(--ink); }
      .impec-d1-row b { font: 10px var(--mono); color: var(--ink); opacity: .65; }
      .impec-d1-acts { display: flex; gap: 8px; }
      .impec-d1-relate { padding: 0 clamp(14px, 4vw, 36px) 24px; }
      .impec-d1-relate h3 { font-family: var(--display); font-size: 20px; margin-bottom: 14px; }
      @media (max-width: 800px) {
        .impec-d1-body { grid-template-columns: 1fr; }
        .impec-d1-side { position: static; }
      }
    `);
    m.innerHTML = `<div class="t-shelf">
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="impec-d1-body">
        <div class="impec-d1-media" style="aspect-ratio:${meme.aspect}">${memeImg(meme)}</div>
        <div class="impec-d1-side">
          <h3 style="font-family:var(--display);font-size:18px;line-height:1.2">${esc(meme.cap)}</h3>
          <div class="t-card" style="padding:14px">
            <div class="impec-d1-meta">
              <div class="impec-d1-row"><b>file</b> <span>${esc(meme.file)}</span></div>
              <div class="impec-d1-row"><b>dimensions</b> <span>${meme.aspect}</span></div>
              <div class="impec-d1-row"><b>embedding</b> <span>vec ${esc(meme.vec)}</span></div>
              <div class="impec-d1-row"><b>added</b> <span>3 days ago</span></div>
            </div>
            <div class="impec-d1-acts" style="margin-top:12px">
              ${kCtl('heart', meme.banger ? 'remove banger' : 'mark banger', meme.banger ? 'hearted dock' : 'dock')}
              ${kCtl('share', 'share meme', 'dock')}
              ${kCtl('trash', 'delete meme', 'dock')}
            </div>
          </div>
          <div class="t-stat"><b>${(meme.score / 100).toFixed(2)}</b><span>similarity score</span></div>
        </div>
      </div>
      <div class="impec-d1-relate">
        <div class="t-grid">
          ${MEMES.slice(3, 7).map((rm, i) => `<article class="t-cell ${i === 0 ? 'match' : i === 1 ? 'near' : ''}">
            <div class="media" style="aspect-ratio:${rm.aspect}">${memeImg(rm)}</div>
            <div class="cap"><span>${esc(rm.cap)}</span><b>${(rm.score / 100).toFixed(2)}</b></div>
          </article>`).join('')}
        </div>
      </div>
      ${labSpec([['section', 'det'], ['structure', 'grid split: media left (2:1 ratio), metadata card right (sticky), related 4-col below'], ['hierarchy', 'uncropped media dominates, stats in a t-card with actions, related below with match/near markers'], ['density', 'medium — large media, compact metadata card, 4 related cells']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     DET-2 · stacked detail
     Media full-width top, uncropped. Metadata + actions in a
     t-card strip below. Related grid with similarity percentages
     spans full width.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-DET-2'] = (m) => {
    const meme = MEMES[0];
    css('impec-det-2', `
      .impec-d2-hero { display: flex; justify-content: center; padding: 18px clamp(14px, 4vw, 36px); }
      .impec-d2-hero .media { max-width: 800px; width: 100%; border: var(--b); border-radius: var(--r); background: var(--paper-warm); display: grid; place-items: center; overflow: hidden; }
      .impec-d2-hero .media img { width: 100%; height: 100%; object-fit: contain; }
      .impec-d2-strip { display: flex; gap: 18px; padding: 10px clamp(14px, 4vw, 36px) 14px; flex-wrap: wrap; align-items: flex-start; }
      .impec-d2-meta { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; flex: 1; min-width: 0; }
      .impec-d2-meta .t-stat { flex: 1; min-width: 100px; }
      .impec-d2-acts { display: flex; gap: 8px; }
      .impec-d2-relate { padding: 0 clamp(14px, 4vw, 36px) 24px; }
    `);
    m.innerHTML = `<div class="t-shelf">
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="impec-d2-hero">
        <div class="media" style="aspect-ratio:${meme.aspect}">${memeImg(meme)}</div>
      </div>
      <div class="impec-d2-strip">
        <div style="flex:1;min-width:200px">
          <h3 style="font-family:var(--display);font-size:18px;line-height:1.2;margin-bottom:6px">${esc(meme.cap)}</h3>
          <span class="t-note">${esc(meme.file)} &middot; ${meme.aspect} &middot; vec ${esc(meme.vec)} &middot; added 3 days ago</span>
        </div>
        <div class="impec-d2-meta">
          <div class="t-stat"><b>${(meme.score / 100).toFixed(2)}</b><span>similarity</span></div>
          <div class="impec-d2-acts">
            ${kCtl('heart', meme.banger ? 'remove banger' : 'mark banger', meme.banger ? 'hearted dock' : 'dock')}
            ${kCtl('share', 'share meme', 'dock')}
            ${kCtl('trash', 'delete meme', 'dock')}
          </div>
        </div>
      </div>
      <div class="impec-d2-relate">
        <h3 style="font-family:var(--display);font-size:20px;margin-bottom:14px">similar saves</h3>
        <div class="t-grid">
          ${MEMES.slice(4, 10).map((rm) => `<article class="t-cell">
            <div class="media" style="aspect-ratio:${rm.aspect}">${memeImg(rm)}</div>
            <div class="cap"><span>${esc(rm.cap)}</span><b>${(rm.score / 100).toFixed(2)}</b></div>
          </article>`).join('')}
        </div>
      </div>
      ${labSpec([['section', 'det'], ['structure', 'stacked: media hero full-width, metadata strip below (cap + stats + actions), related 6-cell grid'], ['hierarchy', 'uncropped hero dominates, metadata compresses to single strip, related in standard grid'], ['density', 'medium — hero leads, compact metadata strip, 6 related cells']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     UP-1 · large dropzone
     Dominant dropzone in the center. Queue as a vertical list
     of status cards with state badges (queued / cooking / done
     / failed with retry). Stats counter at top.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-UP-1'] = (m) => {
    css('impec-up-1', `
      .impec-u1-stage { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: clamp(22px, 5vw, 48px) clamp(14px, 4vw, 44px); flex: 1; }
      .impec-u1-drop { width: 100%; max-width: 580px; min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; border: 3px dashed var(--ink); border-radius: var(--r); padding: 32px; background: var(--paper-warm); text-align: center; }
      .impec-u1-drop .t-btn { min-width: 160px; }
      .impec-u1-stats { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; }
      .impec-u1-q { width: 100%; max-width: 580px; display: flex; flex-direction: column; gap: 10px; }
      .impec-u1-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: var(--b); border-radius: var(--r); background: var(--panel); box-shadow: var(--drop-sm); }
      .impec-u1-item .thumb { width: 48px; height: 48px; border: var(--b-thin); border-radius: var(--r-inner); background: var(--paper-warm); overflow: hidden; flex: none; }
      .impec-u1-item .thumb img { width: 100%; height: 100%; object-fit: cover; }
      .impec-u1-item .info { flex: 1; min-width: 0; font-size: 12px; }
      .impec-u1-item .info strong { display: block; font-weight: 800; }
    `);
    m.innerHTML = `<div class="t-shelf">
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="impec-u1-stage">
        <h1 class="t-h1" style="font-size:clamp(24px,4vw,40px)">drop your <em>chaos</em> here</h1>
        <div class="impec-u1-stats">
          <div class="t-stat"><b>${LIB.total.toLocaleString()}</b><span>total in pile</span></div>
          <div class="t-stat magenta"><b>${LIB.queued}</b><span>cooking right now</span></div>
        </div>
        <div class="impec-u1-drop">
          <span style="display:block;width:48px;height:48px">${ICONS.upload}</span>
          <p style="font-weight:700;font-size:16px">drag memes here or click to browse</p>
          <span class="t-note">png, jpg, gif, webp &middot; up to 20mb each &middot; private by default</span>
          <a href="#0" class="t-btn primary t-press">choose files</a>
        </div>
        <div class="impec-u1-q">
          <span class="t-note">upload queue</span>
          <div class="impec-u1-item">
            <div class="thumb">${memeImg(MEMES[0])}</div>
            <div class="info"><strong>IMG_2041.png</strong><span class="t-note">2.4mb</span></div>
            <span class="t-tag">done</span>
          </div>
          <div class="impec-u1-item">
            <div class="thumb">${memeImg(MEMES[3])}</div>
            <div class="info"><strong>finedog.png</strong><span class="t-note">1.8mb &middot; embedding in progress</span></div>
            <span class="t-tag yellow">cooking</span>
          </div>
          <div class="impec-u1-item">
            <div class="thumb" style="display:grid;place-items:center">${ICONS.upload}</div>
            <div class="info"><strong>random_meme_003.jpg</strong><span class="t-note">3.1mb</span></div>
            <span class="t-tag">queued</span>
          </div>
          <div class="impec-u1-item">
            <div class="thumb" style="display:grid;place-items:center;background:rgba(229,35,71,.12)">${ICONS.trash}</div>
            <div class="info"><strong>corrupted-file.gif</strong><span class="t-note">invalid format</span></div>
            <div style="display:flex;gap:6px"><span class="t-tag magenta">failed</span><a href="#0" class="t-btn compact t-press-sm">retry</a></div>
          </div>
        </div>
      </div>
      ${labSpec([['section', 'up'], ['structure', 'centered column: headline + stats, large dashed dropzone, vertical queue list'], ['hierarchy', 'dropzone is the visual center, queue below with state-tagged items sorted by recency'], ['density', 'medium — generous dropzone, 4 queue items with thumb + tag + action']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     UP-2 · compact dropzone, horizontal queue
     Dropzone as a compact button row. Queue as a row of t-stat
     cards showing file + state. Failed items get inline retry.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-UP-2'] = (m) => {
    css('impec-up-2', `
      .impec-u2-body { display: flex; flex-direction: column; gap: 20px; padding: 18px clamp(14px, 4vw, 36px); flex: 1; }
      .impec-u2-drop { display: flex; align-items: center; gap: 14px; padding: 16px 20px; border: var(--b); border-radius: var(--r); background: var(--panel); box-shadow: var(--drop); flex-wrap: wrap; }
      .impec-u2-drop .hint { flex: 1; min-width: 180px; font-weight: 700; font-size: 14px; }
      .impec-u2-q { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
      .impec-u2-qitem { display: flex; flex-direction: column; gap: 6px; border: var(--b); border-radius: var(--r); background: var(--panel); box-shadow: var(--drop-sm); padding: 12px; }
      .impec-u2-qitem .ft { font: 10px var(--mono); opacity: .7; }
      .impec-u2-qitem .nm { font-weight: 700; font-size: 13px; }
      .impec-u2-qitem .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    `);
    m.innerHTML = `<div class="t-shelf">
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="impec-u2-body">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <h1 class="t-h1" style="font-size:clamp(22px,3vw,34px)">upload <em>memes</em></h1>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <div class="t-stat"><b>${LIB.total.toLocaleString()}</b><span>total</span></div>
            <div class="t-stat magenta"><b>${LIB.queued}</b><span>cooking</span></div>
          </div>
        </div>
        <div class="impec-u2-drop">
          <span class="hint">drag files here or pick from disk &middot; png jpg gif webp &middot; private</span>
          <a href="#0" class="t-btn primary t-press">choose files</a>
          <a href="#0" class="t-btn t-press">paste from clipboard</a>
        </div>
        <div>
          <span class="t-note" style="display:block;margin-bottom:10px">recent uploads</span>
          <div class="impec-u2-q">
            <div class="impec-u2-qitem">
              <span class="ft">IMG_2041.png</span>
              <span class="nm">the cat is judging your commit history</span>
              <div class="row"><span class="ft">2.4mb</span><span class="t-tag">done</span></div>
            </div>
            <div class="impec-u2-qitem">
              <span class="ft">finedog.png</span>
              <span class="nm">everything is on fire and that is fine</span>
              <div class="row"><span class="ft">1.8mb</span><span class="t-tag yellow">cooking</span></div>
            </div>
            <div class="impec-u2-qitem">
              <span class="ft">random_meme_003.jpg</span>
              <span class="nm">pending embedding</span>
              <div class="row"><span class="ft">3.1mb</span><span class="t-tag">queued</span></div>
            </div>
            <div class="impec-u2-qitem">
              <span class="ft">corrupted-file.gif</span>
              <span class="nm">invalid format</span>
              <div class="row"><span class="ft">—</span><div style="display:flex;gap:6px"><span class="t-tag magenta">failed</span><a href="#0" class="t-btn compact t-press-sm">retry</a></div></div>
            </div>
          </div>
        </div>
      </div>
      ${labSpec([['section', 'up'], ['structure', 'headline+stats row, compact dropzone bar with two buttons, horizontal queue as auto-fit grid cards'], ['hierarchy', 'dropzone demoted from hero to toolstrip, queue items as cards with file+cap+state'], ['density', 'high — compact dropzone, 4-column auto-fit queue grid, double-button target']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     SET-1 · stacked panels
     Vertical stack of t-card panels. Each panel: heading + body
     content. Account leads, then tokens, embeddings, storage,
     danger zone at bottom with destructive styling. Tone grows
     more serious as you scroll down.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-SET-1'] = (m) => {
    css('impec-set-1', `
      .impec-s1-body { display: flex; flex-direction: column; gap: 18px; padding: 18px clamp(14px, 4vw, 36px) 28px; flex: 1; overflow: auto; max-width: 640px; margin: auto; width: 100%; }
    `);
    m.innerHTML = `<div class="t-shelf">
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="impec-s1-body">
        <h1 class="t-h1" style="font-size:clamp(22px,3vw,36px)">settings</h1>
        <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
          <h3 style="font-family:var(--display);font-size:16px">account</h3>
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div><span class="t-note">signed in as</span><br><strong>you@example.com</strong></div>
            <a href="#0" class="t-btn compact t-press-sm">sign out</a>
          </div>
        </div>
        <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
          <h3 style="font-family:var(--display);font-size:16px">upload tokens</h3>
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div><span class="t-note">active tokens</span><br><strong>3 tokens &middot; sploot-mcp, extension, ci-bot</strong></div>
            <a href="#0" class="t-btn compact t-press-sm">manage</a>
          </div>
          <a href="#0" class="t-btn compact t-press-sm" style="align-self:flex-start">generate new token</a>
        </div>
        <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
          <h3 style="font-family:var(--display);font-size:16px">embeddings</h3>
          <div style="display:flex;gap:14px;flex-wrap:wrap">
            <div class="t-stat"><b>${LIB.embedded.toLocaleString()}</b><span>indexed</span></div>
            <div class="t-stat"><b>${LIB.queued}</b><span>queued</span></div>
          </div>
          <span class="t-note">model ${LIB.model} &middot; dim ${LIB.dim} &middot; latency ~${LIB.latency}ms</span>
          <a href="#0" class="t-btn compact t-press-sm" style="align-self:flex-start">regenerate all embeddings</a>
        </div>
        <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
          <h3 style="font-family:var(--display);font-size:16px">storage</h3>
          <div style="display:flex;gap:14px;flex-wrap:wrap">
            <div class="t-stat"><b>${LIB.total.toLocaleString()}</b><span>assets</span></div>
            <div class="t-stat magenta"><b>847mb</b><span>total size</span></div>
          </div>
          <span class="t-note">stored on vercel blob &middot; private by default</span>
        </div>
        <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px;background:rgba(229,35,71,.06)">
          <h3 style="font-family:var(--display);font-size:16px;color:var(--red)">danger zone</h3>
          <p style="font-size:13px;line-height:1.4">these actions cannot be undone. export your data before proceeding.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <a href="#0" class="t-btn compact destructive t-press-sm">delete all memes</a>
            <a href="#0" class="t-btn compact destructive t-press-sm">delete account</a>
          </div>
        </div>
      </div>
      ${labSpec([['section', 'set'], ['structure', 'single centered column (max 640px), t-card panels stacked vertically, danger at bottom'], ['hierarchy', 'account leads, then tokens/embeddings/storage by concern, danger zone closes with destructive styling'], ['density', 'medium — 5 stacked cards, each with heading + compact content + one action']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     SET-2 · grid panels
     Two-column grid for lighter panels (account, tokens,
     embeddings, storage). Danger zone spans full width below.
     Different visual grouping and hierarchy.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-SET-2'] = (m) => {
    css('impec-set-2', `
      .impec-s2-body { padding: 18px clamp(14px, 4vw, 36px) 28px; flex: 1; overflow: auto; max-width: 820px; margin: auto; width: 100%; display: flex; flex-direction: column; gap: 18px; }
      .impec-s2-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
      @media (max-width: 600px) { .impec-s2-grid { grid-template-columns: 1fr; } }
    `);
    m.innerHTML = `<div class="t-shelf">
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="impec-s2-body">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <h1 class="t-h1" style="font-size:clamp(22px,3vw,36px)">settings</h1>
          ${kStatus()}
        </div>
        <div class="impec-s2-grid">
          <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
            <h3 style="font-family:var(--display);font-size:16px">account</h3>
            <div><span class="t-note">signed in as</span><br><strong>you@example.com</strong></div>
            <div style="flex:1"></div>
            <a href="#0" class="t-btn compact t-press-sm" style="align-self:flex-start">sign out</a>
          </div>
          <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
            <h3 style="font-family:var(--display);font-size:16px">upload tokens</h3>
            <div><span class="t-note">active</span><br><strong>3 tokens</strong></div>
            <span class="t-note">sploot-mcp, extension, ci-bot</span>
            <div style="flex:1"></div>
            <div style="display:flex;gap:8px"><a href="#0" class="t-btn compact t-press-sm">manage</a><a href="#0" class="t-btn compact primary t-press-sm">generate</a></div>
          </div>
          <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
            <h3 style="font-family:var(--display);font-size:16px">embeddings</h3>
            <div style="display:flex;gap:10px">
              <div class="t-stat blue"><b>${LIB.embedded.toLocaleString()}</b><span>indexed</span></div>
              <div class="t-stat"><b>${LIB.queued}</b><span>queued</span></div>
            </div>
            <span class="t-note">${LIB.model} &middot; dim ${LIB.dim}</span>
            <a href="#0" class="t-btn compact t-press-sm" style="align-self:flex-start">regenerate all</a>
          </div>
          <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
            <h3 style="font-family:var(--display);font-size:16px">storage</h3>
            <div style="display:flex;gap:10px">
              <div class="t-stat"><b>${LIB.total.toLocaleString()}</b><span>assets</span></div>
              <div class="t-stat magenta"><b>847mb</b><span>used</span></div>
            </div>
            <span class="t-note">vercel blob &middot; private by default</span>
          </div>
        </div>
        <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
          <h3 style="font-family:var(--display);font-size:16px;color:var(--red)">danger zone</h3>
          <p style="font-size:13px;line-height:1.4">permanent. export your data first.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <a href="#0" class="t-btn destructive t-press-sm">delete all memes</a>
            <a href="#0" class="t-btn destructive t-press-sm">delete account</a>
            <a href="#0" class="t-btn t-press-sm">export library</a>
          </div>
        </div>
      </div>
      ${labSpec([['section', 'set'], ['structure', 'status bar + 2x2 grid of panel cards, full-width danger zone below'], ['hierarchy', 'account+tokens as top identity row, embeddings+storage as bottom system row, danger closes'], ['density', 'medium — 4 cards in 2x2 grid + full-width danger panel']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     LAND-3 · split with scrolling demo wall
     Sticky copy tower flanks a tall, internally-scrolling wall of
     the live public demo corpus (1,000 classics). Wall re-ranks
     on search; tower stays put while the wall does the work.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-LAND-3'] = (m) => {
    css('impec-land-3', `
      .impec-l3-split { display: grid; grid-template-columns: 5fr 7fr; gap: 32px; align-items: start; padding: clamp(18px, 4vw, 44px); flex: 1; min-height: 0; }
      .impec-l3-left { display: flex; flex-direction: column; gap: 22px; position: sticky; top: 18px; }
      .impec-l3-cta { display: flex; gap: 12px; flex-wrap: wrap; }
      .impec-l3-right { display: flex; flex-direction: column; gap: 14px; min-height: 0; }
      .impec-l3-wallhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
      .impec-l3-wall { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; max-height: 620px; overflow-y: auto; padding-right: 4px; }
      @media (max-width: 900px) {
        .impec-l3-split { grid-template-columns: 1fr; }
        .impec-l3-left { position: static; }
        .impec-l3-wall { max-height: 560px; }
      }
      @media (max-width: 700px) {
        .impec-l3-wall { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 390px) {
        .impec-l3-wall { grid-template-columns: 1fr; max-height: 480px; }
      }
    `);
    m.innerHTML = `<div class="t-shelf">
      <div class="impec-l3-split">
        <div class="impec-l3-left">
          <h1 class="t-h1">search a thousand<br><em>classics. live.</em></h1>
          <p style="max-width:44ch;font-size:clamp(14px,1.6vw,18px);line-height:1.4">that wall on the right is real. type a query, hit find, and a public library of 1,000 classic memes re-ranks in front of you. no account, no upload, just the machine doing its thing.</p>
          <div class="impec-l3-cta">
            <a href="#0" class="t-btn primary t-press">start your own pile</a>
            <a href="#0" class="t-btn secondary t-press">shuffle the demo</a>
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap">
            <div class="t-stat"><b>1,000</b><span>demo classics, embedded</span></div>
            <div class="t-stat magenta"><b>${LIB.latency}ms</b><span>re-rank on every search</span></div>
          </div>
        </div>
        <div class="impec-l3-right">
          ${kConsole('cat losing it')}
          <div class="impec-l3-wallhead">
            <span class="t-note">showing 9 of 1,000 &middot; random shuffle at rest</span>
            ${kCtl('shuffle', 'shuffle the wall')}
          </div>
          <div class="impec-l3-wall">
            ${MEMES.slice(0, 9).map((meme) => kCell(meme, '', { noRail: true, score: true })).join('')}
          </div>
        </div>
      </div>
      ${labSpec([['section', 'landing'], ['structure', '5:7 split, left copy tower sticky, right console + internally-scrolling 3-col demo wall (9 cells, own scrollbar)'], ['hierarchy', 'headline sells the live claim, tower stays fixed while wall independently scrolls, stat row backs the number'], ['density', 'high on the right — a real browsable wall, not a proof strip; left stays light']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     LAND-4 · hero collapses into full-bleed wall
     Compact centered hero + console above the fold. Below the
     fold the split disappears entirely: an edge-to-edge browsable
     wall takes over, ranked results surfacing on every search.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-LAND-4'] = (m) => {
    css('impec-land-4', `
      .impec-l4-hero { display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; max-width: 760px; margin: auto; padding: clamp(20px, 5vw, 48px) clamp(14px, 4vw, 44px) clamp(26px, 5vw, 48px); }
      .impec-l4-hero p { max-width: 54ch; margin-inline: auto; font-size: clamp(14px, 1.6vw, 18px); line-height: 1.4; }
      .impec-l4-cta { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
      .impec-l4-wallsec { border-top: var(--b); background: var(--paper-warm); padding: 22px 0 32px; }
      .impec-l4-wallhead { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 0 clamp(14px, 4vw, 44px) 16px; }
      .impec-l4-wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; padding: 0 clamp(14px, 4vw, 44px); }
      @media (max-width: 700px) {
        .impec-l4-wall { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 390px) {
        .impec-l4-wall { grid-template-columns: 1fr; }
      }
    `);
    m.innerHTML = `<div class="t-shelf">
      <div class="impec-l4-hero">
        <h1 class="t-h1">1,000 classics.<br><em>one search box.</em></h1>
        <p>this is a working demo, not a screenshot. type what you remember, hit find, and watch the wall below re-rank against a public library of 1,000 embedded memes.</p>
        ${kConsole('dramatic chipmunk')}
        <div class="impec-l4-cta">
          <a href="#0" class="t-btn primary t-press">start your own pile</a>
          <a href="#0" class="t-btn ink t-press">skip to the wall</a>
        </div>
      </div>
      <div class="impec-l4-wallsec">
        <div class="impec-l4-wallhead">
          <div>
            <strong style="font-family:var(--display);font-size:15px">closest matches for &ldquo;dramatic chipmunk&rdquo;</strong><br>
            <span class="t-note">showing 12 of 1,000 &middot; the wall updates on every search</span>
          </div>
          ${kCtl('shuffle', 'shuffle the wall')}
        </div>
        <div class="impec-l4-wall">
          ${MEMES.map((meme) => kCell(meme, '', { noRail: true, score: true })).join('')}
        </div>
      </div>
      ${labSpec([['section', 'landing'], ['structure', 'compact centered hero (headline + console) above the fold, split fully collapses; edge-to-edge auto-fill wall (12 cells) below'], ['hierarchy', 'hero sells and lets you search immediately, fold break signals mode switch, wall answers at full width with scores'], ['density', 'low above the fold, high below — the wall is the payoff, not a preview']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     SET-3 · clustered 3-up + dashboard strip
     Account, tokens, embeddings each get their own panel across a
     3-column top row with real form anatomy (editable field, a
     per-token revoke list). Storage becomes a full-width stat
     dashboard strip. Danger zone closes with a typed confirmation.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-SET-3'] = (m) => {
    css('impec-set-3', `
      .impec-s3-body { padding: 18px clamp(14px, 4vw, 36px) 28px; flex: 1; overflow: auto; max-width: 960px; margin: auto; width: 100%; display: flex; flex-direction: column; gap: 18px; }
      .impec-s3-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
      .impec-s3-field { display: flex; align-items: center; gap: 9px; border: var(--b); border-radius: var(--r-pill); padding: 8px 14px; background: var(--paper-warm); }
      .impec-s3-field input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; color: inherit; }
      .impec-s3-tokrow { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px dashed var(--ink); }
      .impec-s3-tokrow:last-child { border-bottom: 0; }
      .impec-s3-dash { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
      @media (max-width: 900px) { .impec-s3-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 700px) { .impec-s3-grid { grid-template-columns: 1fr; } }
    `);
    m.innerHTML = `<div class="t-shelf">
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="impec-s3-body">
        <h1 class="t-h1" style="font-size:clamp(22px,3vw,36px)">settings</h1>
        <div class="impec-s3-grid">
          <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
            <h3 style="font-family:var(--display);font-size:16px">account</h3>
            <span class="t-note">signed in as</span>
            <div class="impec-s3-field"><input value="you@example.com" aria-label="account email"></div>
            <a href="#0" class="t-btn compact t-press-sm" style="align-self:flex-start">sign out</a>
          </div>
          <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:6px">
            <h3 style="font-family:var(--display);font-size:16px;margin-bottom:6px">upload tokens</h3>
            <div class="impec-s3-tokrow"><span style="font-size:12px;font-weight:700">sploot-mcp</span><span style="display:flex;gap:6px;align-items:center"><span class="t-tag">read+write</span>${kCtl('trash', 'revoke sploot-mcp token')}</span></div>
            <div class="impec-s3-tokrow"><span style="font-size:12px;font-weight:700">extension</span><span style="display:flex;gap:6px;align-items:center"><span class="t-tag">read+write</span>${kCtl('trash', 'revoke extension token')}</span></div>
            <div class="impec-s3-tokrow"><span style="font-size:12px;font-weight:700">ci-bot</span><span style="display:flex;gap:6px;align-items:center"><span class="t-tag yellow">search-only</span>${kCtl('trash', 'revoke ci-bot token')}</span></div>
            <a href="#0" class="t-btn compact t-press-sm" style="align-self:flex-start;margin-top:6px">generate new token</a>
          </div>
          <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
            <h3 style="font-family:var(--display);font-size:16px">embeddings</h3>
            <div class="impec-s3-dash">
              <div class="t-stat blue"><b>${LIB.embedded.toLocaleString()}</b><span>indexed</span></div>
              <div class="t-stat"><b>${LIB.queued}</b><span>queued</span></div>
            </div>
            <span class="t-note">${LIB.model} &middot; dim ${LIB.dim}</span>
            <a href="#0" class="t-btn compact t-press-sm" style="align-self:flex-start">regenerate all</a>
          </div>
        </div>
        <div class="t-card" style="padding:18px;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap">
          <div>
            <h3 style="font-family:var(--display);font-size:16px;margin-bottom:6px">storage</h3>
            <span class="t-note">vercel blob &middot; private by default</span>
          </div>
          <div class="impec-s3-dash">
            <div class="t-stat"><b>${LIB.total.toLocaleString()}</b><span>assets</span></div>
            <div class="t-stat magenta"><b>847mb</b><span>total size</span></div>
            <div class="t-stat"><b>${LIB.dim}</b><span>vector dims</span></div>
          </div>
        </div>
        <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px;background:rgba(229,35,71,.06)">
          <h3 style="font-family:var(--display);font-size:16px;color:var(--red)">danger zone</h3>
          <p style="font-size:13px;line-height:1.4">these actions cannot be undone. export your data before proceeding.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <div class="impec-s3-field" style="flex:1;min-width:200px;max-width:280px"><input placeholder="type DELETE to confirm" aria-label="confirm deletion"></div>
            <a href="#0" class="t-btn compact destructive t-press-sm">delete all memes</a>
            <a href="#0" class="t-btn compact destructive t-press-sm">delete account</a>
          </div>
        </div>
      </div>
      ${labSpec([['section', 'set'], ['structure', '3-col cluster row (account/tokens/embeddings), full-width storage dashboard strip, full-width danger with typed confirmation'], ['hierarchy', 'account+tokens get real form anatomy (editable field, per-token revoke list), storage promoted to its own stat strip, danger gated by a typed field'], ['density', 'high — 3 panels up top with live-feeling controls, dashboard strip, confirm-gated danger']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

  /* ────────────────────────────────────────────────────────────
     SET-4 · status bar + paired columns
     A single system status bar leads (all the live numbers in one
     place). Below it, two paired columns split "you" (account,
     tokens) from "system" (embeddings, storage with a usage bar).
     Danger zone closes full-width, gated by an explicit checkbox.
     ──────────────────────────────────────────────────────────── */
  SPECS['IMPEC-SET-4'] = (m) => {
    css('impec-set-4', `
      .impec-s4-wrap { max-width: 860px; margin: auto; width: 100%; padding: 18px clamp(14px, 4vw, 36px) 28px; flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 18px; }
      .impec-s4-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
      .impec-s4-col { display: flex; flex-direction: column; gap: 14px; }
      .impec-s4-colhead { font: 10px var(--mono); text-transform: uppercase; opacity: .65; padding-left: 2px; }
      .impec-s4-bar { border: var(--b-thin); border-radius: var(--r-pill); background: var(--paper-warm); height: 12px; overflow: hidden; }
      .impec-s4-bar i { display: block; height: 100%; background: var(--blue); border-radius: var(--r-pill); }
      .impec-s4-confirm { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; }
      .impec-s4-confirm input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--red); }
      @media (max-width: 700px) { .impec-s4-cols { grid-template-columns: 1fr; } }
    `);
    m.innerHTML = `<div class="t-shelf">
      ${kMast(['the pile', 'bangers', 'settings'])}
      ${kStatus()}
      <div class="impec-s4-wrap">
        <h1 class="t-h1" style="font-size:clamp(22px,3vw,36px)">settings</h1>
        <div class="impec-s4-cols">
          <div class="impec-s4-col">
            <span class="impec-s4-colhead">you</span>
            <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:10px">
              <h3 style="font-family:var(--display);font-size:16px">account</h3>
              <div><span class="t-note">signed in as</span><br><strong>you@example.com</strong></div>
              <a href="#0" class="t-btn compact t-press-sm" style="align-self:flex-start">sign out</a>
            </div>
            <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:10px">
              <h3 style="font-family:var(--display);font-size:16px">upload tokens</h3>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <span class="t-tag">sploot-mcp</span>
                <span class="t-tag">extension</span>
                <span class="t-tag yellow">ci-bot</span>
              </div>
              <a href="#0" class="t-btn compact t-press-sm" style="align-self:flex-start">manage all tokens</a>
            </div>
          </div>
          <div class="impec-s4-col">
            <span class="impec-s4-colhead">system</span>
            <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:10px">
              <h3 style="font-family:var(--display);font-size:16px">embeddings</h3>
              <div style="display:flex;gap:14px;flex-wrap:wrap">
                <div class="t-stat blue"><b>${LIB.embedded.toLocaleString()}</b><span>indexed</span></div>
                <div class="t-stat"><b>${LIB.queued}</b><span>queued</span></div>
              </div>
              <a href="#0" class="t-btn compact t-press-sm" style="align-self:flex-start">regenerate all</a>
            </div>
            <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:10px">
              <h3 style="font-family:var(--display);font-size:16px">storage</h3>
              <div class="impec-s4-bar"><i style="width:34%"></i></div>
              <span class="t-note">847mb of 2.5gb &middot; ${LIB.total.toLocaleString()} assets</span>
            </div>
          </div>
        </div>
        <div class="t-card" style="padding:18px;display:flex;flex-direction:column;gap:12px;background:rgba(229,35,71,.06)">
          <h3 style="font-family:var(--display);font-size:16px;color:var(--red)">danger zone</h3>
          <p style="font-size:13px;line-height:1.4">permanent. export your data first.</p>
          <label class="impec-s4-confirm"><input type="checkbox" aria-label="confirm you understand this is permanent"> I understand this cannot be undone</label>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <a href="#0" class="t-btn destructive t-press-sm" style="opacity:.5">delete all memes</a>
            <a href="#0" class="t-btn destructive t-press-sm" style="opacity:.5">delete account</a>
            <a href="#0" class="t-btn t-press-sm">export library</a>
          </div>
        </div>
      </div>
      ${labSpec([['section', 'set'], ['structure', 'full-width status bar leads, two paired columns split you (account/tokens) from system (embeddings/storage+bar), full-width danger closes'], ['hierarchy', 'live numbers surface once at the top instead of per-panel, storage gets a usage bar instead of stat blocks, danger requires an explicit checkbox before its buttons read as active'], ['density', 'medium — status bar + 4 stacked panels in 2 columns + gated danger zone']])}
    </div>`;
    themeToggle(m.querySelector('.t-shelf'));
  };

})();