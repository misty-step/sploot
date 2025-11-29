'use client';

import { ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from './navbar';
import { NavbarSpacer } from './chrome-spacers';
import { StatusLine } from './status-line';
import { useAuthActions } from '@/lib/auth/client';
import { useStatusStats } from '@/hooks/use-status-stats';

interface AppChromeProps {
  children: ReactNode;
}

/**
 * App chrome wrapper with navbar and footer
 * Replaces the old NavigationContainer with sidebar
 * This is a smart component that manages its own state
 */
export function AppChrome({ children }: AppChromeProps) {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const stats = useStatusStats();

  // Handle sign out
  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push('/');
  }, [signOut, router]);

  return (
    <>
      {/* Fixed Navbar */}
      <Navbar
        onSignOut={handleSignOut}
        statusLine={
          <StatusLine
            assetCount={stats.assetCount}
            storageUsed={stats.storageUsed}
            lastUploadTime={stats.lastUploadTime}
            queueDepth={stats.queueDepth}
          />
        }
      />

      {/* Spacer for navbar height */}
      <NavbarSpacer />

      {/* Main content */}
      <main className="min-h-[calc(100vh-56px)]">
        {children}
      </main>
    </>
  );
}