import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRepoSlug, getReleases, getLatestVersion } from '@/lib/releases';

vi.mock('@/lib/observability-logger', () => ({
  logger: { logError: vi.fn(), logInfo: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getRepoSlug', () => {
  it('defaults to the real repository, not a placeholder', () => {
    vi.stubEnv('GITHUB_REPOSITORY', '');
    expect(getRepoSlug()).toBe('misty-step/sploot');
  });

  it('honors GITHUB_REPOSITORY when set (Actions)', () => {
    vi.stubEnv('GITHUB_REPOSITORY', 'someone/fork');
    expect(getRepoSlug()).toBe('someone/fork');
  });
});

describe('getReleases / getLatestVersion', () => {
  it('fetches releases from the resolved repo', async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json([{ id: 1, tag_name: 'v1.12.0', name: 'v1.12.0', body: '', published_at: '', html_url: '' }])
    );
    vi.stubGlobal('fetch', fetchMock);

    const releases = await getReleases(1);

    expect(fetchMock.mock.calls[0][0]).toContain('/repos/misty-step/sploot/releases?per_page=1');
    expect(releases[0].tag_name).toBe('v1.12.0');
    expect(await getLatestVersion()).toBe('v1.12.0');
  });

  it('returns empty on a failed response instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));

    expect(await getReleases()).toEqual([]);
    expect(await getLatestVersion()).toBeNull();
  });
});
