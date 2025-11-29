'use client';

import { useBlobCircuitBreaker } from '@/contexts/blob-circuit-breaker-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw } from 'lucide-react';

export function BlobErrorBanner() {
  const { isOpen, timeUntilClose, reset } = useBlobCircuitBreaker();

  if (!isOpen) return null;

  const secondsRemaining = Math.ceil(timeUntilClose / 1000);

  return (
    <Alert
      variant="destructive"
      className="animate-in slide-in-from-top duration-300 rounded-none border-x-0 border-t-0 fixed top-0 left-0 right-0 z-50"
    >
      <AlertTriangle className="h-5 w-5 animate-pulse" />
      <AlertDescription className="flex items-center gap-3 w-full">
        <span className="flex-1 text-sm font-medium">
          <span className="font-semibold">Storage connection issue detected.</span>
          {' '}
          Retrying in {secondsRemaining}s...
        </span>

        {/* Manual retry button */}
        <Button
          type="button"
          onClick={reset}
          size="sm"
          variant="outline"
          className="gap-1.5 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/60"
          title="Reset circuit breaker and retry now"
        >
          <RotateCw className="size-3" />
          Retry Now
        </Button>
      </AlertDescription>
    </Alert>
  );
}
