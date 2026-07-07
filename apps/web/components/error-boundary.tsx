'use client';

import React, { Component, ReactNode } from 'react';
import { StateSurface } from '@/components/sploot/state-surface';
import { sendClientErrorTelemetry } from '@/lib/client-error-telemetry';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic error boundary component for catching React errors
 * Can be used with custom fallback UI or default error message
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    sendClientErrorTelemetry('global-error-boundary', error, { errorInfo });

    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught by boundary:', error, errorInfo);
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error!, this.reset);
      }

      return (
        <StateSurface
          size="panel"
          eyebrow="component error"
          title="panel fell over."
          description="this chunk of the pile hit an error boundary. retry the panel before refreshing the whole route."
          primaryAction={{ label: 'try again', onClick: this.reset }}
          doodle="skull"
          status={[
            { label: 'boundary', value: 'component' },
            { label: 'recovery', value: 'retry', ok: true },
          ]}
        />
      );
    }

    return this.props.children;
  }
}
