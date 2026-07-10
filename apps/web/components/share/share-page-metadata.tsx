import { cn } from '@/lib/utils';

interface SharePageMetadataProps {
  size?: number;
  width?: number;
  height?: number;
  mime?: string;
  className?: string;
}

/**
 * Format file size from bytes to human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Display technical file metadata in monospace (terminal style).
 *
 * Shows:
 * - File size (human-readable: KB/MB)
 * - Dimensions (WxH)
 * - MIME type (without "image/" prefix)
 *
 * Handles missing data gracefully by hiding fields.
 * Responsive: single line on desktop, stacked on mobile.
 */
export function SharePageMetadata({
  size,
  width,
  height,
  mime,
  className,
}: SharePageMetadataProps) {
  // Extract MIME type without "image/" prefix
  const mimeType = mime?.replace('image/', '').toUpperCase();

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-4 gap-y-2',
        'text-xs text-white/60',
        'font-mono',
        className
      )}
    >
      {/* File size */}
      {size !== undefined && size !== null && (
        <span className="flex items-center gap-1.5">
          <span className="text-white/50">Size:</span>
          <span className="text-white/85">{formatFileSize(size)}</span>
        </span>
      )}

      {/* Dimensions */}
      {width !== undefined && width !== null && height !== undefined && height !== null && (
        <span className="flex items-center gap-1.5">
          <span className="text-white/50">Dimensions:</span>
          <span className="text-white/85">{width} × {height}</span>
        </span>
      )}

      {/* MIME type */}
      {mimeType && (
        <span className="flex items-center gap-1.5">
          <span className="text-white/50">Type:</span>
          <span className="text-white/85">{mimeType}</span>
        </span>
      )}
    </div>
  );
}
