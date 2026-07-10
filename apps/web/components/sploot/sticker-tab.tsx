import { cn } from '@/lib/utils';

type StickerTone = 'cyan' | 'coral' | 'violet' | 'lime' | 'ink';

// Candy pill tags (lab-034 AFD-8): pill radius, 2px ink shell, sticker candy
// fills, sticker drop. Dark ink text stays dark on the candy fills
// (cyan / magenta / yellow); grape and ink carry light text.
const stickerToneClass: Record<StickerTone, string> = {
  cyan: 'bg-[var(--sploot-sticker-cyan)] text-[#1c1547]',
  coral: 'bg-[var(--sploot-sticker-coral)] text-[#1c1547]',
  violet: 'bg-[var(--sploot-sticker-violet)] text-white',
  lime: 'bg-[var(--sploot-sticker-lime)] text-[#1c1547]',
  ink: 'bg-sploot-ink text-sploot-paper',
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
        'sploot-sticker-shadow inline-flex min-h-7 items-center rounded-[var(--sploot-radius-pill)] border-2 border-sploot-ink px-3 py-1 font-mono text-[0.68rem] font-bold lowercase',
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
