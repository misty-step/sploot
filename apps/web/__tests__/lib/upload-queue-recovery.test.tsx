// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import {
  UPLOAD_QUEUE_MAX_AGE_MS,
  UPLOAD_QUEUE_CLAIM_LEASE_MS,
  UPLOAD_QUEUE_MAX_BYTES,
  UPLOAD_QUEUE_MAX_ENTRIES,
  UploadQueueManager,
  UploadQueueStorageLimitError,
  UploadQueueStorageUnavailableError,
  UploadQueueClaimStaleError,
} from '@/lib/upload-queue';

const OWNER_A = `account-${'a'.repeat(64)}`;
const OWNER_B = `account-${'b'.repeat(64)}`;

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
    await firstTab.clearAll(OWNER_A);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
      const id = await firstTab.addUpload(new File(['data'], 'race.png', { type: 'image/png' }), OWNER_A);
      expect(UPLOAD_QUEUE_CLAIM_LEASE_MS).toBeGreaterThan(10_000);
      const vendorCostingUpload = { tabA: vi.fn(), tabB: vi.fn() };

      const claims = await Promise.all([firstTab.claimUpload(id, OWNER_A, 'tab-a', 1_000), secondTab.claimUpload(id, OWNER_A, 'tab-b', 1_000)]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      if (claims[0]) vendorCostingUpload.tabA();
      if (claims[1]) vendorCostingUpload.tabB();
      expect(vendorCostingUpload.tabA.mock.calls.length + vendorCostingUpload.tabB.mock.calls.length).toBe(1);
      expect(claims[0] ? vendorCostingUpload.tabB : vendorCostingUpload.tabA).not.toHaveBeenCalled();

      vi.setSystemTime(new Date('2026-07-15T00:00:00.001Z'));
      const stillClaimed = await secondTab.claimUpload(id, OWNER_A, 'tab-b-retry', 1_000);
      expect(stillClaimed).toBeNull();
      vi.setSystemTime(new Date('2026-07-15T00:00:01.001Z'));
      const firstClaim = claims.find(Boolean);
      await expect(firstTab.completeUpload(id, OWNER_A, firstClaim?.claimOwner ?? 'tab-a', firstClaim?.claimGeneration ?? 1, firstClaim?.claimToken ?? 'missing-token')).resolves.toBe(false);
      const recovered = await secondTab.claimUpload(id, OWNER_A, 'tab-b-recovery', 1_000);
      expect(recovered?.id).toBe(id);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fences stale completion and release by exact attempt token when an owner is reused', async () => {
    const firstTab = UploadQueueManager.create();
    const secondTab = UploadQueueManager.create();
    await Promise.all([firstTab.init(), secondTab.init()]);
    await firstTab.clearAll(OWNER_A);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
      const id = await firstTab.addUpload(new File(['data'], 'stale-generation.png', { type: 'image/png' }), OWNER_A);
      const firstClaim = await firstTab.claimUpload(id, OWNER_A, 'same-owner', 1_000);
      expect(firstClaim?.claimToken).toEqual(expect.any(String));

      vi.setSystemTime(new Date('2026-07-15T00:00:01.001Z'));
      const currentClaim = await secondTab.claimUpload(id, OWNER_A, 'same-owner', 1_000);
      expect(currentClaim?.claimToken).toEqual(expect.any(String));
      expect(currentClaim?.claimToken).not.toBe(firstClaim?.claimToken);

      await expect(firstTab.completeUpload(id, OWNER_A, 'same-owner', firstClaim!.claimGeneration, firstClaim!.claimToken!)).resolves.toBe(false);
      await expect(firstTab.releaseUploadClaim(id, OWNER_A, 'same-owner', firstClaim!.claimGeneration, firstClaim!.claimToken!, 'stale failure')).resolves.toBeNull();
      await expect(secondTab.getPendingUploads(OWNER_A)).resolves.toEqual([
        expect.objectContaining({
          id,
          status: 'uploading',
          claimOwner: 'same-owner',
          claimToken: currentClaim!.claimToken,
        }),
      ]);

      await expect(secondTab.completeUpload(id, OWNER_A, 'same-owner', currentClaim!.claimGeneration, currentClaim!.claimToken!)).resolves.toBe(true);
      await expect(secondTab.getPendingUploads(OWNER_A)).resolves.toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects stale user retry and remove while a newer generation is live', async () => {
    const firstTab = UploadQueueManager.create();
    const secondTab = UploadQueueManager.create();
    await Promise.all([firstTab.init(), secondTab.init()]);
    await firstTab.clearAll(OWNER_A);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
      const id = await firstTab.addUpload(new File(['data'], 'user-race.png', { type: 'image/png' }), OWNER_A);
      const initial = await firstTab.claimUpload(id, OWNER_A, 'same-owner', 1_000);

      vi.setSystemTime(new Date('2026-07-15T00:00:01.001Z'));
      const currentClaim = await secondTab.claimUpload(id, OWNER_A, 'same-owner', 1_000);
      expect(currentClaim?.claimToken).toEqual(expect.any(String));

      await expect(firstTab.resetUploadForRetry(id, OWNER_A, initial!.claimGeneration)).rejects.toThrow('Upload claim generation changed');
      await expect(firstTab.removeUpload(id, OWNER_A, initial!.claimGeneration)).rejects.toThrow('Upload claim generation changed');
      await expect(secondTab.getPendingUploads(OWNER_A)).resolves.toEqual([
        expect.objectContaining({
          id,
          status: 'uploading',
          claimToken: currentClaim!.claimToken,
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('isolates two accounts across tabs and fences stale mutations after reclaim', async () => {
    const accountA = UploadQueueManager.create();
    const accountB = UploadQueueManager.create();
    await Promise.all([accountA.init(), accountB.init()]);
    await accountA.clearAll(OWNER_A);
    await accountA.clearAll(OWNER_B);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
      const id = await accountA.addUpload(new File(['secret-a'], 'account-a.png', { type: 'image/png' }), OWNER_A);
      const first = await accountA.claimUpload(id, OWNER_A, 'tab-a', 1_000);
      expect(await accountB.getPendingUploads(OWNER_B)).toHaveLength(0);
      await expect(accountB.removeUpload(id, OWNER_B, 0)).resolves.toBeUndefined();
      await expect(accountA.getPendingUploads(OWNER_A)).resolves.toEqual([
        expect.objectContaining({ id, ownerKey: OWNER_A, status: 'uploading' }),
      ]);

      vi.setSystemTime(new Date('2026-07-15T00:00:01.001Z'));
      const second = await accountB.claimUpload(id, OWNER_A, 'tab-b', 1_000);
      expect(second?.claimGeneration).toBe((first?.claimGeneration ?? 0) + 1);
      await accountA.releaseUploadClaim(id, OWNER_A, 'tab-a', first!.claimGeneration, first!.claimToken!, 'stale');
      await accountB.releaseUploadClaim(id, OWNER_A, 'tab-b', second!.claimGeneration, second!.claimToken!, 'retry');
      await expect(accountA.removeUpload(id, OWNER_A, first!.claimGeneration)).rejects.toBeInstanceOf(UploadQueueClaimStaleError);
      await expect(accountA.resetUploadForRetry(id, OWNER_A, first!.claimGeneration)).rejects.toBeInstanceOf(UploadQueueClaimStaleError);
      const restart = UploadQueueManager.create();
      await restart.init();
      await expect(restart.getPendingUploads(OWNER_A)).resolves.toEqual([
        expect.objectContaining({ id, ownerKey: OWNER_A, status: 'failed', claimGeneration: second!.claimGeneration }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retains exhausted uploads as visible terminal records instead of deleting payloads', async () => {
    const manager = UploadQueueManager.create();
    await manager.init();
    await manager.clearAll(OWNER_A);
    const id = await manager.addUpload(new File(['data'], 'exhausted.png', { type: 'image/png' }), OWNER_A);

    const claimed = await manager.claimUpload(id, OWNER_A, 'test-owner');
    expect(await manager.toFile(claimed!, OWNER_A)).toHaveProperty('name', 'exhausted.png');
    await manager.releaseUploadClaim(id, OWNER_A, 'test-owner', claimed!.claimGeneration, claimed!.claimToken!, 'network-1');
    await manager.updateUploadStatus(id, OWNER_A, 'failed', 'network-2');
    await manager.updateUploadStatus(id, OWNER_A, 'failed', 'network-3');

    const uploads = await manager.getPendingUploads(OWNER_A);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({ id, status: 'terminal', retryCount: 3 });
  });

  it('retains expired uploads and preserves a bounded explicit queue policy', async () => {
    const manager = UploadQueueManager.create();
    await manager.init();
    await manager.clearAll(OWNER_A);
    vi.useFakeTimers({ toFake: ['Date'] });
    const capturedAt = new Date('2026-07-15T00:00:00.000Z');
    vi.setSystemTime(capturedAt);
    const id = await manager.addUpload(new File(['data'], 'expired.png', { type: 'image/png' }), OWNER_A);
    vi.setSystemTime(capturedAt.getTime() + UPLOAD_QUEUE_MAX_AGE_MS + 1);
    try {
      const uploads = await manager.getPendingUploads(OWNER_A);
      expect(uploads).toHaveLength(1);
      expect(uploads[0]).toMatchObject({ id, status: 'terminal' });
      await manager.resetUploadForRetry(id, OWNER_A, uploads[0].claimGeneration);
      const retried = await manager.getPendingUploads(OWNER_A);
      expect(retried[0]).toMatchObject({
        id,
        status: 'pending',
        retryCount: 0,
      });
      await expect(manager.claimUpload(id, OWNER_A, 'manual-retry')).resolves.toMatchObject({ id, status: 'uploading' });
    } finally {
      vi.useRealTimers();
    }

    await manager.clearAll(OWNER_A);
    for (let index = 0; index < UPLOAD_QUEUE_MAX_ENTRIES; index += 1) {
      await manager.addUpload(new File(['x'], `bounded-${index}.png`, { type: 'image/png' }), OWNER_A);
    }
    const overflow = new File(['x'], 'overflow.png', { type: 'image/png' });
    const overflowBuffer = vi.spyOn(overflow, 'arrayBuffer');
    await expect(manager.addUpload(overflow, OWNER_A)).rejects.toBeInstanceOf(UploadQueueStorageLimitError);
    expect(overflowBuffer).not.toHaveBeenCalled();
  }, 15_000);

  it('rejects unavailable storage and validates metadata before buffering file bytes', async () => {
    const unavailable = UploadQueueManager.create();
    const indexedDb = window.indexedDB;
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: undefined,
    });
    try {
      await expect(unavailable.addUpload(new File(['data'], 'unavailable.png', { type: 'image/png' }), OWNER_A)).rejects.toBeInstanceOf(UploadQueueStorageUnavailableError);
    } finally {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: indexedDb,
      });
    }

    const manager = UploadQueueManager.create();
    await manager.init();
    await manager.clearAll(OWNER_A);
    const invalidType = new File(['data'], 'not-an-image.pdf', {
      type: 'application/pdf',
    });
    const invalidTypeBuffer = vi.spyOn(invalidType, 'arrayBuffer');
    await expect(manager.addUpload(invalidType, OWNER_A)).rejects.toThrow('Unsupported upload file type');
    expect(invalidTypeBuffer).not.toHaveBeenCalled();

    const tooLarge = new File(['data'], 'too-large.png', { type: 'image/png' });
    Object.defineProperty(tooLarge, 'size', {
      configurable: true,
      value: UPLOAD_QUEUE_MAX_BYTES + 1,
    });
    const tooLargeBuffer = vi.spyOn(tooLarge, 'arrayBuffer');
    await expect(manager.addUpload(tooLarge, OWNER_A)).rejects.toBeInstanceOf(UploadQueueStorageLimitError);
    expect(tooLargeBuffer).not.toHaveBeenCalled();
  });

  it('rejects an aborted commit instead of acknowledging a collision as durable', async () => {
    const manager = UploadQueueManager.create();
    await manager.init();
    await manager.clearAll(OWNER_A);
    const randomUuid = globalThis.crypto.randomUUID;
    if (!randomUuid) return;
    const uuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('collision-id');
    try {
      const file = new File(['data'], 'collision.png', { type: 'image/png' });
      await expect(manager.addUpload(file, OWNER_A)).resolves.toBe('collision-id');
      await expect(manager.addUpload(file, OWNER_A)).rejects.toThrow();
      await expect(manager.getPendingUploads(OWNER_A)).resolves.toHaveLength(1);
    } finally {
      uuid.mockRestore();
    }
  });
});
