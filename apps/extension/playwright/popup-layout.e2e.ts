import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const popupCssUrl = new URL('../entrypoints/popup/style.css', import.meta.url);
const longIdentity = `${'very-long-unbroken-identity-'.repeat(8)}@example.test`;

for (const width of [280, 240]) {
  test(`signed-in identity stays inside a ${width}px popup`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    const css = await readFile(popupCssUrl, 'utf8');
    await page.setContent(`
      <style>${css}</style>
      <div class="popup-frame">
        <div class="popup-container">
          <main>
            <div class="signed-in-panel">
              <p>Signed in as <strong data-testid="identity">${longIdentity}</strong></p>
              <div class="actions"><button>View My Library</button></div>
            </div>
          </main>
        </div>
      </div>
    `);

    const dimensions = await page.evaluate(() => {
      const identity = document.querySelector<HTMLElement>('[data-testid="identity"]');
      const panel = document.querySelector<HTMLElement>('.signed-in-panel');
      if (!identity || !panel) throw new Error('popup fixture did not render');
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        identityRight: identity.getBoundingClientRect().right,
        panelRight: panel.getBoundingClientRect().right,
      };
    });

    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.identityRight).toBeLessThanOrEqual(dimensions.panelRight + 0.5);
  });
}
