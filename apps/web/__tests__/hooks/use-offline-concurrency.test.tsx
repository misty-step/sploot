// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOffline } from '@/hooks/use-offline';

describe('useOffline connectivity probe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('shares an in-flight probe instead of reporting a false online result', async () => {
    let rejectProbe!: (reason: Error) => void;
    const probe = new Promise<Response>((_resolve, reject) => { rejectProbe = reject; });
    const fetchMock = vi.fn(() => probe);
    vi.stubGlobal('fetch', fetchMock);

    const { result, unmount } = renderHook(() => useOffline());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const concurrentResult = result.current.checkConnection();
    rejectProbe(new Error('offline'));

    await expect(concurrentResult).resolves.toBe(false);
    await waitFor(() => expect(result.current.isOffline).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
  });
});
