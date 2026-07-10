/* lab 035 shell — registry sidebar, paged viewer, viewport rig. */
'use strict';

const FRAME_V = 2;

const SECTIONS = [
  {
    id: 'LAND',
    title: 'landing · content + structure',
    status: 'round 2 · drill-down (live demo pile)',
    note: 'FIXED: toybox system + NEW FACT: the demo is a real searchable micro-gallery over a ~1,000-classic public corpus (randomized at rest, live re-rank with scores, no fave/share/delete on demo cells). VARIES: how the searchable wall, copy, and conversion structure the page. R1 kills: AFD-LAND-1/2, HALL-LAND-2, TASTE-LAND-1/2, IMPEC-LAND-2.',
    options: [
      { id: 'BASE-LAND', label: 'shipped landing', baseline: true },
      { id: 'HALL-LAND-1', label: 'R1 survivor · console IS the hero, scored results above the fold' },
      { id: 'IMPEC-LAND-1', label: 'R1 survivor · 5:7 split, sticky copy tower, console + demo right' },
      { id: 'HALL-LAND-3', label: 'R2 mutation of HALL-LAND-1 · live demo wall' },
      { id: 'HALL-LAND-4', label: 'R2 mutation of HALL-LAND-1 · live demo wall' },
      { id: 'IMPEC-LAND-3', label: 'R2 mutation of IMPEC-LAND-1 · live demo wall' },
      { id: 'IMPEC-LAND-4', label: 'R2 mutation of IMPEC-LAND-1 · live demo wall' },
    ],
  },
  {
    id: 'NAV',
    title: 'header nav + filter/search chrome',
    status: 'round 2 · drill-down',
    note: 'FIXED: system + chrome inventory. VARIES: grouping, density, strip anatomy. R1: AFD-NAV-1 lead ("substantially better than shipped"), HALL-NAV-1 kept; everything else killed (full-width console eats space; taste/impec oversized controls).',
    options: [
      { id: 'BASE-NAV', label: 'shipped chrome (in feed capture)', baseline: true },
      { id: 'AFD-NAV-1', label: 'R1 LEAD · two-row sticky command bar, search inline in mast' },
      { id: 'HALL-NAV-1', label: 'R1 survivor · single control strip + throned console' },
      { id: 'AFD-NAV-3', label: 'R2 mutation of AFD-NAV-1' },
      { id: 'AFD-NAV-4', label: 'R2 mutation of AFD-NAV-1' },
      { id: 'HALL-NAV-3', label: 'R2 mutation of HALL-NAV-1' },
      { id: 'HALL-NAV-4', label: 'R2 mutation of HALL-NAV-1' },
    ],
  },
  {
    id: 'FEED',
    title: 'gallery / feed layout',
    status: 'LOCKED · AFD-FEED-1 — masonry + pile chips, zero cropping',
    note: 'Operator lock (2026-07-10): masonry with pile chips above the wall; every meme rendered full, never cropped. Converges into apps/web after round 2 closes. Pile chips ship when piles exist.',
    options: [
      { id: 'BASE-FEED', label: 'shipped feed', baseline: true },
      { id: 'AFD-FEED-1', label: 'LOCKED WINNER · masonry + pile chips above the wall' },
    ],
  },
  {
    id: 'DET',
    title: 'meme detail layout',
    status: 'round 2 · head-to-head drill-down',
    note: 'FIXED: system, uncropped hero, identical-grammar icon actions, related-with-similarity always. R1: "got to be one of" AFD-DET-1 / TASTE-DET-1 — both editorial splits; round 2 refines each.',
    options: [
      { id: 'BASE-DET', label: 'shipped detail (dark capture)', baseline: true },
      { id: 'AFD-DET-1', label: 'R1 survivor · editorial split, sticky mono spec-sheet' },
      { id: 'TASTE-DET-1', label: 'R1 survivor · editorial split, media + metadata' },
      { id: 'AFD-DET-3', label: 'R2 mutation of AFD-DET-1' },
      { id: 'AFD-DET-4', label: 'R2 mutation of AFD-DET-1' },
      { id: 'TASTE-DET-3', label: 'R2 mutation of TASTE-DET-1' },
      { id: 'TASTE-DET-4', label: 'R2 mutation of TASTE-DET-1' },
    ],
  },
  {
    id: 'UP',
    title: 'upload intake',
    status: 'round 2 · drill-down',
    note: 'FIXED: system, real states (queued/embedding/done/failed). R1: AFD-UP-1 lead ("great, probably the one"), HALL-UP-2 kept ("I do like hall up two"); rest killed.',
    options: [
      { id: 'BASE-UP', label: 'shipped upload (dark capture)', baseline: true },
      { id: 'AFD-UP-1', label: 'R1 LEAD · dropzone-dominant mouth, five-state queue below' },
      { id: 'HALL-UP-2', label: 'R1 survivor · intake side rail, queue promoted to cell grid' },
      { id: 'AFD-UP-3', label: 'R2 mutation of AFD-UP-1' },
      { id: 'AFD-UP-4', label: 'R2 mutation of AFD-UP-1' },
      { id: 'HALL-UP-3', label: 'R2 mutation of HALL-UP-2' },
      { id: 'HALL-UP-4', label: 'R2 mutation of HALL-UP-2' },
    ],
  },
  {
    id: 'SET',
    title: 'settings',
    status: 'round 2 · drill-down ("let\'s drill down into that")',
    note: 'FIXED: system, real settings inventory. R1: AFD-SET-1 lead ("great, probably what we want"), AFD-SET-2 and IMPEC-SET-2 kept; rest killed.',
    options: [
      { id: 'BASE-SET', label: 'shipped settings (dark capture)', baseline: true },
      { id: 'AFD-SET-1', label: 'R1 LEAD · 720px reading column, danger last' },
      { id: 'AFD-SET-2', label: 'R1 survivor · machine-first dashboard, machine/you columns' },
      { id: 'IMPEC-SET-2', label: 'R1 survivor · 2x2 panel grid + full-width danger' },
      { id: 'AFD-SET-3', label: 'R2 refinement of AFD-SET-1' },
      { id: 'AFD-SET-4', label: 'R2 blend of AFD-SET-1 × AFD-SET-2' },
      { id: 'IMPEC-SET-3', label: 'R2 mutation of IMPEC-SET-2' },
      { id: 'IMPEC-SET-4', label: 'R2 mutation of IMPEC-SET-2' },
    ],
  },
];

/* ---------- state ---------- */
const LS = 'lab035';
const state = Object.assign(
  { current: 'BASE-LAND', vp: 'fit', vpw: 1440, vph: 900, collapsed: {} },
  JSON.parse(localStorage.getItem(LS) || '{}')
);
const save = () => localStorage.setItem(LS, JSON.stringify(state));
const FLAT = SECTIONS.flatMap(s => s.options.map(o => ({ ...o, sec: s })));

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

window.addEventListener('message', (e) => {
  if (!e.data || e.data.lab !== '035') return;
  const row = document.querySelector(`.opt[data-id="${CSS.escape(e.data.id)}"]`);
  if (row && !e.data.ok) row.classList.add('missing');
  if (!e.data.ok) console.error('lab035: frame missing builder for', e.data.id);
});

window.addEventListener('resize', layout);
renderSidebar();
select(FLAT.some(f => f.id === state.current) ? state.current : 'BASE-LAND');
