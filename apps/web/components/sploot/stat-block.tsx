import { cn } from '@/lib/utils';

type StatTone = 'paper' | 'blue' | 'magenta' | 'yellow' | 'ink';

// Ink text stays dark on the candy fills (magenta / yellow); blue and ink
// carry light text.
const statToneClass: Record<StatTone, string> = {
  paper: 'bg-sploot-panel text-sploot-ink',
  blue: 'bg-sploot-blue text-white',
  magenta: 'bg-sploot-magenta text-[#1c1547]',
  yellow: 'bg-sploot-yellow text-sploot-ink',
  ink: 'bg-sploot-ink text-sploot-lime',
};

interface StatBlockProps {
  /** Mono key label, e.g. "indexed memes". */
  label: string;
  /** Bungee display value, e.g. "8". */
  value: React.ReactNode;
  tone?: StatTone;
  className?: string;
}

/**
 * A toy stat panel (lab-034 AFD-8): rounded 3px ink shell with a drop, a mono
 * key label over a big Bungee display value.
 */
export function StatBlock({ label, value, tone = 'paper', className }: StatBlockProps) {
  return (
    <div
      className={cn(
        'sploot-shadow rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink px-4 py-3',
        statToneClass[tone],
        className
      )}
    >
      <span className="block font-mono text-[0.66rem] font-bold lowercase">
        {label}
      </span>
      <span className="block font-display text-[2.1rem] leading-none sploot-tabular">
        {value}
      </span>
    </div>
  );
}
