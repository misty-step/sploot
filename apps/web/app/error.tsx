'use client';

import { useEffect } from 'react';
import { StateSurface } from '@/components/sploot/state-surface';
import { sendClientErrorTelemetry } from '@/lib/client-error-telemetry';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    sendClientErrorTelemetry('app-error', error);
  }, [error]);

  return (
    <StateSurface
      eyebrow="runtime error"
      title="sploot borked."
      description="the crash report got logged. retry the route, or head back to the front door."
      primaryAction={{ label: 'try again', onClick: reset }}
      secondaryAction={{ href: '/', label: 'open sploot', variant: 'ghost' }}
      doodle="skull"
      detail={error.digest ? <span>error id: <code>{error.digest}</code></span> : null}
      status={[
        { label: 'boundary', value: 'root' },
        { label: 'telemetry', value: 'logged', ok: true },
        { label: 'recovery', value: 'retry' },
      ]}
    />
  );
}
