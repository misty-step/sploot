import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { BulkImportLimitError, extractZipImages, extractImageUrls, isBundleFile, MAX_ZIP_ENTRIES } from '@/lib/upload/bulk-import';

function makeZip(entries: Record<string, Uint8Array>): File {
  const zipped = zipSync(entries);
  return new File([new Uint8Array(zipped)], 'memes.zip', { type: 'application/zip' });
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('isBundleFile', () => {
  it.each([
    ['memes.zip', 'application/zip'],
    ['bookmarks.json', 'application/json'],
    ['bookmarks.csv', 'text/csv'],
    ['export.txt', 'text/plain'],
  ])('recognizes %s as a bundle', (name, type) => {
    expect(isBundleFile(new File([new Uint8Array([1])], name, { type }))).toBe(true);
  });

  it('does not treat plain images as bundles', () => {
    expect(isBundleFile(new File([PNG], 'a.png', { type: 'image/png' }))).toBe(false);
  });
});

describe('extractZipImages', () => {
  it('extracts image entries as Files with inferred MIME types', async () => {
    const zip = makeZip({
      'folder/meme-one.png': PNG,
      'meme-two.jpg': new Uint8Array([0xff, 0xd8, 0xff]),
      'notes.txt': new TextEncoder().encode('not an image'),
      '__MACOSX/._meme-one.png': PNG,
    });

    const files = await extractZipImages(zip);

    expect(files.map((f) => f.name).sort()).toEqual(['meme-one.png', 'meme-two.jpg']);
    expect(files.find((f) => f.name === 'meme-one.png')?.type).toBe('image/png');
    expect(files.find((f) => f.name === 'meme-two.jpg')?.type).toBe('image/jpeg');
  });

  it('returns an empty list for a zip with no images', async () => {
    const zip = makeZip({ 'readme.md': new TextEncoder().encode('hi') });
    expect(await extractZipImages(zip)).toEqual([]);
  });

  it('rejects ZIP entry-count expansion before inflate', async () => {
    const entries = Object.fromEntries(
      Array.from({ length: MAX_ZIP_ENTRIES + 1 }, (_, index) => [`${index}.png`, PNG]),
    );
    await expect(extractZipImages(makeZip(entries))).rejects.toBeInstanceOf(BulkImportLimitError);
  });
});

describe('extractImageUrls', () => {
  it('finds direct image URLs and twitter media URLs in arbitrary text', () => {
    const text = `
      {"tweets":[{"media":"https://pbs.twimg.com/media/Fabc123?format=jpg&name=small"},
      {"url":"https://i.imgur.com/xyz.png"},{"link":"https://example.com/page.html"}]}
      https://cdn.site.com/funny.gif,more,text
    `;

    const urls = extractImageUrls(text);

    expect(urls).toContain('https://i.imgur.com/xyz.png');
    expect(urls).toContain('https://cdn.site.com/funny.gif');
    expect(urls.some((u) => u.startsWith('https://pbs.twimg.com/media/Fabc123'))).toBe(true);
    expect(urls.some((u) => u.includes('example.com/page.html'))).toBe(false);
  });

  it('upgrades twitter media URLs to full resolution', () => {
    const urls = extractImageUrls(
      'https://pbs.twimg.com/media/Fabc123?format=jpg&name=small'
    );
    expect(urls).toEqual(['https://pbs.twimg.com/media/Fabc123?format=jpg&name=orig']);
  });

  it('dedupes repeated URLs', () => {
    const urls = extractImageUrls(
      'https://a.com/x.png https://a.com/x.png https://a.com/x.png'
    );
    expect(urls).toEqual(['https://a.com/x.png']);
  });

  it('returns empty for text without image URLs', () => {
    expect(extractImageUrls('no urls here, just vibes')).toEqual([]);
  });
});
