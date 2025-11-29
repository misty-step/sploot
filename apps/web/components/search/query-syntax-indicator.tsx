'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

interface QuerySyntaxIndicatorProps {
  query: string;
  resultCount: number;
  filters?: {
    favorites?: boolean;
    tagName?: string;
  };
  latencyMs?: number;
  className?: string;
}

/**
 * Query syntax breakdown with semantic badges
 * Shows parsed query, active filters, result count, and search latency
 * Provides tooltip help for search syntax
 */
export function QuerySyntaxIndicator({
  query,
  resultCount,
  filters,
  latencyMs,
  className,
}: QuerySyntaxIndicatorProps) {
  const hasFilters = filters?.favorites || filters?.tagName;
  const hasResults = resultCount > 0;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2',
        className
      )}
    >
      {/* Query Badge */}
      <Badge variant="outline" className="gap-1.5 font-mono">
        <span className="text-muted-foreground">query:</span>
        <span>&quot;{query}&quot;</span>
      </Badge>

      {/* Filters Badge */}
      {hasFilters && (
        <Badge variant="secondary" className="gap-1.5 font-mono text-yellow-500">
          <span className="text-muted-foreground">filters:</span>
          <span>
            {filters.favorites && 'favorites'}
            {filters.favorites && filters.tagName && ', '}
            {filters.tagName && `#${filters.tagName}`}
          </span>
        </Badge>
      )}

      {/* Results Badge - variant based on result count */}
      <Badge
        variant={hasResults ? 'default' : 'destructive'}
        className={cn(
          'gap-1.5 font-mono',
          hasResults && 'bg-green-500 hover:bg-green-500/80 text-white'
        )}
      >
        <span className="opacity-80">results:</span>
        <span className="font-semibold">{resultCount}</span>
      </Badge>

      {/* Latency Badge */}
      {latencyMs !== undefined && (
        <Badge variant="outline" className="gap-1.5 font-mono text-muted-foreground">
          <span>latency:</span>
          <span>{(latencyMs / 1000).toFixed(2)}s</span>
        </Badge>
      )}

      {/* Syntax Help Tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Search syntax help"
          >
            <HelpCircle className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1.5 text-xs">
            <p className="font-semibold">Search Syntax</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Type any text to search</li>
              <li>• Use quotes for exact phrases</li>
              <li>• Filters can be combined</li>
              <li>• Results ranked by similarity</li>
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
