'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { sendClientErrorTelemetry } from '@/lib/client-error-telemetry';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    sendClientErrorTelemetry('app-layout-error', error, {
      metadata: {
        section: 'authenticated-app',
        action: 'layout-render',
        ...(error.digest ? { digest: error.digest } : {}),
      },
    });
  }, [error]);

  // Check if this is a database/auth error
  const isDatabaseError = error.message?.toLowerCase().includes('database') ||
                          error.message?.toLowerCase().includes('prisma') ||
                          error.message?.toLowerCase().includes('connection');

  const isAuthError = error.message?.toLowerCase().includes('auth') ||
                      error.message?.toLowerCase().includes('clerk') ||
                      error.message?.toLowerCase().includes('unauthorized');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 py-16 text-center">
      <div className="flex size-20 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
        <span className="text-4xl font-semibold">!</span>
      </div>

      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">
          {isDatabaseError && 'database connection issue'}
          {isAuthError && 'authentication issue'}
          {!isDatabaseError && !isAuthError && 'uh oh. sploot borked.'}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {isDatabaseError && 'Unable to connect to the database. This is usually temporary. Try refreshing in a moment.'}
          {isAuthError && 'There was an issue with authentication. Try signing out and back in.'}
          {!isDatabaseError && !isAuthError && 'something went sideways. the squad already got pinged.'}
        </p>
        {error.digest && (
          <p className="text-xs font-mono text-muted-foreground/70">
            error id: <code>{error.digest}</code>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={() => reset()}
          className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          try that again
        </button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md border border-border px-5 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          bail to home
        </Link>
      </div>

      <p className="text-xs text-muted-foreground/70">
        need help? holler at{' '}
        <a
          className="underline decoration-dotted underline-offset-4 hover:text-foreground"
          href="mailto:support@sploot.dev"
        >
          support@sploot.dev
        </a>
      </p>
    </div>
  );
}
