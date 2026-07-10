'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { UserAvatar } from './user-avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { PileMark } from '@/components/sploot';
import { cn } from '@/lib/utils';

interface NavbarProps {
  children?: ReactNode;
  className?: string;
  showUserAvatar?: boolean;
  onSignOut?: () => void;
  statusLine?: ReactNode;
}

/**
 * Fixed navbar component for the new architecture
 * Height: 64px (16 * 4px base unit)
 * Position: Fixed top
 * Z-index: 50 (stays above main content)
 */
export function Navbar({
  children,
  className,
  showUserAvatar = true,
  onSignOut,
  statusLine,
}: NavbarProps) {

  return (
    <>
      <nav
      className={cn(
        // Fixed positioning
        'fixed top-0 left-0 right-0',
        // Z-index to stay above content
        'z-50',
        // Height: 48px mobile, 64px desktop
        'h-12 md:h-16',
        // iOS PWA safe area support - push navbar below status bar/notch
        'pt-[env(safe-area-inset-top)]',
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
      <div className="flex items-center justify-between w-full max-w-screen-2xl 2xl:max-w-[1920px] mx-auto">
        {/* Left section: SPLOOT branding with pile mark */}
        <Link
          href="/app"
          aria-label="Sploot - Home"
          className="flex items-center gap-2 group no-underline hover:opacity-80 transition-opacity duration-150"
        >
          <PileMark />

          {/* SPLOOT wordmark in Bebas Neue */}
          <span
            className="text-xl md:text-2xl text-accent-cyan tracking-wider"
            style={{ fontFamily: "var(--font-bebas-neue)" }}
          >
            SPLOOT
          </span>
        </Link>

        {/* Spacer to push user menu to the right */}
        <div className="flex-1" />

        {/* Right section: Status line, theme toggle, and user menu */}
        <div className="flex items-center gap-4">
          {/* Terminal-style status line */}
          {statusLine}

          {/* Theme toggle */}
          <ThemeToggle />

          {/* User avatar - 32px circle with 8px margin from right edge */}
          {showUserAvatar && (
            <UserAvatar
              className="mr-2"  // 8px margin from right edge
              avatarSize="md"   // 32px size
              showDropdown={true}
              onSignOut={onSignOut}
            />
          )}
        </div>

        {/* Allow children to be passed for flexibility during development */}
        {children}
      </div>
    </nav>
    </>
  );
}

/**
 * Spacer component to push content below the fixed navbar
 * Use this in layouts to prevent content from going under the navbar
 * Accounts for both navbar height (64px/4rem) and iOS safe area inset
 */
export function NavbarSpacer() {
  return <div className="h-[calc(3rem+env(safe-area-inset-top))] md:h-[calc(4rem+env(safe-area-inset-top))]" />;
}
