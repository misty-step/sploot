/* lab 033 · section COMP — component grammar.
   each option = one specimen sheet: search console, meme cell, buttons,
   label/sticker, stat, status strip, empty state — under one object metaphor. */
'use strict';

css('COMP-base', `
.cp { min-height:100dvh; display:flex; flex-direction:column; background:var(--paper); }
.cp-head { display:flex; justify-content:space-between; padding:14px 24px; border-bottom:var(--b); font-family:var(--mono); font-size:11px; text-transform:uppercase; }
.cp-grid { flex:1; display:grid; grid-template-columns:repeat(3, 1fr); gap:26px; padding:28px; max-width:1240px; margin:0 auto; width:100%; align-content:start; }
.cp-slot > .t { font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.12em; opacity:.55; margin-bottom:8px; }
.cp-slot.wide { grid-column: span 2; }
`);

function compSheet(m, name, slots, spec) {
  m.innerHTML = `
  <div class="cp">
    <div class="cp-head"><span>component grammar</span><span>${name}</span></div>
    <div class="cp-grid">
      <div class="cp-slot wide"><div class="t">search console</div>${slots.console}</div>
      <div class="cp-slot"><div class="t">meme cell</div>${slots.cell}</div>
      <div class="cp-slot"><div class="t">buttons</div><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">${slots.buttons}</div></div>
      <div class="cp-slot"><div class="t">labels + banger</div><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">${slots.labels}</div></div>
      <div class="cp-slot"><div class="t">stat block</div>${slots.stat}</div>
      <div class="cp-slot wide"><div class="t">status strip</div>${slots.status}</div>
      <div class="cp-slot"><div class="t">empty state</div>${slots.empty}</div>
    </div>
    ${labSpec(spec)}
  </div>`;
}

const CM = MEMES[0];

/* ---- COMP-1 baseline: shipped kit ---- */
SPECS['COMP-1'] = (m) => compSheet(m, 'shipped kit (baseline)', {
  console: kConsole(),
  cell: `<div style="max-width:230px">${kCell(CM, 'match', true)}</div>`,
  buttons: `<button class="k-btn primary">find it</button><button class="k-btn accent">retry (3)</button><button class="k-btn">shuffle</button><button class="k-btn sm">clear</button>`,
  labels: `<span class="k-sticker tilt-l">reaction faces</span><span class="k-sticker yellow">214 items</span><span class="k-banger">banger</span>`,
  stat: `<div class="k-stat magenta" style="max-width:200px"><div class="k-stat-label">bangers</div><div class="k-stat-value">47</div></div>`,
  status: kStatusbar(),
  empty: `<div style="border:var(--b);background:#fff;box-shadow:var(--shadow-sm);padding:18px;text-align:center">
    <div style="font-family:var(--display);font-size:18px">the pile is empty</div>
    <p style="font-size:12px;margin:8px 0 12px">zero memes. zero thoughts. upload some chaos.</p>
    <button class="k-btn primary sm">upload chaos</button></div>`,
}, [['grammar', 'BASELINE · ink borders, hard shadows, stamps'], ['object', 'the exposed database'], ['state', 'shipped in apps/web/components/sploot']]);

/* ---- COMP-2 cassette labels ---- */
SPECS['COMP-2'] = (m) => {
  css('COMP-2', `
  .c2-tape { border:3px solid var(--ink); background:linear-gradient(180deg,#fff 0 62%, var(--paper-warm) 62% 100%); padding:10px 12px; }
  .c2-tape .rule { border-bottom:2px solid var(--cyan); font-family:var(--mono); font-size:12px; padding:3px 0; }
  .c2-btn { border:3px solid var(--ink); background:#fff; font-family:var(--mono); font-size:12px; font-weight:700; text-transform:uppercase; padding:9px 14px; box-shadow:0 4px 0 var(--ink); }
  .c2-btn:active { transform:translateY(4px); box-shadow:none; }
  .c2-btn.rec { background:var(--magenta); color:#fff; } .c2-btn.play { background:var(--lime); }
  .c2-spine { display:flex; align-items:center; gap:10px; border:3px solid var(--ink); background:var(--yellow); font-family:var(--mono); font-size:11px; padding:6px 10px; }
  .c2-spine::before { content:"◉ ◉"; letter-spacing:8px; }`);
  compSheet(m, 'cassette labels', {
    console: `<div class="c2-tape"><div class="rule" style="font-weight:700">SIDE A · <span style="background:var(--yellow)">cat losing it</span></div>
      <div class="rule" style="opacity:.6">handwrite your query on the label line</div>
      <div style="display:flex;gap:10px;margin-top:10px"><button class="c2-btn play">⏵ play (search)</button><button class="c2-btn">⏸</button><button class="c2-btn rec">⏺ rec (save)</button></div></div>`,
    cell: `<div class="c2-tape" style="max-width:230px;padding:8px">
      <div style="border:2px solid var(--ink)">${doodle(CM.kind, { bg: '#ffe600' })}</div>
      <div class="rule" style="margin-top:8px">${esc(CM.cap)}</div>
      <div class="rule" style="opacity:.6">${CM.file} · 0:47</div></div>`,
    buttons: `<button class="c2-btn play">⏵ find</button><button class="c2-btn">⏭ shuffle</button><button class="c2-btn rec">⏺ save</button>`,
    labels: `<span class="c2-spine">mixtape: reaction faces</span><span class="c2-spine" style="background:var(--magenta);color:#fff">certified banger</span>`,
    stat: `<div class="c2-tape" style="max-width:200px"><div class="rule" style="font-weight:700">TOTAL RUNTIME</div><div style="font-family:var(--display);font-size:30px">1,482</div></div>`,
    status: `<div style="display:flex;gap:0;border:3px solid var(--ink);background:var(--void);color:#fff;font-family:var(--mono);font-size:11px"><span style="padding:8px 14px;border-right:2px solid #333">TAPE 01</span><span style="padding:8px 14px;border-right:2px solid #333">DOLBY OFF</span><span style="padding:8px 14px;border-right:2px solid #333">3 QUEUED</span><span style="padding:8px 14px;color:var(--lime)">● REC READY</span></div>`,
    empty: `<div class="c2-tape" style="text-align:center"><div style="font-family:var(--display);font-size:17px">blank tape</div><p style="font-size:12px;margin:6px 0 10px">nothing recorded yet. press rec.</p><button class="c2-btn rec">⏺ rec</button></div>`,
  }, [['grammar', 'cassette/mixtape'], ['object', 'every component is a labeled tape'], ['signature', 'transport controls as verbs: play=search, rec=save'], ['risk', 'nostalgia may age; ruled-label motif is the keeper']]);
};

/* ---- COMP-3 manila folder tabs ---- */
SPECS['COMP-3'] = (m) => {
  css('COMP-3', `
  .c3-folder { position:relative; border:3px solid var(--ink); background:#f0dfb2; padding:14px; margin-top:16px; }
  .c3-folder::before { content:attr(data-tab); position:absolute; top:-16px; left:12px; background:#f0dfb2; border:3px solid var(--ink); border-bottom:0; padding:2px 14px; font-family:var(--mono); font-size:10px; text-transform:uppercase; }
  .c3-clip { position:absolute; top:-10px; right:16px; width:14px; height:30px; border:3px solid #555; border-radius:7px 7px 0 0; border-bottom:0; }
  .c3-btn { border:3px solid var(--ink); background:#f0dfb2; font-family:var(--mono); font-size:12px; font-weight:700; text-transform:lowercase; padding:8px 16px; box-shadow:3px 3px 0 var(--ink); }`);
  compSheet(m, 'manila folder tabs (the irony is the point)', {
    console: `<div class="c3-folder" data-tab="query"><div style="display:flex;border:3px solid var(--ink);background:#fff">
      <span style="flex:1;padding:11px 13px;font-family:var(--mono);font-size:14px">cat losing it</span>
      <button style="border:0;border-left:3px solid var(--ink);background:var(--ink);color:#f0dfb2;font-family:var(--mono);padding:0 18px">file request</button></div>
      <div style="font-family:var(--mono);font-size:10px;margin-top:8px;opacity:.65">the only folder in this product is this drawing of one</div></div>`,
    cell: `<div class="c3-folder" data-tab="${CM.file}" style="max-width:230px"><span class="c3-clip"></span>
      <div style="border:2px solid var(--ink)">${doodle(CM.kind, { bg: '#fff' })}</div>
      <div style="font-size:12px;margin-top:8px;font-weight:500">${esc(CM.cap)}</div></div>`,
    buttons: `<button class="c3-btn">file it</button><button class="c3-btn" style="background:var(--yellow)">shuffle drawer</button><button class="c3-btn" style="background:var(--magenta);color:#fff">urgent</button>`,
    labels: `<span class="c3-folder" data-tab="pile" style="padding:6px 12px;font-family:var(--mono);font-size:11px;display:inline-block">reaction faces · 214</span>`,
    stat: `<div class="c3-folder" data-tab="count" style="max-width:200px"><div style="font-family:var(--display);font-size:30px">0</div><div style="font-family:var(--mono);font-size:10px;text-transform:uppercase">actual folders</div></div>`,
    status: `<div style="display:flex;border:3px solid var(--ink);background:#e5d5a5;font-family:var(--mono);font-size:11px"><span style="padding:8px 14px;border-right:3px solid var(--ink)">cabinet: full</span><span style="padding:8px 14px;border-right:3px solid var(--ink)">misfiled: 0</span><span style="padding:8px 14px">filing method: vibes</span></div>`,
    empty: `<div class="c3-folder" data-tab="empty" style="text-align:center"><p style="font-size:12px;margin-bottom:10px">this folder is empty, like all folders should be.</p><button class="c3-btn">add to the pile instead</button></div>`,
  }, [['grammar', 'manila office file'], ['object', 'folder-tab chrome for a no-folders product'], ['signature', 'the joke is structural: tabs everywhere, folders nowhere'], ['risk', 'irony must stay legible or it reads as folders']]);
};

/* ---- COMP-4 passport stamps ---- */
SPECS['COMP-4'] = (m) => {
  css('COMP-4', `
  .c4-page { border:3px solid var(--ink); background:#fdf9ee; background-image:radial-gradient(rgba(31,76,255,.06) 1.5px, transparent 1.5px); background-size:12px 12px; padding:14px; }
  .c4-stamp { display:inline-block; border:3px double #1f4cff; color:#1f4cff; font-family:var(--mono); font-size:10px; text-transform:uppercase; padding:6px 10px; transform:rotate(-5deg); }
  .c4-stamp.red { border-color:#c22; color:#c22; transform:rotate(3deg); }
  .c4-visa { border:3px solid var(--ink); background:#fff; padding:10px; }
  .c4-btn { border:3px solid var(--ink); background:#1f4cff; color:#fff; font-family:var(--mono); font-size:12px; font-weight:700; text-transform:uppercase; padding:9px 16px; }`);
  compSheet(m, 'passport stamps', {
    console: `<div class="c4-page"><div style="font-family:var(--mono);font-size:10px;text-transform:uppercase;opacity:.6;margin-bottom:8px">declaration: purpose of visit</div>
      <div style="display:flex;border:3px solid var(--ink);background:#fff"><span style="flex:1;padding:11px 13px;font-family:var(--mono);font-size:14px">looking for: the frog</span><button class="c4-btn" style="border:0;border-left:3px solid var(--ink)">grant entry</button></div>
      <div style="margin-top:10px"><span class="c4-stamp">admitted · 212ms</span></div></div>`,
    cell: `<div class="c4-visa" style="max-width:230px"><div style="border:2px solid var(--ink)">${doodle(CM.kind, { bg: '#fdf9ee' })}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px"><span style="font-size:12px;font-weight:500">${esc(CM.cap)}</span></div>
      <span class="c4-stamp red">banger · re-entry ∞</span></div>`,
    buttons: `<button class="c4-btn">stamp it</button><button class="c4-btn" style="background:#fff;color:var(--ink)">renew</button><button class="c4-btn" style="background:#c22">deport (delete)</button>`,
    labels: `<span class="c4-stamp">pile: animals mid-crime</span><span class="c4-stamp red">expedited</span>`,
    stat: `<div class="c4-page" style="max-width:200px"><div style="font-family:var(--display);font-size:30px">1,482</div><div style="font-family:var(--mono);font-size:10px;text-transform:uppercase">entries, zero visas denied</div></div>`,
    status: `<div style="display:flex;border:3px solid var(--ink);background:var(--void);color:#fff;font-family:var(--mono);font-size:11px"><span style="padding:8px 14px">border: open</span><span style="padding:8px 14px;border-left:2px solid #333">citizenship: yours</span><span style="padding:8px 14px;border-left:2px solid #333;color:var(--lime)">● control live</span></div>`,
    empty: `<div class="c4-page" style="text-align:center"><p style="font-size:12px;margin-bottom:10px">fresh passport. zero stamps. tragic.</p><button class="c4-btn">start traveling</button></div>`,
  }, [['grammar', 'passport/customs'], ['object', 'every state change is a stamp in a document'], ['signature', 'match/save/banger all become entry stamps'], ['risk', 'bureaucracy metaphor could read slow; stamps must feel fast']]);
};

/* ---- COMP-5 segment display ---- */
SPECS['COMP-5'] = (m) => {
  css('COMP-5', `
  .c5-panel { border:3px solid #1c1c1c; background:#141414; color:#eee; padding:14px; box-shadow:inset 0 0 0 2px #2c2c2c; }
  .c5-seg { font-family:"VT323",monospace; color:#ff4422; text-shadow:0 0 8px rgba(255,68,34,.7); background:#1a0c0a; border:2px solid #2c1a16; padding:4px 12px; font-size:26px; letter-spacing:.1em; }
  .c5-seg.grn { color:#39ff6a; text-shadow:0 0 8px rgba(57,255,106,.6); background:#0a1a0e; border-color:#16301c; }
  .c5-btn { border:3px solid #1c1c1c; background:#2a2a2a; color:#eee; font-family:var(--mono); font-size:11px; font-weight:700; text-transform:uppercase; padding:10px 16px; box-shadow:0 4px 0 #000; }
  .c5-btn:active { transform:translateY(4px); box-shadow:none; }
  .c5-btn.go { background:#39ff6a; color:#0a0a0a; }`);
  compSheet(m, 'segment display', {
    console: `<div class="c5-panel"><div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;color:#888;margin-bottom:8px">query register</div>
      <div style="display:flex;gap:10px;align-items:center"><span class="c5-seg grn" style="flex:1">CAT LOSING IT_</span><button class="c5-btn go">EXEC</button></div>
      <div style="display:flex;gap:10px;margin-top:10px"><span class="c5-seg" style="font-size:18px">HITS 04</span><span class="c5-seg" style="font-size:18px">212MS</span><span class="c5-seg grn" style="font-size:18px">LOCK</span></div></div>`,
    cell: `<div class="c5-panel" style="max-width:230px;padding:10px"><div style="border:2px solid #2c2c2c">${doodle(CM.kind, { bg: '#222', ink: '#eee', a: '#ff4422', b: '#39ff6a' })}</div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;align-items:center"><span style="font-family:var(--mono);font-size:10px;color:#aaa">${CM.file}</span><span class="c5-seg grn" style="font-size:15px;padding:2px 8px">0.94</span></div></div>`,
    buttons: `<button class="c5-btn go">EXEC</button><button class="c5-btn">SHFL</button><button class="c5-btn" style="background:#ff4422;color:#0a0a0a">DEL</button>`,
    labels: `<span class="c5-seg" style="font-size:16px;padding:3px 10px">PILE:REACTION</span><span class="c5-seg grn" style="font-size:16px;padding:3px 10px">BANGER</span>`,
    stat: `<div class="c5-panel" style="max-width:200px;text-align:center"><span class="c5-seg grn" style="font-size:34px">1482</span><div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;color:#888;margin-top:6px">items indexed</div></div>`,
    status: `<div style="display:flex;gap:0;border:3px solid #1c1c1c;background:#141414;font-family:var(--mono);font-size:10px;color:#aaa"><span style="padding:8px 14px;border-right:2px solid #2c2c2c">PWR ●</span><span style="padding:8px 14px;border-right:2px solid #2c2c2c">Q:03</span><span style="padding:8px 14px;border-right:2px solid #2c2c2c">SIGLIP-768</span><span style="padding:8px 14px;color:#39ff6a">SYS NOMINAL</span></div>`,
    empty: `<div class="c5-panel" style="text-align:center"><span class="c5-seg" style="font-size:20px">NO DATA</span><p style="font-family:var(--mono);font-size:10px;color:#888;margin:8px 0 10px">memory banks empty. feed me.</p><button class="c5-btn go">LOAD</button></div>`,
  }, [['grammar', 'led segment display'], ['object', 'readouts on a powered appliance'], ['signature', 'scores/counts in glowing 7-seg; verbs abbreviate to 4 chars'], ['risk', 'dark panels clash with paper substrate; would pull whole app dark']]);
};

/* ---- COMP-6 die-cut stickers ---- */
SPECS['COMP-6'] = (m) => {
  css('COMP-6', `
  .c6-die { border:3px solid var(--ink); outline:4px solid #fff; outline-offset:0; box-shadow:0 0 0 5px #fff, 6px 8px 0 rgba(10,10,10,.85); background:#fff; }
  .c6-btn { border:3px solid var(--ink); box-shadow:0 0 0 4px #fff, 5px 6px 0 rgba(10,10,10,.85); font-family:var(--mono); font-weight:700; font-size:12px; text-transform:lowercase; padding:9px 16px; background:var(--cyan); }
  .c6-btn:hover { transform:rotate(-1.5deg); }`);
  compSheet(m, 'die-cut stickers', {
    console: `<div class="c6-die" style="padding:12px;transform:rotate(-.6deg)">
      <div style="display:flex;border:3px solid var(--ink)"><span style="flex:1;padding:11px 13px;font-family:var(--mono);font-size:14px">little guy</span>
      <button style="border:0;border-left:3px solid var(--ink);background:var(--magenta);color:#fff;font-family:var(--mono);font-weight:700;padding:0 18px">peel</button></div>
      <div style="font-family:var(--mono);font-size:10px;margin-top:8px;opacity:.6">1,482 stickers on the roll</div></div>`,
    cell: `<div class="c6-die" style="max-width:220px;transform:rotate(1.2deg)">${doodle(CM.kind, { bg: '#ffe600' })}
      <div style="padding:8px;font-size:12px;font-weight:600;border-top:3px solid var(--ink)">${esc(CM.cap)}</div></div>`,
    buttons: `<button class="c6-btn">find</button><button class="c6-btn" style="background:var(--yellow)">shuffle</button><button class="c6-btn" style="background:var(--magenta);color:#fff">slap a banger</button>`,
    labels: `<span class="c6-die" style="display:inline-block;padding:5px 12px;font-family:var(--mono);font-size:11px;background:var(--lime);transform:rotate(-2deg)">reaction faces</span>
      <span class="c6-die" style="display:inline-block;padding:5px 12px;font-family:var(--mono);font-size:11px;background:var(--magenta);color:#fff;transform:rotate(2deg)">banger</span>`,
    stat: `<div class="c6-die" style="max-width:200px;padding:12px;transform:rotate(-1deg)"><div style="font-family:var(--display);font-size:30px">47</div><div style="font-family:var(--mono);font-size:10px;text-transform:uppercase">certified bangers</div></div>`,
    status: `<div class="c6-die" style="display:flex;font-family:var(--mono);font-size:11px;background:var(--void);color:#fff"><span style="padding:8px 14px;border-right:2px solid #333">roll: 1,482</span><span style="padding:8px 14px;border-right:2px solid #333">fresh: 12 today</span><span style="padding:8px 14px;color:var(--lime)">● sticky</span></div>`,
    empty: `<div class="c6-die" style="text-align:center;padding:16px"><div style="font-family:var(--display);font-size:17px">bare laptop lid</div><p style="font-size:12px;margin:6px 0 10px">no stickers yet. criminal.</p><button class="c6-btn">start the collection</button></div>`,
  }, [['grammar', 'die-cut sticker'], ['object', 'white keyline + cast shadow makes anything a sticker'], ['signature', 'everything sits at a slight rotation, like it was slapped on'], ['note', 'closest evolution of the shipped sticker/stamp language']]);
};

/* ---- COMP-7 blueprint schematic ---- */
SPECS['COMP-7'] = (m) => {
  css('COMP-7', `
  .c7 { background:#12327a !important; }
  .c7 .cp-head { border-color:#e8eefc; color:#e8eefc; }
  .c7 .cp-slot > .t { color:#9fb4e8; opacity:1; }
  .c7-box { border:2px solid #e8eefc; color:#e8eefc; background:transparent; position:relative; }
  .c7-box::after { content:""; position:absolute; inset:4px; border:1px dashed rgba(232,238,252,.4); pointer-events:none; }
  .c7-dim { font-family:var(--mono); font-size:9px; color:#9fb4e8; text-transform:uppercase; letter-spacing:.1em; }
  .c7-btn { border:2px solid #e8eefc; background:transparent; color:#e8eefc; font-family:var(--mono); font-size:11px; text-transform:uppercase; padding:9px 16px; }
  .c7-btn.fill { background:#e8eefc; color:#12327a; font-weight:700; }`);
  compSheet(m, 'blueprint schematic', {
    console: `<div class="c7-box" style="padding:14px"><div class="c7-dim" style="margin-bottom:8px">detail a · query intake · scale 1:1</div>
      <div style="display:flex;border:2px solid #e8eefc"><span style="flex:1;padding:11px 13px;font-family:var(--mono);font-size:14px;color:#e8eefc">moon with a face</span><button class="c7-btn fill" style="border:0;border-left:2px solid #e8eefc">resolve</button></div>
      <div class="c7-dim" style="margin-top:8px">← 768 dim → · tolerance ±0.06 cosine</div></div>`,
    cell: `<div class="c7-box" style="max-width:230px;padding:10px">${doodle(CM.kind, { bg: '#0d2760', ink: '#e8eefc', a: '#e8eefc', b: '#9fb4e8' })}
      <div class="c7-dim" style="margin-top:8px;display:flex;justify-content:space-between"><span>${CM.file}</span><span>vec ${CM.vec}</span></div></div>`,
    buttons: `<button class="c7-btn fill">resolve</button><button class="c7-btn">revise</button><button class="c7-btn" style="border-style:dashed">void</button>`,
    labels: `<span class="c7-box" style="display:inline-block;padding:4px 12px;font-family:var(--mono);font-size:10px;text-transform:uppercase">assembly: reaction faces</span>
      <span class="c7-box" style="display:inline-block;padding:4px 12px;font-family:var(--mono);font-size:10px;text-transform:uppercase;background:#e8eefc;color:#12327a">approved: banger</span>`,
    stat: `<div class="c7-box" style="max-width:200px;padding:12px"><div style="font-family:var(--display);font-size:30px;color:#e8eefc">1,482</div><div class="c7-dim">components on drawing</div></div>`,
    status: `<div class="c7-box" style="display:flex;font-family:var(--mono);font-size:10px;color:#9fb4e8"><span style="padding:8px 14px;border-right:1px dashed rgba(232,238,252,.4)">dwg no. SPL-033</span><span style="padding:8px 14px;border-right:1px dashed rgba(232,238,252,.4)">rev: daily</span><span style="padding:8px 14px;border-right:1px dashed rgba(232,238,252,.4)">drawn by: you</span><span style="padding:8px 14px;color:#e8eefc">checked by: nobody ✓</span></div>`,
    empty: `<div class="c7-box" style="text-align:center;padding:16px"><div class="c7-dim">sheet intentionally blank</div><p style="font-size:12px;color:#e8eefc;margin:8px 0 10px">no components drafted.</p><button class="c7-btn fill">draft one</button></div>`,
  }, [['grammar', 'blueprint schematic'], ['object', 'memes as drafted components with dims + rev blocks'], ['signature', 'dashed construction lines; deadpan title-block copy'], ['risk', 'blue field is a big palette departure; gorgeous for a "pro mode"']]);
  m.querySelector('.cp').classList.add('c7');
};

/* ---- COMP-8 ticket stubs ---- */
SPECS['COMP-8'] = (m) => {
  css('COMP-8', `
  .c8-tix { border:3px solid var(--ink); background:#fff; position:relative; display:flex; }
  .c8-tix .stub { border-right:3px dashed var(--ink); background:var(--yellow); padding:10px; display:grid; place-items:center; font-family:var(--display); writing-mode:vertical-rl; text-orientation:mixed; font-size:12px; }
  .c8-btn { border:3px solid var(--ink); background:var(--yellow); font-family:var(--display); font-size:12px; text-transform:uppercase; padding:10px 16px; box-shadow:var(--shadow-sm); }`);
  compSheet(m, 'ticket stubs', {
    console: `<div class="c8-tix"><span class="stub">admit one</span>
      <div style="flex:1;padding:12px"><div style="font-family:var(--mono);font-size:9px;text-transform:uppercase;opacity:.6;margin-bottom:6px">now showing: your pile</div>
      <div style="display:flex;border:3px solid var(--ink)"><span style="flex:1;padding:10px 12px;font-family:var(--mono);font-size:14px">this is fine</span><button style="border:0;border-left:3px solid var(--ink);background:var(--magenta);color:#fff;font-family:var(--display);padding:0 16px;font-size:12px;text-transform:uppercase">seat me</button></div></div></div>`,
    cell: `<div class="c8-tix" style="max-width:250px"><span class="stub">0.94</span>
      <div style="flex:1">${doodle(CM.kind, { bg: '#ffe600' })}<div style="padding:7px 9px;font-size:11px;font-weight:600;border-top:3px solid var(--ink)">${esc(CM.cap)}</div></div></div>`,
    buttons: `<button class="c8-btn">buy ticket</button><button class="c8-btn" style="background:#fff">matinee shuffle</button><button class="c8-btn" style="background:var(--magenta);color:#fff">encore</button>`,
    labels: `<span class="c8-tix" style="display:inline-flex"><span class="stub" style="font-size:9px;padding:4px">row</span><span style="padding:6px 12px;font-family:var(--mono);font-size:11px">reaction faces</span></span>
      <span class="k-banger">headliner</span>`,
    stat: `<div class="c8-tix" style="max-width:210px"><span class="stub">sold</span><div style="padding:10px;flex:1"><div style="font-family:var(--display);font-size:28px">1,482</div><div style="font-family:var(--mono);font-size:9px;text-transform:uppercase">tickets, one patron</div></div></div>`,
    status: `<div style="display:flex;border:3px solid var(--ink);background:var(--void);color:#fff;font-family:var(--mono);font-size:11px"><span style="padding:8px 14px;border-right:2px dashed #555">box office: open</span><span style="padding:8px 14px;border-right:2px dashed #555">tonight: shuffle at 8</span><span style="padding:8px 14px;color:var(--lime)">● house lights on</span></div>`,
    empty: `<div class="c8-tix"><span class="stub">psst</span><div style="padding:14px;text-align:center;flex:1"><p style="font-size:12px;margin-bottom:10px">empty theater. the show needs memes.</p><button class="c8-btn">book the first act</button></div></div>`,
  }, [['grammar', 'ticket stub'], ['object', 'perforated stub carries the number (score, count, row)'], ['signature', 'the dashed tear line; scores live on the stub'], ['note', 'gives every metric a natural home']]);
};

/* ---- COMP-9 hardware toolbox ---- */
SPECS['COMP-9'] = (m) => {
  css('COMP-9', `
  .c9-plate { border:3px solid #3a3a3a; background:linear-gradient(180deg,#e2e2e2,#c6c6c6); box-shadow:inset 0 1px 0 #fff, 3px 4px 0 rgba(0,0,0,.55); position:relative; }
  .c9-plate::before, .c9-plate::after { content:"+"; position:absolute; top:2px; font-size:10px; color:#666; }
  .c9-plate::before { left:6px; } .c9-plate::after { right:6px; }
  .c9-emboss { font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.14em; color:#444; text-shadow:0 1px 0 #fff; }
  .c9-btn { border:3px solid #3a3a3a; background:linear-gradient(180deg,#f2b705,#d99e00); font-family:var(--mono); font-weight:700; font-size:11px; text-transform:uppercase; padding:10px 16px; box-shadow:0 4px 0 #3a3a3a; }
  .c9-btn:active { transform:translateY(4px); box-shadow:none; }`);
  compSheet(m, 'hardware toolbox', {
    console: `<div class="c9-plate" style="padding:16px"><div class="c9-emboss" style="margin-bottom:8px">meme retrieval tool · model spl-1</div>
      <div style="display:flex;border:3px solid #3a3a3a;background:#fff"><span style="flex:1;padding:11px 13px;font-family:var(--mono);font-size:14px">pigeon plotting</span><button class="c9-btn" style="border:0;border-left:3px solid #3a3a3a;box-shadow:none">crank</button></div>
      <div class="c9-emboss" style="margin-top:8px">warranty: lifetime · yours</div></div>`,
    cell: `<div class="c9-plate" style="max-width:230px;padding:10px">${doodle(CM.kind, { bg: '#fff' })}
      <div class="c9-emboss" style="margin-top:8px;display:flex;justify-content:space-between"><span>part no. ${CM.vec}</span><span>fits: all chats</span></div></div>`,
    buttons: `<button class="c9-btn">crank</button><button class="c9-btn" style="background:linear-gradient(180deg,#e2e2e2,#c6c6c6)">rummage</button><button class="c9-btn" style="background:linear-gradient(180deg,#ff6b5a,#d94430);color:#fff">scrap</button>`,
    labels: `<span class="c9-plate" style="display:inline-block;padding:5px 12px"><span class="c9-emboss">drawer: reaction faces</span></span>
      <span class="c9-plate" style="display:inline-block;padding:5px 12px;background:linear-gradient(180deg,#ff8bc2,#e35a9d)"><span class="c9-emboss" style="color:#5a1038">banger — keep sharp</span></span>`,
    stat: `<div class="c9-plate" style="max-width:200px;padding:12px"><div style="font-family:var(--display);font-size:30px;color:#222">1,482</div><div class="c9-emboss">parts in the box</div></div>`,
    status: `<div class="c9-plate" style="display:flex"><span class="c9-emboss" style="padding:8px 14px;border-right:2px solid #aaa">bench: clear</span><span class="c9-emboss" style="padding:8px 14px;border-right:2px solid #aaa">3 parts on order</span><span class="c9-emboss" style="padding:8px 14px;color:#1a7a2e">machine oiled ●</span></div>`,
    empty: `<div class="c9-plate" style="text-align:center;padding:16px"><div class="c9-emboss">toolbox empty</div><p style="font-size:12px;margin:8px 0 10px;color:#333">a workbench with no tools is furniture.</p><button class="c9-btn">stock it</button></div>`,
  }, [['grammar', 'hardware toolbox'], ['object', 'brushed plates, embossed labels, screwheads'], ['signature', 'the search is a hand tool with a warranty plate'], ['risk', 'gradients tiptoe near banned decoration; embossing must stay functional']]);
};

/* ---- COMP-10 index cards ---- */
SPECS['COMP-10'] = (m) => {
  css('COMP-10', `
  .c10-card { background:#fffdf4; border:2px solid #c9bfa5; box-shadow:3px 4px 0 rgba(10,10,10,.25); padding:12px 14px; position:relative; }
  .c10-card::before { content:""; position:absolute; left:0; right:0; top:26px; height:2px; background:#d76a6a; }
  .c10-card .body { background:repeating-linear-gradient(180deg, transparent 0 19px, #b9cbe4 19px 20px); padding-top:32px; margin-top:-26px; font-family:var(--mono); font-size:12px; line-height:20px; }
  .c10-btn { border:2px solid var(--ink); background:#fffdf4; font-family:var(--mono); font-size:12px; font-weight:700; padding:8px 16px; box-shadow:2px 3px 0 rgba(10,10,10,.4); }`);
  compSheet(m, 'index cards', {
    console: `<div class="c10-card"><div style="font-family:var(--mono);font-size:11px;font-weight:700;text-transform:uppercase">query card</div>
      <div class="body">looking for: <b style="background:var(--yellow)">the spreadsheet one</b><br>known facts: it broke me · maybe 2024?</div>
      <button class="c10-btn" style="margin-top:10px;background:var(--cyan)">check the stack</button></div>`,
    cell: `<div class="c10-card" style="max-width:240px"><div style="font-family:var(--mono);font-size:11px;font-weight:700">${CM.file}</div>
      <div class="body" style="display:flex;gap:10px"><div style="width:90px;flex:none;border:2px solid #c9bfa5;background:#fff">${doodle(CM.kind, { bg: '#fff' })}</div><span>"${esc(CM.cap)}"<br>vec ${CM.vec}</span></div></div>`,
    buttons: `<button class="c10-btn" style="background:var(--cyan)">check stack</button><button class="c10-btn">riffle (shuffle)</button><button class="c10-btn" style="background:var(--magenta);color:#fff">flag</button>`,
    labels: `<span class="c10-card" style="display:inline-block;padding:4px 12px;font-family:var(--mono);font-size:11px">tab: reaction faces</span><span class="k-banger">banger</span>`,
    stat: `<div class="c10-card" style="max-width:200px"><div style="font-family:var(--display);font-size:30px">1,482</div><div style="font-family:var(--mono);font-size:10px;text-transform:uppercase">cards in the stack</div></div>`,
    status: `<div style="display:flex;border:2px solid #c9bfa5;background:#efe9d6;font-family:var(--mono);font-size:11px"><span style="padding:8px 14px;border-right:2px solid #c9bfa5">stack height: healthy</span><span style="padding:8px 14px;border-right:2px solid #c9bfa5">3 cards drying</span><span style="padding:8px 14px">system: none (correct)</span></div>`,
    empty: `<div class="c10-card" style="text-align:center"><p class="body" style="padding-top:32px">no cards. the stack awaits your worst saves.</p><button class="c10-btn" style="margin-top:10px;background:var(--cyan)">write the first card</button></div>`,
  }, [['grammar', 'index card'], ['object', 'ruled 3×5 cards, red top rule, blue body rules'], ['signature', 'metadata reads as handwritten research notes'], ['note', 'quietest option; softens the system without going pastel']]);
};
