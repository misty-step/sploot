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

type AuthUserView = {
  id?: string;
  firstName?: string | null;
  username?: string | null;
  emailAddresses: Array<{ emailAddress: string }>;
  imageUrl?: string;
};

type AuthContextValue = {
  user: AuthUserView | null;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);
// NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD is injected by next.config at build time;
// using it here keeps the production artifact free of the QA auth bridge.
const isQaLocalClientMode = process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true' ||
  process.env.SPLOOT_QA_AUTH_MODE === 'enabled';

function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <AuthContext.Provider value={{ user: user ?? null, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

function QaLocalAuthBridge({ children, userId }: { children: React.ReactNode; userId?: string | null }) {
  const user: AuthUserView | null = userId
    ? {
        id: userId,
        firstName: 'QA',
        username: userId,
        emailAddresses: [ { emailAddress: userId + '@sploot.test' } ],
      }
    : null;

  return (
    <AuthContext.Provider value={{ user, signOut: async () => {
      throw new Error('QA auth sign-out requires a verified local QA principal.');
    } }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children, qaUserId }: { children: React.ReactNode; qaUserId?: string | null }) {
  const pathname = usePathname();

  // QA auth uses the local signed-header bridge instead of Clerk across the
  // fixture so protected browser paths can be exercised without credentials.
  if (isQaLocalClientMode) {
    return <QaLocalAuthBridge userId={qaUserId}>{children}</QaLocalAuthBridge>;
  }

  // Public-truth builds intentionally omit Clerk on concrete public paths while
  // retaining it for protected/auth routes that need Clerk hooks.
  if (shouldOmitClerkProvider(pathname, {
    publicTruthE2E: process.env.NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E === 'true',
    qaAuthBuild: process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true',
  })) {
    return children;
  }

  return (
    <ClerkProvider telemetry={{ disabled: true }}>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

export function useAuthUser() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuthUser must be used inside AuthProvider');
  return { user: context.user };
}

export function useOptionalAuthUser() {
  const context = React.useContext(AuthContext);
  return { user: context?.user ?? null };
}

export function useAuthActions() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuthActions must be used inside AuthProvider');
  return { signOut: context.signOut };
}
