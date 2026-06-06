import { describe, expect, it, vi } from 'vitest';

vi.mock('@ducanh2912/next-pwa', () => ({
  default: (options: Record<string, unknown>) => (config: Record<string, unknown>) => ({
    ...config,
    __pwaOptions: options,
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  withSentryConfig: (config: Record<string, unknown>, options: Record<string, unknown>) => ({
    ...config,
    __sentryOptions: options,
  }),
}));

describe('next config auth-sensitive pwa caching', () => {
  it('does not cache the auth-dependent start url document', async () => {
    const config = (await import('../next.config')).default as {
      __pwaOptions: {
        cacheStartUrl?: boolean;
        dynamicStartUrl?: boolean;
        workboxOptions?: {
          runtimeCaching?: Array<{ options?: { cacheName?: string } }>;
        };
      };
    };

    expect(config.__pwaOptions.cacheStartUrl).toBe(false);
    expect(config.__pwaOptions.dynamicStartUrl).toBe(false);
    expect(config.__pwaOptions.workboxOptions?.runtimeCaching?.map((entry) => entry.options?.cacheName))
      .toEqual(['user-images', 'api-search']);
  });
});
