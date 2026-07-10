/* lab 034 shell — registry sidebar, paged viewer, viewport rig. */
'use strict';

const FRAME_V = 3; // bump with every round; cache-busts frame assets

const SECTIONS = [
  {
    id: 'SYS',
    title: 'hypermax system lab · full re-derivation',
    status: 'FINAL: AFD-8 ink minis locked · converging to production',
    note: 'fixed: product premise (private meme search, the pile, bangers, machinery on display), voice DNA (lowercase deadpan), a11y floor (AA both themes, focus, 44px, reduced-motion), shared corpus. varies: EVERYTHING else — palette architecture, type system, shape/elevation, density, motion grammar, component anatomy, where the maximalism lives. each page = one complete design system: hero, foundations, type, kit, motion, workbench + phone. provenance = ID prefix (AFD anthropic-frontend-design · TASTE leon-taste · SOFT leon-soft · BRUT leon-brutalist · HALL nutlope-hallmark · IMPEC impeccable). "twin:" pairs converged across blind lanes and count once toward the catalog.',
    options: [
      { id: 'AFD-3', label: 'LOCKED WINNER · toybox · cereal-aisle arcade' },
      { id: 'AFD-8', label: 'r3 · ink minis · flat outline micro-toys' },
      { id: 'AFD-9', label: 'r3 · candy clicks · 2px-drop candy chips' },
      { id: 'AFD-10', label: 'r3 · punch panel · inset stamped controls' },
      { id: 'AFD-11', label: 'r3 · peel tabs · die-cut sticker icons' },
      { id: 'AFD-1', label: 'reference · overprint · round-2 co-favorite' },
      { id: 'BASE-1', label: 'shipped system · neo-brutalist zine', baseline: true },
    ],
  },
];

/* ---------- state ---------- */
const LS = 'lab034';
const state = Object.assign(
  { current: 'AFD-3', vp: 'fit', vpw: 1440, vph: 900, collapsed: {} },
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
  if (!e.data || e.data.lab !== '034') return;
  const row = document.querySelector(`.opt[data-id="${CSS.escape(e.data.id)}"]`);
  if (row && !e.data.ok) row.classList.add('missing');
  if (!e.data.ok) console.error('lab034: frame missing builder for', e.data.id);
});

window.addEventListener('resize', layout);
renderSidebar();
select(FLAT.some(f => f.id === state.current) ? state.current : 'AFD-3');
