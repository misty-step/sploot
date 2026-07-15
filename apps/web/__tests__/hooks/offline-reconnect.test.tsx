// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let offline = true;
  let removed = false;
  const upload = {
    id: 'queued-1',
    filename: 'queued.png',
    mimeType: 'image/png',
    size: 4,
    lastModified: 1,
    addedAt: 1,
    status: 'pending',
    retryCount: 0,
  };
  const manager = {
    init: vi.fn().mockResolvedValue(undefined),
    getPendingUploads: vi.fn(async () => removed ? [] : [upload]),
    addUpload: vi.fn().mockResolvedValue('queued-2'),
    removeUpload: vi.fn(async () => { removed = true; }),
    updateUploadStatus: vi.fn().mockResolvedValue(undefined),
    resetUploadForRetry: vi.fn().mockResolvedValue(undefined),
    toFile: vi.fn(async () => new File(['data'], upload.filename, { type: upload.mimeType })),
  };
  const client = {
    uploadFile: vi.fn().mockResolvedValue({ success: true, asset: { id: 'asset-1' } }),
  };
  return {
    get offline() { return offline; },
    set offline(value: boolean) { offline = value; },
    reset() { offline = true; removed = false; },
    manager,
    client,
  };
});

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOffline: mocks.offline, checkConnection: vi.fn() }),
}));
vi.mock('@/lib/upload-queue', () => ({
  getUploadQueueManager: () => mocks.manager,
}));
vi.mock('@/lib/upload/upload-network-client', () => ({
  getUploadNetworkClient: () => mocks.client,
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/logger', () => ({ error: vi.fn() }));

import { useUploadQueue } from '@/hooks/use-upload-queue';

describe('offline recovery', () => {
  beforeEach(() => {
    mocks.reset();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('automatically resumes a persisted upload when connectivity returns', async () => {
    const hook = renderHook(() => useUploadQueue({ autoProcess: true }));
    await waitFor(() => expect(mocks.manager.getPendingUploads).toHaveBeenCalled());
    expect(mocks.client.uploadFile).not.toHaveBeenCalled();

    await act(async () => {
      mocks.offline = false;
      hook.rerender();
    });

    await waitFor(() => expect(mocks.client.uploadFile).toHaveBeenCalledTimes(1));
    expect(mocks.manager.removeUpload).toHaveBeenCalledWith('queued-1');
    hook.unmount();
  });

  it('shares queue additions and atomically resets manual retries across consumers', async () => {
    mocks.offline = false;
    const first = renderHook(() => useUploadQueue());
    const second = renderHook(() => useUploadQueue());
    await waitFor(() => expect(mocks.manager.getPendingUploads).toHaveBeenCalled());

    await act(async () => {
      await first.result.current.addToQueue(new File(['data'], 'retry.png', { type: 'image/png' }));
    });
    await waitFor(() => expect(second.result.current.queue.some((item) => item.id === 'queued-2')).toBe(true));

    await act(async () => {
      await first.result.current.retryUpload('queued-1');
    });
    expect(mocks.manager.resetUploadForRetry).toHaveBeenCalledWith('queued-1');
    expect(mocks.manager.resetUploadForRetry.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.manager.getPendingUploads.mock.invocationCallOrder.at(-1) ?? Number.POSITIVE_INFINITY,
    );
    first.unmount();
    second.unmount();
  });
});
