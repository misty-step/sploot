'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { UserAvatar } from './user-avatar';
import { ThemeToggle } from '@/components/theme-toggle';
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
        // Height: 64px
        'h-16',
        // iOS PWA safe area support - push navbar below status bar/notch
        'pt-[env(safe-area-inset-top)]',
        'pl-[env(safe-area-inset-left)]',
        'pr-[env(safe-area-inset-right)]',
        // Background and border - using shadcn design tokens
        'bg-background border-b border-border backdrop-blur-sm',
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
        {/* Left section: Compact LOOT branding */}
        <Link
          href="/app"
          aria-label="Sploot - Home"
          className="flex items-center gap-2 group hover:scale-105 transition-transform duration-200"
        >
          {/* Compact starburst icon - 24x24 */}
          <svg
            viewBox="0 0 24 24"
            className="w-6 h-6"
            aria-hidden="true"
          >
            {/* Center square */}
            <rect x="9" y="9" width="6" height="6" fill="var(--electric-lime)" />
            {/* Radiating lines - simplified for small size */}
            <rect x="11" y="0" width="2" height="8" fill="var(--electric-lime)" />
            <rect x="11" y="16" width="2" height="8" fill="var(--electric-lime)" />
            <rect x="0" y="11" width="8" height="2" fill="var(--electric-lime)" />
            <rect x="16" y="11" width="8" height="2" fill="var(--electric-lime)" />
            <rect x="3" y="3" width="5" height="2" fill="var(--hot-pink)" transform="rotate(45 5.5 4)" />
            <rect x="16" y="3" width="5" height="2" fill="var(--hot-pink)" transform="rotate(-45 18.5 4)" />
            <rect x="3" y="16" width="5" height="2" fill="var(--hot-pink)" transform="rotate(-45 5.5 17)" />
            <rect x="16" y="16" width="5" height="2" fill="var(--hot-pink)" transform="rotate(45 18.5 17)" />
          </svg>

          {/* LOOT wordmark in Bebas Neue */}
          <span
            className="text-3xl text-electric-lime tracking-wider leading-none"
            style={{ fontFamily: "var(--font-bebas-neue)" }}
          >
            LOOT
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
  return <div className="h-[calc(4rem+env(safe-area-inset-top))]" />;
}