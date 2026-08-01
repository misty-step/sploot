'use client';

import { ClerkProvider, useClerk, useUser } from '@clerk/nextjs';
import React from 'react';

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
        emailAddresses: [{ emailAddress: `${userId}@sploot.test` }],
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
  if (isQaLocalClientMode) {
    return <QaLocalAuthBridge userId={qaUserId}>{children}</QaLocalAuthBridge>;
  }

  return (
    <ClerkProvider>
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
