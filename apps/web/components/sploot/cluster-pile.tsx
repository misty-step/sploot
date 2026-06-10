import Image from 'next/image';
import { cn } from '@/lib/utils';
import { BangerStamp } from './banger-stamp';
import { StickerTab } from './sticker-tab';
import { MemeDoodle, type MemeDoodleKind } from './meme-doodle';

interface ClusterPileProps {
  label: string;
  count: number;
  tone?: 'cyan' | 'coral' | 'violet' | 'lime';
  selected?: boolean;
  bangers?: number;
  items: Array<{
    label: string;
    src?: string;
    alt?: string;
    doodle?: MemeDoodleKind;
    tone?: 'cyan' | 'coral' | 'violet' | 'lime' | 'ink';
  }>;
  className?: string;
}

const tileToneClass = {
  cyan: 'bg-[var(--sploot-sticker-cyan)]',
  coral: 'bg-[var(--sploot-sticker-coral)]',
  violet: 'bg-[var(--sploot-sticker-violet)]',
  lime: 'bg-[var(--sploot-sticker-lime)]',
  ink: 'bg-sploot-paper-warm',
};

export function ClusterPile({
  label,
  count,
  tone = 'violet',
  selected = false,
  bangers,
  items,
  className,
}: ClusterPileProps) {
  return (
    <section
      className={cn(
        'relative min-w-0 overflow-hidden border bg-sploot-pile-surface p-3 transition-colors',
        selected ? 'border-[3px] border-sploot-cyan bg-sploot-pile-selected' : 'border-sploot-ink',
        className
      )}
      aria-label={`${label}, ${count} saves`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <StickerTab tone={tone} tilt={selected ? 'right' : 'none'}>
          {label}
        </StickerTab>
        <span className="font-mono text-xs text-muted-foreground sploot-tabular">
          {count.toLocaleString()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-hidden="true">
        {items.slice(0, 6).map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className={cn(
              'relative flex aspect-square min-w-0 items-end overflow-hidden border border-sploot-ink p-1 font-mono text-[0.58rem] font-bold uppercase leading-none text-sploot-ink',
              tileToneClass[item.tone ?? tone],
              index % 2 === 0 ? '-rotate-1' : 'rotate-1'
            )}
          >
            {item.src ? (
              <>
                <Image
                  src={item.src}
                  alt={item.alt ?? item.label}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
                <span className="absolute bottom-1 left-1 bg-black/80 px-1 text-white">
                  {item.label}
                </span>
              </>
            ) : item.doodle ? (
              <>
                <div className="absolute inset-0 p-2.5 pb-4">
                  <MemeDoodle kind={item.doodle} />
                </div>
                <span className="absolute bottom-1 left-1 bg-sploot-ink px-1 text-sploot-paper">
                  {item.label}
                </span>
              </>
            ) : (
              <span className="break-all">{item.label}</span>
            )}
          </div>
        ))}
      </div>

      {bangers ? (
        <BangerStamp count={bangers} className="absolute -bottom-3 right-2 rotate-2" />
      ) : null}
    </section>
  );
}
