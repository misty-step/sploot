'use client';

import { useEffect } from 'react';
import { StateSurface } from '@/components/sploot/state-surface';
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
      <body className="min-h-screen bg-sploot-paper text-sploot-ink">
        <StateSurface
          eyebrow="global crash"
          title="the pile fell over."
          description="sploot hit the root crash boundary. the error report got logged; retry the route or open the front door."
          primaryAction={{ label: 'try again', onClick: reset }}
          secondaryAction={{ href: '/', label: 'open sploot', variant: 'ghost' }}
          doodle="skull"
          detail={error.digest ? <span>error id: <code>{error.digest}</code></span> : null}
          status={[
            { label: 'boundary', value: 'global' },
            { label: 'telemetry', value: 'logged', ok: true },
            { label: 'recovery', value: 'retry' },
          ]}
        />
      </body>
    </html>
  );
}
