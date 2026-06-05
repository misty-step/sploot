const { chromium } = require('playwright');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const dir = __dirname;
const framesDir = path.join(dir, 'frames');
const htmlUrl = pathToFileURL(path.join(dir, 'demo.html')).href;

async function main() {
  await mkdir(framesDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });

  async function setStep(step) {
    await page.evaluate((nextStep) => window.demoSetStep(nextStep), step);
    await page.waitForTimeout(300);
  }

  await page.goto(htmlUrl, { waitUntil: 'networkidle' });

  const stills = [
    ['feed', 'mobile-feed-fullwidth-default.png'],
    ['search', 'mobile-search-expanded.png'],
    ['filter', 'mobile-filter-menu.png'],
    ['sort', 'mobile-sort-menu-no-shuffle.png'],
    ['shuffle', 'mobile-shuffle-standalone.png'],
    ['delete', 'mobile-action-bar-direct-delete.png'],
  ];

  for (const [step, filename] of stills) {
    await setStep(step);
    await page.screenshot({ path: path.join(dir, filename), fullPage: false });
  }

  const sequence = [
    'feed',
    'feed',
    'search',
    'search',
    'filter',
    'filter',
    'sort',
    'sort',
    'shuffle',
    'shuffle',
    'delete',
    'delete',
    'feed',
  ];

  for (let i = 0; i < sequence.length; i += 1) {
    await setStep(sequence[i]);
    await page.screenshot({
      path: path.join(framesDir, `frame${String(i).padStart(3, '0')}.png`),
      fullPage: false,
    });
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
