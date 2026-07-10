import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BangerStampProps {
  active?: boolean;
  count?: number;
  className?: string;
}

/**
 * @deprecated The loud banger stamp is retired under the toybox system
 * (lab-034 AFD-8). Banger is now a quiet little heart — filled means banger,
 * outline means not — and tile-level banger toggling lives in
 * {@link ../tile-action-rail TileActionRail}. This component survives only as a
 * small inline marker for metadata rows; do not add badges or loud marks.
 */
export function BangerStamp({ active = true, count, className }: BangerStampProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono text-[0.7rem] font-bold lowercase text-sploot-ink sploot-tabular',
        className
      )}
      aria-label={count == null ? 'banger' : `${count} bangers`}
    >
      <Heart
        className={cn(
          'h-3.5 w-3.5',
          active ? 'fill-sploot-magenta text-sploot-magenta' : 'fill-none text-sploot-ink'
        )}
        aria-hidden="true"
      />
      {count == null ? 'banger' : count.toLocaleString()}
    </span>
  );
}
