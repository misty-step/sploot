import { describe, expect, it } from 'vitest';
import { shouldEmitUploadProgressUpdate } from '@/lib/upload/upload-progress-throttle';

describe('shouldEmitUploadProgressUpdate', () => {
  it('emits when progress jumps by threshold', () => {
    expect(
      shouldEmitUploadProgressUpdate({
        now: 100,
        progressPercent: 25,
        lastUpdateAt: 0,
        lastProgressPercent: 10,
      }),
    ).toBe(true);
  });

  it('emits when enough time elapsed even with small progress change', () => {
    expect(
      shouldEmitUploadProgressUpdate({
        now: 700,
        progressPercent: 12,
        lastUpdateAt: 0,
        lastProgressPercent: 10,
      }),
    ).toBe(true);
  });

  it('emits when progress reaches completion band', () => {
    expect(
      shouldEmitUploadProgressUpdate({
        now: 100,
        progressPercent: 90,
        lastUpdateAt: 50,
        lastProgressPercent: 89,
      }),
    ).toBe(true);
  });

  it('skips updates for tiny progress movement inside interval', () => {
    expect(
      shouldEmitUploadProgressUpdate({
        now: 200,
        progressPercent: 14,
        lastUpdateAt: 0,
        lastProgressPercent: 10,
      }),
    ).toBe(false);
  });
});
