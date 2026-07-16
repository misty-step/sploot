'use client';

import { ClerkProvider, useClerk, useUser } from '@clerk/nextjs';
import React from 'react';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Keep Clerk mounted for every artifact, including deterministic signed-out
  // public proof. The fixture cookie prevents a network handshake; it never
  // substitutes for Clerk and protected middleware remains the security gate.
  return <ClerkProvider>{children}</ClerkProvider>;
}

export function useAuthUser() {
  return useUser();
}

export function useAuthActions() {
  return useClerk();
}
