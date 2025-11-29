'use client';

import { cn } from '@/lib/utils';
import { useAnimatedNumber, formatWithCommas, useAnimatedSize } from '@/hooks/use-animated-number';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface StatsDisplayProps {
  totalAssets?: number;
  favoriteCount?: number;
  totalSizeBytes?: number;
  className?: string;
  showLabels?: boolean;
}

/**
 * Stats display component using shadcn Badge components
 * Format: "247 ASSETS | 12 FAVORITES | 843MB"
 * Uses monospace typography and pipe separators
 */
export function StatsDisplay({
  totalAssets = 0,
  favoriteCount = 0,
  totalSizeBytes = 0,
  className,
  showLabels = true,
}: StatsDisplayProps) {
  // Animate the numbers with 300ms morphing effect
  const animatedAssets = useAnimatedNumber(totalAssets, {
    duration: 300,
    formatter: (n) => Math.round(n).toString(),
  });

  const animatedFavorites = useAnimatedNumber(favoriteCount, {
    duration: 300,
    formatter: (n) => Math.round(n).toString(),
  });

  const animatedSize = useAnimatedSize(totalSizeBytes, {
    duration: 300,
  });

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        className
      )}
    >
      <Badge variant="outline" className="font-mono text-xs tabular-nums">
        {animatedAssets}
        {showLabels && <span className="ml-1 text-muted-foreground">assets</span>}
      </Badge>
      <Separator orientation="vertical" className="h-4" />
      <Badge variant="outline" className="font-mono text-xs tabular-nums">
        {animatedFavorites}
        {showLabels && <span className="ml-1 text-muted-foreground">bangers</span>}
      </Badge>
      <Separator orientation="vertical" className="h-4" />
      <Badge variant="outline" className="font-mono text-xs tabular-nums">
        {animatedSize}
      </Badge>
    </div>
  );
}

/**
 * Compact stats display for mobile or space-constrained layouts
 * Monospace format without labels
 */
export function StatsCompact({
  totalAssets = 0,
  favoriteCount = 0,
  totalSizeBytes = 0,
  className,
}: StatsDisplayProps) {
  // Animate the numbers with 300ms morphing effect
  const animatedAssets = useAnimatedNumber(totalAssets, {
    duration: 300,
    formatter: (n) => Math.round(n).toString(),
  });

  const animatedFavorites = useAnimatedNumber(favoriteCount, {
    duration: 300,
    formatter: (n) => Math.round(n).toString(),
  });

  // Custom formatter for compact size display
  const formatSizeCompact = (bytes: number): string => {
    if (bytes === 0) return '0';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
      const kb = bytes / 1024;
      return `${Math.round(kb)}K`;
    }
    if (mb >= 1000) {
      const gb = mb / 1024;
      return `${gb.toFixed(1)}G`;
    }
    return `${Math.round(mb)}M`;
  };

  const animatedSize = useAnimatedNumber(totalSizeBytes, {
    duration: 300,
    formatter: formatSizeCompact,
  });

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        className
      )}
    >
      <Badge variant="outline" className="font-mono text-xs tabular-nums">
        {animatedAssets}
      </Badge>
      <Separator orientation="vertical" className="h-4" />
      <Badge variant="outline" className="font-mono text-xs tabular-nums">
        {animatedFavorites}
      </Badge>
      <Separator orientation="vertical" className="h-4" />
      <Badge variant="outline" className="font-mono text-xs tabular-nums">
        {animatedSize}
      </Badge>
    </div>
  );
}
