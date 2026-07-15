import { cn } from '@/lib/utils';

interface GalleryMobileStatuslineProps {
  total: number;
  query: string;
  loading?: boolean;
  error?: string | null;
  resultCount?: number;
  latencyMs?: number;
  className?: string;
}

export function GalleryMobileStatusline({
  total,
  query,
  loading = false,
  error,
  resultCount,
  latencyMs,
  className,
}: GalleryMobileStatuslineProps) {
  const message = error
    ? 'search unavailable'
    : loading
      ? 'searching…'
      : query
        ? `${resultCount ?? 0} matches${typeof latencyMs === 'number' ? ` · ${latencyMs} ms` : ''}`
        : `${total.toLocaleString()} in the pile`;

  return (
    <p
      aria-live="polite"
      className={cn('border-b-2 border-sploot-ink bg-sploot-void px-3 py-1.5 font-mono text-[0.6rem] lowercase text-sploot-on-void', className)}
    >
      <span className="sr-only">gallery status: </span>{message}
    </p>
  );
}
