(function () {
  'use strict';

  css('taste-spine', `
    .taste-main{flex:1;width:min(1320px,100%);margin:auto;padding:clamp(18px,3vw,42px)}
    .taste-hero{display:grid;grid-template-columns:minmax(0,.82fr) minmax(420px,1.18fr);gap:clamp(24px,5vw,72px);align-items:center;min-height:700px}
    .taste-copy{display:grid;gap:18px;align-content:center}.taste-copy p{max-width:52ch;font-size:18px;line-height:1.45}.taste-actions,.taste-tools,.taste-chips{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .taste-demo{display:grid;gap:16px}.taste-results{display:grid;grid-template-columns:1.15fr .85fr;gap:14px}.taste-results .t-cell:first-child{grid-row:span 2}
    .taste-peek{padding:26px 0 54px;border-top:var(--b);display:grid;grid-template-columns:1fr 1fr;gap:30px}
    .taste-navshell{position:sticky;top:0;z-index:5;background:var(--paper)}.taste-navrow{display:grid;grid-template-columns:auto minmax(240px,1fr) auto;gap:14px;align-items:center;padding:12px clamp(14px,3vw,36px);background:var(--panel);border-bottom:var(--b)}
    .taste-subrow{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px clamp(14px,3vw,36px);border-bottom:var(--b);background:var(--paper-warm)}
    .taste-feedclip{padding:24px clamp(14px,3vw,36px)}.taste-feedclip .t-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
    .taste-search{display:flex;align-items:center;gap:8px;border:var(--b);border-radius:var(--r-pill);padding:7px 12px;background:var(--paper-warm)}.taste-search input{min-width:0;width:100%;border:0;background:transparent;outline:0}
    .taste-side-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:22px}.taste-piles{display:grid;gap:10px;align-content:start}.taste-piles.stick{position:sticky;top:24px}
    .taste-masonry{columns:4;column-gap:16px}.taste-masonry .t-cell{break-inside:avoid;margin-bottom:16px}
    .taste-mixed{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;align-items:start}.taste-mixed .wide{grid-column:span 2}.taste-mixed .tall{grid-row:span 2}
    .taste-detail{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,.5fr);gap:24px;align-items:start}.taste-detail-media{display:grid;place-items:center;padding:10px}.taste-detail-media img{max-height:68dvh;width:100%;object-fit:contain}.taste-meta{display:grid;gap:14px}.taste-data{display:grid;grid-template-columns:1fr 1fr;gap:8px}.taste-data span{padding:8px 0;border-bottom:2px dashed var(--ink);font:10px var(--mono)}
    .taste-iconrail{display:flex;gap:8px}.taste-related{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:28px}.taste-stack{display:grid;gap:24px}.taste-stackhead{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:end}
    .taste-upload{display:grid;grid-template-columns:minmax(320px,.9fr) minmax(0,1.1fr);gap:24px;align-items:start}.taste-drop{min-height:430px;display:grid;place-items:center;text-align:center;padding:36px}.taste-drop>div{display:grid;gap:14px;justify-items:center}.taste-queue{display:grid;gap:12px}.taste-job{display:grid;grid-template-columns:58px 1fr auto;gap:12px;align-items:center;padding:12px}.taste-job .thumb{aspect-ratio:1;display:grid;place-items:center;border:var(--b-thin);border-radius:var(--r-inner);font:10px var(--mono)}
    .taste-settings{display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px}.taste-settings-body{display:grid;gap:18px}.taste-panel{padding:22px;display:grid;gap:14px}.taste-panel-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.taste-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.taste-field{display:grid;gap:6px}.taste-field input{width:100%;border:var(--b);border-radius:var(--r-ctl);padding:10px;background:var(--paper-warm)}
    @media(max-width:900px){.taste-hero,.taste-upload,.taste-detail{grid-template-columns:1fr}.taste-side-layout,.taste-settings{grid-template-columns:1fr}.taste-piles.stick{position:static}.taste-masonry{columns:2}.taste-related{grid-template-columns:repeat(2,minmax(0,1fr))}.taste-feedclip .t-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.taste-navrow{grid-template-columns:auto 1fr}.taste-navrow .taste-search{grid-column:1/-1;grid-row:2}.taste-mixed{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:700px){.taste-main{padding:14px}.taste-hero{min-height:auto}.taste-results,.taste-peek,.taste-stackhead,.taste-fields{grid-template-columns:1fr}.taste-results .t-cell:first-child{grid-row:auto}.taste-navrow{display:flex;flex-wrap:wrap}.taste-navrow .taste-search{order:3;flex-basis:100%}.taste-subrow{align-items:flex-start;flex-direction:column}.taste-masonry{columns:1}.taste-mixed{grid-template-columns:1fr}.taste-mixed .wide{grid-column:auto}.taste-related{grid-template-columns:1fr 1fr}.taste-job{grid-template-columns:48px minmax(0,1fr)}.taste-job>:last-child{grid-column:2}.taste-data{grid-template-columns:1fr}.taste-drop{min-height:280px}.taste-feedclip .t-grid{grid-template-columns:1fr 1fr}}
    @media(max-width:390px){.taste-main,.taste-feedclip{padding-inline:10px}.taste-related,.taste-feedclip .t-grid{grid-template-columns:1fr}.taste-tools{width:100%}.taste-tools .t-btn{flex:1}.taste-chips{align-items:stretch}.taste-chips>*{max-width:100%}}
  `);

  const root = (body, spec) => {
    const el = h(`<div class="t-shelf">${body}${labSpec(spec)}</div>`).firstElementChild;
    themeToggle(el);
    return el;
  };
  const mast = () => kMast(['the pile', 'bangers', 'sign in']);
  const cells = (from, count, opts) => MEMES.slice(from, from + count).map((m, i) => kCell(m, i === 0 && opts && opts.match ? 'match' : '', opts)).join('');
  const navSearch = () => `<label class="taste-search">${ICONS.search}<input value="cat losing it" aria-label="search the pile"></label>`;
  const tabs = () => `<div class="t-tabs"><button class="t-tab on">all</button><button class="t-tab">bangers</button></div>`;
  const sorters = () => `<div class="taste-tools"><button class="t-btn compact t-press-sm">recent</button>${kCtl('shuffle','shuffle')}${kCtl('sun','switch theme')}${kCtl('pile','help')}</div>`;
  const related = () => `<section><h2 class="t-logo">related</h2><div class="taste-related">${MEMES.slice(1,5).map(m=>kCell(m,'',{score:true})).join('')}</div></section>`;
  const detailMeta = () => `<div class="taste-meta"><span class="t-tag yellow">94% match</span><h1 class="t-logo">${esc(MEMES[0].cap)}</h1><div class="taste-data"><span>file ${MEMES[0].file}</span><span>dims 1080 × 1350</span><span>size 842 kb</span><span>vec ${MEMES[0].vec}</span><span>date jul 8, 2026</span><span>pile reaction faces</span></div><div class="taste-iconrail">${kCtl('heart','remove banger','hearted')}${kCtl('share','share meme')}${kCtl('trash','delete meme')}</div></div>`;
  const jobs = () => [
    ['IMG_8821.png','queued','waiting for a slot','cancel'],
    ['cat_final.jpg','cooking','embedding 62%','working'],
    ['receipt.png','done','vector 1214','open'],
    ['bad_heic.heic','failed','file type not supported','retry']
  ].map((j,i)=>`<article class="t-card taste-job"><div class="thumb">${String(i+1).padStart(2,'0')}</div><div><b>${j[0]}</b><div class="t-note">${j[1]} · ${j[2]}</div></div><button class="t-btn compact ${i===3?'destructive':''} t-press-sm">${j[3]}</button></article>`).join('');
  const panel = (title, note, body, danger) => `<section class="t-card taste-panel"><div class="taste-panel-head"><div><h2 class="t-logo">${title}</h2><p>${note}</p></div>${danger?'<span class="t-tag magenta">careful</span>':''}</div>${body}</section>`;

  SPECS['TASTE-LAND-1'] = () => root(`${mast()}<main class="taste-main"><section class="taste-hero"><div class="taste-copy"><span class="t-tag yellow">your private meme pile</span><h1 class="t-h1">remember the <em>vibe.</em><br>find the meme.</h1><p>drop in the images you keep losing. sploot reads the picture, not the filename, so plain language gets you back there.</p><div class="taste-actions"><a href="#0" class="t-btn primary t-press">start your pile</a><a href="#0" class="t-btn t-press">sign in</a></div><p class="t-note">private by default · upload anything · heart the bangers</p></div><div class="taste-demo">${kConsole('cat judging my decisions')}<div class="taste-results">${kCell(MEMES[0],'match',{score:true})}${kCell(MEMES[8],'near',{score:true})}${kCell(MEMES[1],'dim',{score:true})}</div></div></section><section class="taste-peek"><h2 class="t-logo">one pile. no taxonomy homework.</h2><p>upload now, describe it later. hearts keep the bangers close without turning your collection into a filing cabinet.</p></section></main>`,[['section','landing'],['structure','copy-led split with a live ranked result stack'],['hierarchy','the retrieval promise leads, proof answers beside it'],['density','quiet pitch left, dense working console right']]);

  SPECS['TASTE-LAND-2'] = () => root(`${mast()}<main class="taste-main"><section class="taste-hero"><div class="taste-demo">${kConsole('everything is fine')}<div class="taste-results">${kCell(MEMES[3],'match',{score:true})}${kCell(MEMES[5],'near',{score:true})}${kCell(MEMES[4],'dim',{score:true})}</div></div><div class="taste-copy"><p class="t-eyebrow">search first. explanation second.</p><h1 class="t-h1">the pile has a <em>memory.</em></h1><p>semantic search finds what filenames cannot. upload your stash, heart the bangers, keep it private, and ask for what you remember seeing.</p><div class="taste-actions"><a href="#0" class="t-btn secondary t-press">make a pile</a><a href="#0" class="t-btn t-press">see how it works</a></div><div class="taste-chips"><span class="t-tag">1,482 indexed</span><span class="t-tag magenta">private by default</span></div></div></section><section class="taste-peek"><h2 class="t-logo">your camera roll is not a search engine.</h2><div class="taste-chips"><span class="t-tag yellow">upload</span><span class="t-tag">describe</span><span class="t-tag magenta">send the right one</span></div></section></main>`,[['section','landing'],['structure','working product leads in a reverse split before the pitch'],['hierarchy','search result is the headline, copy becomes interpretation'],['density','proof-heavy first viewport with a narrow conversion column']]);

  SPECS['TASTE-NAV-1'] = () => root(`<div class="taste-navshell"><div class="taste-navrow"><span class="t-logo">spl<i>oo</i>t</span>${navSearch()}<div class="taste-tools"><button class="t-btn primary compact t-press-sm">upload</button>${kCtl('sun','switch theme')}${kCtl('pile','help')}</div></div><div class="taste-subrow">${tabs()}<div class="taste-tools"><span class="t-note">1,482 memes</span><button class="t-btn compact t-press-sm">recent</button>${kCtl('shuffle','shuffle')}</div></div>${kStatus()}</div><main class="taste-feedclip"><div class="t-grid">${cells(0,8)}</div></main>`,[['section','navigation'],['structure','three-band command header: intent, filters, machine state'],['hierarchy','search owns the wide center while upload stays immediate'],['density','operational chrome above an honest four-column feed']]);

  SPECS['TASTE-NAV-2'] = () => root(`<div class="taste-navshell"><div class="taste-navrow"><span class="t-logo">spl<i>oo</i>t</span><div class="taste-tools">${tabs()}<button class="t-btn compact t-press-sm">recent</button>${kCtl('shuffle','shuffle')}</div><div class="taste-tools"><span class="t-tag yellow">1,482</span>${kCtl('sun','switch theme')}${kCtl('pile','help')}<button class="t-btn primary compact t-press-sm">upload</button></div></div><div class="taste-subrow" style="display:grid;grid-template-columns:minmax(0,1fr) auto">${navSearch()}<span class="t-note">3 cooking · search live</span></div></div><main class="taste-feedclip"><div class="t-grid">${cells(2,8)}</div></main>`,[['section','navigation'],['structure','library controls lead row one, full-width search becomes row two'],['hierarchy','mode and count orient before query entry'],['density','compact utility rail with a generous search runway']]);

  SPECS['TASTE-FEED-1'] = () => root(`${mast()}<main class="taste-main"><div class="taste-side-layout"><aside class="taste-piles stick"><p class="t-eyebrow">piles</p>${kPiles(1)}</aside><section><div class="taste-stackhead"><div><h1 class="t-h1">the pile.</h1><p>recent first · ${LIB.total.toLocaleString()} memes</p></div>${tabs()}</div><div class="taste-masonry" style="margin-top:22px">${cells(0,12)}</div></section></div></main>`,[['section','feed'],['structure','persistent pile rail beside uncropped masonry'],['hierarchy','collection context leads, individual captions stay secondary'],['density','twelve varied silhouettes with full action rails']]);

  SPECS['TASTE-FEED-2'] = () => root(`${mast()}<main class="taste-main"><div class="taste-stackhead"><div><p class="t-eyebrow">the pile · recent</p><h1 class="t-h1">all <em>1,482.</em></h1></div><div class="taste-chips">${PILES.slice(0,4).map((p,i)=>`<button class="t-tag ${i===0?'yellow':''}">${p.name} · ${p.n}</button>`).join('')}</div></div><section class="taste-mixed" style="margin-top:24px">${MEMES.slice(0,12).map((m,i)=>`<div class="${i===0||i===7?'wide':''} ${i===3?'tall':''}">${kCell(m,'',{score:i<3})}</div>`).join('')}</section></main>`,[['section','feed'],['structure','mixed-span editorial grid with piles promoted to chips'],['hierarchy','total library scale leads, strongest matches widen the rhythm'],['density','alternating broad anchors and compact scan cells']]);

  SPECS['TASTE-DET-1'] = () => root(`${mast()}<main class="taste-main"><section class="taste-detail"><div class="t-card taste-detail-media">${memeImg(MEMES[0])}</div><aside>${detailMeta()}</aside></section>${related()}</main>`,[['section','detail'],['structure','uncropped media and metadata form an editorial split'],['hierarchy','image leads at near viewport height, actions sit with facts'],['density','calm primary canvas followed by four scored relations']]);

  SPECS['TASTE-DET-2'] = () => root(`${mast()}<main class="taste-main taste-stack"><div class="taste-stackhead">${detailMeta()}<div class="taste-iconrail">${kCtl('heart','remove banger','hearted')}${kCtl('share','share meme')}${kCtl('trash','delete meme')}</div></div><div class="t-card taste-detail-media">${memeImg(MEMES[0])}</div>${related()}</main>`,[['section','detail'],['structure','metadata headline, full-width media stage, then related drawer'],['hierarchy','meaning and match lead before the image reveal'],['density','wide reading flow with actions duplicated at the decision edge']]);

  SPECS['TASTE-UP-1'] = () => root(`${mast()}<main class="taste-main"><div class="taste-stackhead"><div><p class="t-eyebrow">add to the pile</p><h1 class="t-h1">drop it <em>here.</em></h1></div><span class="t-tag yellow">3 slots open</span></div><section class="taste-upload" style="margin-top:24px"><div class="t-card taste-drop"><div>${ICONS.upload}<h2 class="t-logo">drop images or choose files</h2><p>png, jpg, webp · private by default</p><button class="t-btn primary t-press">choose files</button></div></div><div class="taste-queue"><p class="t-eyebrow">upload queue · 4</p>${jobs()}</div></section></main>`,[['section','upload'],['structure','large intake field paired with a stateful job queue'],['hierarchy','drop action leads, exceptions remain visible beside it'],['density','spacious input against four compact operational rows']]);

  SPECS['TASTE-UP-2'] = () => root(`${mast()}<main class="taste-main taste-stack"><div class="taste-stackhead"><div><p class="t-eyebrow">upload intake</p><h1 class="t-h1">four files. <em>one problem.</em></h1></div><button class="t-btn primary t-press">add more</button></div><div class="t-card taste-drop" style="min-height:210px"><div>${ICONS.upload}<h2 class="t-logo">drop anywhere in this tray</h2><p>your uploads stay private unless you share them</p></div></div><section class="taste-queue"><div class="taste-stackhead"><h2 class="t-logo">now cooking</h2><span class="t-note">1 of 4 needs you</span></div>${jobs()}</section></main>`,[['section','upload'],['structure','shallow batch tray above a full-width processing ledger'],['hierarchy','batch state leads, failed item gets explicit retry'],['density','compressed intake gives the queue most of the viewport']]);

  const account = `<div class="taste-fields"><label class="taste-field"><b>email</b><input value="meme.person@example.com"></label><label class="taste-field"><b>display name</b><input value="pile owner"></label></div><div><button class="t-btn primary t-press">save account</button></div>`;
  const tokens = `<p class="t-note">2 active tokens · last used 18 minutes ago</p><div class="taste-actions"><button class="t-btn t-press">make upload token</button><button class="t-btn compact t-press-sm">manage</button></div>`;
  const embedding = `<div class="taste-data"><span>1,479 embedded</span><span>3 cooking</span><span>siglip-base</span><span>768 dimensions</span></div>`;
  const storage = `<div class="taste-data"><span>4.7 gb used</span><span>1,482 files</span></div><button class="t-btn compact t-press-sm">export pile</button>`;
  const danger = `<p>deleting the pile removes every image, vector, heart, and token.</p><button class="t-btn destructive t-press">delete the pile</button>`;

  SPECS['TASTE-SET-1'] = () => root(`${mast()}<main class="taste-main"><div class="taste-settings"><aside class="taste-piles stick"><p class="t-eyebrow">settings</p><button class="t-pile on">account</button><button class="t-pile">access</button><button class="t-pile">machine</button><button class="t-pile">storage</button></aside><div class="taste-settings-body"><h1 class="t-h1">your <em>pile.</em></h1>${panel('account','who owns this pile',account)}${panel('upload tokens','let tools add memes without your password',tokens)}${panel('embeddings','the searchable part of the pile',embedding)}${panel('storage','what the pile weighs',storage)}${panel('danger zone','there is no undo after deletion',danger,true)}</div></div></main>`,[['section','settings'],['structure','sticky contents rail beside a long operational form'],['hierarchy','account leads, irreversible deletion closes the page'],['density','one focused panel per system concern']]);

  SPECS['TASTE-SET-2'] = () => root(`${mast()}<main class="taste-main taste-stack"><div class="taste-stackhead"><div><p class="t-eyebrow">settings</p><h1 class="t-h1">pile <em>control.</em></h1></div><span class="t-tag yellow">everything healthy</span></div><section class="taste-mixed"><div class="wide">${panel('account','identity and sign-in',account)}</div><div>${panel('embeddings','search machine',embedding)}</div><div>${panel('storage','files and export',storage)}</div><div class="wide">${panel('upload tokens','agent and extension access',tokens)}</div><div class="wide">${panel('danger zone','permanent means permanent',danger,true)}</div></section></main>`,[['section','settings'],['structure','asymmetric control board groups health, access, and ownership'],['hierarchy','system health leads beside account, danger spans the final row'],['density','mixed-span panels expose status without a side menu']]);

  /* round 2 mutations of TASTE-DET-1 — editorial-split DNA held, split
     ratio/stickiness, ledger anatomy, action-rail placement, and how the
     scored related section lands all vary. */
  css('taste-r2', `
    .taste-detail3{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,340px);gap:clamp(20px,4vw,40px);align-items:start}
    .taste-detail3-main{display:grid;gap:22px;min-width:0}
    .taste-meta3{position:sticky;top:24px;align-self:start;display:grid;gap:16px;padding:20px}
    .taste-ledger{display:grid;gap:0}
    .taste-ledger>div{display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:2px dashed var(--ink);font:10px var(--mono)}
    .taste-ledger>div:last-child{border-bottom:0}
    .taste-ledger dt{opacity:.65}
    .taste-ledger dd{font-weight:700;text-align:right}

    .taste-detail4{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(230px,.5fr);gap:clamp(16px,3vw,30px);align-items:start}
    .taste-plate4{padding:20px;display:grid;gap:14px;align-content:start}
    .taste-plate-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .taste-plate-grid>div{display:grid;gap:3px;padding:7px 0;border-bottom:2px dashed var(--ink)}
    .taste-plate-grid>div b{font:9px var(--mono);font-weight:400;opacity:.65;text-transform:lowercase}
    .taste-plate-grid>div span{font-size:11px;font-weight:700}
    .taste-mediarail{position:absolute;top:14px;right:14px}
    .taste-related4{margin-top:30px}
    .taste-related4-head{display:flex;justify-content:space-between;align-items:end;gap:14px;flex-wrap:wrap;margin-bottom:16px}
    .taste-related4-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}

    @media(max-width:900px){
      .taste-detail3,.taste-detail4{grid-template-columns:1fr}
      .taste-meta3{position:static}
      .taste-plate-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .taste-related4-row{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    @media(max-width:700px){
      .taste-plate-grid{grid-template-columns:1fr 1fr}
      .taste-related4-row{grid-template-columns:1fr}
      .taste-ledger>div{flex-direction:column;gap:2px}
      .taste-ledger dd{text-align:left}
    }
    @media(max-width:390px){
      .taste-plate-grid{grid-template-columns:1fr}
      .taste-mediarail{position:static;margin-top:10px}
    }
  `);

  SPECS['TASTE-DET-3'] = () => root(`${mast()}<main class="taste-main"><section class="taste-detail3"><div class="taste-detail3-main"><div class="t-card taste-detail-media">${memeImg(MEMES[0])}</div><div class="taste-related3 taste-masonry">${MEMES.slice(1, 9).map((m) => kCell(m, '', { score: true })).join('')}</div></div><aside class="t-card taste-meta3"><div class="taste-iconrail">${kCtl('heart', 'remove banger', 'hearted')}${kCtl('share', 'share meme')}${kCtl('trash', 'delete meme')}</div><span class="t-tag yellow">94% match</span><h1 class="t-logo">${esc(MEMES[0].cap)}</h1><dl class="taste-ledger"><div><dt>file</dt><dd>${MEMES[0].file}</dd></div><div><dt>format</dt><dd>png</dd></div><div><dt>dims</dt><dd>1080 × 1350</dd></div><div><dt>size</dt><dd>842 kb</dd></div><div><dt>vec</dt><dd>${MEMES[0].vec}</dd></div><div><dt>model</dt><dd>${LIB.model}</dd></div><div><dt>date</dt><dd>jul 8, 2026</dd></div><div><dt>pile</dt><dd>reaction faces</dd></div></dl></aside></section></main>`, [['section', 'detail'], ['structure', 'action-first sticky ledger rail beside a media-into-masonry scroll'], ['hierarchy', 'controls lead the rail, the ledger reads like a receipt beneath'], ['density', 'one hero image widens into eight scored relations with no hard stop']]);

  SPECS['TASTE-DET-4'] = () => root(`${mast()}<main class="taste-main"><section class="taste-detail4"><div class="t-card taste-detail-media" style="position:relative">${memeImg(MEMES[0])}<div class="taste-mediarail taste-iconrail">${kCtl('heart', 'remove banger', 'hearted')}${kCtl('share', 'share meme')}${kCtl('trash', 'delete meme')}</div></div><aside class="t-card taste-plate4"><span class="t-tag yellow">94% match</span><h1 class="t-logo">${esc(MEMES[0].cap)}</h1><div class="taste-plate-grid"><div><b>file</b><span>${MEMES[0].file}</span></div><div><b>dims</b><span>1080 × 1350</span></div><div><b>size</b><span>842 kb</span></div><div><b>vec</b><span>${MEMES[0].vec}</span></div><div><b>date</b><span>jul 8, 2026</span></div><div><b>pile</b><span>reaction faces</span></div></div></aside></section><section class="taste-related4"><div class="taste-related4-head"><h2 class="t-logo">closest matches</h2><span class="t-note">ranked by cosine similarity</span></div><div class="taste-related4-row">${kCell(MEMES[1], 'match', { score: true })}${kCell(MEMES[2], '', { score: true })}${kCell(MEMES[3], '', { score: true })}</div></section></main>`, [['section', 'detail'], ['structure', 'overlay action rail on the media, tight three-column spec plate beside it'], ['hierarchy', 'image and identity lead, a dedicated scored row closes the read'], ['density', 'dense six-field plate, then three large ranked relations']]);
}());
