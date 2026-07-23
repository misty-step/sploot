'use client';

import * as React from 'react';
import { controlFocusClasses } from '@/components/ui/button';
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
          'sploot-ctl inline-grid place-items-center shrink-0 cursor-pointer disabled:cursor-not-allowed',
          controlFocusClasses,
          '[&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:stroke-[2]',
          // compact is a desktop density; phones always get the 44px touch floor
          size === 'dock'
            ? 'size-[var(--sploot-touch-target)]'
            : 'size-[var(--sploot-control-height-sm)] max-sm:size-[var(--sploot-touch-target)]',
          chip &&
            'rounded-[var(--sploot-radius-pill)] bg-sploot-panel sploot-shadow-sm active:shadow-none',
          pressed && '!bg-sploot-yellow !text-sploot-ink',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
