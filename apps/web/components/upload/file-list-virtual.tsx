'use client';

import { useRef, useMemo, useCallback, useLayoutEffect, CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileMetadata } from '@/lib/file-metadata-manager';
import { EmbeddingStatusIndicator } from './embedding-status-indicator';
import { UploadErrorDisplay } from './upload-error-display';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface FileListVirtualProps {
  fileMetadata: Map<string, FileMetadata>;
  setFileMetadata: React.Dispatch<React.SetStateAction<Map<string, FileMetadata>>>;
  formatFileSize: (bytes: number) => string;
  retryUpload: (metadata: FileMetadata) => void;
  removeFile: (id: string) => void;
}

interface FileRowProps {
  file: FileMetadata;
  style: CSSProperties;
  formatFileSize: (bytes: number) => string;
  onStatusChange: (status: 'pending' | 'processing' | 'ready' | 'failed', error?: string) => void;
  onRetry: () => void;
  onRemove: () => void;
  onViewDuplicate?: () => void;
  measureElement: (element: HTMLDivElement | null) => void;
}

/**
 * Individual file row component with dynamic height measurement
 */
function FileRow({
  file,
  style,
  formatFileSize,
  onStatusChange,
  onRetry,
  onRemove,
  onViewDuplicate,
  measureElement
}: FileRowProps) {
  // Dynamic height based on content
  const hasError = file.status === 'error' && file.errorDetails;
  const baseHeight = 64; // Base height in pixels
  const errorHeight = hasError ? 80 : 0; // Extra height for error display

  return (
    <div
      ref={measureElement}
      style={style}
      className="px-2"
      data-index={style.top}
    >
      <Card
        className={cn(
          "p-3 flex items-center transition-all",
          hasError && "border-destructive/30"
        )}
        style={{ minHeight: `${baseHeight + errorHeight}px` }}
      >
        <div className="flex items-center gap-3 w-full">
          {/* File icon/preview */}
          <div className="w-12 h-12 bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 rounded">
            {file.blobUrl ? (
              <Image
                src={file.blobUrl}
                alt={file.name}
                width={48}
                height={48}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl">🖼️</span>
            )}
          </div>

          {/* File info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {file.name}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatFileSize(file.size)}
            </p>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {file.status === 'uploading' && (
              <div className="flex items-center gap-2">
                <Progress value={file.progress} className="w-24 h-1" />
                <Badge variant="default" className="gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  {file.progress}%
                </Badge>
              </div>
            )}

            {file.status === 'queued' && (
              <Badge variant="outline">Queued</Badge>
            )}

            {file.status === 'success' && (
              <EmbeddingStatusIndicator
                file={file}
                onStatusChange={onStatusChange}
              />
            )}

            {file.status === 'duplicate' && (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="secondary" className="text-yellow-500">Already exists</Badge>
                {file.needsEmbedding ? (
                  <Badge variant="default" className="gap-1">
                    <Loader2 className="size-3 animate-spin" />
                    Indexing
                  </Badge>
                ) : (
                  <Button
                    onClick={onViewDuplicate}
                    size="sm"
                    variant="link"
                    className="h-auto p-0 underline"
                  >
                    view
                  </Button>
                )}
              </div>
            )}

            {hasError && (
              <UploadErrorDisplay
                error={file.errorDetails}
                fileId={file.id}
                fileName={file.name}
                onRetry={onRetry}
                onDismiss={onRemove}
              />
            )}

            {file.status === 'pending' && (
              <Badge variant="outline">Waiting...</Badge>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * Virtual file list component with dynamic row heights
 * Efficiently renders 10,000+ files at 60fps
 */
export function FileListVirtual({
  fileMetadata,
  setFileMetadata,
  formatFileSize,
  retryUpload,
  removeFile
}: FileListVirtualProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Convert Map to sorted array for virtualization
  const filesArray = useMemo(() => {
    return Array.from(fileMetadata.values()).sort((a, b) => a.addedAt - b.addedAt);
  }, [fileMetadata]);

  // Dynamic size estimation based on file status
  const estimateSize = useCallback((index: number) => {
    const file = filesArray[index];
    if (!file) return 64; // Default height

    // Add extra height for error states
    if (file.status === 'error' && file.errorDetails) {
      return 144; // Base + error display
    }

    return 64; // Base height
  }, [filesArray]);

  // Initialize virtualizer with dynamic sizing
  const virtualizer = useVirtualizer({
    count: filesArray.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 5, // Render 5 extra items for smooth scrolling
    measureElement: (element) => {
      // Measure actual element height for accurate virtualization
      if (element) {
        return element.getBoundingClientRect().height;
      }
      return 64;
    }
  });

  // Handle status updates
  const handleStatusChange = useCallback((fileId: string, status: 'pending' | 'processing' | 'ready' | 'failed', error?: string) => {
    setFileMetadata(prev => {
      const updated = new Map(prev);
      const metadata = updated.get(fileId);
      if (metadata) {
        updated.set(fileId, {
          ...metadata,
          embeddingStatus: status,
          embeddingError: error
        });
      }
      return updated;
    });
  }, [setFileMetadata]);

  // Handle duplicate view navigation
  const handleViewDuplicate = useCallback((assetId: string) => {
    if (assetId) {
      router.push(`/app?highlight=${assetId}`);
    }
  }, [router]);

  // Performance optimization: measure once after mount
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [filesArray.length, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  // Show empty state
  if (filesArray.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        <p>No files uploaded yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div
        ref={parentRef}
        className="h-[400px] overflow-y-auto"
        style={{
          contain: 'strict', // CSS containment for better performance
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const file = filesArray[virtualItem.index];
            if (!file) return null;

            return (
              <FileRow
                key={file.id}
                file={file}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                formatFileSize={formatFileSize}
                onStatusChange={(status, error) => handleStatusChange(file.id, status, error)}
                onRetry={() => retryUpload(file)}
                onRemove={() => removeFile(file.id)}
                onViewDuplicate={() => handleViewDuplicate(file.assetId || '')}
                measureElement={virtualizer.measureElement}
              />
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

// Export for use in upload-zone
export default FileListVirtual;
