'use client';

import { ReactNode } from 'react';
import { UploadQueueDisplay } from './upload-queue-display';
import { useUploadQueue } from '@/hooks/use-upload-queue';

interface OfflineProviderProps {
  children: ReactNode;
}

export function OfflineProvider({ children }: OfflineProviderProps) {
  const { queue, removeFromQueue, updateQueueItem, processQueue } = useUploadQueue({ autoProcess: true });

  const handleRetry = (id: string) => {
    updateQueueItem(id, { status: 'queued', retryCount: 0 });
    void processQueue();
  };

  return (
    <>
      {children}
      <UploadQueueDisplay
        queue={queue}
        onRemove={removeFromQueue}
        onRetry={handleRetry}
      />
    </>
  );
}
