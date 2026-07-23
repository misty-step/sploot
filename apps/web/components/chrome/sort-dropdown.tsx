'use client';

import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp, ArrowDownAZ, ArrowUpAZ, Heart } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/sploot/icon-button';
import type { AssetSortBy, AssetSortDirection } from '@sploot/common';

export type SortOption = AssetSortBy;
export type SortDirection = AssetSortDirection;

interface SortDropdownProps {
  value?: SortOption;
  direction?: SortDirection;
  onChange?: (option: SortOption, direction: SortDirection) => void;
  className?: string;
}

/**
 * Sort dropdown component for the footer
 * Displays "recent ↓" by default with options for date/size/name sorting
 */
export function SortDropdown({
  value = 'createdAt',
  direction = 'desc',
  onChange,
  className,
}: SortDropdownProps) {
  // Sort option configurations
  const sortOptions: Array<{ value: Exclude<SortOption, 'shuffle'>; label: string }> = [
    { value: 'createdAt', label: 'RECENT' },
    { value: 'updatedAt', label: 'UPDATED' },
    { value: 'size', label: 'SIZE' },
    { value: 'pathname', label: 'NAME' },
    { value: 'taste', label: 'TASTE' },
  ];
  const selectedValue = value === 'shuffle' ? 'createdAt' : value;

  // Handle sort option selection
  const handleSortChange = (newValue: string) => {
    const option = newValue as SortOption;

    // If selecting the same option, toggle direction
    // Otherwise, use default direction for that option
    const newDirection =
      option === 'taste'
        ? 'desc'
        : option === selectedValue
        ? direction === 'desc' ? 'asc' : 'desc'
        : option === 'pathname' ? 'asc' : 'desc'; // Name defaults to A-Z, others to newest/largest first

    if (onChange) {
      onChange(option, newDirection);
    }
  };

  // Get display label for current sort
  const getCurrentLabel = () => {
    const option = sortOptions.find((o) => o.value === selectedValue);
    return option ? option.label : 'Recent';
  };

  const ArrowIcon = selectedValue === 'taste' ? Heart : direction === 'desc' ? ArrowDown : ArrowUp;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'min-w-0 gap-1 font-mono uppercase tracking-normal',
            className
          )}
          aria-label="Sort options"
          title={`Sort by ${getCurrentLabel()}`}
        >
          <span>{getCurrentLabel()}</span>
          <ArrowIcon className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-[160px]">
        <DropdownMenuLabel className="font-mono uppercase text-xs">SORT BY</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={selectedValue} onValueChange={handleSortChange}>
          {sortOptions.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="gap-2"
            >
              <span className="flex-1">{option.label}</span>
              {selectedValue === option.value && option.value !== 'taste' && (
                <span className="text-xs text-muted-foreground">
                  {direction === 'desc' ? '↓' : '↑'}
                </span>
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <p className="text-xs text-muted-foreground">
            click again to reverse order
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Compact sort button for mobile/compact layouts
 * Shows only icon with current sort direction
 */
export function SortButtonCompact({
  value = 'createdAt',
  direction = 'desc',
  onClick,
  className,
}: {
  value?: SortOption;
  direction?: SortDirection;
  onClick?: () => void;
  className?: string;
}) {
  const Icon = value === 'taste'
    ? Heart
    : direction === 'desc'
    ? (value === 'pathname' ? ArrowDownAZ : ArrowDown)
    : (value === 'pathname' ? ArrowUpAZ : ArrowUp);

  return (
    <IconButton
      label={`Sort by ${value}`}
      size="compact"
      onClick={onClick}
      className={className}
    >
      <Icon />
    </IconButton>
  );
}
