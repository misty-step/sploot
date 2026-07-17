/* gallery-lab-001 · rendered-evidence sweep.
   Walks every option × state × viewport × theme against the running lab
   server, asserts console-clean and non-blank render, writes screenshots
   to an evidence dir OUTSIDE the repo (no binary churn).

   Usage:
     node qa-sweep.mjs [--base http://127.0.0.1:4173] [--out /tmp/lab001-evidence] \
                       [--opts BASE-0,AFD-1] [--states browse,detail] [--themes light,dark]
   Requires playwright-core resolvable (globally installed @playwright/cli works):
     PW=/Users/phaedrus/.npm-global/lib/node_modules/@playwright/cli/node_modules/playwright-core
*/
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null)).filter(Boolean)
);
const BASE = args.base || 'http://127.0.0.1:4173';
const OUT = args.out || '/tmp/lab001-evidence';
const PW_PATH =
  process.env.PW || '/Users/phaedrus/.npm-global/lib/node_modules/@playwright/cli/node_modules/playwright-core';
const require = createRequire(import.meta.url);
const { chromium } = require(PW_PATH);

const STATES = (args.states || 'browse,searching,results,zero,empty,selected,detail').split(',');
const THEMES = (args.themes || 'light,dark').split(',');
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
];

mkdirSync(OUT, { recursive: true });

const EXE =
  process.env.CHROMIUM ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });
const failures = [];
let shots = 0;

// discover option ids from the frame
const probe = await browser.newPage();
await probe.goto(`${BASE}/frame.html`, { waitUntil: 'networkidle' });
const allIds = await probe.evaluate(() => Object.keys(window.SPECS || {}));
await probe.close();
const IDS = args.opts ? args.opts.split(',') : allIds;
console.log(`options discovered: ${allIds.join(', ')}`);
console.log(`sweeping: ${IDS.join(', ')} × ${STATES.length} states × ${VIEWPORTS.length} vp × ${THEMES.length} themes`);

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme === 'dark' ? 'dark' : 'light',
      reducedMotion: 'no-preference',
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/frame.html`, { waitUntil: 'networkidle' });

    for (const id of IDS) {
      for (const st of STATES) {
        errors.length = 0;
        await page.evaluate(
          ([id, st, theme]) => {
            document.documentElement.setAttribute('data-theme', theme);
            location.hash = `${id}/${st}`;
          },
          [id, st, theme]
        );
        await page.waitForTimeout(120);
        const check = await page.evaluate(() => {
          const m = document.getElementById('mount');
          return {
            w: innerWidth,
            len: m ? m.innerHTML.length : 0,
            text: m ? m.innerText.slice(0, 60) : '',
            hscroll: document.documentElement.scrollWidth > innerWidth + 1,
          };
        });
        const name = `${id}_${st}_${vp.name}_${theme}`;
        if (check.w === 0) failures.push(`${name}: zero viewport`);
        if (check.len < 400) failures.push(`${name}: blank/thin render (${check.len} chars) "${check.text}"`);
        if (check.hscroll) failures.push(`${name}: horizontal overflow`);
        if (errors.length) failures.push(`${name}: console errors: ${errors.slice(0, 2).join(' | ')}`);
        await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
        shots += 1;
      }
    }
    await ctx.close();
  }
}
await browser.close();

console.log(`\n${shots} screenshots → ${OUT}`);
if (failures.length) {
  console.log(`FAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('sweep clean: no console errors, no blank renders, no horizontal overflow');
