/**
 * Sentry Error Tracking for Extension
 *
 * Placeholder for Sentry integration. To enable:
 * 1. pnpm --filter extension add @sentry/browser
 * 2. Set VITE_SENTRY_DSN environment variable
 * 3. Uncomment the implementation in this file
 *
 * PII is aggressively scrubbed to protect user privacy.
 */

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/**
 * Initialize Sentry for error tracking
 *
 * Currently a no-op until @sentry/browser is installed.
 */
export async function initSentry(): Promise<void> {
  if (!SENTRY_DSN) {
    console.log('[Sentry] DSN not configured, skipping initialization');
    return;
  }

  // TODO: Uncomment when @sentry/browser is added
  // const Sentry = await import('@sentry/browser');
  // Sentry.init({ dsn: SENTRY_DSN, ... });
  console.log('[Sentry] Placeholder - install @sentry/browser to enable');
}

/**
 * Capture an exception with context
 */
export async function captureException(
  error: Error,
  _context?: Record<string, unknown>
): Promise<void> {
  // Placeholder - log to console until Sentry is configured
  console.error('[Sentry] captureException:', error);
}

/**
 * Set user context (use sparingly, only auth state)
 */
export async function setUser(_user: { id: string } | null): Promise<void> {
  // Placeholder
}
