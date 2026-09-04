import { describe, expect, it, vi } from 'vitest';

vi.mock('@ducanh2912/next-pwa', () => ({
  default: (options: Record<string, unknown>) => (config: Record<string, unknown>) => ({
    ...config,
    __pwaOptions: options,
  }),
}));

describe('production PWA service worker lifecycle', () => {
  it('generates a registered worker that takes control and owns the product caches', async () => {
    const config = (await import('../next.config')).default('phase-production-server') as unknown as {
      __pwaOptions: {
        register?: boolean;
        workboxOptions?: {
          skipWaiting?: boolean;
          clientsClaim?: boolean;
          runtimeCaching?: Array<{ handler?: string; urlPattern?: unknown; options?: { cacheName?: string } }>;
        };
      };
    };

    expect(config.__pwaOptions.register).toBe(true);
    expect(config.__pwaOptions.workboxOptions?.skipWaiting).toBe(true);
    expect(config.__pwaOptions.workboxOptions?.clientsClaim).toBe(true);
    expect(config.__pwaOptions.workboxOptions?.runtimeCaching?.map((entry) => entry.options?.cacheName))
      .toEqual(expect.arrayContaining(['user-images', 'api-search']));

    const protectedNavigation = config.__pwaOptions.workboxOptions?.runtimeCaching?.find((entry) => entry.handler === 'NetworkOnly');
    expect(protectedNavigation).toBeDefined();
    expect(protectedNavigation?.urlPattern).toEqual(expect.any(Function));
    expect(protectedNavigation?.options).toBeUndefined();

    const matches = protectedNavigation?.urlPattern as ((input: { request: { mode: string }; url: URL }) => boolean);
    expect(matches({ request: { mode: 'navigate' }, url: new URL('https://sploot.app/app') })).toBe(true);
    expect(matches({ request: { mode: 'navigate' }, url: new URL('https://sploot.app/app/library') })).toBe(true);
    expect(matches({ request: { mode: 'navigate' }, url: new URL('https://sploot.app/application') })).toBe(false);
    expect(matches({ request: { mode: 'navigate' }, url: new URL('https://sploot.app/apply') })).toBe(false);
    expect(matches({ request: { mode: 'same-origin' }, url: new URL('https://sploot.app/app') })).toBe(false);
  });
});
