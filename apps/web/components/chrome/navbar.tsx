'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { UserAvatar } from './user-avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { PileMark, IconButton } from '@/components/sploot';
import { cn } from '@/lib/utils';
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from './keyboard-shortcuts-help';

interface NavbarProps {
  children?: ReactNode;
  className?: string;
  showUserAvatar?: boolean;
  onSignOut?: () => void;
  statusLine?: ReactNode;
}

/**
 * Fixed navbar component for the new architecture.
 * The row always reserves the mobile touch-target height plus breathing room
 * so compact controls stay centered instead of fighting the bottom rule.
 */
export function Navbar({
  children,
  className,
  showUserAvatar = true,
  onSignOut,
  statusLine,
}: NavbarProps) {
  // Help control lives in the mast itself (AFD-NAV-1): the "?" shortcut and
  // its dialog are global chrome, not tied to any one route.
  const { isOpen: isHelpOpen, openHelp, closeHelp } = useKeyboardShortcutsHelp();
  useKeyboardShortcut({ key: '?', callback: openHelp, enabled: true });

  return (
    <>
      <nav
      className={cn(
        // Fixed positioning
        'fixed top-0 left-0 right-0',
        // Z-index to stay above content
        'z-50',
        // Height: touch-safe mobile rail + breathing room; 64px desktop rail
        'h-auto min-h-[calc(var(--sploot-touch-target)+0.75rem+env(safe-area-inset-top)+3px)] md:min-h-[calc(4rem+env(safe-area-inset-top)+3px)]',
        // iOS PWA safe area support - push navbar below status bar/notch
        'pt-[env(safe-area-inset-top)] pb-1.5 md:py-2',
        'pl-[env(safe-area-inset-left)]',
        'pr-[env(safe-area-inset-right)]',
        // Background and border — toybox chrome: opaque paper shelf with a
        // 3px ink rule under it (lab-034 AFD-8). No backdrop blur.
        'bg-background border-b-[3px] border-sploot-ink',
        // Layout
        'flex items-center',
        // Padding - progressive increase for larger screens
        'px-4 md:px-6 lg:px-8',
        // Custom classes
        className
      )}
    >
      {/* Container for navbar content - max-width for ultra-wide screens */}
      <div className="flex min-h-[var(--sploot-touch-target)] w-full max-w-screen-2xl items-center justify-between mx-auto 2xl:max-w-[1920px]">
        {/* Left section: SPLOOT branding with pile mark */}
        <Link
          href="/app"
          prefetch={false}
          aria-label="Sploot - Home"
          className="flex min-h-[var(--sploot-touch-target)] min-w-[var(--sploot-touch-target)] items-center gap-2 group no-underline hover:opacity-80 transition-opacity duration-150"
        >
          <PileMark />

          {/* SPLOOT wordmark in Bebas Neue — yields to the PileMark glyph on
              very narrow phones (320px) so the 44px control cluster fits */}
          <span
            className="hidden min-[400px]:inline text-xl md:text-2xl text-accent-cyan tracking-wider"
            style={{ fontFamily: "var(--font-bebas-neue)" }}
          >
            SPLOOT
          </span>
        </Link>

        {/* Spacer to push user menu to the right */}
        <div className="flex-1" />

        {/* Right section: Status line, help, theme toggle, and user menu —
            compact ink-mini icon buttons share identical grammar. */}
        <div className="flex min-h-[var(--sploot-touch-target)] items-center gap-2 md:gap-3">
          {/* Terminal-style status line */}
          {statusLine}

          {/* Help control — bare glyph in a circular ink-mini: the circled
              HelpCircle icon inside a squared shell read as a frame-in-a-
              frame, and the square shells fought the round avatar. The mast
              family is circles. */}
          <IconButton label="keyboard shortcuts" onClick={openHelp} className="!rounded-full">
            <span aria-hidden="true" className="font-mono text-[15px] font-black leading-none">
              ?
            </span>
          </IconButton>

          {/* Theme toggle */}
          <ThemeToggle className="!rounded-full" />

          {/* User avatar — joins the mast family: same diameter as the
              ink-mini controls, same 2px ink ring, instead of the bare
              Clerk disc that read as a foreign object. */}
          {showUserAvatar && (
            <UserAvatar
              className="mr-2"
              avatarClassName="size-[34px] max-sm:size-[var(--sploot-touch-target)] border-2 border-sploot-ink"
              avatarSize="md"
              showDropdown={true}
              onSignOut={onSignOut}
            />
          )}
        </div>

        {/* Allow children to be passed for flexibility during development */}
        {children}
      </div>
    </nav>
    <KeyboardShortcutsHelp isOpen={isHelpOpen} onClose={closeHelp} />
    </>
  );
}

/**
 * Spacer component to push content below the fixed navbar
 * Use this in layouts to prevent content from going under the navbar
 * Accounts for both navbar height (64px/4rem) and iOS safe area inset
 */
export function NavbarSpacer() {
  return (
    <div className="h-[calc(var(--sploot-touch-target)+0.75rem+env(safe-area-inset-top)+3px)] md:h-[calc(4rem+env(safe-area-inset-top)+3px)]" />
  );
}
