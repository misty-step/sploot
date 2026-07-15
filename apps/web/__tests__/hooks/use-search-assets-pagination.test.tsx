import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSearchAssets } from '@/hooks/use-assets';

describe('useSearchAssets pagination', () => {
  it('keeps every search page on /api/search', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{ id: 'one' }],
        total: 2,
        hasMore: true,
        processingTime: 12,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{ id: 'two' }],
        total: 2,
        hasMore: false,
        processingTime: 9,
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSearchAssets('cats', { limit: 1 }));
    await waitFor(() => expect(result.current.assets).toHaveLength(1));

    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.assets).toHaveLength(2));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/search')).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ offset: 1, limit: 1 });

    vi.unstubAllGlobals();
  });

  it('keys metadata to the settled query and clears abort state on query changes', async () => {
    let resolveCats!: (response: Response) => void;
    let resolveDogs!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      const body = JSON.parse(init.body);
      if (body.query === 'cats') {
        return new Promise<Response>((resolve) => { resolveCats = resolve; });
      }
      return new Promise<Response>((resolve) => { resolveDogs = resolve; });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ query }) => useSearchAssets(query, { limit: 1 }),
      { initialProps: { query: 'cats' } }
    );

    await waitFor(() => expect(resolveCats).toBeTypeOf('function'));
    await act(async () => {
      resolveCats(new Response(JSON.stringify({
        results: [{ id: 'cat' }],
        total: 1,
        hasMore: false,
        processingTime: 12,
      }), { status: 200 }));
    });
    await waitFor(() => expect(result.current.metadata?.latencyMs).toBe(12));

    rerender({ query: 'dogs' });
    await waitFor(() => expect(resolveDogs).toBeTypeOf('function'));
    expect(result.current.loading).toBe(true);
    expect(result.current.total).toBe(0);
    expect(result.current.metadata).toBeNull();
    expect(result.current.assets).toEqual([{ id: 'cat' }]);

    await act(async () => {
      resolveDogs(new Response(JSON.stringify({
        results: [{ id: 'dog' }],
        total: 1,
        hasMore: false,
        processingTime: 8,
      }), { status: 200 }));
    });
    await waitFor(() => expect(result.current.assets).toEqual([{ id: 'dog' }]));

    rerender({ query: '' });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.assets).toEqual([]);
      expect(result.current.metadata).toBeNull();
    });

    vi.unstubAllGlobals();
  });
});
