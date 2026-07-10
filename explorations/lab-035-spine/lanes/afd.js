/* lab 035 — lane afd. Philosophy: anthropic frontend-design applied to
   layout, structure, hierarchy, and content ONLY; the toybox visual system
   is law (frame.css + parts.js). All CSS here is structural: grids, spans,
   sticky, columns, gaps, wraps, height clamps. */
(function () {
  'use strict';

  /* ---------- shared structural utilities ---------- */
  css('afd-shared', `
    .afd-grow{flex:1 0 auto}
    .afd-sec{padding-block:28px}
    .afd-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .afd-spread{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .afd-stack{display:grid;gap:14px}
    .afd-pad{padding:22px}
    .afd-cta{display:grid;place-items:center;gap:12px;text-align:center;padding-block:44px}
    .afd-row a.t-btn,.afd-cta a.t-btn{text-decoration:none}
    .afd-grow .t-grid{align-items:start}
    .afd-search{flex:1 1 220px;min-width:0}
    .afd-search input{border:0;outline:0;background:transparent;flex:1;min-width:0;width:100%}
    .afd-relcard{display:grid;gap:8px;justify-items:start;min-width:0}
    .afd-thumb{width:76px;flex:none}
    .afd-uprow{display:flex;align-items:center;gap:14px;padding:12px 0;flex-wrap:wrap}
    .afd-upmeta{display:grid;gap:2px;min-width:0;flex:1}
    .afd-upmeta b{overflow-wrap:anywhere}
  `);

  function shelf(mount, html) {
    const root = document.createElement('div');
    root.className = 't-shelf';
    root.innerHTML = html;
    mount.appendChild(root);
    themeToggle(root);
    return root;
  }
  const helpCtl = () => `<button type="button" class="t-ctl" aria-label="help" title="help"><b>?</b></button>`;
  const searchPill = (v) => `<label class="t-pile afd-search"><span>find:</span><input value="${esc(v)}" aria-label="search the pile"></label>`;
  const actionRail = () => `<div class="afd-row" aria-label="meme actions">${kCtl('heart', 'remove banger', 'hearted')}${kCtl('share', 'share meme')}${kCtl('trash', 'delete meme')}</div>`;
  const relCard = (m) => `<div class="afd-relcard">${kCell(m, '', { noRail: true })}<span class="t-tag yellow">${m.score}% similar</span></div>`;
  const thumbCell = (m) => `<div class="t-cell afd-thumb"><div class="media" style="aspect-ratio:1/1">${memeImg(m)}</div></div>`;
  const UP_STATES = {
    done: `<span class="t-tag">in the pile</span>`,
    cooking: `<span class="t-tag yellow">cooking</span>`,
    queued: `<span class="t-note">queued</span>`,
    failed: `<span class="t-tag magenta">failed</span><button class="t-btn compact destructive t-press-sm">retry</button>`,
  };
  const upRow = (m, name, size, detail, state) => `
    <li class="afd-uprow">
      ${thumbCell(m)}
      <div class="afd-upmeta"><b>${esc(name)}</b><span class="t-note">${size} · ${detail}</span></div>
      <div class="afd-row">${UP_STATES[state]}</div>
    </li>`;
  const QUEUE = [
    [MEMES[1], 'weball_final.png', '812 kb', 'embedded in 1.4s', 'done'],
    [MEMES[2], 'hundo.png', '1.1 mb', 'embedding now', 'cooking'],
    [MEMES[4], 'IMG_0388.jpg', '640 kb', 'position 2 in queue', 'queued'],
    [MEMES[5], 'lore.png', '918 kb', 'position 3 in queue', 'queued'],
    [MEMES[7], 'brain2.jpg', '2.4 mb', 'embedding timed out', 'failed'],
  ];
  const queueList = () => `<ul style="list-style:none">${QUEUE.map((r) => upRow(...r)).join('')}</ul>`;

  /* ================================================================
     LAND-1 — the demo is the hero. Console first, headline captions it.
     ================================================================ */
  SPECS['AFD-LAND-1'] = function (mount) {
    css('afd-land1', `
      .afd-land1-hero{display:grid;gap:14px;justify-items:center;text-align:center;padding-block:20px}
      .afd-land1-console{width:min(860px,100%)}
      .afd-land1-hits{width:100%}
      .afd-land1-hits .media{max-height:168px}
      .afd-land1-trio{display:grid;gap:18px;grid-template-columns:repeat(3,minmax(0,1fr))}
      @media(max-width:700px){.afd-land1-trio{grid-template-columns:minmax(0,1fr)}}
    `);
    const DEMOS = [
      { q: 'cat losing it', picks: [[0, 'match'], [5, 'near'], [8, ''], [11, 'dim']] },
      { q: 'everything is fine', picks: [[1, 'match'], [3, 'near'], [9, ''], [10, 'dim']] },
      { q: 'waiting forever', picks: [[4, 'match'], [6, 'near'], [7, ''], [11, 'dim']] },
    ];
    const hits = (d) => d.picks.map(([i, st]) => kCell(MEMES[i], st, { score: true, noRail: true })).join('');
    const root = shelf(mount, `
      ${kMast(['how it works', 'sign in'])}
      <div class="afd-grow">
        <section class="t-wrap afd-land1-hero">
          <span class="t-eyebrow">sploot · semantic search for your meme collection · try it</span>
          <div class="afd-land1-console">${kConsole(DEMOS[0].q)}</div>
          <div class="t-grid afd-land1-hits" data-hits>${hits(DEMOS[0])}</div>
          <h1 class="t-h1">it's a search box.<br><em>for memes.</em></h1>
          <p style="max-width:560px">every image you save gets embedded automatically. type what you remember, get the picture.</p>
          <div class="afd-row" style="justify-content:center">
            <a class="t-btn primary t-press" href="#0">start your pile</a>
            <a class="t-btn t-press" href="#0">sign in</a>
          </div>
        </section>
        <section class="t-wrap afd-sec afd-stack">
          <h2>the pile sorts itself</h2>
          <p style="max-width:560px">no folders to make, no tags to type. ask for a pile and your saves cluster on demand.</p>
          <div class="afd-row">${kPiles(0)}</div>
        </section>
        <section class="t-wrap afd-sec">
          <div class="afd-land1-trio">
            <div class="t-card afd-pad afd-stack"><h2>bangers</h2><p>heart the hall of fame. filter to bangers when only the best will do.</p></div>
            <div class="t-card afd-pad afd-stack"><h2>upload chaos</h2><p>drag images in, or save from anywhere with the browser extension.</p></div>
            <div class="t-card afd-pad afd-stack"><h2>private by default</h2><p>your pile is yours. no feed, no followers, no explore page.</p></div>
          </div>
        </section>
        <section class="t-wrap afd-cta">
          <h2>your camera roll is a landfill. sploot is the map.</h2>
          <a class="t-btn primary t-press" href="#0">start your pile</a>
          <span class="t-note">free to start · private by default</span>
        </section>
        ${kStatus()}
      </div>
      ${labSpec([
        ['section', 'LAND · signed-out landing'],
        ['structure', 'demo-first center stack: console + live results lead, headline captions the demo'],
        ['hierarchy', 'the working search console leads; h1 arrives second as the punchline'],
        ['density', 'one console + four proof cells above the fold at 1440x900, piles peeking'],
      ])}
    `);
    let i = 0;
    const row = root.querySelector('[data-hits]');
    const input = root.querySelector('.t-console input');
    const btn = root.querySelector('.t-console .t-btn');
    const go = () => { i = (i + 1) % DEMOS.length; input.value = DEMOS[i].q; row.innerHTML = hits(DEMOS[i]); };
    btn.addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  };

  /* ================================================================
     LAND-2 — claim-first editorial split: story left, proof right.
     ================================================================ */
  SPECS['AFD-LAND-2'] = function (mount) {
    css('afd-land2', `
      .afd-land2-hero{display:grid;gap:34px;grid-template-columns:minmax(0,5fr) minmax(0,6fr);align-items:center}
      .afd-land2-hits{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}
      .afd-land2-hits .media{max-height:150px}
      .afd-land2-steps{display:grid;gap:18px;grid-template-columns:repeat(3,minmax(0,1fr))}
      .afd-land2-duo{display:grid;gap:18px;grid-template-columns:repeat(2,minmax(0,1fr))}
      @media(max-width:900px){.afd-land2-hero{grid-template-columns:minmax(0,1fr)}}
      @media(max-width:700px){.afd-land2-steps,.afd-land2-duo{grid-template-columns:minmax(0,1fr)}}
    `);
    const picks = [[0, 'match'], [5, 'near'], [8, ''], [9, 'dim']];
    shelf(mount, `
      ${kMast(['how it works', 'sign in'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-land2-hero">
          <div class="afd-stack">
            <span class="t-eyebrow">a private, searchable meme archive</span>
            <h1 class="t-h1">no folders. <em>just vibes.</em></h1>
            <p style="max-width:460px">sploot embeds every image you save, so you can find it later by typing what you remember. private by default, fast on purpose.</p>
            <div class="afd-row">
              <a class="t-btn primary t-press" href="#0">start your pile</a>
              <a class="t-btn t-press" href="#0">see how search works</a>
            </div>
            <span class="t-note">free to start · saves from anywhere with the browser extension</span>
          </div>
          <div class="afd-stack">
            ${kConsole('cat losing it')}
            <div class="afd-land2-hits">${picks.map(([i, st]) => kCell(MEMES[i], st, { score: true, noRail: true })).join('')}</div>
          </div>
        </section>
        <section class="t-wrap afd-sec afd-row">
          <div class="t-stat blue"><b>${LIB.total.toLocaleString()}</b><span>memes in this demo pile</span></div>
          <div class="t-stat"><b>${LIB.embedded.toLocaleString()}</b><span>embedded and searchable</span></div>
          <div class="t-stat magenta"><b>${LIB.latency}ms</b><span>to find the one you meant</span></div>
        </section>
        <section class="t-wrap afd-sec afd-stack">
          <h2>how it works</h2>
          <div class="afd-land2-steps">
            <div class="t-card afd-pad afd-stack"><span class="t-eyebrow">01</span><h2>save it</h2><p>drag it in, or one-click it from any page with the extension.</p></div>
            <div class="t-card afd-pad afd-stack"><span class="t-eyebrow">02</span><h2>it cooks</h2><p>the machine embeds every image automatically. no tags, no filenames.</p></div>
            <div class="t-card afd-pad afd-stack"><span class="t-eyebrow">03</span><h2>type words</h2><p>search by what you remember, not what the file was called.</p></div>
          </div>
        </section>
        <section class="t-wrap afd-sec afd-land2-duo">
          <div class="t-card afd-pad afd-stack"><h2>bangers</h2><p>heart your hall of fame and filter straight to it.</p></div>
          <div class="t-card afd-pad afd-stack"><h2>private by default</h2><p>no feed, no followers. the pile answers to you only.</p></div>
        </section>
        <section class="t-wrap afd-cta">
          <h2>the pile is waiting</h2>
          <a class="t-btn primary t-press" href="#0">start your pile</a>
        </section>
      </div>
      ${labSpec([
        ['section', 'LAND · signed-out landing'],
        ['structure', 'editorial split hero: claim + ctas left, console + proof cells right; stats band peeks'],
        ['hierarchy', 'the headline claim leads; the demo sits beside it as evidence'],
        ['density', 'hero holds claim, two ctas, console, four cells at 1440x900'],
      ])}
    `);
  };

  /* ================================================================
     NAV-1 — two-row sticky command bar: search pill lives in the mast.
     ================================================================ */
  SPECS['AFD-NAV-1'] = function (mount) {
    css('afd-nav1', `
      .afd-nav1-sticky{position:sticky;top:0;z-index:20}
      .afd-nav1-sticky .t-mast{flex-wrap:wrap}
    `);
    shelf(mount, `
      <div class="afd-nav1-sticky">
        <header class="t-mast">
          <span class="t-logo">spl<i>oo</i>t</span>
          ${searchPill('cat losing it')}
          <div class="afd-row">
            <button class="t-btn primary compact t-press-sm">upload</button>
            ${helpCtl()}
            ${kCtl('sun', 'switch theme')}
          </div>
        </header>
        <div class="t-mast">
          <div class="afd-row">
            <div class="t-tabs"><button class="t-tab on">all</button><button class="t-tab">bangers</button></div>
            <button class="t-btn compact t-press-sm">sort: recent</button>
            ${kCtl('shuffle', 'shuffle the pile')}
          </div>
          <span class="t-note">${LIB.total.toLocaleString()} in the pile · ${LIB.queued} cooking</span>
        </div>
      </div>
      <div class="afd-grow">
        <section class="t-wrap afd-sec">
          <div class="t-grid">${MEMES.slice(0, 8).map((m) => kCell(m)).join('')}</div>
        </section>
      </div>
      ${labSpec([
        ['section', 'NAV · app header chrome'],
        ['structure', 'two-row sticky command bar; search pill inline in the mast, subnav row below'],
        ['hierarchy', 'search field widest in row one; filter + sort + shuffle grouped left in row two, count right'],
        ['density', 'nine controls in two mast rows, feed starts immediately'],
      ])}
    `);
  };

  /* ================================================================
     NAV-2 — the console promoted to header centerpiece.
     ================================================================ */
  SPECS['AFD-NAV-2'] = function (mount) {
    css('afd-nav2', `
      .afd-nav2-band{padding-block:18px;display:grid;gap:14px}
    `);
    shelf(mount, `
      <header class="t-mast" style="flex-wrap:wrap">
        <span class="t-logo">spl<i>oo</i>t</span>
        <div class="afd-row">
          <button class="t-btn primary compact t-press-sm">upload</button>
          ${kCtl('shuffle', 'shuffle the pile')}
          ${helpCtl()}
          ${kCtl('sun', 'switch theme')}
        </div>
      </header>
      <div class="t-wrap afd-nav2-band">
        ${kConsole('cat losing it', { noMachine: true })}
        <div class="afd-spread">
          <div class="afd-row">
            <div class="t-tabs"><button class="t-tab on">all</button><button class="t-tab">bangers</button></div>
            <button class="t-btn compact t-press-sm">sort: recent</button>
          </div>
        </div>
      </div>
      ${kStatus()}
      <div class="afd-grow">
        <section class="t-wrap afd-sec">
          <div class="t-grid">${MEMES.slice(0, 8).map((m) => kCell(m)).join('')}</div>
        </section>
      </div>
      ${labSpec([
        ['section', 'NAV · app header chrome'],
        ['structure', 'search console promoted to full-width header centerpiece; utility mast above, status strip below'],
        ['hierarchy', 'the console leads the chrome; upload and shuffle demoted to the utility rail'],
        ['density', 'three chrome bands (mast, console, status) before the feed'],
      ])}
    `);
  };

  /* ================================================================
     FEED-1 — masonry columns, pile chips above, full metadata.
     ================================================================ */
  SPECS['AFD-FEED-1'] = function (mount) {
    css('afd-feed1', `
      .afd-feed1-cols{columns:240px 4;column-gap:18px}
      .afd-feed1-cols .t-cell{break-inside:avoid;margin-bottom:18px}
    `);
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-stack">
          <div class="afd-spread">
            <h2>the pile</h2>
            <span class="t-note">${LIB.total.toLocaleString()} saved · newest first</span>
          </div>
          <div class="afd-row">${kPiles(0)}</div>
          <div class="afd-feed1-cols">${MEMES.map((m) => kCell(m)).join('')}</div>
        </section>
      </div>
      ${labSpec([
        ['section', 'FEED · the gallery'],
        ['structure', 'masonry columns keep every aspect ratio honest; pile chips wrap above the wall'],
        ['hierarchy', 'the images lead; chips are the only chrome between mast and memes'],
        ['density', 'twelve cells, full captions and action rails, vertical scan rhythm'],
      ])}
    `);
  };

  /* ================================================================
     FEED-2 — mixed-span grid, bangers span wider, sticky piles rail.
     ================================================================ */
  SPECS['AFD-FEED-2'] = function (mount) {
    css('afd-feed2', `
      .afd-feed2-wrap{display:grid;gap:22px;grid-template-columns:minmax(0,1fr) 240px;align-items:start}
      .afd-feed2-grid{display:grid;gap:18px;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-flow:dense}
      .afd-feed2-grid .afd-big{grid-column:span 2}
      .afd-feed2-grid .media{height:240px;aspect-ratio:auto!important}
      .afd-feed2-rail{position:sticky;top:18px;display:grid;gap:10px}
      @media(max-width:1000px){.afd-feed2-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:900px){.afd-feed2-wrap{grid-template-columns:minmax(0,1fr)}.afd-feed2-rail{position:static;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}}
    `);
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-feed2-wrap">
          <div class="afd-feed2-grid">${MEMES.map((m) => kCell(m, m.banger ? 'afd-big' : '')).join('')}</div>
          <aside class="afd-feed2-rail">
            <div class="t-stat"><b>${LIB.total.toLocaleString()}</b><span>in the pile</span></div>
            ${kPiles(0)}
            <button class="t-btn secondary t-press">shuffle the pile</button>
          </aside>
        </section>
      </div>
      ${labSpec([
        ['section', 'FEED · the gallery'],
        ['structure', 'six-column mixed-span grid, dense flow; piles live in a sticky right rail'],
        ['hierarchy', 'bangers span wider so the hall of fame interrupts the scan rhythm'],
        ['density', 'twelve cells with captions and rails, count + piles + shuffle parked in the rail'],
      ])}
    `);
  };

  /* ================================================================
     DET-1 — editorial split: media leads left, sticky meta sidebar.
     ================================================================ */
  SPECS['AFD-DET-1'] = function (mount) {
    css('afd-det1', `
      .afd-det1{display:grid;gap:26px;grid-template-columns:minmax(0,3fr) minmax(0,2fr);align-items:start}
      .afd-det1 aside{position:sticky;top:20px;display:grid;gap:16px}
      .afd-meta{display:grid;grid-template-columns:auto 1fr;gap:8px 18px;align-items:baseline}
      @media(max-width:900px){.afd-det1{grid-template-columns:minmax(0,1fr)}.afd-det1 aside{position:static}}
    `);
    const m = MEMES[0];
    const rel = [MEMES[4], MEMES[2], MEMES[5], MEMES[8]];
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-det1">
          ${kCell(m, '', { noCap: true, noRail: true })}
          <aside>
            <span class="t-eyebrow">meme detail</span>
            <h2>${esc(m.cap)}</h2>
            <div class="afd-row"><span class="t-tag magenta">banger</span></div>
            ${actionRail()}
            <div class="afd-meta">
              <span class="t-eyebrow">file</span><b>${m.file}</b>
              <span class="t-eyebrow">dimensions</span><b>1240 × 1552</b>
              <span class="t-eyebrow">size</span><b>812 kb</b>
              <span class="t-eyebrow">vector</span><b>${m.vec} · ${LIB.dim}d</b>
              <span class="t-eyebrow">saved</span><b>2026-06-12</b>
            </div>
            <span class="t-note">embedded with ${LIB.model} · searchable since day one</span>
          </aside>
        </section>
        <section class="t-wrap afd-sec afd-stack">
          <h2>similar saves</h2>
          <div class="t-grid">${rel.map(relCard).join('')}</div>
        </section>
      </div>
      ${labSpec([
        ['section', 'DET · meme detail'],
        ['structure', 'editorial split: uncropped media owns the wide column, metadata rides a sticky sidebar'],
        ['hierarchy', 'the image leads; caption, actions, then the mono spec sheet'],
        ['density', 'five metadata rows plus four related cells with similarity tags'],
      ])}
    `);
  };

  /* ================================================================
     DET-2 — cinema stack: media, dock actions, status band, related.
     ================================================================ */
  SPECS['AFD-DET-2'] = function (mount) {
    css('afd-det2', `
      .afd-det2-stage{display:grid;gap:18px;justify-items:center;text-align:center}
      .afd-det2-media{width:min(460px,100%)}
    `);
    const m = MEMES[0];
    const rel = [MEMES[2], MEMES[4], MEMES[8], MEMES[10]];
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-det2-stage">
          <div class="afd-det2-media">${kCell(m, '', { noCap: true, noRail: true })}</div>
          <div class="afd-row" style="justify-content:center" aria-label="meme actions">
            ${kCtl('heart', 'remove banger', 'dock hearted')}${kCtl('share', 'share meme', 'dock')}${kCtl('trash', 'delete meme', 'dock')}
          </div>
          <h1 class="t-h1">${esc(m.cap)}</h1>
        </section>
        <div class="t-status">
          <span>${m.file}</span><span>1240 × 1552</span><span>812 kb</span><span>vec ${m.vec} · ${LIB.dim}d</span><span>saved 2026-06-12</span><span class="live">embedded</span>
        </div>
        <section class="t-wrap afd-sec afd-stack">
          <h2>similar saves</h2>
          <div class="t-grid">${rel.map(relCard).join('')}</div>
        </section>
      </div>
      ${labSpec([
        ['section', 'DET · meme detail'],
        ['structure', 'cinema stack: centered media, floating dock actions, machine status band as the spec sheet'],
        ['hierarchy', 'media leads alone; the caption gets the display-type moment after it'],
        ['density', 'one image on stage, six mono status cells, four related cells below'],
      ])}
    `);
  };

  /* ================================================================
     UP-1 — the mouth: dropzone dominates, queue below.
     ================================================================ */
  SPECS['AFD-UP-1'] = function (mount) {
    css('afd-up1', `
      .afd-up1-wrap{width:min(880px,100%);margin-inline:auto}
      .afd-drop{display:grid;place-items:center;gap:14px;padding:56px 24px;text-align:center}
    `);
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-up1-wrap afd-stack">
          <span class="t-eyebrow">upload</span>
          <h1 class="t-h1">feed <em>the pile</em></h1>
          <div class="t-card afd-drop t-press">
            <h2>drag chaos here</h2>
            <span class="t-note">png, jpg, gif, webp · embedding starts on arrival</span>
            <button class="t-btn primary t-press">pick files</button>
          </div>
          <div class="afd-spread">
            <h2>the queue</h2>
            <span class="t-note">1 in the pile · 1 cooking · 2 queued · 1 failed</span>
          </div>
          ${queueList()}
        </section>
      </div>
      ${kStatus()}
      ${labSpec([
        ['section', 'UP · upload intake'],
        ['structure', 'dropzone-dominant single column: one giant mouth, queue as the receipt below'],
        ['hierarchy', 'the dropzone leads; queue states carry the machine truth underneath'],
        ['density', 'five queue rows covering done, cooking, queued, and failed with retry'],
      ])}
    `);
  };

  /* ================================================================
     UP-2 — the kitchen: queue-led workbench, dropzone demoted to a rail.
     ================================================================ */
  SPECS['AFD-UP-2'] = function (mount) {
    css('afd-up2', `
      .afd-up2-wrap{display:grid;gap:24px;grid-template-columns:minmax(0,1fr) 300px;align-items:start}
      .afd-up2-rail{position:sticky;top:18px;display:grid;gap:14px}
      .afd-drop-sm{display:grid;place-items:center;gap:10px;padding:30px 18px;text-align:center}
      @media(max-width:900px){.afd-up2-wrap{grid-template-columns:minmax(0,1fr)}.afd-up2-rail{position:static}}
    `);
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      ${kStatus()}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-up2-wrap">
          <div class="afd-stack">
            <div class="afd-spread">
              <h2>cooking now</h2>
              <span class="t-note">newest first · failed jobs float to the top tomorrow</span>
            </div>
            ${queueList()}
          </div>
          <aside class="afd-up2-rail">
            <div class="t-card afd-drop-sm t-press">
              <b>drop images here</b>
              <button class="t-btn primary compact t-press-sm">pick files</button>
              <span class="t-note">png, jpg, gif, webp</span>
            </div>
            <div class="t-stat magenta"><b>${LIB.queued}</b><span>in the queue right now</span></div>
            <span class="t-note">drops land here, embeddings cook automatically, the pile updates itself.</span>
          </aside>
        </section>
      </div>
      ${labSpec([
        ['section', 'UP · upload intake'],
        ['structure', 'queue-led workbench split: jobs own the wide column, dropzone demoted to a sticky rail'],
        ['hierarchy', 'machine status leads at the top edge; the queue is the main event'],
        ['density', 'five state rows plus a compact drop card and live queue stat in the rail'],
      ])}
    `);
  };

  /* ---------- settings shared cards ---------- */
  const setAccount = () => `
    <section class="t-card afd-pad afd-stack">
      <h2>account</h2>
      <div class="afd-spread">
        <div class="afd-stack" style="gap:2px"><b>phaedrus</b><span class="t-note">signed in with google</span></div>
        <button class="t-btn compact t-press-sm">sign out</button>
      </div>
    </section>`;
  const setTokens = () => `
    <section class="t-card afd-pad afd-stack">
      <h2>upload tokens</h2>
      <p>tokens let the extension and your agents save straight to the pile.</p>
      <div class="afd-spread">
        <code>spt_live_9f3k····72aa</code>
        <div class="afd-row">
          <button class="t-btn compact t-press-sm">roll</button>
          <button class="t-btn compact destructive t-press-sm">revoke</button>
        </div>
      </div>
      <div><button class="t-btn secondary compact t-press-sm">new token</button></div>
    </section>`;
  const setEmbed = () => `
    <section class="t-card afd-pad afd-stack">
      <h2>embeddings</h2>
      <p>${LIB.embedded.toLocaleString()} of ${LIB.total.toLocaleString()} images embedded. ${LIB.queued} cooking.</p>
      <span class="t-note">model ${LIB.model} · ${LIB.dim} dimensions</span>
      <div><button class="t-btn compact t-press-sm">recook the stragglers</button></div>
    </section>`;
  const setStorage = () => `
    <section class="t-card afd-pad afd-stack">
      <h2>storage</h2>
      <p>${LIB.total.toLocaleString()} images · 3.2 gb saved</p>
      <span class="t-note">originals stay untouched. embeddings live beside them.</span>
    </section>`;
  const setDanger = () => `
    <section class="t-card afd-pad afd-stack">
      <h2>danger zone</h2>
      <p>deletes every meme and every embedding. there is no undo.</p>
      <div><button class="t-btn destructive t-press">delete everything</button></div>
    </section>`;

  /* ================================================================
     SET-1 — reading order: you first, the machine next, danger last.
     ================================================================ */
  SPECS['AFD-SET-1'] = function (mount) {
    css('afd-set1', `
      .afd-set1-wrap{width:min(720px,100%);margin-inline:auto}
    `);
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-set1-wrap afd-stack" style="gap:18px">
          <span class="t-eyebrow">settings</span>
          <h1 class="t-h1">the knobs</h1>
          ${setAccount()}
          ${setTokens()}
          ${setEmbed()}
          ${setStorage()}
          ${setDanger()}
        </section>
      </div>
      ${labSpec([
        ['section', 'SET · settings'],
        ['structure', 'single 720px reading column, one card per concern, danger isolated at the end'],
        ['hierarchy', 'account leads, machine cards follow, the red button is the last thing on the page'],
        ['density', 'five cards, one action cluster each, no tabs or subnav'],
      ])}
    `);
  };

  /* ================================================================
     SET-2 — machine-first dashboard: stats lead, grouped columns.
     ================================================================ */
  SPECS['AFD-SET-2'] = function (mount) {
    css('afd-set2', `
      .afd-set2-cols{display:grid;gap:22px;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}
      .afd-set2-col{display:grid;gap:14px}
      @media(max-width:900px){.afd-set2-cols{grid-template-columns:minmax(0,1fr)}}
    `);
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-stack" style="gap:20px">
          <div class="afd-spread">
            <h2>settings</h2>
            <span class="t-note">the machine first, then you</span>
          </div>
          <div class="afd-row">
            <div class="t-stat blue"><b>${LIB.total.toLocaleString()}</b><span>in the pile</span></div>
            <div class="t-stat"><b>${LIB.embedded.toLocaleString()}</b><span>embedded</span></div>
            <div class="t-stat magenta"><b>${LIB.queued}</b><span>cooking</span></div>
          </div>
          <div class="afd-set2-cols">
            <div class="afd-set2-col">
              <span class="t-eyebrow">the machine</span>
              ${setEmbed()}
              ${setStorage()}
            </div>
            <div class="afd-set2-col">
              <span class="t-eyebrow">you</span>
              ${setAccount()}
              ${setTokens()}
            </div>
          </div>
          ${setDanger()}
        </section>
      </div>
      ${labSpec([
        ['section', 'SET · settings'],
        ['structure', 'dashboard: stat row leads, cards grouped into machine and you columns, danger full-width below'],
        ['hierarchy', 'embeddings status leads the whole page; account demoted to the second column'],
        ['density', 'three stats, four grouped cards, one isolated danger card'],
      ])}
    `);
  };

  /* ================================================================
     ROUND 2 — mutations of the round-1 survivors. Same fixed toybox
     system; only content, layout, structure, hierarchy, density vary.
     ================================================================ */

  /* ================================================================
     NAV-3 — mutation of NAV-1: the two-row bar tightened into one
     scan line. Dividers replace whitespace between control groups.
     ================================================================ */
  SPECS['AFD-NAV-3'] = function (mount) {
    css('afd-nav3', `
      .afd-nav3-sticky{position:sticky;top:0;z-index:20}
      .afd-nav3-sticky .t-mast{flex-wrap:wrap}
      .afd-nav3-scan{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:7px clamp(14px,4vw,44px);border-bottom:var(--b);background:var(--panel)}
      .afd-nav3-div{width:2px;align-self:stretch;background:var(--ink);opacity:.15}
      @media(max-width:700px){.afd-nav3-div{display:none}}
    `);
    shelf(mount, `
      <div class="afd-nav3-sticky">
        <header class="t-mast">
          <span class="t-logo">spl<i>oo</i>t</span>
          ${searchPill('cat losing it')}
          <div class="afd-row">
            <button class="t-btn primary compact t-press-sm">upload</button>
            ${kCtl('sun', 'switch theme')}
          </div>
        </header>
        <div class="afd-nav3-scan">
          <div class="t-tabs"><button class="t-tab on">all</button><button class="t-tab">bangers</button></div>
          <div class="afd-nav3-div"></div>
          <button class="t-btn compact t-press-sm">sort: recent</button>
          ${kCtl('shuffle', 'shuffle the pile')}
          <div class="afd-nav3-div"></div>
          <span class="t-note">${LIB.total.toLocaleString()} in the pile · ${LIB.queued} cooking</span>
        </div>
      </div>
      <div class="afd-grow">
        <section class="t-wrap afd-sec">
          <div class="t-grid">${MEMES.slice(0, 8).map((m) => kCell(m)).join('')}</div>
        </section>
      </div>
      ${labSpec([
        ['section', 'NAV · app header chrome'],
        ['structure', 'the winning two-row sticky bar stays; row two loses its spread layout for a single tight scan-line with hairline dividers between groups'],
        ['hierarchy', 'search still owns row one; row two reads left-to-right as one line — filters, sort, shuffle, count — instead of split-justified groups'],
        ['density', 'help control dropped, row two height trimmed, dividers substitute for the whitespace that used to separate groups'],
      ])}
    `);
  };

  /* ================================================================
     NAV-4 — mutation of NAV-1: filters + status fuse into one mono
     strip instead of two justified clusters.
     ================================================================ */
  SPECS['AFD-NAV-4'] = function (mount) {
    css('afd-nav4', `
      .afd-nav4-sticky{position:sticky;top:0;z-index:20}
      .afd-nav4-sticky .t-mast{flex-wrap:wrap}
      .afd-nav4-strip{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:8px clamp(14px,4vw,44px);background:var(--paper-warm);border-bottom:var(--b);font:10px var(--mono)}
      .afd-nav4-strip .t-tabs{background:var(--panel)}
      .afd-nav4-live{color:var(--lime)}
    `);
    shelf(mount, `
      <div class="afd-nav4-sticky">
        <header class="t-mast">
          <span class="t-logo">spl<i>oo</i>t</span>
          ${searchPill('cat losing it')}
          <div class="afd-row">
            <button class="t-btn primary compact t-press-sm">upload</button>
            ${helpCtl()}
            ${kCtl('sun', 'switch theme')}
          </div>
        </header>
        <div class="afd-nav4-strip">
          <div class="t-tabs"><button class="t-tab on">all</button><button class="t-tab">bangers</button></div>
          <span>${LIB.total.toLocaleString()} in the pile · sort: recent · ${LIB.queued} cooking · <b class="afd-nav4-live">● live</b></span>
          ${kCtl('shuffle', 'shuffle the pile')}
        </div>
      </div>
      <div class="afd-grow">
        <section class="t-wrap afd-sec">
          <div class="t-grid">${MEMES.slice(0, 8).map((m) => kCell(m)).join('')}</div>
        </section>
      </div>
      ${labSpec([
        ['section', 'NAV · app header chrome'],
        ['structure', 'the winning two-row sticky bar stays; row two merges filters, sort, queue count, and live status into one mono strip instead of separate groups'],
        ['hierarchy', 'tabs anchor the left, shuffle anchors the right, and everything else — count, sort, live — reads as one status sentence between them'],
        ['density', 'row two collapses three text facts into a single mono line, console stays out of the header entirely'],
      ])}
    `);
  };

  /* ================================================================
     DET-3 — mutation of DET-1: spec sheet compresses into stat tiles;
     related saves move inside the sticky sidebar for max prominence.
     ================================================================ */
  SPECS['AFD-DET-3'] = function (mount) {
    css('afd-det3', `
      .afd-det3{display:grid;gap:26px;grid-template-columns:minmax(0,3fr) minmax(0,2fr);align-items:start}
      .afd-det3 aside{position:sticky;top:20px;display:grid;gap:16px}
      .afd-det3-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .afd-det3-rel{display:grid;gap:10px}
      .afd-det3-relrow{display:flex;align-items:center;gap:10px}
      .afd-det3-relrow .t-cell{width:56px;flex:none}
      .afd-det3-relrow span{flex:1;min-width:0;font-size:12px;font-weight:700}
      @media(max-width:900px){.afd-det3{grid-template-columns:minmax(0,1fr)}.afd-det3 aside{position:static}}
    `);
    const m = MEMES[0];
    const rel = [MEMES[4], MEMES[2], MEMES[5]];
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-det3">
          ${kCell(m, '', { noCap: true, noRail: true })}
          <aside>
            <span class="t-eyebrow">meme detail</span>
            <h2>${esc(m.cap)}</h2>
            ${actionRail()}
            <div class="afd-det3-stats">
              <div class="t-stat"><b>${m.vec}</b><span>vector · ${LIB.dim}d</span></div>
              <div class="t-stat"><b>812kb</b><span>1240 × 1552</span></div>
            </div>
            <span class="t-note">saved 2026-06-12 · embedded with ${LIB.model}</span>
            <div class="afd-det3-rel">
              <span class="t-eyebrow">similar saves</span>
              ${rel.map((r) => `<div class="afd-det3-relrow">${thumbCell(r)}<span>${esc(r.cap)}</span><span class="t-tag yellow">${r.score}%</span></div>`).join('')}
            </div>
          </aside>
        </section>
      </div>
      ${labSpec([
        ['section', 'DET · meme detail'],
        ['structure', 'editorial split stays; the mono spec sheet compresses into two stat tiles and related saves move inside the sticky sidebar itself'],
        ['hierarchy', 'actions sit right under the caption; related saves are always visible beside the media with no scroll required'],
        ['density', 'two stat tiles, one note line, three related rows with scores, all inside one sticky column'],
      ])}
    `);
  };

  /* ================================================================
     DET-4 — mutation of DET-1: metadata leads the sidebar before the
     caption; dock-style actions anchor the bottom; related goes wide.
     ================================================================ */
  SPECS['AFD-DET-4'] = function (mount) {
    css('afd-det4', `
      .afd-det4{display:grid;gap:26px;grid-template-columns:minmax(0,3fr) minmax(0,2fr);align-items:start}
      .afd-det4 aside{position:sticky;top:20px;display:grid;gap:14px}
      .afd-det4-meta{display:grid;grid-template-columns:auto 1fr;gap:8px 18px;align-items:baseline}
      .afd-det4-rel{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}
      @media(max-width:900px){.afd-det4{grid-template-columns:minmax(0,1fr)}.afd-det4 aside{position:static}}
    `);
    const m = MEMES[0];
    const rel = [MEMES[4], MEMES[2], MEMES[5], MEMES[8]];
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-det4">
          ${kCell(m, '', { noCap: true, noRail: true })}
          <aside>
            <span class="t-eyebrow">meme detail</span>
            <div class="afd-det4-meta">
              <span class="t-eyebrow">file</span><b>${m.file}</b>
              <span class="t-eyebrow">dimensions</span><b>1240 × 1552</b>
              <span class="t-eyebrow">size</span><b>812 kb</b>
              <span class="t-eyebrow">vector</span><b>${m.vec} · ${LIB.dim}d</b>
            </div>
            <h2>${esc(m.cap)}</h2>
            <div class="afd-row" aria-label="meme actions">
              ${kCtl('heart', 'remove banger', 'dock hearted')}${kCtl('share', 'share meme', 'dock')}${kCtl('trash', 'delete meme', 'dock')}
            </div>
          </aside>
        </section>
        <section class="t-wrap afd-sec afd-stack">
          <div class="afd-spread">
            <h2>similar saves</h2>
            <span class="t-note">ranked by vector distance</span>
          </div>
          <div class="afd-det4-rel">${rel.map(relCard).join('')}</div>
        </section>
      </div>
      ${labSpec([
        ['section', 'DET · meme detail'],
        ['structure', 'editorial split stays; the spec sheet leads the sidebar before the caption, dock-style actions anchor the bottom of the column'],
        ['hierarchy', 'file metadata reads first as the sidebar’s opening move, the caption follows as the human line, related saves get a wider two-up section below'],
        ['density', 'four meta rows, one dock action trio, four larger related cells with similarity tags'],
      ])}
    `);
  };

  /* ================================================================
     UP-3 — mutation of UP-1: dropzone-dominant mouth stays; the queue
     becomes four state lanes read left to right instead of a list.
     ================================================================ */
  SPECS['AFD-UP-3'] = function (mount) {
    css('afd-up3', `
      .afd-up3-wrap{width:min(1040px,100%);margin-inline:auto}
      .afd-up3-lanes{display:grid;gap:16px;grid-template-columns:repeat(4,minmax(0,1fr))}
      .afd-up3-lane{display:grid;gap:10px;align-content:start}
      .afd-up3-lane h3{font:10px var(--mono);text-transform:uppercase;opacity:.7;font-weight:700}
      .afd-up3-card{display:flex;align-items:center;gap:8px}
      .afd-up3-card .afd-upmeta b{font-size:12px}
      @media(max-width:900px){.afd-up3-lanes{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:700px){.afd-up3-lanes{grid-template-columns:minmax(0,1fr)}}
    `);
    const LANES = [
      ['in the pile', [QUEUE[0]]],
      ['embedding now', [QUEUE[1]]],
      ['waiting', [QUEUE[2], QUEUE[3]]],
      ['needs a retry', [QUEUE[4]]],
    ];
    const laneCard = ([m, name, size]) => `
      <div class="afd-up3-card">
        ${thumbCell(m)}
        <div class="afd-upmeta"><b>${esc(name)}</b><span class="t-note">${size}</span></div>
      </div>`;
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-up3-wrap afd-stack">
          <span class="t-eyebrow">upload</span>
          <h1 class="t-h1">feed <em>the pile</em></h1>
          <div class="t-card afd-drop t-press">
            <h2>drag chaos here</h2>
            <span class="t-note">png, jpg, gif, webp · embedding starts on arrival</span>
            <button class="t-btn primary t-press">pick files</button>
          </div>
          <div class="afd-up3-lanes">
            ${LANES.map(([label, rows]) => `
              <div class="afd-up3-lane">
                <h3>${label} · ${rows.length}</h3>
                ${rows.map(laneCard).join('')}
                ${label === 'needs a retry' ? '<button class="t-btn compact destructive t-press-sm">retry</button>' : ''}
              </div>`).join('')}
          </div>
        </section>
      </div>
      ${kStatus()}
      ${labSpec([
        ['section', 'UP · upload intake'],
        ['structure', 'dropzone-dominant mouth stays; queue anatomy switches from a stacked list to four state lanes read left to right'],
        ['hierarchy', 'the dropzone still leads; every state is visible at once instead of scrolling one mixed list'],
        ['density', 'four lanes covering done, cooking, queued, and failed, one retry control scoped to the failed lane'],
      ])}
    `);
  };

  /* ================================================================
     UP-4 — mutation of UP-1: dropzone-dominant mouth stays; the queue
     becomes a horizontal filmstrip with state as a badge on the image.
     ================================================================ */
  SPECS['AFD-UP-4'] = function (mount) {
    css('afd-up4', `
      .afd-up4-wrap{width:min(1040px,100%);margin-inline:auto}
      .afd-up4-strip{display:flex;gap:14px;overflow-x:auto;padding-block:4px}
      .afd-up4-job{position:relative;flex:0 0 168px}
      .afd-up4-job .media{aspect-ratio:1/1}
      .afd-up4-badge{position:absolute;top:8px;right:8px;z-index:1}
      .afd-up4-queued{background:var(--panel);border:var(--b-thin);padding:3px 9px;border-radius:var(--r-pill);font:10px var(--mono)}
      .afd-up4-retry{padding:0 10px 8px}
    `);
    const JOB_TAG = {
      done: '<span class="t-tag afd-up4-badge">in the pile</span>',
      cooking: '<span class="t-tag yellow afd-up4-badge">cooking</span>',
      queued: '<span class="afd-up4-badge afd-up4-queued">queued</span>',
      failed: '<span class="t-tag magenta afd-up4-badge">failed</span>',
    };
    const job = ([m, name, , , state]) => `
      <div class="t-cell afd-up4-job">
        ${JOB_TAG[state]}
        <div class="media">${memeImg(m)}</div>
        <div class="cap"><span>${esc(name)}</span></div>
        ${state === 'failed' ? '<div class="afd-up4-retry"><button class="t-btn compact destructive t-press-sm">retry</button></div>' : ''}
      </div>`;
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-up4-wrap afd-stack">
          <span class="t-eyebrow">upload</span>
          <h1 class="t-h1">feed <em>the pile</em></h1>
          <div class="t-card afd-drop t-press">
            <h2>drag chaos here</h2>
            <span class="t-note">png, jpg, gif, webp · embedding starts on arrival</span>
            <button class="t-btn primary t-press">pick files</button>
          </div>
          <div class="afd-spread">
            <h2>the queue</h2>
            <span class="t-note">scroll for the full run</span>
          </div>
          <div class="afd-up4-strip">${QUEUE.map(job).join('')}</div>
        </section>
      </div>
      ${kStatus()}
      ${labSpec([
        ['section', 'UP · upload intake'],
        ['structure', 'dropzone-dominant mouth stays; the queue becomes a horizontal filmstrip of thumbnails with state as a corner badge on the image itself'],
        ['hierarchy', 'the dropzone still leads; state reads visually off the thumbnail instead of a text row'],
        ['density', 'five jobs in one scrollable strip, badge color carries done/cooking/queued/failed at a glance'],
      ])}
    `);
  };

  /* ================================================================
     SET-3 — refined evolution of SET-1: same calm column, eyebrow
     section labels, and a dashed fence isolating danger.
     ================================================================ */
  SPECS['AFD-SET-3'] = function (mount) {
    css('afd-set3', `
      .afd-set3-wrap{width:min(720px,100%);margin-inline:auto}
      .afd-set3-divider{border-top:2px dashed var(--ink);opacity:.35;margin-block:4px}
    `);
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-set3-wrap afd-stack" style="gap:18px">
          <span class="t-eyebrow">settings</span>
          <h1 class="t-h1">the knobs</h1>
          <span class="t-note">five things you can touch. the last one you can't undo.</span>
          <span class="t-eyebrow">you</span>
          ${setAccount()}
          ${setTokens()}
          <span class="t-eyebrow">the machine</span>
          ${setEmbed()}
          ${setStorage()}
          <div class="afd-set3-divider"></div>
          ${setDanger()}
        </section>
      </div>
      ${labSpec([
        ['section', 'SET · settings'],
        ['structure', 'the same 720px reading column as the winner, refined with eyebrow section labels and a dashed divider that fences off danger'],
        ['hierarchy', 'you-then-machine grouping made explicit with labels; the divider gives danger a visible boundary instead of just trailing order'],
        ['density', 'five cards plus one intro line and two section labels, still no tabs'],
      ])}
    `);
  };

  /* ================================================================
     SET-4 — blend: SET-1's calm single column keeps its shape, but
     SET-2's machine-status energy opens the page as a stat row.
     ================================================================ */
  SPECS['AFD-SET-4'] = function (mount) {
    css('afd-set4', `
      .afd-set4-wrap{width:min(720px,100%);margin-inline:auto}
      .afd-set4-stats{display:flex;gap:12px;flex-wrap:wrap}
      .afd-set4-stats .t-stat{flex:1;min-width:130px}
    `);
    shelf(mount, `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <div class="afd-grow">
        <section class="t-wrap afd-sec afd-set4-wrap afd-stack" style="gap:18px">
          <span class="t-eyebrow">settings</span>
          <h1 class="t-h1">the knobs</h1>
          <div class="afd-set4-stats">
            <div class="t-stat blue"><b>${LIB.total.toLocaleString()}</b><span>in the pile</span></div>
            <div class="t-stat"><b>${LIB.embedded.toLocaleString()}</b><span>embedded</span></div>
            <div class="t-stat magenta"><b>${LIB.queued}</b><span>cooking</span></div>
          </div>
          ${setAccount()}
          ${setTokens()}
          ${setEmbed()}
          ${setStorage()}
          ${setDanger()}
        </section>
      </div>
      ${labSpec([
        ['section', 'SET · settings'],
        ['structure', 'SET-1’s single calm column stays intact; SET-2’s machine-status stat row is grafted on right under the h1 instead of splitting into two columns'],
        ['hierarchy', 'the machine posts its numbers first, then the same one-card-per-concern reading order carries through to danger last'],
        ['density', 'three stat tiles plus the same five cards, no column split'],
      ])}
    `);
  };
})();
