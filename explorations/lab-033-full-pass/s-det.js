/* lab 033 · section DET — meme detail (one image).
   fixed: shipped tokens; real actions (banger / share / copy / delete).
   varies: how one image and its metadata are framed. */
'use strict';

const DM = MEMES[0]; // the cat
const DET_ACTIONS = `
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <button class="k-btn accent sm">♥ banger</button>
    <button class="k-btn primary sm">copy</button>
    <button class="k-btn sm">share</button>
    <button class="k-btn sm">similar</button>
    <button class="k-btn sm" style="background:var(--orange);color:#fff">delete</button>
  </div>`;
const DET_META = `file: ${DM.file}<br>saved: 2026-03-14<br>size: 1.2mb · 1080×1080<br>vec: ${DM.vec} · 768-dim · embedded<br>pile: ${esc(PILES[1].name)}`;

/* ---- DET-1 baseline: lightbox overlay ---- */
SPECS['DET-1'] = (m) => {
  m.innerHTML = `
  <div class="k-page" style="position:relative">
    ${kMast()}
    <div style="flex:1;overflow:hidden;padding:18px 22px;filter:brightness(.45)">
      <div class="k-grid cols-4">${MEMES.slice(0, 8).map(x => kCell(x)).join('')}</div>
    </div>
    <div style="position:absolute;inset:0;display:grid;place-items:center;background:rgba(10,10,10,.55)">
      <div style="position:absolute;top:70px;right:26px;display:flex;gap:8px">
        <button class="k-btn sm">♥</button><button class="k-btn sm">⇪</button><button class="k-btn sm" style="background:var(--orange);color:#fff">🗑</button><button class="k-btn sm">×</button>
      </div>
      <div style="max-width:420px;width:70%">
        <div style="background:${DM.bg};border:var(--b-thick)">${doodle(DM.kind)}</div>
        <div style="background:rgba(10,10,10,.85);color:#fff;font-family:var(--mono);font-size:11px;padding:10px 12px;margin-top:2px">${DM.file} · 1080×1080 · PNG</div>
      </div>
    </div>
    ${labSpec([['frame', 'BASELINE · modal lightbox over the grid (shipped)'], ['metadata', 'hover overlay only'], ['weakness', 'actions are anonymous icon ghosts; metadata hidden; no "similar saves"']])}
  </div>`;
};

/* ---- DET-2 museum placard ---- */
SPECS['DET-2'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;display:grid;place-items:center;padding:34px">
      <div style="display:flex;gap:34px;align-items:flex-end;max-width:900px">
        <div style="border:var(--b-thick);box-shadow:var(--shadow-lg);background:#fff;padding:18px">
          <div style="border:2px solid var(--ink);background:${DM.bg};width:380px">${doodle(DM.kind)}</div>
        </div>
        <div style="max-width:300px;display:flex;flex-direction:column;gap:14px">
          <div style="border:var(--b);background:#fff;box-shadow:var(--shadow-sm);padding:16px">
            <div class="k-eyebrow">no. ${DM.vec}</div>
            <div style="font-family:var(--display);font-size:20px;margin:8px 0 4px">${esc(DM.cap)}</div>
            <div style="font-style:italic;font-size:13px">mixed media (screenshot), 2026</div>
            <div style="font-family:var(--mono);font-size:10px;margin-top:10px;line-height:1.8;text-transform:uppercase">acquired mar 2026 · private collection<br>match rate: sees heavy rotation</div>
          </div>
          ${DET_ACTIONS}
        </div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['frame', 'gallery wall: framed image + placard'], ['lineage', 'soft-luxe specimen move, brutalist frame'], ['voice', 'placard treats a shitpost with full museum gravity; that IS the joke'], ['metadata', 'placard']])}
  </div>`;
};

/* ---- DET-3 case file ---- */
SPECS['DET-3'] = (m) => {
  css('DET-3', `.dt3-stamp { position:absolute; top:18px; right:22px; font-family:var(--display); font-size:20px; color:#c22; border:4px solid #c22; padding:4px 12px; transform:rotate(8deg); text-transform:uppercase; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;display:grid;place-items:center;padding:30px">
      <div style="border:var(--b-thick);background:#f0dfb2;box-shadow:var(--shadow-lg);max-width:760px;width:100%;padding:26px;position:relative">
        <span class="dt3-stamp">certified banger</span>
        <div class="k-eyebrow">case file · exhibit ${DM.vec}</div>
        <div style="display:grid;grid-template-columns:280px 1fr;gap:22px;margin-top:16px">
          <div style="border:3px solid var(--ink);background:${DM.bg}">${doodle(DM.kind)}</div>
          <div style="font-family:var(--mono);font-size:12px;line-height:2">
            <b>subject:</b> ${esc(DM.cap)}<br>
            <b>first seen:</b> the group chat, allegedly<br>
            <b>${'known aliases:'}</b> "the cat one", "you know the one"<br>
            <b>deployments:</b> 34 confirmed sends<br>
            <b>evidence:</b> ${DM.file} · 1080×1080<br>
            <b>vector:</b> ${DM.vec} · embedded, admissible
          </div>
        </div>
        <div style="margin-top:18px">${DET_ACTIONS}</div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['frame', 'dossier: the meme as evidence in a manila case file'], ['metadata', 'typed rap sheet ("known aliases" = your past queries that found it)'], ['payoff', 'usage history becomes lore'], ['pairs with', 'DNA-9 corkboard']])}
  </div>`;
};

/* ---- DET-4 trading card ---- */
SPECS['DET-4'] = (m) => {
  css('DET-4', `.dt4-card { width:340px; border:var(--b-thick); background:var(--yellow); box-shadow:var(--shadow-lg); padding:14px; }
  .dt4-statrow { display:flex; justify-content:space-between; font-family:var(--mono); font-size:11px; border-bottom:2px solid var(--ink); padding:5px 0; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;display:grid;place-items:center;padding:30px">
      <div style="display:flex;gap:30px;align-items:center;flex-wrap:wrap;justify-content:center">
        <div class="dt4-card">
          <div style="display:flex;justify-content:space-between;font-family:var(--display);font-size:15px"><span>${esc(DM.cap).slice(0, 22)}…</span><span>★ 94</span></div>
          <div style="border:3px solid var(--ink);background:${DM.bg};margin:10px 0">${doodle(DM.kind)}</div>
          <div class="dt4-statrow"><span>type</span><b>reaction / feral</b></div>
          <div class="dt4-statrow"><span>attack</span><b>ends any argument</b></div>
          <div class="dt4-statrow"><span>defense</span><b>cannot be explained to parents</b></div>
          <div class="dt4-statrow" style="border-bottom:0"><span>rarity</span><b>banger (holo)</b></div>
        </div>
        <div style="max-width:300px;display:flex;flex-direction:column;gap:14px">
          <div style="font-family:var(--mono);font-size:11px;line-height:1.9">${DET_META}</div>
          ${DET_ACTIONS}
        </div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['frame', 'the meme as a collectible card with stats'], ['metadata', 'split: fun stats on card, real stats beside'], ['payoff', 'bangers as a literal rare-card tier'], ['risk', 'stat copy needs a source or becomes lorem-with-jokes']])}
  </div>`;
};

/* ---- DET-5 proof sheet + crop marks ---- */
SPECS['DET-5'] = (m) => {
  css('DET-5', `.dt5-marks { position:relative; padding:26px; }
  .dt5-marks::before, .dt5-marks::after, .dt5-marks .in::before, .dt5-marks .in::after { content:""; position:absolute; width:22px; height:22px; border:0 solid var(--ink); }
  .dt5-marks::before { top:0; left:0; border-left-width:3px; border-top-width:3px; }
  .dt5-marks::after { top:0; right:0; border-right-width:3px; border-top-width:3px; }
  .dt5-marks .in::before { bottom:0; left:0; border-left-width:3px; border-bottom-width:3px; }
  .dt5-marks .in::after { bottom:0; right:0; border-right-width:3px; border-bottom-width:3px; }
  .dt5-bar { display:flex; height:16px; border:2px solid var(--ink); width:200px; }
  .dt5-bar i { flex:1; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;display:grid;grid-template-columns:1.4fr 1fr;gap:0;min-height:0">
      <div style="display:grid;place-items:center;background:var(--paper-warm);border-right:var(--b)">
        <div class="dt5-marks"><span class="in"></span>
          <div style="width:380px;background:${DM.bg};border:2px solid var(--ink)">${doodle(DM.kind)}</div>
        </div>
      </div>
      <div style="padding:26px;display:flex;flex-direction:column;gap:16px;overflow:auto">
        <span class="k-eyebrow">press proof · approved for group chat</span>
        <div style="font-family:var(--display);font-size:24px">${esc(DM.cap)}</div>
        <div class="dt5-bar">
          <i style="background:var(--cyan)"></i><i style="background:var(--magenta)"></i><i style="background:var(--yellow)"></i><i style="background:var(--ink)"></i>
          <i style="background:var(--blue)"></i><i style="background:var(--lime)"></i><i style="background:var(--orange)"></i><i style="background:#fff"></i>
        </div>
        <div style="font-family:var(--mono);font-size:11px;line-height:1.9">${DET_META}<br>proof no: 34 of ∞</div>
        ${DET_ACTIONS}
        <span class="k-note">crop marks + color bar: this file is print-ready for its destiny (being sent)</span>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['frame', 'prepress proof: crop marks, registration, color bar'], ['metadata', 'right rail spec block'], ['signature', 'the color bar IS the sploot palette; brand and function fuse'], ['density', 'medium']])}
  </div>`;
};

/* ---- DET-6 side inspector ---- */
SPECS['DET-6'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;display:grid;grid-template-columns:1fr 340px;min-height:0">
      <div style="display:grid;place-items:center;padding:26px">
        <div style="max-width:480px;width:100%;border:var(--b-thick);box-shadow:var(--shadow);background:${DM.bg}">${doodle(DM.kind)}</div>
      </div>
      <div style="border-left:var(--b);background:var(--paper-warm);padding:20px;display:flex;flex-direction:column;gap:14px;overflow:auto">
        <div style="font-weight:700;font-size:16px">${esc(DM.cap)}</div>
        <div style="font-family:var(--mono);font-size:11px;line-height:1.9;border:3px solid var(--ink);background:#fff;padding:10px">${DET_META}</div>
        ${DET_ACTIONS}
        <div class="k-eyebrow" style="margin-top:6px">tags</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span class="k-sticker" style="font-size:10px">#cat</span><span class="k-sticker yellow" style="font-size:10px">#unhinged</span><span class="k-sticker lime" style="font-size:10px">+ add</span>
        </div>
        <div class="k-eyebrow" style="margin-top:6px">similar saves</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${MEMES.slice(5, 11).map(x => `<div style="border:2px solid var(--ink);background:${x.bg}">${doodle(x.kind)}</div>`).join('')}
        </div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['frame', 'page (not modal): big image + full right inspector'], ['metadata', 'everything visible, nothing on hover'], ['payoff', 'similar saves + tags get real estate; deep-linkable'], ['tradeoff', 'loses grid context; needs back button']])}
  </div>`;
};

/* ---- DET-7 similar-saves vs screen ---- */
SPECS['DET-7'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;display:grid;place-items:center;padding:26px">
      <div style="max-width:980px;width:100%">
        <div style="text-align:center;margin-bottom:16px"><span class="k-sticker magenta tilt-l" style="font-size:14px">which one are you actually looking for?</span></div>
        <div style="display:grid;grid-template-columns:1fr 90px 1fr;gap:18px;align-items:center">
          <div class="k-cellwrap">${kCell(DM, 'match')}<span class="score">0.94</span></div>
          <div style="font-family:var(--display);font-size:44px;text-align:center">vs</div>
          <div class="k-cellwrap">${kCell(MEMES[5], 'near')}<span class="score" style="background:var(--yellow)">0.89</span></div>
        </div>
        <div style="display:flex;justify-content:center;gap:14px;margin-top:20px">
          <button class="k-btn primary">left one</button>
          <button class="k-btn">right one</button>
          <button class="k-btn yellow">neither, keep digging</button>
        </div>
        <p class="k-note" style="text-align:center;margin-top:12px">every pick teaches your pile what you meant. taste, recorded.</p>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['frame', 'head-to-head: the match vs its nearest neighbor'], ['metadata', 'scores only; focus is the choice'], ['payoff', 'disambiguation UI that doubles as taste training data'], ['when', 'shown when two results are within ~0.05']])}
  </div>`;
};

/* ---- DET-8 receipt ---- */
SPECS['DET-8'] = (m) => {
  css('DET-8', `.dt8 { width:340px; background:#fff; font-family:var(--mono); font-size:11px; padding:20px 18px; box-shadow:var(--shadow);
    -webkit-mask-image:linear-gradient(#000 0 calc(100% - 12px), transparent 100%), radial-gradient(circle at 8px calc(100% - 4px), transparent 8px, #000 8px);
    line-height:1.9; }
  .dt8 .rule { border-top:2px dashed var(--ink); margin:8px 0; }
  .dt8 .row { display:flex; justify-content:space-between; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;display:grid;place-items:center;padding:26px;background:var(--paper-warm)">
      <div style="display:flex;gap:30px;align-items:flex-start;flex-wrap:wrap;justify-content:center">
        <div style="max-width:380px;border:var(--b-thick);box-shadow:var(--shadow-lg);background:${DM.bg}">${doodle(DM.kind)}</div>
        <div class="dt8">
          <div style="text-align:center;font-weight:700">SPLOOT<br>your pile · aisle ∞</div>
          <div class="rule"></div>
          <div class="row"><span>item</span><span>${DM.file}</span></div>
          <div class="row"><span>desc</span><span style="text-align:right;max-width:170px">${esc(DM.cap)}</span></div>
          <div class="row"><span>saved</span><span>2026-03-14</span></div>
          <div class="row"><span>vec</span><span>${DM.vec} · 768d</span></div>
          <div class="row"><span>pile</span><span>${esc(PILES[1].name)}</span></div>
          <div class="row"><span>sends</span><span>34</span></div>
          <div class="rule"></div>
          <div class="row"><b>total joy</b><b>priceless</b></div>
          <div class="row"><span>you saved</span><span>4 min of scrolling</span></div>
          <div class="rule"></div>
          <div style="text-align:center">*** banger — no returns ***</div>
          <div style="text-align:center;font-size:22px;letter-spacing:2px;font-family:'Libre Barcode 39'">*${DM.vec}*</div>
        </div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['frame', 'metadata as a printed receipt beside the image'], ['metadata', 'the receipt IS the metadata panel'], ['voice', '"total joy: priceless" — one personality moment, rest is real data'], ['pairs with', 'DNA-10 konbini']])}
  </div>`;
};

/* ---- DET-9 full-bleed minimal ---- */
SPECS['DET-9'] = (m) => {
  m.innerHTML = `
  <div class="k-page" style="background:var(--void)">
    <div style="flex:1;display:grid;place-items:center;padding:0;position:relative">
      <div style="max-height:78vh;max-width:82vw;background:${DM.bg};border:2px solid #333">${doodle(DM.kind)}</div>
      <div style="position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:14px 20px;color:#fff;font-family:var(--mono);font-size:11px;background:linear-gradient(transparent, rgba(10,10,10,.92))">
        <span>${esc(DM.cap)} · ${DM.file}</span>
        <div style="display:flex;gap:8px">
          <button class="k-btn sm accent">♥</button><button class="k-btn sm primary">copy</button><button class="k-btn sm">⇪</button><button class="k-btn sm">×</button>
        </div>
      </div>
      <div style="position:absolute;top:50%;left:14px;color:#fff;font-family:var(--display);font-size:30px">‹</div>
      <div style="position:absolute;top:50%;right:14px;color:#fff;font-family:var(--display);font-size:30px">›</div>
    </div>
    ${labSpec([['frame', 'void mode: image alone on black, one thin action bar'], ['metadata', 'single line; everything else behind "i"'], ['payoff', 'the meme at maximum size; arrows flip through results'], ['density', 'minimum — the deliberate opposite of the system']])}
  </div>`;
};

/* ---- DET-10 editorial spread ---- */
SPECS['DET-10'] = (m) => {
  css('DET-10', `
    .d10-spread { flex:1; display:grid; grid-template-columns:minmax(0,1.15fr) minmax(340px,.85fr); min-height:0; }
    .d10-media { border-right:var(--b); display:grid; place-items:center; background:var(--paper-warm); padding:30px; min-height:0; }
    .d10-media .meme-media { width:100%; height:100%; max-height:68vh; object-fit:contain; }
    .d10-related { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .d10-related > div { border:2px solid var(--ink); background:var(--paper-warm); aspect-ratio:1; overflow:hidden; }
    @media (max-width:700px) {
      .d10-spread { display:block; overflow:auto; }
      .d10-media { border-right:0; border-bottom:var(--b); padding:14px; height:48vh; }
      .d10-copy { padding:22px 16px !important; }
    }
  `);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div class="d10-spread">
      <div class="d10-media">
        ${doodle(DM.kind)}
      </div>
      <div class="d10-copy" style="padding:40px;display:flex;flex-direction:column;gap:18px;overflow:auto">
        <span class="k-eyebrow">from the pile · no. ${DM.vec}</span>
        <div style="font-family:var(--display);font-size:44px;line-height:.92;text-transform:lowercase">${esc(DM.cap)}</div>
        <p style="font-size:15px;line-height:1.6;max-width:420px">saved in march. deployed 34 times. resolves arguments, announces moods, replaces entire paragraphs. a load-bearing meme.</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:420px">
          <div class="k-stat"><div class="k-stat-label">sends</div><div class="k-stat-value">34</div></div>
          <div class="k-stat yellow"><div class="k-stat-label">rank in pile</div><div class="k-stat-value">#3</div></div>
          <div class="k-stat magenta"><div class="k-stat-label">status</div><div class="k-stat-value" style="font-size:20px">banger</div></div>
        </div>
        ${DET_ACTIONS}
        <div>
          <div class="k-eyebrow" style="margin-bottom:8px">related memes</div>
          <div class="d10-related">${MEMES.slice(1, 4).map(x => `<div>${doodle(x.kind)}</div>`).join('')}</div>
        </div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['frame', 'ROUND 2 · dedicated editorial detail route'], ['media', 'complete image, object-fit contain, never cropped'], ['content', 'metadata + quiet actions + related memes'], ['responsive', 'spread stacks on mobile']])}
  </div>`;
};
