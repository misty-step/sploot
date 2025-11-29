'use client';

import { ClerkProvider, useClerk, useUser } from '@clerk/nextjs';
import React from 'react';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}

export function useAuthUser() {
  return useUser();
}

export function useAuthActions() {
  return useClerk();
}