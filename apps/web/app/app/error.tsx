'use client';

import { useEffect } from 'react';
import { StateSurface } from '@/components/sploot/state-surface';
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

  const message = error.message?.toLowerCase() ?? '';
  const isDatabaseError =
    message.includes('database') || message.includes('prisma') || message.includes('connection');
  const isAuthError =
    message.includes('auth') || message.includes('clerk') || message.includes('unauthorized');

  const title = isDatabaseError
    ? 'database jammed.'
    : isAuthError
      ? 'auth got wedged.'
      : 'app shell borked.';

  const description = isDatabaseError
    ? 'the pile cannot read storage right now. retry in a moment; your saved memes are still the source of truth.'
    : isAuthError
      ? 'your session did not clear the door. sign in again if retrying does not unlock it.'
      : 'the workbench hit an error boundary. the crash report got logged; retry the route or open the pile.';

  return (
    <StateSurface
      eyebrow="app error"
      title={title}
      description={description}
      primaryAction={{ label: 'try again', onClick: reset }}
      secondaryAction={{ href: '/app', label: 'open the pile', variant: 'ghost' }}
      doodle={isAuthError ? 'eyes' : 'skull'}
      detail={error.digest ? <span>error id: <code>{error.digest}</code></span> : null}
      status={[
        { label: 'boundary', value: 'app shell' },
        { label: 'type', value: isDatabaseError ? 'database' : isAuthError ? 'auth' : 'runtime' },
        { label: 'telemetry', value: 'logged', ok: true },
      ]}
    />
  );
}
