import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BangerStampProps {
  active?: boolean;
  count?: number;
  className?: string;
}

// Counts use tabular figures so repeated stamps do not jitter.
export function BangerStamp({ active = true, count, className }: BangerStampProps) {
  return (
    <span
      className={cn(
        'sploot-sticker-shadow inline-flex min-h-8 items-center gap-1 border-[3px] px-2 py-1 font-mono text-[0.68rem] font-bold uppercase tracking-normal sploot-tabular',
        active
          ? 'border-sploot-coral bg-sploot-magenta text-white'
          : 'border-sploot-ink bg-sploot-paper text-sploot-ink',
        className
      )}
      aria-label={count == null ? 'banger' : `${count} bangers`}
    >
      <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      {count == null ? 'banger' : count.toLocaleString()}
    </span>
  );
}
