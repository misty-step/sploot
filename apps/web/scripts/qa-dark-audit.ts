/* Dark-mode readability audit. Walks core views in a chosen theme at 1440x900,
   screenshots each, and runs an in-page contrast audit over visible text nodes:
   computes getComputedStyle color vs the first non-transparent ancestor
   background, flags contrast < 4.5 (normal text) / < 3.0 (large text >=24px or
   >=18.66px bold). Expect false positives (text over images/gradients) — verify
   visually before fixing.
   Usage: SPLOOT_QA_AUTH_SECRET=... tsx scripts/qa-dark-audit.ts <baseUrl> <outDir> <theme> <memeId> */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createQaLocalAuthToken } from '../lib/auth/qa-local';

const base = process.argv[2] ?? 'http://localhost:3413';
const out = process.argv[3] ?? '/tmp/fixdark/before';
const theme = (process.argv[4] ?? 'dark') as 'dark' | 'light';
const memeId = process.argv[5] ?? '';
mkdirSync(out, { recursive: true });

const contrastProbe = `(() => {
  function parseColor(str) {
    const m = str.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
    const [r, g, b] = parts;
    const a = parts.length > 3 ? parts[3] : 1;
    return { r, g, b, a };
  }
  function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); }
  function ratio(fg, bg) {
    const L1 = lum(fg), L2 = lum(bg);
    const a = Math.max(L1, L2), b = Math.min(L1, L2);
    return (a + 0.05) / (b + 0.05);
  }
  function over(fg, bg) {
    // composite fg (with alpha) over opaque bg
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  }
  function effectiveBg(el) {
    let node = el;
    let acc = null; // opaque bg once found
    const layers = [];
    while (node && node instanceof Element) {
      const cs = getComputedStyle(node);
      const bg = parseColor(cs.backgroundColor);
      const hasImg = cs.backgroundImage && cs.backgroundImage !== 'none';
      if (hasImg) layers.push({ img: true, tag: node.tagName });
      if (bg && bg.a > 0) {
        layers.push(bg);
        if (bg.a >= 0.999) { acc = bg; break; }
      }
      node = node.parentElement;
    }
    if (!acc) acc = { r: 255, g: 255, b: 255, a: 1 };
    // composite semi-transparent layers top-down over the opaque base
    let base = acc;
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (l.img) return { bg: base, overImage: true };
      if (l.a < 0.999) base = over(l, base);
      else base = l;
    }
    return { bg: base, overImage: false };
  }
  const results = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const txt = n.nodeValue && n.nodeValue.trim();
    if (!txt || txt.length < 2) continue;
    const el = n.parentElement;
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.1) continue;
    const fgRaw = parseColor(cs.color);
    if (!fgRaw) continue;
    const { bg, overImage } = effectiveBg(el);
    const fg = fgRaw.a < 0.999 ? over(fgRaw, bg) : fgRaw;
    const fontSize = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight) >= 700;
    const large = fontSize >= 24 || (bold && fontSize >= 18.66);
    const cr = ratio(fg, bg);
    const threshold = large ? 3.0 : 4.5;
    if (cr < threshold) {
      const key = el.tagName + '|' + cs.color + '|' + Math.round(cr * 10) + '|' + txt.slice(0, 20);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        text: txt.slice(0, 48),
        tag: el.tagName,
        cls: (el.getAttribute('class') || '').slice(0, 90),
        color: cs.color,
        bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')',
        fontSize, bold, large,
        ratio: Math.round(cr * 100) / 100,
        threshold,
        overImage,
      });
    }
  }
  return results.sort((a, b) => a.ratio - b.ratio);
})()`;

async function main() {
  const token = await createQaLocalAuthToken({
    userId: 'qa-design-user',
    secret: process.env.SPLOOT_QA_AUTH_SECRET!,
  });

  const routes: Array<[string, string]> = [
    ['/', 'landing'],
    ['/sign-in', 'sign-in'],
    ['/styleguide', 'styleguide'],
    ['/app', 'app-feed'],
    ['/app/upload', 'app-upload'],
    ['/app/settings', 'app-settings'],
    ['/app/tags', 'app-tags'],
  ];
  if (memeId) routes.push([`/app/meme/${memeId}`, 'app-meme']);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: 'sploot_qa_auth', value: token, url: base }]);
  await ctx.addInitScript((t) => {
    window.localStorage.setItem('theme', t);
  }, theme);

  const report: Record<string, unknown> = {};
  for (const [path, slug] of routes) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    try {
      await page.goto(base + path, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1200);
      const state = await page.evaluate(() => ({
        dark: document.documentElement.classList.contains('dark'),
        path: location.pathname,
      }));
      await page.screenshot({ path: `${out}/${slug}.png`, fullPage: true });
      const findings = await page.evaluate(contrastProbe);
      report[slug] = { path, resolvedPath: state.path, dark: state.dark, count: (findings as unknown[]).length, findings };
      console.log(`${slug} (${path}) dark=${state.dark} → ${(findings as unknown[]).length} flagged`);
    } catch (e) {
      report[slug] = { path, error: String(e).slice(0, 160) };
      console.log(`${slug} (${path}) NAV FAIL ${String(e).slice(0, 120)}`);
    }
    await page.close();
  }
  await ctx.close();
  await browser.close();
  writeFileSync(`${out}/contrast-report.json`, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${out}/contrast-report.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
