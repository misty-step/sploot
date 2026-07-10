'use client';

import { useBlobCircuitBreaker } from '@/contexts/blob-circuit-breaker-context';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw } from 'lucide-react';

export function BlobErrorBanner() {
  const { isOpen, timeUntilClose, reset } = useBlobCircuitBreaker();

  if (!isOpen) return null;

  const secondsRemaining = Math.ceil(timeUntilClose / 1000);

  return (
    <div
      role="alert"
      className="animate-in slide-in-from-top duration-300 fixed top-0 left-0 right-0 z-50 flex items-center gap-3 border-b-[3px] border-sploot-ink bg-sploot-red px-4 py-2.5 text-white"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 animate-pulse" />
      <span className="flex-1 font-sans text-sm">
        <span className="font-extrabold">storage connection issue detected.</span>{' '}
        retrying in {secondsRemaining}s...
      </span>

      <Button
        type="button"
        onClick={reset}
        size="sm"
        variant="ink"
        className="gap-1.5"
        title="Reset circuit breaker and retry now"
      >
        <RotateCw className="size-3" />
        retry now
      </Button>
    </div>
  );
}
