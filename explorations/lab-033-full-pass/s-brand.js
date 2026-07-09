/* lab 033 · section BRAND — wordmark + mark directions.
   each option = a brand sheet: hero lockup, mark, favicon ladder,
   app icon, one real application, rationale. */
'use strict';

css('BRAND-base', `
.br { min-height:100dvh; display:flex; flex-direction:column; background:var(--paper); }
.br-hero { flex:1; display:grid; place-items:center; padding:40px; text-align:center; }
.br-row { display:flex; gap:26px; align-items:flex-end; justify-content:center; flex-wrap:wrap; padding:0 40px 30px; }
.br-block { border: var(--b); background:#fff; box-shadow:var(--shadow-sm); padding:16px; text-align:center; }
.br-block .lbl { font-family:var(--mono); font-size:9px; text-transform:uppercase; opacity:.65; margin-top:10px; }
.br-fav { display:flex; gap:14px; align-items:flex-end; justify-content:center; }
.br-fav .f { display:grid; place-items:center; background:#fff; border:2px solid var(--ink); }
.br-rationale { font-family:var(--mono); font-size:12px; max-width:600px; margin:0 auto; padding:0 30px 26px; text-align:center; line-height:1.6; }
.br-appicon { width:96px; height:96px; display:grid; place-items:center; border:var(--b); box-shadow:var(--shadow-sm); }
`);

function brandSheet(m, o) {
  m.innerHTML = `
  <div class="br">
    <div style="display:flex;justify-content:space-between;padding:14px 22px;border-bottom:var(--b)">
      <span class="k-eyebrow">brand sheet</span><span class="k-eyebrow">${o.name}</span>
    </div>
    <div class="br-hero"><div>${o.hero}</div></div>
    <p class="br-rationale">${o.rationale}</p>
    <div class="br-row">
      <div class="br-block"><div class="br-fav">
        <div class="f" style="width:64px;height:64px">${o.icon(48)}</div>
        <div class="f" style="width:32px;height:32px">${o.icon(24)}</div>
        <div class="f" style="width:16px;height:16px">${o.icon(12)}</div>
      </div><div class="lbl">favicon 64 / 32 / 16</div></div>
      <div class="br-block"><div class="br-appicon" style="background:${o.iconBg || 'var(--yellow)'}">${o.icon(64)}</div><div class="lbl">app icon</div></div>
      <div class="br-block" style="max-width:340px">${o.applied}<div class="lbl">applied</div></div>
    </div>
    ${labSpec(o.spec)}
  </div>`;
}

/* shared mini application: a browser tab + a sticker */
const brTab = (mark, word) => `
  <div style="display:flex;align-items:center;gap:8px;border:2px solid var(--ink);background:var(--paper);padding:6px 12px;font-family:var(--sans);font-size:12px;text-align:left">
    <span style="width:16px;height:16px;display:grid;place-items:center">${mark}</span>
    <span>${word} · the pile</span>
    <span style="margin-left:auto;opacity:.4">×</span>
  </div>`;

/* ---- BRAND-1 baseline ---- */
SPECS['BRAND-1'] = (m) => brandSheet(m, {
  name: 'bare archivo wordmark (shipped)',
  hero: `<div style="font-family:var(--display);font-size:150px;line-height:.9">sploot</div>`,
  rationale: 'the current state: the name set in archivo black, lowercase, no mark. honest and loud, but there is no glyph to put on a favicon, a stamp, or a sticker. everything else in this section fixes that gap a different way.',
  icon: (s) => `<span style="font-family:var(--display);font-size:${s * .66}px">s</span>`,
  applied: brTab('<span style="font-family:var(--display);font-size:12px">s</span>', 'sploot'),
  spec: [['direction', 'BASELINE'], ['letterform', 'archivo black, lowercase'], ['mark', 'none (the gap)'], ['risk', 'unownable; any brutalist site can set a word in archivo']],
});

/* ---- BRAND-2 the sploot pose ---- */
SPECS['BRAND-2'] = (m) => {
  const dog = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><ellipse cx="32" cy="44" rx="24" ry="10" fill="#ffe600" stroke="#0a0a0a" stroke-width="3"/><rect x="6" y="50" width="10" height="4" fill="#ffe600" stroke="#0a0a0a" stroke-width="2"/><rect x="48" y="50" width="10" height="4" fill="#ffe600" stroke="#0a0a0a" stroke-width="2"/><circle cx="32" cy="28" r="13" fill="#ffe600" stroke="#0a0a0a" stroke-width="3"/><polygon points="21,20 24,10 30,19" fill="#ffe600" stroke="#0a0a0a" stroke-width="3"/><polygon points="43,20 40,10 34,19" fill="#ffe600" stroke="#0a0a0a" stroke-width="3"/><circle cx="27" cy="27" r="2.2" fill="#0a0a0a"/><circle cx="37" cy="27" r="2.2" fill="#0a0a0a"/><ellipse cx="32" cy="33" rx="3.4" ry="2.4" fill="#0a0a0a"/></svg>`;
  brandSheet(m, {
    name: 'the sploot pose',
    hero: `<div style="display:flex;flex-direction:column;align-items:center;gap:6px">${dog(210)}
      <div style="font-family:var(--display);font-size:110px;line-height:.9">sploot</div></div>`,
    rationale: 'the name is already a dog lying flat with its legs out. that IS the brand: a creature at maximum rest, zero thoughts, fully archived. the mascot earns the name instead of ignoring it, and it flattens beautifully at 16px.',
    icon: dog, iconBg: 'var(--cyan)',
    applied: brTab(dog(16), 'sploot'),
    spec: [['direction', 'mascot'], ['letterform', 'archivo black kept'], ['mark', 'splooting dog, geometric ink-line'], ['why it wins', 'the only option that explains the name']],
  });
};

/* ---- BRAND-3 ink splat ---- */
SPECS['BRAND-3'] = (m) => {
  const splat = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><path d="M32 8 l6 12 14-6 -6 13 12 7 -14 4 4 14 -12-8 -8 12 -3-14 -15 3 9-11 -11-9 15-2z" fill="#0a0a0a"/><circle cx="50" cy="14" r="3" fill="#0a0a0a"/><circle cx="12" cy="46" r="2.4" fill="#0a0a0a"/></svg>`;
  brandSheet(m, {
    name: 'ink splat',
    hero: `<div style="display:flex;align-items:center;gap:18px">${splat(150)}
      <div style="font-family:var(--display);font-size:120px;line-height:.9">spl<span style="color:var(--magenta)">oo</span>t</div></div>`,
    rationale: 'sploot is also a sound: something wet landing flat. the splat is the onomatopoeia drawn — an ink blot slammed on paper, exactly how stickers and stamps already behave in the shipped system. aggressive, printable, one color.',
    icon: splat, iconBg: 'var(--magenta)',
    applied: brTab(splat(14), 'sploot'),
    spec: [['direction', 'onomatopoeia'], ['letterform', 'archivo, oo flipped magenta'], ['mark', 'hard-edged ink splat'], ['why it wins', 'names the sound; already speaks the system’s stamp language']],
  });
};

/* ---- BRAND-4 crate stencil ---- */
SPECS['BRAND-4'] = (m) => brandSheet(m, {
  name: 'crate stencil',
  hero: `<div style="border:8px solid var(--ink);padding:34px 44px;background:var(--paper-warm);box-shadow:var(--shadow-lg)">
    <div style="font-family:var(--display);font-size:110px;line-height:.9;letter-spacing:.04em;color:var(--ink);
      -webkit-mask-image:repeating-linear-gradient(0deg,#000 0 24px,transparent 24px 28px);mask-image:repeating-linear-gradient(0deg,#000 0 24px,transparent 24px 28px)">SPL-00T</div>
    <div style="font-family:var(--mono);font-size:14px;text-transform:uppercase;margin-top:10px">contents: 1,482 memes · this side up · fragile: no</div></div>`,
  rationale: 'the archive as freight: your memes are cargo, stenciled like a shipping crate. the double-o becomes 00, a unit count. utilitarian to the point of comedy, and it makes every export/download read as "shipping your crate."',
  icon: (s) => `<span style="font-family:var(--display);font-size:${s * .5}px;letter-spacing:.04em">S:0</span>`,
  iconBg: 'var(--orange)',
  applied: brTab('<b style="font-family:var(--display);font-size:11px">S:0</b>', 'SPL-00T'),
  spec: [['direction', 'freight/utility'], ['letterform', 'stencil-cut archivo, uppercase exception'], ['mark', 'crate label lockup'], ['risk', 'uppercase fights the lowercase voice; deliberate exception']],
});

/* ---- BRAND-5 pixel mark ---- */
SPECS['BRAND-5'] = (m) => {
  const px = (s) => {
    const P = [[1,1],[2,1],[3,1],[1,2],[3,2],[1,3],[2,3],[3,3],[3,4],[1,5],[2,5],[3,5]]; // "s" 5x7-ish
    const u = s / 6;
    return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${P.map(([x, y]) =>
      `<rect x="${x * u}" y="${(y) * u * 0.85}" width="${u}" height="${u * .85}" fill="#0a0a0a"/>`).join('')}</svg>`;
  };
  brandSheet(m, {
    name: 'pixel mark',
    hero: `<div style="display:flex;flex-direction:column;align-items:center;gap:14px">${px(160)}
      <div style="font-family:'VT323';font-size:120px;line-height:.8">sploot</div></div>`,
    rationale: 'memes are pixels; the mark admits it. a bitmap "s" built on a visible grid, drawn at the favicon size FIRST and scaled up, so the smallest render is the canonical one. pairs with the engineering-grid paper the system already stands on.',
    icon: px,
    applied: brTab(px(14), 'sploot'),
    spec: [['direction', 'bitmap-native'], ['letterform', 'vt323 or bitmap-traced archivo'], ['mark', '6×6 grid "s"'], ['why it wins', 'designed at 16px, the size 90% of users see it']],
  });
};

/* ---- BRAND-6 rubber stamp seal ---- */
SPECS['BRAND-6'] = (m) => {
  const seal = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="28" fill="none" stroke="#a02020" stroke-width="4"/>
    <circle cx="32" cy="32" r="18" fill="none" stroke="#a02020" stroke-width="2"/>
    <text x="32" y="37" text-anchor="middle" font-family="Archivo Black" font-size="13" fill="#a02020">spl</text>
  </svg>`;
  brandSheet(m, {
    name: 'rubber stamp seal',
    hero: `<div style="position:relative;display:inline-block">
      <svg width="300" height="300" viewBox="0 0 200 200" style="transform:rotate(-8deg)">
        <defs><path id="c" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0"/></defs>
        <circle cx="100" cy="100" r="92" fill="none" stroke="#a02020" stroke-width="7"/>
        <circle cx="100" cy="100" r="58" fill="none" stroke="#a02020" stroke-width="4"/>
        <text font-family="Space Mono" font-size="17" letter-spacing="4.5" fill="#a02020"><textPath href="#c">NO FOLDERS · JUST VIBES · EST. THE PILE · </textPath></text>
        <text x="100" y="112" text-anchor="middle" font-family="Archivo Black" font-size="34" fill="#a02020">sploot</text>
      </svg></div>`,
    rationale: 'the archive certifies itself. a circular inspection stamp, slightly rotated, slightly dry at the edges — the mark of an institution of one. lands perfectly on saved memes ("archived"), bangers ("certified"), and exports.',
    icon: seal, iconBg: '#f7f0dd',
    applied: brTab(seal(15), 'sploot'),
    spec: [['direction', 'institutional seal'], ['letterform', 'archivo center, mono ring text'], ['mark', 'red inspection stamp'], ['why it wins', 'one mark doubles as the banger/archived stamp mechanic']],
  });
};

/* ---- BRAND-7 oo ligature frames ---- */
SPECS['BRAND-7'] = (m) => {
  const oo = (s) => `<svg width="${s}" height="${s * .6}" viewBox="0 0 64 40">
    <rect x="4" y="6" width="26" height="28" fill="#fff" stroke="#0a0a0a" stroke-width="5"/>
    <rect x="34" y="6" width="26" height="28" fill="#ffe600" stroke="#0a0a0a" stroke-width="5"/>
  </svg>`;
  brandSheet(m, {
    name: 'oo ligature frames',
    hero: `<div style="font-family:var(--display);font-size:130px;line-height:.9;display:flex;align-items:center">spl
      <span style="display:inline-flex;gap:6px;margin:0 8px">
        <span style="width:86px;height:86px;border:10px solid var(--ink);background:#fff;display:inline-block"></span>
        <span style="width:86px;height:86px;border:10px solid var(--ink);background:var(--yellow);display:inline-block"></span>
      </span>t</div>`,
    rationale: 'the double-o is two empty image frames — two meme cells waiting to be filled. the wordmark contains the product: bordered rectangles, ready for thumbnails. in the app, real memes can live inside the two Os.',
    icon: oo,
    applied: brTab(oo(18), 'sploot'),
    spec: [['direction', 'ligature'], ['letterform', 'archivo with constructed oo'], ['mark', 'two frames = the oo, extractable'], ['why it wins', 'wordmark and product are the same drawing']],
  });
};

/* ---- BRAND-8 barcode lockup ---- */
SPECS['BRAND-8'] = (m) => brandSheet(m, {
  name: 'barcode lockup',
  hero: `<div style="border:var(--b);background:#fff;box-shadow:var(--shadow);padding:30px 40px;text-align:center">
    <div style="font-family:'Libre Barcode 39';font-size:130px;line-height:.9">*SPLOOT*</div>
    <div style="font-family:var(--mono);font-size:15px;text-transform:uppercase;letter-spacing:.3em;margin-top:6px">sploot · item: your memes</div></div>`,
  rationale: 'everything in the pile is inventory, so the brand is a scannable label. the wordmark is literally set in a working code-39 barcode; the human-readable line sits underneath like every price tag ever printed.',
  icon: (s) => `<span style="font-family:'Libre Barcode 39';font-size:${s * .9}px;line-height:.8">*S*</span>`,
  applied: brTab(`<span style="font-family:'Libre Barcode 39';font-size:16px">*S*</span>`, 'sploot'),
  spec: [['direction', 'inventory label'], ['letterform', 'code 39 + mono subline'], ['mark', 'the barcode itself'], ['risk', 'weak at 16px; favicon falls back to *S*']],
});

/* ---- BRAND-9 caption bubble ---- */
SPECS['BRAND-9'] = (m) => {
  const bub = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64">
    <rect x="6" y="10" width="52" height="34" fill="#fff" stroke="#0a0a0a" stroke-width="5"/>
    <polygon points="18,44 18,58 32,44" fill="#fff" stroke="#0a0a0a" stroke-width="5"/>
    <rect x="14" y="22" width="28" height="6" fill="#0a0a0a"/>
    <rect x="14" y="32" width="18" height="6" fill="#0a0a0a"/>
  </svg>`;
  brandSheet(m, {
    name: 'caption bubble',
    hero: `<div style="display:flex;align-items:center;gap:20px">${bub(170)}
      <div style="font-family:var(--display);font-size:120px;line-height:.9">sploot</div></div>`,
    rationale: 'a meme is an image plus the words you remember it by. the mark is a speech bubble holding redacted text — the caption you type into the search box. it points at the product mechanic: words in, picture out.',
    icon: bub, iconBg: 'var(--lime)',
    applied: brTab(bub(15), 'sploot'),
    spec: [['direction', 'mechanic-first'], ['letterform', 'archivo kept'], ['mark', 'speech bubble w/ text bars'], ['why it wins', 'reads as "search by what it says" at any size']],
  });
};

/* ---- BRAND-10 no-folder glyph ---- */
SPECS['BRAND-10'] = (m) => {
  const nf = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64">
    <path d="M8 18 h16 l6 8 h26 v28 H8z" fill="#fff" stroke="#0a0a0a" stroke-width="5"/>
    <line x1="10" y1="56" x2="56" y2="12" stroke="#ff2d9b" stroke-width="7"/>
  </svg>`;
  brandSheet(m, {
    name: 'no-folder glyph',
    hero: `<div style="display:flex;flex-direction:column;align-items:center;gap:14px">${nf(180)}
      <div style="font-family:var(--display);font-size:110px;line-height:.9">sploot</div>
      <div class="k-sticker yellow tilt-l">no folders. just vibes.</div></div>`,
    rationale: 'the brand is the refusal. a folder icon — the most recognizable glyph in computing — struck through in magenta. instantly legible as a position statement; the tagline has been the product label since day one, and this is it drawn.',
    icon: nf,
    applied: brTab(nf(15), 'sploot'),
    spec: [['direction', 'anti-icon'], ['letterform', 'archivo kept'], ['mark', 'struck folder'], ['risk', 'defines the brand by the enemy; funny, but negative space']],
  });
};

/* ---- BRAND-11 vector arrow ---- */
SPECS['BRAND-11'] = (m) => {
  const va = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64">
    <line x1="8" y1="52" x2="46" y2="16" stroke="#1f4cff" stroke-width="7"/>
    <polygon points="40,10 58,12 48,28" fill="#1f4cff"/>
    <circle cx="8" cy="52" r="6" fill="#0a0a0a"/>
  </svg>`;
  brandSheet(m, {
    name: 'vector arrow',
    hero: `<div style="display:flex;align-items:center;gap:16px">${va(160)}
      <div style="font-family:var(--display);font-size:120px;line-height:.9">spl<span style="color:var(--blue)">→</span>ot</div></div>`,
    rationale: 'the product is literally vectors: your query becomes an arrow through embedding space and lands on the meme. one dot (you), one arrow (the search), electric blue on ink. the nerdiest option and the most honest about the machinery.',
    icon: va,
    applied: brTab(va(15), 'sploot'),
    spec: [['direction', 'the machinery'], ['letterform', 'archivo, second o replaced by →'], ['mark', 'origin dot + arrow'], ['risk', 'reads generic-techy without the wordmark nearby']],
  });
};

/* ---- BRAND-12 chenille patch ---- */
SPECS['BRAND-12'] = (m) => {
  const patch = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64">
    <path d="M14 8 h36 a6 6 0 0 1 6 6 v36 a6 6 0 0 1 -6 6 h-36 a6 6 0 0 1 -6 -6 v-36 a6 6 0 0 1 6 -6z"
      fill="#ff2d9b" stroke="#0a0a0a" stroke-width="4" stroke-dasharray="3 3"/>
    <text x="32" y="44" text-anchor="middle" font-family="Archivo Black" font-size="34" fill="#ffe600" stroke="#0a0a0a" stroke-width="1.5">S</text>
  </svg>`;
  brandSheet(m, {
    name: 'chenille patch',
    hero: `<div style="display:flex;flex-direction:column;align-items:center;gap:16px">
      <svg width="260" height="260" viewBox="0 0 64 64">
        <path d="M14 8 h36 a6 6 0 0 1 6 6 v36 a6 6 0 0 1 -6 6 h-36 a6 6 0 0 1 -6 -6 v-36 a6 6 0 0 1 6 -6z"
          fill="#ff2d9b" stroke="#0a0a0a" stroke-width="3" stroke-dasharray="2.5 2.5"/>
        <text x="32" y="45" text-anchor="middle" font-family="Archivo Black" font-size="36" fill="#ffe600" stroke="#0a0a0a" stroke-width="1.5">S</text>
      </svg>
      <div style="font-family:var(--display);font-size:96px;line-height:.9">sploot <span style="font-size:40px;vertical-align:middle">varsity brainrot</span></div></div>`,
    rationale: 'you lettered in memes. a varsity "S" patch with stitched edges — the pile as a sport you are inexplicably devoted to. bangers become letterman achievements; the hall of fame writes itself.',
    icon: patch, iconBg: 'var(--paper)',
    applied: brTab(patch(16), 'sploot'),
    spec: [['direction', 'varsity'], ['letterform', 'archivo "S" patch + wordmark'], ['mark', 'stitched letter patch'], ['why it wins', 'gives bangers/hall-of-fame a whole trophy language']],
  });
};
