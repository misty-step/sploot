import Image from 'next/image';
import { cn } from '@/lib/utils';
import { MemeDoodle, type MemeDoodleKind } from './meme-doodle';

export type MemeCellState = 'default' | 'near' | 'match' | 'dim';

interface MemeCellProps {
  /** Filename shown in the mono header, e.g. "IMG_4471.png" */
  file: string;
  /** Vector index shown next to the filename, e.g. "v#00471" */
  index?: string;
  /** Real or generated meme fixture used by product-facing surfaces. */
  src?: string;
  /** Optional fallback glyph for the internal styleguide only. */
  doodle?: MemeDoodleKind;
  /** Lowercase caption describing what is in the meme. */
  caption?: string;
  /** Cosine score shown on near/match cells, e.g. "0.91". */
  score?: string;
  state?: MemeCellState;
  /** Disable the match scale-up (the styleguide renders a static catalog). */
  animate?: boolean;
  className?: string;
}

/**
 * One tile in the pile. State drives the reveal:
 *   match -> lime match-ring + "match" badge + score
 *   near  -> inset orange ring + score
 *   dim   -> recede (low opacity + grayscale)
 *   default -> resting
 */
export function MemeCell({
  file,
  index,
  src,
  doodle,
  caption,
  score,
  state = 'default',
  animate = true,
  className,
}: MemeCellProps) {
  const isMatch = state === 'match';
  const isNear = state === 'near';
  const isDim = state === 'dim';

  return (
    <article
      className={cn(
        'relative flex min-h-[210px] flex-col border-[3px] border-sploot-ink bg-sploot-paper transition-[opacity,filter,transform] duration-[var(--sploot-motion-panel)] ease-[var(--sploot-ease-out)]',
        isMatch && 'z-10 sploot-match-ring',
        isMatch && animate && 'scale-[1.02]',
        isNear && 'shadow-[inset_0_0_0_4px_var(--sploot-orange)]',
        isDim && 'opacity-[0.16] grayscale',
        className
      )}
    >
      {isMatch && (
        <span
          className={cn(
            'absolute -right-[3px] -top-[3px] z-20 border-[3px] border-sploot-ink bg-sploot-lime px-1.5 py-0.5 font-mono text-[0.62rem] font-bold uppercase tracking-normal text-sploot-ink',
            animate && 'animate-sploot-stamp'
          )}
        >
          match
        </span>
      )}

      <div className="flex items-center justify-between border-b-[3px] border-sploot-ink px-2 py-1.5 font-mono text-[0.6rem] font-bold uppercase tracking-normal text-sploot-ink">
        <span className="truncate">{file}</span>
        {index ? <span className="shrink-0 pl-2">{index}</span> : null}
      </div>

      <div className="relative flex min-h-[132px] flex-1 items-center justify-center overflow-hidden bg-white text-sploot-ink">
        {src ? (
          <Image
            src={src}
            alt={caption || file}
            fill
            sizes="(max-width: 640px) 50vw, 240px"
            className="object-contain"
            unoptimized
          />
        ) : doodle ? (
          <MemeDoodle kind={doodle} className="max-h-[120px]" />
        ) : null}
      </div>

      {caption || ((isMatch || isNear) && score) ? (
        <div className="flex items-start justify-between gap-2 border-t-[3px] border-sploot-ink px-2 py-1.5">
          {caption ? (
            <p className="font-mono text-[0.62rem] lowercase leading-tight text-sploot-ink">
              {caption}
            </p>
          ) : <span />}
          {(isMatch || isNear) && score ? (
            <span className={cn('shrink-0 font-mono text-[0.58rem] font-bold', isMatch ? 'text-sploot-ink' : 'text-sploot-orange')}>
              sim {score}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
