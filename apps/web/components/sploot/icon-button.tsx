'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * IconButton — the toybox "ink mini" compact control (lab-034 AFD-8).
 *
 * The critical component the operator called out: theme switcher, tile
 * actions (heart / share / trash), toolbar icons. Grammar: flat 2px ink
 * outline at rest (no shadow), candy fill + small anchored shadow on hover,
 * sink + bubblegum fill on press. Physics live in the shared `.sploot-ctl`
 * utility so every icon control obeys the hover-physics law.
 *
 * Sizes: `compact` (34px, desktop density) and `dock` (44px touch targets —
 * the candy-chip mobile treatment carries pill rounding and a 2px drop).
 */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; required — icon-only controls are unlabeled otherwise. */
  label: string;
  size?: 'compact' | 'dock';
  /** Candy-chip variant used in the mobile dock (AFD-9 grammar at 44px). */
  chip?: boolean;
  /** Marks a toggled/active state (e.g. hearted, current theme). */
  pressed?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, size = 'compact', chip = false, pressed, className, children, type, ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        aria-label={label}
        aria-pressed={pressed}
        title={label}
        className={cn(
          'sploot-ctl inline-grid place-items-center shrink-0 cursor-pointer',
          'outline-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[3px] focus-visible:outline-sploot-focus',
          '[&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:stroke-[2]',
          size === 'dock' ? 'size-[var(--sploot-touch-target)]' : 'size-[34px]',
          chip &&
            'rounded-[var(--sploot-radius-pill)] bg-sploot-panel shadow-[0_2px_0_var(--sploot-shadow-color)] hover:shadow-[2px_4px_0_var(--sploot-shadow-color)] active:shadow-none',
          pressed && 'bg-sploot-yellow text-[#1c1547]',
          className
        )}
        {...props}
      >
        {children}
        <span className="sr-only">{label}</span>
      </button>
    );
  }
);
