// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let offline = true;
  let removed = false;
  const upload = {
    id: 'queued-1',
    intent: 'file' as const,
    filename: 'queued.png',
    mimeType: 'image/png',
    size: 4,
    lastModified: 1,
    addedAt: 1,
    status: 'pending',
    retryCount: 0,
    claimGeneration: 1,
    claimToken: 'attempt-1',
  };
  const manager = {
    init: vi.fn().mockResolvedValue(undefined),
    getPendingUploads: vi.fn(async () => (removed ? [] : [upload])),
    addUpload: vi.fn().mockResolvedValue('queued-2'),
    removeUpload: vi.fn(async () => {
      removed = true;
    }),
    claimUpload: vi.fn(async () => upload),
    completeUpload: vi.fn(async () => {
      removed = true;
      return true;
    }),
    releaseUploadClaim: vi.fn(async (_id: string, _ownerKey: string, _owner: string, _generation: number, _claimToken: string, error?: string) => ({
      ...upload,
      status: 'failed',
      error,
      retryCount: upload.retryCount + 1,
    })),
    updateUploadStatus: vi.fn().mockResolvedValue(undefined),
    resetUploadForRetry: vi.fn().mockResolvedValue(undefined),
    toFile: vi.fn(async () => new File(['data'], upload.filename, { type: upload.mimeType })),
  };
  const client = {
    uploadFile: vi.fn().mockResolvedValue({ success: true, asset: { id: 'asset-1' } }),
    uploadWithRetry: vi.fn().mockResolvedValue({ success: true, asset: { id: 'asset-1' } }),
    uploadUrlWithRetry: vi.fn(),
  };
  const logError = vi.fn();
  return {
    get offline() {
      return offline;
    },
    set offline(value: boolean) {
      offline = value;
    },
    reset() {
      offline = true;
      removed = false;
    },
    manager,
    client,
    logError,
  };
});

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOffline: mocks.offline, checkConnection: vi.fn() }),
}));
vi.mock('@/lib/upload-queue', () => ({
  UPLOAD_QUEUE_MAX_RETRIES: 3,
  createUploadId: () => 'stable-tab-owner',
  getUploadQueueManager: () => mocks.manager,
}));
vi.mock('@/lib/upload/upload-network-client', () => ({
  getUploadNetworkClient: () => mocks.client,
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/logger', () => ({ error: mocks.logError }));

import { useUploadQueue } from '@/hooks/use-upload-queue';

describe('offline recovery', () => {
  beforeEach(() => {
    mocks.reset();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('automatically resumes a persisted upload when connectivity returns', async () => {
    const hook = renderHook(() => useUploadQueue({ autoProcess: true, ownerKey: `account-${'a'.repeat(64)}` }));
    await waitFor(() => expect(mocks.manager.getPendingUploads).toHaveBeenCalled());
    expect(mocks.client.uploadFile).not.toHaveBeenCalled();

    await act(async () => {
      mocks.offline = false;
      hook.rerender();
    });

    await waitFor(() => expect(mocks.client.uploadWithRetry).toHaveBeenCalledTimes(1));
    expect(mocks.manager.completeUpload).toHaveBeenCalledWith('queued-1', expect.any(String), expect.any(String), 1, 'attempt-1');
    expect(mocks.client.uploadWithRetry).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ idempotencyKey: 'queued-1' }), 3);
    hook.unmount();
  });

  it('shares queue additions and atomically resets manual retries across consumers', async () => {
    mocks.offline = false;
    const first = renderHook(() => useUploadQueue({ ownerKey: `account-${'a'.repeat(64)}` }));
    const second = renderHook(() => useUploadQueue({ ownerKey: `account-${'a'.repeat(64)}` }));
    await waitFor(() => expect(mocks.manager.getPendingUploads).toHaveBeenCalled());

    await act(async () => {
      await first.result.current.addToQueue(new File(['data'], 'retry.png', { type: 'image/png' }));
    });
    await waitFor(() => expect(second.result.current.queue.some((item) => item.id === 'queued-2')).toBe(true));

    await act(async () => {
      await first.result.current.retryUpload('queued-1');
    });
    expect(mocks.manager.resetUploadForRetry).toHaveBeenCalledWith('queued-1', expect.any(String), 1);
    expect(mocks.manager.resetUploadForRetry.mock.invocationCallOrder[0]).toBeLessThan(mocks.manager.getPendingUploads.mock.invocationCallOrder.at(-1) ?? Number.POSITIVE_INFINITY);
    first.unmount();
    second.unmount();
  });

  it('keeps the item when the durable completion fence is lost', async () => {
    mocks.offline = false;
    mocks.manager.completeUpload.mockImplementationOnce(async () => false);
    const hook = renderHook(() => useUploadQueue({ autoProcess: true, ownerKey: `account-${'a'.repeat(64)}` }));

    await waitFor(() => expect(mocks.client.uploadWithRetry).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hook.result.current.queue.some((item) => item.id === 'queued-1')).toBe(true));
    expect(mocks.manager.removeUpload).not.toHaveBeenCalled();
    expect(hook.result.current.queue.find((item) => item.id === 'queued-1')?.status).not.toBe('success');
    hook.unmount();
  });

  it('does not start network work after durable enqueue fails', async () => {
    mocks.offline = false;
    mocks.manager.getPendingUploads.mockResolvedValue([]);
    mocks.manager.addUpload.mockRejectedValueOnce(new Error('durable storage unavailable'));
    const hook = renderHook(() => useUploadQueue({ autoProcess: true, ownerKey: `account-${'a'.repeat(64)}` }));

    await expect(
      act(async () => {
        await hook.result.current.addToQueue(new File(['data'], 'not-enqueued.png', { type: 'image/png' }));
      }),
    ).rejects.toThrow('durable storage unavailable');
    await act(async () => {
      await hook.result.current.processQueue();
    });
    expect(mocks.client.uploadFile).not.toHaveBeenCalled();
    hook.unmount();
  });
});
