import { cn } from '@/lib/utils';

export interface StatusCell {
  label: string;
  value: React.ReactNode;
  /** Render value in lime plus a blinking dot. */
  ok?: boolean;
}

interface StatusBarProps {
  cells: StatusCell[];
  className?: string;
}

/**
 * The machinery readout row. Mono cells expose index/scorer/status details
 * without inventing hidden product capability.
 */
export function StatusBar({ cells, className }: StatusBarProps) {
  return (
    <section
      aria-label="system status"
      className={cn('border-y-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-void font-mono', className)}
    >
      <div className="grid grid-cols-2 gap-px bg-sploot-paper/20 sm:grid-cols-5">
        {cells.map((cell) => (
          <div key={cell.label} className="bg-sploot-void px-4 py-3.5">
            <span className="block text-[0.6rem] uppercase tracking-normal text-sploot-paper/60">
              {cell.label}
            </span>
            <span
              className={cn(
                'text-[1.05rem] font-bold tracking-normal',
                cell.ok ? 'text-sploot-lime' : 'text-sploot-paper'
              )}
            >
              {cell.ok ? (
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block h-[0.6em] w-[0.6em] bg-sploot-lime align-baseline animate-sploot-pop"
                />
              ) : null}
              {cell.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
