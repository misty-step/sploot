// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import {
  UPLOAD_QUEUE_MAX_AGE_MS,
  UPLOAD_QUEUE_CLAIM_LEASE_MS,
  UPLOAD_QUEUE_MAX_ENTRIES,
  UploadQueueManager,
  UploadQueueStorageLimitError,
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
      expect(UPLOAD_QUEUE_CLAIM_LEASE_MS).toBeGreaterThan(10_000);
      const vendorCostingUpload = { tabA: vi.fn(), tabB: vi.fn() };

      const claims = await Promise.all([
        firstTab.claimUpload(id, 'tab-a', 1_000),
        secondTab.claimUpload(id, 'tab-b', 1_000),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      if (claims[0]) vendorCostingUpload.tabA();
      if (claims[1]) vendorCostingUpload.tabB();
      expect(vendorCostingUpload.tabA.mock.calls.length + vendorCostingUpload.tabB.mock.calls.length).toBe(1);
      expect(claims[0] ? vendorCostingUpload.tabB : vendorCostingUpload.tabA).not.toHaveBeenCalled();

      vi.setSystemTime(new Date('2026-07-15T00:00:00.001Z'));
      const stillClaimed = await secondTab.claimUpload(id, 'tab-b-retry', 1_000);
      expect(stillClaimed).toBeNull();
      vi.setSystemTime(new Date('2026-07-15T00:00:01.001Z'));
      await expect(firstTab.completeUpload(id, 'tab-a')).resolves.toBe(false);
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
      await manager.resetUploadForRetry(id);
      const retried = await manager.getPendingUploads();
      expect(retried[0]).toMatchObject({ id, status: 'pending', retryCount: 0 });
      await expect(manager.claimUpload(id, 'manual-retry')).resolves.toMatchObject({ id, status: 'uploading' });
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
