import { describe, expect, it } from 'vitest';
import {
  UPLOAD,
  isCompressibleImageType,
  shouldPrepareImage,
} from '@sploot/common';

describe('image upload preparation policy', () => {
  it('prepares static images above the safe transport target', () => {
    const file = new File(
      [new Uint8Array(UPLOAD.compressionTargetSize + 1)],
      'big-meme.png',
      { type: 'image/png' }
    );

    expect(shouldPrepareImage(file)).toBe(true);
  });

  it('does not prepare animated gif uploads because that would flatten animation', () => {
    const file = new File(
      [new Uint8Array(UPLOAD.compressionTargetSize + 1)],
      'reaction.gif',
      { type: 'image/gif' }
    );

    expect(shouldPrepareImage(file)).toBe(false);
  });

  it('does not prepare video uploads because browser canvas cannot preserve playback', () => {
    const file = new File(
      [new Uint8Array(UPLOAD.compressionTargetSize + 1)],
      'reaction.mp4',
      { type: 'video/mp4' }
    );

    expect(shouldPrepareImage(file)).toBe(false);
  });

  it('keeps the current multipart target below the Vercel function body limit', () => {
    expect(UPLOAD.compressionTargetSize).toBeLessThan(UPLOAD.multipartSafeSize);
    expect(UPLOAD.multipartSafeSize).toBeLessThan(4.5 * 1024 * 1024);
  });

  it('only treats static browser image formats as compressible', () => {
    expect(isCompressibleImageType('image/jpeg')).toBe(true);
    expect(isCompressibleImageType('image/png')).toBe(true);
    expect(isCompressibleImageType('image/webp')).toBe(true);
    expect(isCompressibleImageType('image/gif')).toBe(false);
    expect(isCompressibleImageType('video/mp4')).toBe(false);
  });
});
