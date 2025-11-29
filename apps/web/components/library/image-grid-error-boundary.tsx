'use client';

import { ErrorBoundary } from '@/components/error-boundary';
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
        <div className="flex items-center justify-center min-h-[600px] p-8">
          <div className="text-center max-w-md">
            {/* Error Icon */}
            <div className="w-24 h-24 mx-auto mb-6 bg-muted flex items-center justify-center">
              <span className="text-4xl">⚠️</span>
            </div>

            {/* Error Title */}
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Unable to load your memes
            </h2>

            {/* Error Description */}
            <p className="text-muted-foreground text-sm mb-2">
              {error.message.includes('network') || error.message.includes('fetch')
                ? "There seems to be a connection issue. Please check your internet and try again."
                : error.message.includes('permission') || error.message.includes('auth')
                ? "You don't have permission to view this content. Try signing in again."
                : error.message.includes('timeout')
                ? "The request took too long. The server might be busy, please try again."
                : "Something unexpected happened while loading your images."}
            </p>

            {/* Technical Details (collapsible) */}
            <details className="mt-4 mb-6 text-left">
              <summary className="text-xs text-muted-foreground/80 cursor-pointer hover:text-muted-foreground transition-colors">
                Technical details
              </summary>
              <pre className="mt-2 p-3 bg-card text-xs text-muted-foreground/80 overflow-x-auto">
                {error.name}: {error.message}
                {error.stack && '\n\nStack trace:\n' + error.stack}
              </pre>
            </details>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  reset();
                  onRetry?.();
                }}
                className="px-6 py-2.5 bg-primary text-white text-sm font-medium hover:bg-primary/90 active:bg-primary/80 transition-all duration-200 flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Reload Images
              </button>

              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-muted text-muted-foreground text-sm font-medium border border-border hover:bg-muted/80 hover:text-foreground transition-all duration-200"
              >
                Refresh Page
              </button>
            </div>

            {/* Help Text */}
            <p className="mt-6 text-xs text-muted-foreground/80">
              If this problem persists, try clearing your browser cache or contact support.
            </p>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}