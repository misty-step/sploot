'use client';

import { RotateCcw, Shuffle, Upload } from 'lucide-react';
import type { AssetSortBy, AssetSortDirection } from '@sploot/common';
import type { SemanticPile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/search';
import { visiblePileFilters } from './pile-filter-rail';
import { GalleryPipeline, type GalleryPipelineState } from './gallery-pipeline';
import { QueryTokenHighlight } from './query-token-highlight';
import { cn } from '@/lib/utils';
import { useHydrated } from '@/hooks/use-hydrated';

interface GallerySpineProps {
  query: string;
  searchState: GalleryPipelineState;
  searchResultCount?: number;
  searchLatencyMs?: number;
  searchModel?: string;
  searchCached?: boolean;
  searchError?: string | null;
  piles: SemanticPile[];
  total: number;
  embeddedAssetCount: number;
  selectedPileId: string | null;
  onSearch: (command: { query: string; timestamp: number; updateUrl?: boolean }) => void;
  onSelectPile: (pileId: string | null) => void;
  onUpload: () => void;
  onShuffle: () => void;
  onRetry?: () => void;
  retryCount?: number;
  sortBy: AssetSortBy;
  sortOrder: AssetSortDirection;
  onSortChange: (option: AssetSortBy, direction: AssetSortDirection) => void;
}

function pileLabel(pile: SemanticPile) {
  return pile.confidence < 0.56 ? `maybe ${pile.label}` : pile.label;
}

export function GallerySpine({
  query,
  searchState,
  searchResultCount,
  searchLatencyMs,
  searchModel,
  searchCached,
  searchError,
  piles,
  total,
  embeddedAssetCount,
  selectedPileId,
  onSearch,
  onSelectPile,
  onUpload,
  onShuffle,
  onRetry,
  retryCount = 0,
  sortBy,
  sortOrder,
  onSortChange,
}: GallerySpineProps) {
  const visiblePiles = visiblePileFilters(piles);
  const isUploadActionReady = useHydrated();

  return (
    <aside
      aria-label="gallery index spine"
      className="hidden h-full w-[19rem] shrink-0 flex-col overflow-y-auto border-r-[3px] border-sploot-ink bg-sploot-panel md:flex"
    >
      <div className="flex items-baseline justify-between gap-3 border-b-[3px] border-sploot-ink px-4 py-3">
        <h1 className="font-display text-xl font-normal lowercase">the pile</h1>
        <span className="font-mono text-[0.6rem] lowercase text-muted-foreground">brut-1 · index</span>
      </div>

      <div className="border-b-[3px] border-sploot-ink p-3">
        <SearchBar
          onSearch={onSearch}
          inline
          initialQuery={query}
          searchState={searchState === 'ready' ? 'success' : searchState}
          resultCount={searchResultCount ?? 0}
          placeholder="type words. get the picture."
        />
        <p className="mt-2 flex items-center justify-between gap-2 font-mono text-[0.6rem] lowercase text-muted-foreground">
          <span>hotkeys</span>
          <span className="tabular-nums">/ focus · esc clear · enter search</span>
        </p>
        <QueryTokenHighlight query={query} />
      </div>

      <GalleryPipeline
        state={searchState}
        query={query}
        resultCount={searchResultCount}
        latencyMs={searchLatencyMs}
        model={searchModel}
        cached={searchCached}
        error={searchError}
      />

      <section aria-labelledby="gallery-piles-heading" className="border-b-[3px] border-sploot-ink">
        <h2 id="gallery-piles-heading" className="border-b-2 border-dashed border-sploot-ink px-4 py-2 font-mono text-[0.6rem] font-bold lowercase">
          piles
        </h2>
        <button
          type="button"
          aria-pressed={selectedPileId === null}
          onClick={() => onSelectPile(null)}
          className={cn(
            'flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left font-sans text-sm font-bold lowercase hover:bg-sploot-yellow focus-visible:outline focus-visible:outline-4 focus-visible:outline-sploot-focus',
            selectedPileId === null && 'bg-sploot-yellow text-sploot-on-yellow'
          )}
        >
          <span>all memes</span>
          <span className="font-mono text-[0.6rem] tabular-nums">{total.toLocaleString()}</span>
        </button>
        {visiblePiles.map((pile) => {
          const selected = pile.id === selectedPileId;
          return (
            <button
              key={pile.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectPile(selected ? null : pile.id)}
              className={cn(
                'flex min-h-11 w-full items-center justify-between gap-3 border-t-2 border-sploot-ink px-4 py-2 text-left font-sans text-sm font-bold lowercase hover:bg-sploot-yellow focus-visible:outline focus-visible:outline-4 focus-visible:outline-sploot-focus',
                selected && 'bg-sploot-yellow text-sploot-on-yellow'
              )}
            >
              <span className="truncate">{pileLabel(pile)}</span>
              <span className="shrink-0 font-mono text-[0.6rem] tabular-nums">{pile.count.toLocaleString()}</span>
            </button>
          );
        })}
        {piles.length === 0 ? <p className="px-4 py-3 font-mono text-[0.65rem] lowercase text-muted-foreground">—</p> : null}
      </section>

      <dl className="border-b-[3px] border-sploot-ink px-4 py-3 font-mono text-[0.65rem] lowercase">
        <div className="flex justify-between gap-3 py-1"><dt>library</dt><dd className="tabular-nums">{total.toLocaleString()}</dd></div>
        <div className="flex justify-between gap-3 py-1"><dt>embedded</dt><dd className="tabular-nums">{embeddedAssetCount.toLocaleString()}</dd></div>
        <div className="flex justify-between gap-3 py-1"><dt>sort</dt><dd>{sortBy}{sortBy !== 'shuffle' ? ` · ${sortOrder}` : ''}</dd></div>
      </dl>

      <div className="mt-auto flex flex-col gap-2 p-3">
        <Button
          type="button"
          variant="primary"
          onClick={onUpload}
          className="w-full justify-center gap-2"
          aria-label="UPLOAD"
          data-upload-action-ready={isUploadActionReady ? 'true' : 'false'}
        >
          <Upload className="h-4 w-4" /> upload
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onShuffle} className="gap-2">
            <Shuffle className="h-4 w-4" /> shuffle
          </Button>
          {retryCount > 0 && onRetry ? (
            <Button type="button" variant="accent" onClick={onRetry} className="gap-2">
              <RotateCcw className="h-4 w-4" /> retry {retryCount}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => onSortChange(sortBy === 'createdAt' ? 'updatedAt' : 'createdAt', sortOrder)}
              className="justify-center font-mono text-xs lowercase"
            >
              sort
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
