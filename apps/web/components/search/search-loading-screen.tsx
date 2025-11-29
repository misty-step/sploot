'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface SearchLoadingScreenProps {
  query: string;
}

export function SearchLoadingScreen({ query }: SearchLoadingScreenProps) {
  return (
    <div className="flex-1 overflow-hidden px-6 pb-8 pt-6 md:px-10">
      <Card className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden border-border">
        {/* Header showing what's being searched */}
        <div className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Loader2 className="size-5 animate-spin text-green-500" />
              <span className="font-mono text-sm text-muted-foreground">searching for</span>
            </div>
            <span className="font-mono text-sm">&ldquo;{query}&rdquo;</span>
          </div>
        </div>

        {/* Skeleton grid */}
        <div className="flex-1 overflow-hidden p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5">
            {/* Generate skeleton items */}
            {Array.from({ length: 20 }).map((_, index) => (
              <Card key={index} className="relative aspect-square overflow-hidden">
                <Skeleton className="h-full w-full" />
              </Card>
            ))}
          </div>

          {/* Progress indicator */}
          <div className="mt-8 flex flex-col items-center justify-center gap-4">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="font-mono text-sm text-muted-foreground">
              finding your memes...
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
