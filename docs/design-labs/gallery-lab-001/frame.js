/* gallery-lab-001 · frame composer
   Owns the shared demo corpus, doodle + icon helpers, the canonical MemeCell
   builder, and hash routing (#OPT-ID/state). Lane modules under lanes/ own
   their builders; this file holds none of its own. */

const V = 1; // bump per round; cache-busts lane modules

/* ---------- shared corpus (license-safe doodle stand-ins, sploot voice) ---------- */
const K = ['cat', 'skull', 'sob', 'fire', 'ghost', 'frog', 'star', 'heart', 'zap', 'moon', 'speech', 'blob'];
const TONES = ['cyan', 'magenta', 'yellow', 'orange'];

function tabTone(file) {
  let h = 0;
  for (let i = 0; i < file.length; i += 1) h = (h * 31 + file.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

/* aspect = width/height. role: 'match' | 'near' for the demo query
   "cat vibrating at 3am"; everything else dims in the results state. */
const CORPUS = [
  { file: 'cat_scream.png', cap: 'cat mid scream, betrayed by tuesday', kind: 'cat', aspect: 1.0, role: 'match', score: '0.91', banger: true },
  { file: 'IMG_4471.png', cap: 'cat vibrating with intent', kind: 'cat', aspect: 0.8, role: 'near', score: '0.74' },
  { file: 'nightcat_03.jpg', cap: 'cat at 3am hearing one (1) sound', kind: 'cat', aspect: 1.33, role: 'near', score: '0.71', banger: true },
  { file: 'rxn_774.png', cap: 'zero thoughts head empty', kind: 'sob', aspect: 1.0, role: 'near', score: '0.68' },
  { file: 'skull_issue.png', cap: 'me reading my own search history', kind: 'skull', aspect: 1.0, score: '0.44' },
  { file: 'fine_dog.jpg', cap: 'this is fine but the room is on fire', kind: 'fire', aspect: 1.5, score: '0.41', banger: true },
  { file: 'ghost_hours.png', cap: 'replying to a text from 2019', kind: 'ghost', aspect: 0.75, score: '0.39' },
  { file: 'frog_wisdom.jpg', cap: 'frog that knows what you did', kind: 'frog', aspect: 1.0, score: '0.38' },
  { file: 'star_earned.png', cap: 'gold star for getting up today', kind: 'star', aspect: 1.33, score: '0.36' },
  { file: 'heart_eyes_9.png', cap: 'seeing a good dog across the street', kind: 'heart', aspect: 0.8, score: '0.35', banger: true },
  { file: 'zap_brain.jpg', cap: 'one singular thought at full volume', kind: 'zap', aspect: 1.78, score: '0.34' },
  { file: 'moon_posting.png', cap: 'posting at hours that concern people', kind: 'moon', aspect: 1.0, score: '0.33' },
  { file: 'speech_no.png', cap: 'the group chat going quiet', kind: 'speech', aspect: 1.33, score: '0.31' },
  { file: 'blob_monday.jpg', cap: 'becoming liquid on a monday', kind: 'blob', aspect: 1.0, score: '0.30' },
  { file: 'cat_lawyer.png', cap: 'cat that has never done a crime', kind: 'cat', aspect: 0.75, score: '0.29' },
  { file: 'skull_wifi.jpg', cap: 'wifi drops during the good part', kind: 'skull', aspect: 1.5, score: '0.28' },
  { file: 'sob_receipt.png', cap: 'checking the receipt after vibes purchase', kind: 'sob', aspect: 0.8, score: '0.27' },
  { file: 'fire_meeting.jpg', cap: 'meeting that was an email all along', kind: 'fire', aspect: 1.0, score: '0.26', banger: true },
  { file: 'ghost_read.png', cap: 'left on read by the universe', kind: 'ghost', aspect: 1.33, score: '0.25' },
  { file: 'frog_tea.jpg', cap: 'sipping tea and minding business', kind: 'frog', aspect: 0.66, score: '0.24' },
  { file: 'star_cursed.png', cap: 'cursed but in a fun way', kind: 'star', aspect: 1.0, score: '0.23' },
  { file: 'heart_snack.jpg', cap: 'the snack understood the assignment', kind: 'heart', aspect: 1.78, score: '0.22' },
  { file: 'zap_alarm.png', cap: 'alarm going off mid dream', kind: 'zap', aspect: 0.8, score: '0.21' },
  { file: 'moon_gremlin.jpg', cap: 'gremlin mode fully unlocked', kind: 'moon', aspect: 1.0, score: '0.20' },
  { file: 'speech_actually.png', cap: 'someone said actually in the replies', kind: 'speech', aspect: 1.5, score: '0.19' },
  { file: 'blob_deadline.jpg', cap: 'deadline approaching at mach speed', kind: 'blob', aspect: 0.75, score: '0.18' },
  { file: 'cat_keyboard.png', cap: 'cat filed the report by sitting on it', kind: 'cat', aspect: 1.33, score: '0.18' },
  { file: 'skull_gym.jpg', cap: 'day one of the fitness arc', kind: 'skull', aspect: 1.0, score: '0.17', banger: true },
  { file: 'sob_onion.png', cap: 'crying but blaming the onion', kind: 'sob', aspect: 1.0, score: '0.17' },
  { file: 'fire_budget.jpg', cap: 'budget after one bookstore visit', kind: 'fire', aspect: 0.8, score: '0.16' },
  { file: 'ghost_plans.png', cap: 'plans cancelled, joy unlocked', kind: 'ghost', aspect: 1.5, score: '0.16' },
  { file: 'frog_hat_2.jpg', cap: 'the hat makes him official', kind: 'frog', aspect: 1.0, score: '0.15', banger: true },
  { file: 'star_wip.png', cap: 'work in progress, emotionally', kind: 'star', aspect: 0.66, score: '0.15' },
  { file: 'heart_fridge.jpg', cap: 'visiting the fridge for the ninth time', kind: 'heart', aspect: 1.33, score: '0.14' },
  { file: 'zap_reply.png', cap: 'typing a reply then deleting it forever', kind: 'zap', aspect: 1.0, score: '0.14' },
  { file: 'moon_snooze.jpg', cap: 'snooze button hall of fame', kind: 'moon', aspect: 1.78, score: '0.13' },
  { file: 'speech_k.png', cap: 'they replied k. devastating', kind: 'speech', aspect: 0.8, score: '0.13' },
  { file: 'blob_social.jpg', cap: 'social battery at two percent', kind: 'blob', aspect: 1.0, score: '0.12' },
  { file: 'cat_box_law.png', cap: 'if it fits the cat sits, that is the law', kind: 'cat', aspect: 1.5, score: '0.12' },
  { file: 'skull_autocorrect.jpg', cap: 'autocorrect chose violence today', kind: 'skull', aspect: 0.75, score: '0.11' },
  { file: 'sob_wholesome.png', cap: 'unexpectedly wholesome, now crying', kind: 'sob', aspect: 1.33, score: '0.11' },
  { file: 'fire_tab_47.jpg', cap: 'tab number forty seven will be read', kind: 'fire', aspect: 1.0, score: '0.10' },
  { file: 'ghost_inbox.png', cap: 'inbox zero is a myth like the yeti', kind: 'ghost', aspect: 1.0, score: '0.10' },
  { file: 'frog_rain.jpg', cap: 'small frog enjoying large weather', kind: 'frog', aspect: 1.78, score: '0.09' },
  { file: 'star_nap.png', cap: 'elite napping technique observed', kind: 'star', aspect: 0.8, score: '0.09' },
  { file: 'heart_pizza.jpg', cap: 'the last slice offered. true love', kind: 'heart', aspect: 1.0, score: '0.08' },
  { file: 'zap_monday_2.png', cap: 'monday arriving unprovoked', kind: 'zap', aspect: 1.33, score: '0.08' },
  { file: 'moon_hydrate.jpg', cap: 'remembering water exists at midnight', kind: 'moon', aspect: 0.66, score: '0.07' },
].map((m, i) => ({
  id: i,
  index: `v#${String(i * 13 + 41).padStart(5, '0')}`,
  tone: tabTone(m.file),
  banger: !!m.banger,
  ...m,
}));

const PILES = [
  { id: 'p1', label: 'cats being unwell', count: 112, conf: 0.82 },
  { id: 'p2', label: 'reaction faces', count: 239, conf: 0.77 },
  { id: 'p3', label: 'cursed food', count: 38, conf: 0.61 },
  { id: 'p4', label: 'animals in business', count: 57, conf: 0.7 },
  { id: 'p5', label: 'maybe text posts', count: 64, conf: 0.41 },
];

const STATS = { total: 612, embedded: 598, queue: 3, storage: '1.2 gb' };
const QUERY = 'cat vibrating at 3am';
const ZERO_QUERY = 'notarized frog invoice';
const STATES = ['browse', 'searching', 'results', 'zero', 'empty', 'selected', 'detail'];

/* ---------- doodles: ink-line glyphs on the warm panel wash ---------- */
const DOODLE_PATHS = {
  cat: '<path d="M14 26 L18 12 L26 20 M50 26 L46 12 L38 20" fill="none"/><circle cx="32" cy="34" r="18" fill="none"/><circle cx="25" cy="31" r="2.4" fill="currentColor" stroke="none"/><circle cx="39" cy="31" r="2.4" fill="currentColor" stroke="none"/><path d="M28 40 Q32 44 36 40 M10 34 L20 36 M10 40 L20 40 M54 34 L44 36 M54 40 L44 40" fill="none"/>',
  skull: '<circle cx="32" cy="28" r="16" fill="none"/><rect x="24" y="42" width="16" height="8" rx="3" fill="none"/><circle cx="26" cy="27" r="3.6" fill="currentColor" stroke="none"/><circle cx="38" cy="27" r="3.6" fill="currentColor" stroke="none"/><path d="M30 35 L32 32 L34 35" fill="none"/>',
  sob: '<circle cx="32" cy="32" r="19" fill="none"/><path d="M24 28 Q26 25 29 27 M40 28 Q38 25 35 27 M26 42 Q32 38 38 42" fill="none"/><path d="M25 33 Q23 41 26 44 Q29 41 27 33 Z" fill="currentColor" stroke="none"/>',
  fire: '<path d="M32 10 Q40 20 36 27 Q42 25 44 20 Q52 34 44 45 Q36 54 26 48 Q16 41 22 29 Q25 23 28 21 Q27 16 32 10 Z" fill="none"/><path d="M32 34 Q36 39 32 45 Q27 41 29 36 Z" fill="currentColor" stroke="none"/>',
  ghost: '<path d="M16 52 L16 30 Q16 12 32 12 Q48 12 48 30 L48 52 L42 46 L37 52 L32 46 L27 52 L22 46 Z" fill="none"/><circle cx="26" cy="30" r="2.6" fill="currentColor" stroke="none"/><circle cx="38" cy="30" r="2.6" fill="currentColor" stroke="none"/><ellipse cx="32" cy="38" rx="3" ry="4" fill="none"/>',
  frog: '<circle cx="22" cy="18" r="7" fill="none"/><circle cx="42" cy="18" r="7" fill="none"/><circle cx="22" cy="18" r="2.2" fill="currentColor" stroke="none"/><circle cx="42" cy="18" r="2.2" fill="currentColor" stroke="none"/><path d="M12 34 Q32 22 52 34 Q54 48 32 50 Q10 48 12 34 Z" fill="none"/><path d="M22 40 Q32 46 42 40" fill="none"/>',
  star: '<path d="M32 8 L38 24 L55 25 L42 36 L46 53 L32 43 L18 53 L22 36 L9 25 L26 24 Z" fill="none"/><circle cx="27" cy="30" r="1.8" fill="currentColor" stroke="none"/><circle cx="37" cy="30" r="1.8" fill="currentColor" stroke="none"/><path d="M28 36 Q32 39 36 36" fill="none"/>',
  heart: '<path d="M32 52 Q10 38 10 24 Q10 12 21 12 Q29 12 32 20 Q35 12 43 12 Q54 12 54 24 Q54 38 32 52 Z" fill="none"/><path d="M22 24 Q24 20 28 22" fill="none"/>',
  zap: '<path d="M36 6 L16 34 L28 34 L24 58 L48 26 L34 26 Z" fill="none"/><path d="M30 20 L26 27" fill="none"/>',
  moon: '<path d="M40 8 Q24 14 24 32 Q24 50 40 56 Q18 58 12 38 Q8 16 30 9 Q35 7 40 8 Z" fill="none"/><circle cx="44" cy="20" r="2" fill="currentColor" stroke="none"/><circle cx="50" cy="32" r="1.5" fill="currentColor" stroke="none"/>',
  speech: '<path d="M10 14 Q10 10 14 10 L50 10 Q54 10 54 14 L54 36 Q54 40 50 40 L28 40 L16 52 L18 40 L14 40 Q10 40 10 36 Z" fill="none"/><circle cx="24" cy="25" r="2" fill="currentColor" stroke="none"/><circle cx="32" cy="25" r="2" fill="currentColor" stroke="none"/><circle cx="40" cy="25" r="2" fill="currentColor" stroke="none"/>',
  blob: '<path d="M18 50 Q8 44 12 32 Q15 22 26 18 Q38 13 48 20 Q58 28 52 40 Q47 51 34 52 Q24 53 18 50 Z" fill="none"/><circle cx="27" cy="32" r="2.4" fill="currentColor" stroke="none"/><circle cx="39" cy="32" r="2.4" fill="currentColor" stroke="none"/><path d="M29 40 L37 40" fill="none"/>',
};

function doodle(kind, opts = {}) {
  const size = opts.size || '100%';
  const label = opts.label || '';
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${label}" style="stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;max-height:100%;">${DOODLE_PATHS[kind] || DOODLE_PATHS.blob}</svg>`;
}

/* ---------- icons: 24x24 ink-line ---------- */
const ICONS = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 L21 21"/>',
  upload: '<path d="M12 16 L12 4 M7 9 L12 4 L17 9"/><path d="M4 16 L4 20 L20 20 L20 16"/>',
  shuffle: '<path d="M3 6 L7 6 Q10 6 12 9 L14 15 Q16 18 19 18 L21 18 M21 18 L18 15 M21 18 L18 21 M3 18 L7 18 Q9 18 10.5 16.2 M13.5 7.8 Q15 6 17 6 L21 6 M21 6 L18 3 M21 6 L18 9"/>',
  heart: '<path d="M12 20 Q4 14.5 4 9.5 Q4 5.5 7.8 5.5 Q10.5 5.5 12 8.2 Q13.5 5.5 16.2 5.5 Q20 5.5 20 9.5 Q20 14.5 12 20 Z"/>',
  heartFill: '<path d="M12 20 Q4 14.5 4 9.5 Q4 5.5 7.8 5.5 Q10.5 5.5 12 8.2 Q13.5 5.5 16.2 5.5 Q20 5.5 20 9.5 Q20 14.5 12 20 Z" fill="currentColor"/>',
  share: '<circle cx="6" cy="12" r="2.6"/><circle cx="17" cy="6" r="2.6"/><circle cx="17" cy="18" r="2.6"/><path d="M8.4 10.8 L14.7 7.2 M8.4 13.2 L14.7 16.8"/>',
  trash: '<path d="M5 7 L19 7 M9 7 L9 4.5 L15 4.5 L15 7 M7 7 L8 20 L16 20 L17 7 M10.5 10.5 L10.5 16.5 M13.5 10.5 L13.5 16.5"/>',
  x: '<path d="M6 6 L18 18 M18 6 L6 18"/>',
  arrowL: '<path d="M20 12 L4 12 M10 6 L4 12 L10 18"/>',
  arrowR: '<path d="M4 12 L20 12 M14 6 L20 12 L14 18"/>',
  check: '<path d="M4 13 L9.5 18 L20 6"/>',
  filter: '<path d="M4 6 L20 6 M7 12 L17 12 M10 18 L14 18"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  sparkle: '<path d="M12 3 L13.8 9.2 L20 11 L13.8 12.8 L12 19 L10.2 12.8 L4 11 L10.2 9.2 Z"/><path d="M19 16 L19.7 18.3 L22 19 L19.7 19.7 L19 22 L18.3 19.7 L16 19 L18.3 18.3 Z"/>',
  plus: '<path d="M12 5 L12 19 M5 12 L19 12"/>',
  chevD: '<path d="M6 9 L12 15 L18 9"/>',
  chevU: '<path d="M6 15 L12 9 L18 15"/>',
  tag: '<path d="M4 4 L11 4 L20 13 Q21 14 20 15 L15 20 Q14 21 13 20 L4 11 Z"/><circle cx="8.5" cy="8.5" r="1.6" fill="currentColor"/>',
  expand: '<path d="M9 4 L4 4 L4 9 M15 4 L20 4 L20 9 M4 15 L4 20 L9 20 M20 15 L20 20 L15 20"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="4"/><path d="M8 7 L9.5 4 L14.5 4 L16 7"/>',
  link: '<path d="M10 14 Q8 12 10 10 L14 6 Q16 4 18 6 Q20 8 18 10 L16.5 11.5 M14 10 Q16 12 14 14 L10 18 Q8 20 6 18 Q4 16 6 14 L7.5 12.5"/>',
};

function icon(name, size = 18) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;">${ICONS[name] || ICONS.sparkle}</svg>`;
}

/* ---------- canonical MemeCell builder ----------
   opts: state ('default'|'match'|'near'|'dim'|'selected'|'loading'|'error'),
         tab (bool, default true), caption (bool, default true),
         score (bool), rail (bool: heart/share/trash ink minis) */
function cell(item, opts = {}) {
  const st = opts.state || 'default';
  const showTab = opts.tab !== false;
  const showCap = opts.caption !== false;
  const cls = ['cell'];
  if (st === 'match') cls.push('cell--match');
  if (st === 'near') cls.push('cell--near');
  if (st === 'dim') cls.push('cell--dim');
  if (st === 'selected') cls.push('cell--selected');
  const badge = st === 'match' ? '<span class="cell-badge animate-sploot-stamp">match</span>' : '';
  const tab = showTab
    ? `<div class="cell-tab tone-${item.tone}"><span>${item.file}</span><span>${item.index}</span></div>`
    : '';
  const rail = opts.rail
    ? `<div style="display:flex;gap:6px;justify-content:flex-end;padding:6px 10px;border-top:2px dashed var(--sploot-ink);">
        <button class="sploot-ctl" aria-label="banger" aria-pressed="${item.banger}">${icon(item.banger ? 'heartFill' : 'heart')}</button>
        <button class="sploot-ctl" aria-label="share">${icon('share')}</button>
        <button class="sploot-ctl" aria-label="trash">${icon('trash')}</button>
      </div>`
    : '';
  const cap = showCap
    ? `<div class="cell-caption"><p>${item.cap}</p>${opts.score && item.score ? `<b class="sploot-tabular">${item.score}</b>` : ''}</div>`
    : '';
  return `<article class="${cls.join(' ')}" data-id="${item.id}" aria-label="${item.cap}">
    ${badge}${tab}
    <div class="cell-media" style="aspect-ratio:${item.aspect};">${doodle(item.kind, { label: item.cap, size: '52%' })}</div>
    ${cap}${rail}
  </article>`;
}

/* ---------- LAB API exposed to lanes (call at render time only) ---------- */
window.LAB = {
  corpus: CORPUS,
  piles: PILES,
  stats: STATS,
  query: QUERY,
  zeroQuery: ZERO_QUERY,
  states: STATES,
  doodle,
  icon,
  cell,
  tabTone,
};

/* ---------- composer: merge lane SPECS, render by hash ---------- */
const LANES = ['base', 'afd', 'emil', 'taste', 'brut', 'mini'];
const SPECS = {};

async function loadLanes() {
  for (const lane of LANES) {
    try {
      const mod = await import(`./lanes/${lane}.js?v=${V}`);
      Object.assign(SPECS, mod.SPECS);
    } catch (err) {
      console.warn(`[lab] lane not loaded: ${lane}`, err.message);
    }
  }
  window.SPECS = SPECS;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  const [id, state] = raw.split('/');
  return { id: id || Object.keys(SPECS)[0], state: STATES.includes(state) ? state : 'browse' };
}

function render() {
  const mount = document.getElementById('mount');
  const { id, state } = parseHash();
  const spec = SPECS[id];
  if (!spec) {
    mount.innerHTML = `<div style="display:grid;place-items:center;min-height:100dvh;font-family:var(--font-mono);">unknown option: ${id || '(none)'}</div>`;
    return;
  }
  console.log(`[lab] round ${V} render ${id}/${state}`);
  /* replace the node so entrance animations replay */
  const fresh = document.createElement('div');
  fresh.id = 'mount';
  fresh.innerHTML = spec.render(state, { state, id });
  mount.replaceWith(fresh);
  /* neutralize demo links/buttons so nothing navigates the hash */
  fresh.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', (e) => e.preventDefault());
  });
}

loadLanes().then(() => {
  render();
  window.addEventListener('hashchange', render);
  window.parent?.postMessage({ type: 'lab:ready', ids: Object.keys(SPECS) }, '*');
});
