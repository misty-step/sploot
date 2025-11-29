'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchAssets } from '@/hooks/use-assets';
import { SearchBar } from './search-bar';

interface SearchBarWithResultsProps {
  onResultsChange?: (results: any[]) => void;
  className?: string;
}

export function SearchBarWithResults({
  onResultsChange,
  className = '',
}: SearchBarWithResultsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const { assets, loading, error, total, metadata } = useSearchAssets(debouncedQuery, {
    limit: 20,
    threshold: 0.2,
  });

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Notify parent component when results change
  useEffect(() => {
    if (onResultsChange) {
      onResultsChange(assets);
    }
  }, [assets, onResultsChange]);

  const handleSearch = useCallback((searchCommand: { query: string; timestamp: number; updateUrl?: boolean }) => {
    setSearchQuery(searchCommand.query);
  }, []);

  return (
    <div className={`relative ${className}`}>
      <SearchBar
        onSearch={handleSearch}
        placeholder="Search your memes..."
        className="mb-2"
        initialQuery={searchQuery}
      />

      {/* Search status */}
      {debouncedQuery && (
        <div className="mt-8 text-sm text-muted-foreground">
          {loading && (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4 text-primary"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Searching for &ldquo;{debouncedQuery}&rdquo;...
            </span>
          )}

          {!loading && !error && (
            <span>
              Found <span className="text-green-500 font-semibold">{total}</span> results
              for &ldquo;<span className="text-foreground">{debouncedQuery}</span>&rdquo;
              {metadata?.thresholdFallback && (
                <span className="ml-2 text-orange-400">
                  Showing additional matches below {Math.round((metadata.requestedThreshold ?? 0) * 100)}% similarity
                </span>
              )}
            </span>
          )}

          {error && (
            <span className="text-destructive">
              Error: {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
