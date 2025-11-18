'use client';

import { cn } from '@/lib/utils';
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
import { ArrowDown, ArrowUp, ArrowDownAZ, ArrowUpAZ, Shuffle } from 'lucide-react';

export type SortOption = 'recent' | 'date' | 'size' | 'name' | 'shuffle';
export type SortDirection = 'asc' | 'desc';

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
  value = 'recent',
  direction = 'desc',
  onChange,
  className,
}: SortDropdownProps) {
  // Sort option configurations
  const sortOptions: Array<{ value: SortOption; label: string }> = [
    { value: 'recent', label: 'RECENT' },
    { value: 'date', label: 'DATE' },
    { value: 'size', label: 'SIZE' },
    { value: 'name', label: 'NAME' },
    { value: 'shuffle', label: 'SHUFFLE' },
  ];

  // Handle sort option selection
  const handleSortChange = (newValue: string) => {
    const option = newValue as SortOption;

    // If selecting the same option, toggle direction
    // Otherwise, use default direction for that option
    const newDirection =
      option === value
        ? direction === 'desc' ? 'asc' : 'desc'
        : option === 'name' ? 'asc' : 'desc'; // Name defaults to A-Z, others to newest/largest first

    if (onChange) {
      onChange(option, newDirection);
    }
  };

  // Get display label for current sort
  const getCurrentLabel = () => {
    const option = sortOptions.find((o) => o.value === value);
    return option ? option.label : 'Recent';
  };

  // Get arrow icon component for current direction
  const ArrowIcon = value === 'shuffle' ? Shuffle : direction === 'desc' ? ArrowDown : ArrowUp;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className={cn(
            'gap-1 border border-border font-mono uppercase tracking-wider hover:border-accent-cyan',
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
        <DropdownMenuRadioGroup value={value} onValueChange={handleSortChange}>
          {sortOptions.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="gap-2"
            >
              <span className="flex-1">{option.label}</span>
              {value === option.value && option.value !== 'shuffle' && (
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
  value = 'recent',
  direction = 'desc',
  onClick,
  className,
}: {
  value?: SortOption;
  direction?: SortDirection;
  onClick?: () => void;
  className?: string;
}) {
  const Icon = direction === 'desc'
    ? (value === 'name' ? ArrowDownAZ : ArrowDown)
    : (value === 'name' ? ArrowUpAZ : ArrowUp);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={className}
      aria-label={`Sort by ${value}`}
      title={`Sort by ${value}`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
