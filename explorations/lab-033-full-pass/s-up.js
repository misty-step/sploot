/* lab 033 · section UP — upload / intake flow.
   fixed: shipped tokens; real states (queued / embedding / done / failed).
   varies: the intake metaphor and where the queue lives. */
'use strict';

const UP_Q = [
  { f: 'IMG_4471.png', st: 'done', pct: 100 },
  { f: 'screenshot_2291.png', st: 'embedding', pct: 62 },
  { f: 'goblin_mode.gif', st: 'queued', pct: 0 },
  { f: 'corrupted_.jpg', st: 'failed', pct: 0 },
];
const UP_TONE = { done: 'var(--lime)', embedding: 'var(--yellow)', queued: 'var(--paper-warm)', failed: 'var(--orange)' };

/* ---- UP-1 baseline: dropzone panel ---- */
SPECS['UP-1'] = (m) => {
  css('UP-1', `
    .u1-scan { width:112px; height:78px; position:relative; overflow:hidden; border:2px solid var(--ink); background:#fff; }
    .u1-scan .meme-media { object-fit:contain; }
    .u1-scan::after { content:""; position:absolute; left:0; right:0; top:0; height:3px; background:var(--cyan); animation:u1scan 1.8s var(--ease) infinite alternate; }
    @keyframes u1scan { to { transform:translateY(73px); } }
    @media (max-width:700px) { .u1-row { align-items:flex-start !important; flex-wrap:wrap; } .u1-row > div { width:100% !important; } }
  `);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:760px;margin:0 auto;padding:36px 26px;width:100%;display:flex;flex-direction:column;gap:16px">
      <h2 class="k-h1" style="font-size:34px">upload chaos</h2>
      <div style="border:4px dashed var(--ink);background:var(--paper-warm);padding:56px 20px;text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center">
        <div class="u1-scan">${doodle('frog')}</div>
        <div style="font-family:var(--display);font-size:22px">drop memes here</div>
        <span class="k-note">scan begins after intake · png jpg webp gif · 10mb max</span>
        <button class="k-btn primary sm">browse files</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${UP_Q.map(q => `<div class="u1-row" style="display:flex;gap:12px;align-items:center;border:2px solid var(--ink);background:#fff;padding:8px 12px">
          <span style="font-family:var(--mono);font-size:12px;flex:1">${q.f}</span>
          <div style="width:160px;border:2px solid var(--ink);height:12px"><i style="display:block;height:100%;width:${q.pct}%;background:var(--blue)"></i></div>
          <span class="k-sticker" style="font-size:10px;padding:2px 8px;background:${UP_TONE[q.st]}">${q.st}</span>
          ${q.st === 'failed' ? '<button class="k-btn sm accent">retry</button>' : ''}
        </div>`).join('')}
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['intake', 'ROUND 2 · shipped dropzone with scan-state preview'], ['queue', 'quiet rows under the zone'], ['motion', 'scanner line communicates embedding work; reduced-motion safe']])}
  </div>`;
};

/* ---- UP-2 conveyor intake ---- */
SPECS['UP-2'] = (m) => {
  css('UP-2', `.u2-belt { border:var(--b-thick); background:var(--void); padding:22px 16px; display:flex; gap:16px; align-items:center; overflow:hidden; position:relative; }
  .u2-belt::after { content:""; position:absolute; left:0; right:0; bottom:8px; height:6px;
    background:repeating-linear-gradient(90deg,#333 0 26px, #555 26px 52px); }
  .u2-item { flex:none; width:120px; border:3px solid #fff; background:#fff; }
  .u2-stn { border:3px solid var(--ink); background:var(--yellow); font-family:var(--mono); font-size:10px; text-transform:uppercase; padding:6px 10px; flex:none; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:960px;margin:0 auto;padding:34px 26px;width:100%;display:flex;flex-direction:column;gap:18px">
      <h2 class="k-h1" style="font-size:34px">the intake line</h2>
      <div style="border:4px dashed var(--ink);background:var(--paper-warm);padding:26px;text-align:center;font-family:var(--mono);font-size:13px">drop files onto the belt ↓</div>
      <div class="u2-belt">
        <span class="u2-stn">① receive</span>
        <div class="u2-item">${doodle('sandwich', { bg: '#fff' })}<div style="font-family:var(--mono);font-size:9px;padding:3px 5px">IMG_9917.jpg</div></div>
        <span class="u2-stn">② resize</span>
        <div class="u2-item" style="border-color:var(--yellow)">${doodle('sheet', { bg: '#fff' })}<div style="font-family:var(--mono);font-size:9px;padding:3px 5px">…2291.png · 62%</div></div>
        <span class="u2-stn" style="background:var(--cyan)">③ embed</span>
        <div class="u2-item" style="border-color:var(--lime)">${doodle('cat', { bg: '#ffe600' })}<div style="font-family:var(--mono);font-size:9px;padding:3px 5px">vec ready ✓</div></div>
        <span class="u2-stn" style="background:var(--lime)">④ the pile</span>
      </div>
      <div style="display:flex;gap:12px;align-items:center">
        <span class="k-sticker" style="background:var(--orange);color:#fff">1 fell off the belt</span>
        <button class="k-btn sm accent">put it back (retry)</button>
        <span class="k-note" style="margin-left:auto">line speed: 2.1s per meme</span>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['intake', 'factory conveyor: files physically move through named stations'], ['queue', 'IS the belt'], ['payoff', 'embedding stops being invisible; failures "fall off the belt"'], ['motion', 'belt advances on state change only']])}
  </div>`;
};

/* ---- UP-3 flatbed scanner ---- */
SPECS['UP-3'] = (m) => {
  css('UP-3', `.u3-bed { border:var(--b-thick); background:#dfe8ea; position:relative; padding:18px; overflow:hidden; }
  .u3-bar { position:absolute; left:0; right:0; height:5px; background:var(--cyan); box-shadow:0 0 14px var(--cyan); top:46%; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:820px;margin:0 auto;padding:34px 26px;width:100%;display:flex;flex-direction:column;gap:16px">
      <h2 class="k-h1" style="font-size:34px">place face down</h2>
      <div class="u3-bed">
        <div style="max-width:300px;margin:0 auto;border:3px solid var(--ink);background:#fff">${doodle('frog', { bg: '#f3efe4' })}</div>
        <div class="u3-bar"></div>
      </div>
      <div style="display:flex;gap:14px;align-items:center;font-family:var(--mono);font-size:12px">
        <span style="border:3px solid var(--ink);background:var(--yellow);padding:6px 12px;font-weight:700">SCANNING… 62%</span>
        <span>reading: green · round eyes · existential fatigue</span>
      </div>
      <div style="border:var(--b);background:#fff;padding:12px;font-family:var(--mono);font-size:11px;line-height:1.9">
        <b>scan log</b><br>
        ✓ IMG_4471.png · indexed as "cat vibrating at maximum frequency"<br>
        ▓ frog_final_FINAL.png · reading the vibes…<br>
        ○ goblin_mode.gif · on the glass, waiting<br>
        ✗ corrupted_.jpg · smudged. <button class="k-btn sm accent" style="display:inline-flex">rescan</button>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['intake', 'flatbed scanner: one meme on the glass, a light bar reads it'], ['queue', 'scan log below'], ['payoff', 'the "reading:" line shows what embedding actually extracts'], ['note', 'the honest-machine gesture, played domestic']])}
  </div>`;
};

/* ---- UP-4 polaroid develop ---- */
SPECS['UP-4'] = (m) => {
  css('UP-4', `.u4-pol { background:#fff; border:2px solid #ccc; box-shadow:var(--shadow-sm); padding:10px 10px 34px; width:170px; position:relative; }
  .u4-pol .ph { border:1px solid #999; background:#222; }
  .u4-pol.developing .ph { filter:brightness(.45) sepia(.3); }
  .u4-pol .lbl { position:absolute; bottom:8px; left:0; right:0; text-align:center; font-family:"Caveat",cursive; font-size:16px; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:900px;margin:0 auto;padding:34px 26px;width:100%;display:flex;flex-direction:column;gap:18px">
      <h2 class="k-h1" style="font-size:34px">shake it like a…</h2>
      <div style="border:4px dashed var(--ink);background:var(--paper-warm);padding:22px;text-align:center;font-family:var(--mono);font-size:13px">drop files. each one develops into the pile.</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <div class="u4-pol"><div class="ph">${doodle('cat', { bg: '#ffe600' })}</div><span class="lbl">developed ✓</span></div>
        <div class="u4-pol developing"><div class="ph">${doodle('sheet', { bg: '#f3efe4' })}</div><span class="lbl">developing… 62%</span></div>
        <div class="u4-pol" style="transform:rotate(2deg)"><div class="ph" style="background:#333;display:grid;place-items:center;aspect-ratio:1;color:#888;font-family:var(--mono);font-size:10px">queued</div><span class="lbl">next up</span></div>
        <div class="u4-pol" style="transform:rotate(-2deg);border-color:var(--orange)"><div class="ph" style="background:#3a1a10;display:grid;place-items:center;aspect-ratio:1;color:var(--orange);font-family:var(--mono);font-size:10px">overexposed</div><span class="lbl" style="color:#c22">retry?</span></div>
      </div>
      <span class="k-note">"developing" = the embedding being computed. the picture literally comes into focus as the vector lands.</span>
    </div>
    ${kStatusbar()}
    ${labSpec([['intake', 'polaroids: uploads develop from dark to clear'], ['queue', 'the drying line'], ['payoff', 'embedding latency becomes charm instead of a spinner'], ['risk', 'polaroid frame is a softness exception; caveat handwriting imported']])}
  </div>`;
};

/* ---- UP-5 intake manifest form ---- */
SPECS['UP-5'] = (m) => {
  css('UP-5', `.u5-row { display:grid; grid-template-columns:44px 1fr 130px 120px; border-bottom:2px solid var(--ink); font-family:var(--mono); font-size:12px; }
  .u5-row > * { padding:9px 10px; border-right:2px solid var(--ink); } .u5-row > *:last-child { border-right:0; }
  .u5-row.hd { background:var(--void); color:#fff; font-size:10px; text-transform:uppercase; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:820px;margin:0 auto;padding:34px 26px;width:100%;display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <h2 class="k-h1" style="font-size:34px">cargo manifest</h2>
        <span class="k-note">shipment #2026-07-08-A</span>
      </div>
      <div style="border:4px dashed var(--ink);background:var(--paper-warm);padding:20px;text-align:center;font-family:var(--mono);font-size:13px">declare your goods (drop files)</div>
      <div style="border:var(--b);background:#fff">
        <div class="u5-row hd"><span>no.</span><span>item</span><span>condition</span><span>disposition</span></div>
        ${UP_Q.map((q, i) => `<div class="u5-row">
          <span>${String(i + 1).padStart(2, '0')}</span><span>${q.f}</span>
          <span style="background:${UP_TONE[q.st]}">${q.st}</span>
          <span>${q.st === 'failed' ? '<b style="color:#c22">inspect ↻</b>' : q.st === 'done' ? 'released to pile' : 'in customs'}</span>
        </div>`).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px">
        <span>declared value: sentimental only</span>
        <span class="k-sticker lime" style="font-size:10px">3 of 4 cleared</span>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['intake', 'shipping manifest: uploads are declared cargo'], ['queue', 'the manifest table'], ['voice', '"in customs" for embedding, "released to pile" for done'], ['density', 'high; best for bulk imports']])}
  </div>`;
};

/* ---- UP-6 bulk terminal log ---- */
SPECS['UP-6'] = (m) => {
  css('UP-6', `.u6 { background:var(--void); color:#dfe8e2; font-family:var(--mono); font-size:12px; line-height:1.8; padding:20px 24px; border:var(--b); }
  .u6 .ok { color:var(--lime); } .u6 .warn { color:var(--yellow); } .u6 .err { color:var(--orange); } .u6 .dim { color:#7a8a80; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:860px;margin:0 auto;padding:34px 26px;width:100%;display:flex;flex-direction:column;gap:14px">
      <h2 class="k-h1" style="font-size:34px">bulk import</h2>
      <div style="border:4px dashed var(--ink);background:var(--paper-warm);padding:18px;text-align:center;font-family:var(--mono);font-size:13px">drop a folder. yes, a folder. last one you will ever need.</div>
      <div class="u6">
        <div class="dim">$ sploot ingest ~/Downloads/memes-final</div>
        <div>found 214 images, 3 duplicates skipped</div>
        <div class="ok">[✓] IMG_4471.png · resized 2048px · embedded · 1.9s</div>
        <div class="ok">[✓] frog_final_FINAL.png · embedded · 2.1s</div>
        <div class="warn">[▓] screenshot_2291.png · embedding… 62%</div>
        <div class="dim">[○] goblin_mode.gif · queued (2 ahead)</div>
        <div class="err">[✗] corrupted_.jpg · not an image we can read · <u>retry</u> · <u>skip</u></div>
        <div class="dim">eta 6m 12s · rate limit friendly · you can close this tab, we keep going</div>
      </div>
      <div style="display:flex;gap:10px"><button class="k-btn primary sm">pause line</button><button class="k-btn sm accent">retry failed (1)</button></div>
    </div>
    ${kStatusbar()}
    ${labSpec([['intake', 'terminal ingest log for big migrations'], ['queue', 'the scrollback'], ['payoff', '"you can close this tab" is the promise that matters at 200+ files'], ['audience', 'the once-ever bulk import moment']])}
  </div>`;
};

/* ---- UP-7 feed the mascot ---- */
SPECS['UP-7'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;display:grid;place-items:center;padding:30px">
      <div style="text-align:center;display:flex;flex-direction:column;gap:18px;align-items:center;max-width:520px">
        <svg width="220" height="150" viewBox="0 0 120 80">
          <ellipse cx="60" cy="58" rx="44" ry="18" fill="#ffe600" stroke="#0a0a0a" stroke-width="4"/>
          <circle cx="60" cy="34" r="20" fill="#ffe600" stroke="#0a0a0a" stroke-width="4"/>
          <polygon points="44,22 47,8 56,20" fill="#ffe600" stroke="#0a0a0a" stroke-width="3.5"/>
          <polygon points="76,22 73,8 64,20" fill="#ffe600" stroke="#0a0a0a" stroke-width="3.5"/>
          <circle cx="53" cy="32" r="3.4" fill="#0a0a0a"/><circle cx="67" cy="32" r="3.4" fill="#0a0a0a"/>
          <ellipse cx="60" cy="44" rx="10" ry="7" fill="#0a0a0a"/>
        </svg>
        <h2 class="k-h1" style="font-size:38px">the pile is hungry</h2>
        <div style="border:4px dashed var(--ink);background:var(--paper-warm);padding:34px 40px;font-family:var(--mono);font-size:13px;width:100%">
          drop memes into the mouth zone
        </div>
        <div style="display:flex;gap:10px;align-items:center;font-family:var(--mono);font-size:11px">
          <span class="k-sticker lime" style="font-size:10px">fed today: 12</span>
          <span class="k-sticker yellow" style="font-size:10px">chewing: 1 (62%)</span>
          <span class="k-sticker" style="font-size:10px;background:var(--orange);color:#fff">spat out: 1 · retry</span>
        </div>
        <span class="k-note">chewing = embedding. it swallows when the vector lands.</span>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['intake', 'the mascot eats your files'], ['queue', 'fed / chewing / spat out stickers'], ['pairs with', 'BRAND-2 the sploot pose'], ['risk', 'cuteness ceiling; states must stay technically honest underneath']])}
  </div>`;
};

/* ---- UP-8 whole page is the target ---- */
SPECS['UP-8'] = (m) => {
  css('UP-8', `.u8-veil { position:absolute; inset:12px; border:6px dashed var(--blue); background:rgba(31,76,255,.08); display:grid; place-items:center; z-index:20; }`);
  m.innerHTML = `
  <div class="k-page" style="position:relative">
    ${kMast()}
    <div style="flex:1;overflow:auto;padding:18px 22px;filter:brightness(.92)">
      <div class="k-grid cols-4">${MEMES.slice(0, 8).map(x => kCell(x)).join('')}</div>
    </div>
    <div class="u8-veil">
      <div style="text-align:center;background:var(--paper);border:var(--b-thick);box-shadow:var(--shadow-lg);padding:30px 44px">
        <div style="font-family:var(--display);font-size:34px">drop it anywhere</div>
        <p style="font-family:var(--mono);font-size:12px;margin-top:8px">the whole app is the dropzone. it lands in the pile,<br>embeds in the background, appears in seconds.</p>
      </div>
    </div>
    ${kStatusbar([['index', '1,482 vec'], ['incoming', '4 files'], ['queue', 'embedding 1'], ['route', '/app'], ['status', 'receiving', true]])}
    ${labSpec([['intake', 'no upload page at all: drag onto ANY view'], ['queue', 'status bar cell + toast'], ['payoff', 'fewest possible steps; upload stops being a destination'], ['note', 'this is a flow decision more than a layout; composable with every GRID option']])}
  </div>`;
};

/* ---- UP-9 phone share-sheet first ---- */
SPECS['UP-9'] = (m) => {
  css('UP-9', `.u9-phone { width:330px; border:var(--b-thick); background:#fff; box-shadow:var(--shadow-lg); margin:0 auto; }
  .u9-sheet { border-top:var(--b); background:var(--paper); padding:14px; }
  .u9-app { display:flex; flex-direction:column; align-items:center; gap:6px; font-family:var(--mono); font-size:9px; }
  .u9-app .ic { width:48px; height:48px; border:3px solid var(--ink); display:grid; place-items:center; background:#fff; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:26px;max-width:1100px;margin:0 auto;padding:24px;width:100%">
      <div style="text-align:right;display:flex;flex-direction:column;gap:12px;align-items:flex-end">
        <h2 class="k-h1" style="font-size:44px">saving is<br>a share, <span class="hl-y">not a chore</span></h2>
        <p style="max-width:300px;font-size:14px">see a meme anywhere on your phone. share → sploot. done. it embeds while you keep scrolling.</p>
      </div>
      <div class="u9-phone">
        <div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:3px solid var(--ink);font-family:var(--mono);font-size:9px"><span>9:41</span><span>photos</span><span>▮▮▮</span></div>
        <div style="padding:10px">${doodle('judge', { bg: '#fff' })}</div>
        <div class="u9-sheet">
          <div class="k-eyebrow" style="margin-bottom:10px">share to</div>
          <div style="display:flex;gap:14px">
            <div class="u9-app"><div class="ic" style="background:var(--yellow);font-family:var(--display);font-size:20px">s</div><span><b>sploot</b></span></div>
            <div class="u9-app"><div class="ic" style="opacity:.4">✉</div><span style="opacity:.4">mail</span></div>
            <div class="u9-app"><div class="ic" style="opacity:.4">▤</div><span style="opacity:.4">notes</span></div>
          </div>
          <div style="margin-top:12px;border:3px solid var(--ink);background:var(--lime);font-family:var(--mono);font-size:11px;padding:8px 10px">✓ in the pile · embedding in background</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="k-stat yellow" style="max-width:220px"><div class="k-stat-label">taps to save</div><div class="k-stat-value">2</div></div>
        <div class="k-stat" style="max-width:220px"><div class="k-stat-label">also works from</div><div class="k-stat-value" style="font-size:18px">chrome ext ·<br>ios shortcut</div></div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['intake', 'the share sheet IS the upload UI'], ['queue', 'a single confirmation chip; trust the background'], ['truth', 'matches shipped capture surfaces (extension, ios shortcut, share-target)'], ['note', 'upload page demoted to fallback']])}
  </div>`;
};

/* ---- UP-10 boarding passes queue ---- */
SPECS['UP-10'] = (m) => {
  css('UP-10', `.u10-pass { display:flex; border:var(--b); background:#fff; box-shadow:var(--shadow-sm); max-width:640px; }
  .u10-pass .main { flex:1; padding:12px 14px; }
  .u10-pass .stub { width:130px; border-left:3px dashed var(--ink); padding:12px; font-family:var(--mono); font-size:10px; text-transform:uppercase; display:flex; flex-direction:column; gap:4px; }
  .u10-route { font-family:var(--display); font-size:19px; display:flex; gap:10px; align-items:center; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:760px;margin:0 auto;padding:34px 26px;width:100%;display:flex;flex-direction:column;gap:14px">
      <h2 class="k-h1" style="font-size:34px">now boarding: the pile</h2>
      <div style="border:4px dashed var(--ink);background:var(--paper-warm);padding:18px;text-align:center;font-family:var(--mono);font-size:13px">check in your files</div>
      ${UP_Q.map((q, i) => `<div class="u10-pass">
        <div class="main">
          <div class="u10-route">CAM ✈ PILE</div>
          <div style="font-family:var(--mono);font-size:11px;margin-top:4px">passenger: ${q.f}</div>
          <div style="margin-top:6px;width:100%;border:2px solid var(--ink);height:9px"><i style="display:block;height:100%;width:${q.pct}%;background:var(--blue)"></i></div>
        </div>
        <div class="stub" style="background:${UP_TONE[q.st]}">
          <span>seat ${String(i + 1).padStart(2, '0')}A</span>
          <b style="font-size:12px">${q.st === 'done' ? 'landed' : q.st === 'embedding' ? 'in flight' : q.st === 'queued' ? 'gate' : 'missed ↻'}</b>
          <span>group: chaos</span>
        </div>
      </div>`).join('')}
    </div>
    ${kStatusbar()}
    ${labSpec([['intake', 'each upload is a boarding pass with a tear-off status stub'], ['queue', 'the passes themselves'], ['pairs with', 'DNA-6 split-flap departures'], ['voice', '"in flight" = embedding, "landed" = searchable']])}
  </div>`;
};
