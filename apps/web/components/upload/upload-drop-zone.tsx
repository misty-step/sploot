'use client';

import { useState, useRef, DragEvent, ClipboardEvent, useEffect, useCallback } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { showToast } from '@/components/ui/toast';
import { UPLOAD } from '@sploot/common';

interface UploadDropZoneProps {
  /** Callback when files are added (via drop, paste, or file input) */
  onFilesAdded: (files: File[]) => void;

  /** Callback when an http(s) URL is pasted instead of image data */
  onUrlPasted?: (url: string) => void;

  /** List of allowed MIME types (defaults to shared upload policy) */
  allowedFileTypes?: string[];

  /** Shows preparing overlay with file count and size */
  isPreparing?: boolean;
  preparingFileCount?: number;
  preparingTotalSize?: number;

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
  onUrlPasted,
  allowedFileTypes = [...UPLOAD.allowedTypes],
  isPreparing = false,
  preparingFileCount = 0,
  preparingTotalSize = 0,
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
      return;
    }

    // No image data — a pasted http(s) URL imports the remote image.
    if (onUrlPasted) {
      const text = e.clipboardData?.getData('text')?.trim() ?? '';
      if (/^https?:\/\/\S+$/i.test(text)) {
        setIsProcessingPulse(true);
        setTimeout(() => setIsProcessingPulse(false), 1000);
        onUrlPasted(text);
      }
    }
  }, [onFilesAdded, onUrlPasted]);

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
          'relative border-[3px] border-dashed border-sploot-ink rounded-[var(--sploot-radius)] transition-all duration-200 cursor-pointer',
          'bg-sploot-paper-warm shadow-none',
          'hover:border-sploot-blue hover:bg-sploot-yellow/20',
          isDragging
            ? 'border-sploot-blue bg-sploot-yellow/30 scale-[1.01]'
            : 'border-sploot-ink',
          isProcessingPulse && 'animate-pulse'
        )}
      >
        {/* Preparing overlay */}
        {isPreparing && (
          <div className="absolute inset-0 z-10 bg-sploot-panel/95 flex flex-col items-center justify-center animate-in fade-in duration-200 rounded-[var(--sploot-radius)]">
            <Loader2 className="size-8 text-sploot-blue animate-spin mb-3" />
            <p
              className="text-3xl mb-2 tracking-wider text-sploot-ink"
              style={{ fontFamily: "var(--font-bebas-neue)" }}
            >
              PREPARING {preparingFileCount} {preparingFileCount === 1 ? 'FILE' : 'FILES'}...
            </p>
            <p className="text-sm text-muted-foreground">
              {preparingTotalSize < 1024 * 1024
                ? `${(preparingTotalSize / 1024).toFixed(0)} KB`
                : `${(preparingTotalSize / (1024 * 1024)).toFixed(1)} MB`}
            </p>
          </div>
        )}
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className={cn(
            'size-20 mb-6 rounded-[var(--sploot-radius-inner)] flex items-center justify-center transition-all duration-200',
            'border-[3px] border-sploot-ink',
            isDragging ? 'bg-sploot-yellow scale-110' : 'bg-sploot-panel'
          )}>
            <Upload className={cn('size-10 transition-colors', isDragging ? 'text-sploot-blue' : 'text-muted-foreground')} strokeWidth={2.5} />
          </div>

          <h2
            className="text-4xl md:text-5xl mb-3 tracking-wider"
            style={{ fontFamily: "var(--font-bebas-neue)" }}
          >
            {isDragging ? (
              <span className="text-sploot-blue">DROP MEMES HERE</span>
            ) : (
              <span className="text-muted-foreground">DRAG & DROP MEMES</span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            or click to browse • paste an image or its url
          </p>
          <p className="font-mono text-xs text-muted-foreground/60">
            JPEG, PNG, WebP, GIF, MP4, WebM • zips & bookmark exports too • Max {UPLOAD.maxSizeMB}MB per file
          </p>
        </CardContent>
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
