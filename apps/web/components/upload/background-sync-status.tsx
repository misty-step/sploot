'use client';

import { useEffect, useState } from 'react';
import { useBackgroundSync } from '@/hooks/use-background-sync';
import { cn } from '@/lib/utils';

export function BackgroundSyncStatus() {
  const {
    queue,
    supportsBackgroundSync,
    retryFailedUploads,
    clearCompleted,
    pendingCount,
    uploadingCount,
    errorCount,
  } = useBackgroundSync();

  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Show/hide based on queue status
  useEffect(() => {
    setIsVisible(queue.length > 0);
  }, [queue.length]);

  if (!supportsBackgroundSync || !isVisible) {
    return null;
  }

  const totalCount = queue.length;
  const completedCount = queue.filter((item) => item.status === 'success').length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      {/* Collapsed View */}
      <div
        className={cn(
          'bg-lab-surface border border-lab-border  shadow-xl transition-all duration-300',
          isExpanded ? 'w-96' : 'w-64'
        )}
      >
        {/* Header */}
        <div
          className="p-3 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg
                  className={cn(
                    'w-5 h-5',
                    uploadingCount > 0 ? 'text-blue-500 animate-pulse' : 'text-lab-text-secondary'
                  )}
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
                {uploadingCount > 0 && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 animate-pulse" />
                )}
              </div>
              <span className="text-sm font-medium text-lab-text">
                Background Uploads
              </span>
            </div>
            <svg
              className={cn(
                'w-4 h-4 text-lab-text-secondary transition-transform',
                isExpanded ? 'rotate-180' : ''
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>

          {/* Progress Bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-lab-text-secondary mb-1">
              <span>
                {completedCount} of {totalCount} completed
              </span>
              <span>{Math.round(progressPercentage)}%</span>
            </div>
            <div className="w-full h-1.5 bg-lab-surface-secondary overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  errorCount > 0 ? 'bg-red-500' : uploadingCount > 0 ? 'bg-blue-500' : 'bg-green-500'
                )}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Status Summary */}
          <div className="mt-2 flex items-center gap-3 text-xs">
            {pendingCount > 0 && (
              <span className="text-yellow-500">
                {pendingCount} pending
              </span>
            )}
            {uploadingCount > 0 && (
              <span className="text-blue-500">
                {uploadingCount} uploading
              </span>
            )}
            {errorCount > 0 && (
              <span className="text-red-500">
                {errorCount} failed
              </span>
            )}
            {completedCount > 0 && pendingCount === 0 && uploadingCount === 0 && errorCount === 0 && (
              <span className="text-green-500">
                All uploads complete
              </span>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t border-lab-border">
            {/* File List */}
            <div className="max-h-64 overflow-y-auto p-3 space-y-2">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 bg-lab-surface-secondary"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-lab-text truncate">
                      {item.fileName}
                    </p>
                    <p className="text-xs text-lab-text-secondary">
                      {(item.fileSize / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <div className="ml-2">
                    {item.status === 'queued' && (
                      <span className="text-xs text-yellow-500">Queued</span>
                    )}
                    {item.status === 'uploading' && (
                      <span className="text-xs text-blue-500">Uploading...</span>
                    )}
                    {item.status === 'success' && (
                      <span className="text-xs text-green-500">✓</span>
                    )}
                    {item.status === 'error' && (
                      <span className="text-xs text-red-500">✗</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="p-3 border-t border-lab-border flex gap-2">
              {errorCount > 0 && (
                <button
                  onClick={retryFailedUploads}
                  className="flex-1 px-3 py-1.5 text-xs bg-lab-primary text-white hover:opacity-90 transition-opacity"
                >
                  Retry Failed ({errorCount})
                </button>
              )}
              {completedCount > 0 && (
                <button
                  onClick={clearCompleted}
                  className="flex-1 px-3 py-1.5 text-xs bg-lab-surface-secondary text-lab-text hover:opacity-90 transition-opacity"
                >
                  Clear Completed
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification for Completion */}
      {completedCount === totalCount && totalCount > 0 && (
        <div className="absolute top-0 left-0 right-0 -mt-12 bg-green-500 text-white px-3 py-2 shadow-lg animate-slideDown">
          <p className="text-xs font-medium">
            All uploads completed successfully!
          </p>
        </div>
      )}
    </div>
  );
}