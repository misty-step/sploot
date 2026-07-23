'use client';

import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Heart } from 'lucide-react';

export type FilterType = 'all' | 'bangers';

interface FilterChipsProps {
  activeFilter?: FilterType;
  onFilterChange?: (filter: FilterType) => void;
  className?: string;
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Filter chips component using shadcn ToggleGroup
 * Shows "all" and "bangers" filters with single-selection behavior
 */
export function FilterChips({
  activeFilter = 'all',
  onFilterChange,
  className,
  showLabels = true,
  size = 'md',
}: FilterChipsProps) {
  // Map custom size to ToggleGroup size prop
  const toggleSize = size === 'md' ? 'default' : size === 'lg' ? 'lg' : 'sm';

  return (
    <ToggleGroup
      type="single"
      value={activeFilter}
      onValueChange={(value) => {
        if (value && onFilterChange) {
          onFilterChange(value as FilterType);
        }
      }}
      aria-label="filter memes"
      className={cn('gap-0', className)}
      variant="segmented"
      size={toggleSize}
    >
      <ToggleGroupItem
        value="all"
        aria-label="all"
        title="all"
        className={cn(
          'flex-1 justify-center gap-1.5 uppercase font-mono font-bold tracking-normal',
          'data-[state=on]:bg-sploot-cyan data-[state=on]:text-sploot-ink'
        )}
      >
        {showLabels && <span>ALL</span>}
      </ToggleGroupItem>

      <ToggleGroupItem
        value="bangers"
        aria-label="bangers"
        title="bangers"
        className={cn(
          'flex-1 justify-center gap-1.5 uppercase font-mono font-bold tracking-normal',
          'data-[state=on]:bg-sploot-magenta data-[state=on]:text-sploot-ink'
        )}
      >
        <Heart
          className="size-4"
          fill={activeFilter === 'bangers' ? 'currentColor' : 'none'}
          strokeWidth={2}
        />
        {showLabels && <span>BANGERS</span>}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

