/* lab 035 · lane hall — nutlope-hallmark philosophy applied to layout,
   structure, hierarchy, and content only; the toybox system (frame.css +
   parts.js) is law. Hallmark · pre-emit critique: P4 H5 E4 S4 R4 V5 */
(() => {
  'use strict';

  /* ---------- lane-shared structural css (grids, rows, sticky only) ---------- */
  css('hall-shared', `
    .hall-main { flex: 1 0 auto; }
    .hall-cluster { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .hall-cta { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .hall-acts { display: flex; gap: 8px; align-items: center; }
    .hall-q { font: 800 15px var(--body); }
    .hall-pad { padding-block: 22px 40px; }
    .hall-sec { margin-top: 34px; }
    .hall-h { margin: 0 0 12px; }
    .hall-p { font-size: 14px; max-width: 62ch; }
    .hall-mono { font: 11px var(--mono); }
    .hall-back { color: var(--ink); text-decoration: none; font-weight: 700; }
    .hall-meta > div { display: flex; justify-content: space-between; gap: 14px; align-items: baseline; padding: 8px 0; border-bottom: 2px dashed var(--ink); font-size: 12px; font-weight: 700; }
    .hall-meta > div:last-child { border-bottom: 0; }
    .hall-meta b { font: 10px var(--mono); text-align: right; }
    .hall-qrow { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; padding: 10px 14px; }
    .hall-thumb { width: 54px; height: 54px; flex: none; display: grid; place-items: center; overflow: hidden; border: var(--b-thin); border-radius: var(--r-inner); background: var(--paper-warm); }
    .hall-thumb img { width: 100%; height: 100%; object-fit: contain; }
    .hall-qname { font-size: 13px; font-weight: 700; min-width: 0; overflow-wrap: anywhere; }
    .hall-qright { margin-left: auto; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .hall-panel { padding: 18px 20px; display: grid; gap: 12px; align-content: start; }
    .hall-srow { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 13px; font-weight: 700; }
  `);

  /* ---------- lane-shared kit compositions ---------- */
  function shelf(mount, cls, html) {
    const root = document.createElement('div');
    root.className = `t-shelf ${cls}`;
    root.innerHTML = html;
    mount.appendChild(root);
    themeToggle(root);
  }
  function helpCtl() {
    return `<button type="button" class="t-ctl" aria-label="help" title="help"><span class="hall-q">?</span></button>`;
  }
  function tabsAllBangers() {
    return `<div class="t-tabs" role="tablist" aria-label="filter the pile"><button class="t-tab on" role="tab" aria-selected="true">all</button><button class="t-tab" role="tab" aria-selected="false">bangers</button></div>`;
  }
  function sortBtn() {
    return `<button type="button" class="t-btn compact t-press-sm">recent ↓</button>`;
  }
  function scoreCell(m, state = '', aspect = '') {
    return `<article class="t-cell ${state}">
      <div class="media" style="aspect-ratio:${aspect || m.aspect}">${memeImg(m)}</div>
      <div class="cap"><span>${esc(m.cap)}</span><b>${m.score}%</b></div>
    </article>`;
  }
  function metaRows(rows) {
    return rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  }
  function stateBits(state) {
    if (state === 'queued') return `<span class="t-tag">queued</span>`;
    if (state === 'cooking') return `<span class="t-tag yellow">cooking</span>`;
    if (state === 'done') return `<span class="t-note">in the pile</span>`;
    return `<span class="t-note">failed</span><button type="button" class="t-btn destructive compact t-press-sm">retry</button>`;
  }
  const QUEUE = [
    { m: MEMES[7], name: 'IMG_4471.png', size: '1.4 mb', state: 'cooking' },
    { m: MEMES[6], name: 'groupchat_export_44.jpg', size: '620 kb', state: 'cooking' },
    { m: MEMES[5], name: 'feral_raccoon.webp', size: '2.8 mb', state: 'queued' },
    { m: MEMES[2], name: 'hundo.png', size: '1.1 mb', state: 'done' },
    { m: MEMES[1], name: 'weball_final.png', size: '480 kb', state: 'done' },
    { m: MEMES[10], name: 'cursed_lunch.gif', size: '3.9 mb', state: 'failed' },
  ];
  function queueRow(item) {
    return `<div class="t-card hall-qrow">
      <span class="hall-thumb">${memeImg(item.m)}</span>
      <span class="hall-qname">${esc(item.name)}</span>
      <span class="t-note">${esc(item.size)}</span>
      <span class="hall-qright">${stateBits(item.state)}</span>
    </div>`;
  }

  /* settings panels shared by both SET options (grouping varies, parts do not) */
  function panelAccount() {
    return `<section class="t-card hall-panel">
      <h2 class="t-logo">account</h2>
      <div class="hall-srow"><span>signed in as</span><b class="hall-mono">you@example.com</b></div>
      <div class="hall-srow"><span>member since</span><b class="hall-mono">march 2026</b></div>
      <div class="hall-srow"><span>session</span><button type="button" class="t-btn compact t-press-sm">sign out</button></div>
    </section>`;
  }
  function panelTokens() {
    return `<section class="t-card hall-panel">
      <h2 class="t-logo">upload tokens</h2>
      <p class="hall-p">tokens let the browser extension and the api save straight to your pile.</p>
      <div class="hall-srow"><b class="hall-mono">spl_****9f3k</b><span class="hall-cluster"><span class="t-tag">active</span><span class="t-note">minted apr 2026</span><button type="button" class="t-btn compact t-press-sm">revoke</button></span></div>
      <div><button type="button" class="t-btn secondary compact t-press-sm">mint new token</button></div>
    </section>`;
  }
  function panelMachine() {
    return `<section class="t-card hall-panel">
      <h2 class="t-logo">the machine</h2>
      <p class="hall-p">every meme gets a ${LIB.dim} dim embedding from ${LIB.model}. that is what search runs on.</p>
      ${kStatus()}
    </section>`;
  }
  function panelStorage() {
    return `<section class="t-card hall-panel">
      <h2 class="t-logo">storage</h2>
      <div class="hall-srow"><span>memes</span><b class="hall-mono">${LIB.total.toLocaleString()}</b></div>
      <div class="hall-srow"><span>space</span><b class="hall-mono">2.1 gb</b></div>
      <div class="hall-srow"><span>take it all with you</span><button type="button" class="t-btn compact t-press-sm">export the pile</button></div>
    </section>`;
  }
  function panelDanger() {
    return `<section class="t-card hall-panel">
      <h2 class="t-logo"><i>danger zone</i></h2>
      <p class="hall-p">no undo on anything below. we mean it.</p>
      <div class="hall-srow"><span>delete every meme. the pile becomes nothing.</span><button type="button" class="t-btn destructive compact t-press-sm">delete the pile</button></div>
      <div class="hall-srow"><span>delete the account and everything in it.</span><button type="button" class="t-btn destructive compact t-press-sm">delete account</button></div>
    </section>`;
  }

  /* ================= LAND 1 · the demo is the hero ================= */
  SPECS['HALL-LAND-1'] = function (mount) {
    css('hall-land-1', `
      .hl1-hero { padding: 28px 0 26px; display: grid; gap: 16px; }
      .hl1-sub { display: flex; justify-content: space-between; gap: 18px; align-items: center; flex-wrap: wrap; }
      .hl1-sub p { font-size: 15px; max-width: 52ch; }
      .hl1-strip { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; align-items: start; }
      .hl1-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
      .hl1-card { padding: 18px 20px; display: grid; gap: 10px; align-content: start; }
      .hl1-card p { font-size: 13px; }
      .hl1-private { margin: 34px 0 40px; padding: 26px; display: grid; gap: 12px; justify-items: center; text-align: center; }
      .hl1-private p { font-size: 14px; max-width: 56ch; }
      @media (max-width: 900px) { .hl1-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media (max-width: 700px) { .hl1-cards { grid-template-columns: minmax(0, 1fr); } }
    `);
    const demo = [
      [MEMES[0], 'match'], [MEMES[4], 'near'], [MEMES[5], 'near'],
      [MEMES[8], 'dim'], [MEMES[9], 'dim'], [MEMES[11], 'dim'],
    ];
    shelf(mount, 'hl1', `
      ${kMast(['how it works', 'sign in'])}
      <main class="hall-main"><div class="t-wrap">
        <section class="hl1-hero">
          <h1 class="t-h1">type words. get the <em>picture.</em></h1>
          <div class="hl1-sub">
            <p>sploot is semantic search for your meme collection. describe what you half remember and the pile hands it over. try it:</p>
            <span class="hall-cta"><a class="t-btn primary t-press" href="#0">start your pile</a><a class="t-btn t-press" href="#0">sign in</a></span>
          </div>
          ${kConsole('cat losing it')}
          <div class="hl1-strip">${demo.map(([m, s]) => scoreCell(m, s, '1 / 1')).join('')}</div>
          <p class="t-note">live demo pile. green ring means match, dashed means close, faded means the machine says no.</p>
        </section>
        <section class="hall-sec">
          <h2 class="t-logo hall-h">how the pile works</h2>
          <div class="hl1-cards">
            <article class="t-card hl1-card"><h3 class="t-logo">upload the chaos</h3><p>drop in screenshots, saved pics, whatever the group chat produced. every image gets embedded automatically.</p></article>
            <article class="t-card hl1-card"><h3 class="t-logo">search like you talk</h3><p>no filenames. no tags. no folders. type the vibe and semantic search digs it out.</p></article>
            <article class="t-card hl1-card"><h3 class="t-logo">crown the bangers</h3><p>heart the elite ones. the bangers filter is your hall of fame, one tap away.</p></article>
          </div>
        </section>
        <section class="t-card hl1-private">
          <h2 class="t-logo">private by default</h2>
          <p>no feed. no followers. no algorithm doing numbers on your memes. the pile is yours alone.</p>
          <a class="t-btn primary t-press" href="#0">start your pile</a>
        </section>
      </div></main>
      ${kStatus()}
      ${labSpec([
        ['section', 'landing'],
        ['structure', 'the search console is the hero; story trails the demo'],
        ['hierarchy', 'the tool leads, copy captions it'],
        ['density', 'one demo strip above the fold, prose stays caption sized'],
      ])}
    `);
  };

  /* ================= LAND 2 · manifesto split, ledger after ================= */
  SPECS['HALL-LAND-2'] = function (mount) {
    css('hall-land-2', `
      .hl2-hero { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 34px; align-items: center; padding: 38px 0 30px; }
      .hl2-pitch { display: grid; gap: 16px; justify-items: start; }
      .hl2-pitch p { font-size: 16px; max-width: 46ch; }
      .hl2-collage { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
      .hl2-try { display: grid; gap: 14px; padding-top: 8px; }
      .hl2-try-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
      .hl2-row { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 30px; align-items: center; margin-top: 38px; }
      .hl2-row.flip .hl2-ev { order: -1; }
      .hl2-row p { font-size: 14px; max-width: 46ch; }
      .hl2-ev { display: grid; gap: 10px; align-items: start; }
      .hl2-ev.cells { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .hl2-close { margin: 44px 0; padding: 30px; display: grid; gap: 14px; justify-items: center; text-align: center; }
      .hl2-close p { font-size: 14px; max-width: 52ch; }
      @media (max-width: 900px) {
        .hl2-hero, .hl2-row { grid-template-columns: minmax(0, 1fr); }
        .hl2-row.flip .hl2-ev { order: 0; }
        .hl2-try-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    `);
    shelf(mount, 'hl2', `
      ${kMast(['how it works', 'sign in'])}
      <main class="hall-main"><div class="t-wrap">
        <section class="hl2-hero">
          <div class="hl2-pitch">
            <h1 class="t-h1">no folders. <em>just vibes.</em></h1>
            <p>sploot is a private search engine for the memes you already saved. type what you remember. get the picture back.</p>
            <span class="hall-cta"><a class="t-btn primary t-press" href="#0">make a pile</a><a class="t-btn t-press" href="#0">see it work</a></span>
            <p class="t-note">private by default. nobody scrolls your pile but you.</p>
          </div>
          <div class="hl2-collage">
            ${kCell(MEMES[1], '', { noRail: true })}
            ${kCell(MEMES[0], '', { noRail: true })}
            ${kCell(MEMES[3], '', { noRail: true })}
            ${kCell(MEMES[4], '', { noRail: true })}
          </div>
        </section>
        <section class="hl2-try">
          <h2 class="t-logo hall-h">type words. get the picture.</h2>
          ${kConsole('everything is fine')}
          <div class="hl2-try-grid">
            ${scoreCell(MEMES[1], 'match')}
            ${scoreCell(MEMES[3], 'near')}
            ${scoreCell(MEMES[4], 'dim')}
          </div>
        </section>
        <section class="hl2-row">
          <div>
            <h2 class="t-logo hall-h">the pile sorts itself</h2>
            <p>embeddings pull lookalikes together. cats being unwell, reaction faces, cursed food. zero folders maintained by you.</p>
          </div>
          <div class="hl2-ev">${kPiles(0)}</div>
        </section>
        <section class="hl2-row flip">
          <div>
            <h2 class="t-logo hall-h">bangers get a throne</h2>
            <p>some memes are simply built different. heart them and the bangers filter keeps your hall of fame one tap away.</p>
          </div>
          <div class="hl2-ev cells">${kCell(MEMES[2])}${kCell(MEMES[0])}</div>
        </section>
        <section class="hl2-row">
          <div>
            <h2 class="t-logo hall-h">upload without ceremony</h2>
            <p>drag, drop, paste, done. png jpg gif webp. embeddings cook in the background while you go touch grass.</p>
          </div>
          <div class="hl2-ev">${queueRow(QUEUE[0])}${queueRow(QUEUE[2])}${queueRow(QUEUE[3])}</div>
        </section>
        <section class="t-card hl2-close">
          <h2 class="t-logo">your memes want to be found</h2>
          <p>sploot searches the pictures themselves, not the filenames you never wrote.</p>
          <a class="t-btn primary t-press" href="#0">make a pile</a>
          <p class="t-note">private by default.</p>
        </section>
      </div></main>
      ${labSpec([
        ['section', 'landing'],
        ['structure', 'manifesto split hero, then alternating proof ledger rows'],
        ['hierarchy', 'the claim leads, evidence stacks beside it'],
        ['density', 'editorial, one idea per band'],
      ])}
    `);
  };

  /* ================= NAV 1 · one control strip + console throne ================= */
  SPECS['HALL-NAV-1'] = function (mount) {
    css('hall-nav-1', `
      .hn1 .t-mast { flex-wrap: wrap; }
      .hn1-band { padding-top: 16px; }
      .hn1 .t-grid { align-items: start; }
    `);
    shelf(mount, 'hn1', `
      <header class="t-mast">
        <span class="hall-cluster">
          <span class="t-logo">spl<i>oo</i>t</span>
          ${tabsAllBangers()}
          ${sortBtn()}
          ${kCtl('shuffle', 'shuffle the pile')}
        </span>
        <span class="hall-cluster">
          <a class="t-btn primary compact t-press-sm" href="#0">upload</a>
          ${kCtl('sun', 'switch theme')}
          ${helpCtl()}
        </span>
      </header>
      <div class="t-wrap hn1-band">${kConsole('goblin mode')}</div>
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="t-grid">${MEMES.slice(0, 8).map((m) => kCell(m)).join('')}</div>
      </div></main>
      ${labSpec([
        ['section', 'app chrome'],
        ['structure', 'one control strip, console throne beneath it'],
        ['hierarchy', 'search dominates, actions cluster at the edges'],
        ['density', 'two rows total, machine row doubles as status'],
      ])}
    `);
  };

  /* ================= NAV 2 · tiered chrome, sticky search ================= */
  SPECS['HALL-NAV-2'] = function (mount) {
    css('hall-nav-2', `
      .hn2-sticky { position: sticky; top: 0; z-index: 30; }
      .hn2 .t-grid { align-items: start; }
      .hn2-cwrap { flex: 1; min-width: 240px; }
      .hn2-filters { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding-block: 16px 0; }
      .hn2-end { margin-left: auto; }
    `);
    shelf(mount, 'hn2', `
      <header class="t-mast">
        <span class="t-logo">spl<i>oo</i>t</span>
        <span class="hall-cluster">
          <a class="t-btn primary compact t-press-sm" href="#0">upload</a>
          ${helpCtl()}
          ${kCtl('sun', 'switch theme')}
        </span>
      </header>
      <div class="t-mast hn2-sticky">
        <div class="hn2-cwrap">${kConsole('that cat with the attitude', { noMachine: true })}</div>
        ${kCtl('shuffle', 'shuffle the pile')}
      </div>
      ${kStatus()}
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="hn2-filters">
          ${tabsAllBangers()}
          ${sortBtn()}
          <span class="t-note hn2-end">showing all · newest first</span>
        </div>
        <div class="t-grid" style="margin-top:16px">${MEMES.slice(0, 8).map((m) => kCell(m)).join('')}</div>
      </div></main>
      ${labSpec([
        ['section', 'app chrome'],
        ['structure', 'identity top, sticky search tier, status ribbon, filter row'],
        ['hierarchy', 'search sticks with you, capture stays up top'],
        ['density', 'three thin tiers over the feed'],
      ])}
    `);
  };

  /* ================= FEED 1 · pile rail + masonry ================= */
  SPECS['HALL-FEED-1'] = function (mount) {
    css('hall-feed-1', `
      .hf1-body { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 26px; align-items: start; }
      .hf1-rail { position: sticky; top: 16px; display: grid; gap: 10px; justify-items: start; }
      .hf1-rail .t-pile { width: 100%; }
      .hf1-masonry { columns: 3; column-gap: 18px; }
      .hf1-masonry .t-cell { break-inside: avoid; margin: 0 0 18px; display: inline-block; width: 100%; }
      @media (max-width: 1000px) {
        .hf1-body { grid-template-columns: minmax(0, 1fr); }
        .hf1-rail { position: static; display: flex; flex-wrap: wrap; align-items: center; }
        .hf1-rail .t-pile { width: auto; }
      }
      @media (max-width: 700px) { .hf1-masonry { columns: 2; column-gap: 13px; } }
    `);
    shelf(mount, 'hf1', `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="hf1-body">
          <aside class="hf1-rail">
            <h2 class="t-logo">piles</h2>
            ${kPiles(0)}
            <p class="t-note">piles emerge from what you save. zero folders were maintained.</p>
            <button type="button" class="t-btn compact t-press-sm">shuffle the pile</button>
          </aside>
          <div class="hf1-masonry">${MEMES.map((m) => kCell(m)).join('')}</div>
        </div>
      </div></main>
      ${labSpec([
        ['section', 'feed'],
        ['structure', 'pile rail on the left, natural-aspect masonry on the right'],
        ['hierarchy', 'piles frame the scan, memes carry it'],
        ['density', 'full caps and rails, uncropped aspects'],
      ])}
    `);
  };

  /* ================= FEED 2 · chip row + uniform square wall ================= */
  SPECS['HALL-FEED-2'] = function (mount) {
    css('hall-feed-2', `
      .hf2-chips { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
      .hf2-count { margin-left: auto; }
      .hf2-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; margin-top: 18px; }
      @media (max-width: 700px) { .hf2-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; } }
    `);
    shelf(mount, 'hf2', `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="hf2-chips">
          ${kPiles(1)}
          <span class="t-note hf2-count">${LIB.total.toLocaleString()} saved · ${LIB.queued} cooking</span>
        </div>
        <div class="hf2-grid">${MEMES.map((m) => kCell({ ...m, aspect: '1 / 1' }, '', { noCap: true })).join('')}</div>
      </div></main>
      ${labSpec([
        ['section', 'feed'],
        ['structure', 'pile chips on top, uniform square wall below'],
        ['hierarchy', 'images only, chrome demoted to chips'],
        ['density', 'no captions, rails only, letterboxed squares'],
      ])}
    `);
  };

  /* ================= DET 1 · editorial split + related deck ================= */
  SPECS['HALL-DET-1'] = function (mount) {
    css('hall-det-1', `
      .hd1-split { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 30px; align-items: start; padding-top: 24px; }
      .hd1-side { position: sticky; top: 16px; display: grid; gap: 14px; justify-items: start; }
      .hd1-meta { padding: 8px 18px; width: 100%; }
      .hd1-rel { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
      @media (max-width: 900px) {
        .hd1-split { grid-template-columns: minmax(0, 1fr); }
        .hd1-side { position: static; }
        .hd1-rel { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
      }
    `);
    const m = MEMES[0];
    shelf(mount, 'hd1', `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="hd1-split">
          ${kCell(m, '', { noCap: true, noRail: true })}
          <aside class="hd1-side">
            <a class="t-note hall-back" href="#0">← back to the pile</a>
            <h1 class="t-logo">${esc(m.cap)}</h1>
            <span class="hall-cluster"><span class="t-tag yellow">certified banger</span><span class="t-tag">cats being unwell</span></span>
            <div class="hall-acts">${kCtl('heart', 'remove banger', 'hearted')}${kCtl('share', 'share meme')}${kCtl('trash', 'delete meme')}</div>
            <div class="t-card hd1-meta hall-meta">${metaRows([
              ['file', m.file],
              ['dimensions', '1080 x 1350'],
              ['size', '842 kb'],
              ['vector', m.vec],
              ['saved', 'jun 12 2026'],
              ['state', 'embedded'],
            ])}</div>
          </aside>
        </div>
        <section class="hall-sec">
          <h2 class="t-logo hall-h">similar saves</h2>
          <p class="t-note hall-h">the machine thinks these live in the same neighborhood.</p>
          <div class="hd1-rel">${scoreCell(MEMES[2])}${scoreCell(MEMES[4])}${scoreCell(MEMES[5])}${scoreCell(MEMES[8])}</div>
        </section>
      </div></main>
      ${labSpec([
        ['section', 'detail'],
        ['structure', 'editorial split, related deck spans below'],
        ['hierarchy', 'media leads, receipts ride the sidebar'],
        ['density', 'metadata as a ledger card, related scored in percent'],
      ])}
    `);
  };

  /* ================= DET 2 · stacked poster + machine plate ================= */
  SPECS['HALL-DET-2'] = function (mount) {
    css('hall-det-2', `
      .hd2-col { max-width: 780px; margin-inline: auto; display: grid; gap: 16px; justify-items: center; padding-top: 26px; text-align: center; }
      .hd2-col .t-cell, .hd2-col .t-status { width: 100%; }
      .hd2-rel { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; margin-top: 26px; }
      @media (max-width: 900px) { .hd2-rel { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media (max-width: 700px) { .hd2-rel { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; } }
    `);
    const m = MEMES[3];
    shelf(mount, 'hd2', `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="hd2-col">
          ${kCell(m, '', { noCap: true, noRail: true })}
          <div class="hall-acts">${kCtl('heart', 'mark as banger', 'dock')}${kCtl('share', 'share meme', 'dock')}${kCtl('trash', 'delete meme', 'dock')}</div>
          <h1 class="t-logo">${esc(m.cap)}</h1>
          <div class="t-status"><span>${esc(m.file)}</span><span>1920 x 1080</span><span>1.2 mb</span><span>vec ${m.vec}</span><span>saved may 30 2026</span><span class="live">embedded</span></div>
        </div>
        <section class="hall-sec">
          <h2 class="t-logo hall-h">similar saves</h2>
          <div class="hd2-rel">${scoreCell(MEMES[0])}${scoreCell(MEMES[2])}${scoreCell(MEMES[4])}${scoreCell(MEMES[5])}${scoreCell(MEMES[8])}</div>
        </section>
      </div></main>
      ${labSpec([
        ['section', 'detail'],
        ['structure', 'stacked poster, machine plate for metadata, related drawer'],
        ['hierarchy', 'media, then actions, then receipts, in reading order'],
        ['density', 'metadata compressed to one status band'],
      ])}
    `);
  };

  /* ================= UP 1 · dropzone shrine + queue ledger ================= */
  SPECS['HALL-UP-1'] = function (mount) {
    css('hall-up-1', `
      .hu1-col { max-width: 860px; margin-inline: auto; display: grid; gap: 26px; padding-top: 28px; }
      .hu1-drop { padding: 44px 28px; display: grid; gap: 14px; justify-items: center; text-align: center; }
      .hu1-drop p { font-size: 15px; max-width: 50ch; }
      .hu1-q { display: grid; gap: 12px; }
    `);
    shelf(mount, 'hu1', `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="hu1-col">
          <section class="t-card hu1-drop">
            <h1 class="t-h1">drop the chaos <em>here</em></h1>
            <p>or paste. or click the button. every image gets embedded so you can find it later by typing words.</p>
            <button type="button" class="t-btn primary t-press">pick files</button>
            <p class="t-note">png jpg gif webp · paste works too · private by default</p>
          </section>
          <section class="hu1-q">
            <div>
              <h2 class="t-logo hall-h">the queue</h2>
              <p class="t-note">cooking means the machine is embedding it. usually seconds.</p>
            </div>
            ${QUEUE.map(queueRow).join('')}
          </section>
        </div>
      </div></main>
      ${labSpec([
        ['section', 'upload'],
        ['structure', 'dropzone shrine on top, queue ledger below'],
        ['hierarchy', 'the drop leads, the queue reads like a receipt'],
        ['density', 'one row per file, states as tags'],
      ])}
    `);
  };

  /* ================= UP 2 · side intake + queue grid ================= */
  SPECS['HALL-UP-2'] = function (mount) {
    css('hall-up-2', `
      .hu2-body { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 26px; align-items: start; padding-top: 4px; }
      .hu2-rail { position: sticky; top: 16px; display: grid; gap: 14px; }
      .hu2-drop { padding: 20px; display: grid; gap: 10px; justify-items: start; }
      .hu2-drop p { font-size: 13px; }
      .hu2-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
      @media (max-width: 900px) { .hu2-body { grid-template-columns: minmax(0, 1fr); } .hu2-rail { position: static; } }
      @media (max-width: 700px) { .hu2-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; } }
    `);
    const upCell = (item) => `<article class="t-cell ${item.state === 'failed' ? 'near' : ''}">
      <div class="media" style="aspect-ratio:1 / 1">${memeImg(item.m)}</div>
      <div class="cap"><span>${esc(item.name)}</span><b>${esc(item.size)}</b></div>
      <div class="rail">${stateBits(item.state)}</div>
    </article>`;
    shelf(mount, 'hu2', `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="hu2-body">
          <aside class="hu2-rail">
            <section class="t-card hu2-drop">
              <h2 class="t-logo">feed the pile</h2>
              <p>drop files anywhere on this page. paste works too.</p>
              <button type="button" class="t-btn primary compact t-press-sm">pick files</button>
              <p class="t-note">png jpg gif webp</p>
            </section>
            <div class="t-stat magenta"><b>${LIB.queued}</b><span>cooking right now</span></div>
            <div class="t-stat blue"><b>${LIB.embedded.toLocaleString()}</b><span>embedded and searchable</span></div>
          </aside>
          <section>
            <h2 class="t-logo hall-h">incoming</h2>
            <p class="t-note hall-h">orange outline means it failed. everything else is the machine doing its thing.</p>
            <div class="hu2-grid">${QUEUE.map(upCell).join('')}</div>
          </section>
        </div>
      </div></main>
      ${labSpec([
        ['section', 'upload'],
        ['structure', 'intake demoted to a side rail, queue promoted to a cell grid'],
        ['hierarchy', 'the queue leads, the dropzone waits its turn'],
        ['density', 'thumbnails with state strips, stats in the rail'],
      ])}
    `);
  };

  /* ================= SET 1 · single-column document, danger last ================= */
  SPECS['HALL-SET-1'] = function (mount) {
    css('hall-set-1', `
      .hs1-col { max-width: 760px; margin-inline: auto; display: grid; gap: 18px; padding-top: 26px; }
    `);
    shelf(mount, 'hs1', `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="hs1-col">
          <div>
            <h1 class="t-h1">settings</h1>
            <p class="t-note hall-note-gap">the boring page. important though.</p>
          </div>
          ${panelAccount()}
          ${panelTokens()}
          ${panelMachine()}
          ${panelStorage()}
          ${panelDanger()}
        </div>
      </div></main>
      ${labSpec([
        ['section', 'settings'],
        ['structure', 'single-column document, panels in reading order'],
        ['hierarchy', 'account first, the red buttons buried at the very end'],
        ['density', 'five panels, one personality line each'],
      ])}
    `);
  };

  /* ================= SET 2 · jump rail + machine-first grouping ================= */
  SPECS['HALL-SET-2'] = function (mount) {
    css('hall-set-2', `
      .hs2-body { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 26px; align-items: start; padding-top: 26px; }
      .hs2-rail { position: sticky; top: 16px; display: grid; gap: 4px; justify-items: start; }
      .hs2-rail a { color: var(--ink); text-decoration: none; font-weight: 800; font-size: 13px; padding: 6px 10px; border-radius: var(--r-pill); }
      .hs2-stats { display: flex; gap: 14px; flex-wrap: wrap; }
      .hs2-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 18px; }
      .hs2-danger { margin-top: 18px; }
      @media (max-width: 900px) {
        .hs2-body { grid-template-columns: minmax(0, 1fr); }
        .hs2-rail { position: static; display: flex; flex-wrap: wrap; }
        .hs2-grid { grid-template-columns: minmax(0, 1fr); }
      }
    `);
    shelf(mount, 'hs2', `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="hs2-body">
          <nav class="hs2-rail" aria-label="settings sections">
            <span class="t-note">jump to</span>
            <a href="#0">the machine</a>
            <a href="#0">account</a>
            <a href="#0">upload tokens</a>
            <a href="#0">storage</a>
            <a href="#0">danger zone</a>
          </nav>
          <div>
            <section class="t-card hall-panel">
              <h2 class="t-logo">the machine</h2>
              <div class="hs2-stats">
                <div class="t-stat"><b>${LIB.total.toLocaleString()}</b><span>in the pile</span></div>
                <div class="t-stat blue"><b>${LIB.embedded.toLocaleString()}</b><span>embedded</span></div>
                <div class="t-stat magenta"><b>${LIB.queued}</b><span>cooking</span></div>
              </div>
              <p class="hall-p">${LIB.model} · ${LIB.dim} dims · that is what search runs on.</p>
            </section>
            <div class="hs2-grid">
              ${panelAccount()}
              ${panelTokens()}
              ${panelStorage()}
            </div>
            <div class="hs2-danger">${panelDanger()}</div>
          </div>
        </div>
      </div></main>
      ${labSpec([
        ['section', 'settings'],
        ['structure', 'jump rail on the left, grouped panels on the right'],
        ['hierarchy', 'the machine leads with big numbers, danger isolated at the bottom'],
        ['density', 'stats up top, prose kept inside panels'],
      ])}
    `);
  };

  /* ============ round 2 · mutations ============ */

  /* ================= LAND 3 · pitch compressed to a strip, wall dominates ================= */
  SPECS['HALL-LAND-3'] = function (mount) {
    css('hall-land-3', `
      .hl3-strip { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; padding: 22px 0 4px; }
      .hl3-h { font-family: var(--display); font-size: clamp(28px, 4.4vw, 42px); line-height: 1.05; overflow-wrap: anywhere; }
      .hl3-h em { font-style: normal; color: var(--red); }
      .hl3-strip p { font-size: 13px; max-width: 44ch; }
      .hl3-console-wrap { padding-top: 10px; }
      .hl3-wallhead { display: flex; justify-content: space-between; align-items: baseline; gap: 14px; flex-wrap: wrap; padding-top: 22px; }
      .hl3-wall { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; margin-top: 14px; }
      .hl3-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 14px; }
      .hl3-card { padding: 18px 20px; display: grid; gap: 10px; align-content: start; }
      .hl3-card p { font-size: 13px; }
      .hl3-close { margin: 34px 0 40px; padding: 24px; display: grid; gap: 10px; justify-items: center; text-align: center; }
      .hl3-close p { font-size: 13px; max-width: 54ch; }
      @media (max-width: 900px) { .hl3-wall { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
      @media (max-width: 700px) { .hl3-wall { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .hl3-cards { grid-template-columns: minmax(0, 1fr); } }
    `);
    const band = (score) => (score >= 80 ? 'match' : score >= 60 ? 'near' : 'dim');
    shelf(mount, 'hl3', `
      ${kMast(['how it works', 'sign in'])}
      <main class="hall-main"><div class="t-wrap">
        <section class="hl3-strip">
          <h1 class="hl3-h">search 1,000 classics. <em>live.</em></h1>
          <p>type what you half remember. the wall below re-ranks with real similarity scores — this is the actual sploot engine, not a screenshot.</p>
          <span class="hall-cta"><a class="t-btn primary t-press" href="#0">start your pile</a><a class="t-btn t-press" href="#0">sign in</a></span>
        </section>
        <div class="hl3-console-wrap">${kConsole('skeleton waiting on ci')}</div>
        <section class="hl3-wallhead">
          <h2 class="t-logo">the demo wall</h2>
          <p class="t-note">1,000 public classics, embedded. every search reshuffles what you see below.</p>
        </section>
        <div class="hl3-wall">${MEMES.map((m) => kCell(m, band(m.score), { noRail: true, score: true })).join('')}</div>
        <section class="hall-sec">
          <h2 class="t-logo hall-h">how the pile works</h2>
          <div class="hl3-cards">
            <article class="t-card hl3-card"><h3 class="t-logo">upload the chaos</h3><p>drop in screenshots, saved pics, whatever the group chat produced. every image gets embedded automatically.</p></article>
            <article class="t-card hl3-card"><h3 class="t-logo">search like you talk</h3><p>no filenames. no tags. no folders. type the vibe and semantic search digs it out.</p></article>
            <article class="t-card hl3-card"><h3 class="t-logo">crown the bangers</h3><p>heart the elite ones. the bangers filter is your hall of fame, one tap away.</p></article>
          </div>
        </section>
        <section class="t-card hl3-close">
          <h2 class="t-logo">your memes want to be found</h2>
          <p>everything above runs on the same search that powers your private pile. no folders, no filenames, just the picture you remember.</p>
          <a class="t-btn primary t-press" href="#0">start your pile</a>
        </section>
      </div></main>
      ${kStatus()}
      ${labSpec([
        ['section', 'landing'],
        ['structure', 'pitch compresses to a strip, console throne leads, the demo wall dominates the fold'],
        ['hierarchy', 'wall over words — 12 live-scored cells before any pitch card'],
        ['density', 'one dense 6-up wall, cards and closer trail below'],
      ])}
    `);
  };

  /* ================= LAND 4 · ranked moment beside a browsable wall ================= */
  SPECS['HALL-LAND-4'] = function (mount) {
    css('hall-land-4', `
      .hl4-hero { padding: 26px 0 6px; display: grid; gap: 14px; }
      .hl4-hero p { font-size: 14px; max-width: 54ch; }
      .hl4-split { display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 8fr); gap: 22px; align-items: start; margin-top: 20px; }
      .hl4-ranked, .hl4-browse { display: grid; gap: 10px; align-content: start; }
      .hl4-ranked p, .hl4-browse p { font-size: 12px; }
      .hl4-rank-list { display: grid; gap: 10px; }
      .hl4-browse-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .hl4-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 14px; }
      .hl4-card { padding: 18px 20px; display: grid; gap: 10px; align-content: start; }
      .hl4-card p { font-size: 13px; }
      .hl4-close { margin: 34px 0 40px; padding: 24px; display: grid; gap: 10px; justify-items: center; text-align: center; }
      .hl4-close p { font-size: 13px; max-width: 54ch; }
      @media (max-width: 900px) { .hl4-split { grid-template-columns: minmax(0, 1fr); } }
      @media (max-width: 700px) { .hl4-browse-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .hl4-cards { grid-template-columns: minmax(0, 1fr); } }
    `);
    const ranked = [MEMES[0], MEMES[2], MEMES[4]];
    const browse = [MEMES[1], MEMES[3], MEMES[5], MEMES[6], MEMES[7], MEMES[8], MEMES[9], MEMES[10], MEMES[11]];
    shelf(mount, 'hl4', `
      ${kMast(['how it works', 'sign in'])}
      <main class="hall-main"><div class="t-wrap">
        <section class="hl4-hero">
          <h1 class="t-h1">type words. get the <em>picture.</em></h1>
          <p>sploot searches 1,000 classic memes live, right here — describe what you half remember and watch the wall re-rank in real time.</p>
          <span class="hall-cta"><a class="t-btn primary t-press" href="#0">start your pile</a><a class="t-btn t-press" href="#0">sign in</a></span>
          ${kConsole('cat contempt')}
        </section>
        <div class="hl4-split">
          <div class="hl4-ranked">
            <h2 class="t-logo">closest matches</h2>
            <p class="t-note">what "cat contempt" pulled back, ranked by the machine.</p>
            <div class="hl4-rank-list">${ranked.map((m) => kCell(m, m.score >= 90 ? 'match' : 'near', { noRail: true, score: true })).join('')}</div>
          </div>
          <div class="hl4-browse">
            <h2 class="t-logo">browse the rest</h2>
            <p class="t-note">a randomized slice of the 1,000. every new search reshuffles this too.</p>
            <div class="hl4-browse-grid">${browse.map((m) => kCell(m, '', { noRail: true })).join('')}</div>
          </div>
        </div>
        <section class="hall-sec">
          <h2 class="t-logo hall-h">how the pile works</h2>
          <div class="hl4-cards">
            <article class="t-card hl4-card"><h3 class="t-logo">upload the chaos</h3><p>drop in screenshots, saved pics, whatever the group chat produced. every image gets embedded automatically.</p></article>
            <article class="t-card hl4-card"><h3 class="t-logo">search like you talk</h3><p>no filenames. no tags. no folders. type the vibe and semantic search digs it out.</p></article>
            <article class="t-card hl4-card"><h3 class="t-logo">crown the bangers</h3><p>heart the elite ones. the bangers filter is your hall of fame, one tap away.</p></article>
          </div>
        </section>
        <section class="t-card hl4-close">
          <h2 class="t-logo">private by default</h2>
          <p>the demo above is public. your pile never is. no feed, no followers, no algorithm doing numbers on your memes.</p>
          <a class="t-btn primary t-press" href="#0">start your pile</a>
        </section>
      </div></main>
      ${labSpec([
        ['section', 'landing'],
        ['structure', 'console hero, then a ranked-results column beside a browsable randomized wall'],
        ['hierarchy', 'the search moment leads narrow, the browsable wall trails wide'],
        ['density', '3 ranked cells stacked, 9 browse cells in a loose grid'],
      ])}
    `);
  };

  /* ================= NAV 3 · dashed clusters, throne fused to status ================= */
  SPECS['HALL-NAV-3'] = function (mount) {
    css('hall-nav-3', `
      .hn3 .t-mast { flex-wrap: wrap; row-gap: 12px; }
      .hn3-group { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .hn3-div { width: 0; align-self: stretch; min-height: 24px; border-left: 2px dashed var(--ink); opacity: .35; }
      .hn3-throne { padding-block: 14px 0; }
      .hn3 .t-grid { align-items: start; }
      @media (max-width: 700px) { .hn3-div { display: none; } }
    `);
    shelf(mount, 'hn3', `
      <header class="t-mast">
        <span class="hn3-group"><span class="t-logo">spl<i>oo</i>t</span></span>
        <span class="hn3-div"></span>
        <span class="hn3-group">${tabsAllBangers()}${sortBtn()}${kCtl('shuffle', 'shuffle the pile')}</span>
        <span class="hn3-div"></span>
        <span class="hn3-group">
          <a class="t-btn primary compact t-press-sm" href="#0">upload</a>
          ${kCtl('sun', 'switch theme')}
          ${helpCtl()}
        </span>
      </header>
      <div class="t-wrap hn3-throne">${kConsole('goblin mode', { noMachine: true })}</div>
      ${kStatus()}
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="t-grid">${MEMES.slice(0, 8).map((m) => kCell(m)).join('')}</div>
      </div></main>
      ${labSpec([
        ['section', 'app chrome'],
        ['structure', 'three dashed-divided clusters, console throne fused to a status ribbon'],
        ['hierarchy', 'identity, view controls, and actions read as separate groups; throne+status act as one band'],
        ['density', 'one row, three clusters, zero gap between search and status'],
      ])}
    `);
  };

  /* ================= NAV 4 · dense clusters, centered throne, piles bridge to feed ================= */
  SPECS['HALL-NAV-4'] = function (mount) {
    css('hall-nav-4', `
      .hn4 .t-mast { flex-wrap: wrap; gap: 10px 14px; }
      .hn4-group { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .hn4-throne { max-width: 640px; margin-inline: auto; padding-top: 18px; }
      .hn4-rail { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; padding: 14px clamp(14px, 4vw, 44px) 0; }
      .hn4 .t-grid { align-items: start; }
    `);
    shelf(mount, 'hn4', `
      <header class="t-mast">
        <span class="hn4-group">
          <span class="t-logo">spl<i>oo</i>t</span>
          ${tabsAllBangers()}
          ${sortBtn()}
        </span>
        <span class="hn4-group">
          ${kCtl('shuffle', 'shuffle the pile')}
          <a class="t-btn primary compact t-press-sm" href="#0">upload</a>
          ${kCtl('sun', 'switch theme')}
          ${helpCtl()}
        </span>
      </header>
      <div class="t-wrap hn4-throne">${kConsole('goblin mode')}</div>
      <div class="hn4-rail">${kPiles(0)}</div>
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="t-grid">${MEMES.slice(0, 8).map((m) => kCell(m)).join('')}</div>
      </div></main>
      ${labSpec([
        ['section', 'app chrome'],
        ['structure', 'two dense clusters, a centered narrow throne, piles rail bridges throne to feed'],
        ['hierarchy', 'the throne is compact and centered, piles rail hands off directly to the grid'],
        ['density', 'four items per cluster, throne capped narrow, one pile rail row before content'],
      ])}
    `);
  };

  /* ================= UP 3 · unified rail, queue split into state bands ================= */
  SPECS['HALL-UP-3'] = function (mount) {
    css('hall-up-3', `
      .hu3-body { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 26px; align-items: start; padding-top: 4px; }
      .hu3-rail { position: sticky; top: 16px; padding: 20px; display: grid; gap: 14px; }
      .hu3-rail p { font-size: 13px; }
      .hu3-legend { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 6px; border-top: 2px dashed var(--ink); }
      .hu3-band + .hu3-band { margin-top: 22px; }
      .hu3-band h3 { display: flex; align-items: baseline; gap: 8px; }
      .hu3-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 10px; }
      @media (max-width: 900px) { .hu3-body { grid-template-columns: minmax(0, 1fr); } .hu3-rail { position: static; } }
      @media (max-width: 700px) { .hu3-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; } }
    `);
    const upCell = (item) => `<article class="t-cell ${item.state === 'failed' ? 'near' : ''}">
      <div class="media" style="aspect-ratio:1 / 1">${memeImg(item.m)}</div>
      <div class="cap"><span>${esc(item.name)}</span><b>${esc(item.size)}</b></div>
      <div class="rail">${stateBits(item.state)}</div>
    </article>`;
    const bands = [
      ['cooking', 'cooking now'],
      ['queued', 'up next'],
      ['done', 'in the pile'],
      ['failed', 'needs a retry'],
    ];
    shelf(mount, 'hu3', `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="hu3-body">
          <aside class="t-card hu3-rail">
            <h2 class="t-logo">feed the pile</h2>
            <p>drop files anywhere on this page. paste works too.</p>
            <button type="button" class="t-btn primary compact t-press-sm">pick files</button>
            <p class="t-note">png jpg gif webp</p>
            <div class="hu3-legend">
              ${bands.map(([key, label]) => `<span class="t-tag${key === 'cooking' ? ' yellow' : ''}">${esc(label)} · ${QUEUE.filter((q) => q.state === key).length}</span>`).join('')}
            </div>
          </aside>
          <section>
            <h2 class="t-logo hall-h">the queue</h2>
            <p class="t-note hall-h">every state gets its own band, so nothing is buried in a wall of thumbnails.</p>
            ${bands.map(([key, label]) => {
              const items = QUEUE.filter((q) => q.state === key);
              if (!items.length) return '';
              return `<div class="hu3-band"><h3 class="t-logo">${esc(label)}</h3><div class="hu3-grid">${items.map(upCell).join('')}</div></div>`;
            }).join('')}
          </section>
        </div>
      </div></main>
      ${labSpec([
        ['section', 'upload'],
        ['structure', 'rail unifies dropzone and a state legend; the queue splits into four labeled bands'],
        ['hierarchy', 'cooking leads the queue, then queued, done, failed — each band named'],
        ['density', 'one rail card, four short bands instead of one flat grid'],
      ])}
    `);
  };

  /* ================= UP 4 · compact split-stat rail, filterable mixed-state grid ================= */
  SPECS['HALL-UP-4'] = function (mount) {
    css('hall-up-4', `
      .hu4-body { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 24px; align-items: start; padding-top: 4px; }
      .hu4-rail { position: sticky; top: 16px; display: grid; gap: 14px; }
      .hu4-drop { padding: 16px; display: grid; gap: 8px; justify-items: start; }
      .hu4-drop p { font-size: 12px; }
      .hu4-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .hu4-stats .t-stat { min-width: 0; }
      .hu4-filter { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
      .hu4-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
      @media (max-width: 900px) { .hu4-body { grid-template-columns: minmax(0, 1fr); } .hu4-rail { position: static; } }
      @media (max-width: 700px) { .hu4-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; } }
    `);
    const upCell = (item) => `<article class="t-cell ${item.state === 'failed' ? 'near' : ''}">
      <div class="media" style="aspect-ratio:1 / 1">${memeImg(item.m)}</div>
      <div class="cap"><span>${esc(item.name)}</span><b>${esc(item.size)}</b></div>
      <div class="rail">${stateBits(item.state)}</div>
    </article>`;
    shelf(mount, 'hu4', `
      ${kMast(['the pile', 'bangers', 'settings'])}
      <main class="hall-main"><div class="t-wrap hall-pad">
        <div class="hu4-body">
          <aside class="hu4-rail">
            <section class="t-card hu4-drop">
              <h2 class="t-logo">feed the pile</h2>
              <p>drop files anywhere. paste works too.</p>
              <button type="button" class="t-btn primary compact t-press-sm">pick files</button>
              <p class="t-note">png jpg gif webp</p>
            </section>
            <div class="hu4-stats">
              <div class="t-stat magenta"><b>${LIB.queued}</b><span>cooking</span></div>
              <div class="t-stat blue"><b>${LIB.embedded.toLocaleString()}</b><span>embedded</span></div>
            </div>
          </aside>
          <section>
            <div class="hu4-filter">
              <div class="t-tabs" role="tablist" aria-label="filter the queue">
                <button class="t-tab on" role="tab" aria-selected="true">all</button>
                <button class="t-tab" role="tab" aria-selected="false">failed</button>
              </div>
              <span class="t-note">showing all · newest first</span>
            </div>
            <div class="hu4-grid">${QUEUE.map(upCell).join('')}</div>
          </section>
        </div>
      </div></main>
      ${labSpec([
        ['section', 'upload'],
        ['structure', 'compact rail with side-by-side stat cards; queue stays one filterable grid in recency order'],
        ['hierarchy', 'filter tabs frame the queue, all four states ride together in one wall'],
        ['density', 'tight 2-up stat rail, one 3-up queue grid, filter row on top'],
      ])}
    `);
  };
})();
