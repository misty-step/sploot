#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
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
  // neo-brutalist DNA: surfaces are SQUARE. No rounded corners except a full
  // circle (avatars/dots) or an explicit reset.
  const rounded = (content.match(/rounded-[a-z0-9[\]]+/g) || []).filter(
    (r) => r !== 'rounded-none' && r !== 'rounded-full'
  );
  if (rounded.length > 0) {
    fail(`${file}: neo-brutalist surfaces are square — remove ${rounded[0]}`);
  }

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
  ['apps/web/app/sign-in/[[...sign-in]]/page.tsx', ['bg-gradient-', 'backdrop-blur']],
  ['apps/web/app/sign-up/[[...sign-up]]/page.tsx', ['bg-gradient-', 'backdrop-blur']],
  ['apps/web/components/library/image-skeleton.tsx', ['bg-gradient-']],
  ['apps/web/components/ui/delete-confirmation-modal.tsx', ['bg-gradient-']],
  ['apps/web/app/app/page.tsx', ['backdrop-blur']],
  ['apps/web/components/chrome/navbar.tsx', ['backdrop-blur']],
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

if (failures.length > 0) {
  console.error('design system lint failed:');
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log(`design system lint passed (${relative(repoRoot, join(repoRoot, 'DESIGN.md'))})`);
