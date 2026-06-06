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
  '--sploot-grid-line',
  '--sploot-sticker-shadow',
  '--sploot-active-border-width',
  '--sploot-touch-target',
  '--color-sploot-ink',
  '--color-sploot-cyan',
]) {
  assertIncludes(cssPath, token, 'Sploot semantic token');
}

for (const phrase of ['--sploot-ink', '--sploot-cyan', '--sploot-touch-target']) {
  assertIncludes('docs/design/tokens.md', phrase, 'documented design token');
}

for (const phrase of ['Command dock', 'Pile / cluster', 'Sticker tab', 'Banger stamp']) {
  assertIncludes('docs/design/component-library.md', phrase, 'documented component grammar');
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
  ['apps/web/components/landing/landing-footer.tsx', ['bg-gradient-']],
  ['apps/web/components/library/image-skeleton.tsx', ['bg-gradient-']],
  ['apps/web/components/ui/delete-confirmation-modal.tsx', ['bg-gradient-']],
  ['apps/web/app/app/page.tsx', ['backdrop-blur']],
  ['apps/web/components/chrome/navbar.tsx', ['backdrop-blur']],
  ['apps/web/components/library/image-tile.tsx', ['backdrop-blur']],
]);

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
