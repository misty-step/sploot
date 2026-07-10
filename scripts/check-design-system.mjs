#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();

const failures = [];

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function assertFile(path) {
  if (!existsSync(join(repoRoot, path))) {
    fail(`missing required design artifact: ${path}`);
  }
}

function assertIncludes(path, needle, reason) {
  const content = read(path);
  if (!content.includes(needle)) {
    fail(`${path}: missing ${reason} (${needle})`);
  }
}

assertFile('DESIGN.md');
assertFile('design-contract.md');
assertFile('docs/design/tokens.md');
assertFile('docs/design/component-library.md');
assertFile('apps/web/components/sploot/sticker-tab.tsx');
assertFile('apps/web/components/sploot/banger-stamp.tsx');
assertFile('apps/web/components/sploot/cluster-pile.tsx');
assertFile('apps/web/components/sploot/atlas-landing-hero.tsx');
assertFile('apps/web/components/sploot/pile-mark.tsx');
assertFile('apps/extension/entrypoints/popup/App.tsx');
assertFile('apps/extension/entrypoints/popup/style.css');

if (existsSync(join(repoRoot, 'DESIGN.md'))) {
  for (const heading of [
    '## 1. Product Intent',
    '## 2. Audience and Context',
    '## 3. Brand Attributes',
    '## 4. Visual Language',
    '## 5. Layout and Density',
    '## 6. Components and Interaction',
    '## 7. Content Voice',
    '## 8. Accessibility and Responsiveness',
    '## 9. Evidence and Governance',
  ]) {
    assertIncludes('DESIGN.md', heading, 'design-system section');
  }

  for (const phrase of [
    'self-organizing piles',
    'No Folders Just Vibes',
    'Meme Atlas',
    'pnpm lint:design',
  ]) {
    assertIncludes('DESIGN.md', phrase, 'current design direction');
  }
}

if (existsSync(join(repoRoot, 'design-contract.md'))) {
  for (const phrase of ['Provenance', 'Migration Exceptions', 'provided', 'observed', 'inferred']) {
    assertIncludes('design-contract.md', phrase, 'design provenance contract');
  }
}

const cssPath = 'apps/web/app/globals.css';
for (const token of [
  '--sploot-ink',
  '--sploot-paper',
  '--sploot-paper-warm',
  '--sploot-void',
  '--sploot-cyan',
  '--sploot-coral',
  '--sploot-violet',
  '--sploot-lime',
  // neo-brutalist structural tokens
  '--sploot-blue',
  '--sploot-magenta',
  '--sploot-yellow',
  '--sploot-orange',
  '--sploot-border',
  '--sploot-shadow',
  '--sploot-shadow-lg',
  '--sploot-match-ring',
  '--sploot-grid-line',
  '--sploot-sticker-shadow',
  '--sploot-active-border-width',
  '--sploot-touch-target',
  '--color-sploot-ink',
  '--color-sploot-cyan',
]) {
  assertIncludes(cssPath, token, 'Sploot semantic token');
}

for (const token of [
  '--sploot-motion-fast',
  '--sploot-motion-base',
  '--sploot-motion-panel',
  '--sploot-motion-cluster',
  '--sploot-ease-out',
  '--sploot-ease-snap',
  'animate-sploot-stamp',
  'animate-sploot-pop',
  'animate-sploot-slide-up',
  'prefers-reduced-motion: reduce',
]) {
  assertIncludes(cssPath, token, 'Sploot motion system');
}

for (const phrase of [
  '--sploot-ink',
  '--sploot-blue',
  '--sploot-magenta',
  '--sploot-yellow',
  '--sploot-orange',
  '--sploot-border',
  '--sploot-shadow-lg',
  '--sploot-match-ring',
  '--sploot-touch-target',
  '--sploot-ease-snap',
  'tracking-normal',
  'animate-sploot-stamp',
]) {
  assertIncludes('docs/design/tokens.md', phrase, 'documented design token');
}

for (const phrase of [
  'Search Console',
  'Meme Cell',
  'Stat Block',
  'Status Bar',
  'Pile / Cluster',
  'Sticker Tab',
  'Banger Stamp',
  'Implemented Wrappers',
]) {
  assertIncludes('docs/design/component-library.md', phrase, 'documented component grammar');
}

for (const [path, phrases] of Object.entries({
  'apps/web/components/sploot/sticker-tab.tsx': ['sploot-sticker-shadow', 'border-sploot-cyan'],
  'apps/web/components/sploot/banger-stamp.tsx': ['border-sploot-coral', 'sploot-tabular'],
  'apps/web/components/sploot/cluster-pile.tsx': ['bg-sploot-pile-surface', 'StickerTab', 'src?: string'],
  'apps/web/components/sploot/atlas-landing-hero.tsx': ['SearchField', 'StatusBar', 'StatBlock'],
  'apps/web/components/sploot/search-field.tsx': ['role="search"', 'MemeCell'],
  'apps/web/components/sploot/meme-cell.tsx': ['sploot-match-ring', 'MemeCellState'],
  'apps/web/components/sploot/stat-block.tsx': ['font-display', 'border-sploot-ink'],
  'apps/web/components/sploot/status-bar.tsx': ['bg-sploot-void', 'system status'],
  'apps/web/app/styleguide/page.tsx': ['MemeCell', 'StatBlock', 'StatusBar'],
  'apps/web/components/sploot/pile-mark.tsx': ['--sploot-sticker-cyan', '--sploot-sticker-violet'],
  'apps/web/components/chrome/navbar.tsx': ['PileMark'],
  'apps/web/components/chrome/filter-chips.tsx': ['bg-sploot-coral', 'border-sploot-coral'],
  'apps/web/components/search/search-bar.tsx': ['--sploot-touch-target'],
  'apps/web/components/chrome/mobile-command-dock.tsx': ['--sploot-touch-target'],
  'apps/web/components/library/image-tile.tsx': ['BangerStamp', 'border-sploot-violet', 'text-sploot-cyan'],
  // sploot-074: the first-use empty state is the capture rig — demo pile of
  // MemeCells + sticker-labeled capture-surface activation, never a generic
  // Card/icon illustration (DESIGN.md §6 empty-state rule).
  'apps/web/components/library/empty-state.tsx': ['MemeCell', 'StickerTab', 'lab-074-capture-activation'],
  // The popup adopts tokens through its stylesheet: App.tsx must import the
  // token-driven style.css and use its semantic panel classes.
  'apps/extension/entrypoints/popup/App.tsx': ["import './style.css'", 'auth-panel'],
  'apps/extension/entrypoints/popup/style.css': ['--sploot-cyan', '--sploot-coral', '--radius-square: 0px'],
  'apps/web/app/page.tsx': ['AtlasLandingHero'],
})) {
  for (const phrase of phrases) {
    assertIncludes(path, phrase, 'implemented Sploot design-system adoption');
  }
}

// sploot-032: the @misty-step/aesthetic substrate is wired and documented.
// The semantic layer must resolve to --ae-*, the deviation doc must exist,
// and the auth door must be the substrate console (no violet glassmorphism).
assertFile('docs/design/aesthetic-adoption.md');
for (const phrase of ['@misty-step/aesthetic', 'declared deviations', 'Swiss chrome']) {
  assertIncludes('docs/design/aesthetic-adoption.md', phrase, 'substrate deviation contract');
}
// The @misty-step/aesthetic base import remains, but the TOYBOX lock
// (lab-034, AFD-8) supersedes the ADR-0005 --ae-* semantic steering: the
// shadcn slots now resolve to --sploot-* tokens (see the "TOYBOX semantic
// mapping" block in globals.css), so the old --ae-accent / --ae-surface
// wiring is intentionally gone. Only the base-layer import is still guaranteed.
for (const phrase of ['@import "@misty-step/aesthetic" layer(base)']) {
  assertIncludes(cssPath, phrase, 'aesthetic substrate base import');
}
assertIncludes(cssPath, 'TOYBOX semantic mapping', 'toybox semantic mapping block');
for (const [doorPath, phrases] of Object.entries({
  'apps/web/components/auth/console-door.tsx': ['auth.console', 'consoleDoorAppearance'],
  'apps/web/app/sign-in/[[...sign-in]]/page.tsx': ['ConsoleDoor'],
  'apps/web/app/sign-up/[[...sign-up]]/page.tsx': ['ConsoleDoor'],
})) {
  for (const phrase of phrases) {
    assertIncludes(doorPath, phrase, 'substrate console auth door');
  }
}
for (const doorPath of [
  'apps/web/app/sign-in/[[...sign-in]]/page.tsx',
  'apps/web/app/sign-up/[[...sign-up]]/page.tsx',
]) {
  const content = read(doorPath);
  for (const forbidden of ['violet', 'backdrop-blur', 'bg-gradient-']) {
    if (content.includes(forbidden)) {
      fail(`${doorPath}: auth door must stay on the substrate console — found ${forbidden} (DESIGN.md bans glassmorphism)`);
    }
  }
}

const landingSystemFiles = [
  'apps/web/app/page.tsx',
  'apps/web/app/styleguide/page.tsx',
  'apps/web/components/sploot/atlas-landing-hero.tsx',
  'apps/web/components/sploot/search-field.tsx',
  'apps/web/components/sploot/meme-cell.tsx',
  'apps/web/components/sploot/stat-block.tsx',
  'apps/web/components/sploot/status-bar.tsx',
  'apps/web/components/sploot/sticker-tab.tsx',
  'apps/web/components/sploot/banger-stamp.tsx',
  'apps/web/components/sploot/cluster-pile.tsx',
  'apps/web/components/ui/button.tsx',
  // sploot-074: the capture-rig empty state is a product design-system surface.
  'apps/web/components/library/empty-state.tsx',
];

for (const file of landingSystemFiles) {
  const content = read(file);
  for (const phrase of ['MEME SEARCH. INSTANT.', 'AI POWERED', 'START FOR FREE']) {
    if (content.includes(phrase)) {
      fail(`${file}: legacy SaaS hero phrase remains (${phrase})`);
    }
  }
  for (const tokenName of ['electric-lime', 'hot-pink', 'cyber-blue']) {
    if (content.includes(tokenName)) {
      fail(`${file}: new landing design-system code must use sploot-* tokens, not ${tokenName}`);
    }
  }
  // TOYBOX DNA (lab-034, AFD-8): surfaces are ROUNDED toys. Radius grammar is
  // enforced product-wide by the token-radius ratchet below (rounded-none and
  // arbitrary px radii are banned; rounded-[var(--sploot-radius*)] / rounded-full
  // / token-driven ui defaults are the sanctioned forms).
  const nonZeroTracking = (content.match(/tracking-(?!normal\b)[a-z0-9[\]./-]+/g) || []);
  if (nonZeroTracking.length > 0) {
    fail(`${file}: letter spacing must stay at 0 — remove ${nonZeroTracking[0]}`);
  }
}

const extensionUiFiles = [
  'apps/extension/entrypoints/popup/App.tsx',
  'apps/extension/entrypoints/popup/style.css',
];

for (const file of extensionUiFiles) {
  const content = read(file);
  for (const forbidden of ['#7C5CFF', "borderRadius: '8px'", 'backdrop-filter']) {
    if (content.includes(forbidden)) {
      fail(`${file}: extension popup must use Sploot square token grammar, found ${forbidden}`);
    }
  }
  if (content.includes('linear-gradient') && !content.includes('linear-gradient(var(--sploot-grid-line)')) {
    fail(`${file}: extension popup may use Sploot grid lines, not decorative gradients`);
  }
}

const trackedUiFiles = execSync(
  "git ls-files 'apps/web/app/**/*.tsx' 'apps/web/components/**/*.tsx' 'apps/web/components/**/*.ts'",
  { cwd: repoRoot, encoding: 'utf8' }
)
  .split('\n')
  .filter(Boolean);

const migrationExceptions = new Map([
  ['apps/web/app/not-found.tsx', ['bg-clip-text']],
  // sploot-032 ratchet: the auth door (sign-in/sign-up) and the navbar lost
  // their gradient/blur exceptions when they moved onto the aesthetic
  // substrate — do not re-add them. app/page.tsx + image-tile blur is the
  // lightbox scrim (content overlay), not chrome glassmorphism.
  ['apps/web/components/library/image-skeleton.tsx', ['bg-gradient-']],
  ['apps/web/components/ui/delete-confirmation-modal.tsx', ['bg-gradient-']],
  ['apps/web/app/app/page.tsx', ['backdrop-blur']],
  ['apps/web/components/library/image-tile.tsx', ['backdrop-blur']],
]);

for (const file of migrationExceptions.keys()) {
  if (!existsSync(join(repoRoot, file))) {
    fail(`${file}: stale design migration exception points at a missing file`);
  }
}

const bannedPatterns = [
  { label: 'gradient text', pattern: 'bg-clip-text' },
  { label: 'decorative background gradient', pattern: 'bg-gradient-' },
  { label: 'decorative glass blur', pattern: 'backdrop-blur' },
];

for (const file of trackedUiFiles) {
  if (file.startsWith('apps/web/components/ui/')) {
    continue;
  }

  const content = read(file);
  const allowed = migrationExceptions.get(file) ?? [];

  for (const { label, pattern } of bannedPatterns) {
    if (content.includes(pattern) && !allowed.includes(pattern)) {
      fail(`${file}: ${label} (${pattern}) requires DESIGN.md exception`);
    }
  }

  for (const phrase of ['if published', 'future layer', 'metric to confirm', 'public-safe']) {
    if (content.toLowerCase().includes(phrase)) {
      fail(`${file}: visible UI must not contain process/meta-copy phrase "${phrase}"`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// TOYBOX drift ratchet (lab-034, AFD-8)
//
// Deterministic bans that keep the whole product tree on the toybox token
// grammar: no raw hex, no blur/raw shadows, no raw radii, no hand-rolled
// hover lifts, no off-grammar tile actions, no retired legacy names. Every
// hit reports RULE + FILE + LINE.
//
// Because the tree is mid-migration, current occurrences are PINNED in
// scripts/design-ratchet-baseline.json as per-file counts. Ratchet
// semantics: a file may only ever hold FEWER violations than its pinned
// count — any excess, or any violation in a file absent from the baseline,
// fails the gate. New drift can never be introduced; legacy debt can only
// shrink. Re-pin (shrink) the baseline after a conversion lane lands with:
//
//   node scripts/check-design-system.mjs --update-baseline
//
// The integrator drives that toward an empty baseline as the lanes finish.
// ═══════════════════════════════════════════════════════════════════
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const baselinePath = 'scripts/design-ratchet-baseline.json';
const baseline =
  existsSync(join(repoRoot, baselinePath)) && !UPDATE_BASELINE
    ? JSON.parse(read(baselinePath))
    : {};

const cssFiles = execSync("git ls-files 'apps/web/**/*.css'", {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
  // globals.css is the token HOME: it defines the hex values, the shadow
  // tokens, and the legacy back-compat utility classes. It is exempt.
  .filter((f) => f !== 'apps/web/app/globals.css');

const productTsx = trackedUiFiles;

// The one sanctioned hex literal: ink-on-candy text/foreground.
const ALLOWED_HEX = new Set(['#1c1547']);

// Collect {line, match} for every occurrence of `regex` in `content`,
// optionally filtered by (match, lineText) => keep.
function linesOf(content, regex, keep) {
  const out = [];
  content.split('\n').forEach((text, i) => {
    const matches = text.match(regex);
    if (!matches) return;
    for (const m of matches) {
      if (keep && !keep(m, text)) continue;
      out.push({ line: i + 1, match: m });
    }
  });
  return out;
}

const ratchetRules = [
  {
    id: 'rawHex',
    label: 'raw hex color literal — use --sploot-* tokens',
    files: [...productTsx, ...cssFiles],
    scan: (content) =>
      linesOf(
        content,
        /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
        (m) => !ALLOWED_HEX.has(m.toLowerCase())
      ),
  },
  {
    id: 'rawShadow',
    label: 'raw/blur shadow — use sploot-shadow* classes/vars or the physics utilities',
    files: productTsx,
    scan: (content) => [
      // tailwind blur scales (sploot-shadow-* is excluded by the lookbehind)
      ...linesOf(content, /(?<![\w-])shadow-(?:sm|md|lg|xl|2xl|inner)(?![\w-])/g),
      // tailwind drop-shadow blur (drop-shadow-none stays allowed)
      ...linesOf(content, /(?<![\w-])drop-shadow(?:-(?:sm|md|lg|xl|2xl))?(?![\w-])/g),
      // inline box-shadow literals that don't reference a sploot var
      ...linesOf(
        content,
        /box-shadow\s*:|boxShadow\s*:/g,
        (_m, text) => !text.includes('var(--sploot')
      ),
    ],
  },
  {
    id: 'rawRadius',
    label:
      'raw radius — use rounded-[var(--sploot-radius*)], rounded-full, or the token ui defaults',
    files: productTsx,
    scan: (content) => [
      ...linesOf(content, /(?<![\w-])rounded-none(?![\w-])/g),
      // arbitrary bracket radius with a numeric literal and no CSS var
      ...linesOf(
        content,
        /(?<![\w-])rounded-\[[^\]]*\]/g,
        (m) => /\d/.test(m) && !m.includes('var(')
      ),
    ],
  },
  {
    id: 'handRolledLift',
    label:
      'hand-rolled hover lift — compose .sploot-press / .sploot-press-sm / .sploot-ctl instead',
    files: productTsx,
    scan: (content) =>
      linesOf(
        content,
        /hover:-?translate(?:-[xy])?-/g,
        (_m, text) =>
          !text.includes('sploot-press') && !text.includes('sploot-ctl')
      ),
  },
  {
    id: 'bangerStampOutsideSploot',
    label:
      'BangerStamp used outside components/sploot/ — tile banger grammar is the TileActionRail heart',
    files: productTsx.filter((f) => !f.startsWith('apps/web/components/sploot/')),
    scan: (content) => linesOf(content, /\bBangerStamp\b/g),
  },
  {
    id: 'tileActionGrammar',
    label:
      'raw lucide Heart/Trash2/Share2 in a tile surface — route actions through TileActionRail / IconButton',
    files: productTsx.filter(
      (f) =>
        f.startsWith('apps/web/components/library/') ||
        f.startsWith('apps/web/app/app/')
    ),
    scan: (content) => {
      if (/\b(?:IconButton|TileActionRail)\b/.test(content)) return [];
      if (
        !/import\s+[^;]*\b(?:Heart|Trash2|Share2)\b[^;]*from\s+['"]lucide-react['"]/.test(
          content
        )
      ) {
        return [];
      }
      return linesOf(content, /\b(?:Heart|Trash2|Share2)\b/g);
    },
  },
  {
    id: 'legacyNames',
    label: 'retired legacy design token/literal (electric-lime/hot-pink/cyber-blue/brutalist hex/shadow)',
    files: [...productTsx, ...cssFiles],
    scan: (content) =>
      linesOf(content, /electric-lime|hot-pink|cyber-blue|#f3efe4|#0a0a0a|8px 8px 0/gi),
  },
];

const currentCounts = {};
const currentDetail = {};
for (const rule of ratchetRules) {
  currentCounts[rule.id] = {};
  currentDetail[rule.id] = {};
  for (const file of rule.files) {
    const hits = rule.scan(read(file));
    if (hits.length > 0) {
      currentCounts[rule.id][file] = hits.length;
      currentDetail[rule.id][file] = hits;
    }
  }
}

if (UPDATE_BASELINE) {
  const pinned = {};
  for (const rule of ratchetRules) {
    pinned[rule.id] = {};
    for (const file of Object.keys(currentCounts[rule.id]).sort()) {
      pinned[rule.id][file] = currentCounts[rule.id][file];
    }
  }
  writeFileSync(
    join(repoRoot, baselinePath),
    `${JSON.stringify(pinned, null, 2)}\n`
  );
  const total = ratchetRules.reduce(
    (sum, rule) =>
      sum +
      Object.values(currentCounts[rule.id]).reduce((a, b) => a + b, 0),
    0
  );
  console.log(
    `design ratchet baseline written to ${baselinePath} (${total} pinned occurrences)`
  );
  process.exit(0);
}

for (const rule of ratchetRules) {
  const pinned = baseline[rule.id] ?? {};
  for (const file of Object.keys(currentCounts[rule.id])) {
    const found = currentCounts[rule.id][file];
    const allowed = pinned[file] ?? 0;
    if (found > allowed) {
      // Report the occurrences beyond the pinned budget (the new drift).
      for (const { line, match } of currentDetail[rule.id][file].slice(allowed)) {
        fail(
          `${file}:${line}: [${rule.id}] ${rule.label} — "${match.trim()}" (baseline ${allowed}, found ${found})`
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error('design system lint failed:');
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log(`design system lint passed (${relative(repoRoot, join(repoRoot, 'DESIGN.md'))})`);
