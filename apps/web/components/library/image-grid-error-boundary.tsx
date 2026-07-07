'use client';

import { ErrorBoundary } from '@/components/error-boundary';
import { StateSurface } from '@/components/sploot/state-surface';
import { ReactNode } from 'react';

interface ImageGridErrorBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
}

/**
 * Error boundary specifically for the ImageGrid component
 * Provides context-specific error messages and recovery options
 */
export function ImageGridErrorBoundary({
  children,
  onRetry
}: ImageGridErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <StateSurface
          size="panel"
          eyebrow="grid error"
          title="the pile didn't render."
          description={
            error.message.includes('network') || error.message.includes('fetch')
              ? 'the grid could not reach the library endpoint. check the connection and retry.'
              : error.message.includes('permission') || error.message.includes('auth')
                ? 'the grid could not prove this session can view the pile. sign in again if retrying misses.'
                : error.message.includes('timeout')
                  ? 'the library took too long to answer. retry the grid before refreshing the whole app.'
                  : 'the image grid hit an error boundary. retry the pile and keep the rest of the workbench intact.'
          }
          primaryAction={{
            label: 'retry grid',
            onClick: () => {
              reset();
              onRetry?.();
            },
          }}
          secondaryAction={{
            label: 'refresh page',
            onClick: () => window.location.reload(),
            variant: 'ghost',
          }}
          doodle="sob"
          status={[
            { label: 'boundary', value: 'image grid' },
            { label: 'asset view', value: 'blocked' },
            { label: 'recovery', value: 'retry', ok: true },
          ]}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
