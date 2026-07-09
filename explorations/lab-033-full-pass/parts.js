/* lab 033 shared parts — local meme fixtures, dataset, kit builders. */
'use strict';

const SPECS = {}; // id -> builder(mount)

/* ---------- tiny dom helpers ---------- */
function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content;
}
const CSS_DONE = new Set();
function css(id, str) {
  if (CSS_DONE.has(id)) return;
  CSS_DONE.add(id);
  const s = document.createElement('style');
  s.dataset.for = id;
  s.textContent = str;
  document.head.appendChild(s);
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

/* ---------- credible local meme fixtures ---------- */
/* The registry still calls this helper `doodle` so the round-one builders keep
   their IDs and wiring. It now renders the real, repo-owned starter pile. */
const FIXTURES = {
  cat: 'side-eye-cat.jpg', sploot: 'cats-arguing.jpg', frog: 'hundred-points.jpg',
  skull: 'skeleton-bench.jpg', fire: 'dog-burning-room.jpg', moon: 'galaxy-brain.jpg',
  scream: 'crying-thumbs-up.jpg', pigeon: 'side-eye-cat.jpg', sandwich: 'hundred-points.jpg',
  littleguy: 'group-chat-phone.jpg', judge: 'cats-arguing.jpg', sheet: 'group-chat-phone.jpg',
};
function doodle(kind, pal) {
  const file = FIXTURES[kind] || FIXTURES.cat;
  return `<img class="meme-media" src="../../apps/web/public/starter-pile/${file}" alt="" loading="eager">`;
  /* Round-one SVG source remains below as inert history until the lab closes. */
  const p = Object.assign({ ink: '#0a0a0a', bg: '#ffffff', a: '#ffe600', b: '#00e5d4' }, pal);
  const S = (body) =>
    `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${kind} doodle">
      <rect width="120" height="120" fill="${p.bg}"/>${body}</svg>`;
  const k = {
    cat: `
      <polygon points="30,44 38,24 48,44" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <polygon points="72,44 82,24 90,44" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <rect x="24" y="40" width="72" height="56" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <circle cx="46" cy="62" r="5" fill="${p.ink}"/><circle cx="74" cy="62" r="5" fill="${p.ink}"/>
      <path d="M50 80 q10 8 20 0" stroke="${p.ink}" stroke-width="4" fill="none"/>
      <line x1="16" y1="60" x2="30" y2="62" stroke="${p.ink}" stroke-width="3"/>
      <line x1="90" y1="62" x2="104" y2="60" stroke="${p.ink}" stroke-width="3"/>`,
    sploot: `
      <ellipse cx="60" cy="78" rx="42" ry="20" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <rect x="14" y="88" width="18" height="8" fill="${p.a}" stroke="${p.ink}" stroke-width="3"/>
      <rect x="88" y="88" width="18" height="8" fill="${p.a}" stroke="${p.ink}" stroke-width="3"/>
      <circle cx="60" cy="52" r="22" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <polygon points="42,38 46,22 56,36" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <polygon points="78,38 74,22 64,36" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <circle cx="52" cy="50" r="4" fill="${p.ink}"/><circle cx="68" cy="50" r="4" fill="${p.ink}"/>
      <ellipse cx="60" cy="60" rx="6" ry="4" fill="${p.ink}"/>
      <path d="M54 66 q6 5 12 0" stroke="${p.ink}" stroke-width="3" fill="none"/>`,
    frog: `
      <circle cx="42" cy="40" r="12" fill="${p.b}" stroke="${p.ink}" stroke-width="4"/>
      <circle cx="78" cy="40" r="12" fill="${p.b}" stroke="${p.ink}" stroke-width="4"/>
      <circle cx="42" cy="40" r="4" fill="${p.ink}"/><circle cx="78" cy="40" r="4" fill="${p.ink}"/>
      <rect x="26" y="48" width="68" height="44" rx="0" fill="${p.b}" stroke="${p.ink}" stroke-width="4"/>
      <line x1="40" y1="76" x2="80" y2="76" stroke="${p.ink}" stroke-width="4"/>`,
    skull: `
      <rect x="34" y="26" width="52" height="46" fill="#fff" stroke="${p.ink}" stroke-width="4"/>
      <rect x="42" y="72" width="36" height="18" fill="#fff" stroke="${p.ink}" stroke-width="4"/>
      <circle cx="50" cy="48" r="7" fill="${p.ink}"/><circle cx="70" cy="48" r="7" fill="${p.ink}"/>
      <rect x="56" y="60" width="8" height="8" fill="${p.ink}"/>
      <line x1="48" y1="78" x2="48" y2="88" stroke="${p.ink}" stroke-width="3"/>
      <line x1="60" y1="78" x2="60" y2="88" stroke="${p.ink}" stroke-width="3"/>
      <line x1="72" y1="78" x2="72" y2="88" stroke="${p.ink}" stroke-width="3"/>`,
    fire: `
      <path d="M60 18 q18 22 8 34 q16 -4 14 16 a24 24 0 1 1 -44 0 q-2 -20 14 -16 q-10 -12 8 -34z"
        fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <circle cx="60" cy="82" r="10" fill="${p.b}" stroke="${p.ink}" stroke-width="3"/>`,
    moon: `
      <circle cx="60" cy="60" r="34" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <circle cx="48" cy="50" r="5" fill="${p.ink}"/><circle cx="72" cy="50" r="5" fill="${p.ink}"/>
      <path d="M48 74 q12 10 24 0" stroke="${p.ink}" stroke-width="4" fill="none"/>
      <circle cx="40" cy="66" r="4" fill="${p.ink}" opacity=".25"/>
      <circle cx="80" cy="68" r="4" fill="${p.ink}" opacity=".25"/>`,
    scream: `
      <rect x="32" y="26" width="56" height="66" fill="${p.b}" stroke="${p.ink}" stroke-width="4"/>
      <circle cx="50" cy="50" r="7" fill="#fff" stroke="${p.ink}" stroke-width="3"/>
      <circle cx="72" cy="50" r="7" fill="#fff" stroke="${p.ink}" stroke-width="3"/>
      <circle cx="50" cy="50" r="2.5" fill="${p.ink}"/><circle cx="72" cy="50" r="2.5" fill="${p.ink}"/>
      <ellipse cx="61" cy="74" rx="9" ry="12" fill="${p.ink}"/>
      <line x1="26" y1="34" x2="34" y2="40" stroke="${p.ink}" stroke-width="3"/>
      <line x1="94" y1="34" x2="86" y2="40" stroke="${p.ink}" stroke-width="3"/>`,
    pigeon: `
      <circle cx="74" cy="42" r="14" fill="#c9c9d1" stroke="${p.ink}" stroke-width="4"/>
      <circle cx="78" cy="40" r="3.5" fill="${p.a}" stroke="${p.ink}" stroke-width="2"/>
      <polygon points="86,44 100,46 86,50" fill="${p.a}" stroke="${p.ink}" stroke-width="3"/>
      <ellipse cx="54" cy="70" rx="26" ry="20" fill="#c9c9d1" stroke="${p.ink}" stroke-width="4"/>
      <line x1="48" y1="90" x2="48" y2="100" stroke="${p.ink}" stroke-width="3"/>
      <line x1="62" y1="90" x2="62" y2="100" stroke="${p.ink}" stroke-width="3"/>`,
    sandwich: `
      <rect x="26" y="34" width="68" height="12" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <rect x="22" y="46" width="76" height="8" fill="${p.b}" stroke="${p.ink}" stroke-width="3"/>
      <rect x="26" y="54" width="68" height="8" fill="#fff" stroke="${p.ink}" stroke-width="3"/>
      <rect x="22" y="62" width="76" height="8" fill="${p.b}" stroke="${p.ink}" stroke-width="3"/>
      <rect x="26" y="70" width="68" height="12" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <circle cx="86" cy="30" r="8" fill="none" stroke="${p.ink}" stroke-width="3" stroke-dasharray="4 3"/>`,
    littleguy: `
      <rect x="46" y="34" width="28" height="24" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <circle cx="55" cy="45" r="3" fill="${p.ink}"/><circle cx="66" cy="45" r="3" fill="${p.ink}"/>
      <path d="M55 52 q5 4 10 0" stroke="${p.ink}" stroke-width="3" fill="none"/>
      <rect x="50" y="58" width="20" height="22" fill="${p.b}" stroke="${p.ink}" stroke-width="4"/>
      <line x1="50" y1="64" x2="36" y2="74" stroke="${p.ink}" stroke-width="4"/>
      <line x1="70" y1="64" x2="84" y2="74" stroke="${p.ink}" stroke-width="4"/>
      <line x1="55" y1="80" x2="52" y2="94" stroke="${p.ink}" stroke-width="4"/>
      <line x1="65" y1="80" x2="68" y2="94" stroke="${p.ink}" stroke-width="4"/>`,
    judge: `
      <rect x="30" y="40" width="60" height="50" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <polygon points="34,40 42,24 50,40" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <polygon points="70,40 78,24 86,40" fill="${p.a}" stroke="${p.ink}" stroke-width="4"/>
      <line x1="44" y1="58" x2="56" y2="58" stroke="${p.ink}" stroke-width="5"/>
      <line x1="66" y1="58" x2="78" y2="58" stroke="${p.ink}" stroke-width="5"/>
      <line x1="52" y1="78" x2="70" y2="78" stroke="${p.ink}" stroke-width="4"/>`,
    sheet: `
      <rect x="22" y="26" width="76" height="68" fill="#fff" stroke="${p.ink}" stroke-width="4"/>
      <line x1="22" y1="44" x2="98" y2="44" stroke="${p.ink}" stroke-width="3"/>
      <line x1="22" y1="62" x2="98" y2="62" stroke="${p.ink}" stroke-width="3"/>
      <line x1="22" y1="80" x2="98" y2="80" stroke="${p.ink}" stroke-width="3"/>
      <line x1="60" y1="26" x2="60" y2="94" stroke="${p.ink}" stroke-width="3"/>
      <rect x="60" y="44" width="38" height="18" fill="${p.a}" stroke="${p.ink}" stroke-width="3"/>
      <text x="70" y="58" font-family="monospace" font-size="12" fill="${p.ink}">#REF!</text>`,
  };
  return S(k[kind] || k.cat);
}

/* ---------- the pile: demo dataset ---------- */
const MEMES = [
  { kind: 'cat',      cap: 'cat vibrating at maximum frequency', file: 'IMG_2041.png', vec: '0413', score: 94, banger: true,  bg: '#ffe600', aspect: '4 / 5' },
  { kind: 'scream',   cap: 'screaming into the void (affectionate)', file: 'void_scream.png', vec: '0088', score: 91, banger: false, bg: '#00e5d4', aspect: '1 / 1' },
  { kind: 'frog',     cap: 'the frog that has seen things', file: 'frog_final_FINAL.png', vec: '1201', score: 88, banger: true,  bg: '#f3efe4', aspect: '3 / 4' },
  { kind: 'fire',     cap: 'everything is on fire and that is fine', file: 'finedog.png', vec: '0777', score: 83, banger: false, bg: '#fff', aspect: '16 / 9' },
  { kind: 'sploot',   cap: 'full sploot achieved. zero thoughts.', file: 'IMG_0388.jpg', vec: '0002', score: 79, banger: true,  bg: '#9cff2e', aspect: '1 / 1' },
  { kind: 'judge',    cap: 'the cat is judging your commit history', file: 'judge.png', vec: '0651', score: 74, banger: false, bg: '#fff', aspect: '5 / 4' },
  { kind: 'skull',    cap: 'me after reading the group chat', file: 'IMG_7742.png', vec: '0930', score: 68, banger: false, bg: '#ffe600', aspect: '9 / 16' },
  { kind: 'moon',     cap: 'moon with a face for some reason', file: 'moon2.jpg', vec: '0512', score: 61, banger: false, bg: '#0a0a4a', aspect: '4 / 3' },
  { kind: 'littleguy',cap: 'he is simply a little guy', file: 'littleguy.png', vec: '0044', score: 57, banger: true,  bg: '#fff', aspect: '3 / 5' },
  { kind: 'pigeon',   cap: 'pigeon plotting something', file: 'pigeon4.jpg', vec: '1188', score: 52, banger: false, bg: '#f3efe4', aspect: '1 / 1' },
  { kind: 'sandwich', cap: 'cursed sandwich from the work fridge', file: 'IMG_9917.jpg', vec: '0345', score: 44, banger: false, bg: '#fff', aspect: '3 / 2' },
  { kind: 'sheet',    cap: 'the spreadsheet cell that broke me', file: 'screenshot_2291.png', vec: '0290', score: 38, banger: false, bg: '#f3efe4', aspect: '9 / 16' },
];
const PILES = [
  { name: 'cats being unwell', n: 214 },
  { name: 'reaction faces', n: 187 },
  { name: 'animals mid-crime', n: 96 },
  { name: 'text screenshots', n: 152 },
  { name: 'cursed food', n: 41 },
  { name: 'wholesome (rare)', n: 33 },
];
const LIB = { total: 1482, embedded: 1479, queued: 3, model: 'siglip-base', dim: 768, latency: 212 };

/* ---------- shipped-kit builders ---------- */
function kCell(m, state = '', showScore = false) {
  return `
  <div class="k-cellwrap">
    <div class="k-cell ${state}">
      <div class="head"><span>${esc(m.file)}</span><span>vec ${m.vec}</span></div>
      <div class="art" style="background:${m.bg};aspect-ratio:${m.aspect || '1 / 1'}">${doodle(m.kind)}</div>
      <div class="cap"><span>${esc(m.cap)}</span>${m.banger ? '<span class="k-banger">banger</span>' : ''}</div>
    </div>
    ${showScore ? `<div class="score"><b>${(m.score / 100).toFixed(2)}</b><span>${m.score >= 90 ? 'closest match' : m.score >= 75 ? 'strong match' : 'related'}</span></div>` : ''}
  </div>`;
}
function kConsole(q = 'cat losing it', opts = {}) {
  return `
  <div class="k-console">
    <div class="bar"><span>sploot search console</span><span>v2</span>
      <span class="leds"><i style="background:var(--lime)"></i><i style="background:var(--yellow)"></i><i style="background:var(--magenta)"></i></span>
    </div>
    <div class="shelf">
      <div class="field"><span style="opacity:.55">&gt;</span><span class="q">${esc(q)}</span><span class="caret"></span></div>
      <button class="k-btn primary">find it</button>
    </div>
    <div class="meta">
      <span>index: ${LIB.total.toLocaleString()} vec</span><span>model: ${LIB.model}</span>
      <span>dim: ${LIB.dim}</span><span>${opts.meta || 'route: /api/search'}</span>
    </div>
  </div>`;
}
function kStatusbar(cells) {
  const dflt = [
    ['index', `${LIB.total.toLocaleString()} vec`], ['model', LIB.model],
    ['queue', `${LIB.queued} embedding`], ['route', '/app'], ['status', 'live', true],
  ];
  return `<div class="k-statusbar">${(cells || dflt).map(c =>
    `<div class="cell ${c[2] ? 'ok' : ''}"><b>${c[0]}</b><span>${c[1]}</span></div>`).join('')}</div>`;
}
function kMast(extra = '') {
  return `
  <div class="k-mast">
    <span class="k-logo">sploot</span>
    <div class="k-mast-links">${extra}<a href="#0">the pile</a><a href="#0">bangers</a><a href="#0">settings</a></div>
  </div>`;
}
function labSpec(fields) {
  return `<div class="lab-spec">${fields.map(([k, v]) => `<span><b>${k}</b> ${v}</span>`).join('')}</div>`;
}
/* stop demo links from clobbering the hash router */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="#0"]');
  if (a) e.preventDefault();
});
