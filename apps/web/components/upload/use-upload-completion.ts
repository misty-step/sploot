'use client';

import { useEffect, useRef } from 'react';

export type UploadCompletionStatus =
  | 'pending'
  | 'uploading'
  | 'success'
  | 'error'
  | 'queued'
  | 'duplicate';

export interface UploadCompletionFile {
  id: string;
  status: UploadCompletionStatus;
  assetId?: string;
}

export interface UploadCompletionStats {
  uploaded: number;
  duplicates: number;
  failed: number;
}

export type UploadCompletionCallback = (
  stats: UploadCompletionStats,
) => void;

export function useUploadCompletion(
  files: UploadCompletionFile[],
  onUploadComplete?: UploadCompletionCallback,
) {
  const latestOnUploadCompleteRef = useRef(onUploadComplete);
  const completedBatchNotificationRef = useRef<string | null>(null);

  useEffect(() => {
    latestOnUploadCompleteRef.current = onUploadComplete;
  }, [onUploadComplete]);

  useEffect(() => {
    if (files.length === 0) {
      completedBatchNotificationRef.current = null;
      return;
    }

    const onComplete = latestOnUploadCompleteRef.current;
    if (!onComplete) return;

    const hasActiveUploads = files.some(
      (file) =>
        file.status === 'uploading' ||
        file.status === 'pending' ||
        file.status === 'queued',
    );

    const successfulUploads = files.filter(
      (file) => file.status === 'success',
    );
    const duplicates = files.filter((file) => file.status === 'duplicate');
    const failed = files.filter((file) => file.status === 'error');

    if (
      hasActiveUploads ||
      (successfulUploads.length === 0 && duplicates.length === 0)
    ) {
      return;
    }

    const completionKey = files
      .map((file) => `${file.id}:${file.status}:${file.assetId ?? ''}`)
      .join('|');

    if (completedBatchNotificationRef.current === completionKey) return;
    completedBatchNotificationRef.current = completionKey;

    const stats = {
      uploaded: successfulUploads.length,
      duplicates: duplicates.length,
      failed: failed.length,
    };

    const timer = setTimeout(() => {
      latestOnUploadCompleteRef.current?.(stats);
    }, 100);

    return () => clearTimeout(timer);
  }, [files]);
}
