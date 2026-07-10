/* one-off: authed shots of the spine-converged views, both themes.
   usage: SPLOOT_QA_AUTH_SECRET=... pnpm exec tsx scripts/qa-spine-shots.ts <base> <outdir> */
import { chromium } from '@playwright/test';
import { createQaLocalAuthToken } from '../lib/auth/qa-local';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3474';
const out = process.argv[3] ?? '/tmp/spine-shots';
fs.mkdirSync(out, { recursive: true });

async function main() {
  const token = await createQaLocalAuthToken({
    userId: 'qa-design-user',
    secret: process.env.SPLOOT_QA_AUTH_SECRET!,
  });

  const browser = await chromium.launch();
  const problems: string[] = [];

  for (const theme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([
      { name: 'sploot_qa_auth', value: token, url: base },
      { name: 'sploot-theme', value: theme, url: base },
    ]);

    // find a real asset id via the authed API
    const probe = await ctx.newPage();
    await probe.goto(`${base}/app`, { waitUntil: 'networkidle' });
    const assetId = await probe.evaluate(async () => {
      const r = await fetch('/api/assets?limit=1');
      if (!r.ok) return null;
      const j = await r.json();
      return j?.assets?.[0]?.id ?? j?.data?.[0]?.id ?? null;
    });
    await probe.close();
    if (!assetId) problems.push(`${theme}: could not resolve an asset id from /api/assets`);

    const routes: Array<[string, string]> = [
      ['/app', 'feed'],
      ...(assetId ? ([[`/app/meme/${assetId}`, 'detail']] as Array<[string, string]>) : []),
      ['/app/upload', 'upload'],
      ['/app/settings', 'settings'],
    ];
    for (const [route, name] of routes) {
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
      await page.evaluate((t) => {
        document.documentElement.classList.toggle('dark', t === 'dark');
      }, theme);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}/${name}-${theme}.png`, fullPage: false });
      const hs = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (hs > 6) problems.push(`${name}-${theme}: hscroll +${hs}px`);
      // same exemption as qa-theme-walk: seeded broken-blob telemetry 400s
      const realErrors = errors.filter((e) => !/favicon|manifest|apple-touch|400 \(Bad Request\)/i.test(e));
      if (realErrors.length) problems.push(`${name}-${theme}: ${realErrors.slice(0, 2).join(' | ')}`);
      await page.close();
    }
    await ctx.close();
  }

  await browser.close();
  if (problems.length) {
    console.error('PROBLEMS:\n' + problems.join('\n'));
    process.exit(1);
  }
  console.log(`clean: shots in ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
