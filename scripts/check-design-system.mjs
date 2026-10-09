#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

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
assertFile('apps/extension/entrypoints/popup/App.tsx');
assertFile('apps/extension/entrypoints/popup/style.css');
assertFile('apps/server/internal/web/static/app.css');

for (const [path, phrases] of Object.entries({
  'apps/extension/entrypoints/popup/App.tsx': ["import './style.css'", 'auth-panel', 'LastSaveStrip'],
  'apps/extension/entrypoints/popup/style.css': [
    '--sploot-blue',
    '--sploot-yellow',
    'prefers-color-scheme: dark',
    'prefers-reduced-motion: reduce',
  ],
})) {
  for (const phrase of phrases) {
    assertIncludes(path, phrase, 'implemented Sploot design-system adoption');
  }
}


// The extension retains its existing toybox palette and structure. DESIGN.md
// owns those values after predecessor retirement; the native Go stylesheet
// has its own grammar and is not asserted to have the extension's palette.
const extensionCssPath = 'apps/extension/entrypoints/popup/style.css';
const extensionUiFiles = ['apps/extension/entrypoints/popup/App.tsx', extensionCssPath];

function tokenValue(cssSlice, token) {
  const match = cssSlice.match(new RegExp(`${token}:\\s*([^;]+);`));
  return match ? match[1].trim().replace(/\s+/g, ' ').toLowerCase() : null;
}

{
  const design = read('DESIGN.md');
  const documentedColors = new Map(
    [...design.matchAll(/^\| [^|]+ \| `(--sploot-[a-z-]+)` \| `([^`]+)` \| `([^`]+)` \|/gm)]
      .map(([, token, light, dark]) => [token, [light.toLowerCase(), dark.toLowerCase()]])
  );
  // Foreground contrast and the two legacy aliases were checked against the
  // old globals but are not separate rows in DESIGN.md's palette table.
  const auxiliaryColors = new Map([
    ['--sploot-on-blue', ['#ffffff', '#10203a']],
    ['--sploot-on-red', ['#ffffff', '#3a0d14']],
    ['--sploot-coral', ['var(--sploot-magenta)', 'var(--sploot-magenta)']],
    ['--sploot-violet', ['var(--sploot-purple)', 'var(--sploot-purple)']],
  ]);
  const extCss = read(extensionCssPath);
  const extDarkStart = extCss.indexOf('@media (prefers-color-scheme: dark)');
  const extLight = extCss.slice(0, extDarkStart);
  const extDark = extCss.slice(extDarkStart);

  if (extDarkStart === -1) fail(`${extensionCssPath}: missing prefers-color-scheme dark theme block`);

  const themedTokens = [
    '--sploot-ink',
    '--sploot-paper',
    '--sploot-paper-warm',
    '--sploot-panel',
    '--sploot-blue',
    '--sploot-cyan',
    '--sploot-magenta',
    '--sploot-yellow',
    '--sploot-orange',
    '--sploot-lime',
    '--sploot-red',
    '--sploot-purple',
    '--sploot-void',
    '--sploot-coral',
    '--sploot-violet',
    '--sploot-focus',
    '--sploot-on-blue',
    '--sploot-on-red',
    '--sploot-shadow-color',
  ];
  const sharedPalette = new Set(['#1c1547']);
  for (const [theme, themeIndex, extSlice] of [
    ['light', 0, extLight],
    ['dark', 1, extDark],
  ]) {
    for (const token of themedTokens) {
      const expectedValue = (documentedColors.get(token) ?? auxiliaryColors.get(token))?.[themeIndex];
      const extValue = tokenValue(extSlice, token);
      if (expectedValue) sharedPalette.add(expectedValue);
      if (!expectedValue) {
        fail(`DESIGN.md: ${token} missing from the ${theme} palette`);
      } else if (extValue !== expectedValue) {
        fail(
          `${extensionCssPath}: ${token} (${theme}) diverges from the design contract — expected "${expectedValue}", found "${extValue ?? 'missing'}"`
        );
      }
    }
  }

  for (const [token, expectedValue] of Object.entries({
    '--sploot-border': '3px solid var(--sploot-ink)',
    '--sploot-radius': '18px',
    '--sploot-radius-pill': '999px',
    '--sploot-shadow': '0 5px 0 var(--sploot-shadow-color)',
    '--sploot-shadow-hover': '2px 7px 0 var(--sploot-shadow-color)',
    '--sploot-shadow-press': '0 1px 0 var(--sploot-shadow-color)',
    '--sploot-touch-target': '44px',
    '--sploot-ease-snap': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  })) {
    const actualValue = tokenValue(extCss, token);
    if (actualValue !== expectedValue) {
      fail(
        `${extensionCssPath}: structural token ${token} diverges from the design contract — expected "${expectedValue}", found "${actualValue ?? 'missing'}"`
      );
    }
  }

  // Raw hex in extension UI and feedback code must belong to its documented
  // palette. The badge API requires concrete values rather than CSS vars.
  for (const file of [...extensionUiFiles, 'apps/extension/entrypoints/background/badge.ts']) {
    const content = read(file);
    for (const hex of content.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g) ?? []) {
      if (!sharedPalette.has(hex.toLowerCase())) {
        fail(`${file}: hex ${hex} is not a documented --sploot-* token value — use the shared toybox palette`);
      }
    }
  }

  // Banned grammar (DESIGN.md anti-patterns) in extension UI files.
  for (const file of extensionUiFiles) {
    const content = read(file);
    for (const forbidden of ['backdrop-filter', 'backdrop-blur', 'linear-gradient(', '--radius-square', 'letter-spacing: -']) {
      if (content.includes(forbidden)) {
        fail(`${file}: extension popup must stay on the toybox token grammar, found ${forbidden}`);
      }
    }
  }

  // Production debug/QA affordances are checked on the compiled extension by
  // scripts/assert-update-nag-artifact.mjs during zip:prod. Requiring a source
  // flag spelling or a removed popup button cannot prove artifact safety.
}

const nativeCssPath = 'apps/server/internal/web/static/app.css';
const nativeUiFiles = [
  nativeCssPath,
  ...execFileSync('git', ['ls-files', '--', 'apps/server/internal/web/templates/*.html'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).split('\n').filter(Boolean),
];
for (const file of [...nativeUiFiles, ...extensionUiFiles]) {
  const content = read(file);
  for (const forbidden of ['bg-clip-text', 'bg-gradient-', 'backdrop-filter', 'backdrop-blur', 'linear-gradient(', '--radius-square']) {
    if (content.includes(forbidden)) {
      fail(`${file}: decorative gradient/glass/square grammar is forbidden by DESIGN.md (${forbidden})`);
    }
  }
  for (const pattern of [/electric-lime|hot-pink|cyber-blue|#f3efe4|#0a0a0a|8px 8px 0/gi, /MEME SEARCH\. INSTANT\.|AI POWERED|START FOR FREE/g]) {
    for (const match of content.matchAll(pattern)) {
      fail(`${file}: retired design token or generic hero phrase remains (${match[0]})`);
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
