import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production PWA service worker lifecycle', () => {
  it('takes control on install and precaches the production shell', () => {
    const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

    expect(source).toMatch(/skipWaiting\s*\(\)/);
    expect(source).toMatch(/clientsClaim\s*\(\)/);
    expect(source).toMatch(/precacheAndRoute\s*\(/);
    expect(source).toContain('"/manifest.json"');
  });

});
