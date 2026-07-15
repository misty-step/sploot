'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUploadQueue, type UploadQueueEvent } from '@/hooks/use-upload-queue';
import { useOptionalAuthUser } from '@/lib/auth/client';
import { useFileValidation } from '@/hooks/use-file-validation';
import { BulkImportLimitError, extractImageUrls, extractZipImages, isTextBundleFile, isZipFile, MAX_TEXT_BUNDLE_BYTES } from '@/lib/upload/bulk-import';
import { UploadErrorDisplay } from '@/components/upload/upload-error-display';
import { getStructuredUploadErrorDetails, getUploadStatusCodeFromMessage, UploadErrorDetails } from '@/lib/upload-errors';
import { EmbeddingStatusIndicator } from '@/components/upload/embedding-status-indicator';
import { UploadBatchProgressCard } from '@/components/upload/upload-batch-progress-card';
import { UploadDropZone } from '@/components/upload/upload-drop-zone';
import { UploadFileList } from '@/components/upload/upload-file-list';
import { useUploadCompletion } from '@/components/upload/use-upload-completion';
import { showToast } from '@/components/ui/toast';
import type { ProgressStats } from './upload-progress-header';
import { logger } from '@/lib/logger';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StickerTab } from '@/components/sploot';
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
  nearDuplicate?: {
    id: string;
    distance: number;
    blobUrl?: string;
    thumbnailUrl?: string | null;
  } | null;
  needsEmbedding?: boolean;
  embeddingStatus?: 'pending' | 'processing' | 'ready' | 'failed';
  embeddingError?: string;
  retryCount?: number;
  persistedId?: string;
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
  onUploadComplete?: (stats: { uploaded: number; duplicates: number; failed: number }) => void;

  /**
   * Whether the upload zone is being used on the dashboard
   * When true, removes redundant "view in library" button
   * @default false
   */
  isOnDashboard?: boolean;
}

export function UploadZone({ onUploadComplete, isOnDashboard = false }: UploadZoneProps) {
  // Use Map for O(1) lookups and minimal memory footprint (~300 bytes per file vs 5MB)
  const [fileMetadata, setFileMetadata] = useState(() => new Map<string, FileMetadata>());
  // Keep ref in sync with state to avoid closure issues in async functions
  const fileMetadataRef = useRef(fileMetadata);
  const { user } = useOptionalAuthUser();
  const previousAuthUserId = useRef<string | undefined>(user?.id);
  const [isCancelling, setIsCancelling] = useState(false);
  const [uploadStats, setUploadStats] = useState<ProgressStats | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparingFileCount, setPreparingFileCount] = useState(0);
  const [preparingTotalSize, setPreparingTotalSize] = useState(0);

  useEffect(() => {
    if (previousAuthUserId.current === user?.id) return;
    previousAuthUserId.current = user?.id;
    setFileMetadata(new Map());
    fileMetadataRef.current = new Map();
  }, [user?.id]);
  const router = useRouter();
  const { validateFile, allowedFileTypes } = useFileValidation();
  const hasExternalUploadCompletion = Boolean(onUploadComplete);

  const getMultipartSizeError = useCallback((file: File) => `too chunky for upload: ${file.name}. tried shrinking it, still over ${(UPLOAD.multipartSafeSize / 1024 / 1024).toFixed(0)}mb.`, []);

  const prepareFile = useCallback(
    async (file: File): Promise<{ file: File; error: string | null }> => {
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
    },
    [getMultipartSizeError, validateFile],
  );

  // Convert fileMetadata Map to array for easier iteration
  const filesArray = useMemo(() => Array.from(fileMetadata.values()).sort((a, b) => a.addedAt - b.addedAt), [fileMetadata]);

  useUploadCompletion(filesArray, onUploadComplete);

  // Keep ref in sync with state to avoid stale closures in async retry logic
  useEffect(() => {
    fileMetadataRef.current = fileMetadata;
  }, [fileMetadata]);

  // Update upload stats whenever files change - single source of truth
  useEffect(() => {
    const filesArray = Array.from(fileMetadata.values());
    if (filesArray.length === 0) {
      queueMicrotask(() => setUploadStats(null));
      return;
    }

    const uploading = filesArray.filter((f) => f.status === 'uploading').length;
    const successful = filesArray.filter((f) => f.status === 'success' || f.status === 'duplicate').length;
    const failed = filesArray.filter((f) => f.status === 'error').length;
    const pending = filesArray.filter((f) => f.status === 'pending' || f.status === 'queued').length;

    // Files that are uploaded but still processing embeddings
    const processingEmbeddings = filesArray.filter(
      (f) => (f.status === 'success' || f.status === 'duplicate') && f.needsEmbedding && (f.embeddingStatus === 'pending' || f.embeddingStatus === 'processing'),
    ).length;

    // Files that are completely ready (uploaded + embeddings done or not needed)
    const ready = filesArray.filter((f) => (f.status === 'success' || f.status === 'duplicate') && (!f.needsEmbedding || f.embeddingStatus === 'ready')).length;

    const allReady = ready + failed === filesArray.length;

    const nextUploadStats = {
      totalFiles: filesArray.length,
      uploaded: successful,
      processingEmbeddings,
      ready,
      failed,
      estimatedTimeRemaining: pending > 0 || uploading > 0 ? (pending + uploading) * 2000 : 0, // Rough estimate
    };

    queueMicrotask(() => setUploadStats(nextUploadStats));

    // Auto-clear stats and file list 3 seconds after everything is complete
    if (allReady && filesArray.length > 0) {
      const clearTimer = setTimeout(() => {
        // Only clear if still all complete (no new files added)
        const currentFiles = Array.from(fileMetadata.values());
        const stillAllReady = currentFiles.every((f) => f.status === 'error' || ((f.status === 'success' || f.status === 'duplicate') && (!f.needsEmbedding || f.embeddingStatus === 'ready')));

        if (stillAllReady && currentFiles.length === filesArray.length) {
          // Clear the upload stats
          setUploadStats(null);

          // Show success notification
          const successCount = currentFiles.filter((f) => f.status === 'success' || f.status === 'duplicate').length;
          if (successCount > 0 && !hasExternalUploadCompletion) {
            showToast(`✓ ${successCount} ${successCount === 1 ? 'file' : 'files'} uploaded successfully`, 'success');
          }

          // Clear the file list to reset upload zone
          setFileMetadata(new Map());
        }
      }, 3000); // Clear after 3 seconds

      return () => clearTimeout(clearTimer);
    }
  }, [fileMetadata, hasExternalUploadCompletion]);

  // Auto-remove failed uploads after 3 seconds with fade-out animation and toast
  useEffect(() => {
    const failedFiles = Array.from(fileMetadata.entries()).filter(([_, file]) => file.status === 'error');

    if (failedFiles.length === 0) return;

    const timers: NodeJS.Timeout[] = [];

    failedFiles.forEach(([fileId, file]) => {
      // Wait 3 seconds, then remove the failed file
      const timer = setTimeout(() => {
        // Show toast notification
        const errorMsg = file.error?.includes('timeout') ? 'Upload timed out' : file.error?.includes('too large') ? 'File too large' : 'Upload failed';

        showToast(`${file.name}: ${errorMsg}`, 'error');

        // Remove from state (will trigger fade-out via React transition)
        setFileMetadata((prev) => {
          const newMap = new Map(prev);
          newMap.delete(fileId);
          return newMap;
        });
      }, 3000);

      timers.push(timer);
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [fileMetadata]);

  const handleQueueEvent = useCallback((event: UploadQueueEvent) => {
    setFileMetadata((previous) => {
      const metadata = previous.get(event.id);
      if (!metadata) return previous;
      const next = new Map(previous);
      if (event.status === 'queued') {
        next.set(event.id, {
          ...metadata,
          status: 'queued',
          progress: 0,
          error: undefined,
          errorDetails: undefined,
          retryCount: 0,
        });
      } else if (event.status === 'uploading') {
        next.set(event.id, {
          ...metadata,
          status: 'uploading',
          progress: event.progress ?? metadata.progress,
        });
      } else if (event.status === 'success') {
        const isDuplicate = event.result.isDuplicate === true;
        const needsEmbedding = event.result.asset?.needsEmbedding === true;
        next.set(event.id, {
          ...metadata,
          status: isDuplicate ? 'duplicate' : 'success',
          progress: 100,
          assetId: event.result.asset?.id,
          blobUrl: event.result.asset?.blobUrl,
          isDuplicate,
          nearDuplicate: event.result.asset?.nearDuplicate
            ? {
                id: event.result.asset.nearDuplicate.id,
                distance: event.result.asset.nearDuplicate.distance,
                blobUrl: event.result.asset.nearDuplicate.blobUrl,
                thumbnailUrl: event.result.asset.nearDuplicate.thumbnailUrl ?? null,
              }
            : null,
          needsEmbedding,
          embeddingStatus: needsEmbedding ? 'pending' : 'ready',
        });
        if (window.location.pathname === '/app') {
          window.dispatchEvent(new CustomEvent('assetUploaded', { detail: event.result.asset }));
        }
      } else {
        const error = event.error;
        next.set(event.id, {
          ...metadata,
          status: 'error',
          progress: 0,
          error,
          errorDetails: getStructuredUploadErrorDetails({
            error: new Error(error),
            statusCode: getUploadStatusCodeFromMessage(error),
          }),
        });
      }
      return next;
    });
  }, []);

  // Every upload intent enters the durable queue; this is the only network coordinator.
  const { assertCanEnqueue, addToQueue, addUrlToQueue, processQueue, retryUpload: retryQueuedUpload, removeFromQueue, isReady: isUploadQueueReady } = useUploadQueue({ onEvent: handleQueueEvent });

  const enqueueUrl = useCallback(async (url: string) => {
    const queueItem = await addUrlToQueue(url);
    const metadata: FileMetadata = {
      id: queueItem.id,
      persistedId: queueItem.id,
      name: url,
      size: 0,
      status: 'queued',
      progress: 0,
      addedAt: Date.now(),
    };
    setFileMetadata((previous) => new Map(previous).set(metadata.id, metadata));
    fileMetadataRef.current.set(metadata.id, metadata);
    return metadata;
  }, [addUrlToQueue]);

  // Queue processing owns network execution, retries, receipt idempotency, and completion fencing.
  // Prepare metadata, durably enqueue, then ask the single coordinator to process it.
  const processFilesWithQueue = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      setIsPreparing(true);
      setPreparingFileCount(files.length);
      setPreparingTotalSize(files.reduce((total, file) => total + file.size, 0));
      const newFiles: FileMetadata[] = [];

      for (const [index, originalFile] of files.entries()) {
        const earlyValidationError = validateFile(originalFile);
        if (earlyValidationError) {
          const rejected: FileMetadata = {
            id: `rejected-${Date.now()}-${index}`,
            name: originalFile.name,
            size: originalFile.size,
            status: 'error',
            progress: 0,
            error: earlyValidationError,
            addedAt: Date.now(),
          };
          newFiles.push(rejected);
          setFileMetadata((previous) => new Map(previous).set(rejected.id, rejected));
          fileMetadataRef.current.set(rejected.id, rejected);
          continue;
        }

        try {
          await assertCanEnqueue(originalFile);
        } catch (enqueueError) {
          const message = enqueueError instanceof Error ? enqueueError.message : 'Durable upload enqueue failed.';
          const rejected: FileMetadata = {
            id: `enqueue-failed-${Date.now()}-${index}`,
            name: originalFile.name,
            size: originalFile.size,
            status: 'error',
            progress: 0,
            error: message,
            addedAt: Date.now(),
          };
          newFiles.push(rejected);
          setFileMetadata((previous) => new Map(previous).set(rejected.id, rejected));
          fileMetadataRef.current.set(rejected.id, rejected);
          showToast(`${originalFile.name}: ${message}`, 'error');
          continue;
        }

        const prepared = await prepareFile(originalFile);
        if (prepared.error) {
          const rejected: FileMetadata = {
            id: `rejected-${Date.now()}-${index}`,
            name: prepared.file.name,
            size: prepared.file.size,
            status: 'error',
            progress: 0,
            error: prepared.error,
            addedAt: Date.now(),
          };
          newFiles.push(rejected);
          setFileMetadata((previous) => new Map(previous).set(rejected.id, rejected));
          fileMetadataRef.current.set(rejected.id, rejected);
          continue;
        }

        try {
          const queueItem = await addToQueue(prepared.file);
          const metadata: FileMetadata = {
            id: queueItem.id,
            persistedId: queueItem.id,
            name: prepared.file.name,
            size: prepared.file.size,
            status: 'queued',
            progress: 0,
            addedAt: Date.now(),
          };
          newFiles.push(metadata);
          setFileMetadata((previous) => new Map(previous).set(metadata.id, metadata));
          fileMetadataRef.current.set(metadata.id, metadata);
        } catch (enqueueError) {
          const message = enqueueError instanceof Error ? enqueueError.message : 'Durable upload enqueue failed.';
          const rejected: FileMetadata = {
            id: `enqueue-failed-${Date.now()}-${index}`,
            name: prepared.file.name,
            size: prepared.file.size,
            status: 'error',
            progress: 0,
            error: message,
            addedAt: Date.now(),
          };
          newFiles.push(rejected);
          setFileMetadata((previous) => new Map(previous).set(rejected.id, rejected));
          fileMetadataRef.current.set(rejected.id, rejected);
          showToast(`${prepared.file.name}: ${message}`, 'error');
        }
      }

      setIsPreparing(false);
      setPreparingFileCount(0);
      setPreparingTotalSize(0);
      if (newFiles.some((file) => file.persistedId)) void processQueue();
    },
    [addToQueue, assertCanEnqueue, prepareFile, processQueue, validateFile],
  );

  // Batch URL import for bundle files (bookmark exports etc.): small
  // worker pool against /api/upload/url, one summary toast at the end.
  const importUrls = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return;
      showToast(`importing ${urls.length} url${urls.length === 1 ? '' : 's'}...`, 'info');
      let failed = 0;
      for (const url of urls) {
        try {
          await enqueueUrl(url);
        } catch {
          failed++;
        }
      }
      if (urls.length > failed) void processQueue();
      showToast(`url import: ${urls.length - failed} queued · ${failed} failed`, failed > 0 ? 'error' : 'success', 5000);
    },
    [enqueueUrl, processQueue],
  );

  // Expand bundles (zips, bookmark exports) before the normal pipeline:
  // zip entries become regular Files; text bundles become URL imports.
  const processFiles = useCallback(
    async (incoming: File[]) => {
      const direct: File[] = [];
      for (const file of incoming) {
        if (isZipFile(file)) {
          try {
            const images = await extractZipImages(file);
            showToast(`unpacked ${images.length} image${images.length === 1 ? '' : 's'} from ${file.name}`, images.length > 0 ? 'info' : 'error');
            direct.push(...images);
          } catch (error) {
            showToast(error instanceof Error ? error.message : `couldn't unpack ${file.name}`, 'error');
          }
        } else if (isTextBundleFile(file)) {
          try {
            if (file.size > MAX_TEXT_BUNDLE_BYTES) throw new BulkImportLimitError('Bookmark export exceeds the text safety bound.');
            const urls = extractImageUrls(await file.text());
            if (urls.length === 0) {
              showToast(`no image urls found in ${file.name}`, 'info');
            } else {
              void importUrls(urls);
            }
          } catch (error) {
            showToast(error instanceof Error ? error.message : `couldn't read ${file.name}`, 'error');
          }
        } else {
          direct.push(file);
        }
      }
      if (direct.length > 0) {
        await processFilesWithQueue(direct);
      }
    },
    [processFilesWithQueue, importUrls],
  );

  // Pasted URLs use the same durable coordinator and receipt key as files.
  const importFromUrl = useCallback(
    async (url: string) => {
      showToast('queueing url import...', 'info');
      try {
        await enqueueUrl(url);
        void processQueue();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'url import failed', 'error');
      }
    },
    [enqueueUrl, processQueue],
  );

  // Remove file from list
  const removeFile = (id: string) => {
    const metadata = fileMetadataRef.current.get(id);
    if (!metadata?.persistedId) {
      setFileMetadata((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    void removeFromQueue(metadata.persistedId).then((removed) => {
      if (!removed) return;
      setFileMetadata((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    });
  };

  // Retry failed upload
  const retryUpload = (metadata: FileMetadata) => {
    if (!metadata.persistedId) {
      showToast(`${metadata.name}: select the file again to retry`, 'error');
      return;
    }

    void retryQueuedUpload(metadata.persistedId).catch((error) => {
      showToast(error instanceof Error ? error.message : 'upload retry failed', 'error');
    });
  };

  // Retry all failed uploads
  const retryAllFailed = () => {
    const failedFiles = filesArray.filter((f) => f.status === 'error');
    if (failedFiles.length === 0) return;

    logger.debug(`[Upload] Retrying all ${failedFiles.length} failed files`);

    // Re-queue all durable failed files through the same coordinator.
    failedFiles
      .filter((file): file is FileMetadata & { persistedId: string } => Boolean(file.persistedId))
      .forEach((file) => {
        void retryQueuedUpload(file.persistedId).catch((error) => {
          showToast(error instanceof Error ? error.message : 'upload retry failed', 'error');
        });
      });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Cancel remaining uploads
  const cancelRemainingUploads = () => {
    setIsCancelling(true);

    const pending = Array.from(fileMetadataRef.current.values()).filter((file) => file.status === 'pending' || file.status === 'queued');
    pending.forEach((file) => {
      if (!file.persistedId) {
        setFileMetadata((previous) => {
          const next = new Map(previous);
          next.delete(file.id);
          return next;
        });
        return;
      }
      void removeFromQueue(file.persistedId).then((removed) => {
        if (!removed) return;
        setFileMetadata((previous) => {
          const next = new Map(previous);
          next.delete(file.id);
          return next;
        });
      });
    });

    setTimeout(() => setIsCancelling(false), 500);
  };

  const successfulUploads = filesArray.filter((file) => file.status === 'success' || file.status === 'duplicate');
  const hasSuccessfulUploads = successfulUploads.length > 0;
  const hasActiveUploads = filesArray.some((file) => file.status === 'uploading' || file.status === 'pending' || file.status === 'queued');

  const handleViewLibrary = () => {
    setFileMetadata(new Map());
    setUploadStats(null);
    router.push('/app');
  };

  // "the queue" state summary — mono, right-aligned, only the nonzero buckets.
  const queuedCount = uploadStats ? Math.max(0, uploadStats.totalFiles - uploadStats.uploaded - uploadStats.failed) : 0;
  const queueSummary = uploadStats
    ? [
        uploadStats.ready > 0 ? `${uploadStats.ready} in the pile` : null,
        uploadStats.processingEmbeddings > 0 ? `${uploadStats.processingEmbeddings} cooking` : null,
        queuedCount > 0 ? `${queuedCount} queued` : null,
        uploadStats.failed > 0 ? `${uploadStats.failed} failed` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="w-full space-y-5">
      <div className="space-y-1.5">
        <StickerTab tone="violet">upload</StickerTab>
        <h1 className="font-display text-4xl leading-[0.95] text-foreground sm:text-5xl">
          feed <em className="not-italic text-sploot-magenta">the pile</em>
        </h1>
      </div>

      {/* Drop Zone */}
      <UploadDropZone
        onFilesAdded={(files) => processFiles(files)}
        onUrlPasted={importFromUrl}
        allowedFileTypes={[...allowedFileTypes, '.zip', '.json', '.csv', '.txt']}
        isPreparing={isPreparing}
        preparingFileCount={preparingFileCount}
        preparingTotalSize={preparingTotalSize}
        isReady={isUploadQueueReady}
      />

      {/* File list */}
      {filesArray.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl tracking-wide text-foreground">the queue</h2>
            {queueSummary && <span className="font-mono text-xs lowercase text-muted-foreground">{queueSummary}</span>}
          </div>

          {/* Batch Upload Progress Header */}
          <UploadBatchProgressCard
            files={filesArray}
            hasActiveUploads={hasActiveUploads}
            isCancelling={isCancelling}
            onRetryAllFailed={retryAllFailed}
            onCancelRemainingUploads={cancelRemainingUploads}
          />

          {/* File list */}
          <UploadFileList
            files={fileMetadata}
            onFileUpdate={(id, updates) => {
              setFileMetadata((prev) => {
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
                    <div className="flex size-10 items-center justify-center bg-sploot-lime/10 text-sploot-lime rounded-lg">
                      <CheckCircle2 className="size-5" />
                    </div>
                    <div>
                      {(() => {
                        const newImages = successfulUploads.filter((f) => !f.isDuplicate).length;
                        const duplicates = successfulUploads.filter((f) => f.isDuplicate).length;

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
                    <Button onClick={handleViewLibrary} disabled={hasActiveUploads}>
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
