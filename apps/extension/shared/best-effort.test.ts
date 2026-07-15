import { describe, expect, it, vi } from 'vitest';

import { runBestEffort } from './best-effort';

describe('runBestEffort', () => {
  it('contains synchronous Chrome API throws', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => runBestEffort('sync failure', () => {
      throw new Error('sync failure');
    })).not.toThrow();

    expect(report).toHaveBeenCalledWith('[BestEffort] sync failure failed', expect.any(Error));
    report.mockRestore();
  });

  it('contains returned promise rejections', async () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => runBestEffort('async failure', async () => {
      throw new Error('async failure');
    })).not.toThrow();

    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('[BestEffort] async failure failed', expect.any(Error)));
    report.mockRestore();
  });
});
