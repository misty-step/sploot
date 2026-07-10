/* lab 034 render sweep — loads every option page headlessly, asserts it
   rendered, captures console errors, light/dark + phone evidence shots.
   Run from repo root:
     node explorations/lab-034-hypermax/sweep.mjs [baseURL]
   (serve first: python3 explorations/lab-034-hypermax/serve.py 4034) */
import { chromium } from '../../apps/web/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:4034';
const FRAME = `${BASE}/explorations/lab-034-hypermax/frame.html?v=3`;
const SHOTS = 'explorations/lab-034-hypermax/evidence';
fs.mkdirSync(SHOTS, { recursive: true });

const IDS = [
  // round 3 live set (killed builders stay in lane files, unswept)
  'AFD-3', 'AFD-8', 'AFD-9', 'AFD-10', 'AFD-11', 'AFD-1', 'BASE-1',
];

const browser = await chromium.launch();
const results = [];
for (const id of IDS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  try {
    await page.goto(`${FRAME}#${id}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(400);
    const state = await page.evaluate(() => {
      const m = document.getElementById('mount');
      return {
        vw: innerWidth,
        children: m ? m.children.length : 0,
        failText: m && /builder error for|no builder for/.test(m.textContent || '') ? m.textContent.slice(0, 120) : null,
        hasToggle: !!document.querySelector('.lab-theme-toggle'),
      };
    });
    const ok = state.vw > 0 && state.children > 0 && !state.failText;
    await page.screenshot({ path: `${SHOTS}/${id}-light.png`, fullPage: false });
    if (state.hasToggle) {
      await page.click('.lab-theme-toggle');
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${SHOTS}/${id}-dark.png`, fullPage: false });
      await page.click('.lab-theme-toggle');
    }
    // phone check: no horizontal scroll at 390
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({ path: `${SHOTS}/${id}-390.png`, fullPage: false });
    results.push({ id, ok, errors: errors.slice(0, 4), hscrollOverflow: hscroll > 6 ? hscroll : 0, toggle: state.hasToggle, failText: state.failText });
  } catch (e) {
    results.push({ id, ok: false, errors: [String(e).slice(0, 160)], hscrollOverflow: 0, toggle: false, failText: null });
  }
  await page.close();
}
await browser.close();

let bad = 0;
for (const r of results) {
  const flags = [
    r.ok ? 'render:ok' : 'RENDER:FAIL',
    r.errors.length ? `console:${r.errors.length}` : 'console:0',
    r.hscrollOverflow ? `HSCROLL:+${r.hscrollOverflow}px` : 'hscroll:0',
    r.toggle ? 'toggle:ok' : 'TOGGLE:MISSING',
  ].join(' · ');
  if (!r.ok || r.errors.length || r.hscrollOverflow || !r.toggle) bad++;
  console.log(`${r.id.padEnd(9)} ${flags}${r.failText ? `\n    ${r.failText}` : ''}${r.errors.length ? `\n    ${r.errors.join('\n    ')}` : ''}`);
}
console.log(`\n${results.length - bad}/${results.length} clean`);
process.exit(bad ? 1 : 0);
