// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import {
  UPLOAD_QUEUE_MAX_AGE_MS,
  UPLOAD_QUEUE_MAX_ENTRIES,
  UploadQueueManager,
  UploadQueueStorageLimitError,
  getUploadQueueManager,
  useUploadRecovery,
} from '@/lib/upload-queue';

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

describe('UploadQueueManager durable boundaries', () => {
  it('allows one dual-manager claim and recovers an expired claim', async () => {
    const firstTab = UploadQueueManager.create();
    const secondTab = UploadQueueManager.create();
    await Promise.all([firstTab.init(), secondTab.init()]);
    await firstTab.clearAll();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
      const id = await firstTab.addUpload(new File(['data'], 'race.png', { type: 'image/png' }));
      const vendorCostingUpload = vi.fn();

      const claims = await Promise.all([
        firstTab.claimUpload(id, 'tab-a', 1_000),
        secondTab.claimUpload(id, 'tab-b', 1_000),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      for (const claim of claims) {
        if (claim) vendorCostingUpload();
      }
      expect(vendorCostingUpload).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date('2026-07-15T00:00:00.001Z'));
      const stillClaimed = await secondTab.claimUpload(id, 'tab-b-retry', 1_000);
      expect(stillClaimed).toBeNull();
      vi.setSystemTime(new Date('2026-07-15T00:00:01.001Z'));
      const recovered = await secondTab.claimUpload(id, 'tab-b-recovery', 1_000);
      expect(recovered?.id).toBe(id);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retains exhausted uploads as visible terminal records instead of deleting payloads', async () => {
    const manager = UploadQueueManager.create();
    await manager.init();
    await manager.clearAll();
    const id = await manager.addUpload(new File(['data'], 'exhausted.png', { type: 'image/png' }));

    await manager.updateUploadStatus(id, 'failed', 'network-1');
    await manager.updateUploadStatus(id, 'failed', 'network-2');
    await manager.updateUploadStatus(id, 'failed', 'network-3');

    const uploads = await manager.getPendingUploads();
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({ id, status: 'terminal', retryCount: 3 });
    expect(await manager.toFile(uploads[0])).toHaveProperty('name', 'exhausted.png');
  });

  it('retains expired uploads and preserves a bounded explicit queue policy', async () => {
    const manager = UploadQueueManager.create();
    await manager.init();
    await manager.clearAll();
    vi.useFakeTimers({ toFake: ['Date'] });
    const capturedAt = new Date('2026-07-15T00:00:00.000Z');
    vi.setSystemTime(capturedAt);
    const id = await manager.addUpload(new File(['data'], 'expired.png', { type: 'image/png' }));
    vi.setSystemTime(capturedAt.getTime() + UPLOAD_QUEUE_MAX_AGE_MS + 1);
    try {
      const uploads = await manager.getPendingUploads();
      expect(uploads).toHaveLength(1);
      expect(uploads[0]).toMatchObject({ id, status: 'terminal' });
      expect(await manager.toFile(uploads[0])).toHaveProperty('name', 'expired.png');
    } finally {
      vi.useRealTimers();
    }

    await manager.clearAll();
    for (let index = 0; index < UPLOAD_QUEUE_MAX_ENTRIES; index += 1) {
      await manager.addUpload(new File(['x'], `bounded-${index}.png`, { type: 'image/png' }));
    }
    await expect(manager.addUpload(new File(['x'], 'overflow.png', { type: 'image/png' }))).rejects.toBeInstanceOf(UploadQueueStorageLimitError);
  });
});
