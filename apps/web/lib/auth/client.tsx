'use client';

import { ClerkProvider, useClerk, useUser } from '@clerk/nextjs';
import React from 'react';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const isProductionDeployment = process.env.VERCEL_ENV === 'production';

  if (!publishableKey) {
    if (isProductionDeployment) {
      throw new Error('Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY for production deployment');
    }
    return <>{children}</>;
  }

  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}

export function useAuthUser() {
  return useUser();
}

export function useAuthActions() {
  return useClerk();
}
