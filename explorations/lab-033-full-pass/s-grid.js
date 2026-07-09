/* lab 033 · section GRID — the /app workbench (library view).
   fixed: shipped tokens + kit. varies: chrome anatomy, grid form, density. */
'use strict';

const G_BAR = `
  <div class="g-command" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <div style="flex:1;min-width:260px;display:flex;border:3px solid var(--ink);background:#fff">
      <span style="flex:1;padding:9px 12px;font-family:var(--mono);font-size:13px;opacity:.55">search your memes…</span>
      <span style="border-left:3px solid var(--ink);background:var(--paper-warm);font-family:var(--mono);font-size:10px;padding:9px 10px">⌘K</span>
    </div>
    <button class="k-btn sm primary">↥ upload</button>
    <div style="display:flex;border:2px solid var(--ink);background:#fff">
      <button class="k-btn sm" style="border:0;background:var(--blue);color:#fff">all</button>
      <button class="k-btn sm" style="border:0;border-left:1px solid var(--ink)">♡ bangers</button>
    </div>
    <button class="k-btn sm">recent ↝</button>
    <button class="k-btn sm" style="background:var(--cyan)">⤨ shuffle</button>
  </div>`;
const G_PILERAIL = `
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <span class="k-note">piles:</span>
    ${PILES.slice(0, 5).map((p, i) => `<span class="k-sticker ${['', 'yellow', 'lime', 'magenta', 'blue'][i]}" style="font-size:10px;padding:3px 8px">${esc(p.name)} · ${p.n}</span>`).join('')}
  </div>`;
const gCells = (n, opts = {}) => MEMES.slice(0, n).map((x, i) => kCell(x, opts.state ? opts.state(x, i) : '')).join('');

/* ---- GRID-1 baseline ---- */
SPECS['GRID-1'] = (m) => {
  css('GRID-1', `
    .g1-grid { columns: 4 220px; column-gap: 18px; }
    .g1-grid .k-cellwrap { break-inside: avoid; margin-bottom: 18px; }
    @media (max-width:700px) {
      .g-command { align-items:stretch !important; }
      .g-command > div:first-child { flex:1 0 100% !important; width:100%; min-width:0 !important; }
      .g-command > div:first-child > span:first-child { min-width:0; }
      .g1-grid { columns:2 150px; column-gap:10px; }
      .g1-grid .k-cellwrap { margin-bottom:10px; }
    }
  `);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="border-bottom:3px solid var(--cyan);padding:10px 22px;display:flex;flex-direction:column;gap:10px;background:var(--paper)">
      ${G_BAR}${G_PILERAIL}
    </div>
    <div style="flex:1;overflow:auto;padding:20px 22px">
      <div class="g1-grid">${gCells(12)}</div>
    </div>
    ${kStatusbar()}
    ${labSpec([['layout', 'ROUND 2 · faithful command bar + uncropped masonry grid'], ['search', 'inline in bar'], ['controls', 'all / bangers / recent / shuffle keep stable geometry'], ['density', 'high']])}
  </div>`;
};

/* ---- GRID-2 left-rail workbench ---- */
SPECS['GRID-2'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;display:grid;grid-template-columns:250px 1fr;min-height:0">
      <div style="border-right:var(--b);padding:16px;display:flex;flex-direction:column;gap:14px;background:var(--paper-warm);overflow:auto">
        <div style="display:flex;border:3px solid var(--ink);background:#fff"><span style="flex:1;padding:8px 10px;font-family:var(--mono);font-size:12px;opacity:.55">search…</span></div>
        <button class="k-btn sm primary" style="justify-content:flex-start">+ upload chaos</button>
        <button class="k-btn sm" style="justify-content:flex-start">♥ bangers · 47</button>
        <button class="k-btn sm yellow" style="justify-content:flex-start">⤨ shuffle the pile</button>
        <div class="k-eyebrow" style="margin-top:8px">piles</div>
        ${PILES.map(p => `<div style="display:flex;justify-content:space-between;border:2px solid var(--ink);background:#fff;padding:7px 10px;font-family:var(--mono);font-size:11px"><span>${esc(p.name)}</span><b>${p.n}</b></div>`).join('')}
        <div class="k-stat" style="margin-top:auto"><div class="k-stat-label">the pile</div><div class="k-stat-value">1,482</div></div>
      </div>
      <div style="overflow:auto;padding:20px">
        <div class="k-grid cols-4">${gCells(12)}</div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['layout', 'left rail: all controls + piles in a fixed sidebar'], ['search', 'top of rail'], ['tradeoff', 'costs 250px of grid; wins persistent pile nav'], ['density', 'high']])}
  </div>`;
};

/* ---- GRID-3 masonry pile + floating console ---- */
SPECS['GRID-3'] = (m) => {
  css('GRID-3', `.g3-mas { columns:4 210px; column-gap:16px; } .g3-mas .k-cellwrap { break-inside:avoid; margin-bottom:16px; }
  .g3-float { position:sticky; bottom:18px; z-index:10; max-width:680px; margin:0 auto; box-shadow:var(--shadow-lg); }`);
  const varied = MEMES.map((x, i) => `<div class="k-cellwrap"><div class="k-cell"><div class="head"><span>${esc(x.file)}</span><span>vec ${x.vec}</span></div>
    <div class="art" style="background:${x.bg};aspect-ratio:${[1, .8, 1.3, .9, 1.1, .75][i % 6]}">${doodle(x.kind)}</div>
    <div class="cap">${esc(x.cap)} ${x.banger ? '<span class="k-banger">banger</span>' : ''}</div></div></div>`).join('');
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;overflow:auto;padding:20px 22px 90px">
      <div class="g3-mas">${varied}</div>
      <div class="g3-float">${kConsole('float over the pile')}</div>
    </div>
    ${kStatusbar()}
    ${labSpec([['layout', 'masonry pile, console floats at bottom like a tool'], ['search', 'sticky floating console'], ['feel', 'the pile is the room; the console is in your hand'], ['density', 'very high, uneven = pile-like']])}
  </div>`;
};

/* ---- GRID-4 database table mode ---- */
SPECS['GRID-4'] = (m) => {
  css('GRID-4', `.g4 tr { border-bottom:2px solid var(--ink); } .g4 td, .g4 th { padding:8px 12px; text-align:left; font-size:12px; }
  .g4 th { font-family:var(--mono); font-size:10px; text-transform:uppercase; background:var(--void); color:#fff; }
  .g4 .thumb { width:52px; height:52px; border:2px solid var(--ink); }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="padding:10px 22px;border-bottom:3px solid var(--cyan)">${G_BAR}</div>
    <div style="flex:1;overflow:auto;padding:0 22px 20px">
      <table class="g4" style="width:100%;border-collapse:collapse;border:var(--b);background:#fff">
        <tr><th></th><th>caption</th><th>file</th><th>vec</th><th>pile</th><th>banger</th><th>saved</th></tr>
        ${MEMES.map((x, i) => `<tr>
          <td><div class="thumb" style="background:${x.bg}">${doodle(x.kind)}</div></td>
          <td style="font-weight:600">${esc(x.cap)}</td>
          <td style="font-family:var(--mono);font-size:11px">${esc(x.file)}</td>
          <td style="font-family:var(--mono);font-size:11px">${x.vec}</td>
          <td>${esc(PILES[i % 6].name)}</td>
          <td>${x.banger ? '<span class="k-banger" style="font-size:10px">yes</span>' : '<span class="k-note">no</span>'}</td>
          <td style="font-family:var(--mono);font-size:11px">2026-0${(i % 6) + 1}</td>
        </tr>`).join('')}
      </table>
    </div>
    ${kStatusbar()}
    ${labSpec([['layout', 'the database admits it: a real table view'], ['search', 'top bar'], ['use', 'power-user audit mode; pairs as a toggle with any grid'], ['density', 'maximum']])}
  </div>`;
};

/* ---- GRID-5 spatial pile canvas ---- */
SPECS['GRID-5'] = (m) => {
  css('GRID-5', `.g5-canvas { position:relative; flex:1; overflow:hidden; background:
    radial-gradient(circle at 22% 30%, rgba(0,229,212,.12), transparent 34%),
    radial-gradient(circle at 72% 60%, rgba(255,45,155,.10), transparent 30%),
    radial-gradient(circle at 55% 22%, rgba(255,230,0,.14), transparent 26%); }
  .g5-pilezone { position:absolute; border:3px dashed var(--ink); padding:8px; }
  .g5-pilezone .nm { position:absolute; top:-14px; left:10px; }`);
  const zone = (top, left, w, pile, items, tone) => `
    <div class="g5-pilezone" style="top:${top}%;left:${left}%;width:${w}px">
      <span class="k-sticker ${tone} nm" style="font-size:10px;padding:2px 8px">${esc(pile.name)} · ${pile.n}</span>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
        ${items.map(x => `<div style="border:2px solid var(--ink);background:${x.bg}">${doodle(x.kind)}</div>`).join('')}
      </div>
    </div>`;
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="padding:10px 22px;border-bottom:3px solid var(--cyan)">${G_BAR}</div>
    <div class="g5-canvas">
      ${zone(8, 4, 240, PILES[0], MEMES.slice(0, 6), 'cyan')}
      ${zone(14, 42, 200, PILES[1], MEMES.slice(6, 9), 'yellow')}
      ${zone(52, 18, 200, PILES[2], MEMES.slice(9, 12), 'magenta')}
      ${zone(46, 62, 240, PILES[3], MEMES.slice(2, 8), 'lime')}
      <span class="k-note" style="position:absolute;bottom:14px;left:22px">drag to wander. piles drift toward what they mean.</span>
    </div>
    ${kStatusbar()}
    ${labSpec([['layout', 'spatial canvas: piles as neighborhoods on a map'], ['search', 'top bar; results glow in place on the map'], ['risk', 'needs a list fallback (a11y + mobile)'], ['payoff', 'the only layout where "self-organizing piles" is literal']])}
  </div>`;
};

/* ---- GRID-6 full-bleed feed, overlay chrome ---- */
SPECS['GRID-6'] = (m) => {
  css('GRID-6', `.g6-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:4px; }
  .g6-grid .t { position:relative; aspect-ratio:1; border:2px solid var(--ink); overflow:hidden; }
  .g6-chrome { position:absolute; top:14px; left:50%; transform:translateX(-50%); z-index:10; display:flex; gap:10px; align-items:center; background:var(--paper); border:var(--b); box-shadow:var(--shadow-sm); padding:8px 12px; }`);
  m.innerHTML = `
  <div class="k-page" style="position:relative">
    <div class="g6-chrome">
      <span class="k-logo" style="font-size:16px">sploot</span>
      <div style="display:flex;border:3px solid var(--ink);background:#fff;width:320px"><span style="flex:1;padding:7px 10px;font-family:var(--mono);font-size:12px;opacity:.55">search…</span></div>
      <button class="k-btn sm primary">+</button><button class="k-btn sm">♥</button><button class="k-btn sm yellow">⤨</button>
    </div>
    <div style="flex:1;overflow:auto">
      <div class="g6-grid">
        ${MEMES.concat(MEMES.slice(0, 3)).map(x => `<div class="t" style="background:${x.bg}">${doodle(x.kind)}</div>`).join('')}
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['layout', 'edge-to-edge image wall; chrome floats as one compact island'], ['search', 'inside the island'], ['feel', 'the memes ARE the interface; closest to a camera roll'], ['tradeoff', 'captions/metadata move to hover + detail']])}
  </div>`;
};

/* ---- GRID-7 inspector split ---- */
SPECS['GRID-7'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="padding:10px 22px;border-bottom:3px solid var(--cyan)">${G_BAR}</div>
    <div style="flex:1;display:grid;grid-template-columns:1.6fr 1fr;min-height:0">
      <div style="overflow:auto;padding:18px;border-right:var(--b)">
        <div class="k-grid cols-3">${gCells(9, { state: (x, i) => i === 1 ? 'match' : '' })}</div>
      </div>
      <div style="overflow:auto;padding:18px;background:var(--paper-warm);display:flex;flex-direction:column;gap:12px">
        <span class="k-eyebrow">inspector</span>
        <div style="border:var(--b);background:#fff;box-shadow:var(--shadow-sm)">
          <div class="art" style="background:${MEMES[1].bg}">${doodle(MEMES[1].kind)}</div>
        </div>
        <div style="font-weight:700;font-size:15px">${esc(MEMES[1].cap)}</div>
        <div style="font-family:var(--mono);font-size:11px;line-height:1.8">file: ${MEMES[1].file}<br>vec: ${MEMES[1].vec} · 768-dim<br>pile: ${esc(PILES[1].name)}<br>saved: 2026-03-14</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="k-btn sm accent">♥ banger</button><button class="k-btn sm">share</button><button class="k-btn sm">similar</button><button class="k-btn sm" style="background:var(--orange);color:#fff">delete</button>
        </div>
        <div class="k-eyebrow" style="margin-top:6px">similar saves</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${MEMES.slice(5, 8).map(x => `<div style="border:2px solid var(--ink);background:${x.bg}">${doodle(x.kind)}</div>`).join('')}
        </div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['layout', 'grid + persistent right inspector (DESIGN.md §5 optional inspector, realized)'], ['search', 'top bar'], ['payoff', 'select-compare-act without leaving the pile'], ['density', 'high']])}
  </div>`;
};

/* ---- GRID-8 pile tabs ---- */
SPECS['GRID-8'] = (m) => {
  css('GRID-8', `.g8-tabs { display:flex; gap:0; align-items:flex-end; padding:12px 22px 0; overflow-x:auto; }
  .g8-tab { border:3px solid var(--ink); border-bottom:0; background:var(--paper-warm); font-family:var(--mono); font-size:11px; padding:7px 14px; white-space:nowrap; }
  .g8-tab.on { background:var(--yellow); font-weight:700; padding-bottom:11px; margin-bottom:-3px; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="padding:10px 22px 0;border-bottom:0">${G_BAR}</div>
    <div class="g8-tabs">
      <span class="g8-tab on">everything · 1,482</span>
      ${PILES.map(p => `<span class="g8-tab">${esc(p.name)} · ${p.n}</span>`).join('')}
    </div>
    <div style="flex:1;overflow:auto;padding:18px 22px;border-top:3px solid var(--ink)">
      <div class="k-grid cols-4">${gCells(8)}</div>
    </div>
    ${kStatusbar()}
    ${labSpec([['layout', 'piles as physical folder tabs across the top'], ['search', 'bar above tabs'], ['note', 'tabs = suggestion chrome, "everything" stays first + true total visible'], ['risk', 'tab row scrolls when piles multiply']])}
  </div>`;
};

/* ---- GRID-9 palette-first minimal ---- */
SPECS['GRID-9'] = (m) => {
  css('GRID-9', `.g9-palette { max-width:640px; margin:60px auto 20px; }
  .g9-hint { display:flex; gap:16px; justify-content:center; font-family:var(--mono); font-size:11px; }
  .g9-hint span b { border:2px solid var(--ink); padding:1px 6px; background:#fff; }`);
  m.innerHTML = `
  <div class="k-page">
    <div style="display:flex;justify-content:space-between;padding:14px 22px">
      <span class="k-logo">sploot</span><span class="k-note">1,482 in the pile</span>
    </div>
    <div class="g9-palette">${kConsole('type anything. the pile listens.', { meta: 'enter: search · tab: piles · ⌘k: commands' })}</div>
    <div class="g9-hint">
      <span><b>u</b> upload</span><span><b>s</b> shuffle</span><span><b>b</b> bangers</span><span><b>?</b> help</span>
    </div>
    <div style="flex:1;overflow:auto;padding:30px 22px 20px;opacity:.92">
      <div class="k-grid cols-6">
        ${MEMES.map(x => `<div style="border:2px solid var(--ink);background:${x.bg}">${doodle(x.kind)}</div>`).join('')}
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['layout', 'command-first: console is the whole header, keys do the rest'], ['search', 'the centerpiece, always focused'], ['audience', 'keyboard people; mobile falls back to dock'], ['density', 'grid recedes until asked']])}
  </div>`;
};

/* ---- GRID-10 bottom console terminal ---- */
SPECS['GRID-10'] = (m) => {
  css('GRID-10', `.g10-term { border-top:var(--b-thick); background:var(--void); color:#fff; padding:12px 18px; display:flex; flex-direction:column; gap:8px; }
  .g10-log { font-family:var(--mono); font-size:11px; color:#9aa; display:flex; gap:18px; flex-wrap:wrap; }
  .g10-in { display:flex; align-items:center; gap:10px; font-family:var(--mono); font-size:14px; }
  .g10-in .p { color:var(--lime); } .g10-in .c { width:9px; height:18px; background:var(--cyan); animation:blink 1s steps(1) infinite; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;overflow:auto;padding:18px 22px">
      <div class="k-grid cols-4">${gCells(8, { state: (x, i) => i === 0 ? 'match' : i < 4 ? 'near' : 'dim' })}</div>
    </div>
    <div class="g10-term">
      <div class="g10-log"><span>&gt; "cat losing it" · 4 hits · 212ms</span><span>&gt; shuffle · seed 8841</span><span>&gt; upload IMG_9917.jpg · embedded ok</span></div>
      <div class="g10-in"><span class="p">sploot&gt;</span><span>judging me</span><span class="c"></span></div>
    </div>
    ${kStatusbar()}
    ${labSpec([['layout', 'terminal at the bottom; grid above reacts like a display'], ['search', 'the prompt; history log shows the session'], ['feel', 'driving the database from a repl'], ['note', 'the history log is new product surface: past queries as first-class objects']])}
  </div>`;
};
