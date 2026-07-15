'use client';

import { ClerkProvider, useClerk, useUser } from '@clerk/nextjs';
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
const qaClientAuthEnabled = process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_MODE === 'enabled' &&
  process.env.NEXT_PUBLIC_SPLOOT_QA_EVIDENCE_MODE === 'enabled' &&
  process.env.NEXT_PUBLIC_SPLOOT_QA_DEPLOYMENT_ID === 'sploot-gallery-qa-local';

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
  const user = {
    firstName: 'QA',
    username: 'qa-design-user',
    emailAddresses: [{ emailAddress: 'qa-design-user@qa.local' }],
  };
  const signOut = async () => {
    document.cookie = 'sploot_qa_auth=; Max-Age=0; Path=/';
    window.location.assign('/');
  };

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
