import { useSyncExternalStore } from 'react';

const subscribeHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

/**
 * SSR/CSR-mismatch-safe hydration flag. Returns false on the server and
 * during the initial client render, then true once React has hydrated --
 * used to gate readiness attributes (e.g. data-upload-action-ready) that
 * Playwright polls before interacting with client-only affordances.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, getClientHydrationSnapshot, getServerHydrationSnapshot);
}
