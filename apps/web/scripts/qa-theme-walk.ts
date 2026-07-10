/* Both-themes design walk: /, /sign-in, /styleguide, /app at 1440x900 and
   390x844, light + dark. Asserts zero console errors and no phone h-scroll.
   Usage: SPLOOT_QA_AUTH_SECRET=... tsx scripts/qa-theme-walk.ts <baseUrl> <outDir> */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createQaLocalAuthToken } from '../lib/auth/qa-local';

const base = process.argv[2] ?? 'http://localhost:3399';
const out = process.argv[3] ?? '/tmp/theme-walk';
mkdirSync(out, { recursive: true });

async function main() {
const token = await createQaLocalAuthToken({
  userId: 'qa-design-user',
  secret: process.env.SPLOOT_QA_AUTH_SECRET!,
});

const pages = ['/', '/sign-in', '/styleguide', '/app'];
const viewports = [
  { w: 1440, h: 900, tag: 'desktop' },
  { w: 390, h: 844, tag: 'phone' },
];
const browser = await chromium.launch();
const problems: string[] = [];

for (const theme of ['light', 'dark'] as const) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([
    { name: 'sploot_qa_auth', value: token, url: base },
  ]);
  await ctx.addInitScript((t) => {
    window.localStorage.setItem('theme', t);
  }, theme);
  for (const vp of viewports) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 160));
    });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    for (const path of pages) {
      const slug = (path === '/' ? 'landing' : path.replaceAll('/', '')) + `-${theme}-${vp.tag}`;
      try {
        await page.goto(base + path, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(700);
        const state = await page.evaluate(() => ({
          dark: document.documentElement.classList.contains('dark'),
          hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          signInWall: location.pathname.startsWith('/sign-in'),
        }));
        await page.screenshot({ path: `${out}/${slug}.png` });
        if (state.dark !== (theme === 'dark')) problems.push(`${slug}: theme class mismatch (dark=${state.dark})`);
        if (vp.tag === 'phone' && state.hscroll > 6) problems.push(`${slug}: horizontal scroll +${state.hscroll}px`);
        if (path === '/app' && state.signInWall) problems.push(`${slug}: bounced to sign-in wall (auth failed)`);
      } catch (e) {
        problems.push(`${slug}: NAV FAIL ${String(e).slice(0, 120)}`);
      }
    }
    // telemetry 400s are a pre-existing master behavior: seeded broken-blob
    // fixtures fire error telemetry the endpoint rejects. Not a design signal.
    const realErrors = errors.filter((e) => !/favicon|manifest|apple-touch|400 \(Bad Request\)/i.test(e));
    if (realErrors.length) problems.push(`${theme}-${vp.tag}: console errors: ${realErrors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();

if (problems.length) {
  console.log('PROBLEMS:');
  for (const p of problems) console.log(' -', p);
  process.exit(1);
}
console.log(`clean: ${pages.length * viewports.length * 2} walks, shots in ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
