'use client';

import { cn } from '@/lib/utils';
import type { SemanticPile } from '@/lib/types';

const MIN_VISIBLE_CONFIDENCE = 0.34;
const MAYBE_CONFIDENCE = 0.56;

type PileFilterRailProps = {
  piles: SemanticPile[];
  total: number;
  embeddedAssetCount: number;
  selectedPileId: string | null;
  onSelectPile: (pileId: string | null) => void;
  className?: string;
};

export function visiblePileFilters(piles: SemanticPile[]): SemanticPile[] {
  return piles.filter((pile) => pile.confidence >= MIN_VISIBLE_CONFIDENCE);
}

function pileLabel(pile: SemanticPile): string {
  return pile.confidence < MAYBE_CONFIDENCE ? `maybe ${pile.label}` : pile.label;
}

export function PileFilterRail({
  piles,
  total,
  embeddedAssetCount,
  selectedPileId,
  onSelectPile,
  className,
}: PileFilterRailProps) {
  const visiblePiles = visiblePileFilters(piles);
  if (piles.length === 0) return null;

  return (
    <section
      aria-label="pile filters"
      className={cn('flex min-w-0 items-center gap-2 overflow-x-auto pb-1', className)}
    >
      <button
        type="button"
        onClick={() => onSelectPile(null)}
        aria-pressed={selectedPileId === null}
        data-pile-filter-id="all"
        className={cn(
          'sploot-press-sm sploot-shadow-sm flex min-h-[42px] shrink-0 flex-col justify-center rounded-[var(--sploot-radius-pill)] border-[3px] border-sploot-ink px-4 py-1.5 text-left font-mono text-xs font-bold lowercase',
          selectedPileId === null
            ? 'bg-sploot-yellow text-sploot-ink'
            : 'bg-sploot-panel text-sploot-ink'
        )}
      >
        <span className="block font-bold">all memes</span>
        <span className="block text-[0.65rem] opacity-75">
          {total.toLocaleString()} total
        </span>
      </button>

      {visiblePiles.map((pile) => {
        const selected = selectedPileId === pile.id;
        return (
          <button
            key={pile.id}
            type="button"
            onClick={() => onSelectPile(selected ? null : pile.id)}
            aria-pressed={selected}
            data-pile-filter-id={pile.id}
            className={cn(
              'sploot-press-sm sploot-shadow-sm flex min-h-[42px] shrink-0 flex-col justify-center rounded-[var(--sploot-radius-pill)] border-[3px] border-sploot-ink px-4 py-1.5 text-left font-mono text-xs font-bold lowercase',
              selected
                ? 'bg-sploot-yellow text-sploot-ink'
                : 'bg-sploot-panel text-sploot-ink'
            )}
          >
            <span className="block max-w-[11rem] truncate font-bold">
              {pileLabel(pile)}
            </span>
            <span className="block text-[0.65rem] opacity-75">
              {pile.count.toLocaleString()} in pile · {embeddedAssetCount.toLocaleString()} embedded
            </span>
          </button>
        );
      })}
    </section>
  );
}
