'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { sendClientErrorTelemetry } from '@/lib/client-error-telemetry';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    sendClientErrorTelemetry('app-global-error', error, {
      metadata: error.digest ? { digest: error.digest } : undefined,
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-16 text-center">
          <div className="flex size-24 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
            <svg
              className="size-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-semibold">the vibes crashed.</h1>
            <p className="max-w-lg text-sm text-muted-foreground">
              something went sideways at the root level. we logged it and pinged the crew.
              try refreshing the page or hopping back to the dashboard.
            </p>
            {error.digest && (
              <p className="text-xs text-muted-foreground/70">
                error id: <code>{error.digest}</code>
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => reset()}
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              rerun that scene
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-border px-5 py-2 text-sm font-medium transition hover:bg-muted"
            >
              sprint to dashboard
            </Link>
          </div>

          <p className="text-xs text-muted-foreground/70">
            need help? email{' '}
            <a
              className="underline decoration-dotted underline-offset-4 hover:text-foreground"
              href="mailto:support@sploot.dev"
            >
              support@sploot.dev
            </a>
          </p>
        </div>
      </body>
    </html>
  );
}
