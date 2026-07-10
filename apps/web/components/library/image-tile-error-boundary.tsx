'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCw, Trash2 } from 'lucide-react';
import { sendClientErrorTelemetry } from '@/lib/client-error-telemetry';
import { Button } from '@/components/ui/button';
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
    sendClientErrorTelemetry('image-tile-error-boundary', error, {
      errorInfo,
      metadata: {
        assetId: this.props.asset.id,
        filename: this.props.asset.filename ?? this.props.asset.pathname,
      },
    });

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
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink bg-sploot-panel p-4 text-sploot-ink sploot-shadow-sm">
          {/* Tombstone */}
          <div className="flex flex-col items-center gap-2">
            <AlertTriangle className="h-10 w-10 text-sploot-red" />
            <p className="font-mono text-xs lowercase">failed to load</p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={this.handleRetry}
              size="sm"
              variant="compact"
              title="Retry loading image"
            >
              <RotateCw className="h-3 w-3" />
              retry
            </Button>

            {this.props.onDelete && (
              <Button
                type="button"
                onClick={this.handleDelete}
                size="sm"
                variant="destructive"
                title="Delete broken image"
              >
                <Trash2 className="h-3 w-3" />
                delete
              </Button>
            )}
          </div>

          {/* Filename for context */}
          <p className="max-w-full truncate px-2 text-center font-mono text-[10px] text-muted-foreground">
            {asset.filename || asset.pathname?.split('/').pop() || 'Unnamed image'}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
