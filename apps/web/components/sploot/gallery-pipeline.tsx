import { cn } from '@/lib/utils';

export type GalleryPipelineState = 'idle' | 'loading' | 'ready' | 'error';

interface GalleryPipelineProps {
  state: GalleryPipelineState;
  query: string;
  resultCount?: number;
  latencyMs?: number;
  model?: string;
  cached?: boolean;
  error?: string | null;
  className?: string;
}

type PipelineStage = {
  label: string;
  value: string;
  tone?: 'active' | 'error';
};

function stageValue(state: GalleryPipelineState, readyValue?: string) {
  if (state === 'error') return { value: 'failed', tone: 'error' as const };
  if (state === 'loading') return { value: 'working', tone: 'active' as const };
  return { value: readyValue ?? '—' };
}

/**
 * The BRUT-1 machine layer. It deliberately accepts facts from the search
 * response instead of manufacturing stage timings or model/count telemetry.
 */
export function GalleryPipeline({
  state,
  query,
  resultCount,
  latencyMs,
  model,
  cached,
  error,
  className,
}: GalleryPipelineProps) {
  const stages: PipelineStage[] = [
    { label: 'request', ...stageValue(state, query ? 'complete' : undefined) },
    { label: 'model', ...stageValue(state, model ?? undefined) },
    {
      label: 'total',
      ...stageValue(state, typeof resultCount === 'number' ? `${resultCount} matches` : undefined),
    },
    {
      label: 'latency',
      ...stageValue(state, typeof latencyMs === 'number' ? `${latencyMs} ms` : undefined),
    },
  ];

  return (
    <section
      aria-label="retrieval pipeline"
      aria-live="polite"
      className={cn(
        'mx-3 my-3 overflow-hidden rounded-[var(--sploot-radius-inner)] border-2 border-sploot-ink bg-sploot-paper-warm font-mono text-[0.65rem]',
        className
      )}
    >
      <div className="flex items-center justify-between border-b-2 border-sploot-ink px-3 py-2 font-bold lowercase">
        <span>retrieval pipeline</span>
        {cached ? <span className="text-sploot-lime">cached</span> : state === 'idle' ? <span>—</span> : <span>live</span>}
      </div>
      <ol className="m-0 list-none p-0">
        {stages.map((stage) => (
          <li
            key={stage.label}
            className={cn(
              'flex items-center justify-between gap-3 border-b border-dashed border-sploot-ink/50 px-3 py-2 last:border-b-0',
              stage.tone === 'active' && 'bg-sploot-cyan text-sploot-ink',
              stage.tone === 'error' && 'bg-sploot-red text-sploot-on-red'
            )}
          >
            <span className="font-bold lowercase">{stage.label}</span>
            <span className="tabular-nums">{stage.value}</span>
          </li>
        ))}
      </ol>
      {error ? <p className="border-t-2 border-sploot-ink px-3 py-2 text-sploot-red">{error}</p> : null}
    </section>
  );
}
