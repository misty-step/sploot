'use client';

import { ClerkProvider, useClerk, useUser } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import React from 'react';

export function shouldOmitClerkProvider(
  pathname: string | null,
  flags: { publicTruthE2E: boolean; qaAuthBuild: boolean },
): boolean {
  // A missing pathname is not evidence that the route is public. Keep Clerk
  // mounted until Next supplies a concrete pathname.
  if (pathname === null) return false;

  const needsClerkProvider =
    pathname.startsWith('/app') || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up');
  return !needsClerkProvider && (flags.publicTruthE2E || flags.qaAuthBuild);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // The production-start QA build is provider-independent on public pages. Its
  // signed-out requests have no Clerk credentials, so omit the SDK there while
  // protected and auth routes retain Clerk for their hooks and components.
  const pathname = usePathname();

  if (shouldOmitClerkProvider(pathname, {
    publicTruthE2E: process.env.NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E === 'true',
    qaAuthBuild: process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true',
  })) {
    return children;
  }

  return <ClerkProvider telemetry={{ disabled: true }}>{children}</ClerkProvider>;
}

export function useAuthUser() {
  return useUser();
}

export function useAuthActions() {
  return useClerk();
}
