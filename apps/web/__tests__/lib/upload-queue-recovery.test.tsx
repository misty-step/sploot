// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { getUploadQueueManager, useUploadRecovery } from '@/lib/upload-queue';

/**
 * Regression test for recovery never firing on the live /app page.
 *
 * upload-zone passes a fresh inline callback and options object on every
 * render, and the page re-renders continuously (status polling, the hook's
 * own state updates). The recovery effect must survive that churn: one
 * recovery pass must complete and deliver files even while re-renders keep
 * arriving faster than the auto-resume delay.
 */

function Harness({ onRecovered }: { onRecovered: (files: File[]) => void }) {
  // Fresh function and object identity on every render, like upload-zone.
  useUploadRecovery(
    async (files) => onRecovered(files),
    { autoResumeDelay: 100, maxRetries: 3 }
  );
  return null;
}

describe('useUploadRecovery', () => {
  it('recovers a persisted upload exactly once while render churn outpaces the resume delay', async () => {
    const manager = getUploadQueueManager();
    await manager.init();
    await manager.addUpload(
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'interrupted.png', {
        type: 'image/png',
      })
    );

    const onRecovered = vi.fn();
    const view = render(<Harness onRecovered={onRecovered} />);

    // Sustained churn: re-render every 30ms (faster than the 100ms resume
    // delay) for up to 2s. Recovery must fire DURING the churn — the live
    // page never stops re-rendering, so "fires once renders settle" is a
    // failure.
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && onRecovered.mock.calls.length === 0) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
        view.rerender(<Harness onRecovered={onRecovered} />);
      });
    }

    expect(onRecovered).toHaveBeenCalledTimes(1);
    const files = onRecovered.mock.calls[0][0] as File[];
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('interrupted.png');

    // Keep churning briefly: recovery must not fire a second time.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
        view.rerender(<Harness onRecovered={onRecovered} />);
      });
    }
    expect(onRecovered).toHaveBeenCalledTimes(1);

    // Recovery hands the file back to the upload pipeline (which re-persists
    // it under a new id), so the recovered record must be dequeued — a later
    // mount must not resurrect it and duplicate the upload.
    const remaining = await manager.getPendingUploads();
    expect(remaining).toHaveLength(0);
  });
});
