import { cn } from '@/lib/utils';

interface SharePageTaglineProps {
  className?: string;
}

/**
 * Toybox brand tagline for the share page footer.
 *
 * Recipients are strangers meeting Sploot for the first time. They get the
 * product's voice here, not a technical dossier — file size, pixel
 * dimensions, and MIME type stay on the owner's console. This is the one
 * moment of personality DESIGN.md §7 asks every surface for.
 */
export function SharePageTagline({ className }: SharePageTaglineProps) {
  return (
    <p className={cn('font-mono text-xs lowercase tracking-wide text-sploot-ink/60', className)}>
      no folders. just vibes.
    </p>
  );
}
