/* lab 034 shared parts — corpus + helpers only. Each bench lane owns exactly
   one file in lanes/ and composes these; nothing here is a candidate. */
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

/* ---------- the pile: fixed demo corpus (repo-owned starter-pile media) ----
   Content is constant across every candidate so the operator compares the
   system move, never the content. Paths resolve when the lab is served from
   the REPO ROOT (see README). */
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

/* the one sanctioned way to render a meme: complete media, never cropped */
function memeImg(m) {
  return `<img class="meme-media" src="../../apps/web/public/starter-pile/${m.img}" alt="${esc(m.cap)}" loading="eager">`;
}

/* labeled palette swatch strip for foundations sections */
function swatches(list) {
  return `<div style="display:flex;flex-wrap:wrap;gap:0">${list.map(([n, c, fg]) => `
    <div style="flex:1;min-width:90px;background:${c};color:${fg || '#0a0a0a'};
      font-family:'Space Mono',monospace;font-size:9px;text-transform:uppercase;padding:10px 8px;border-top:2px solid #0a0a0a">
      ${n}<br><b>${c}</b></div>`).join('')}</div>`;
}

/* spec footer strip every option page carries (lab chrome, not product) */
function labSpec(fields) {
  return `<div class="lab-spec">${fields.map(([k, v]) => `<span><b>${k}</b> ${v}</span>`).join('')}</div>`;
}

/* lab-chrome light/dark flip: toggles .theme-dark on the option root.
   Every candidate defines BOTH themes; composite tokens (borders, shadows)
   must be re-declared wherever their color inputs are overridden, or the
   flip will not propagate (custom-property var() resolves at declaration). */
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

/* stop demo links from clobbering the hash router */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="#0"]');
  if (a) e.preventDefault();
});
