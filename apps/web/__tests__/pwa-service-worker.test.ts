import { describe, expect, it, vi } from 'vitest';

vi.mock('@ducanh2912/next-pwa', () => ({
  default: (options: Record<string, unknown>) => (config: Record<string, unknown>) => ({
    ...config,
    __pwaOptions: options,
  }),
}));

describe('production PWA service worker lifecycle', () => {
  it('generates a registered worker that takes control and owns the product caches', async () => {
    const config = (await import('../next.config')).default as {
      __pwaOptions: {
        register?: boolean;
        workboxOptions?: {
          skipWaiting?: boolean;
          clientsClaim?: boolean;
          runtimeCaching?: Array<{ options?: { cacheName?: string } }>;
        };
      };
    };

    expect(config.__pwaOptions.register).toBe(true);
    expect(config.__pwaOptions.workboxOptions?.skipWaiting).toBe(true);
    expect(config.__pwaOptions.workboxOptions?.clientsClaim).toBe(true);
    expect(config.__pwaOptions.workboxOptions?.runtimeCaching?.map((entry) => entry.options?.cacheName))
      .toEqual(expect.arrayContaining(['user-images', 'api-search']));
  });
});
