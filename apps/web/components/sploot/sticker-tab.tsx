import { cn } from '@/lib/utils';

type StickerTone = 'cyan' | 'coral' | 'violet' | 'lime' | 'ink';

// Solid color blocks keep labels loud without adding new component states.
const stickerToneClass: Record<StickerTone, string> = {
  cyan: 'border-sploot-cyan bg-[var(--sploot-sticker-cyan)] text-sploot-ink',
  coral: 'border-sploot-coral bg-[var(--sploot-sticker-coral)] text-white',
  violet: 'border-sploot-violet bg-[var(--sploot-sticker-violet)] text-white',
  lime: 'border-sploot-ink bg-[var(--sploot-sticker-lime)] text-sploot-ink',
  ink: 'border-sploot-ink bg-sploot-ink text-sploot-lime',
};

interface StickerTabProps {
  children: React.ReactNode;
  tone?: StickerTone;
  className?: string;
  tilt?: 'none' | 'left' | 'right';
}

export function StickerTab({
  children,
  tone = 'cyan',
  className,
  tilt = 'none',
}: StickerTabProps) {
  return (
    <span
      className={cn(
        'sploot-sticker-shadow inline-flex min-h-7 items-center border-[3px] px-2.5 py-1 font-mono text-[0.68rem] font-bold uppercase tracking-normal',
        stickerToneClass[tone],
        tilt === 'left' && '-rotate-2',
        tilt === 'right' && 'rotate-2',
        className
      )}
    >
      {children}
    </span>
  );
}
