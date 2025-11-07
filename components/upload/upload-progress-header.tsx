'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react';
import { logger } from '@/lib/observability-logger';

export interface ProgressStats {
  totalFiles: number;
  uploaded: number;
  processingEmbeddings: number;
  ready: number;
  failed: number;
  estimatedTimeRemaining: number; // ms
}

interface UploadProgressHeaderProps {
  stats: ProgressStats;
  onMinimize?: () => void;
  onExpand?: () => void;
  isMinimized?: boolean;
  className?: string;
}

export function UploadProgressHeader({
  stats,
  onMinimize,
  onExpand,
  isMinimized = false,
  className,
}: UploadProgressHeaderProps) {
  const [isCollapsed, setIsCollapsed] = useState(isMinimized);
  const [animationProgress, setAnimationProgress] = useState(0);
  const operationTimesRef = useRef<number[]>([]);
  const lastUpdateTimeRef = useRef<number>(Date.now());

  // Calculate percentages
  const uploadProgress = stats.totalFiles > 0
    ? Math.round(((stats.uploaded + stats.failed) / stats.totalFiles) * 100)
    : 0;

  const embeddingProgress = stats.totalFiles > 0
    ? Math.round(((stats.ready + stats.failed) / stats.totalFiles) * 100)
    : 0;

  const overallProgress = stats.totalFiles > 0
    ? Math.round(((stats.ready + stats.failed) / stats.totalFiles) * 100)
    : 0;

  // Update operation times for time estimation
  useEffect(() => {
    const now = Date.now();
    const timeDiff = now - lastUpdateTimeRef.current;

    if (stats.ready > 0 || stats.uploaded > 0) {
      // Track last 5 operation times
      operationTimesRef.current.push(timeDiff);
      if (operationTimesRef.current.length > 5) {
        operationTimesRef.current.shift();
      }
    }

    lastUpdateTimeRef.current = now;
  }, [stats.ready, stats.uploaded]);

  // Calculate estimated time remaining
  const getEstimatedTime = (): string => {
    if (stats.totalFiles === stats.ready + stats.failed) {
      return 'Complete';
    }

    if (operationTimesRef.current.length === 0) {
      return 'Calculating...';
    }

    const avgTime = operationTimesRef.current.reduce((a, b) => a + b, 0) / operationTimesRef.current.length;
    const remaining = stats.totalFiles - stats.ready - stats.failed;
    const estimatedMs = remaining * avgTime;

    if (estimatedMs < 1000) return 'Almost done';
    if (estimatedMs < 60000) return `${Math.ceil(estimatedMs / 1000)}s remaining`;
    return `${Math.ceil(estimatedMs / 60000)}m remaining`;
  };

  // Smooth progress animation
  useEffect(() => {
    const targetProgress = overallProgress;
    const step = () => {
      setAnimationProgress((prev) => {
        const diff = targetProgress - prev;
        if (Math.abs(diff) < 1) return targetProgress;
        return prev + diff * 0.1;
      });
    };
    const interval = setInterval(step, 50);
    return () => clearInterval(interval);
  }, [overallProgress]);

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (newState && onMinimize) {
      onMinimize();
    } else if (!newState && onExpand) {
      onExpand();
    }
  };

  // Don't show if no files are being processed
  if (stats.totalFiles === 0) {
    return null;
  }

  // Check if all operations are complete
  const isComplete = stats.totalFiles === stats.ready + stats.failed;
  const hasFailures = stats.failed > 0;

  return (
    <Card
      className={cn(
        'fixed top-4 right-4 z-50 w-96 shadow-2xl transition-all duration-300',
        isCollapsed && 'w-auto',
        className
      )}
    >
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between p-4"
        onClick={toggleCollapse}
      >
        <div className="flex items-center gap-3">
          {!isComplete && (
            <div className="relative h-6 w-6">
              <svg
                className="h-6 w-6 -rotate-90 transform"
                viewBox="0 0 24 24"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  className="text-muted"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray={`${animationProgress * 0.628} 62.8`}
                  strokeLinecap="round"
                  className={hasFailures ? 'text-destructive' : 'text-primary'}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
                {Math.round(animationProgress)}
              </span>
            </div>
          )}

          {isComplete && (
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-sm',
                hasFailures ? 'bg-destructive text-destructive-foreground' : 'bg-green-500 text-white'
              )}
            >
              {hasFailures ? (
                <AlertCircle className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold">
              {isComplete
                ? hasFailures
                  ? `${stats.ready} completed, ${stats.failed} failed`
                  : 'All uploads complete'
                : `Processing ${stats.totalFiles} ${stats.totalFiles === 1 ? 'file' : 'files'}`}
            </h3>
            {!isCollapsed && !isComplete && (
              <p className="text-xs text-muted-foreground">{getEstimatedTime()}</p>
            )}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
        >
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', isCollapsed && 'rotate-180')}
          />
        </Button>
      </div>

      {/* Expanded content */}
      {!isCollapsed && (
        <div className="border-t p-4">
          {/* Stats grid */}
          <div className="mb-4 grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Uploaded</p>
              <p className="text-sm font-semibold">{stats.uploaded}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Processing</p>
              <p className="text-sm font-semibold text-primary">{stats.processingEmbeddings}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ready</p>
              <p className="text-sm font-semibold text-green-500">{stats.ready}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="text-sm font-semibold text-destructive">{stats.failed}</p>
            </div>
          </div>

          {/* Dual-layer progress bars */}
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Upload Progress</span>
                <span className="font-semibold">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Embedding Progress</span>
                <span className="font-semibold">{embeddingProgress}%</span>
              </div>
              <Progress value={embeddingProgress} className="h-2 [&>div]:bg-green-500" />
            </div>
          </div>

          {/* Action buttons */}
          {isComplete && (
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => window.location.href = '/app'}
              >
                View Library
              </Button>
              {hasFailures && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    // Trigger retry for failed items
                    logger.logInfo('upload-progress.retry-failed');
                  }}
                >
                  Retry Failed
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Hook to manage upload progress state
export function useUploadProgress() {
  const [stats, setStats] = useState<ProgressStats>({
    totalFiles: 0,
    uploaded: 0,
    processingEmbeddings: 0,
    ready: 0,
    failed: 0,
    estimatedTimeRemaining: 0,
  });

  const startUpload = (fileCount: number) => {
    setStats({
      totalFiles: fileCount,
      uploaded: 0,
      processingEmbeddings: 0,
      ready: 0,
      failed: 0,
      estimatedTimeRemaining: 0,
    });
  };

  const updateProgress = (updates: Partial<ProgressStats>) => {
    setStats((prev) => ({ ...prev, ...updates }));
  };

  const markUploaded = (count: number = 1) => {
    setStats((prev) => ({
      ...prev,
      uploaded: prev.uploaded + count,
      processingEmbeddings: prev.processingEmbeddings + count,
    }));
  };

  const markReady = (count: number = 1) => {
    setStats((prev) => ({
      ...prev,
      processingEmbeddings: Math.max(0, prev.processingEmbeddings - count),
      ready: prev.ready + count,
    }));
  };

  const markFailed = (count: number = 1) => {
    setStats((prev) => ({
      ...prev,
      processingEmbeddings: Math.max(0, prev.processingEmbeddings - count),
      failed: prev.failed + count,
    }));
  };

  const reset = () => {
    setStats({
      totalFiles: 0,
      uploaded: 0,
      processingEmbeddings: 0,
      ready: 0,
      failed: 0,
      estimatedTimeRemaining: 0,
    });
  };

  return {
    stats,
    startUpload,
    updateProgress,
    markUploaded,
    markReady,
    markFailed,
    reset,
  };
}
