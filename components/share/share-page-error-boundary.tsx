'use client';

import { Component, ReactNode } from 'react';
import Link from 'next/link';
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
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
          <div className="max-w-md text-center space-y-6">
            {/* Error icon - terminal style */}
            <div className="flex justify-center">
              <div className="w-16 h-16 border-2 border-red-500 rounded-full flex items-center justify-center">
                <span className="text-red-500 text-3xl font-bold">!</span>
              </div>
            </div>

            {/* Error message */}
            <div className="space-y-2">
              <h1 className="text-white text-2xl font-medium">
                Couldn't load this meme
              </h1>
              <p className="text-gray-400 text-sm">
                The image failed to load. It may have been removed or the link is invalid.
              </p>
            </div>

            {/* CTA - Explore Sploot */}
            <div className="pt-4">
              <Link
                href="/"
                className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
              >
                Explore Sploot
              </Link>
            </div>

            {/* Secondary link - monospace terminal style */}
            <div className="pt-2">
              <Link
                href="/"
                className="text-xs text-gray-500 hover:text-gray-400 font-jetbrains-mono"
              >
                sploot.vercel.app
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
