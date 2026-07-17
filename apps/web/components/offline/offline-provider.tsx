'use client';

import { ReactNode } from 'react';
import { UploadQueueDisplay } from './upload-queue-display';
import { useUploadQueue } from '@/hooks/use-upload-queue';
import { error as logError } from '@/lib/logger';

interface OfflineProviderProps {
  children: ReactNode;
}

export function OfflineProvider({ children }: OfflineProviderProps) {
  const { queue, removeFromQueue, retryUpload } = useUploadQueue({ autoProcess: true });

  const handleRetry = (id: string) => {
    void retryUpload(id).catch((error) => logError('Error retrying upload:', error));
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
