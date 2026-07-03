import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { hammingDistanceHex, PerceptualHashService } from '@/lib/upload/perceptual-hash-service';

async function solidPng(color: string): Promise<Buffer> {
  return sharp({
    create: {
      width: 24,
      height: 24,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

describe('PerceptualHashService', () => {
  it('computes stable hashes for visually identical images', async () => {
    const service = new PerceptualHashService();
    const first = await solidPng('#ff0000');
    const second = await solidPng('#ff0000');

    await expect(service.computeDhash(first)).resolves.toBe(await service.computeDhash(second));
  });

  it('counts hamming distance between hex hashes', () => {
    expect(hammingDistanceHex('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistanceHex('0000000000000000', '000000000000000f')).toBe(4);
    expect(hammingDistanceHex('ffffffffffffffff', '0000000000000000')).toBe(64);
  });
});
