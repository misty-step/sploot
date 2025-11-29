'use client';

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { FileMetadata } from '@/lib/file-metadata-manager';
import { useEmbeddingStatusSubscription } from '@/contexts/embedding-status-context';
import { useSSEEmbeddingUpdates } from '@/hooks/use-sse-updates';
import { getSSEClient } from '@/lib/sse-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

interface EmbeddingStatusIndicatorProps {
  file: FileMetadata;
  onStatusChange: (status: 'pending' | 'processing' | 'ready' | 'failed', error?: string) => void;
}

/**
 * Component to handle inline embedding status display
 * Shows the current state of embedding generation for a file
 * Integrates with SSE for real-time updates and polling fallback
 */
export function EmbeddingStatusIndicator({
  file,
  onStatusChange
}: EmbeddingStatusIndicatorProps) {
  const [showStatus, setShowStatus] = useState(true);
  const [autoHideTimer, setAutoHideTimer] = useState<NodeJS.Timeout | null>(null);

  // Use centralized embedding status subscription (polling fallback)
  const embeddingStatus = useEmbeddingStatusSubscription(
    file.assetId,
    {
      enabled: !!file.assetId && file.needsEmbedding === true,
      onStatusChange: (status) => {
        // Map status to expected format
        if (status.status === 'processing') {
          onStatusChange('processing');
        } else if (status.status === 'ready' && status.hasEmbedding) {
          onStatusChange('ready');
          // Auto-dismiss success after 3s
          const timer = setTimeout(() => setShowStatus(false), 3000);
          setAutoHideTimer(timer);
        } else if (status.status === 'failed') {
          onStatusChange('failed', status.error);
        } else if (status.status === 'pending') {
          onStatusChange('pending');
        }
      },
      onSuccess: () => {
        // Already handled in onStatusChange
      },
      onError: (error) => {
        // Already handled in onStatusChange
      },
    }
  );

  // Use SSE for real-time updates
  useSSEEmbeddingUpdates(
    file.assetId ? [file.assetId] : [],
    {
      enabled: !!file.assetId && file.needsEmbedding === true,
      onUpdate: (update) => {
        if (update.assetId === file.assetId) {
          logger.debug(`[SSE] Received update for asset ${file.assetId}:`, update.status);

          // Map SSE status to component status
          if (update.status === 'processing') {
            onStatusChange('processing');
          } else if (update.status === 'ready' && update.hasEmbedding) {
            onStatusChange('ready');
            // Auto-dismiss success after 3s
            if (autoHideTimer) clearTimeout(autoHideTimer);
            const timer = setTimeout(() => setShowStatus(false), 3000);
            setAutoHideTimer(timer);
          } else if (update.status === 'failed') {
            onStatusChange('failed', update.error);
          } else if (update.status === 'pending') {
            onStatusChange('pending');
          }
        }
      }
    }
  );

  // Connect to SSE on mount if needed
  useEffect(() => {
    if (file.assetId && file.needsEmbedding) {
      const client = getSSEClient();
      // Ensure SSE client is connected for this asset
      if (client.getState() === 'disconnected') {
        logger.debug(`[SSE] Connecting for asset ${file.assetId}`);
        client.connect([file.assetId]);
      }
    }
  }, [file.assetId, file.needsEmbedding]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }
    };
  }, [autoHideTimer]);

  // If embedding is not needed or status is hidden, show simple success
  if (!file.needsEmbedding || !showStatus) {
    return <Badge variant="secondary" className="text-green-500 gap-1"><CheckCircle2 className="size-3" />Ready</Badge>;
  }

  // Retry handler for failed embeddings
  const handleRetry = async () => {
    if (embeddingStatus.retry) {
      await embeddingStatus.retry();
    }
  };

  // Display based on embedding status
  switch (file.embeddingStatus) {
    case 'pending':
      return (
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary" className="text-green-500"><CheckCircle2 className="size-3" />Uploaded</Badge>
          <Badge variant="secondary" className="text-yellow-500">Preparing...</Badge>
        </div>
      );

    case 'processing':
      return (
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary" className="text-green-500"><CheckCircle2 className="size-3" />Uploaded</Badge>
          <Badge variant="default" className="gap-1">
            <Loader2 className="size-3 animate-spin" />
            Indexing
          </Badge>
        </div>
      );

    case 'ready':
      return (
        <Badge variant="secondary" className="text-green-500 gap-1 animate-in fade-in duration-200">
          <CheckCircle2 className="size-3" />
          Ready to search
        </Badge>
      );

    case 'failed':
      return (
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary" className="text-yellow-500"><AlertCircle className="size-3" />Upload complete</Badge>
          <Badge variant="destructive">Search prep failed</Badge>
          <Button
            onClick={handleRetry}
            size="sm"
            variant="link"
            disabled={!embeddingStatus.retry}
            className="h-auto p-0 text-primary underline"
          >
            Retry
          </Button>
        </div>
      );

    default:
      return <Badge variant="secondary" className="text-green-500"><CheckCircle2 className="size-3" /></Badge>;
  }
}