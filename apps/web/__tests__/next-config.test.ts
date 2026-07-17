import { describe, expect, it, vi } from 'vitest';

vi.mock('@ducanh2912/next-pwa', () => ({
  default: (options: Record<string, unknown>) => (config: Record<string, unknown>) => ({
    ...config,
    __pwaOptions: options,
  }),
}));

describe('next config auth-sensitive pwa caching', () => {
  it('does not cache the auth-dependent start url document', async () => {
    const config = (await import('../next.config')).default as {
      __pwaOptions: {
        cacheStartUrl?: boolean;
        dynamicStartUrl?: boolean;
        workboxOptions?: {
          runtimeCaching?: Array<{ handler?: string; urlPattern?: unknown; options?: { cacheName?: string } }>;
        };
      };
    };

    expect(config.__pwaOptions.cacheStartUrl).toBe(false);
    expect(config.__pwaOptions.dynamicStartUrl).toBe(false);
    const runtimeCaching = config.__pwaOptions.workboxOptions?.runtimeCaching ?? [];
    expect(runtimeCaching.map((entry) => entry.options?.cacheName))
      .toEqual([undefined, 'user-images', 'api-search']);

    const protectedNavigation = runtimeCaching.find((entry) => entry.handler === 'NetworkOnly');
    expect(protectedNavigation?.options).toBeUndefined();
    const matches = protectedNavigation?.urlPattern as ((input: { request: { mode: string }; url: URL }) => boolean);
    expect(matches({ request: { mode: 'navigate' }, url: new URL('https://sploot.app/app') })).toBe(true);
    expect(matches({ request: { mode: 'navigate' }, url: new URL('https://sploot.app/app/nested') })).toBe(true);
    expect(matches({ request: { mode: 'navigate' }, url: new URL('https://sploot.app/application') })).toBe(false);
    expect(matches({ request: { mode: 'same-origin' }, url: new URL('https://sploot.app/app') })).toBe(false);
  });
});
