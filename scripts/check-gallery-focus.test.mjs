import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync('apps/web/app/app/page.tsx', 'utf8');
const gallerySource = readFileSync('apps/web/e2e/gallery.spec.ts', 'utf8');

function validateGalleryFocusContract(page, gallery) {
  const metadata = page.indexOf('<dl aria-label="meme metadata"');
  const close = page.indexOf('label="Close preview"');
  assert.ok(metadata >= 0, 'preview must retain its metadata region');
  assert.ok(close > metadata, 'preview close control must follow native media in DOM order');
  assert.match(page.slice(close, close + 420), /absolute right-4 top-3/);
  assert.match(page, /className="relative max-h-\[calc\(100vh-2rem\)\]/);

  assert.match(
    gallery,
    /await firstDialogButton\.focus\(\);\s*await page\.keyboard\.press\('Shift\+Tab'\);\s*await expect\(lastDialogButton\)\.toBeFocused\(\);\s*await page\.keyboard\.press\('Tab'\);\s*await expect\(firstDialogButton\)\.toBeFocused\(\);/s,
  );
}

test('gallery preview keeps a real reverse-tab focus boundary', () => {
  validateGalleryFocusContract(pageSource, gallerySource);
});

test('gallery focus oracle rejects weakened focus assertions or visual-only reordering', () => {
  assert.throws(() => validateGalleryFocusContract(
    pageSource.replace('absolute right-4 top-3', 'right-4 top-3'),
    gallerySource,
  ));
  assert.throws(() => validateGalleryFocusContract(
    pageSource,
    gallerySource.replace('await expect(lastDialogButton).toBeFocused()', 'await expect(lastDialogButton).toBeVisible()'),
  ));
});
