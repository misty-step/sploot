'use client';

import { QueuedUpload } from '@/hooks/use-upload-queue';

interface UploadQueueDisplayProps {
  queue: QueuedUpload[];
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
}

export function UploadQueueDisplay({ queue, onRemove, onRetry }: UploadQueueDisplayProps) {
  if (queue.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-6 md:right-auto md:w-96 z-40">
      <div className="bg-card border border-border p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-foreground font-semibold">
            Upload Queue ({queue.length})
          </h3>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-orange-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">Queued</span>
          </div>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {queue.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-2 bg-muted"
            >
              {/* File icon */}
              <div className="w-10 h-10 bg-border flex items-center justify-center flex-shrink-0">
                {item.status === 'uploading' ? (
                  <svg
                    className="w-5 h-5 text-primary animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : item.status === 'error' ? (
                  <svg
                    className="w-5 h-5 text-destructive"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ) : item.status === 'success' ? (
                  <svg
                    className="w-5 h-5 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-muted-foreground/80"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                )}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">
                  {item.file.name}
                </p>
                <p className="text-xs text-muted-foreground/80">
                  {(item.file.size / 1024 / 1024).toFixed(2)} MB
                  {item.status === 'error' && item.retryCount > 0 && (
                    <span className="ml-2 text-destructive">
                      (Retry {item.retryCount}/{3})
                    </span>
                  )}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {item.status === 'error' && onRetry && (
                  <button
                    onClick={() => onRetry(item.id)}
                    className="p-1.5 text-primary hover:bg-border transition-colors"
                    title="Retry upload"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </button>
                )}
                {item.status !== 'uploading' && (
                  <button
                    onClick={() => onRemove(item.id)}
                    className="p-1.5 text-muted-foreground/80 hover:text-destructive hover:bg-border transition-colors"
                    title="Remove from queue"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground/80">
            Uploads will resume automatically when you&apos;re back online
          </p>
        </div>
      </div>
    </div>
  );
}