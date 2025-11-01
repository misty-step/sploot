import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SharePageLayoutProps {
  logo: ReactNode;
  cta: ReactNode;
  image: ReactNode;
  metadata?: ReactNode;
  className?: string;
}

/**
 * Mobile-first layout container for share pages with Bloomberg Terminal aesthetic.
 *
 * Provides responsive three-section layout:
 * - Header: Logo and CTA bar
 * - Main: Centered meme content
 * - Footer: Metadata display
 *
 * Handles iOS safe area insets for notch/bottom bar.
 */
export function SharePageLayout({
  logo,
  cta,
  image,
  metadata,
  className,
}: SharePageLayoutProps) {
  return (
    <div
      className={cn(
        'min-h-screen bg-black',
        'flex flex-col',
        // Safe area insets for iOS notch/bottom bar
        'pb-[env(safe-area-inset-bottom)]',
        'pt-[env(safe-area-inset-top)]',
        className
      )}
    >
      {/* Header: Logo + CTA bar */}
      <header
        className={cn(
          'flex items-center justify-between',
          'px-4 py-3',
          'sm:px-6 sm:py-4',
          'border-b border-gray-900'
        )}
      >
        <div className="flex items-center gap-2">
          {logo}
        </div>
        <div className="flex items-center gap-3">
          {cta}
        </div>
      </header>

      {/* Main: Centered meme content */}
      <main
        className={cn(
          'flex-1',
          'flex items-center justify-center',
          'p-4 sm:p-6',
          'overflow-hidden'
        )}
      >
        {image}
      </main>

      {/* Footer: Metadata */}
      {metadata && (
        <footer
          className={cn(
            'flex items-center justify-center',
            'px-4 py-3',
            'sm:px-6 sm:py-4',
            'border-t border-gray-900'
          )}
        >
          {metadata}
        </footer>
      )}
    </div>
  );
}
