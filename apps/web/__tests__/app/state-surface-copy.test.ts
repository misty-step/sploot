import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const PRODUCT_COPY_FILES = [
  'app/app/settings/page.tsx',
  'app/help/page.tsx',
  'app/error.tsx',
  'app/global-error.tsx',
  'app/app/error.tsx',
  'app/m/[id]/page.tsx',
].map((path) => join(webRoot, path));

describe('terminal-state and settings copy truth', () => {
  it('does not promise unshipped roadmap or social features in visible UI copy', () => {
    const copy = PRODUCT_COPY_FILES
      .map((url) => readFileSync(url, 'utf8'))
      .join('\n');

    expect(copy).not.toMatch(/Coming soon/i);
    expect(copy).not.toMatch(/roadmap/i);
    expect(copy).not.toMatch(/squad-sharing/i);
    expect(copy).not.toMatch(/notification spam/i);
    expect(copy).not.toMatch(/squad already got pinged/i);
    expect(copy).not.toMatch(/pinged the crew/i);
  });
});
