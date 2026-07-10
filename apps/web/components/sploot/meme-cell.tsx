import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MemeDoodle, type MemeDoodleKind } from './meme-doodle';

export type MemeCellState =
  | 'default'
  | 'near'
  | 'match'
  | 'dim'
  | 'selected'
  | 'loading'
  | 'error';

interface MemeCellProps {
  /** Filename shown in the candy tab header, e.g. "IMG_4471.png" */
  file: string;
  /** Vector index shown next to the filename, e.g. "v#00471" */
  index?: string;
  /** Inner glyph for the license-safe meme stand-in (styleguide/state surfaces). */
  doodle?: MemeDoodleKind;
  /** Real media source; when set it replaces the doodle, complete and uncropped. */
  src?: string;
  /** Alt text for real media (required in spirit whenever src is set). */
  mediaAlt?: string;
  /** Lowercase caption describing what is in the meme. */
  caption?: string;
  /** Cosine score shown in the caption row, e.g. "0.91". */
  score?: string;
  state?: MemeCellState;
  /** Disable the match scale-up (the styleguide renders a static catalog). */
  animate?: boolean;
  /** Retry handler for the error state. */
  onRetry?: () => void;
  className?: string;
}

// The card-hover treatment, defined once (integrator ruling): the surface
// lifts and rotates while the drop stays anchored and extends
// (var(--sploot-shadow) → 3px 8px 0). Tokens only; reduced-motion is covered
// by the global prefers-reduced-motion rule that zeroes transitions. State
// rings ride on `outline` so the box-shadow stays a single drop.
const CARD_HOVER =
  'sploot-shadow transition-[transform,box-shadow,opacity,filter] duration-[var(--sploot-motion-base)] ease-[var(--sploot-ease-snap)] hover:-translate-x-[2px] hover:-translate-y-[3px] hover:rotate-[-0.3deg] hover:shadow-[3px_8px_0_var(--sploot-shadow-color)]';

// The candy tab header rotates through committed candy tokens that hold AA with
// dark #1c1547 text in BOTH themes (integrator ruling). Lime, grape, and blue
// are dropped from the rotation because no single text color holds across the
// light/dark flip on those fills. The color is a stable hash of the filename so
// a given card keeps its color.
const TAB_TONES = ['bg-sploot-cyan', 'bg-sploot-magenta', 'bg-sploot-yellow', 'bg-sploot-orange'];

function tabTone(file: string): string {
  let hash = 0;
  for (let i = 0; i < file.length; i += 1) {
    hash = (hash * 31 + file.charCodeAt(i)) >>> 0;
  }
  return TAB_TONES[hash % TAB_TONES.length];
}

/**
 * One toy card in the pile (lab-034 AFD-8): a 3px ink shell with rounded
 * corners and a drop, a candy tab header, an inner 2px media frame that keeps
 * the meme uncropped, and a caption row with the mono score. State drives the
 * reveal — every marker renders inside the card so it lifts with it on hover.
 *   match    -> lime match-ring + "match" chip
 *   near     -> dashed orange outline
 *   dim      -> recede (low opacity + desaturated)
 *   selected -> grape ring
 *   loading  -> dimmed media + "cooking" note
 *   error    -> red shell + retry
 *   default  -> resting
 */
export function MemeCell({
  file,
  index,
  doodle,
  src,
  mediaAlt,
  caption,
  score,
  state = 'default',
  animate = true,
  onRetry,
  className,
}: MemeCellProps) {
  const isMatch = state === 'match';
  const isNear = state === 'near';
  const isSelected = state === 'selected';
  const isDim = state === 'dim';
  const isLoading = state === 'loading';
  const isError = state === 'error';

  return (
    <article
      className={cn(
        'group relative flex min-h-[210px] flex-col overflow-hidden rounded-[var(--sploot-radius)] border-[3px] bg-sploot-panel',
        CARD_HOVER,
        isError ? 'border-sploot-red' : 'border-sploot-ink',
        isMatch && 'z-10 outline outline-4 outline-offset-0 outline-sploot-lime',
        isMatch && animate && 'scale-[1.02]',
        isNear && 'outline outline-[3px] outline-dashed outline-offset-2 outline-sploot-orange',
        isSelected && 'outline outline-4 outline-offset-0 outline-sploot-purple',
        isDim && 'opacity-45 saturate-[.25]',
        className
      )}
    >
      {isMatch && (
        <span
          className={cn(
            'absolute right-2 top-2 z-20 rounded-[var(--sploot-radius-pill)] border-2 border-sploot-ink bg-sploot-lime px-2 py-0.5 font-mono text-[0.6rem] font-bold lowercase text-[#1c1547]',
            animate && 'animate-sploot-stamp'
          )}
        >
          match
        </span>
      )}

      <div
        className={cn(
          'flex items-center justify-between gap-2 border-b-[3px] border-sploot-ink px-2.5 py-1.5 font-mono text-[0.6rem] font-bold text-[#1c1547]',
          tabTone(file)
        )}
      >
        <span className="truncate">{file}</span>
        {index ? <span className="shrink-0 pl-2">{index}</span> : null}
      </div>

      <div className="relative m-2 flex flex-1 items-center justify-center overflow-hidden rounded-[var(--sploot-radius-inner)] border-2 border-sploot-ink bg-sploot-paper-warm p-3 text-sploot-ink">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- static demo media, no optimizer needed
          <img
            src={src}
            alt={mediaAlt ?? caption ?? file}
            className={cn('max-h-[220px] w-auto max-w-full object-contain', isLoading && 'opacity-35')}
            loading="lazy"
          />
        ) : (
          <MemeDoodle kind={doodle ?? 'cat'} className={cn('max-h-[120px] object-contain', isLoading && 'opacity-35')} />
        )}
      </div>

      {isLoading ? (
        <p className="border-t-2 border-dashed border-sploot-ink px-2.5 py-1.5 font-mono text-[0.6rem] lowercase text-sploot-ink">
          cooking…
        </p>
      ) : isError ? (
        <div className="flex items-center justify-between gap-2 border-t-2 border-dashed border-sploot-ink px-2.5 py-1.5">
          <span className="font-mono text-[0.6rem] lowercase text-sploot-red">
            this one borked.
          </span>
          {onRetry ? (
            <Button type="button" variant="compact" size="sm" onClick={onRetry}>
              retry
            </Button>
          ) : null}
        </div>
      ) : caption ? (
        <div className="flex items-center justify-between gap-2 border-t-[3px] border-sploot-ink px-2.5 py-1.5">
          <p className="min-w-0 flex-1 truncate font-sans text-[0.72rem] font-bold lowercase leading-tight text-sploot-ink">
            {caption}
          </p>
          {score ? (
            <b className="shrink-0 font-mono text-[0.58rem] font-bold text-sploot-ink sploot-tabular">
              {score}
            </b>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
