'use client';

import { Component, ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { sendClientErrorTelemetry } from '@/lib/client-error-telemetry';
import { SharePageMessage } from './share-page-message';

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
      // Renders inside SharePageLayout's <main> — no full-page wrapper here,
      // just the shared terminal-state panel (was previously duplicating a
      // whole min-h-screen shell nested inside the layout's own main).
      return (
        <SharePageMessage
          icon={ImageOff}
          heading="couldn't load this one."
          body="the image bailed mid-load — dead link, bad wifi, pick one. try again in a sec."
          ctaHref="/"
          ctaLabel="go touch grass"
        />
      );
    }

    return this.props.children;
  }
}
