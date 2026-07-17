'use client';

import { cn } from '@/lib/utils';

interface QueryTokenHighlightProps {
  query: string;
  className?: string;
}

export function QueryTokenHighlight({ query, className }: QueryTokenHighlightProps) {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]/gu, ''))
    .filter(Boolean);

  if (tokens.length === 0) return null;

  return (
    <div aria-label="query tokens" className={cn('mt-2 flex flex-wrap items-center gap-1.5', className)}>
      <span className="font-mono text-[0.6rem] lowercase text-muted-foreground">tokens</span>
      <ul className="flex flex-wrap gap-1.5" aria-label="search query tokens">
        {tokens.map((token, index) => (
          <li
            key={`${token}-${index}`}
            className="rounded-[var(--sploot-radius-inner)] border-2 border-sploot-ink bg-sploot-yellow px-1.5 py-0.5 font-mono text-[0.65rem] font-bold lowercase text-[#1c1547]"
          >
            {token}
          </li>
        ))}
      </ul>
    </div>
  );
}
