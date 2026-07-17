'use client';

import {
  ArrowDown,
  ArrowDownAZ,
  ArrowUp,
  ArrowUpAZ,
  Heart,
  Search,
  Shuffle,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import type { AssetSortBy, AssetSortDirection } from '@sploot/common';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useHydrated } from '@/hooks/use-hydrated';

export type MobileFilter = 'all' | 'bangers';

interface MobileCommandDockProps {
  activeFilter: MobileFilter;
  failedEmbeddingsCount?: number;
  isSearchOpen: boolean;
  isShuffleActive: boolean;
  isUploadOpen: boolean;
  onFilterChange: (filter: MobileFilter) => void;
  onRetryFailed?: () => void;
  onSearchToggle: () => void;
  onShuffle: () => void;
  onSortChange: (option: AssetSortBy, direction: AssetSortDirection) => void;
  onUploadClick: () => void;
  sortBy: AssetSortBy;
  sortOrder: AssetSortDirection;
}

const sortOptions: Array<{ value: Exclude<AssetSortBy, 'shuffle'>; label: string }> = [
  { value: 'createdAt', label: 'recent' },
  { value: 'updatedAt', label: 'updated' },
  { value: 'size', label: 'size' },
  { value: 'pathname', label: 'name' },
  { value: 'taste', label: 'taste' },
];

function getSortLabel(sortBy: AssetSortBy) {
  if (sortBy === 'shuffle') return 'recent';
  return sortOptions.find((option) => option.value === sortBy)?.label ?? 'sort';
}

function renderSortIcon(sortBy: AssetSortBy, sortOrder: AssetSortDirection) {
  if (sortBy === 'shuffle') return <ArrowDown className="h-5 w-5" />;
  if (sortBy === 'taste') return <Heart className="h-5 w-5" />;
  if (sortBy === 'pathname') {
    return sortOrder === 'desc'
      ? <ArrowDownAZ className="h-5 w-5" />
      : <ArrowUpAZ className="h-5 w-5" />;
  }

  return sortOrder === 'desc'
    ? <ArrowDown className="h-5 w-5" />
    : <ArrowUp className="h-5 w-5" />;
}

export function MobileCommandDock({
  activeFilter,
  failedEmbeddingsCount = 0,
  isSearchOpen,
  isShuffleActive,
  isUploadOpen,
  onFilterChange,
  onRetryFailed,
  onSearchToggle,
  onShuffle,
  onSortChange,
  onUploadClick,
  sortBy,
  sortOrder,
}: MobileCommandDockProps) {
  const isUploadActionReady = useHydrated();

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-sploot-ink bg-background px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1.5">
        <Button
          variant={isUploadOpen ? 'accent' : 'outline'}
          size="icon"
          onClick={onUploadClick}
          className="h-12 w-full"
          aria-pressed={isUploadOpen}
          aria-label="UPLOAD"
          data-upload-action-ready={isUploadActionReady ? 'true' : 'false'}
        >
          <Upload className="h-5 w-5" />
        </Button>

        <Button
          variant={isSearchOpen ? 'accent' : 'outline'}
          size="icon"
          onClick={onSearchToggle}
          className="h-12 w-full"
          aria-pressed={isSearchOpen}
          aria-label={isSearchOpen ? 'hide search' : 'search memes'}
        >
          <Search className="h-5 w-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={activeFilter === 'bangers' ? 'accent' : 'outline'}
              size="icon"
              className="h-12 w-full"
              aria-label="filter memes"
            >
              {activeFilter === 'bangers' ? (
                <Heart className="h-5 w-5 fill-current" />
              ) : (
                <SlidersHorizontal className="h-5 w-5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-44">
            <DropdownMenuLabel className="font-mono text-xs uppercase">filter</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={activeFilter}
              onValueChange={(value) => onFilterChange(value as MobileFilter)}
            >
              <DropdownMenuRadioItem value="all">all memes</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="bangers">
                <Heart className={cn('h-4 w-4', activeFilter === 'bangers' && 'fill-current')} />
                bangers
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-full"
              aria-label={`sort memes by ${getSortLabel(sortBy)}`}
            >
              {renderSortIcon(sortBy, sortOrder)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-44">
            <DropdownMenuLabel className="font-mono text-xs uppercase">sort</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sortBy === 'shuffle' ? 'createdAt' : sortBy}
              onValueChange={(value) => {
                const option = value as Exclude<AssetSortBy, 'shuffle'>;
                const nextDirection =
                  option === 'taste'
                    ? 'desc'
                    : option === sortBy
                    ? sortOrder === 'desc' ? 'asc' : 'desc'
                    : option === 'pathname' ? 'asc' : 'desc';
                onSortChange(option, nextDirection);
              }}
            >
              {sortOptions.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  <span className="flex-1">{option.label}</span>
                  {sortBy === option.value && option.value !== 'taste' && (
                    <span className="text-xs text-muted-foreground">
                      {sortOrder === 'desc' ? '↓' : '↑'}
                    </span>
                  )}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant={isShuffleActive ? 'accent' : 'outline'}
          size="icon"
          onClick={onShuffle}
          className="h-12 w-full"
          aria-pressed={isShuffleActive}
          aria-label="shuffle memes"
        >
          <Shuffle className="h-5 w-5" />
        </Button>
      </div>

      {failedEmbeddingsCount > 0 && onRetryFailed && (
        <Button
          variant="accent"
          size="sm"
          onClick={onRetryFailed}
          className="mx-auto mt-2 flex min-h-[var(--sploot-touch-target)] max-w-md gap-2 font-mono text-xs uppercase tracking-wider"
        >
          retry {failedEmbeddingsCount}
        </Button>
      )}
    </div>
  );
}
