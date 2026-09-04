import type { Event } from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSentryOptions,
  resolveSentryEnvironment,
  resolveSentryRelease,
  sanitizeSentryEvent,
} from '@/lib/sentry';

const ORIGINAL_ENV = {
  DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SPLOOT_DEPLOYMENT_ENV: process.env.NEXT_PUBLIC_SPLOOT_DEPLOYMENT_ENV,
  NODE_ENV: process.env.NODE_ENV,
  SENTRY_DSN: process.env.SENTRY_DSN,
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
  SENTRY_RELEASE: process.env.SENTRY_RELEASE,
  SENTRY_TRACES_SAMPLE_RATE: process.env.SENTRY_TRACES_SAMPLE_RATE,
  SPLOOT_DEPLOYMENT_COMMIT: process.env.SPLOOT_DEPLOYMENT_COMMIT,
  SPLOOT_DEPLOYMENT_ENV: process.env.SPLOOT_DEPLOYMENT_ENV,
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Sentry privacy and deployment contract', () => {
  it('redacts identity, request, secret, URL, and source-context data', () => {
    const event = sanitizeSentryEvent({
      message: 'failed for person@example.com at https://sploot.app/assets/private?id=1',
      user: { id: 'user_123', email: 'person@example.com' },
      server_name: 'private-host',
      request: {
        method: 'POST',
        url: 'https://sploot.app/api/upload?token=secret',
        headers: { authorization: 'Bearer secret-value' },
        cookies: { session: 'secret' },
        data: { body: 'private' },
      },
      tags: {
        arbitrary: 'private',
        'sploot.context': 'upload:failed',
      },
      extra: {
        safeCount: 2,
        apiKey: 'secret-value',
        nested: { sessionToken: 'secret-value', safe: 'bounded' },
      },
      contexts: {
        browser: { name: 'Firefox', version: 'private' },
        request: { url: 'https://sploot.app/private' },
      },
      exception: {
        values: [{
          type: 'TypeError',
          value: 'user person@example.com sent Bearer secret-value',
          stacktrace: {
            frames: [{
              filename: 'https://sploot.app/_next/static/chunk.js?token=secret',
              abs_path: 'https://sploot.app/_next/static/chunk.js?token=secret',
              vars: { token: 'secret' },
              pre_context: ['private'],
              context_line: 'private',
              post_context: ['private'],
            }],
          },
        }],
      },
      breadcrumbs: [
        { category: 'console', message: 'secret' },
        { category: 'http', message: 'GET https://sploot.app/private?token=secret' },
      ],
    } as Event);

    expect(event.user).toBeUndefined();
    expect(event.server_name).toBeUndefined();
    expect(event.request).toEqual({ method: 'POST' });
    expect(event.tags).toMatchObject({
      service: 'sploot-web',
      owner: 'misty-step',
      'sploot.context': 'upload:failed',
    });
    expect(event.tags).not.toHaveProperty('arbitrary');
    expect(event.extra).toEqual({
      safeCount: 2,
      apiKey: '[redacted]',
      nested: { sessionToken: '[redacted]', safe: 'bounded' },
    });
    expect(event.contexts).toEqual({
      browser: { name: 'Firefox', version: 'private' },
      request: { url: '[redacted]' },
    });
    expect(event.exception?.values?.[0]?.value).not.toContain('person@example.com');
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]).toMatchObject({
      filename: 'https://sploot.app/_next/static/chunk.js',
      abs_path: 'https://sploot.app/_next/static/chunk.js',
      vars: undefined,
      pre_context: undefined,
      context_line: undefined,
      post_context: undefined,
    });
    expect(event.breadcrumbs).toHaveLength(1);
    expect(event.breadcrumbs?.[0]?.message).toBe('GET [redacted]');
    expect(JSON.stringify(event)).not.toMatch(/secret-value|person@example\.com|private\?token/);
  });

  it('disables replay and PII while bounding production tracing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', 'production');
    vi.stubEnv('SPLOOT_DEPLOYMENT_COMMIT', 'abc123');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@example.sentry.io/123');
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '0.9');

    const options = createSentryOptions('client');

    expect(options).toMatchObject({
      enabled: true,
      environment: 'production',
      release: 'abc123',
      sendDefaultPii: false,
      tracesSampleRate: 0.2,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: false, response: false },
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        stackFrameVariables: false,
        frameContextLines: 0,
      },
    });
  });

  it('keeps local production builds out of Sentry without a deployment marker', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@example.sentry.io/123');
    vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', '');
    vi.stubEnv('DEPLOYMENT_ENV', '');

    expect(createSentryOptions('server')).toMatchObject({
      enabled: false,
      environment: 'production',
    });
  });

  it('captures browser errors with compiled identity when server-only bindings are absent', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', undefined);
    vi.stubEnv('SPLOOT_DEPLOYMENT_COMMIT', undefined);
    vi.stubEnv('SENTRY_ENVIRONMENT', undefined);
    vi.stubEnv('DEPLOYMENT_ENV', undefined);
    vi.stubEnv('NEXT_PUBLIC_SPLOOT_DEPLOYMENT_ENV', 'staging');
    vi.stubEnv('NEXT_PUBLIC_SPLOOT_DEPLOYMENT_COMMIT', 'compiled-commit');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@example.sentry.io/123');

    expect(createSentryOptions('client')).toMatchObject({
      enabled: true,
      environment: 'staging',
      release: 'compiled-commit',
    });
  });

  it('uses the deployment contract ahead of ambient provider values', () => {
    vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', 'production');
    vi.stubEnv('SENTRY_ENVIRONMENT', 'preview');
    vi.stubEnv('SPLOOT_DEPLOYMENT_COMMIT', 'deploy-commit');
    vi.stubEnv('SENTRY_RELEASE', 'ambient-release');

    expect(resolveSentryEnvironment()).toBe('production');
    expect(resolveSentryRelease()).toBe('deploy-commit');
  });

  it('rejects non-Sentry and credential-bearing DSNs', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://user:password@example.test/123?token=secret');

    expect(createSentryOptions('client')).toMatchObject({ enabled: false, dsn: undefined });
  });
});
