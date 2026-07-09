/* lab 033 · section SRCH — search result presentation.
   fixed: shipped tokens; scores are real product truth. varies: the reveal. */
'use strict';

const SQ = 'cat losing it';
const S_HDR = (extra = '') => `
  ${kMast()}
  <div style="padding:10px 22px;border-bottom:3px solid var(--cyan);display:flex;gap:12px;align-items:center;flex-wrap:wrap">
    <div style="flex:1;min-width:260px;display:flex;border:3px solid var(--ink);background:#fff">
      <span style="flex:1;padding:9px 12px;font-family:var(--mono);font-size:13px">${SQ}</span>
      <button style="border:0;border-left:3px solid var(--ink);background:var(--blue);color:#fff;font-family:var(--mono);font-size:11px;padding:0 14px">find it</button>
    </div>
    <span class="k-note">4 hits · 212ms · floor 0.20</span>${extra}
  </div>`;
const S_RANKED = MEMES.slice(0, 4);

/* ---- SRCH-1 baseline: dim + highlight in place ---- */
SPECS['SRCH-1'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${S_HDR()}
    <div style="flex:1;overflow:auto;padding:18px 22px">
      <div class="k-grid cols-4">
        ${MEMES.map((x, i) => kCell(x, i === 0 ? 'match' : i < 4 ? 'near' : 'dim', i < 4)).join('')}
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['reveal', 'ROUND 2 · grid stays put; matches ring, misses dim'], ['strength', 'zero layout shift, spatial memory preserved'], ['mutation', 'score + meaning sit below the media; nothing obscures the meme']])}
  </div>`;
};

/* ---- SRCH-2 ranked scoreboard ---- */
SPECS['SRCH-2'] = (m) => {
  css('SRCH-2', `.s2-row { display:grid; grid-template-columns:70px 110px 1fr auto; gap:16px; align-items:center; border:var(--b); background:#fff; box-shadow:var(--shadow-sm); padding:10px 14px; }
  .s2-rank { font-family:var(--display); font-size:38px; } .s2-bar { height:14px; border:2px solid var(--ink); background:#fff; } .s2-bar i { display:block; height:100%; background:var(--lime); }`);
  m.innerHTML = `
  <div class="k-page">
    ${S_HDR()}
    <div style="flex:1;overflow:auto;padding:18px 22px;display:flex;flex-direction:column;gap:14px;max-width:900px;margin:0 auto;width:100%">
      ${S_RANKED.map((x, i) => `<div class="s2-row">
        <span class="s2-rank">${i + 1}</span>
        <div style="border:2px solid var(--ink);background:${x.bg}">${doodle(x.kind)}</div>
        <div><div style="font-weight:700;font-size:15px">${esc(x.cap)}</div>
          <div class="s2-bar" style="margin-top:6px"><i style="width:${x.score}%"></i></div></div>
        <span class="k-sticker ${i === 0 ? 'lime' : 'yellow'}" style="font-size:13px">${(x.score / 100).toFixed(2)}</span>
      </div>`).join('')}
    </div>
    ${kStatusbar()}
    ${labSpec([['reveal', 'leaderboard rows, biggest number wins'], ['strength', 'rank + score are the interface; instantly legible'], ['weakness', 'loses the pile; images shrink to chips']])}
  </div>`;
};

/* ---- SRCH-3 podium top match ---- */
SPECS['SRCH-3'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${S_HDR()}
    <div style="flex:1;overflow:auto;padding:24px 22px;display:grid;grid-template-columns:1.3fr 1fr;gap:24px;max-width:1100px;margin:0 auto;width:100%">
      <div>
        <span class="k-sticker lime tilt-l">top match · 0.94</span>
        <div class="k-cellwrap" style="margin-top:12px">${kCell(S_RANKED[0], 'match')}</div>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="k-btn primary">copy it</button><button class="k-btn accent">♥ banger</button><button class="k-btn">share</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <span class="k-eyebrow">runners-up</span>
        ${S_RANKED.slice(1).map(x => `<div style="display:flex;gap:12px;border:var(--b);background:#fff;box-shadow:var(--shadow-sm);padding:8px;align-items:center">
          <div style="width:76px;flex:none;border:2px solid var(--ink);background:${x.bg}">${doodle(x.kind)}</div>
          <div style="flex:1;font-size:13px;font-weight:600">${esc(x.cap)}</div>
          <span class="k-sticker yellow" style="font-size:11px">${(x.score / 100).toFixed(2)}</span>
        </div>`).join('')}
        <span class="k-note">wrong one on top? click a runner-up to promote it. sploot remembers.</span>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['reveal', 'podium: one confident winner, compact runners'], ['strength', 'matches the real job (you want ONE meme, fast)'], ['bonus', 'promote-a-runner-up doubles as taste feedback']])}
  </div>`;
};

/* ---- SRCH-4 pipeline narration ---- */
SPECS['SRCH-4'] = (m) => {
  css('SRCH-4', `.s4-stage { border:3px solid var(--ink); background:var(--void); color:#fff; font-family:var(--mono); font-size:11px; padding:10px 12px; }
  .s4-stage b { color: var(--lime); display:block; font-size:10px; text-transform:uppercase; margin-bottom:5px; }
  .s4-arrow { font-family:var(--display); font-size:22px; align-self:center; }`);
  m.innerHTML = `
  <div class="k-page">
    ${S_HDR()}
    <div style="padding:16px 22px;display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr;gap:10px;max-width:1150px;margin:0 auto;width:100%">
      <div class="s4-stage"><b>1 · tokenize</b>"cat" "losing" "it"</div><span class="s4-arrow">→</span>
      <div class="s4-stage"><b>2 · embed</b>[0.031, −0.184, … ×768]</div><span class="s4-arrow">→</span>
      <div class="s4-stage"><b>3 · cosine scan</b>1,482 comparisons · 212ms</div><span class="s4-arrow">→</span>
      <div class="s4-stage" style="border-color:var(--lime)"><b>4 · return</b>4 hits ≥ 0.20 floor</div>
    </div>
    <div style="flex:1;overflow:auto;padding:6px 22px 20px">
      <div class="k-grid cols-4" style="max-width:1150px;margin:0 auto">
        ${S_RANKED.map((x, i) => kCell(x, i === 0 ? 'match' : 'near', true)).join('')}
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['reveal', 'the pipeline narrates each stage, then hands over results'], ['strength', 'the exposed-database brand promise, kept at the moment of use'], ['risk', 'stage strip must never slow the reveal; render post-hoc']])}
  </div>`;
};

/* ---- SRCH-5 radar lock ---- */
SPECS['SRCH-5'] = (m) => {
  css('SRCH-5', `.s5-scope { position:relative; aspect-ratio:1; max-height:52vh; margin:0 auto; border:var(--b-thick); background:#07120c; overflow:hidden; }
  .s5-scope .grid { position:absolute; inset:0; background:
    linear-gradient(rgba(62,240,160,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(62,240,160,.14) 1px, transparent 1px); background-size:11.11% 11.11%; }
  .s5-blip { position:absolute; width:60px; border:2px solid rgba(62,240,160,.6); }
  .s5-blip.lock { border:3px solid var(--lime); box-shadow:0 0 0 4px rgba(156,255,46,.35); width:84px; }
  .s5-tag { position:absolute; font-family:var(--mono); font-size:9px; color:#3ef0a0; text-transform:uppercase; }`);
  const blips = [[12, 16], [64, 22], [30, 68], [70, 66], [46, 40]];
  m.innerHTML = `
  <div class="k-page">
    ${S_HDR('<span class="k-sticker lime" style="font-size:10px">lock acquired</span>')}
    <div style="flex:1;overflow:auto;padding:18px 22px;display:grid;grid-template-columns:1.2fr 1fr;gap:22px;max-width:1100px;margin:0 auto;width:100%">
      <div class="s5-scope">
        <div class="grid"></div>
        ${blips.map(([x, y], i) => i === 4
          ? `<div class="s5-blip lock" style="left:${x}%;top:${y}%"><div style="background:${S_RANKED[0].bg}">${doodle(S_RANKED[0].kind)}</div></div><span class="s5-tag" style="left:${x}%;top:${y + 22}%">tgt · 0.94 · lock</span>`
          : `<div class="s5-blip" style="left:${x}%;top:${y}%"><div style="background:#0a1f14">${doodle(S_RANKED[(i % 3) + 1].kind, { bg: '#0a1f14', ink: '#3ef0a0', a: '#0f2f1e', b: '#0f2f1e' })}</div></div>`).join('')}
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <span class="k-eyebrow">telemetry</span>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="k-stat"><div class="k-stat-label">confidence</div><div class="k-stat-value">94%</div></div>
          <div class="k-stat yellow"><div class="k-stat-label">scan time</div><div class="k-stat-value">212<span style="font-size:16px">ms</span></div></div>
          <div class="k-stat"><div class="k-stat-label">contacts</div><div class="k-stat-value">4</div></div>
          <div class="k-stat blue"><div class="k-stat-label">vectors swept</div><div class="k-stat-value">1,482</div></div>
        </div>
        <div class="k-cellwrap">${kCell(S_RANKED[0], 'match')}</div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['reveal', 'radar scope: results are contacts, the match is a lock'], ['lineage', 'instrument-panel direction from the endorsed aesthetic library, folded into shipped tokens'], ['risk', 'theater; must resolve instantly under reduced-motion']])}
  </div>`;
};

/* ---- SRCH-6 single specimen ---- */
SPECS['SRCH-6'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${S_HDR()}
    <div style="flex:1;display:grid;place-items:center;padding:30px">
      <div style="text-align:center;display:flex;flex-direction:column;gap:16px;align-items:center">
        <span class="k-eyebrow">the pile offers one (1) meme</span>
        <div class="k-cellwrap" style="width:340px">${kCell(S_RANKED[0], 'match')}<span class="score">0.94</span></div>
        <div style="display:flex;gap:10px">
          <button class="k-btn primary">yes, that one</button>
          <button class="k-btn">no, next ↻</button>
        </div>
        <span class="k-note">"next" walks down the ranking one confident answer at a time</span>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['reveal', 'one answer at a time, yes/next'], ['lineage', 'soft-luxe "one specimen" move from the endorsed library, brutalist dress'], ['strength', 'zero scanning cost; pure confidence'], ['risk', 'slower when the model is wrong twice']])}
  </div>`;
};

/* ---- SRCH-7 query anatomy split ---- */
SPECS['SRCH-7'] = (m) => {
  css('SRCH-7', `.s7-word { border:3px solid var(--ink); background:var(--yellow); font-family:var(--mono); font-weight:700; padding:6px 12px; font-size:14px; }
  .s7-near { font-family:var(--mono); font-size:10px; border:2px solid var(--ink); background:#fff; padding:3px 8px; }`);
  m.innerHTML = `
  <div class="k-page">
    ${S_HDR()}
    <div style="flex:1;overflow:auto;display:grid;grid-template-columns:340px 1fr;min-height:0">
      <div style="border-right:var(--b);padding:18px;background:var(--paper-warm);display:flex;flex-direction:column;gap:14px">
        <span class="k-eyebrow">what the machine heard</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="s7-word">cat</span><span class="s7-word">losing</span><span class="s7-word">it</span></div>
        <div style="font-family:var(--mono);font-size:11px;line-height:2">
          "cat" ≈ <span class="s7-near">feline</span> <span class="s7-near">kitty</span><br>
          "losing it" ≈ <span class="s7-near">unhinged</span> <span class="s7-near">feral</span> <span class="s7-near">screaming</span>
        </div>
        <div style="border:3px solid var(--ink);background:#fff;padding:10px;font-family:var(--mono);font-size:11px">
          strongest signal:<br><b>motion blur + open mouth</b>
        </div>
        <span class="k-note">this panel is honest: it shows nearest-neighbor terms, not invented reasoning</span>
      </div>
      <div style="overflow:auto;padding:18px">
        <div class="k-grid cols-3">${S_RANKED.map((x, i) => kCell(x, i === 0 ? 'match' : 'near', true)).join('')}</div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['reveal', 'left: how the query was understood. right: what it found'], ['strength', 'teaches users to write better queries; debuggable search'], ['constraint', 'panel content must come from real neighbor data, never invented']])}
  </div>`;
};

/* ---- SRCH-8 filmstrip ---- */
SPECS['SRCH-8'] = (m) => {
  css('SRCH-8', `.s8-strip { display:flex; gap:0; overflow-x:auto; padding:26px 22px; background:var(--void); border-top:var(--b); border-bottom:var(--b); }
  .s8-frame { flex:none; width:270px; border:4px solid #fff; margin-right:18px; position:relative; background:#fff; }
  .s8-frame::before, .s8-frame::after { content:"▪▪▪▪▪▪▪▪▪▪▪▪"; letter-spacing:6px; color:#fff; font-size:8px; position:absolute; left:0; right:0; text-align:center; }
  .s8-frame::before { top:-16px; } .s8-frame::after { bottom:-16px; }`);
  m.innerHTML = `
  <div class="k-page">
    ${S_HDR()}
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
      <div class="s8-strip">
        ${S_RANKED.concat(MEMES.slice(4, 6)).map((x, i) => `<div class="s8-frame">
          ${kCell(x, i === 0 ? 'match' : '', i < 4)}
        </div>`).join('')}
      </div>
      <div style="text-align:center;padding:16px" class="k-note">← scrub the strip. best take first. →</div>
    </div>
    ${kStatusbar()}
    ${labSpec([['reveal', 'horizontal filmstrip, ranked left to right'], ['strength', 'large images, honest order, thumb-scrollable on mobile'], ['weakness', 'horizontal scroll on desktop is a taste risk']])}
  </div>`;
};

/* ---- SRCH-9 score buckets ---- */
SPECS['SRCH-9'] = (m) => {
  css('SRCH-9', `.s9-col { border:var(--b); background:#fff; display:flex; flex-direction:column; }
  .s9-col .hd { font-family:var(--display); font-size:15px; padding:9px 12px; border-bottom:3px solid var(--ink); text-transform:lowercase; }
  .s9-col .bd { padding:12px; display:flex; flex-direction:column; gap:12px; }`);
  m.innerHTML = `
  <div class="k-page">
    ${S_HDR()}
    <div style="flex:1;overflow:auto;padding:18px 22px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;max-width:1150px;margin:0 auto;width:100%">
      <div class="s9-col"><div class="hd" style="background:var(--lime)">goated (≥0.85)</div>
        <div class="bd">${S_RANKED.slice(0, 2).map(x => kCell(x, 'match')).join('')}</div></div>
      <div class="s9-col"><div class="hd" style="background:var(--yellow)">decent (0.5–0.85)</div>
        <div class="bd">${S_RANKED.slice(2, 4).map(x => kCell(x, 'near')).join('')}</div></div>
      <div class="s9-col"><div class="hd" style="background:var(--orange);color:#fff">a stretch (&lt;0.5)</div>
        <div class="bd">${MEMES.slice(9, 11).map(x => kCell(x, 'dim')).join('')}</div></div>
    </div>
    ${kStatusbar()}
    ${labSpec([['reveal', 'results triaged into named confidence buckets'], ['strength', 'converts opaque floats into product language ("goated")'], ['note', 'bucket labels are the voice doing real interface work']])}
  </div>`;
};

/* ---- SRCH-10 terminal output ---- */
SPECS['SRCH-10'] = (m) => {
  css('SRCH-10', `.s10 { background:var(--void); color:#dfe8e2; font-family:var(--mono); flex:1; overflow:auto; padding:22px 26px; font-size:13px; line-height:1.75; }
  .s10 .g { color:var(--lime); } .s10 .y { color:var(--yellow); } .s10 .d { color:#7a8a80; }
  .s10-hit { display:flex; gap:14px; align-items:center; margin:8px 0; }
  .s10-hit .th { width:72px; flex:none; border:2px solid #3a4a40; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div class="s10">
      <div><span class="g">sploot&gt;</span> find "${SQ}"</div>
      <div class="d">scanning 1,482 vectors · siglip-768 · floor 0.20</div>
      <div class="d">done in 212ms. 4 hits:</div>
      ${S_RANKED.map((x, i) => `<div class="s10-hit">
        <span class="y">[${i + 1}]</span>
        <div class="th" style="background:${x.bg}">${doodle(x.kind)}</div>
        <div><b>${(x.score / 100).toFixed(2)}</b> ${esc(x.cap)} <span class="d">· ${esc(x.file)}</span></div>
        <span class="d">↵ open · c copy · b banger</span>
      </div>`).join('')}
      <div style="margin-top:10px"><span class="g">sploot&gt;</span> <span style="border-right:9px solid var(--cyan)">&nbsp;</span></div>
    </div>
    ${kStatusbar()}
    ${labSpec([['reveal', 'search session as a terminal transcript with inline thumbnails'], ['lineage', 'terminal-TUI direction from the endorsed library, kept light'], ['strength', 'history is native; queries become a scrollback you can revisit'], ['risk', 'niche as the only mode; strong as an optional one']])}
  </div>`;
};
