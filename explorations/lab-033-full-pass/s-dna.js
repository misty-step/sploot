/* lab 033 · section DNA — candidate design systems.
   each option = the same sampler surfaces (brand row, headline, search,
   4 pile cells, kit strip, tokens) re-derived under one coherent system. */
'use strict';

function swatches(list) {
  return `<div style="display:flex;flex-wrap:wrap;gap:0">${list.map(([n, c, fg]) => `
    <div style="flex:1;min-width:90px;background:${c};color:${fg || '#0a0a0a'};
      font-family:var(--mono);font-size:9px;text-transform:uppercase;padding:10px 8px;border-top:2px solid #0a0a0a">
      ${n}<br><b>${c}</b></div>`).join('')}</div>`;
}
const DNA4 = MEMES.slice(0, 4);

/* ---- DNA-1 · baseline: neo-brutalist zine (shipped) ---- */
SPECS['DNA-1'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${kMast('<a href="#0">sign in</a>')}
    <div style="padding:44px 40px 28px;display:flex;flex-direction:column;gap:22px;max-width:1060px;margin:0 auto;width:100%">
      <span class="k-sticker tilt-l">it's a search box. for memes.</span>
      <h1 class="k-h1" style="font-size:72px">type words.<br>get the <span class="hl-y">picture.</span></h1>
      ${kConsole()}
      <div class="k-grid cols-4">${DNA4.map((x, i) => kCell(x, i === 0 ? 'match' : '', i === 0)).join('')}</div>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <button class="k-btn primary">claim your library</button>
        <span class="k-sticker magenta tilt-r">bangers</span>
        <div class="k-stat yellow" style="min-width:150px"><div class="k-stat-label">folders required</div><div class="k-stat-value">0</div></div>
      </div>
    </div>
    <div style="margin-top:auto">${swatches([['ink', '#0a0a0a', '#fff'], ['paper', '#f3efe4'], ['blue', '#1f4cff', '#fff'], ['cyan', '#00e5d4'], ['magenta', '#ff2d9b', '#fff'], ['yellow', '#ffe600'], ['orange', '#ff5a1f', '#fff'], ['lime', '#9cff2e']])}
    ${kStatusbar()}
    ${labSpec([['system', 'neo-brutalist zine (SHIPPED baseline)'], ['type', 'archivo black / space grotesk / space mono'], ['move', 'the ui admits it is a database'], ['density', 'high'], ['motion', 'hard, on interaction']])}</div>
  </div>`;
};

/* ---- DNA-2 · risograph overprint ---- */
SPECS['DNA-2'] = (m) => {
  css('DNA-2', `
  .d2 { min-height:100dvh; background:#faf6ec; color:#1a1a1a; font-family:var(--sans); display:flex; flex-direction:column; }
  .d2 .grain { background-image: radial-gradient(rgba(20,20,20,.12) 1px, transparent 1px); background-size:4px 4px; }
  .d2-mast { display:flex; justify-content:space-between; align-items:baseline; padding:18px 36px; border-bottom:2px solid #1a1a1a; }
  .d2-logo { font-family:var(--display); font-size:26px; color:#ff4f98; text-shadow: 2.5px 2px 0 #2b4bff; }
  .d2 h1 { font-family:var(--display); font-size:78px; line-height:.9; text-transform:lowercase;
    color:#2b4bff; position:relative; }
  .d2 h1 .over { position:absolute; left:4px; top:3px; color:#ff4f98; mix-blend-mode:multiply; width:100%; }
  .d2-cell { border:2px solid #1a1a1a; background:#fff; position:relative; }
  .d2-cell .art { mix-blend-mode:multiply; filter:saturate(0); }
  .d2-cell .wash { position:absolute; inset:0; background:#ff4f98; mix-blend-mode:screen; opacity:.55; pointer-events:none; transform:translate(3px,2px); }
  .d2-cell.alt .wash { background:#2b4bff; }
  .d2-cell .cap { font-family:var(--mono); font-size:11px; padding:8px; border-top:2px solid #1a1a1a; background:#faf6ec; }
  .d2-search { display:flex; border:2px solid #1a1a1a; background:#fff; }
  .d2-search .q { flex:1; padding:14px 16px; font-family:var(--mono); font-size:15px; color:#1a1a1a; }
  .d2-search button { border:0; border-left:2px solid #1a1a1a; background:#2b4bff; color:#faf6ec; font-family:var(--display); padding:0 26px; font-size:15px; text-transform:lowercase; }
  .d2-search button:hover { background:#ff4f98; }
  .d2-badge { display:inline-block; font-family:var(--mono); font-size:11px; padding:4px 10px; border:2px solid #1a1a1a; border-radius:999px; background:#ffd6e9; }
  .d2-misprint { font-family:var(--mono); font-size:10px; color:#ff4f98; text-transform:uppercase; letter-spacing:.14em; }`);
  m.innerHTML = `
  <div class="d2 grain">
    <div class="d2-mast"><span class="d2-logo">sploot</span>
      <span class="d2-misprint">2-color edition · print run of 1 (yours)</span></div>
    <div style="max-width:980px;margin:0 auto;padding:56px 36px 32px;display:flex;flex-direction:column;gap:26px;width:100%">
      <h1>your memes,<br>overprinted<span class="over">your memes,<br>overprinted</span></h1>
      <p style="max-width:520px;font-size:17px;line-height:1.5">a private zine press for your camera roll. type what you remember, sploot pulls the print. registration is off on purpose.</p>
      <div class="d2-search"><span class="q">sad frog</span><button>pull the print</button></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px">
        ${DNA4.map((x, i) => `<div class="d2-cell ${i % 2 ? 'alt' : ''}">
          <div class="art">${doodle(x.kind, { bg: '#ffffff' })}</div><div class="wash"></div>
          <div class="cap">${esc(x.cap)}</div></div>`).join('')}
      </div>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <span class="d2-badge">banger · pinned to the drum</span>
        <span class="d2-badge" style="background:#d8e0ff">1,482 prints archived</span>
      </div>
    </div>
    <div style="margin-top:auto">${swatches([['paper', '#faf6ec'], ['riso pink', '#ff4f98', '#fff'], ['riso blue', '#2b4bff', '#fff'], ['ink', '#1a1a1a', '#fff'], ['pink tint', '#ffd6e9'], ['blue tint', '#d8e0ff']])}
    ${labSpec([['system', 'risograph overprint'], ['type', 'archivo black + space mono, lowercase'], ['move', 'two-ink misregistration as the whole identity; thumbnails get a riso wash'], ['density', 'medium'], ['motion', 'none ambient; hover swaps ink order']])}</div>
  </div>`;
};

/* ---- DNA-3 · tabloid front page ---- */
SPECS['DNA-3'] = (m) => {
  css('DNA-3', `
  .d3 { min-height:100dvh; background:#f6f2e8; color:#111; font-family:"Barlow Condensed",sans-serif; display:flex; flex-direction:column; }
  .d3-mast { text-align:center; border-bottom:6px double #111; padding:14px 20px 10px; }
  .d3-mast .paper-name { font-family:var(--display); font-size:54px; text-transform:uppercase; letter-spacing:.02em; }
  .d3-mast .dateline { font-family:var(--mono); font-size:10px; text-transform:uppercase; display:flex; justify-content:space-between; max-width:900px; margin:6px auto 0; }
  .d3-flash { background:#d21f1f; color:#fff; display:inline-block; padding:4px 14px; font-weight:800; font-size:15px; text-transform:uppercase; transform:rotate(-1.2deg); }
  .d3 h1 { font-weight:800; font-size:86px; line-height:.88; text-transform:uppercase; }
  .d3 h1 em { font-style:normal; background:#ffe600; padding:0 8px; }
  .d3-cols { display:grid; grid-template-columns:2.2fr 1fr; gap:26px; max-width:1060px; margin:0 auto; padding:26px 32px; width:100%; }
  .d3-story { column-count:2; column-gap:22px; column-rule:1px solid #999; font-family:Georgia,serif; font-size:14px; line-height:1.5; }
  .d3-story .lede { font-weight:700; }
  .d3-side { border-left:6px solid #111; padding-left:18px; display:flex; flex-direction:column; gap:14px; }
  .d3-side .item { border-bottom:1px solid #999; padding-bottom:12px; }
  .d3-side .kicker { color:#d21f1f; font-weight:800; text-transform:uppercase; font-size:13px; }
  .d3-side .head { font-weight:800; font-size:20px; line-height:1; text-transform:uppercase; }
  .d3-search { display:flex; border:3px solid #111; background:#fff; max-width:760px; }
  .d3-search .q { flex:1; padding:12px 14px; font-family:var(--mono); font-size:14px; }
  .d3-search button { border:0; background:#111; color:#fff; font-weight:800; text-transform:uppercase; padding:0 22px; font-size:16px; }
  .d3-photo { border:3px solid #111; background:#fff; }
  .d3-photo .credit { font-family:var(--mono); font-size:9px; text-transform:uppercase; padding:4px 6px; border-top:1px solid #999; }`);
  m.innerHTML = `
  <div class="d3">
    <div class="d3-mast">
      <div class="paper-name">The Daily Sploot</div>
      <div class="dateline"><span>vol. 1 · your pile edition</span><span>1,482 items on file</span><span>price: $0 forever</span></div>
    </div>
    <div class="d3-cols">
      <div style="display:flex;flex-direction:column;gap:16px">
        <span class="d3-flash">exclusive</span>
        <h1>local archive <em>finds the cat</em> in 212 ms</h1>
        <div class="d3-search"><span class="q">cat losing it</span><button>run it</button></div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px">
          ${DNA4.slice(0, 2).map(x => `<div class="d3-photo">${doodle(x.kind, { bg: '#fff' })}
            <div class="credit">FIG. — "${esc(x.cap)}" · staff photo</div></div>`).join('')}
        </div>
        <div class="d3-story">
          <p class="lede">SOURCES CONFIRM the picture you were thinking of was in your pile the whole time.</p>
          <p>Witnesses report typing plain words like "sad frog" into the box. The archive, which admits it is a database, returned the exact frog. No folders were consulted. Officials declined to comment on the folder industry.</p>
          <p>The pile remains private. No ads, no feed, no discourse. Developing story.</p>
        </div>
      </div>
      <div class="d3-side">
        <div class="item"><span class="kicker">bangers desk</span><div class="head">hall of fame up 3 this week</div></div>
        <div class="item"><span class="kicker">piles</span><div class="head">"cats being unwell" now 214 strong</div></div>
        <div class="item"><span class="kicker">weather</span><div class="head">brainrot: 100% chance</div></div>
        <div class="item"><span class="kicker">classifieds</span><div class="head">WANTED: the screenshot from march</div></div>
      </div>
    </div>
    <div style="margin-top:auto">${swatches([['newsprint', '#f6f2e8'], ['ink', '#111111', '#fff'], ['red top', '#d21f1f', '#fff'], ['highlight', '#ffe600'], ['rule gray', '#999999']])}
    ${labSpec([['system', 'tabloid front page'], ['type', 'archivo black masthead / barlow condensed heads / georgia body'], ['move', 'every surface is a front page about your own memes'], ['density', 'very high'], ['motion', 'none; the news does not animate']])}</div>
  </div>`;
};

/* ---- DNA-4 · vhs rental ---- */
SPECS['DNA-4'] = (m) => {
  css('DNA-4', `
  .d4 { min-height:100dvh; background:#101018; color:#e8e8f0; font-family:var(--sans); display:flex; flex-direction:column; position:relative; overflow:hidden; }
  .d4::after { content:""; position:absolute; inset:0; pointer-events:none;
    background:repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0 1px, transparent 1px 3px); }
  .d4-osd { font-family:"VT323",monospace; color:#e8e8f0; text-shadow:0 0 6px rgba(120,220,255,.8); }
  .d4-bar { display:flex; justify-content:space-between; padding:16px 28px; font-size:20px; }
  .d4 h1 { font-family:"VT323",monospace; font-size:92px; line-height:.9; text-transform:uppercase;
    color:#fff; text-shadow:3px 0 0 #ff3355, -3px 0 0 #33ddff; }
  .d4-label { background:linear-gradient(180deg,#f7f3e6 0 70%, #e7e0cc 70% 100%); color:#161616; border-radius:2px;
    padding:14px 18px; font-family:var(--mono); box-shadow:0 4px 0 rgba(0,0,0,.5); position:relative; }
  .d4-label::before { content:""; position:absolute; left:0; right:0; top:6px; height:8px; background:repeating-linear-gradient(90deg,#ff3355 0 24px,#ffb033 24px 48px,#33ddff 48px 72px); }
  .d4-search { display:flex; gap:0; border:2px solid #33ddff; background:#000; box-shadow:0 0 18px rgba(51,221,255,.25); }
  .d4-search .q { flex:1; padding:14px 16px; font-family:"VT323",monospace; font-size:22px; color:#33ddff; }
  .d4-search button { background:#ff3355; color:#fff; border:0; font-family:"VT323",monospace; font-size:20px; padding:0 24px; text-transform:uppercase; }
  .d4-tape { background:#181822; border:1px solid #2a2a38; padding:10px; }
  .d4-tape .art { filter:saturate(1.4) contrast(1.1); border:1px solid #2a2a38; }
  .d4-tape .cap { font-family:"VT323",monospace; font-size:16px; color:#ffb033; padding-top:8px; }
  .d4-sticker { display:inline-block; background:#ffb033; color:#161616; font-family:var(--mono); font-weight:700; font-size:11px; padding:4px 10px; border-radius:2px; transform:rotate(-2deg); }`);
  m.innerHTML = `
  <div class="d4">
    <div class="d4-bar d4-osd"><span>▶ PLAY</span><span>SP 0:00:47</span><span>JUL 08 2026 · CH3</span></div>
    <div style="max-width:1020px;margin:0 auto;padding:30px 32px;display:flex;flex-direction:column;gap:24px;width:100%">
      <h1>be kind.<br>rewind the pile.</h1>
      <p style="max-width:540px;color:#aab;font-size:16px;line-height:1.55">your memes, shelved like tapes in the last video store on earth. type the scene you remember. we cue it up.</p>
      <div class="d4-search"><span class="q">&gt; the frog that has seen things_</span><button>⏵ cue</button></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px">
        ${DNA4.map(x => `<div class="d4-tape"><div class="art">${doodle(x.kind, { bg: '#0e0e16', ink: '#e8e8f0', a: '#ffb033', b: '#33ddff' })}</div>
          <div class="cap">${esc(x.cap)}</div></div>`).join('')}
      </div>
      <div class="d4-label" style="max-width:460px">
        <div style="margin-top:10px;font-weight:700">SPLOOT VIDEO · MEMBERSHIP CARD</div>
        <div style="font-size:11px;margin-top:4px">member: you · late fees: never · rewound: always</div>
        <div style="margin-top:8px"><span class="d4-sticker">banger — staff pick</span></div>
      </div>
    </div>
    <div style="margin-top:auto">${swatches([['crt black', '#101018', '#fff'], ['osd white', '#e8e8f0'], ['chroma red', '#ff3355', '#fff'], ['chroma cyan', '#33ddff'], ['label amber', '#ffb033'], ['label paper', '#f7f3e6']])}
    ${labSpec([['system', 'vhs rental store'], ['type', 'vt323 osd / space mono labels'], ['move', 'camcorder osd chrome + paper rental labels; search = cueing a tape'], ['density', 'medium'], ['motion', 'tracking jitter on state change only']])}</div>
  </div>`;
};

/* ---- DNA-5 · sticker bomb ---- */
SPECS['DNA-5'] = (m) => {
  css('DNA-5', `
  .d5 { min-height:100dvh; background:#141414; color:#fff; font-family:var(--sans); display:flex; flex-direction:column; overflow:hidden; }
  .d5-stick { border:3px solid #fff; box-shadow:0 0 0 3px #141414, 6px 8px 0 rgba(0,0,0,.6); }
  .d5 h1 { font-family:"Bungee",sans-serif; font-size:64px; line-height:.95; text-transform:lowercase; }
  .d5 h1 .a { color:#ffe600; } .d5 h1 .b { color:#00e5d4; } .d5 h1 .c { color:#ff2d9b; }
  .d5-search { display:flex; border:4px solid #fff; background:#fff; transform:rotate(-.8deg); box-shadow:8px 10px 0 rgba(0,0,0,.55); }
  .d5-search .q { flex:1; padding:14px 16px; font-family:var(--mono); font-size:15px; color:#141414; }
  .d5-search button { border:0; background:#ff2d9b; color:#fff; font-family:"Bungee",sans-serif; padding:0 22px; font-size:14px; }
  .d5-cellwrap { position:relative; }
  .d5-tag { position:absolute; z-index:2; font-family:"Bungee",sans-serif; font-size:10px; background:#ffe600; color:#141414; padding:3px 8px; border:3px solid #fff; box-shadow:0 0 0 3px #141414; }
  .d5-cellwrap > .d5-tag { position:static !important; display:inline-block; margin:0 6px 8px 0; }
  `);
  const tilts = [-3, 2, -1.5, 2.5];
  m.innerHTML = `
  <div class="d5">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 30px">
      <span style="font-family:'Bungee';font-size:24px" class="d5-stick">&nbsp;sploot&nbsp;</span>
      <span class="d5-tag" style="position:static;transform:rotate(2deg)">no folders club</span>
    </div>
    <div style="max-width:1000px;margin:0 auto;padding:36px 32px;display:flex;flex-direction:column;gap:26px;width:100%">
      <h1><span class="a">slap</span> every meme<br>on <span class="b">one deck.</span> <span class="c">find any of them.</span></h1>
      <div class="d5-search"><span class="q">little guy</span><button>rip it</button></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:26px;padding:10px 0 24px">
        ${DNA4.map((x, i) => `<div class="d5-cellwrap" style="transform:rotate(${tilts[i]}deg)">
          ${i === 0 ? '<span class="d5-tag" style="top:-12px;left:-10px">0.94 match</span>' : ''}
          ${x.banger ? '<span class="d5-tag" style="bottom:-10px;right:-8px;background:#ff2d9b;color:#fff">banger</span>' : ''}
          <div class="d5-stick">${doodle(x.kind, { bg: ['#ffe600', '#00e5d4', '#9cff2e', '#ff2d9b'][i] })}</div>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:18px;align-items:center;font-family:var(--mono);font-size:12px;color:#aaa">
        <span>1,482 stickers on the deck</span><span>·</span><span>the deck is yours. nobody else sees it.</span>
      </div>
    </div>
    <div style="margin-top:auto">${swatches([['deck black', '#141414', '#fff'], ['die-cut white', '#ffffff'], ['acid', '#ffe600'], ['cyan', '#00e5d4'], ['hot pink', '#ff2d9b', '#fff'], ['lime', '#9cff2e']])}
    ${labSpec([['system', 'sticker bomb'], ['type', 'bungee display / space mono chrome'], ['move', 'every object is a die-cut sticker with a white keyline; scores + bangers are slapped-on tags'], ['density', 'chaotic-high'], ['motion', 'peel on hover only']])}</div>
  </div>`;
};

/* ---- DNA-6 · split-flap departures ---- */
SPECS['DNA-6'] = (m) => {
  css('DNA-6', `
  .d6 { min-height:100dvh; background:#0d0f12; color:#f2f2ec; font-family:var(--mono); display:flex; flex-direction:column; }
  .d6-board { border:2px solid #2a2e35; background:#111418; }
  .d6-row { display:grid; grid-template-columns:80px 1fr 190px 130px; gap:2px; padding:10px 14px; border-bottom:1px solid #22262c; align-items:center; }
  .d6-row.hd { color:#8a919c; font-size:10px; text-transform:uppercase; letter-spacing:.14em; }
  .d6-flap { font-size:15px; letter-spacing:.06em; text-transform:uppercase; white-space:nowrap; overflow:hidden; }
  .d6-flap span { display:inline-block; background:#1b1f25; border:1px solid #2a2e35; padding:2px 4px; margin-right:1px; box-shadow:inset 0 -8px 0 rgba(0,0,0,.35); }
  .d6-amber { color:#ffb400; } .d6-green { color:#4be37a; }
  .d6 h1 { font-family:var(--display); font-size:56px; text-transform:uppercase; line-height:.9; color:#f2f2ec; }
  .d6-search { display:flex; border:2px solid #ffb400; background:#000; max-width:720px; }
  .d6-search .q { flex:1; padding:13px 15px; font-size:15px; color:#ffb400; text-transform:uppercase; }
  .d6-search button { border:0; background:#ffb400; color:#0d0f12; font-weight:700; padding:0 22px; text-transform:uppercase; }
  .d6-sign { display:inline-block; background:#f2c500; color:#0d0f12; font-weight:700; padding:6px 14px; font-size:12px; text-transform:uppercase; letter-spacing:.1em; }`);
  const flap = (s) => `<span>${s.split('').join('</span><span>')}</span>`;
  m.innerHTML = `
  <div class="d6">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 30px;border-bottom:2px solid #2a2e35">
      <span style="font-family:var(--display);font-size:22px;text-transform:uppercase">sploot ✈ terminal 1</span>
      <span class="d6-sign">all piles boarding</span>
    </div>
    <div style="max-width:1040px;margin:0 auto;padding:38px 32px;display:flex;flex-direction:column;gap:26px;width:100%">
      <h1>departures from<br>your camera roll</h1>
      <div class="d6-search"><span class="q">judging you</span><button>locate</button></div>
      <div class="d6-board">
        <div class="d6-row hd"><span>gate</span><span>meme</span><span>pile</span><span>status</span></div>
        ${DNA4.map((x, i) => `<div class="d6-row">
          <span class="d6-flap d6-amber">${flap('B' + (12 + i))}</span>
          <span class="d6-flap">${flap(x.cap.slice(0, 26))}</span>
          <span class="d6-flap d6-amber">${flap(PILES[i].name.slice(0, 8))}</span>
          <span class="d6-flap ${i === 0 ? 'd6-green' : ''}">${flap(i === 0 ? 'FOUND' : 'ON TIME')}</span>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:20px;font-size:11px;color:#8a919c;text-transform:uppercase">
        <span>1,482 items in circulation</span><span>3 embedding — delayed</span><span>0 lost bags ever</span>
      </div>
    </div>
    <div style="margin-top:auto">${swatches([['board black', '#0d0f12', '#fff'], ['flap steel', '#1b1f25', '#fff'], ['amber', '#ffb400'], ['go green', '#4be37a'], ['sign yellow', '#f2c500'], ['bone', '#f2f2ec']])}
    ${labSpec([['system', 'split-flap departures'], ['type', 'space mono flaps / archivo black signage'], ['move', 'the library is an arrivals board; a match flips to FOUND'], ['density', 'high, tabular'], ['motion', 'flap-flip on state change only']])}</div>
  </div>`;
};

/* ---- DNA-7 · field guide plates ---- */
SPECS['DNA-7'] = (m) => {
  css('DNA-7', `
  .d7 { min-height:100dvh; background:#f7f3e7; color:#2c2a24; font-family:"Fraunces",serif; display:flex; flex-direction:column; }
  .d7-rule { border:0; border-top:1px solid #b9b09a; }
  .d7 h1 { font-weight:300; font-size:64px; line-height:1.02; font-style:italic; }
  .d7-plate { border:1px solid #2c2a24; background:#fffdf6; padding:14px; position:relative; }
  .d7-plate .fig { font-family:var(--mono); font-size:9px; text-transform:uppercase; letter-spacing:.16em; color:#7a715c; }
  .d7-plate .latin { font-style:italic; font-size:14px; margin-top:8px; }
  .d7-plate .common { font-family:var(--mono); font-size:10px; text-transform:uppercase; color:#7a715c; letter-spacing:.1em; }
  .d7-search { display:flex; border:1px solid #2c2a24; background:#fffdf6; max-width:640px; }
  .d7-search .q { flex:1; padding:13px 16px; font-family:var(--mono); font-size:13px; color:#2c2a24; }
  .d7-search button { border:0; border-left:1px solid #2c2a24; background:#2c2a24; color:#f7f3e7; font-family:var(--mono); font-size:11px; text-transform:uppercase; letter-spacing:.12em; padding:0 22px; }
  .d7-eyebrow { font-family:var(--mono); font-size:10px; letter-spacing:.22em; text-transform:uppercase; color:#8a5a2b; }`);
  const latin = ['felis maximus vibratus', 'clamor affectionis', 'rana quae vidit', 'omnia igne bene'];
  m.innerHTML = `
  <div class="d7">
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:20px 40px;border-bottom:1px solid #2c2a24">
      <span style="font-size:22px;font-weight:600">sploot</span>
      <span class="d7-eyebrow">a field guide to your pile · plate I</span>
    </div>
    <div style="max-width:1000px;margin:0 auto;padding:52px 40px 30px;display:flex;flex-direction:column;gap:26px;width:100%">
      <span class="d7-eyebrow">order: memes · habitat: your camera roll</span>
      <h1>Common specimens,<br>reliably located.</h1>
      <p style="max-width:520px;font-size:16px;line-height:1.6;font-weight:300">describe the specimen in plain words. the guide opens to the right plate. classification is automatic; the taxonomy is vibes.</p>
      <div class="d7-search"><span class="q">the frog that has seen things</span><button>consult</button></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:22px">
        ${DNA4.map((x, i) => `<div class="d7-plate">
          <div class="fig">fig. ${i + 1}${i === 0 ? ' · located' : ''}</div>
          ${doodle(x.kind, { bg: '#fffdf6', ink: '#2c2a24', a: '#d9c79a', b: '#a8b89a' })}
          <div class="latin">${latin[i]}</div>
          <div class="common">"${esc(x.cap)}"</div>
        </div>`).join('')}
      </div>
    </div>
    <div style="margin-top:auto">${swatches([['vellum', '#f7f3e7'], ['plate white', '#fffdf6'], ['ink brown', '#2c2a24', '#fff'], ['ochre', '#d9c79a'], ['sage', '#a8b89a'], ['rust accent', '#8a5a2b', '#fff']])}
    ${labSpec([['system', 'field guide plates'], ['type', 'fraunces italic display / space mono captions'], ['move', 'memes as classified specimens with latin names; search = consulting the guide'], ['density', 'low-medium'], ['motion', 'page-turn on result only']])}</div>
  </div>`;
};

/* ---- DNA-8 · frutiger aero y2k ---- */
SPECS['DNA-8'] = (m) => {
  css('DNA-8', `
  .d8 { min-height:100dvh; font-family:var(--sans); color:#0b3556; display:flex; flex-direction:column;
    background:linear-gradient(180deg,#bfe9ff 0%,#e8f9ff 40%,#d9f2e2 100%); }
  .d8-glass { background:linear-gradient(180deg,rgba(255,255,255,.85),rgba(255,255,255,.45));
    border:1px solid rgba(255,255,255,.9); border-radius:14px; box-shadow:0 8px 24px rgba(11,53,86,.18); }
  .d8 h1 { font-size:58px; line-height:1; font-weight:700; letter-spacing:-.02em;
    background:linear-gradient(180deg,#0b6ab0,#31c48d); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .d8-search { display:flex; border-radius:999px; overflow:hidden; background:#fff; box-shadow:inset 0 2px 6px rgba(11,53,86,.2), 0 6px 18px rgba(11,53,86,.15); max-width:680px; }
  .d8-search .q { flex:1; padding:15px 22px; font-size:15px; color:#0b3556; }
  .d8-search button { border:0; background:linear-gradient(180deg,#31c48d,#0b9f6e); color:#fff; font-weight:700; padding:0 28px; font-size:15px; }
  .d8-cell { border-radius:12px; overflow:hidden; background:#fff; box-shadow:0 6px 16px rgba(11,53,86,.16); }
  .d8-cell .cap { padding:10px 12px; font-size:12px; font-weight:500; }
  .d8-orb { width:10px; height:10px; border-radius:50%; background:radial-gradient(circle at 30% 30%, #fff, #31c48d); display:inline-block; }`);
  m.innerHTML = `
  <div class="d8">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:18px 34px">
      <span style="font-weight:700;font-size:24px;letter-spacing:-.02em;color:#0b6ab0">sploot<span style="color:#31c48d">.</span></span>
      <span class="d8-glass" style="padding:6px 16px;font-size:12px"><span class="d8-orb"></span>&nbsp; connected to your pile</span>
    </div>
    <div style="max-width:980px;margin:0 auto;padding:46px 34px;display:flex;flex-direction:column;gap:24px;width:100%">
      <h1>the future of finding<br>that one meme</h1>
      <p style="max-width:520px;font-size:16px;line-height:1.55;color:#2a5b7f">as imagined in 2004. type words, receive picture. it felt like magic then. it is a database now. both true.</p>
      <div class="d8-search"><span class="q">everything is fine</span><button>search</button></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px">
        ${DNA4.map((x, i) => `<div class="d8-cell">${doodle(x.kind, { bg: ['#e8f9ff', '#d9f2e2', '#fff', '#e8f9ff'][i], ink: '#0b3556', a: '#8fd8ff', b: '#9fe8c6' })}
          <div class="cap">${esc(x.cap)}</div></div>`).join('')}
      </div>
      <div class="d8-glass" style="padding:14px 20px;display:flex;gap:26px;font-size:13px;max-width:680px">
        <span><b>1,482</b> items</span><span><b>212 ms</b> average find</span><span><b>0</b> folders, still</span>
      </div>
    </div>
    <div style="margin-top:auto">${swatches([['sky', '#bfe9ff', '#0b3556'], ['mist', '#e8f9ff', '#0b3556'], ['meadow', '#d9f2e2', '#0b3556'], ['aero blue', '#0b6ab0', '#fff'], ['aqua green', '#31c48d', '#fff'], ['deep sea', '#0b3556', '#fff']])}
    ${labSpec([['system', 'frutiger aero y2k (deliberate period pastiche)'], ['type', 'space grotesk, gradient display'], ['move', 'the optimistic-tech-future look, played straight, with deadpan copy undercutting it'], ['density', 'low'], ['motion', 'slow gloss shimmer on hover only']])}</div>
  </div>`;
};

/* ---- DNA-9 · evidence corkboard ---- */
SPECS['DNA-9'] = (m) => {
  css('DNA-9', `
  .d9 { min-height:100dvh; color:#241c14; font-family:var(--sans); display:flex; flex-direction:column;
    background:
      radial-gradient(rgba(0,0,0,.08) 1px, transparent 1.5px),
      linear-gradient(180deg,#c8a06a,#b98f58); background-size:7px 7px, auto; }
  .d9-note { background:#fff; padding:12px; box-shadow:0 6px 14px rgba(36,28,20,.35); position:relative; }
  .d9-note::before { content:""; position:absolute; top:-7px; left:50%; width:14px; height:14px; border-radius:50%;
    background:radial-gradient(circle at 35% 35%, #ff5a5a, #a01818); box-shadow:0 3px 5px rgba(0,0,0,.4); }
  .d9-tape { background:#fdf6c9; padding:10px 14px; font-family:"Caveat",cursive; font-size:22px; transform:rotate(-2deg);
    box-shadow:0 4px 10px rgba(36,28,20,.3); display:inline-block; }
  .d9 h1 { font-family:"Caveat",cursive; font-size:72px; line-height:.95; color:#241c14; }
  .d9 h1 mark { background:#ffe600; padding:0 6px; }
  .d9-search { display:flex; background:#fff; border:3px solid #241c14; box-shadow:0 8px 18px rgba(36,28,20,.35); max-width:640px; transform:rotate(-.5deg); }
  .d9-search .q { flex:1; padding:14px 16px; font-family:var(--mono); font-size:14px; }
  .d9-search button { border:0; background:#a01818; color:#fff; font-weight:700; text-transform:uppercase; font-family:var(--mono); font-size:12px; padding:0 20px; }
  .d9-string { position:absolute; pointer-events:none; z-index:3; }
  .d9-cap { font-family:"Caveat",cursive; font-size:19px; padding-top:8px; }`);
  const tilts = [-2.5, 1.8, -1, 2.2];
  m.innerHTML = `
  <div class="d9">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:18px 32px">
      <span class="d9-tape" style="font-size:26px">sploot · case board</span>
      <span class="d9-tape" style="transform:rotate(1.5deg)">status: it was in the pile all along</span>
    </div>
    <div style="max-width:1000px;margin:0 auto;padding:30px 32px;display:flex;flex-direction:column;gap:24px;width:100%;position:relative">
      <h1>where is <mark>the screenshot</mark>?<br>the board knows.</h1>
      <div class="d9-search"><span class="q">pigeon plotting something</span><button>connect</button></div>
      <svg class="d9-string" style="left:0;top:210px;width:100%;height:220px" viewBox="0 0 1000 220" preserveAspectRatio="none">
        <path d="M330 10 C 420 120, 180 140, 130 190" stroke="#a01818" stroke-width="3" fill="none"/>
        <path d="M330 10 C 500 90, 700 60, 760 180" stroke="#a01818" stroke-width="3" fill="none"/>
      </svg>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:26px;padding-top:14px">
        ${DNA4.map((x, i) => `<div class="d9-note" style="transform:rotate(${tilts[i]}deg)">
          ${doodle(x.kind, { bg: '#f6f2e8' })}
          <div class="d9-cap">${esc(x.cap)} ${i === 0 ? '→ <b>THIS ONE</b>' : ''}</div>
        </div>`).join('')}
      </div>
      <span class="d9-tape">1,482 pieces of evidence · all yours · none of it admissible</span>
    </div>
    <div style="margin-top:auto">${swatches([['cork', '#c8a06a'], ['polaroid', '#ffffff'], ['string red', '#a01818', '#fff'], ['sticky note', '#fdf6c9'], ['marker ink', '#241c14', '#fff'], ['highlight', '#ffe600']])}
    ${labSpec([['system', 'evidence corkboard'], ['type', 'caveat handwriting / space mono typed labels'], ['move', 'search literally draws red string from the query to the match'], ['density', 'medium, deliberately messy'], ['motion', 'string draw + pin drop on result only']])}</div>
  </div>`;
};

/* ---- DNA-10 · konbini shelf ---- */
SPECS['DNA-10'] = (m) => {
  css('DNA-10', `
  .d10 { min-height:100dvh; background:#f4f6f8; color:#16233a; font-family:var(--sans); display:flex; flex-direction:column; }
  .d10-head { background:#e60023; color:#fff; padding:14px 30px; display:flex; justify-content:space-between; align-items:center; }
  .d10 h1 { font-family:var(--display); font-size:56px; line-height:.92; text-transform:lowercase; }
  .d10-flash { display:inline-block; background:#ffd400; color:#16233a; font-weight:800; padding:4px 12px; transform:skew(-8deg); font-size:14px; }
  .d10-pack { background:#fff; border:2px solid #16233a; position:relative; }
  .d10-pack .price { position:absolute; top:-10px; right:-8px; background:#e60023; color:#fff; font-weight:800; font-size:12px; padding:4px 8px; border-radius:999px; border:2px solid #16233a; }
  .d10-pack .strip { display:flex; justify-content:space-between; font-family:var(--mono); font-size:9px; padding:5px 8px; border-top:2px solid #16233a; text-transform:uppercase; }
  .d10-barcode { font-family:"Libre Barcode 39"; font-size:34px; line-height:.8; }
  .d10-search { display:flex; border:3px solid #16233a; background:#fff; max-width:660px; }
  .d10-search .q { flex:1; padding:13px 16px; font-family:var(--mono); font-size:14px; }
  .d10-search button { border:0; background:#0057b8; color:#fff; font-weight:800; padding:0 22px; }
  .d10-aisle { font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.12em; background:#0057b8; color:#fff; display:inline-block; padding:4px 10px; }`);
  m.innerHTML = `
  <div class="d10">
    <div class="d10-head">
      <span style="font-family:var(--display);font-size:24px">sploot mart</span>
      <span style="font-weight:700;font-size:13px">open 24/7 · your pile only</span>
    </div>
    <div style="max-width:1000px;margin:0 auto;padding:40px 32px;display:flex;flex-direction:column;gap:22px;width:100%">
      <span class="d10-flash">every meme in stock</span>
      <h1>aisle 3:<br>cats being unwell</h1>
      <div class="d10-search"><span class="q">cursed sandwich</span><button>scan</button></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${PILES.slice(0, 4).map(p => `<span class="d10-aisle">${esc(p.name)} · ${p.n}</span>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px">
        ${DNA4.map((x, i) => `<div class="d10-pack">
          <span class="price">${i === 0 ? '0.94' : 'in stock'}</span>
          ${doodle(x.kind, { bg: ['#fff3f3', '#eef6ff', '#fffbe6', '#f0fff0'][i] })}
          <div style="padding:8px 10px;font-size:12px;font-weight:600">${esc(x.cap)}</div>
          <div class="strip"><span class="d10-barcode">*${x.vec}*</span><span>net wt: 1 meme</span></div>
        </div>`).join('')}
      </div>
    </div>
    <div style="margin-top:auto">${swatches([['shelf white', '#f4f6f8', '#16233a'], ['pack white', '#ffffff', '#16233a'], ['mart red', '#e60023', '#fff'], ['mart blue', '#0057b8', '#fff'], ['price yellow', '#ffd400'], ['label navy', '#16233a', '#fff']])}
    ${labSpec([['system', 'konbini shelf'], ['type', 'archivo black / space mono label data'], ['move', 'memes as shelf-ready packaged goods with barcodes + price flashes; piles are aisles'], ['density', 'high'], ['motion', 'scanner beep flash on match only']])}</div>
  </div>`;
};

/* ---- DNA-11 · broadcast chyron ---- */
SPECS['DNA-11'] = (m) => {
  css('DNA-11', `
  .d11 { min-height:100dvh; background:#0a1030 radial-gradient(ellipse at 30% 20%, #16225c, #0a1030 65%); color:#fff; font-family:var(--sans); display:flex; flex-direction:column; }
  .d11-bug { position:absolute; top:18px; right:26px; display:flex; gap:8px; align-items:center; font-family:var(--mono); font-size:11px; }
  .d11-bug i { width:9px; height:9px; border-radius:50%; background:#ff2222; animation:d11p 1.4s infinite; }
  @keyframes d11p { 50% { opacity:.3 } }
  .d11 h1 { font-family:var(--display); font-size:64px; text-transform:uppercase; line-height:.9; }
  .d11-lower { border-left:10px solid #ffcf00; background:linear-gradient(90deg,#e61e2b, #b21622); padding:10px 18px; display:inline-block; }
  .d11-lower .top { font-size:11px; font-family:var(--mono); text-transform:uppercase; letter-spacing:.14em; opacity:.85; }
  .d11-lower .main { font-family:var(--display); font-size:24px; text-transform:uppercase; }
  .d11-ticker { background:#ffcf00; color:#0a1030; font-family:var(--mono); font-weight:700; font-size:12px; text-transform:uppercase; padding:8px 0; white-space:nowrap; overflow:hidden; }
  .d11-ticker span { display:inline-block; animation:d11t 26s linear infinite; }
  @keyframes d11t { from { transform:translateX(0) } to { transform:translateX(-50%) } }
  @media (prefers-reduced-motion: reduce) { .d11-ticker span { animation:none } }
  .d11-search { display:flex; border:3px solid #ffcf00; background:rgba(0,0,0,.5); max-width:680px; }
  .d11-search .q { flex:1; padding:14px 16px; font-family:var(--mono); font-size:14px; color:#ffcf00; }
  .d11-search button { border:0; background:#ffcf00; color:#0a1030; font-family:var(--display); text-transform:uppercase; padding:0 22px; font-size:14px; }
  .d11-frame { border:3px solid #fff; background:#0e173e; }
  .d11-frame .strap { background:#e61e2b; font-family:var(--mono); font-size:9px; text-transform:uppercase; padding:4px 8px; letter-spacing:.1em; }`);
  const tick = 'this just in: the meme was found · sources: your own camera roll · folders remain unemployed · pile at 1,482 and rising · ';
  m.innerHTML = `
  <div class="d11" style="position:relative">
    <div class="d11-bug"><i></i> LIVE · SPLOOT NEWS NETWORK</div>
    <div style="max-width:1020px;margin:0 auto;padding:56px 32px 30px;display:flex;flex-direction:column;gap:22px;width:100%">
      <h1>breaking:<br>you typed four words.<br>the picture appeared.</h1>
      <div class="d11-search"><span class="q">screaming into the void</span><button>go live</button></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px">
        ${DNA4.map((x, i) => `<div class="d11-frame">
          <div class="strap">${i === 0 ? 'MATCH · CONFIDENCE 94%' : 'FILE FOOTAGE'}</div>
          ${doodle(x.kind, { bg: '#0e173e', ink: '#ffffff', a: '#ffcf00', b: '#3ec6ff' })}
        </div>`).join('')}
      </div>
      <div class="d11-lower"><div class="top">developing story</div><div class="main">no folders. just vibes.</div></div>
    </div>
    <div style="margin-top:auto">
      <div class="d11-ticker"><span>${tick}${tick}</span></div>
      ${swatches([['studio navy', '#0a1030', '#fff'], ['breaking red', '#e61e2b', '#fff'], ['chyron gold', '#ffcf00'], ['sky cyan', '#3ec6ff'], ['frame white', '#ffffff']])}
      ${labSpec([['system', 'broadcast chyron'], ['type', 'archivo black straps / space mono tickers'], ['move', 'every state change is BREAKING news about your own pile'], ['density', 'medium-high'], ['motion', 'ticker crawl + live bug (reduced-motion kills both)']])}
    </div>
  </div>`;
};

/* ---- DNA-12 · card catalog ---- */
SPECS['DNA-12'] = (m) => {
  css('DNA-12', `
  .d12 { min-height:100dvh; background:#5b3a24; color:#241a10; font-family:var(--mono); display:flex; flex-direction:column;
    background-image:linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,0) 30%), repeating-linear-gradient(90deg, rgba(0,0,0,.06) 0 2px, transparent 2px 160px); }
  .d12-drawer { background:#6d4a2f; border:2px solid #3d2716; box-shadow:inset 0 2px 0 rgba(255,255,255,.12), 0 6px 14px rgba(0,0,0,.4); padding:10px 16px; display:flex; align-items:center; gap:12px; color:#f4ead8; }
  .d12-pull { width:34px; height:12px; background:linear-gradient(180deg,#d9b36a,#9c7a3a); border-radius:2px; border:1px solid #3d2716; }
  .d12-card { background:#f7f0dd; border:1px solid #b9a988; box-shadow:0 4px 10px rgba(0,0,0,.35); padding:16px 18px 14px; position:relative; }
  .d12-card::before { content:""; position:absolute; left:0; right:0; top:34px; height:1px; background:#c33; opacity:.5; }
  .d12-card::after { content:""; position:absolute; left:0; right:0; top:52px; bottom:16px;
    background:repeating-linear-gradient(180deg, transparent 0 17px, rgba(60,90,160,.35) 17px 18px); }
  .d12-card .hole { position:absolute; bottom:8px; left:50%; transform:translateX(-50%); width:14px; height:14px; border-radius:50%; background:#5b3a24; border:2px solid #b9a988; }
  .d12-stamp { display:inline-block; font-size:11px; color:#a02020; border:2px solid #a02020; padding:2px 8px; transform:rotate(-4deg); text-transform:uppercase; position:relative; z-index:1; }
  .d12 h1 { font-family:"Fraunces",serif; font-weight:600; font-size:54px; line-height:1; color:#f4ead8; }
  .d12-search { display:flex; background:#f7f0dd; border:2px solid #3d2716; max-width:640px; }
  .d12-search .q { flex:1; padding:13px 16px; font-size:13px; }
  .d12-search button { border:0; background:#3d2716; color:#f4ead8; font-size:11px; text-transform:uppercase; letter-spacing:.12em; padding:0 20px; }`);
  m.innerHTML = `
  <div class="d12">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:18px 32px">
      <span style="font-family:'Fraunces',serif;font-weight:600;font-size:24px;color:#f4ead8">sploot public library</span>
      <span style="font-size:10px;color:#e8d9bd;text-transform:uppercase;letter-spacing:.14em">members: 1 · fines: abolished</span>
    </div>
    <div style="max-width:1000px;margin:0 auto;padding:30px 32px;display:flex;flex-direction:column;gap:22px;width:100%">
      <h1>the catalog knows<br>which drawer.</h1>
      <div class="d12-search"><span class="q">moon with a face</span><button>pull card</button></div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${PILES.slice(0, 3).map(p => `<div class="d12-drawer"><span class="d12-pull"></span><span style="font-size:12px;text-transform:uppercase;letter-spacing:.1em">${esc(p.name)}</span><span style="margin-left:auto;font-size:11px;opacity:.7">${p.n} cards</span></div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px">
        ${DNA4.slice(0, 3).map((x, i) => `<div class="d12-card">
          <div style="position:relative;z-index:1;font-size:12px;font-weight:700">${esc(x.file)} <span style="opacity:.6">· vec ${x.vec}</span></div>
          <div style="position:relative;z-index:1;display:flex;gap:14px;margin-top:12px;align-items:flex-start">
            <div style="width:96px;flex:none;border:1px solid #b9a988;background:#fff">${doodle(x.kind, { bg: '#ffffff' })}</div>
            <div style="font-size:12px;line-height:1.5">"${esc(x.cap)}"<br><br>filed under: ${esc(PILES[i].name)}</div>
          </div>
          <div style="position:relative;z-index:1;margin-top:12px">${i === 0 ? '<span class="d12-stamp">found · jul 08 2026</span>' : '<span class="d12-stamp" style="color:#3c5aa0;border-color:#3c5aa0">on shelf</span>'}</div>
          <span class="hole"></span>
        </div>`).join('')}
      </div>
    </div>
    <div style="margin-top:auto">${swatches([['oak', '#5b3a24', '#fff'], ['drawer', '#6d4a2f', '#fff'], ['card stock', '#f7f0dd'], ['due-date red', '#a02020', '#fff'], ['rule blue', '#3c5aa0', '#fff'], ['brass', '#d9b36a']])}
    ${labSpec([['system', 'card catalog'], ['type', 'fraunces headings / space mono typewriter cards'], ['move', 'every meme is a catalog card with a date-due stamp; piles are drawers'], ['density', 'medium'], ['motion', 'drawer slide + stamp thunk on interaction only']])}</div>
  </div>`;
};
