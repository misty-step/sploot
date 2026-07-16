'use client';

import { ClerkProvider, useClerk, useUser } from '@clerk/nextjs';
import { getQaAuthState } from '@/lib/auth/qa-client';
import React, { createContext, useContext } from 'react';

interface AuthClientState {
  user: {
    firstName?: string | null;
    username?: string | null;
    imageUrl?: string;
    emailAddresses: Array<{ emailAddress: string }>;
  } | null;
  signOut: () => Promise<void>;
}

const AuthClientContext = createContext<AuthClientState | null>(null);
const qaClientAuthEnabled = process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true';

function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <AuthClientContext.Provider value={{ user: user ?? null, signOut }}>
      {children}
    </AuthClientContext.Provider>
  );
}

function QaAuthBridge({ children }: { children: React.ReactNode }) {
  const { user, signOut } = getQaAuthState();

  return (
    <AuthClientContext.Provider value={{ user, signOut }}>
      {children}
    </AuthClientContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (qaClientAuthEnabled) {
    return <QaAuthBridge>{children}</QaAuthBridge>;
  }

  return (
    <ClerkProvider>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

export function useAuthUser() {
  const state = useContext(AuthClientContext);
  if (!state) throw new Error('AuthProvider is required');
  return { user: state.user };
}

export function useAuthActions() {
  const state = useContext(AuthClientContext);
  if (!state) throw new Error('AuthProvider is required');
  return { signOut: state.signOut };
}
