/* lab 033 shell — registry sidebar, paged viewer, viewport rig. */
'use strict';

const FRAME_V = 2; // bump with every round; cache-busts frame assets

const SECTIONS = [
  {
    id: 'DNA',
    title: 'design dna · candidate systems',
    status: 'round 2 · winner DNA-1 · challenger DNA-5',
    note: 'fixed: product premise (private meme search, image-first, deadpan), a11y floor. varies: color architecture, type strategy, shape language, density, motion, voice. each page = same sampler surfaces under one system.',
    options: [
      { id: 'DNA-1', label: 'winner · neo-brutalist zine', baseline: true },
      { id: 'DNA-5', label: 'challenger · sticker bomb' },
    ],
  },
  {
    id: 'BRAND',
    title: 'brand · wordmark + mark',
    status: 'round 2 · BRAND-1 wins · BRAND-7 refine',
    note: 'fixed: the name, lowercase-by-default voice. varies: letterform strategy, mark concept, lockup. each page = brand sheet (wordmark, mark, favicon row, app icon, sticker application).',
    options: [
      { id: 'BRAND-1', label: 'winner · bare archivo wordmark', baseline: true },
      { id: 'BRAND-7', label: 'refine · oo ligature frames' },
    ],
  },
  {
    id: 'LAND',
    title: 'landing page · macrostructure',
    status: 'round 2 · winner LAND-1 · remove fake-window chrome',
    note: 'fixed: shipped tokens + voice + "show the mechanism". varies: page structure, what leads, where the proof sits.',
    options: [
      { id: 'LAND-1', label: 'winner · console hero', baseline: true },
    ],
  },
  {
    id: 'COMP',
    title: 'component grammar · the kit',
    status: 'round 2 · COMP-1 wins · borrow cassette hover cue',
    note: 'fixed: shipped tokens. varies: the object metaphor the kit is built from. each page = specimen sheet (console, cell, buttons, sticker, stat, status bar, empty state) under one grammar.',
    options: [
      { id: 'COMP-1', label: 'winner · shipped kit, compact grammar', baseline: true },
      { id: 'COMP-2', label: 'mutation source · cassette hover' },
    ],
  },
  {
    id: 'GRID',
    title: '/app workbench · library view',
    status: 'round 2 · winner GRID-1 · faithful shipped structure',
    note: 'fixed: shipped tokens + kit. varies: chrome placement, grid anatomy, where search lives, density.',
    options: [
      { id: 'GRID-1', label: 'winner · command bar + masonry grid', baseline: true },
    ],
  },
  {
    id: 'SRCH',
    title: 'search · result presentation',
    status: 'round 2 · winner SRCH-1 · scores below media',
    note: 'fixed: shipped tokens, similarity scores are real product truth. varies: how a match is revealed and ranked.',
    options: [
      { id: 'SRCH-1', label: 'winner · preserve grid + ranked metadata', baseline: true },
    ],
  },
  {
    id: 'UP',
    title: 'upload · intake flow',
    status: 'round 2 · UP-1 wins · borrow UP-3 scan motion',
    note: 'fixed: shipped tokens, real states (queued, embedding, done, failed). varies: the intake metaphor and where the queue lives.',
    options: [
      { id: 'UP-1', label: 'winner · dropzone + scanner state', baseline: true },
      { id: 'UP-3', label: 'mutation source · scan motion' },
    ],
  },
  {
    id: 'DET',
    title: 'meme detail · one image',
    status: 'round 2 · winner DET-10 · dedicated editorial page',
    note: 'fixed: shipped tokens, real actions (banger, share, delete). varies: framing of the single image and its metadata.',
    options: [
      { id: 'DET-10', label: 'winner · editorial full-media page', baseline: true },
    ],
  },
  {
    id: 'SET',
    title: 'settings · account + controls',
    status: 'round 2 · SET-1 base + SET-2 controls + SET-9 danger only',
    note: 'fixed: shipped tokens, real settings (account, embeddings, storage, danger zone). varies: form anatomy and tone.',
    options: [
      { id: 'SET-1', label: 'base · stacked shipped settings', baseline: true },
      { id: 'SET-2', label: 'mutation · control toggles' },
      { id: 'SET-9', label: 'mutation · danger zone only' },
    ],
  },
  {
    id: 'AUTH',
    title: 'sign-in · the door',
    status: 'round 2 · winner AUTH-1 · centered card',
    note: 'fixed: clerk does the actual auth; this is the room around it. varies: the door metaphor. privacy is the promise on every option.',
    options: [
      { id: 'AUTH-1', label: 'winner · centered card', baseline: true },
    ],
  },
];

/* ---------- state ---------- */
const LS = 'lab033';
const state = Object.assign(
  { current: 'DNA-1', vp: 'fit', vpw: 1440, vph: 900, collapsed: {} },
  JSON.parse(localStorage.getItem(LS) || '{}')
);
const save = () => localStorage.setItem(LS, JSON.stringify(state));

const FLAT = SECTIONS.flatMap(s => s.options.map(o => ({ ...o, sec: s })));

/* ---------- sidebar ---------- */
const sidebar = document.getElementById('sidebar');
function renderSidebar() {
  sidebar.innerHTML = '';
  for (const sec of SECTIONS) {
    const el = document.createElement('div');
    el.className = 'sec' + (state.collapsed[sec.id] ? ' collapsed' : '');
    const head = document.createElement('div');
    head.className = 'sec-head';
    head.textContent = sec.title;
    head.title = sec.note;
    head.onclick = () => { state.collapsed[sec.id] = !state.collapsed[sec.id]; save(); renderSidebar(); };
    el.appendChild(head);
    const st = document.createElement('div');
    st.className = 'sec-status';
    st.textContent = `${sec.status} · ${sec.options.length} options`;
    el.appendChild(st);
    for (const opt of sec.options) {
      const row = document.createElement('div');
      row.className = 'opt' + (opt.id === state.current ? ' active' : '') + (opt.baseline ? ' baseline' : '');
      row.dataset.id = opt.id;
      row.innerHTML = `<span class="oid">${opt.id}</span><span>${opt.label}</span>`;
      row.onclick = () => select(opt.id);
      el.appendChild(row);
    }
    sidebar.appendChild(el);
  }
}

/* ---------- frame + viewport ---------- */
const frame = document.getElementById('frame');
const wrap = document.getElementById('frame-wrap');
const stage = document.getElementById('stage');
const readout = document.getElementById('vp-readout');
const currentOpt = document.getElementById('current-opt');

function select(id) {
  state.current = id; save();
  frame.src = `frame.html?v=${FRAME_V}#${id}`;
  const o = FLAT.find(f => f.id === id);
  currentOpt.textContent = o ? `${id} · ${o.label}  [${o.sec.title}]` : id;
  document.querySelectorAll('.opt').forEach(r => r.classList.toggle('active', r.dataset.id === id));
  const row = document.querySelector(`.opt[data-id="${CSS.escape(id)}"]`);
  if (row) row.scrollIntoView({ block: 'nearest' });
  layout();
}

function layout() {
  const availW = stage.clientWidth - 32;
  const availH = stage.clientHeight - 32;
  let w, h;
  if (state.vp === 'fit') { w = availW; h = availH; }
  else { w = state.vpw; h = state.vph; }
  const scale = Math.min(1, availW / w, availH / h);
  frame.style.width = w + 'px';
  frame.style.height = h + 'px';
  frame.style.transform = `scale(${scale})`;
  frame.style.transformOrigin = 'top left';
  wrap.style.width = (w * scale) + 'px';
  wrap.style.height = (h * scale) + 'px';
  wrap.style.overflow = 'hidden';
  readout.textContent = state.vp === 'fit'
    ? `fit · ${Math.round(w)}×${Math.round(h)}`
    : `${w}×${h} @ ${(scale * 100).toFixed(0)}%`;
  document.querySelectorAll('.vp-btn[data-vp]').forEach(b =>
    b.classList.toggle('active', b.dataset.vp === state.vp));
}

document.querySelectorAll('.vp-btn[data-vp]').forEach(b => {
  b.onclick = () => {
    state.vp = b.dataset.vp;
    if (state.vp !== 'fit') {
      const [w, h] = state.vp.split('x').map(Number);
      state.vpw = w; state.vph = h;
    }
    save(); layout();
  };
});
document.getElementById('vp-apply').onclick = () => {
  const w = +document.getElementById('vp-w').value, h = +document.getElementById('vp-h').value;
  if (w >= 240 && h >= 240) { state.vp = `${w}x${h}`; state.vpw = w; state.vph = h; save(); layout(); }
};

/* ---------- keyboard ---------- */
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const i = FLAT.findIndex(f => f.id === state.current);
  if (e.key === 'ArrowRight') select(FLAT[Math.min(FLAT.length - 1, i + 1)].id);
  if (e.key === 'ArrowLeft') select(FLAT[Math.max(0, i - 1)].id);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const cur = FLAT[i].sec.id;
    const secIdx = SECTIONS.findIndex(s => s.id === cur);
    const next = SECTIONS[(secIdx + (e.key === 'ArrowDown' ? 1 : SECTIONS.length - 1)) % SECTIONS.length];
    select(next.options[0].id);
  }
});

/* ---------- render check: frame reports back ---------- */
window.addEventListener('message', (e) => {
  if (!e.data || e.data.lab !== '033') return;
  const row = document.querySelector(`.opt[data-id="${CSS.escape(e.data.id)}"]`);
  if (row && !e.data.ok) row.classList.add('missing');
  if (!e.data.ok) console.error('lab033: frame missing builder for', e.data.id);
});

window.addEventListener('resize', layout);
renderSidebar();
select(FLAT.some(f => f.id === state.current) ? state.current : 'DNA-1');
