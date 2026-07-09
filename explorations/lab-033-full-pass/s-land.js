/* lab 033 · section LAND — landing page macrostructures.
   fixed: shipped tokens + kit + voice + "show the mechanism".
   varies: page structure, what leads, where proof sits. */
'use strict';

const LAND_FOOT = kStatusbar([
  ['index', '8 demo vec'], ['scorer', 'token overlap'], ['mode', 'signed-out demo'],
  ['privacy', 'no feed / no ads'], ['status', 'live', true],
]);

/* ---- LAND-1 baseline: console hero (shipped) ---- */
SPECS['LAND-1'] = (m) => {
  css('LAND-1', `.l1-signin { color:var(--ink); padding:7px 10px; text-decoration:none; border:2px solid transparent; }
  .l1-signin:hover, .l1-signin:focus-visible { color:#fff !important; background:var(--blue); border-color:var(--ink); outline:0; }`);
  m.innerHTML = `
  <div class="k-page">
    <div style="position:fixed;top:0;right:0;padding:18px 22px;z-index:5;display:flex;gap:14px" class="k-eyebrow">
      <a href="#0" class="l1-signin">sign in</a>
    </div>
    <div style="max-width:900px;margin:0 auto;padding:90px 36px 60px;display:flex;flex-direction:column;gap:26px;width:100%">
      <span class="k-sticker tilt-l">it's a search box. for memes.</span>
      <h1 class="k-h1" style="font-size:96px">type words.<br>get the <span class="hl-y">picture.</span></h1>
      <p style="max-width:560px;font-size:17px;line-height:1.55">a private library for screenshots and reaction pics. type what is in the image, and sploot pulls the one you mean out of the pile. no folders, no tags.</p>
      ${kConsole('cat losing it', { meta: 'route: /demo' })}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
        <div class="k-stat magenta"><div class="k-stat-label">demo vectors</div><div class="k-stat-value">8</div></div>
        <div class="k-stat blue"><div class="k-stat-label">folders required</div><div class="k-stat-value">0</div></div>
        <div class="k-stat"><div class="k-stat-label">scorer mode</div><div class="k-stat-value">local</div></div>
      </div>
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        <button class="k-btn primary" style="padding:14px 26px">claim your library</button>
        <span class="k-note">no social feed / no ads / export stays yours</span>
      </div>
    </div>
    <div style="margin-top:auto">${LAND_FOOT}
    ${labSpec([['structure', 'ROUND 2 · console hero'], ['leads', 'headline, then real search mechanism'], ['proof', 'stat blocks + status bar'], ['mutation', 'readable sign-in states; no decorative fake-window section']])}</div>
  </div>`;
};

/* ---- LAND-2 pile / console / piles triptych ---- */
SPECS['LAND-2'] = (m) => {
  css('LAND-2', `
  .l2-mess { position:relative; min-height:380px; }
  .l2-mess .k-cellwrap { position:absolute; width:150px; }
  .l2-pile { border:var(--b); background:var(--paper-warm); padding:10px; }
  .l2-pile .nm { font-family:var(--mono); font-size:10px; text-transform:uppercase; display:flex; justify-content:space-between; margin-bottom:8px; }
  .l2-pile .th { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; }
  .l2-pile .th div { border:2px solid var(--ink); }`);
  const mess = [[0, 8, -7], [90, 0, 4], [30, 150, 9], [130, 170, -3], [60, 290, 2]];
  m.innerHTML = `
  <div class="k-page">
    ${kMast('<a href="#0">sign in</a>')}
    <div style="text-align:center;padding:34px 20px 10px">
      <h1 class="k-h1" style="font-size:64px">from <span style="color:var(--orange)">chaos</span> to <span class="hl-c">piles</span>,<br>via one text box</h1>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:22px;max-width:1240px;margin:0 auto;padding:20px 30px 40px;width:100%;align-items:center">
      <div>
        <div class="k-eyebrow" style="margin-bottom:10px">① your camera roll (before)</div>
        <div class="l2-mess">
          ${mess.map(([x, y, r], i) => `<div class="k-cellwrap" style="left:${y}px;top:${x}px;transform:rotate(${r}deg)">${kCell(MEMES[i + 5])}</div>`).join('')}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;position:relative;z-index:2">
        <div class="k-eyebrow" style="text-align:center">② you type words</div>
        ${kConsole('animals mid-crime')}
        <button class="k-btn primary" style="align-self:center;padding:14px 28px">claim your library</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="k-eyebrow">③ sploot sorts itself (after)</div>
        ${PILES.slice(0, 3).map((p, i) => `<div class="l2-pile">
          <div class="nm"><span>${esc(p.name)}</span><span>${p.n}</span></div>
          <div class="th">${MEMES.slice(i * 2, i * 2 + 3).map(x => `<div style="background:${x.bg}">${doodle(x.kind)}</div>`).join('')}</div>
        </div>`).join('')}
      </div>
    </div>
    <div style="margin-top:auto">${LAND_FOOT}
    ${labSpec([['structure', 'three-column triptych: mess → console → piles'], ['leads', 'the mechanism as a diagram'], ['proof', 'before/after is the argument'], ['note', 'DESIGN.md §5 names this the preferred landing structure; never shipped']])}</div>
  </div>`;
};

/* ---- LAND-3 demo is the page ---- */
SPECS['LAND-3'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    <div style="max-width:820px;margin:0 auto;padding:110px 30px 30px;width:100%;display:flex;flex-direction:column;gap:18px">
      <div style="font-family:var(--display);font-size:26px">sploot</div>
      ${kConsole('try: sad frog', { meta: 'this is the whole product. this demo: 8 sample memes.' })}
      <div class="k-note" style="text-align:center">↓ results appear here. that is the pitch. ↓</div>
    </div>
    <div style="max-width:1080px;margin:0 auto;padding:10px 30px 50px;width:100%">
      <div class="k-grid cols-4">
        ${MEMES.slice(0, 8).map((x, i) => kCell(x, i === 2 ? 'match' : i > 5 ? 'dim' : '', i === 2)).join('')}
      </div>
      <div style="display:flex;justify-content:center;gap:16px;padding-top:30px;align-items:center">
        <button class="k-btn primary" style="padding:14px 28px">make one for your pile</button>
        <span class="k-note">sign-up is the only page between you and this</span>
      </div>
    </div>
    <div style="margin-top:auto">${LAND_FOOT}
    ${labSpec([['structure', 'zero-copy: the live demo IS the landing'], ['leads', 'the working search box'], ['proof', 'you just used it'], ['risk', 'no narrative for people who need one; ballsy']])}</div>
  </div>`;
};

/* ---- LAND-4 comic strip mechanic ---- */
SPECS['LAND-4'] = (m) => {
  css('LAND-4', `
  .l4-panel { border:var(--b-thick); background:#fff; box-shadow:var(--shadow); padding:14px; display:flex; flex-direction:column; gap:10px; }
  .l4-panel .n { font-family:var(--display); font-size:15px; }
  .l4-bubble { font-family:var(--sans); font-weight:600; font-size:13px; border:3px solid var(--ink); background:#fff; padding:6px 10px; display:inline-block; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast('<a href="#0">sign in</a>')}
    <div style="max-width:1150px;margin:0 auto;padding:44px 30px;width:100%;display:flex;flex-direction:column;gap:26px">
      <h1 class="k-h1" style="font-size:58px">how it works, <span class="hl-y">in four panels</span></h1>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px">
        <div class="l4-panel"><span class="n">1.</span>
          <div style="background:var(--paper-warm);border:3px solid var(--ink)">${doodle('sheet', { bg: '#e9e4d6' })}</div>
          <span class="l4-bubble">you save 1,482 memes with zero organizational system</span></div>
        <div class="l4-panel"><span class="n">2.</span>
          <div style="border:3px solid var(--ink);background:var(--yellow);display:grid;place-items:center;aspect-ratio:1;font-family:var(--mono);font-weight:700;font-size:15px;padding:10px;text-align:center">"the cat<br>losing it"</div>
          <span class="l4-bubble">months later you need ONE of them</span></div>
        <div class="l4-panel"><span class="n">3.</span>
          <div style="border:3px solid var(--ink);background:var(--void);color:var(--lime);aspect-ratio:1;display:grid;place-items:center;font-family:var(--mono);font-size:11px;padding:10px;text-align:center">tokenize →<br>embed →<br>cosine →<br>0.94</div>
          <span class="l4-bubble">the machine does math about vibes</span></div>
        <div class="l4-panel"><span class="n">4.</span>
          <div class="k-cellwrap"><div class="k-cell match"><div class="art" style="background:#ffe600">${doodle('cat')}</div></div><span class="score">0.94</span></div>
          <span class="l4-bubble">the exact cat. every time.</span></div>
      </div>
      <div style="display:flex;gap:18px;align-items:center">
        <button class="k-btn primary" style="padding:14px 26px">start your own strip</button>
        <span class="k-note">panel 5 is you, sending it in the group chat</span>
      </div>
    </div>
    <div style="margin-top:auto">${LAND_FOOT}
    ${labSpec([['structure', 'four-panel comic strip'], ['leads', 'narrative of the mechanic'], ['proof', 'panel 3 shows the actual pipeline'], ['note', 'humor carries; mechanism still explicit']])}</div>
  </div>`;
};

/* ---- LAND-5 spec-sheet manifest ---- */
SPECS['LAND-5'] = (m) => {
  css('LAND-5', `
  .l5-row { display:grid; grid-template-columns:220px 1fr; border-bottom:3px solid var(--ink); }
  .l5-row .k { font-family:var(--mono); font-size:11px; text-transform:uppercase; padding:14px 16px; background:var(--paper-warm); border-right:3px solid var(--ink); }
  .l5-row .v { padding:14px 16px; font-size:15px; font-weight:500; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast('<a href="#0">sign in</a>')}
    <div style="max-width:860px;margin:0 auto;padding:50px 30px;width:100%;display:flex;flex-direction:column;gap:24px">
      <span class="k-sticker yellow tilt-r">technical data sheet · rev 2026-07</span>
      <h1 class="k-h1" style="font-size:66px">sploot, <span class="hl-c">as specified</span></h1>
      <div style="border:var(--b-thick);background:#fff;box-shadow:var(--shadow)">
        <div class="l5-row"><span class="k">product class</span><span class="v">personal meme retrieval appliance</span></div>
        <div class="l5-row"><span class="k">input</span><span class="v">plain words. whatever you remember about the picture.</span></div>
        <div class="l5-row"><span class="k">output</span><span class="v">the picture. usually the exact one.</span></div>
        <div class="l5-row"><span class="k">search method</span><span class="v">semantic embeddings (siglip, 768-dim) + cosine distance</span></div>
        <div class="l5-row"><span class="k">folders required</span><span class="v">0 (zero)</span></div>
        <div class="l5-row"><span class="k">median retrieval</span><span class="v">212 ms</span></div>
        <div class="l5-row"><span class="k">audience</span><span class="v">the person whose camera roll it is. nobody else.</span></div>
        <div class="l5-row" style="border-bottom:0"><span class="k">social features</span><span class="v">none. absolutely not. never.</span></div>
      </div>
      ${kConsole('verify claim: "the exact one"')}
      <button class="k-btn primary" style="align-self:flex-start;padding:14px 26px">order unit (free)</button>
    </div>
    <div style="margin-top:auto">${LAND_FOOT}
    ${labSpec([['structure', 'spec-sheet table as hero'], ['leads', 'deadpan technical manifest'], ['proof', 'claims stated as ratings, console to verify'], ['note', 'maximum swiss-chrome, maximum deadpan']])}</div>
  </div>`;
};

/* ---- LAND-6 chaos / order split ---- */
SPECS['LAND-6'] = (m) => {
  css('LAND-6', `
  .l6 { display:grid; grid-template-columns:1fr 1fr; flex:1; min-height:0; position:relative; }
  .l6-left { background:var(--paper-warm); position:relative; overflow:hidden; border-right:var(--b-thick); }
  .l6-right { padding:26px; display:grid; grid-template-columns:repeat(2,1fr); gap:16px; align-content:start; }
  .l6-bridge { position:absolute; left:50%; top:44%; transform:translate(-50%,-50%); width:min(560px,60%); z-index:6; }`);
  const scatter = [[6, 4, -9], [34, 46, 7], [58, 12, -4], [12, 58, 12], [66, 58, -12], [38, 78, 3]];
  m.innerHTML = `
  <div class="k-page" style="position:relative">
    ${kMast('<a href="#0">sign in</a>')}
    <div style="text-align:center;padding:22px 20px 8px">
      <h1 class="k-h1" style="font-size:54px">your pile, <span style="color:var(--orange)">before</span> and <span class="hl-c">after</span></h1>
    </div>
    <div class="l6">
      <div class="l6-left">
        ${scatter.map(([t, l, r], i) => `<div style="position:absolute;top:${t}%;left:${l}%;width:150px;transform:rotate(${r}deg)">${kCell(MEMES[i])}</div>`).join('')}
        <span class="k-sticker magenta tilt-l" style="position:absolute;bottom:18px;left:18px">camera roll (feral)</span>
      </div>
      <div class="l6-right">
        ${MEMES.slice(0, 6).map((x, i) => kCell(x, i === 0 ? 'match' : '')).join('')}
        <span class="k-sticker lime tilt-r" style="position:absolute;bottom:18px;right:18px">sploot (domesticated)</span>
      </div>
      <div class="l6-bridge">${kConsole('type words here')}</div>
    </div>
    <div style="margin-top:auto">${LAND_FOOT}
    ${labSpec([['structure', 'vertical split: chaos left, order right, console bridges'], ['leads', 'the transformation'], ['proof', 'same memes both sides'], ['note', 'the search box literally sits ON the boundary']])}</div>
  </div>`;
};

/* ---- LAND-7 query ticker wall ---- */
SPECS['LAND-7'] = (m) => {
  css('LAND-7', `
  .l7-row { display:flex; gap:12px; white-space:nowrap; overflow:hidden; padding:7px 0; border-bottom:2px solid var(--ink); }
  .l7-row span { font-family:var(--mono); font-size:14px; border:2px solid var(--ink); background:#fff; padding:4px 12px; animation:l7 30s linear infinite; display:inline-block; }
  .l7-row.r2 span { animation-duration:38s; background:var(--paper-warm); }
  .l7-row.r3 span { animation-duration:24s; }
  @keyframes l7 { from{transform:translateX(0)} to{transform:translateX(-1400px)} }
  @media (prefers-reduced-motion:reduce){ .l7-row span{animation:none} }`);
  const qs = ['cat losing it', 'sad frog', 'this is fine', 'judging you', 'little guy', 'the spreadsheet one', 'pigeon scheming', 'moon face', 'cursed sandwich', 'screaming (affectionate)', 'group chat left me on read', 'goblin mode', 'zero thoughts'];
  const row = (arr) => arr.concat(arr).map(q => `<span>"${q}"</span>`).join('');
  m.innerHTML = `
  <div class="k-page">
    ${kMast('<a href="#0">sign in</a>')}
    <div>
      <div class="l7-row">${row(qs.slice(0, 5))}</div>
      <div class="l7-row r2">${row(qs.slice(5, 9))}</div>
      <div class="l7-row r3">${row(qs.slice(9))}</div>
    </div>
    <div style="max-width:840px;margin:0 auto;padding:48px 30px;width:100%;display:flex;flex-direction:column;gap:22px;text-align:center">
      <h1 class="k-h1" style="font-size:70px">everything above<br>is a <span class="hl-y">real way</span> to find a meme</h1>
      <p style="font-size:16px;max-width:520px;margin:0 auto">not filenames. not folders. not the date you saved it. just whatever half-memory you have. sploot does the rest.</p>
      ${kConsole('your half-memory here')}
      <button class="k-btn primary" style="align-self:center;padding:14px 28px">claim your library</button>
    </div>
    <div style="margin-top:auto">${LAND_FOOT}
    ${labSpec([['structure', 'query ticker wall over centered console'], ['leads', 'the vocabulary of search itself'], ['proof', 'each ticker item is a plausible query'], ['motion', 'the one ambient exception, argued: the queries ARE the content']])}</div>
  </div>`;
};

/* ---- LAND-8 deadpan faq hero ---- */
SPECS['LAND-8'] = (m) => {
  css('LAND-8', `
  .l8-qa { border-bottom:3px solid var(--ink); padding:18px 0; display:grid; grid-template-columns:1fr 1.4fr; gap:20px; }
  .l8-qa .q { font-family:var(--display); font-size:24px; text-transform:lowercase; line-height:1.05; }
  .l8-qa .a { font-size:16px; line-height:1.5; align-self:center; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast('<a href="#0">sign in</a>')}
    <div style="max-width:880px;margin:0 auto;padding:52px 30px;width:100%;display:flex;flex-direction:column;gap:8px">
      <h1 class="k-h1" style="font-size:60px;margin-bottom:18px">frequently asked,<br><span class="hl-c">flatly answered</span></h1>
      <div class="l8-qa"><span class="q">what is sploot?</span><span class="a">a search box. for memes.</span></div>
      <div class="l8-qa"><span class="q">how do i organize my memes?</span><span class="a">you don't. that is the entire point. no folders. just vibes.</span></div>
      <div class="l8-qa"><span class="q">how do i find one?</span><span class="a">type what is in it. "cat losing it" finds the cat losing it.</span></div>
      <div class="l8-qa"><span class="q">who can see my pile?</span><span class="a">you. that is the list.</span></div>
      <div class="l8-qa"><span class="q">is it ai?</span><span class="a">it is a database that took one art class. semantic embeddings, cosine distance, 212 ms.</span></div>
      <div class="l8-qa" style="border-bottom:0"><span class="q">can i try it right now?</span><span class="a" style="display:flex;flex-direction:column;gap:12px">${kConsole('yes. type here.')}<button class="k-btn primary" style="align-self:flex-start">claim your library</button></span></div>
    </div>
    <div style="margin-top:auto">${LAND_FOOT}
    ${labSpec([['structure', 'the FAQ is the hero'], ['leads', 'voice; the deadpan does all selling'], ['proof', 'last answer is the live console'], ['note', 'cheapest to build of the ten']])}</div>
  </div>`;
};

/* ---- LAND-9 phone demo first ---- */
SPECS['LAND-9'] = (m) => {
  css('LAND-9', `
  .l9-phone { width:320px; border:var(--b-thick); background:#fff; box-shadow:var(--shadow-lg); margin:0 auto; }
  .l9-screen { display:flex; flex-direction:column; }
  .l9-dock { display:flex; border-top:3px solid var(--ink); }
  .l9-dock button { flex:1; border:0; background:var(--paper); font-family:var(--mono); font-size:9px; text-transform:uppercase; padding:9px 4px; border-right:2px solid var(--ink); }
  .l9-dock button:last-child { border-right:0; }
  .l9-dock button.on { background:var(--yellow); font-weight:700; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast('<a href="#0">sign in</a>')}
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:30px;max-width:1200px;margin:0 auto;padding:40px 30px;align-items:center;width:100%">
      <div style="text-align:right;display:flex;flex-direction:column;gap:14px;align-items:flex-end">
        <h1 class="k-h1" style="font-size:52px">lives in<br>your <span class="hl-y">pocket</span></h1>
        <p style="max-width:300px;font-size:15px">share-sheet in, search out. the meme you need, mid-conversation, before the moment dies.</p>
      </div>
      <div class="l9-phone">
        <div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:3px solid var(--ink);font-family:var(--mono);font-size:9px"><span>9:41</span><span>sploot</span><span>▮▮▮</span></div>
        <div class="l9-screen">
          <div style="padding:10px">
            <div style="display:flex;border:3px solid var(--ink);background:#fff">
              <span style="flex:1;padding:9px 10px;font-family:var(--mono);font-size:12px">little guy</span>
              <button style="border:0;border-left:3px solid var(--ink);background:var(--blue);color:#fff;font-family:var(--mono);font-size:10px;padding:0 12px">go</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:0 10px 10px">
            ${MEMES.slice(8, 10).map((x, i) => `<div class="k-cell ${i === 0 ? 'match' : 'dim'}" style="box-shadow:none"><div class="art" style="background:${x.bg}">${doodle(x.kind)}</div></div>`).join('')}
          </div>
          <div class="l9-dock">
            <button class="on">search</button><button>pile</button><button>+ save</button><button>bangers</button>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="k-stat yellow" style="max-width:210px"><div class="k-stat-label">taps to the meme</div><div class="k-stat-value">3</div></div>
        <div class="k-stat" style="max-width:210px"><div class="k-stat-label">median find</div><div class="k-stat-value">212ms</div></div>
        <button class="k-btn primary">get it on your phone</button>
      </div>
    </div>
    <div style="margin-top:auto">${LAND_FOOT}
    ${labSpec([['structure', 'phone frame center, claims flanking'], ['leads', 'mobile reality (where memes actually get sent)'], ['proof', 'the phone shows the real 3-tap flow'], ['note', 'desktop page argues the mobile case']])}</div>
  </div>`;
};

/* ---- LAND-10 pipeline walkthrough ---- */
SPECS['LAND-10'] = (m) => {
  css('LAND-10', `
  .l10-stage { display:grid; grid-template-columns:64px 1fr; gap:18px; border:var(--b); background:#fff; box-shadow:var(--shadow-sm); padding:16px 18px; }
  .l10-stage .n { font-family:var(--display); font-size:34px; }
  .l10-stage h3 { font-family:var(--display); font-size:19px; text-transform:lowercase; margin-bottom:5px; }
  .l10-arrow { text-align:center; font-family:var(--display); font-size:26px; padding:2px 0; }
  .l10-vec { font-family:var(--mono); font-size:11px; background:var(--void); color:var(--lime); padding:8px 10px; display:inline-block; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast('<a href="#0">sign in</a>')}
    <div style="max-width:760px;margin:0 auto;padding:44px 30px;width:100%;display:flex;flex-direction:column;gap:10px">
      <h1 class="k-h1" style="font-size:56px;margin-bottom:14px">what happens when<br>you press <span class="hl-y">enter</span></h1>
      <div class="l10-stage"><span class="n">01</span><div><h3>you type</h3><span class="l10-vec">"cat losing it"</span></div></div>
      <div class="l10-arrow">↓</div>
      <div class="l10-stage"><span class="n">02</span><div><h3>the words become a vector</h3><span class="l10-vec">[0.031, -0.184, 0.442, … ×768]</span><p style="font-size:13px;margin-top:6px">a coordinate in meaning-space. "losing it" lands near "unhinged", far from "serene".</p></div></div>
      <div class="l10-arrow">↓</div>
      <div class="l10-stage"><span class="n">03</span><div><h3>every meme is already there</h3><p style="font-size:13px">each save got its own coordinate when you uploaded it. 1,482 dots, waiting.</p></div></div>
      <div class="l10-arrow">↓</div>
      <div class="l10-stage"><span class="n">04</span><div><h3>nearest dot wins</h3>
        <div style="display:flex;gap:14px;align-items:center;margin-top:6px">
          <div class="k-cellwrap" style="width:110px">${kCell(MEMES[0], 'match')}</div>
          <span class="l10-vec">cosine 0.94 · 212 ms</span>
        </div></div></div>
      <div style="display:flex;gap:16px;align-items:center;padding-top:18px">
        <button class="k-btn primary" style="padding:14px 26px">press enter on your pile</button>
        <span class="k-note">no folders were consulted at any stage</span>
      </div>
    </div>
    <div style="margin-top:auto">${LAND_FOOT}
    ${labSpec([['structure', 'vertical pipeline walkthrough (scroll narrative)'], ['leads', 'the machinery, stage by stage'], ['proof', 'shows a real vector, real latency'], ['note', 'the exposed-database metaphor at its most literal']])}</div>
  </div>`;
};
