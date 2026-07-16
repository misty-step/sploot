import { describe, expect, it } from 'vitest';
import { waitForExportCapacity } from '@/lib/export/export-backpressure';

describe('export backpressure', () => {
  it('allows a slow consumer that recovers before the deadline', async () => {
    let desiredSize = 0;
    setTimeout(() => { desiredSize = 1; }, 15);
    await waitForExportCapacity(() => desiredSize, () => false, 100);
    expect(desiredSize).toBe(1);
  });

  it('times out a consumer that never recovers', async () => {
    await expect(waitForExportCapacity(() => 0, () => false, 10)).rejects.toThrow(/backpressure/i);
  });
});
