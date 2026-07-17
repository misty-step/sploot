'use client';

import { ClerkProvider, useClerk, useUser } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import React from 'react';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // The production-start QA build is provider-independent. Its signed-out
  // public requests have no Clerk credentials, so do not mount the SDK at all;
  // protected-route authorization remains owned by middleware. The compile-time
  // flag is false in production bundles, where Clerk remains authoritative.
  const pathname = usePathname();
  const needsClerkProvider =
    pathname.startsWith('/app') || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up');

  if (process.env.NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E === 'true' || (process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true' && !needsClerkProvider)) {
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
