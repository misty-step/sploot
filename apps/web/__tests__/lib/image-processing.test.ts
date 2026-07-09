import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { processUploadedImage, THUMBNAIL_SIZE } from '@/lib/image-processing';

async function fixture(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 31, g: 76, b: 255 },
    },
  })
    .png()
    .toBuffer();
}

describe('aspect-preserving image renditions', () => {
  it.each([
    { width: 1200, height: 600, expectedWidth: THUMBNAIL_SIZE, expectedHeight: 128 },
    { width: 600, height: 1200, expectedWidth: 128, expectedHeight: THUMBNAIL_SIZE },
  ])(
    'fits a $width×$height image inside the thumbnail bounds without cropping',
    async ({ width, height, expectedWidth, expectedHeight }) => {
      const result = await processUploadedImage(await fixture(width, height), 'image/png');
      const metadata = await sharp(result.thumbnail.buffer).metadata();

      expect(result.thumbnail.width).toBe(expectedWidth);
      expect(result.thumbnail.height).toBe(expectedHeight);
      expect(metadata.width).toBe(expectedWidth);
      expect(metadata.height).toBe(expectedHeight);
    }
  );
});
