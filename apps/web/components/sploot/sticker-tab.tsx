import { cn } from '@/lib/utils';

type StickerTone = 'cyan' | 'coral' | 'violet' | 'lime' | 'ink';

const stickerToneClass: Record<StickerTone, string> = {
  cyan: 'border-sploot-cyan bg-[var(--sploot-sticker-cyan)] text-sploot-ink dark:text-sploot-ink',
  coral: 'border-sploot-coral bg-[var(--sploot-sticker-coral)] text-sploot-ink dark:text-sploot-ink',
  violet: 'border-sploot-violet bg-[var(--sploot-sticker-violet)] text-sploot-ink dark:text-sploot-ink',
  lime: 'border-sploot-lime bg-[var(--sploot-sticker-lime)] text-sploot-ink dark:text-sploot-ink',
  ink: 'border-sploot-ink bg-sploot-paper text-sploot-ink',
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
        'sploot-sticker-shadow inline-flex min-h-7 items-center border px-2.5 py-1 font-mono text-[0.68rem] font-bold uppercase tracking-normal',
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
