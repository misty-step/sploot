import { cn } from '@/lib/utils';

type StatTone = 'paper' | 'blue' | 'magenta' | 'yellow' | 'ink';

const statToneClass: Record<StatTone, string> = {
  paper: 'bg-sploot-paper text-sploot-ink',
  blue: 'bg-sploot-blue text-white',
  magenta: 'bg-sploot-magenta text-white',
  yellow: 'bg-sploot-yellow text-sploot-ink',
  ink: 'bg-sploot-ink text-sploot-lime',
};

interface StatBlockProps {
  /** Mono uppercase key label, e.g. "indexed memes". */
  label: string;
  /** Archivo Black value, e.g. "8". */
  value: React.ReactNode;
  tone?: StatTone;
  className?: string;
}

/**
 * A bordered, hard-shadow block: mono uppercase key label over an Archivo Black
 * value.
 */
export function StatBlock({ label, value, tone = 'paper', className }: StatBlockProps) {
  return (
    <div
      className={cn(
        'sploot-shadow-sm border-[length:var(--sploot-active-border-width)] border-sploot-ink px-4 py-3',
        statToneClass[tone],
        className
      )}
    >
      <span className="block font-mono text-[0.66rem] font-bold uppercase tracking-normal">
        {label}
      </span>
      <span className="block font-display text-[2.1rem] leading-none tracking-normal sploot-tabular">
        {value}
      </span>
    </div>
  );
}
