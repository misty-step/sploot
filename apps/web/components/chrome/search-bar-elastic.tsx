'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useSlashSearchShortcut } from '@/hooks/use-keyboard-shortcut';

interface SearchBarElasticProps {
  collapsedWidth?: number;
  expandedWidth?: number;
  placeholder?: string;
  className?: string;
  onSearch?: (query: string) => void;
  autoCollapse?: boolean;
}

/**
 * Elastic search bar that expands on focus
 * Uses shadcn Input with expansion animation
 */
export function SearchBarElastic({
  collapsedWidth = 200,
  expandedWidth = 400,
  placeholder = 'Search memes...',
  className,
  onSearch,
  autoCollapse = true,
}: SearchBarElasticProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize query from URL
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery) {
      setQuery(urlQuery);
      setIsExpanded(true);
    }
  }, [searchParams]);

  // Add "/" keyboard shortcut to focus search
  useSlashSearchShortcut(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  });

  // Handle click outside to collapse
  useEffect(() => {
    if (!autoCollapse) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
        if (!query) {
          setIsExpanded(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [query, autoCollapse]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setIsSearching(true);

    // Update URL with search query
    const params = new URLSearchParams(searchParams.toString());
    params.set('q', query.trim());
    router.push(`/app?${params.toString()}`);

    // Call onSearch callback if provided
    onSearch?.(query.trim());

    // Reset searching state after animation
    setTimeout(() => {
      setIsSearching(false);
    }, 300);
  }, [query, searchParams, router, onSearch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      inputRef.current?.blur();
      setIsFocused(false);
      if (autoCollapse) {
        setIsExpanded(false);
      }
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setIsExpanded(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (autoCollapse && !query) {
      // Delay collapse to allow for click events
      setTimeout(() => {
        if (!isFocused && !query) {
          setIsExpanded(false);
        }
      }, 200);
    }
  };

  const clearSearch = () => {
    setQuery('');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    const newUrl = params.toString() ? `/app?${params}` : '/app';
    router.push(newUrl);
    inputRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center',
        'transition-[width] duration-[180ms] will-change-[width]',
        className
      )}
      style={{
        width: isExpanded ? expandedWidth : collapsedWidth,
        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Search Icon */}
      <div className="absolute left-3 pointer-events-none z-10">
        <Search className={cn(
          'size-4',
          isFocused ? 'text-primary' : 'text-muted-foreground'
        )} />
      </div>

      {/* Input Field */}
      <Input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          'w-full h-10 pl-10 pr-20 font-mono',
          isSearching && 'animate-pulse'
        )}
        aria-label="Search"
      />

      {/* Search State Badge */}
      {isSearching && (
        <Badge
          variant="outline"
          className="absolute right-10 pointer-events-none"
        >
          Searching...
        </Badge>
      )}

      {/* Clear Button */}
      {query && !isSearching && (
        <button
          onClick={clearSearch}
          className={cn(
            'absolute right-3 p-1',
            'text-muted-foreground hover:text-destructive',
            'transition-colors'
          )}
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}

      {/* Keyboard Shortcut Hint */}
      {!isFocused && !query && !isSearching && (
        <div className="absolute right-3 pointer-events-none">
          <kbd className="px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground bg-background border border-border rounded">
            /
          </kbd>
        </div>
      )}
    </div>
  );
}

/**
 * Minimal search trigger button that expands into full search bar
 * Useful for mobile or space-constrained layouts
 */
export function SearchTrigger({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'p-2.5',
        'bg-secondary hover:bg-secondary/80',
        'text-secondary-foreground hover:text-primary',
        'transition-all duration-200',
        'group',
        className
      )}
      aria-label="Search"
    >
      <Search className="size-5 transition-transform group-hover:scale-110" />
    </button>
  );
}
