import { describe, expect, it } from 'vitest';
import { markdownToHtml } from '@/lib/changelog-markdown';

describe('markdownToHtml', () => {
  it('renders semantic-release star bullets as list items', () => {
    const html = markdownToHtml('* **web:** bulk import zips\n* second item');
    expect(html).toContain('<ul');
    expect(html).toContain('<li><strong>web:</strong> bulk import zips</li>');
    expect(html).toContain('<li>second item</li>');
  });

  it('converts inline markdown links to anchors', () => {
    const html = markdownToHtml('see [#220](https://github.com/misty-step/sploot/issues/220)');
    expect(html).toContain('<a href="https://github.com/misty-step/sploot/issues/220"');
    expect(html).toContain('>#220</a>');
    expect(html).not.toContain('[#220]');
  });

  it('drops top-level release headings (the card already shows tag and date)', () => {
    const html = markdownToHtml(
      '# [1.12.0](https://github.com/x/compare/v1.11.1...v1.12.0) (2026-06-11)\n\n### Features\n\n* thing'
    );
    expect(html).not.toContain('1.11.1...v1.12.0');
    expect(html).toContain('Features');
    expect(html).toContain('<li>thing</li>');
  });

  it('drops patch-release version headings too (semantic-release uses ## for patches)', () => {
    const html = markdownToHtml(
      '## [1.11.1](https://github.com/x/compare/v1.11.0...v1.11.1) (2026-06-11)\n\n### Bug Fixes\n\n* fix'
    );
    expect(html).not.toContain('1.11.0...v1.11.1');
    expect(html).toContain('Bug Fixes');
  });

  it('renders inline code and dash bullets', () => {
    const html = markdownToHtml('- run `pnpm test` locally');
    expect(html).toContain('<li>run <code>pnpm test</code> locally</li>');
  });

  it('escapes raw html in the source text', () => {
    const html = markdownToHtml('* <script>alert(1)</script> oops');
    expect(html).not.toContain('<script>');
  });
});
