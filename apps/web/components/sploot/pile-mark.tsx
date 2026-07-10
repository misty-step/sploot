import { cn } from '@/lib/utils';

interface PileMarkProps {
  className?: string;
}

// A little stack of candy stickers (lab-034 AFD-8): rounded ink-shell chips in
// the sticker palette, fanned into a pile.
export function PileMark({ className }: PileMarkProps) {
  return (
    <span
      className={cn('relative inline-block h-7 w-8 md:h-8 md:w-9', className)}
      aria-hidden="true"
    >
      <span className="absolute bottom-0 left-0 h-5 w-5 -rotate-6 rounded-[var(--sploot-radius-ctl)] border-2 border-sploot-ink bg-[var(--sploot-sticker-cyan)]" />
      <span className="absolute bottom-1 left-3 h-5 w-5 rotate-3 rounded-[var(--sploot-radius-ctl)] border-2 border-sploot-ink bg-[var(--sploot-sticker-violet)]" />
      <span className="absolute bottom-2 left-1.5 h-5 w-5 rotate-6 rounded-[var(--sploot-radius-ctl)] border-2 border-sploot-ink bg-[var(--sploot-sticker-coral)]" />
    </span>
  );
}
