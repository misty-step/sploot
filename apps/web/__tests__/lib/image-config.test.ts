import { describe, it, expect } from 'vitest';
import {
  IMAGE_DEVICE_SIZES,
  IMAGE_MINIMUM_CACHE_TTL,
} from '@/lib/image-config';

// Regression guard for ADR-008: the optimized image surfaces must stay
// cost-capped. These assertions fail if someone restores the 8-deviceSize
// ladder or drops the long cache TTL — the config that made image
// optimization the first-to-explode cost line.
describe('cost-safe image optimization config', () => {
  it('keeps deviceSizes trimmed (≤ 3) so each image is not re-encoded into many variants', () => {
    expect(IMAGE_DEVICE_SIZES.length).toBeLessThanOrEqual(3);
  });

  it('drops the giant 4K (3840) variant', () => {
    expect(Math.max(...IMAGE_DEVICE_SIZES)).toBeLessThanOrEqual(2048);
  });

  it('caches optimized variants long (≥ 7 days) since meme blobs are immutable', () => {
    const SEVEN_DAYS = 60 * 60 * 24 * 7;
    expect(IMAGE_MINIMUM_CACHE_TTL).toBeGreaterThanOrEqual(SEVEN_DAYS);
  });
});
