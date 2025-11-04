'use client';

import { Component, type ReactNode } from 'react';
import type { Asset } from '@/lib/types';

interface Props {
  children: ReactNode;
  asset: Asset;
  onDelete?: (id: string) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

function sendErrorTelemetry(
  error: Error,
  errorInfo: React.ErrorInfo,
  asset: Asset
) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const payload = {
      type: 'error',
      payload: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        boundary: 'image-tile-error-boundary',
        url: window.location.href,
        timestamp: Date.now(),
        metadata: {
          assetId: asset.id,
          filename: asset.filename ?? asset.pathname,
        },
      },
    };

    const body = JSON.stringify(payload);

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/telemetry', blob);
    } else {
      void fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        /* ignore */
      });
    }
  } catch (telemetryError) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('[ImageTileErrorBoundary] Telemetry failed:', telemetryError);
    }
  }
}

/**
 * Error boundary for ImageTile component.
 * Catches blob load failures and renders a tombstone tile with retry button.
 */
export class ImageTileErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    sendErrorTelemetry(error, errorInfo, this.props.asset);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ImageTile error boundary caught:', error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  handleDelete = () => {
    const { onDelete, asset } = this.props;
    if (onDelete) {
      onDelete(asset.id);
    }
  };

  render() {
    if (this.state.hasError) {
      const { asset } = this.props;

      return (
        <div className="group relative bg-card overflow-hidden w-full aspect-square">
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 bg-card">
            {/* Tombstone icon */}
            <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-xs text-center">Failed to load</p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                title="Retry loading image"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Retry
              </button>

              {this.props.onDelete && (
                <button
                  type="button"
                  onClick={this.handleDelete}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                  title="Delete broken image"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Delete
                </button>
              )}
            </div>

            {/* Filename for context */}
            <p className="text-[10px] text-muted-foreground/40 text-center truncate max-w-full px-2">
              {asset.filename || asset.pathname?.split('/').pop() || 'Unnamed image'}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
