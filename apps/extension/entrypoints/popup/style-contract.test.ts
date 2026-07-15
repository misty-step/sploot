import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

describe('popup narrow-viewport contract', () => {
  it('has no hard width floor and sizes the frame to the viewport', () => {
    expect(css).not.toMatch(/min-width:\s*320px/);
    expect(css).toMatch(/\.popup-frame\s*\{[^}]*width:\s*min\(360px,\s*100vw\)/s);
    expect(css).toMatch(/\.popup-frame\s*\{[^}]*min-width:\s*0/s);
  });
});
