'use client';

import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface UploadButtonProps {
  onClick?: () => void;
  isActive?: boolean;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Upload button component for the navbar
 * Uses shadcn Button with brutalist variant
 */
export function UploadButton({
  onClick,
  isActive = false,
  className,
  showLabel = true,
  size = 'md',
}: UploadButtonProps) {
  // Map custom size to Button size
  const buttonSize = size === 'md' ? 'default' : size;

  return (
    <Button
      variant="command"
      size={buttonSize}
      onClick={onClick}
      className={cn(
        'font-mono text-sm uppercase tracking-wider',
        showLabel && 'px-6',
        className
      )}
      aria-label={showLabel ? undefined : 'Upload'}
      title={showLabel ? undefined : 'Upload new meme'}
    >
      <Upload className="h-4 w-4" strokeWidth={2} />
      {showLabel && 'UPLOAD'}
    </Button>
  );
}

/**
 * Floating upload button for mobile or alternative layouts
 * Uses shadcn Button with brutalist variant and icon size
 */
export function UploadButtonFloating({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="command"
      size="icon-lg"
      onClick={onClick}
      className={className}
      aria-label="Upload new meme"
    >
      <Upload className="h-6 w-6" strokeWidth={2} />
    </Button>
  );
}
