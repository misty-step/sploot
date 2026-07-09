/* lab 033 · section AUTH — sign-in (the door).
   fixed: clerk does the actual auth; this designs the room around it.
   varies: the door metaphor. privacy promise on every option. */
'use strict';

const AUTH_FORM = `
  <div style="display:flex;flex-direction:column;gap:10px">
    <button class="k-btn" style="width:100%">continue with google</button>
    <button class="k-btn" style="width:100%">continue with apple</button>
    <div style="display:flex;align-items:center;gap:10px" class="k-note"><span style="flex:1;border-top:2px solid var(--ink)"></span>or<span style="flex:1;border-top:2px solid var(--ink)"></span></div>
    <div style="display:flex;border:3px solid var(--ink);background:#fff">
      <span style="flex:1;padding:10px 12px;font-family:var(--mono);font-size:12px;opacity:.5">email for a magic link</span>
      <button style="border:0;border-left:3px solid var(--ink);background:var(--blue);color:#fff;font-family:var(--mono);font-size:11px;padding:0 14px">send</button>
    </div>
  </div>`;
const AUTH_PROMISE = `<span class="k-note">private by default · no feed · no ads · leave anytime with a zip</span>`;

/* ---- AUTH-1 baseline: centered card ---- */
SPECS['AUTH-1'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    <div style="flex:1;display:grid;place-items:center;padding:26px">
      <div style="width:min(380px,100%);border:var(--b);background:#fff;box-shadow:var(--shadow);padding:26px;display:flex;flex-direction:column;gap:16px">
        <div class="k-logo" style="font-size:26px">sploot</div>
        <div style="font-size:14px">sign in to your pile</div>
        ${AUTH_FORM}
        ${AUTH_PROMISE}
      </div>
    </div>
    ${kStatusbar([['route', '/sign-in'], ['auth', 'clerk'], ['mode', 'production'], ['status', 'live', true]])}
    ${labSpec([['door', 'ROUND 2 · centered clerk card'], ['feel', 'private, direct, familiar'], ['responsive', 'one card, full-width safe on mobile']])}
  </div>`;
};

/* ---- AUTH-2 bouncer at the door ---- */
SPECS['AUTH-2'] = (m) => {
  m.innerHTML = `
  <div class="k-page" style="background:var(--void)">
    <div style="flex:1;display:grid;place-items:center;padding:26px">
      <div style="display:flex;gap:0;max-width:760px;width:100%">
        <div style="flex:1;border:var(--b);border-right:0;background:#181818;color:#fff;padding:30px;display:flex;flex-direction:column;gap:14px;justify-content:center">
          <div style="font-family:var(--display);font-size:34px;line-height:.95">private<br>pile.</div>
          <div style="font-family:var(--mono);font-size:12px;line-height:1.9;color:#bbb">
            capacity: 1<br>guest list: you<br>dress code: pajamas acceptable<br>cover: $0
          </div>
          <div style="border:3px solid var(--magenta);color:var(--magenta);font-family:var(--mono);font-size:11px;padding:8px 10px;text-transform:uppercase">if your name's not on the list, there is no list. it's just you.</div>
        </div>
        <div style="width:340px;border:var(--b);background:var(--paper);padding:26px;display:flex;flex-direction:column;gap:14px">
          <div class="k-eyebrow">prove it's you</div>
          ${AUTH_FORM}
          ${AUTH_PROMISE}
        </div>
      </div>
    </div>
    ${labSpec([['door', 'velvet rope: club exterior + id check'], ['voice', '"capacity: 1" does the privacy pitch better than a paragraph'], ['feel', 'exclusive, but the joke is it excludes everyone but you']])}
  </div>`;
};

/* ---- AUTH-3 library card application ---- */
SPECS['AUTH-3'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    <div style="flex:1;display:grid;place-items:center;padding:26px">
      <div style="width:440px;background:#f7f0dd;border:2px solid #b9a988;box-shadow:var(--shadow);padding:26px;font-family:var(--mono)">
        <div style="text-align:center;font-family:'Fraunces',serif;font-weight:600;font-size:22px">sploot public library</div>
        <div style="text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.18em;margin:4px 0 18px">application for reader's card</div>
        <div style="font-size:12px;line-height:2.4">
          name: <span style="border-bottom:2px solid #241a10;display:inline-block;width:240px"></span><br>
          reason for visit: <b style="background:var(--yellow)">my memes</b><br>
          books read this year: <span style="opacity:.5">(not relevant)</span>
        </div>
        <div style="margin:16px 0">${AUTH_FORM}</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:10px;opacity:.7">stamped: JUL 08 2026</span>
          <span style="border:3px double #a02020;color:#a02020;padding:3px 10px;font-size:10px;transform:rotate(-4deg);text-transform:uppercase">approved instantly</span>
        </div>
      </div>
    </div>
    ${kStatusbar([['route', '/sign-in'], ['auth', 'clerk'], ['fines', 'abolished'], ['status', 'live', true]])}
    ${labSpec([['door', 'library card application, pre-approved'], ['pairs with', 'DNA-12 card catalog'], ['voice', '"books read this year: (not relevant)"'], ['feel', 'gentle, institutional, warm']])}
  </div>`;
};

/* ---- AUTH-4 staff badge lanyard ---- */
SPECS['AUTH-4'] = (m) => {
  css('AUTH-4', `.a4-badge { width:340px; border:var(--b-thick); background:#fff; box-shadow:var(--shadow-lg); position:relative; }
  .a4-badge::before { content:""; position:absolute; top:-60px; left:50%; transform:translateX(-50%); width:24px; height:64px; background:repeating-linear-gradient(0deg, var(--magenta) 0 8px, var(--ink) 8px 16px); }
  .a4-badge .clip { position:absolute; top:-14px; left:50%; transform:translateX(-50%); width:44px; height:18px; border:4px solid var(--ink); background:#ccc; }`);
  m.innerHTML = `
  <div class="k-page">
    <div style="flex:1;display:grid;place-items:center;padding:60px 26px 26px">
      <div class="a4-badge">
        <span class="clip"></span>
        <div style="background:var(--ink);color:#fff;padding:14px 18px;font-family:var(--display);font-size:18px;text-transform:uppercase">sploot hq · all access</div>
        <div style="padding:20px;display:flex;flex-direction:column;gap:14px">
          <div style="display:flex;gap:14px;align-items:center">
            <div style="width:74px;height:74px;border:3px solid var(--ink);background:var(--cyan);display:grid;place-items:center;font-family:var(--display);font-size:32px">?</div>
            <div style="font-family:var(--mono);font-size:11px;line-height:1.8">
              name: <b>pending</b><br>role: <b>owner of the pile</b><br>clearance: <b>all of it</b>
            </div>
          </div>
          ${AUTH_FORM}
          ${AUTH_PROMISE}
        </div>
      </div>
    </div>
    ${labSpec([['door', 'employee badge: signing in prints your credentials'], ['feel', 'you work here. it is your archive.'], ['detail', 'lanyard strap in banger magenta'], ['post-auth', 'the ? photo becomes your avatar']])}
  </div>`;
};

/* ---- AUTH-5 keypad entry ---- */
SPECS['AUTH-5'] = (m) => {
  css('AUTH-5', `.a5-key { border:3px solid var(--ink); background:#fff; font-family:var(--mono); font-size:16px; font-weight:700; aspect-ratio:1.4; display:grid; place-items:center; box-shadow:0 4px 0 var(--ink); }
  .a5-key:active { transform:translateY(4px); box-shadow:none; }`);
  m.innerHTML = `
  <div class="k-page" style="background:var(--paper-warm)">
    <div style="flex:1;display:grid;place-items:center;padding:26px">
      <div style="width:360px;border:var(--b-thick);background:var(--paper);box-shadow:var(--shadow-lg);padding:22px;display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="k-eyebrow">service entrance</span>
          <span style="width:10px;height:10px;border-radius:50%;background:var(--orange)"></span>
        </div>
        <div style="border:3px solid var(--ink);background:var(--void);color:var(--lime);font-family:var(--mono);font-size:14px;padding:12px 14px;letter-spacing:4px">● ● ● _ _ _</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${[1,2,3,4,5,6,7,8,9,'✕',0,'↵'].map(k => `<button class="a5-key">${k}</button>`).join('')}
        </div>
        <div class="k-note" style="text-align:center">just kidding. we use magic links like adults.</div>
        ${AUTH_FORM}
      </div>
    </div>
    ${labSpec([['door', 'a keypad that admits it is a bit, then hands you the real form'], ['feel', 'the joke defuses sign-in friction'], ['risk', 'one-time laugh; must never slow a returning user (remember-me skips it)']])}
  </div>`;
};

/* ---- AUTH-6 guestbook ---- */
SPECS['AUTH-6'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    <div style="flex:1;display:grid;place-items:center;padding:26px">
      <div style="width:480px;background:#fff;border:var(--b);box-shadow:var(--shadow);padding:30px">
        <div style="font-family:'Fraunces',serif;font-style:italic;font-size:26px;text-align:center">the pile guestbook</div>
        <div style="font-family:var(--mono);font-size:10px;text-transform:uppercase;text-align:center;letter-spacing:.14em;margin:6px 0 20px">every visitor so far</div>
        <div style="font-family:'Caveat',cursive;font-size:22px;line-height:2;border-top:1px solid #ccc;border-bottom:1px solid #ccc;padding:12px 4px;margin-bottom:18px">
          you — "just looking for the cat one"<br>
          you — "back again"<br>
          you — "it was the frog actually"<br>
          <span style="opacity:.45">(sign below to continue the streak)</span>
        </div>
        ${AUTH_FORM}
        <div style="margin-top:14px">${AUTH_PROMISE}</div>
      </div>
    </div>
    ${labSpec([['door', 'guestbook where every entry is you'], ['voice', 'the visitor log IS the privacy proof'], ['feel', 'cozy; the least corporate sign-in imaginable']])}
  </div>`;
};

/* ---- AUTH-7 ticket booth ---- */
SPECS['AUTH-7'] = (m) => {
  css('AUTH-7', `.a7-booth { border:var(--b-thick); background:var(--magenta); padding:22px; box-shadow:var(--shadow-lg); }
  .a7-window { background:var(--paper); border:var(--b); padding:22px; }`);
  m.innerHTML = `
  <div class="k-page" style="background:var(--void)">
    <div style="flex:1;display:grid;place-items:center;padding:26px">
      <div class="a7-booth" style="width:420px">
        <div style="font-family:var(--display);color:#fff;font-size:24px;text-transform:uppercase;text-align:center;margin-bottom:14px">box office</div>
        <div class="a7-window">
          <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px;margin-bottom:14px">
            <span>NOW SHOWING: YOUR PILE</span><span>seats: 1</span>
          </div>
          ${AUTH_FORM}
          <div style="margin-top:14px;border:3px dashed var(--ink);padding:8px 12px;font-family:var(--mono);font-size:11px;display:flex;justify-content:space-between">
            <span>admit one (1) archivist</span><b>$0.00</b>
          </div>
        </div>
      </div>
    </div>
    ${labSpec([['door', 'cinema box office; signing in buys the eternal ticket'], ['pairs with', 'COMP-8 ticket stubs'], ['feel', 'event energy for a daily tool; fun for first-run, fine forever']])}
  </div>`;
};

/* ---- AUTH-8 passport control ---- */
SPECS['AUTH-8'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;min-height:0">
      <div style="border-right:var(--b);background:var(--paper-warm);display:grid;place-items:center;padding:30px">
        <div style="max-width:320px;display:flex;flex-direction:column;gap:14px">
          <div style="font-family:var(--display);font-size:40px;line-height:.92">border of<br>the pile</div>
          <div style="font-family:var(--mono);font-size:12px;line-height:2">
            citizens: 1<br>visa policy: it's you or nobody<br>customs: nothing to declare, ever<br>extradition: your memes never leave
          </div>
        </div>
      </div>
      <div style="display:grid;place-items:center;padding:30px">
        <div style="width:340px;border:var(--b);background:#fff;box-shadow:var(--shadow);padding:24px;display:flex;flex-direction:column;gap:14px">
          <div class="k-eyebrow">passport control</div>
          ${AUTH_FORM}
          <div style="align-self:flex-start;border:3px double #1f4cff;color:#1f4cff;font-family:var(--mono);font-size:10px;text-transform:uppercase;padding:4px 10px;transform:rotate(-4deg)">re-entry: unlimited</div>
        </div>
      </div>
    </div>
    ${labSpec([['door', 'border crossing into sovereign meme territory'], ['pairs with', 'COMP-4 passport stamps'], ['voice', '"extradition: your memes never leave" = the data promise, in character']])}
  </div>`;
};

/* ---- AUTH-9 locker combo ---- */
SPECS['AUTH-9'] = (m) => {
  css('AUTH-9', `.a9-locker { border:var(--b-thick); background:#2c52d8; padding:26px; box-shadow:var(--shadow-lg); position:relative; }
  .a9-vents { display:flex; flex-direction:column; gap:5px; margin-bottom:16px; }
  .a9-vents i { height:5px; background:rgba(10,10,10,.4); }
  .a9-dial { width:82px; height:82px; border-radius:50%; border:5px solid var(--ink); background:#e8e8e8; margin:0 auto; position:relative; }
  .a9-dial::after { content:""; position:absolute; top:5px; left:50%; width:4px; height:14px; background:var(--ink); transform:translateX(-50%); }`);
  m.innerHTML = `
  <div class="k-page" style="background:var(--paper-warm)">
    <div style="flex:1;display:grid;place-items:center;padding:26px">
      <div class="a9-locker" style="width:380px">
        <div class="a9-vents"><i></i><i></i><i></i></div>
        <div style="font-family:var(--display);color:#fff;font-size:20px;text-transform:uppercase;text-align:center">locker no. 001</div>
        <div style="font-family:var(--mono);color:#cdd8ff;font-size:10px;text-align:center;text-transform:uppercase;margin:4px 0 16px">contents: 1,482 memes · 47 bangers</div>
        <div class="a9-dial"></div>
        <div style="background:var(--paper);border:var(--b);padding:18px;margin-top:16px;display:flex;flex-direction:column;gap:12px">
          <span class="k-note" style="text-align:center">the combination is just being you:</span>
          ${AUTH_FORM}
        </div>
      </div>
    </div>
    ${labSpec([['door', 'gym locker with your stuff visibly counted on the front'], ['feel', 'possession: the pile is IN there, sign in to open it'], ['detail', 'contents line updates with real counts pre-auth-safe (rounded)']])}
  </div>`;
};

/* ---- AUTH-10 hand stamp ---- */
SPECS['AUTH-10'] = (m) => {
  m.innerHTML = `
  <div class="k-page">
    <div style="flex:1;display:grid;place-items:center;padding:26px">
      <div style="display:flex;flex-direction:column;align-items:center;gap:22px;max-width:460px;text-align:center">
        <svg width="180" height="140" viewBox="0 0 120 90">
          <path d="M30 84 v-30 q0-8 8-8 v-14 q0-6 6-6 t6 6 v10 q0-8 6-8 t6 8 v2 q0-8 6-8 t6 8 v4 q0-6 5-6 t5 6 v26 q0 10-10 16 h-30 q-12-2-14-12z" fill="#f3d5b8" stroke="#0a0a0a" stroke-width="4"/>
          <g transform="rotate(-12 62 52)">
            <circle cx="62" cy="52" r="17" fill="none" stroke="#ff2d9b" stroke-width="3.5"/>
            <text x="62" y="57" text-anchor="middle" font-family="Archivo Black" font-size="12" fill="#ff2d9b">spl</text>
          </g>
        </svg>
        <h2 class="k-h1" style="font-size:44px">get stamped,<br>skip the line forever</h2>
        <p style="font-size:14px">one sign-in. the stamp doesn't wash off: sploot remembers this device and never cards you again.</p>
        <div style="width:360px;text-align:left">${AUTH_FORM}</div>
        ${AUTH_PROMISE}
      </div>
    </div>
    ${labSpec([['door', 'club hand stamp as the session metaphor'], ['honesty', '"never cards you again" = long-lived session, stated in-voice'], ['pairs with', 'BRAND-6 rubber stamp seal'], ['feel', 'warm, fast, anti-bureaucratic']])}
  </div>`;
};
