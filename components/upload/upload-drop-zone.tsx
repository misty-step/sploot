'use client';

import { useState, useRef, DragEvent, ClipboardEvent, useEffect, useCallback } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/ui/toast';
import { ALLOWED_FILE_TYPES } from '@/lib/blob';

interface UploadDropZoneProps {
  /** Callback when files are added (via drop, paste, or file input) */
  onFilesAdded: (files: File[]) => void;

  /** List of allowed MIME types (defaults to ALLOWED_FILE_TYPES from @/lib/blob) */
  allowedFileTypes?: string[];

  /** Shows preparing overlay with file count and size */
  isPreparing?: boolean;
  preparingFileCount?: number;
  preparingTotalSize?: number;

  /** Background sync support indicator */
  enableBackgroundSync?: boolean;
  supportsBackgroundSync?: boolean;
}

/**
 * UploadDropZone - Drag/drop, paste, and click-to-browse file upload zone
 *
 * Encapsulates browser event handling for file uploads:
 * - Drag/drop with visual feedback (drag counter to handle nested elements)
 * - Paste from clipboard (extracts image files)
 * - Click to browse (hidden file input)
 * - Processing pulse animation on file receipt
 *
 * Deep module: Hides complex browser event API interactions behind simple callback interface
 */
export function UploadDropZone({
  onFilesAdded,
  allowedFileTypes = ALLOWED_FILE_TYPES,
  isPreparing = false,
  preparingFileCount = 0,
  preparingTotalSize = 0,
  enableBackgroundSync = false,
  supportsBackgroundSync = false,
}: UploadDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingPulse, setIsProcessingPulse] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop handlers
  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const fileCount = e.dataTransfer.files.length;
      showToast(`Processing ${fileCount} ${fileCount === 1 ? 'file' : 'files'}...`, 'info');
      setIsProcessingPulse(true);
      setTimeout(() => setIsProcessingPulse(false), 1000);
      onFilesAdded(Array.from(e.dataTransfer.files));
    }
  };

  // Paste handler
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      showToast(`Processing ${files.length} ${files.length === 1 ? 'image' : 'images'} from clipboard...`, 'info');
      setIsProcessingPulse(true);
      setTimeout(() => setIsProcessingPulse(false), 1000);
      onFilesAdded(files);
    }
  }, [onFilesAdded]);

  // File input handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesAdded(Array.from(e.target.files));
      // Reset input to allow selecting same file again
      e.target.value = '';
    }
  };

  // Attach paste listener to document on mount
  useEffect(() => {
    const pasteListener = (e: Event) => handlePaste(e as unknown as ClipboardEvent);
    document.addEventListener('paste', pasteListener);
    return () => document.removeEventListener('paste', pasteListener);
  }, [handlePaste]);

  return (
    <>
      <Card
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative border-2 border-dashed transition-all duration-200 cursor-pointer',
          'hover:border-primary hover:bg-primary/5',
          isDragging
            ? 'border-primary bg-primary/10 scale-[1.02]'
            : 'border-border',
          isProcessingPulse && 'animate-pulse'
        )}
      >
        {/* Preparing overlay */}
        {isPreparing && (
          <div className="absolute inset-0 z-10 bg-background/95 flex flex-col items-center justify-center animate-in fade-in duration-200 rounded-xl">
            <Loader2 className="size-8 text-primary animate-spin mb-3" />
            <p className="font-medium mb-1">
              Preparing {preparingFileCount} {preparingFileCount === 1 ? 'file' : 'files'}...
            </p>
            <p className="text-muted-foreground text-sm">
              {preparingTotalSize < 1024 * 1024
                ? `${(preparingTotalSize / 1024).toFixed(0)} KB`
                : `${(preparingTotalSize / (1024 * 1024)).toFixed(1)} MB`}
            </p>
          </div>
        )}
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className={cn(
            'size-16 mb-4 rounded-lg flex items-center justify-center transition-all duration-200',
            isDragging ? 'bg-primary/20 scale-110' : 'bg-muted'
          )}>
            <Upload className={cn('size-8 transition-colors', isDragging ? 'text-primary' : 'text-muted-foreground')} />
          </div>

          <p className="font-medium mb-1">
            {isDragging ? 'Drop your images here' : 'Drag & drop images here'}
          </p>
          <p className="text-muted-foreground text-sm mb-4">
            or click to browse • paste from clipboard
          </p>
          <p className="text-muted-foreground/60 text-xs">
            JPEG, PNG, WebP, GIF • Max 10MB per file
          </p>
          {enableBackgroundSync && supportsBackgroundSync && (
            <Badge variant="outline" className="mt-2 text-xs">
              Background sync enabled
            </Badge>
          )}
        </CardContent>

        {/* Accent stripe when dragging */}
        {isDragging && (
          <div className="absolute inset-0 pointer-events-none rounded-xl">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-xl" />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-green-500 rounded-r-xl" />
          </div>
        )}
      </Card>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={allowedFileTypes.join(',')}
        onChange={handleFileSelect}
        className="hidden"
      />
    </>
  );
}
