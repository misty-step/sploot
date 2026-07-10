import { cn } from '@/lib/utils';

export interface StatusCell {
  label: string;
  value: React.ReactNode;
  /** Render value in lime plus a blinking live dot. */
  ok?: boolean;
}

interface StatusBarProps {
  cells: StatusCell[];
  className?: string;
}

/**
 * The machinery readout row (lab-034 AFD-8): the deep-void chrome strip with
 * mono cells that expose index / scorer / status details without inventing
 * hidden product capability. A live cell gets a lime dot.
 */
export function StatusBar({ cells, className }: StatusBarProps) {
  return (
    <section
      aria-label="system status"
      className={cn('border-t-[3px] border-sploot-ink bg-sploot-void font-mono', className)}
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-px bg-sploot-paper/20">
        {cells.map((cell) => (
          <div key={cell.label} className="bg-sploot-void px-4 py-3.5">
            <span className="block text-[0.6rem] lowercase text-sploot-paper/60">
              {cell.label}
            </span>
            <span
              className={cn(
                'flex items-center text-[1.05rem] font-bold lowercase',
                cell.ok ? 'text-sploot-lime' : 'text-sploot-paper'
              )}
            >
              {cell.ok ? (
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block h-[0.6em] w-[0.6em] rounded-full bg-sploot-lime animate-sploot-pop"
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
