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
      className={cn('gap-1', className)}
      size={toggleSize}
    >
      <ToggleGroupItem
        value="all"
        aria-label="all"
        title="all"
        className={cn(
          "gap-1.5 brutalist-border uppercase tracking-wider",
          activeFilter === 'all' ? 'border-electric-lime' : 'border-muted-foreground'
        )}
      >
        {showLabels && <span>all</span>}
      </ToggleGroupItem>

      <ToggleGroupItem
        value="bangers"
        aria-label="bangers"
        title="bangers"
        className={cn(
          "gap-1.5 brutalist-border uppercase tracking-wider",
          activeFilter === 'bangers' ? 'border-hot-pink' : 'border-muted-foreground'
        )}
      >
        <Heart
          className="h-4 w-4"
          fill={activeFilter === 'bangers' ? 'currentColor' : 'none'}
          strokeWidth={2}
        />
        {showLabels && <span>bangers</span>}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/**
 * Single filter chip for custom layouts
 * Can be used independently for more flexible positioning
 * @deprecated Use ToggleGroup directly for better accessibility and state management
 */
export function FilterChip({
  label,
  icon,
  isActive = false,
  onClick,
  className,
  size = 'md',
}: {
  label: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  // Map custom size to ToggleGroup size prop
  const toggleSize = size === 'md' ? 'default' : size === 'lg' ? 'lg' : 'sm';

  return (
    <ToggleGroup
      type="single"
      value={isActive ? 'active' : undefined}
      onValueChange={onClick ? () => onClick() : undefined}
      className={className}
      size={toggleSize}
    >
      <ToggleGroupItem value="active" className="gap-1.5">
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span>{label}</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
