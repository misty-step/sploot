'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface SimilarityScoreLegendProps {
  className?: string;
}

const STORAGE_KEY = 'sploot_similarity_legend_dismissed';

/**
 * Legend explaining similarity score color coding with badges
 * Shows on first search, dismissible with localStorage persistence
 */
export function SimilarityScoreLegend({ className }: SimilarityScoreLegendProps) {
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    // Check localStorage on mount
    const dismissed = localStorage.getItem(STORAGE_KEY);
    setIsDismissed(dismissed === 'true');
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsDismissed(true);
  };

  if (isDismissed) return null;

  return (
    <Card className={cn('animate-in fade-in-50 duration-200', className)}>
      <CardContent className="flex items-center justify-between gap-4 p-3">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground">CONFIDENCE:</span>

          {/* High match badge */}
          <div className="flex items-center gap-2">
            <Badge className="bg-green-500 hover:bg-green-500 text-white border-green-500">
              High match
            </Badge>
            <span className="text-xs text-muted-foreground">(≥85%)</span>
          </div>

          <span className="text-muted-foreground/40">•</span>

          {/* Medium match badge */}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-yellow-500">
              Medium
            </Badge>
            <span className="text-xs text-muted-foreground">(70-85%)</span>
          </div>

          <span className="text-muted-foreground/40">•</span>

          {/* Standard badge */}
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              Standard
            </Badge>
            <span className="text-xs text-muted-foreground">(&lt;70%)</span>
          </div>
        </div>

        {/* Dismiss button */}
        <Button
          onClick={handleDismiss}
          size="sm"
          variant="ghost"
          className="shrink-0 gap-1 text-xs"
          title="Dismiss legend"
        >
          <span>HIDE</span>
          <X className="size-3" />
        </Button>
      </CardContent>
    </Card>
  );
}
