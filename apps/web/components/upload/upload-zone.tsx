'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOffline } from '@/hooks/use-offline';
import { useUploadQueue } from '@/hooks/use-upload-queue';
import { useFileValidation } from '@/hooks/use-file-validation';
import { UploadErrorDisplay } from '@/components/upload/upload-error-display';
import { getUploadErrorDetails, UploadErrorDetails } from '@/lib/upload-errors';
import { EmbeddingStatusIndicator } from '@/components/upload/embedding-status-indicator';
import { UploadDropZone } from '@/components/upload/upload-drop-zone';
import { UploadFileList } from '@/components/upload/upload-file-list';
import { getUploadQueueManager, useUploadRecovery } from '@/lib/upload-queue';
import { showToast } from '@/components/ui/toast';
import type { ProgressStats } from './upload-progress-header';
import { FileStreamProcessor } from '@/lib/file-stream-processor';
import { logger } from '@/lib/logger';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UPLOAD, prepareImageForUpload } from '@sploot/common';

// Lightweight metadata for display - only ~300 bytes per file vs 5MB for File object
interface FileMetadata {
  id: string;
  name: string; // max 255 bytes
  size: number; // 8 bytes
  status: 'pending' | 'uploading' | 'success' | 'error' | 'queued' | 'duplicate'; // 1 byte enum
  progress: number; // 4 bytes
  error?: string;
  errorDetails?: UploadErrorDetails;
  assetId?: string;
  blobUrl?: string;
  isDuplicate?: boolean;
  needsEmbedding?: boolean;
  embeddingStatus?: 'pending' | 'processing' | 'ready' | 'failed';
  embeddingError?: string;
  retryCount?: number;
  addedAt: number; // timestamp for sorting
}

// Legacy interface for backward compatibility during migration
interface UploadFile extends FileMetadata {
  file: File;
}

interface UploadZoneProps {
  /**
   * Callback when uploads complete successfully
   */
  onUploadComplete?: (stats: {
    uploaded: number;
    duplicates: number;
    failed: number;
  }) => void;

  /**
   * Whether the upload zone is being used on the dashboard
   * When true, removes redundant "view in library" button
   * @default false
   */
  isOnDashboard?: boolean;
}

export function UploadZone({
  onUploadComplete,
  isOnDashboard = false
}: UploadZoneProps) {
  // Use Map for O(1) lookups and minimal memory footprint (~300 bytes per file vs 5MB)
  const [fileMetadata, setFileMetadata] = useState(() => new Map<string, FileMetadata>());
  // Keep ref in sync with state to avoid closure issues in async functions
  const fileMetadataRef = useRef(fileMetadata);
  // Store File objects temporarily only during active upload
  const fileObjects = useRef(new Map<string, File>());
  const [isCancelling, setIsCancelling] = useState(false);
  const [showRecoveryNotification, setShowRecoveryNotification] = useState(false);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const [uploadStats, setUploadStats] = useState<ProgressStats | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparingFileCount, setPreparingFileCount] = useState(0);
  const [preparingTotalSize, setPreparingTotalSize] = useState(0);
  const activeUploadsRef = useRef<Set<string>>(new Set());
  const uploadStatsRef = useRef({ successful: 0, failed: 0 });
  const [currentConcurrency, setCurrentConcurrency] = useState(6);
  const { isOffline } = useOffline();
  const router = useRouter();
  const uploadQueueManager = getUploadQueueManager();
  const { validateFile, ALLOWED_FILE_TYPES } = useFileValidation();

  const getMultipartSizeError = useCallback((file: File) =>
    `too chunky for upload: ${file.name}. tried shrinking it, still over ${(UPLOAD.multipartSafeSize / 1024 / 1024).toFixed(0)}mb.`,
  []);

  const prepareFile = useCallback(async (file: File): Promise<{ file: File; error: string | null }> => {
    try {
      const prepared = await prepareImageForUpload(file);
      const validationError = validateFile(prepared.file);

      if (validationError) {
        return { file: prepared.file, error: validationError };
      }

      if (prepared.file.size > UPLOAD.multipartSafeSize) {
        return {
          file: prepared.file,
          error: getMultipartSizeError(file),
        };
      }

      return { file: prepared.file, error: null };
    } catch (error) {
      logger.warn('[UploadZone] Image preparation failed', {
        filename: file.name,
        error: error instanceof Error ? error.message : String(error),
      });

      const validationError = validateFile(file);
      return {
        file,
        error: validationError || (file.size > UPLOAD.multipartSafeSize ? getMultipartSizeError(file) : null),
      };
    }
  }, [getMultipartSizeError, validateFile]);

  // Progress throttling to reduce re-renders
  const progressThrottleMap = useRef<Map<string, { lastUpdate: number; lastPercent: number }>>(new Map());
  const PROGRESS_UPDATE_THRESHOLD = 10; // Only update if progress changed by 10%
  const PROGRESS_UPDATE_INTERVAL = 500; // Or if 500ms have passed

  // Convert fileMetadata Map to array for easier iteration
  const filesArray = useMemo(() =>
    Array.from(fileMetadata.values()).sort((a, b) => a.addedAt - b.addedAt),
    [fileMetadata]
  );

  // Initialize IndexedDB on mount
  useEffect(() => {
    uploadQueueManager.init().catch((error) => {
      console.error('[UploadZone] Failed to initialize upload queue manager:', error);
    });
  }, [uploadQueueManager]);

  // Track when all uploads complete
  useEffect(() => {
    if (!onUploadComplete) return;

    const filesArray = Array.from(fileMetadata.values());
    const hasActiveUploads = filesArray.some(file =>
      file.status === 'uploading' || file.status === 'pending' || file.status === 'queued'
    );

    const successfulUploads = filesArray.filter(file => file.status === 'success');
    const duplicates = filesArray.filter(file => file.status === 'duplicate');
    const failed = filesArray.filter(file => file.status === 'error');

    // Trigger callback when all uploads are done and we have at least one file
    if (filesArray.length > 0 && !hasActiveUploads && (successfulUploads.length > 0 || duplicates.length > 0)) {
      // Only trigger once when uploads complete
      const stats = {
        uploaded: successfulUploads.length,
        duplicates: duplicates.length,
        failed: failed.length
      };

      // Small delay to ensure UI updates first
      setTimeout(() => {
        onUploadComplete(stats);
      }, 100);
    }
  }, [fileMetadata, onUploadComplete]);

  // Keep ref in sync with state to avoid stale closures in async retry logic
  useEffect(() => {
    fileMetadataRef.current = fileMetadata;
  }, [fileMetadata]);

  // Update upload stats whenever files change - single source of truth
  useEffect(() => {
    const filesArray = Array.from(fileMetadata.values());
    if (filesArray.length === 0) {
      setUploadStats(null);
      return;
    }

    const uploading = filesArray.filter(f => f.status === 'uploading').length;
    const successful = filesArray.filter(f => f.status === 'success' || f.status === 'duplicate').length;
    const failed = filesArray.filter(f => f.status === 'error').length;
    const pending = filesArray.filter(f => f.status === 'pending' || f.status === 'queued').length;

    // Files that are uploaded but still processing embeddings
    const processingEmbeddings = filesArray.filter(f =>
      (f.status === 'success' || f.status === 'duplicate') &&
      f.needsEmbedding &&
      (f.embeddingStatus === 'pending' || f.embeddingStatus === 'processing')
    ).length;

    // Files that are completely ready (uploaded + embeddings done or not needed)
    const ready = filesArray.filter(f =>
      (f.status === 'success' || f.status === 'duplicate') &&
      (!f.needsEmbedding || f.embeddingStatus === 'ready')
    ).length;

    // Check if all processing is complete
    const allComplete = successful + failed === filesArray.length;
    const allReady = ready + failed === filesArray.length;

    setUploadStats({
      totalFiles: filesArray.length,
      uploaded: successful,
      processingEmbeddings,
      ready,
      failed,
      estimatedTimeRemaining: pending > 0 || uploading > 0 ? (pending + uploading) * 2000 : 0 // Rough estimate
    });

    // Auto-clear stats and file list 3 seconds after everything is complete
    if (allReady && filesArray.length > 0) {
      const clearTimer = setTimeout(() => {
        // Only clear if still all complete (no new files added)
        const currentFiles = Array.from(fileMetadata.values());
        const stillAllReady = currentFiles.every(f =>
          f.status === 'error' ||
          ((f.status === 'success' || f.status === 'duplicate') &&
           (!f.needsEmbedding || f.embeddingStatus === 'ready'))
        );

        if (stillAllReady && currentFiles.length === filesArray.length) {
          // Clear the upload stats
          setUploadStats(null);

          // Show success notification
          const successCount = currentFiles.filter(f => f.status === 'success' || f.status === 'duplicate').length;
          if (successCount > 0) {
            showToast(
              `✓ ${successCount} ${successCount === 1 ? 'file' : 'files'} uploaded successfully`,
              'success'
            );
          }

          // Clear the file list to reset upload zone
          setFileMetadata(new Map());
          fileObjects.current.clear();
        }
      }, 3000); // Clear after 3 seconds

      return () => clearTimeout(clearTimer);
    }
  }, [fileMetadata]);

  // Auto-remove failed uploads after 3 seconds with fade-out animation and toast
  useEffect(() => {
    const failedFiles = Array.from(fileMetadata.entries()).filter(
      ([_, file]) => file.status === 'error'
    );

    if (failedFiles.length === 0) return;

    const timers: NodeJS.Timeout[] = [];

    failedFiles.forEach(([fileId, file]) => {
      // Wait 3 seconds, then remove the failed file
      const timer = setTimeout(() => {
        // Show toast notification
        const errorMsg = file.error?.includes('timeout')
          ? 'Upload timed out'
          : file.error?.includes('too large')
          ? 'File too large'
          : 'Upload failed';

        showToast(`${file.name}: ${errorMsg}`, 'error');

        // Remove from state (will trigger fade-out via React transition)
        setFileMetadata((prev) => {
          const newMap = new Map(prev);
          newMap.delete(fileId);
          return newMap;
        });

        // Clean up File object reference
        fileObjects.current.delete(fileId);
      }, 3000);

      timers.push(timer);
    });

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [fileMetadata]);

  // Regular upload queue (localStorage-based)
  const { addToQueue } = useUploadQueue();

  const uploadFileToServer = useCallback(async (fileId: string) => {
    const uploadStartTime = Date.now();

    // Get file metadata and File object (use ref to avoid stale closure)
    const metadata = fileMetadataRef.current.get(fileId);
    const file = fileObjects.current.get(fileId);

    if (!metadata || !file) {
      throw new Error(`File ${fileId} not found`);
    }

    // Record upload start in metrics

    setFileMetadata((prev) => {
      const newMap = new Map(prev);
      const meta = newMap.get(fileId);
      if (meta) {
        newMap.set(fileId, { ...meta, status: 'uploading', progress: 10 });
      }
      return newMap;
    });

    const apiStartTime = performance.now(); // Define here so it's accessible in catch block

    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);

      // Track upload progress with XMLHttpRequest for better progress reporting
      const xhr = new XMLHttpRequest();

      // Create a promise to handle the XHR request
      const uploadPromise = new Promise<any>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);

            // Record upload progress in metrics

            // Throttle progress updates to reduce re-renders
            const throttleInfo = progressThrottleMap.current.get(fileId) || {
              lastUpdate: 0,
              lastPercent: 0
            };
            const now = Date.now();
            const percentDiff = Math.abs(percentComplete - throttleInfo.lastPercent);
            const timeDiff = now - throttleInfo.lastUpdate;

            // Only update if: progress changed significantly OR enough time passed OR it's complete
            if (percentDiff >= PROGRESS_UPDATE_THRESHOLD ||
                timeDiff >= PROGRESS_UPDATE_INTERVAL ||
                percentComplete >= 90) {
              setFileMetadata((prev) => {
                const newMap = new Map(prev);
                const meta = newMap.get(fileId);
                if (meta) {
                  newMap.set(fileId, { ...meta, progress: Math.min(90, percentComplete) });
                }
                return newMap;
              });

              // Update throttle map
              progressThrottleMap.current.set(fileId, {
                lastUpdate: now,
                lastPercent: percentComplete
              });
            }
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch {
              reject(new Error('Invalid response from server'));
            }
          } else {
            // Create error with status code included
            let errorMessage: string;
            try {
              const error = JSON.parse(xhr.responseText);
              errorMessage = error.error || `Upload failed with status ${xhr.status}`;
            } catch {
              errorMessage = `Upload failed with status ${xhr.status}`;
            }

            // Include status code in error for better error handling
            const uploadError = new Error(errorMessage);
            (uploadError as any).statusCode = xhr.status;
            reject(uploadError);
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload cancelled'));
        });

        xhr.addEventListener('timeout', () => {
          reject(new Error('Upload timeout - file too large or slow connection'));
        });

        // Upload without blocking on embedding generation for faster response
        xhr.open('POST', '/api/upload');
        xhr.timeout = 10000; // 10 second timeout per file
        xhr.send(formData);
      });

      const result = await uploadPromise;
      const apiDuration = performance.now() - apiStartTime;

      // Record API call metrics

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      // Track client upload time

      // Record successful upload completion in metrics

      // End the initial upload start timer if this is the first successful upload

      // Handle duplicate detection as a special success case
      const isDuplicate = result.isDuplicate === true;
      const needsEmbedding = result.asset?.needsEmbedding === true;

      // Track time to searchable if embedding is not needed
      if (!needsEmbedding && result.asset?.id) {
      }

      setFileMetadata((prev) => {
        const newMap = new Map(prev);
        const meta = newMap.get(fileId);
        if (meta) {
          newMap.set(fileId, {
            ...meta,
            status: (isDuplicate ? 'duplicate' : 'success') as 'duplicate' | 'success',
            progress: 100,
            assetId: result.asset?.id,
            blobUrl: result.asset?.blobUrl,
            isDuplicate,
            needsEmbedding,
            embeddingStatus: (needsEmbedding ? 'pending' : 'ready') as 'pending' | 'ready'
          });
        }
        return newMap;
      });

      // Clear the File object reference to free memory after successful upload
      fileObjects.current.delete(fileId);

      // Track success for adaptive concurrency
      uploadStatsRef.current.successful++;

      // Clean up progress throttle map entry
      progressThrottleMap.current.delete(fileId);

      // Log memory cleanup for monitoring during development
      logger.debug(`[UploadZone] Cleared file blob for ${metadata.name}, kept metadata only`);

      // Remove from persisted queue on success
      if ((metadata as any).persistedId) {
        try {
          await uploadQueueManager.removeUpload((metadata as any).persistedId);
        } catch (err) {
          console.error('[UploadZone] Failed to remove persisted upload:', err);
        }
      }

      // Stats will be automatically updated by the effect that watches fileMetadata changes
      // No need to manually update uploadStats here

      // Trigger a refresh of the asset list if there's a callback
      if (window.location.pathname === '/app') {
        // Dispatch a custom event that the library page can listen to
        window.dispatchEvent(new CustomEvent('assetUploaded', { detail: result.asset }));
      }

    } catch (error) {
      console.error('Upload error:', error);

      // Record upload failure in metrics

      // Parse error for better messaging with status code
      const statusCode = (error as any)?.statusCode ||
        (error instanceof Error && error.message.includes('401') ? 401 :
         error instanceof Error && error.message.includes('429') ? 429 :
         error instanceof Error && error.message.includes('500') ? 500 :
         error instanceof Error && error.message.includes('503') ? 503 : undefined);

      // Record API error if we have a status code
      if (statusCode) {
        const apiDuration = performance.now() - apiStartTime;
      }

      const errorDetails = getUploadErrorDetails(
        error instanceof Error ? error : new Error('Upload failed'),
        statusCode,
        (error as any)?.code
      );

      setFileMetadata((prev) => {
        const newMap = new Map(prev);
        const meta = newMap.get(fileId);
        if (meta) {
          newMap.set(fileId, {
            ...meta,
            status: 'error' as const,
            progress: 0,
            error: error instanceof Error ? error.message : 'Upload failed',
            errorDetails,
          });
        }
        return newMap;
      });

      // Track failure for adaptive concurrency
      uploadStatsRef.current.failed++;

      // Clean up progress throttle map entry on error
      progressThrottleMap.current.delete(fileId);

      // Stats will be automatically updated by the effect that watches fileMetadata changes

      // NOTE: We don't clear file reference on failure as it may be needed for retries

      // Update persisted status to failed
      if ((metadata as any).persistedId) {
        try {
          await uploadQueueManager.updateUploadStatus(
            (metadata as any).persistedId,
            'failed',
            error instanceof Error ? error.message : 'Upload failed'
          );
        } catch (err) {
          console.error('[UploadZone] Failed to update persisted status:', err);
        }
      }
    } finally {
      // Remove from active uploads
      activeUploadsRef.current.delete(fileId);
    }
  }, [uploadQueueManager, setFileMetadata]);

  const processRetryQueue = useCallback(async (retryFileIds: string[]) => {
    const backoffDelays = [1000, 3000, 9000]; // 1s, 3s, 9s

    for (const fileId of retryFileIds) {
      // Use ref to get current metadata, avoiding stale closures
      const metadata = fileMetadataRef.current.get(fileId);

      // Guard: Skip if metadata is missing (file was removed or reference lost)
      if (!metadata) {
        logger.warn(`[Upload] Skipping retry for ${fileId} - metadata not found`);
        continue;
      }

      const retryCount = metadata.retryCount || 1;
      const delay = backoffDelays[retryCount - 1] || 9000;

      logger.debug(`[Upload] Retrying ${metadata.name} after ${delay}ms delay (attempt ${retryCount}/3)`);

      // Wait for backoff delay
      await new Promise(resolve => setTimeout(resolve, delay));

      // Update file status to indicate retry
      setFileMetadata((prev) => {
        const newMap = new Map(prev);
        const meta = newMap.get(fileId);
        if (meta) {
          newMap.set(fileId, { ...meta, status: 'pending', error: `Retrying (attempt ${retryCount}/3)...` });
        }
        return newMap;
      });

      try {
        await uploadFileToServer(fileId);
        uploadStatsRef.current.successful++;
        logger.debug(`[Upload] Retry successful for ${metadata.name}`);
      } catch (error) {
        // Re-check metadata exists before retry logic (may have been removed)
        const currentMeta = fileMetadataRef.current.get(fileId);
        if (!currentMeta) {
          logger.warn(`[Upload] File ${fileId} metadata lost during retry, marking as failed`);
          uploadStatsRef.current.failed++;
          continue;
        }

        if (retryCount < 3) {
          // Still have retries left, update retry count and recurse
          setFileMetadata(prev => {
            const newMap = new Map(prev);
            const meta = newMap.get(fileId);
            if (meta) {
              newMap.set(fileId, { ...meta, retryCount: retryCount + 1 });
            }
            return newMap;
          });
          // Recursively retry (will use updated metadata from ref)
          await processRetryQueue([fileId]);
        } else {
          // Max retries reached
          uploadStatsRef.current.failed++;
          console.error(`[Upload] File ${metadata.name} failed permanently after 3 retries:`, error);
          // Clean up file object to prevent memory leak
          fileObjects.current.delete(fileId);
          progressThrottleMap.current.delete(fileId);
        }
      }
    }
  }, [uploadFileToServer, setFileMetadata]);

  // Batch upload files with adaptive concurrency control
  const BASE_CONCURRENT_UPLOADS = 6;
  const MIN_CONCURRENT_UPLOADS = 2;
  const MAX_CONCURRENT_UPLOADS = 8;

  const uploadBatch = useCallback(async (fileIds: string[]) => {
    // Reset stats for this batch
    uploadStatsRef.current = { successful: 0, failed: 0 };

    logger.debug(`[Upload] Starting batch upload of ${fileIds.length} files with concurrency: ${currentConcurrency}`);

    // Create chunks for parallel processing with concurrency limit
    const uploadQueue = [...fileIds];
    const activeUploads = new Set<Promise<void>>();
    const retryQueue: string[] = [];

    while (uploadQueue.length > 0 || activeUploads.size > 0) {
      // Adaptive concurrency: adjust based on failure rate
      const { successful, failed } = uploadStatsRef.current;
      const total = successful + failed;
      if (total > 0 && total % 10 === 0) { // Check every 10 uploads
        const failureRate = failed / total;
        if (failureRate > 0.2 && currentConcurrency > MIN_CONCURRENT_UPLOADS) {
          // Too many failures, reduce concurrency
          const newConcurrency = Math.max(MIN_CONCURRENT_UPLOADS, currentConcurrency - 1);
          setCurrentConcurrency(newConcurrency);
          logger.debug(`[Upload] High failure rate ${(failureRate * 100).toFixed(0)}%, reducing concurrency to ${newConcurrency}`);
        } else if (failureRate < 0.05 && currentConcurrency < MAX_CONCURRENT_UPLOADS) {
          // Very few failures, increase concurrency
          const newConcurrency = Math.min(MAX_CONCURRENT_UPLOADS, currentConcurrency + 1);
          setCurrentConcurrency(newConcurrency);
          logger.debug(`[Upload] Low failure rate ${(failureRate * 100).toFixed(0)}%, increasing concurrency to ${newConcurrency}`);
        }
      }

      // Start new uploads up to current concurrency limit
      while (uploadQueue.length > 0 && activeUploads.size < currentConcurrency) {
        const fileId = uploadQueue.shift()!;
        const uploadPromise = uploadFileToServer(fileId).then(() => {
          uploadStatsRef.current.successful++;
          activeUploads.delete(uploadPromise);
        }).catch((error) => {
          // Track retry count (use ref to avoid stale closure)
          const metadata = fileMetadataRef.current.get(fileId);
          const retryCount = (metadata?.retryCount || 0);

          if (retryCount < 3) {
            // Add to retry queue if under max retries
            setFileMetadata(prev => {
              const newMap = new Map(prev);
              const meta = newMap.get(fileId);
              if (meta) {
                newMap.set(fileId, { ...meta, retryCount: retryCount + 1 });
              }
              return newMap;
            });
            retryQueue.push(fileId);
            logger.debug(`[Upload] File ${metadata?.name} added to retry queue (attempt ${retryCount + 1}/3)`);
          } else {
            // Max retries reached, mark as permanently failed
            uploadStatsRef.current.failed++;
            console.error(`[Upload] File ${metadata?.name} failed after 3 retries:`, error);
          }
          activeUploads.delete(uploadPromise);
        });
        activeUploads.add(uploadPromise);
      }

      // Wait for at least one upload to complete before continuing
      if (activeUploads.size > 0) {
        await Promise.race(activeUploads);
      }
    }

    // Process retry queue with exponential backoff
    if (retryQueue.length > 0) {
      logger.debug(`[Upload] Processing retry queue with ${retryQueue.length} files`);
      await processRetryQueue(retryQueue);
    }
  }, [currentConcurrency, setCurrentConcurrency, uploadFileToServer, processRetryQueue, setFileMetadata]);

  // Process files for upload with streaming generator pattern
  const processFilesWithQueue = useCallback(async (fileList: FileList | File[]) => {
    // Show preparing state immediately
    const fileCount = fileList instanceof FileList ? fileList.length : fileList.length;
    setIsPreparing(true);
    setPreparingFileCount(fileCount);

    // Estimate total size without converting to array
    let totalSize = 0;
    for (let i = 0; i < fileCount; i++) {
      const file = fileList instanceof FileList ? fileList[i] : fileList[i];
      totalSize += file.size;
    }
    setPreparingTotalSize(totalSize);

    const newFiles: FileMetadata[] = [];
    const uploadQueueManager = getUploadQueueManager();

    // Create FileStreamProcessor for memory-efficient processing
    const processor = new FileStreamProcessor({
      chunkSize: 5 * 1024 * 1024, // 5MB chunks
      maxMemory: 100 * 1024 * 1024, // 100MB max
      computeChecksum: false, // Skip checksum for now, just process metadata
      onProgress: (fileName, progress) => {
        // Update progress for individual file if needed
        logger.debug(`Processing ${fileName}: ${Math.round(progress)}%`);
      },
      onError: (fileName, error) => {
        console.error(`Error processing ${fileName}:`, error);
      }
    });

    // Convert File[] to FileList-like structure if needed
    let fileListToProcess: FileList;
    if (fileList instanceof FileList) {
      fileListToProcess = fileList;
    } else {
      // Create a FileList-like object from array
      const dataTransfer = new DataTransfer();
      for (const file of fileList) {
        dataTransfer.items.add(file);
      }
      fileListToProcess = dataTransfer.files;
    }

    // Process files one at a time using async generator
    let processedCount = 0;
    try {
      for await (const processed of processor.processFiles(fileListToProcess)) {
        processedCount++;

        // Recreate file from processed chunks if needed
        const file = FileStreamProcessor.createBlobFromChunks(
          processed.chunks,
          'application/octet-stream'
        ) as File;

        // Get the original file for metadata
        const originalFile = fileListToProcess[processedCount - 1];
        const prepared = await prepareFile(originalFile);
        const uploadFile = prepared.file;
        const error = prepared.error;

      // If offline, queue the file instead of uploading
      if (isOffline && !error) {
        const queueItem = addToQueue(uploadFile);
        const metadata: FileMetadata = {
          id: queueItem.id,
          name: uploadFile.name,
          size: uploadFile.size,
          status: 'queued',
          progress: 0,
          error: undefined,
          addedAt: Date.now()
        };
        newFiles.push(metadata);
        fileObjects.current.set(queueItem.id, uploadFile);

        // Also persist to IndexedDB for recovery
        try {
          await uploadQueueManager.addUpload(uploadFile);
        } catch (err) {
          console.error('[UploadZone] Failed to persist upload:', err);
        }
      } else {
        const id = `${Date.now()}-${Math.random()}`;
        const metadata: FileMetadata = {
          id,
          name: uploadFile.name,
          size: uploadFile.size,
          status: error ? 'error' : 'pending',
          progress: 0,
          error: error || undefined,
          addedAt: Date.now()
        };
        newFiles.push(metadata);
        fileObjects.current.set(id, uploadFile);

        // Persist pending uploads to IndexedDB
        if (!error && metadata.status === 'pending') {
          try {
            const persistedId = await uploadQueueManager.addUpload(uploadFile);
            // Store the persisted ID for later removal
            (metadata as any).persistedId = persistedId;
          } catch (err) {
            console.error('[UploadZone] Failed to persist upload:', err);
          }
        }
      }

      // Release memory for processed chunks
      processor.releaseMemory(processed.size);

      // Update fileMetadata state in batches to avoid too many re-renders
      if (processedCount % 10 === 0 || processedCount === fileCount) {
        setFileMetadata((prev) => {
          const newMap = new Map(prev);
          newFiles.slice(prev.size).forEach(metadata => {
            newMap.set(metadata.id, metadata);
          });
          return newMap;
        });

        // Allow UI to breathe
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    } catch (error) {
      console.error('[UploadZone] Error processing files:', error);

      // Show error to user
      showToast(
        'Failed to process files. Please try again.',
        'error'
      );

      // Ensure we clear the preparing state on error
      setIsPreparing(false);
      setPreparingFileCount(0);
      setPreparingTotalSize(0);

      // Still try to process any files we did manage to handle
      if (newFiles.length > 0) {
        setFileMetadata((prev) => {
          const newMap = new Map(prev);
          newFiles.forEach(metadata => {
            newMap.set(metadata.id, metadata);
          });
          return newMap;
        });
      }

      return; // Exit early on error
    }

    // Final update with any remaining files
    if (newFiles.length > 0) {
      setFileMetadata((prev) => {
        const newMap = new Map(prev);
        const existingCount = prev.size;
        if (existingCount < newFiles.length) {
          newFiles.slice(existingCount).forEach(metadata => {
            newMap.set(metadata.id, metadata);
          });
        }
        return newMap;
      });

      // Stats will be automatically updated by the effect that watches fileMetadata changes
    }

    // End file selection tracking and start upload tracking

    // Clear preparing state before starting uploads
    setIsPreparing(false);
    setPreparingFileCount(0);
    setPreparingTotalSize(0);

    // Get final processor stats for debugging
    const stats = processor.getStats();
    logger.debug('[FileStreamProcessor] Stats:', {
      filesProcessed: stats.filesProcessed,
      bytesProcessed: stats.bytesProcessed,
      peakMemoryUsage: Math.round(stats.peakMemoryUsage / 1024 / 1024) + 'MB',
      errors: stats.errors
    });

    // Start uploading valid files if online with parallel batching
    if (!isOffline) {
      const filesToUpload = newFiles.filter((f) => f.status === 'pending').map(f => f.id);
      if (filesToUpload.length > 0) {
        uploadBatch(filesToUpload);
      }
    }
  }, [isOffline, addToQueue, prepareFile, uploadBatch]);

  const processFiles = processFilesWithQueue;

  // Check for interrupted uploads on mount
  useUploadRecovery(
    async (recoveredFiles) => {
      logger.debug(`[UploadZone] Recovering ${recoveredFiles.length} interrupted uploads`);
      setRecoveryCount(recoveredFiles.length);
      setShowRecoveryNotification(true);

      // Process recovered files
      await processFiles(recoveredFiles);

      // Show success toast
      showToast(
        `✓ Resuming ${recoveredFiles.length} interrupted ${recoveredFiles.length === 1 ? 'upload' : 'uploads'}`,
        'success'
      );

      // Hide notification after 3 seconds
      setTimeout(() => {
        setShowRecoveryNotification(false);
      }, 3000);
    },
    {
      autoResumeDelay: 3000,
      maxRetries: 3,
    }
  );



  // Remove file from list
  const removeFile = (id: string) => {
    setFileMetadata((prev) => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
    fileObjects.current.delete(id);
    progressThrottleMap.current.delete(id);
  };

  // Retry failed upload
  const retryUpload = (metadata: FileMetadata) => {
    // Find the original File object from the fileObjects Map
    const originalFile = fileObjects.current.get(metadata.id);
    if (!originalFile) {
      console.error('Cannot retry upload: original file not found');
      return;
    }

    setFileMetadata((prev) => {
      const newMap = new Map(prev);
      const meta = newMap.get(metadata.id);
      if (meta) {
        newMap.set(metadata.id, {
          ...meta,
          status: 'pending' as const,
          progress: 0,
          error: undefined,
          errorDetails: undefined,
          retryCount: 0
        });
      }
      return newMap;
    });
    uploadFileToServer(metadata.id);
  };

  // Retry all failed uploads
  const retryAllFailed = () => {
    const failedFiles = filesArray.filter(f => f.status === 'error');
    if (failedFiles.length === 0) return;

    logger.debug(`[Upload] Retrying all ${failedFiles.length} failed files`);

    // Reset all failed files to pending status
    const failedFileIds = failedFiles.map(f => f.id);

    // Update state to reset failed files
    setFileMetadata((prev) => {
      const newMap = new Map(prev);
      failedFileIds.forEach(id => {
        const meta = newMap.get(id);
        if (meta) {
          newMap.set(id, {
            ...meta,
            status: 'pending' as const,
            progress: 0,
            error: undefined,
            errorDetails: undefined,
            retryCount: 0
          });
        }
      });
      return newMap;
    });

    // Re-queue all failed files for upload
    uploadBatch(failedFileIds);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Calculate overall progress
  const calculateOverallProgress = () => {
    if (filesArray.length === 0) return 0;

    const totalProgress = filesArray.reduce((acc, file) => {
      if (file.status === 'success' || file.status === 'duplicate') {
        return acc + 100;
      } else if (file.status === 'uploading') {
        return acc + file.progress;
      } else if (file.status === 'error') {
        return acc + 0;
      } else {
        return acc + 0; // pending/queued
      }
    }, 0);

    return Math.round(totalProgress / filesArray.length);
  };

  // Get upload statistics
  const getUploadStats = () => {
    const completed = filesArray.filter(f => f.status === 'success' || f.status === 'duplicate').length;
    const uploading = filesArray.filter(f => f.status === 'uploading').length;
    const pending = filesArray.filter(f => f.status === 'pending' || f.status === 'queued').length;
    const failed = filesArray.filter(f => f.status === 'error').length;

    return { completed, uploading, pending, failed, total: filesArray.length };
  };

  // Get errors grouped by type
  const getGroupedErrors = () => {
    const failedFiles = filesArray.filter(f => f.status === 'error' && f.errorDetails);
    const groups = new Map<string, { type: string; message: string; count: number; files: FileMetadata[] }>();

    failedFiles.forEach(file => {
      if (file.errorDetails) {
        const key = file.errorDetails.type;
        if (!groups.has(key)) {
          groups.set(key, {
            type: file.errorDetails.type,
            message: file.errorDetails.userMessage,
            count: 0,
            files: []
          });
        }
        const group = groups.get(key)!;
        group.count++;
        group.files.push(file);
      }
    });

    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  };

  // Cancel remaining uploads
  const cancelRemainingUploads = () => {
    setIsCancelling(true);

    // Remove pending files
    setFileMetadata((prev) => {
      const newMap = new Map(prev);
      Array.from(newMap.entries()).forEach(([id, meta]) => {
        if (meta.status === 'pending' || meta.status === 'queued') {
          newMap.delete(id);
          fileObjects.current.delete(id);
        }
      });
      return newMap;
    });

    // Clear active uploads tracking
    activeUploadsRef.current.clear();

    setTimeout(() => setIsCancelling(false), 500);
  };

  const successfulUploads = filesArray.filter((file) => file.status === 'success' || file.status === 'duplicate');
  const hasSuccessfulUploads = successfulUploads.length > 0;
  const hasActiveUploads = filesArray.some((file) =>
    file.status === 'uploading' || file.status === 'pending' || file.status === 'queued'
  );

  const handleViewLibrary = () => {
    setFileMetadata(new Map());
    fileObjects.current.clear();
    setUploadStats(null);
    router.push('/app');
  };

  return (
    <div className="w-full">
      {/* Recovery notification */}
      {showRecoveryNotification && (
        <Alert className="mb-4 animate-in fade-in duration-200">
          <Loader2 className="size-4 animate-spin" />
          <AlertDescription>
            Resuming {recoveryCount} interrupted {recoveryCount === 1 ? 'upload' : 'uploads'}...
          </AlertDescription>
        </Alert>
      )}

      {/* Drop Zone */}
      <UploadDropZone
        onFilesAdded={(files) => processFiles(files)}
        allowedFileTypes={ALLOWED_FILE_TYPES}
        isPreparing={isPreparing}
        preparingFileCount={preparingFileCount}
        preparingTotalSize={preparingTotalSize}
      />

      {/* File list */}
      {filesArray.length > 0 && (
        <div className="mt-6 space-y-4">
          {/* Batch Upload Progress Header */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-medium text-sm">Upload Progress</h3>
                  <p className="text-muted-foreground text-xs mt-1">
                    {(() => {
                      const stats = getUploadStats();
                      const parts = [];
                      if (stats.completed > 0) parts.push(`${stats.completed} completed`);
                      if (stats.uploading > 0) parts.push(`${stats.uploading} uploading`);
                      if (stats.pending > 0) parts.push(`${stats.pending} pending`);
                      if (stats.failed > 0) parts.push(`${stats.failed} failed`);
                      return parts.join(' • ') || 'No files';
                    })()}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Retry all failed button */}
                  {getUploadStats().failed > 0 && (
                    <Button
                      onClick={retryAllFailed}
                      size="sm"
                      variant="ghost"
                    >
                      Retry {getUploadStats().failed} Failed
                    </Button>
                  )}

                  {/* Cancel button */}
                  {hasActiveUploads && (
                    <Button
                      onClick={cancelRemainingUploads}
                      disabled={isCancelling}
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                    >
                      {isCancelling ? 'Cancelling...' : 'Cancel Remaining'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Overall progress bar */}
              <div className="space-y-2">
                <Progress value={calculateOverallProgress()} className="h-2" />
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    {getUploadStats().completed} of {filesArray.length} files
                  </span>
                  <span className="text-primary font-medium">
                    {calculateOverallProgress()}%
                  </span>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-4 gap-2 mt-3">
                <div className="text-center">
                  <p className="text-green-500 text-lg font-semibold">{getUploadStats().completed}</p>
                  <p className="text-muted-foreground text-xs">Complete</p>
                </div>
                <div className="text-center">
                  <p className="text-primary text-lg font-semibold">{getUploadStats().uploading}</p>
                  <p className="text-muted-foreground text-xs">Uploading</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-lg font-semibold">{getUploadStats().pending}</p>
                  <p className="text-muted-foreground text-xs">Pending</p>
                </div>
                <div className="text-center">
                  <p className="text-destructive text-lg font-semibold">{getUploadStats().failed}</p>
                  <p className="text-muted-foreground text-xs">Failed</p>
                </div>
              </div>

              {/* Error summary by type - show when errors exist */}
              {getUploadStats().failed > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-muted-foreground text-xs font-medium mb-2">Error Details:</p>
                  <div className="space-y-1">
                    {getGroupedErrors().map((group) => (
                      <div key={group.type} className="flex items-center justify-between text-xs">
                        <span className="text-destructive">
                          {group.count} {group.count === 1 ? 'file' : 'files'}: {group.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* File list */}
          <UploadFileList
            files={fileMetadata}
            onFileUpdate={(id, updates) => {
              setFileMetadata(prev => {
                const updated = new Map(prev);
                const metadata = updated.get(id);
                if (metadata) {
                  updated.set(id, { ...metadata, ...updates });
                }
                return updated;
              });
            }}
            formatFileSize={formatFileSize}
            onRetry={retryUpload}
            onRemove={removeFile}
          />

          {hasSuccessfulUploads && (
            <Card>
              <CardContent className="py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center bg-green-500/10 text-green-500 rounded-lg">
                      <CheckCircle2 className="size-5" />
                    </div>
                    <div>
                      {(() => {
                        const newImages = successfulUploads.filter(f => !f.isDuplicate).length;
                        const duplicates = successfulUploads.filter(f => f.isDuplicate).length;

                        let message = '';
                        if (newImages > 0 && duplicates > 0) {
                          message = `${newImages} ${newImages === 1 ? 'image' : 'images'} added, ${duplicates} already existed`;
                        } else if (newImages > 0) {
                          message = `${newImages} ${newImages === 1 ? 'image' : 'images'} added to your library`;
                        } else if (duplicates > 0) {
                          message = `${duplicates} ${duplicates === 1 ? 'image' : 'images'} already in your library`;
                        }

                        return (
                          <>
                            <p className="text-sm font-medium">{message}</p>
                            {hasActiveUploads ? (
                              <p className="text-xs text-muted-foreground">Finishing remaining uploads...</p>
                            ) : isOnDashboard ? (
                              <p className="text-xs text-muted-foreground">Your library will refresh automatically.</p>
                            ) : (
                              <p className="text-xs text-muted-foreground">Jump back to browse everything in your collection.</p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {!isOnDashboard && (
                    <Button
                      onClick={handleViewLibrary}
                      disabled={hasActiveUploads}
                    >
                      View in Library
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
