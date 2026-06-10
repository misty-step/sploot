'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { trackEmptyStateRender } from '@/lib/performance-metrics';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, Plus } from 'lucide-react';
import { logger } from '@/lib/observability-logger';

export type EmptyStateVariant = 'first-use' | 'filtered' | 'search';

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  onUploadClick?: () => void;
  searchQuery?: string;
  className?: string;
  showUploadButton?: boolean;
  onFilesDropped?: (files: File[]) => void;
}

/**
 * Empty state component for the library
 * Displays contextual messaging when no assets are available
 */
export function EmptyState({
  variant = 'first-use',
  onUploadClick,
  searchQuery,
  className,
  showUploadButton = true,
  onFilesDropped,
}: EmptyStateProps) {
  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const mountTimeRef = useRef(performance.now());

  // Performance measurement
  useEffect(() => {
    const renderEnd = performance.now();
    const renderTime = renderEnd - mountTimeRef.current;

    trackEmptyStateRender(mountTimeRef.current);

    if (process.env.NODE_ENV === 'development') {
      logger.logInfo('library-empty-state.render-timing', {
        renderTimeMs: Number(renderTime.toFixed(2)),
      });
    }
  }, []);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter((file) => file.type.startsWith('image/'));

        if (imageFiles.length > 0 && onFilesDropped) {
          onFilesDropped(imageFiles);
        } else if (imageFiles.length === 0 && files.length > 0) {
          console.warn('[EmptyState] No image files in drop');
        }
      }
    },
    [onFilesDropped]
  );

  // Determine message based on variant
  const getMessage = () => {
    switch (variant) {
      case 'search':
        return {
          title: 'no matches in the pile',
          description: searchQuery
            ? `nothing matches "${searchQuery}". try different words or browse the full library.`
            : 'nothing matches that search. try different words or browse the full library.',
        };
      case 'filtered':
        return {
          title: 'no memes match these filters',
          description: 'try adjusting your filters or clearing them to see all your memes.',
        };
      case 'first-use':
      default:
        return {
          title: 'drop files here',
          description: 'drag and drop images into your library or start an upload to see them appear instantly.',
        };
    }
  };

  const message = getMessage();
  const shouldShowUploadButton = variant === 'first-use' && showUploadButton;
  const enableDragDrop = variant === 'first-use';

  return (
    <div
      className={cn('flex h-full items-center justify-center py-8', className)}
      onDragEnter={enableDragDrop ? handleDragEnter : undefined}
      onDragOver={enableDragDrop ? handleDragOver : undefined}
      onDragLeave={enableDragDrop ? handleDragLeave : undefined}
      onDrop={enableDragDrop ? handleDrop : undefined}
    >
      <Card
        className={cn(
          'w-full max-w-md text-center transition-all duration-200',
          isDragging && enableDragDrop && 'scale-[1.02] border-2 border-dashed border-primary bg-primary/5'
        )}
      >
        <CardHeader className="space-y-3">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border bg-muted">
              <ImageIcon className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="font-mono text-base">{message.title}</CardTitle>
          {message.description && <CardDescription className="font-mono text-sm">{message.description}</CardDescription>}
        </CardHeader>

        {shouldShowUploadButton && (
          <CardFooter className="flex flex-col items-center gap-3 pt-2">
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-primary">⌘V</kbd>
              <span>to paste</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">or</span>
              {onUploadClick ? (
                <Button onClick={onUploadClick} className="gap-1.5 font-mono" aria-label="Upload images">
                  <Plus className="h-3.5 w-3.5" />
                  upload
                </Button>
              ) : (
                <Button asChild className="gap-1.5 font-mono">
                  <Link href="/app?upload=1" aria-label="Upload images">
                    <Plus className="h-3.5 w-3.5" />
                    upload
                  </Link>
                </Button>
              )}
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
