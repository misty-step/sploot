'use client';

import { useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmbeddingStatusIndicator } from '@/components/upload/embedding-status-indicator';
import { UploadErrorDisplay } from '@/components/upload/upload-error-display';
import { FileMetadata } from '@/lib/file-metadata-manager';

interface UploadFileListProps {
  /** File metadata map */
  files: Map<string, FileMetadata>;

  /** Callback to update file metadata (for embedding status changes) */
  onFileUpdate: (id: string, updates: Partial<FileMetadata>) => void;

  /** Format file size for display */
  formatFileSize: (bytes: number) => string;

  /** Retry failed upload */
  onRetry: (metadata: FileMetadata) => void;

  /** Remove file from list */
  onRemove: (id: string) => void;
}

/**
 * UploadFileList - Virtualized file list rendering for upload queue
 *
 * Encapsulates TanStack Virtual complexity:
 * - Virtualized rendering for 1000+ files at 60fps
 * - Fixed 64px item height for performance
 * - File status display (uploading, queued, success, error, duplicate)
 * - Embedding status integration
 * - Retry/remove actions
 *
 * Deep module: Hides virtualization complexity behind simple stateless interface
 */
export function UploadFileList({
  files,
  onFileUpdate,
  formatFileSize,
  onRetry,
  onRemove,
}: UploadFileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Convert Map values to array for virtualization and maintain order
  const filesArray = useMemo(() => {
    return Array.from(files.values()).sort((a, b) => a.addedAt - b.addedAt);
  }, [files]);

  const virtualizer = useVirtualizer({
    count: filesArray.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // Fixed height of 64px per file item as specified
    overscan: 5, // Render 5 extra items outside viewport for smooth scrolling
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="h-[400px] overflow-y-auto space-y-2"
      style={{
        contain: 'strict',
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
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <Card className="h-[60px] p-3 flex items-center rounded-md">
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
                        onStatusChange={(status, error) => {
                          onFileUpdate(file.id, {
                            embeddingStatus: status,
                            embeddingError: error
                          });
                        }}
                      />
                    )}

                    {file.status === 'duplicate' && (
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="text-yellow-500">Already exists</Badge>
                        {file.needsEmbedding ? (
                          <Badge variant="default" className="gap-1"><Loader2 className="size-3 animate-spin" />Indexing</Badge>
                        ) : (
                          <Button
                            onClick={() => {
                              if (file.assetId) {
                                router.push(`/app?highlight=${file.assetId}`);
                              }
                            }}
                            size="sm"
                            variant="link"
                            className="h-auto p-0 underline"
                          >
                            view
                          </Button>
                        )}
                      </div>
                    )}

                    {file.status === 'error' && file.errorDetails && (
                      <UploadErrorDisplay
                        error={file.errorDetails}
                        fileId={file.id}
                        fileName={file.name}
                        onRetry={() => onRetry(file)}
                        onDismiss={() => onRemove(file.id)}
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
        })}
      </div>
    </div>
  );
}
