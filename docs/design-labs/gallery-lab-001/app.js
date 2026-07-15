/* gallery-lab-001 · viewer shell logic
   Builds the sidebar registry from the lane SPECS metadata, drives the
   iframe by hash (#ID/state), owns viewport presets + custom size with
   scale-to-fit, the theme cycle (system → light → dark; a manual stamp
   wins over the media query), the state strip, and arrow-key nav. */

const V = 1;
const STATES = ['browse', 'searching', 'results', 'zero', 'empty', 'selected', 'detail'];
const LANE_LABEL = { base: 'baseline', afd: 'afd', emil: 'emil', taste: 'taste', brut: 'brut', mini: 'mini' };
const LANE_ORDER = ['base', 'afd', 'emil', 'taste', 'brut', 'mini'];
/* composer-owned: cross-lane reskins removed from the catalog after dedupe */
const EXCLUDED = [];

const PRESETS = [
  { label: 'fit', w: null, h: null },
  { label: '1440×900', w: 1440, h: 900 },
  { label: '1280×800', w: 1280, h: 800 },
  { label: '1024×768', w: 1024, h: 768 },
  { label: '768×1024', w: 768, h: 1024 },
  { label: '390×844', w: 390, h: 844 },
];

const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(`lab001:${k}`)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(`lab001:${k}`, JSON.stringify(v)),
};

let SPECS = {};
let current = store.get('opt', 'BASE-0');
let curState = store.get('state', 'browse');
let vp = store.get('vp', { w: null, h: null });
let theme = store.get('theme', 'system');

const $ = (id) => document.getElementById(id);
const frame = $('frame');

async function loadSpecs() {
  for (const lane of LANE_ORDER) {
    try {
      const mod = await import(`./lanes/${lane}.js?v=${V}`);
      Object.assign(SPECS, mod.SPECS);
    } catch { /* lane not landed yet */ }
  }
  for (const id of EXCLUDED) delete SPECS[id];
}

function setFrameHash() {
  frame.src = `frame.html?v=${V}#${current}/${curState}`;
  store.set('opt', current);
  store.set('state', curState);
}

function applyTheme() {
  const doc = frame.contentDocument;
  if (doc) {
    if (theme === 'system') doc.documentElement.removeAttribute('data-theme');
    else doc.documentElement.setAttribute('data-theme', theme);
  }
  $('themebtn').textContent = `theme: ${theme}`;
  store.set('theme', theme);
}
frame.addEventListener('load', applyTheme);

function layoutFrame() {
  const stage = $('stage');
  const box = $('framebox');
  const avail = { w: stage.clientWidth - 28, h: stage.clientHeight - 28 };
  const w = vp.w || avail.w;
  const h = vp.h || avail.h;
  const scale = Math.min(1, avail.w / w, avail.h / h);
  box.style.width = `${w * scale}px`;
  box.style.height = `${h * scale}px`;
  frame.style.width = `${w}px`;
  frame.style.height = `${h}px`;
  frame.style.transform = `scale(${scale})`;
  frame.style.transformOrigin = 'top left';
  $('vpreadout').textContent = vp.w
    ? `${w}×${h} @ ${Math.round(scale * 100)}%`
    : `fit ${Math.round(avail.w)}×${Math.round(avail.h)}`;
  document.querySelectorAll('#viewports button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.w === String(vp.w) && b.dataset.h === String(vp.h)));
  });
  $('vpw').value = vp.w || '';
  $('vph').value = vp.h || '';
  store.set('vp', vp);
}

function orderedIds() {
  return LANE_ORDER.flatMap((lane) =>
    Object.keys(SPECS).filter((id) => SPECS[id].lane === lane)
  );
}

function renderSidebar() {
  const list = $('optlist');
  list.innerHTML = '';
  for (const lane of LANE_ORDER) {
    const ids = Object.keys(SPECS).filter((id) => SPECS[id].lane === lane);
    if (!ids.length) continue;
    const h = document.createElement('h3');
    h.textContent = lane === 'base' ? 'baseline (round 1, not a candidate)' : `lane · ${LANE_LABEL[lane]}`;
    list.appendChild(h);
    for (const id of ids) {
      const s = SPECS[id];
      const b = document.createElement('button');
      b.className = 'opt';
      b.setAttribute('aria-pressed', String(id === current));
      b.innerHTML = `<span class="oid">${id}</span><span class="badge">${LANE_LABEL[s.lane]}</span>
        <span class="oname">${s.name}</span><span class="omove">${s.move}</span>`;
      b.addEventListener('click', () => { current = id; setFrameHash(); renderSidebar(); });
      list.appendChild(b);
    }
  }
}

function renderStateRow() {
  const row = $('staterow');
  row.innerHTML = '';
  for (const st of STATES) {
    const b = document.createElement('button');
    b.textContent = st;
    b.setAttribute('aria-pressed', String(st === curState));
    b.addEventListener('click', () => { curState = st; setFrameHash(); renderStateRow(); });
    row.appendChild(b);
  }
}

function renderViewports() {
  const nav = $('viewports');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.textContent = p.label;
    b.dataset.w = String(p.w);
    b.dataset.h = String(p.h);
    b.addEventListener('click', () => { vp = { w: p.w, h: p.h }; layoutFrame(); });
    nav.appendChild(b);
  }
  $('vpw').addEventListener('change', () => { vp = { w: Number($('vpw').value) || null, h: Number($('vph').value) || vp.h }; layoutFrame(); });
  $('vph').addEventListener('change', () => { vp = { w: Number($('vpw').value) || vp.w, h: Number($('vph').value) || null }; layoutFrame(); });
}

$('themebtn').addEventListener('click', () => {
  theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  applyTheme();
});

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const ids = orderedIds();
  const i = ids.indexOf(current);
  if (e.key === 'ArrowRight') { current = ids[Math.min(ids.length - 1, i + 1)]; setFrameHash(); renderSidebar(); }
  if (e.key === 'ArrowLeft') { current = ids[Math.max(0, i - 1)]; setFrameHash(); renderSidebar(); }
});
window.addEventListener('resize', layoutFrame);

loadSpecs().then(() => {
  if (!SPECS[current]) current = orderedIds()[0] || 'BASE-0';
  if (!STATES.includes(curState)) curState = 'browse';
  renderViewports();
  renderStateRow();
  renderSidebar();
  setFrameHash();
  layoutFrame();
});
