/* lab 033 · section SET — settings / account.
   fixed: shipped tokens; real settings (account, embeddings, storage,
   appearance, danger zone). varies: form anatomy and tone. */
'use strict';

const SET_DATA = {
  email: 'you@example.com',
  plan: 'personal · free forever',
  storage: '412 mb of chaos',
  embedded: '1,479 / 1,482 embedded',
  model: 'siglip-base · 768-dim',
  theme: 'light (paper)',
};

/* ---- SET-1 baseline: stacked form ---- */
SPECS['SET-1'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:640px;margin:0 auto;padding:34px 26px;width:100%;display:flex;flex-direction:column;gap:16px">
      <h2 class="k-h1" style="font-size:34px">settings</h2>
      ${['account', 'embeddings', 'storage', 'appearance'].map((s, i) => `
      <div style="border:var(--b);background:#fff;box-shadow:var(--shadow-sm);padding:16px">
        <div class="k-eyebrow" style="margin-bottom:10px">${s}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:14px">
          <span>${[SET_DATA.email, SET_DATA.embedded, SET_DATA.storage, SET_DATA.theme][i]}</span>
          <button class="k-btn sm">${['manage', 'retry 3', 'export', 'toggle'][i]}</button>
        </div>
      </div>`).join('')}
      <div style="border:var(--b);border-color:var(--orange);background:#fff;padding:16px">
        <div class="k-eyebrow" style="color:var(--orange);margin-bottom:10px">danger zone</div>
        <button class="k-btn sm" style="background:var(--orange);color:#fff">delete everything</button>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['anatomy', 'BASELINE · stacked cards, one per topic (shipped shape)'], ['tone', 'flat'], ['weakness', 'settings is the least sploot page in the app; zero voice']])}
  </div>`;
};

/* ---- SET-2 control panel toggles ---- */
SPECS['SET-2'] = (m) => {
  css('SET-2', `.st2-sw { display:flex; align-items:center; gap:12px; }
  .st2-sw .tr { width:58px; height:28px; border:3px solid var(--ink); background:#fff; position:relative; flex:none; }
  .st2-sw .tr i { position:absolute; top:2px; left:2px; width:20px; height:18px; background:var(--ink); }
  .st2-sw.on .tr { background:var(--lime); } .st2-sw.on .tr i { left:auto; right:2px; }
  .st2-knob { width:56px; height:56px; border-radius:50%; border:4px solid var(--ink); background:var(--paper-warm); position:relative; flex:none; }
  .st2-knob::after { content:""; position:absolute; top:4px; left:50%; width:4px; height:16px; background:var(--ink); transform-origin:bottom; transform:translateX(-50%) rotate(35deg); }`);
  const sw = (label, on, note) => `
    <div class="st2-sw ${on ? 'on' : ''}" style="justify-content:space-between;border-bottom:2px solid var(--ink);padding:12px 0">
      <div><div style="font-weight:700;font-size:14px">${label}</div><div class="k-note">${note}</div></div>
      <span class="tr"><i></i></span>
    </div>`;
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:680px;margin:0 auto;padding:34px 26px;width:100%">
      <h2 class="k-h1" style="font-size:34px;margin-bottom:16px">control panel</h2>
      <div style="border:var(--b-thick);background:#fff;box-shadow:var(--shadow);padding:20px">
        ${sw('auto-embed on upload', true, 'new saves become searchable without asking')}
        ${sw('nsfw blur in shared links', true, 'strangers get the blur, you get the truth')}
        ${sw('shuffle as default sort', false, 'chaos mode on arrival')}
        ${sw('taste ranking', true, 'bangers teach the feed')}
        <div style="display:flex;gap:22px;align-items:center;padding-top:16px">
          <div class="st2-knob"></div>
          <div><div style="font-weight:700;font-size:14px">theme</div><div class="k-note">paper ← → void. a knob, because themes are analog.</div></div>
          <div style="margin-left:auto;display:flex;gap:8px"><button class="k-btn sm yellow">export pile</button></div>
        </div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['anatomy', 'physical toggles + one knob on a mounted panel'], ['tone', 'appliance'], ['scope', 'routine settings only; destructive actions live in SET-9'], ['a11y', 'switches are buttons with aria-pressed under the hood']])}
  </div>`;
};

/* ---- SET-3 bios screen ---- */
SPECS['SET-3'] = (m) => {
  css('SET-3', `.st3 { background:#0000aa; color:#fff; font-family:var(--mono); flex:1; padding:26px 30px; font-size:13px; line-height:1.9; }
  .st3 .hd { background:#aaa; color:#0000aa; font-weight:700; padding:2px 10px; display:inline-block; }
  .st3 .sel { background:#ff5555; color:#fff; padding:0 6px; }
  .st3 .val { color:#ffff55; }`);
  m.innerHTML = `
  <div class="k-page">
    <div class="st3">
      <div class="hd">SPLOOT SETUP UTILITY — v2026.07</div>
      <br><br>
      <div>&gt; account.email ............ <span class="val">${SET_DATA.email}</span></div>
      <div>&gt; account.plan ............. <span class="val">free forever</span></div>
      <div><span class="sel">&gt; embeddings.model ......... siglip-base [768]</span></div>
      <div>&gt; embeddings.status ........ <span class="val">1479/1482 OK, 3 RETRY</span></div>
      <div>&gt; storage.used ............. <span class="val">412 MB</span></div>
      <div>&gt; theme .................... <span class="val">PAPER</span> / void</div>
      <div>&gt; sort.default ............. <span class="val">SHUFFLE</span></div>
      <div>&gt; social_features .......... <span class="val">DISABLED (PERMANENTLY)</span></div>
      <div>&gt; danger.delete_all ........ [press and hold DEL]</div>
      <br><br>
      <div style="border-top:2px solid #aaa;padding-top:10px">↑↓ select · ENTER change · F10 save & exit · ESC flee</div>
    </div>
    ${labSpec([['anatomy', 'bios setup screen, dotted leaders, keyboard-first'], ['tone', 'deadpan-technical maximum'], ['joke that is also true', 'social_features: DISABLED (PERMANENTLY)'], ['risk', 'novelty page; superb as an easter egg (konami at /settings?)']])}
  </div>`;
};

/* ---- SET-4 printed manifest ---- */
SPECS['SET-4'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:600px;margin:0 auto;padding:34px 26px;width:100%">
      <div style="background:#fff;border:var(--b);box-shadow:var(--shadow);padding:30px;font-family:var(--mono);font-size:12px;line-height:2.1">
        <div style="text-align:center;font-family:var(--display);font-size:22px;margin-bottom:6px">CERTIFICATE OF OWNERSHIP</div>
        <div style="text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.2em;margin-bottom:18px">sploot registry of piles</div>
        this certifies that <b style="background:var(--yellow)">${SET_DATA.email}</b><br>
        is the sole owner and operator of<br>
        <b>one (1) pile</b>, comprising <b>1,482 memes</b> (412 mb),<br>
        of which <b>1,479</b> are embedded and searchable<br>
        and <b>47</b> are certified bangers.<br><br>
        model in service: siglip-base · 768-dim<br>
        theme of record: paper · sort of record: shuffle<br><br>
        <div style="display:flex;justify-content:space-between;align-items:flex-end">
          <div>signed,<br><span style="font-family:'Caveat',cursive;font-size:26px">the pile</span></div>
          <div style="border:3px double #a02020;color:#a02020;padding:6px 12px;transform:rotate(-5deg);font-size:10px;text-transform:uppercase">registered · 2026</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:center">
        <button class="k-btn sm">amend certificate (edit)</button>
        <button class="k-btn sm yellow">export the estate</button>
        <button class="k-btn sm" style="background:var(--orange);color:#fff">revoke everything</button>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['anatomy', 'settings as a certificate: read first, edit second'], ['tone', 'mock-institutional'], ['payoff', 'the ownership/privacy promise becomes a document you can feel'], ['note', 'edits open focused dialogs; the page stays a certificate']])}
  </div>`;
};

/* ---- SET-5 patch bay rack ---- */
SPECS['SET-5'] = (m) => {
  css('SET-5', `.st5-unit { border:3px solid #222; background:#2c2c2e; color:#ddd; padding:14px 18px; display:flex; align-items:center; gap:16px; position:relative; }
  .st5-unit::before, .st5-unit::after { content:"◉"; color:#666; position:absolute; top:50%; transform:translateY(-50%); font-size:10px; }
  .st5-unit::before { left:6px; } .st5-unit::after { right:6px; }
  .st5-led { width:8px; height:8px; border-radius:50%; flex:none; }
  .st5-lbl { font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:#999; width:110px; flex:none; }`);
  const unit = (lbl, body, led) => `<div class="st5-unit"><span class="st5-lbl">${lbl}</span>${body}<span class="st5-led" style="background:${led};margin-left:auto;box-shadow:0 0 8px ${led}"></span></div>`;
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:720px;margin:0 auto;padding:34px 26px;width:100%;display:flex;flex-direction:column;gap:4px">
      <h2 class="k-h1" style="font-size:34px;margin-bottom:14px">the rack</h2>
      ${unit('account', `<span style="font-family:var(--mono);font-size:13px">${SET_DATA.email} · free forever</span>`, 'var(--lime)')}
      ${unit('embedder', `<span style="font-family:var(--mono);font-size:13px">siglip-base · 768d · <b style="color:#ffb400">3 in queue</b></span><button class="k-btn sm" style="margin-left:12px">repatch</button>`, '#ffb400')}
      ${unit('storage', `<span style="font-family:var(--mono);font-size:13px">412 MB · <span style="color:#7ec8ff">headroom fine</span></span><button class="k-btn sm" style="margin-left:12px">export</button>`, 'var(--lime)')}
      ${unit('theme', `<span style="font-family:var(--mono);font-size:13px">PAPER ▸ VOID</span><button class="k-btn sm" style="margin-left:12px">flip</button>`, 'var(--cyan)')}
      ${unit('danger', `<span style="font-family:var(--mono);font-size:13px;color:#ff6b5a">master erase · unscrews everything</span><button class="k-btn sm" style="margin-left:12px;background:var(--orange);color:#fff">hold 3s</button>`, '#ff3333')}
      <span class="k-note" style="margin-top:12px">each setting is a rack unit with a status led. green = patched and humming.</span>
    </div>
    ${kStatusbar()}
    ${labSpec([['anatomy', 'audio rack: one 1U unit per concern, LEDs tell the truth'], ['tone', 'roadie'], ['payoff', 'system health is visible per-setting, not buried in a status page'], ['pairs with', 'GRID-10 terminal, COMP-5 segment display']])}
  </div>`;
};

/* ---- SET-6 game options ---- */
SPECS['SET-6'] = (m) => {
  css('SET-6', `.st6-row { display:flex; justify-content:space-between; align-items:center; padding:12px 18px; font-family:var(--mono); font-size:14px; }
  .st6-row.sel { background:var(--yellow); border:3px solid var(--ink); font-weight:700; }
  .st6-arrows { display:flex; gap:14px; align-items:center; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="flex:1;display:grid;place-items:center;padding:26px">
      <div style="max-width:560px;width:100%;border:var(--b-thick);background:#fff;box-shadow:var(--shadow-lg)">
        <div style="background:var(--ink);color:#fff;font-family:var(--display);font-size:20px;padding:12px 18px;text-transform:uppercase">options</div>
        <div style="padding:10px">
          <div class="st6-row sel"><span>▸ difficulty</span><span class="st6-arrows">◀ <b>no folders</b> ▶</span></div>
          <div class="st6-row"><span>sort mode</span><span class="st6-arrows">◀ shuffle ▶</span></div>
          <div class="st6-row"><span>theme</span><span class="st6-arrows">◀ paper ▶</span></div>
          <div class="st6-row"><span>auto-embed</span><span class="st6-arrows">◀ on ▶</span></div>
          <div class="st6-row"><span>taste ranking</span><span class="st6-arrows">◀ on ▶</span></div>
          <div class="st6-row"><span>account</span><span style="opacity:.6">${SET_DATA.email}</span></div>
          <div class="st6-row" style="color:var(--orange)"><span>delete save file</span><span>hold ✕</span></div>
        </div>
        <div style="border-top:3px solid var(--ink);padding:10px 18px;font-family:var(--mono);font-size:10px;display:flex;gap:16px;text-transform:uppercase">
          <span>↑↓ move</span><span>◀▶ change</span><span>esc back</span><span style="margin-left:auto">save slot: the cloud</span>
        </div>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['anatomy', 'game options menu with ◀ ▶ value steppers'], ['tone', 'playful'], ['joke that is true', 'difficulty: no folders (it cannot be changed)'], ['a11y', 'steppers are radios; full keyboard nav is native to the metaphor']])}
  </div>`;
};

/* ---- SET-7 index card stack ---- */
SPECS['SET-7'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:680px;margin:0 auto;padding:34px 26px;width:100%;display:flex;flex-direction:column;gap:0">
      <h2 class="k-h1" style="font-size:34px;margin-bottom:18px">the paperwork</h2>
      ${[
        ['account', `${SET_DATA.email} · free forever`, 'manage', '-1.2deg'],
        ['embeddings', '1,479 of 1,482 done · 3 stuck', 'retry all', '0.8deg'],
        ['storage', '412 mb · export anytime, it is yours', 'export zip', '-0.6deg'],
        ['appearance', 'paper theme · void available', 'flip theme', '1.1deg'],
      ].map(([t, v, b, r]) => `
      <div style="background:#fffdf4;border:2px solid #c9bfa5;box-shadow:3px 4px 0 rgba(10,10,10,.2);padding:14px 18px;margin-bottom:-6px;transform:rotate(${r});display:flex;justify-content:space-between;align-items:center">
        <div><div style="font-family:var(--mono);font-size:10px;text-transform:uppercase;color:#a02020">${t}</div>
        <div style="font-family:var(--mono);font-size:13px;margin-top:4px">${v}</div></div>
        <button class="k-btn sm">${b}</button>
      </div>`).join('')}
      <div style="background:#fff0f0;border:2px solid var(--orange);box-shadow:3px 4px 0 rgba(10,10,10,.2);padding:14px 18px;transform:rotate(-0.9deg);display:flex;justify-content:space-between;align-items:center">
        <div><div style="font-family:var(--mono);font-size:10px;text-transform:uppercase;color:var(--orange)">the red card</div>
        <div style="font-family:var(--mono);font-size:13px;margin-top:4px">shred the entire pile. no undo. we will be sad.</div></div>
        <button class="k-btn sm" style="background:var(--orange);color:#fff">shred</button>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['anatomy', 'a loose stack of index cards, one per setting'], ['tone', 'quiet, analog'], ['signature', 'danger zone is literally "the red card"'], ['pairs with', 'COMP-10 index cards']])}
  </div>`;
};

/* ---- SET-8 zine colophon ---- */
SPECS['SET-8'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:560px;margin:0 auto;padding:40px 26px;width:100%">
      <div style="border-left:6px solid var(--ink);padding-left:22px;display:flex;flex-direction:column;gap:18px">
        <div>
          <div class="k-eyebrow">colophon</div>
          <h2 class="k-h1" style="font-size:40px;margin-top:6px">this pile was<br>made by you</h2>
        </div>
        <p style="font-size:15px;line-height:1.65">
          <b>publisher:</b> ${SET_DATA.email} <button class="k-btn sm ghost">edit</button><br>
          <b>edition:</b> 1,482 images, ongoing<br>
          <b>typeset in:</b> archivo black, space grotesk, space mono<br>
          <b>indexed by:</b> siglip-base, 768 dimensions<br>
          <b>printed on:</b> unbleached paper theme <button class="k-btn sm ghost">switch to void</button><br>
          <b>circulation:</b> 1. it will always be 1.
        </p>
        <p style="font-size:15px;line-height:1.65">
          three images are still at the printer <button class="k-btn sm ghost">hurry them up</button>.<br>
          back issues export as one zip <button class="k-btn sm ghost">export</button>.
        </p>
        <p style="font-size:13px;line-height:1.6;border-top:3px solid var(--ink);padding-top:14px">
          to pulp the entire print run and salt the earth:
          <button class="k-btn sm" style="background:var(--orange);color:#fff">pulp it</button>
        </p>
      </div>
    </div>
    ${kStatusbar()}
    ${labSpec([['anatomy', 'settings written as a zine colophon — prose with inline actions'], ['tone', 'literary deadpan'], ['payoff', 'the page reads like the product talks; every fact is a real setting'], ['risk', 'scanning speed lower than a form; charm higher']])}
  </div>`;
};

/* ---- SET-9 hazard danger zone ---- */
SPECS['SET-9'] = (m) => {
  css('SET-9', `.st9-hazard { background:repeating-linear-gradient(45deg, var(--yellow) 0 22px, var(--ink) 22px 44px); padding:8px; }
  .st9-gate { border:var(--b-thick); background:#fff; padding:18px; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:680px;margin:0 auto;padding:34px 26px;width:100%;display:flex;flex-direction:column;gap:16px">
      <h2 class="k-h1" style="font-size:34px">settings</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="k-stat"><div class="k-stat-label">account</div><div class="k-stat-value" style="font-size:15px">${SET_DATA.email}</div></div>
        <div class="k-stat yellow"><div class="k-stat-label">embedded</div><div class="k-stat-value" style="font-size:22px">1,479/1,482</div></div>
        <div class="k-stat blue"><div class="k-stat-label">storage</div><div class="k-stat-value" style="font-size:22px">412mb</div></div>
        <div class="k-stat"><div class="k-stat-label">theme</div><div class="k-stat-value" style="font-size:22px">paper</div></div>
      </div>
      <div class="st9-hazard">
        <div class="st9-gate">
          <div class="k-eyebrow" style="margin-bottom:8px">⚠ restricted area · authorized owner only</div>
          <p style="font-size:14px;margin-bottom:12px">actions beyond this tape cannot be undone. the pile does not come back.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="k-btn sm">export first (smart)</button>
            <button class="k-btn sm" style="background:var(--orange);color:#fff">delete all 1,482 memes</button>
            <button class="k-btn sm" style="background:var(--ink);color:#fff">close account</button>
          </div>
        </div>
      </div>
      <span class="k-note">normal settings are stat blocks you click. destruction lives behind physical hazard tape.</span>
    </div>
    ${kStatusbar()}
    ${labSpec([['anatomy', 'stats-as-settings + a literal hazard-striped danger zone'], ['tone', 'osha'], ['signature', 'the tape pattern is the one place yellow+ink stripes are allowed'], ['payoff', 'destructive actions get real friction, visually']])}
  </div>`;
};

/* ---- SET-10 config file ---- */
SPECS['SET-10'] = (m) => {
  css('SET-10', `.st10 { background:var(--void); color:#dfe8e2; font-family:var(--mono); font-size:13px; line-height:1.9; padding:24px 28px; border:var(--b); }
  .st10 .k { color:var(--cyan); } .st10 .v { color:var(--yellow); } .st10 .c { color:#7a8a80; } .st10 .edit { border-bottom:2px dashed var(--lime); cursor:pointer; }`);
  m.innerHTML = `
  <div class="k-page">
    ${kMast()}
    <div style="max-width:720px;margin:0 auto;padding:34px 26px;width:100%;display:flex;flex-direction:column;gap:12px">
      <h2 class="k-h1" style="font-size:34px">sploot.toml</h2>
      <div class="st10">
        <div class="c"># your pile, as a file. click a value to change it.</div>
        <div><span class="k">[account]</span></div>
        <div><span class="k">email</span> = <span class="v edit">"${SET_DATA.email}"</span></div>
        <div><span class="k">plan</span> = <span class="v">"free-forever"</span> <span class="c"># not editable. not kidding.</span></div>
        <br>
        <div><span class="k">[embeddings]</span></div>
        <div><span class="k">model</span> = <span class="v">"siglip-base"</span>  <span class="c"># 768-dim</span></div>
        <div><span class="k">status</span> = <span class="v">"1479/1482"</span> <span class="c"># 3 stuck → <span class="edit" style="color:var(--lime)">retry()</span></span></div>
        <br>
        <div><span class="k">[interface]</span></div>
        <div><span class="k">theme</span> = <span class="v edit">"paper"</span> <span class="c"># or "void"</span></div>
        <div><span class="k">default_sort</span> = <span class="v edit">"shuffle"</span></div>
        <div><span class="k">folders</span> = <span class="v">false</span> <span class="c"># readonly since the beginning of time</span></div>
        <br>
        <div><span class="k">[danger]</span></div>
        <div><span class="k">delete_everything</span> = <span class="c"># uncomment at your own risk</span></div>
      </div>
      <span class="k-note">the exposed database, exposed one level further. clicking a dashed value opens a real editor.</span>
    </div>
    ${kStatusbar()}
    ${labSpec([['anatomy', 'settings rendered as an editable config file'], ['tone', 'developer-native'], ['signature', '"folders = false # readonly" — doctrine as a comment'], ['audience', 'the tui/terminal wing of the fanbase']])}
  </div>`;
};
