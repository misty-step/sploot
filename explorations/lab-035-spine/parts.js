/* lab 035 shared parts — corpus + shipped-kit builders. The toybox system is
   FIXED (frame.css carries the shipped tokens/classes); lanes vary content,
   layout, structure, and hierarchy only, composing these builders. */
'use strict';

const SPECS = {};

function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; }
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

/* fixed corpus — real repo media, served when the lab runs from repo root */
const MEMES = [
  { img: 'side-eye-cat.jpg',     cap: 'the cat is judging your commit history', file: 'IMG_2041.png',        vec: '0413', score: 94, banger: true,  aspect: '4 / 5'  },
  { img: 'crying-thumbs-up.jpg', cap: "it's fine. we ball.",                    file: 'weball_final.png',    vec: '0088', score: 91, banger: false, aspect: '1 / 1'  },
  { img: 'hundred-points.jpg',   cap: 'certified banger. one hundred points.',  file: 'hundo.png',           vec: '1201', score: 88, banger: true,  aspect: '3 / 4'  },
  { img: 'dog-burning-room.jpg', cap: 'everything is on fire and that is fine', file: 'finedog.png',         vec: '0777', score: 83, banger: false, aspect: '16 / 9' },
  { img: 'skeleton-bench.jpg',   cap: 'me waiting for the embeddings to finish',file: 'IMG_0388.jpg',        vec: '0002', score: 79, banger: true,  aspect: '1 / 1'  },
  { img: 'cats-arguing.jpg',     cap: 'me explaining the lore to my cat',       file: 'lore.png',            vec: '0651', score: 74, banger: false, aspect: '5 / 4'  },
  { img: 'group-chat-phone.jpg', cap: 'the group chat at 2:47am',               file: 'IMG_7742.png',        vec: '0930', score: 68, banger: false, aspect: '9 / 16' },
  { img: 'galaxy-brain.jpg',     cap: 'galaxy brain take at 3am',               file: 'brain2.jpg',          vec: '0512', score: 61, banger: false, aspect: '4 / 3'  },
  { img: 'side-eye-cat.jpg',     cap: 'he is simply a little guy',              file: 'littleguy.png',       vec: '0044', score: 57, banger: true,  aspect: '3 / 5'  },
  { img: 'skeleton-bench.jpg',   cap: 'zero thoughts. head empty.',             file: 'zerothoughts.jpg',    vec: '1188', score: 52, banger: false, aspect: '1 / 1'  },
  { img: 'hundred-points.jpg',   cap: 'rating the work fridge sandwich',        file: 'IMG_9917.jpg',        vec: '0345', score: 44, banger: false, aspect: '3 / 2'  },
  { img: 'group-chat-phone.jpg', cap: 'the spreadsheet cell that broke me',     file: 'screenshot_2291.png', vec: '0290', score: 38, banger: false, aspect: '9 / 16' },
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

function memeImg(m) {
  return `<img src="../../apps/web/public/starter-pile/${m.img}" alt="${esc(m.cap)}" loading="eager">`;
}

/* ---------- the SHIPPED toybox kit (compose, never restyle) ---------- */
const ICONS = {
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>`,
  share: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7"/></svg>`,
  shuffle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>`,
  pile: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v5H4zM4 14h16v5H4z"/></svg>`,
};
function kCtl(icon, label, extra = '') {
  return `<button type="button" class="t-ctl ${extra}" aria-label="${label}" title="${label}">${ICONS[icon]}</button>`;
}
function kRail(banger = false) {
  return `<div class="rail" aria-label="meme actions">${kCtl('heart', banger ? 'remove banger' : 'mark as banger', banger ? 'hearted' : '')}${kCtl('share', 'share meme')}${kCtl('trash', 'delete meme')}</div>`;
}
function kCell(m, state = '', opts = {}) {
  return `<article class="t-cell ${state}">
    <div class="media" style="aspect-ratio:${m.aspect}">${memeImg(m)}</div>
    ${opts.noCap ? '' : `<div class="cap"><span>${esc(m.cap)}</span>${opts.score ? `<b>${(m.score / 100).toFixed(2)}</b>` : ''}</div>`}
    ${opts.noRail ? '' : kRail(!!m.banger)}
  </article>`;
}
function kConsole(q = 'cat losing it', opts = {}) {
  return `<div class="t-console">
    <div class="top"><b>meme finder 3000</b><span>${LIB.model} · ${LIB.latency}ms</span></div>
    <div class="bodyrow"><label><span>find:</span><input value="${esc(q)}" aria-label="search the pile"></label><button class="t-btn primary t-press">find it</button></div>
    ${opts.noMachine ? '' : `<div class="machine"><span>index ${LIB.total.toLocaleString()}</span><span>dim ${LIB.dim}</span><span>queue ${LIB.queued}</span><span>machine <i></i> live</span></div>`}
  </div>`;
}
function kStatus() {
  return `<div class="t-status"><span>index ${LIB.total.toLocaleString()}</span><span>model ${LIB.model}</span><span>queue ${LIB.queued} cooking</span><span class="live">live</span></div>`;
}
function kPiles(sel = 0) {
  return PILES.slice(0, 5).map((p, i) => `<button class="t-pile t-press-sm ${i === sel ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.n}</b></button>`).join('');
}
function kMast(links = ['the pile', 'bangers', 'settings', 'sign in']) {
  return `<header class="t-mast"><span class="t-logo">spl<i>oo</i>t</span><nav style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${links.map((l) => `<a href="#0" style="color:var(--ink);text-decoration:none;font-weight:800;padding:7px 12px;border-radius:999px">${l}</a>`).join('')}${kCtl('sun', 'switch theme')}</nav></header>`;
}
function labSpec(fields) {
  return `<div class="lab-spec">${fields.map(([k, v]) => `<span><b>${k}</b> ${v}</span>`).join('')}</div>`;
}
function themeToggle(root) {
  if (!root) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'lab-theme-toggle';
  btn.textContent = '◐ dark';
  btn.onclick = () => {
    const on = root.classList.toggle('theme-dark');
    btn.textContent = on ? '◑ light' : '◐ dark';
  };
  root.appendChild(btn);
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="#0"]');
  if (a) e.preventDefault();
});
