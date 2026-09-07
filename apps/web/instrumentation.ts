import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Next shares this entrypoint across runtimes; static imports would bundle
  // Node-only instrumentation into the edge runtime.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
