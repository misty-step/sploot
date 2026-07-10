'use client';

import * as React from 'react';
import { Heart, Share2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from './icon-button';

/**
 * TileActionRail — the meme cell's action row (lab-034 AFD-8).
 *
 * Operator rules baked in:
 * - The rail owns space BELOW the caption and never covers the media.
 * - It renders INSIDE the transformed card element, so on card hover the
 *   rail (and any banger marker) moves with the card.
 * - Banger = a little heart. Filled means banger, outline means not.
 *   No badges, no banger sort, no loud marks.
 */
export interface TileActionRailProps {
  banger: boolean;
  onToggleBanger?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  /** Extra controls (e.g. a copy button) slot in before delete. */
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function TileActionRail({
  banger,
  onToggleBanger,
  onShare,
  onDelete,
  children,
  className,
  disabled,
}: TileActionRailProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-1.5 px-2.5 py-1.5',
        'border-t-2 border-dashed border-sploot-ink bg-sploot-paper-warm',
        className
      )}
      role="group"
      aria-label="meme actions"
    >
      <IconButton
        label={banger ? 'remove banger' : 'mark as banger'}
        pressed={banger}
        disabled={disabled}
        className="max-sm:size-[var(--sploot-touch-target)]"
        onClick={(e) => {
          e.stopPropagation();
          onToggleBanger?.();
        }}
      >
        <Heart fill={banger ? 'currentColor' : 'none'} />
      </IconButton>
      {onShare && (
        <IconButton
          label="share meme"
          disabled={disabled}
          className="max-sm:size-[var(--sploot-touch-target)]"
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
        >
          <Share2 />
        </IconButton>
      )}
      {children}
      {onDelete && (
        <IconButton
          label="delete meme"
          disabled={disabled}
          className="max-sm:size-[var(--sploot-touch-target)] hover:!bg-sploot-red hover:!text-white"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 />
        </IconButton>
      )}
    </div>
  );
}
