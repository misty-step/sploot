'use client';

import { Component, ReactNode } from 'react';
import { StateSurface } from '@/components/sploot/state-surface';
import { sendClientErrorTelemetry } from '@/lib/client-error-telemetry';

interface SharePageErrorBoundaryProps {
  children: ReactNode;
}

interface SharePageErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary for share page to handle image load failures gracefully.
 *
 * Catches errors during image rendering and displays a branded fallback UI
 * with minimal design aesthetic. Logs errors to console for debugging.
 */
export class SharePageErrorBoundary extends Component<
  SharePageErrorBoundaryProps,
  SharePageErrorBoundaryState
> {
  constructor(props: SharePageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): SharePageErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    sendClientErrorTelemetry('share-page-error-boundary', error, { errorInfo });

    // Log error details for debugging (structured format)
    console.error('[SharePageErrorBoundary] Error caught:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <StateSurface
          eyebrow="image failed"
          title="couldn't load this meme."
          description="the share page loaded, but the image file did not. open sploot or ask for a fresh share."
          primaryAction={{ href: '/', label: 'open sploot' }}
          secondaryAction={{ href: '/support', label: 'support', variant: 'ghost' }}
          doodle="skull"
          status={[
            { label: 'route', value: 'share page' },
            { label: 'asset', value: 'image miss' },
            { label: 'recovery', value: 'front door', ok: true },
          ]}
        />
      );
    }

    return this.props.children;
  }
}
