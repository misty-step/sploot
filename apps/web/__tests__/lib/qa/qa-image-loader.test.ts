import { describe, expect, it } from 'vitest';
import qaImageLoader, { QA_SEED_BLOB_HOST, resolveQaSeedSrc } from '@/lib/qa/qa-image-loader';

describe('qa image loader', () => {
  it('maps the reserved QA seed host to the local public path', () => {
    expect(resolveQaSeedSrc(`${QA_SEED_BLOB_HOST}/qa-blob-seed/qa-meme-001.png`)).toBe(
      '/qa-blob-seed/qa-meme-001.png'
    );
  });

  it('leaves real blob URLs untouched', () => {
    const real = 'https://abc123.public.blob.vercel-storage.com/uploads/cat.png';
    expect(resolveQaSeedSrc(real)).toBe(real);
  });

  it('does not match lookalike hosts outside the reserved one', () => {
    const lookalike = 'https://sploot-qa-seed.public.blob.vercel-storage.com.evil.example/x.png';
    expect(resolveQaSeedSrc(lookalike)).toBe(lookalike);
  });

  it('serves QA seeds from the static path and real URLs directly (custom loaders disable /_next/image)', () => {
    expect(
      qaImageLoader({ src: `${QA_SEED_BLOB_HOST}/qa-blob-seed/qa-meme-002.png`, width: 640, quality: 80 })
    ).toBe('/qa-blob-seed/qa-meme-002.png');
    expect(
      qaImageLoader({ src: 'https://abc123.public.blob.vercel-storage.com/uploads/cat.png', width: 640 })
    ).toBe('https://abc123.public.blob.vercel-storage.com/uploads/cat.png');
  });
});
