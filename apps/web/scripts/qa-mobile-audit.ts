/* mobile audit: walk every product route at phone width, both themes.
   Captures full-page shots + automated checks: horizontal scroll, touch
   targets under 44px, offscreen interactive elements.
   usage: SPLOOT_QA_AUTH_SECRET=... pnpm exec tsx scripts/qa-mobile-audit.ts <base> <outdir> */
import { chromium, devices } from '@playwright/test';
import { createQaLocalAuthToken } from '../lib/auth/qa-local';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3474';
const out = process.argv[3] ?? '/tmp/mobile-audit';
fs.mkdirSync(out, { recursive: true });

async function main() {
  const token = await createQaLocalAuthToken({
    userId: 'qa-design-user',
    secret: process.env.SPLOOT_QA_AUTH_SECRET!,
  });

  const browser = await chromium.launch();
  const report: string[] = [];

  for (const theme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({
      ...devices['iPhone 13'],
      viewport: { width: 390, height: 844 },
    });
    await ctx.addCookies([
      { name: 'sploot_qa_auth', value: token, url: base },
      { name: 'sploot-theme', value: theme, url: base },
    ]);

    // resolve an asset id
    const probe = await ctx.newPage();
    await probe.goto(`${base}/app`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await probe.waitForTimeout(2000);
    const assetId = await probe.evaluate(async () => {
      const r = await fetch('/api/assets?limit=1');
      if (!r.ok) return null;
      const j = await r.json();
      return j?.assets?.[0]?.id ?? j?.data?.[0]?.id ?? null;
    });
    await probe.close();

    const routes: Array<[string, string]> = [
      ['/', 'landing'],
      ['/sign-in', 'signin'],
      ['/app', 'feed'],
      ...(assetId ? ([[`/app/meme/${assetId}`, 'detail']] as Array<[string, string]>) : []),
      ['/app?upload=1', 'upload'],
      ['/app/settings', 'settings'],
      ['/app/tags', 'tags'],
      ['/app/search', 'search'],
    ];

    for (const [route, name] of routes) {
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
      try {
        await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        await page.evaluate((t) => {
          document.documentElement.classList.toggle('dark', t === 'dark');
        }, theme);
        await page.waitForTimeout(500);

        const checks = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const hscroll = document.documentElement.scrollWidth - vw;
          const small: string[] = [];
          const offscreen: string[] = [];
          const sels = document.querySelectorAll<HTMLElement>(
            'button, a[href], input, select, textarea, [role="button"], [role="tab"]'
          );
          for (const el of sels) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue; // hidden
            const label =
              (el.getAttribute('aria-label') || el.textContent || el.tagName)
                .trim()
                .slice(0, 30) || el.tagName;
            if ((r.width < 40 || r.height < 40) && r.width > 4 && r.height > 4) {
              small.push(`${label} (${Math.round(r.width)}x${Math.round(r.height)})`);
            }
            if (r.right > vw + 4 || r.left < -4) {
              offscreen.push(`${label} [${Math.round(r.left)},${Math.round(r.right)}]`);
            }
          }
          return { hscroll, small: small.slice(0, 12), offscreen: offscreen.slice(0, 8) };
        });

        await page.screenshot({ path: `${out}/${name}-${theme}.png`, fullPage: true });
        const lines = [`## ${name} (${theme})${route === '/' ? '' : ` ${route}`}`];
        if (checks.hscroll > 6) lines.push(`- HSCROLL: +${checks.hscroll}px`);
        if (checks.offscreen.length) lines.push(`- OFFSCREEN: ${checks.offscreen.join(' · ')}`);
        if (checks.small.length) lines.push(`- SMALL TARGETS (<40px): ${checks.small.join(' · ')}`);
        if (errors.length) lines.push(`- PAGEERRORS: ${errors.join(' | ')}`);
        if (lines.length === 1) lines.push('- clean');
        report.push(lines.join('\n'));
      } catch (e) {
        report.push(`## ${name} (${theme})\n- FAILED: ${String(e).slice(0, 140)}`);
      }
      await page.close();
    }
    await ctx.close();
  }

  await browser.close();
  const text = report.join('\n\n');
  fs.writeFileSync(`${out}/report.md`, text);
  console.log(text);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
