'use client';

import { useEffect, type ReactNode } from 'react';
import { useUser } from '@clerk/nextjs';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

export function PostHogProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded, user } = useUser();

  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: '/ingest',
        ui_host: 'https://us.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: false,
        respect_dnt: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: '*',
        },
        loaded: (ph) => {
          if (process.env.NODE_ENV === 'development') ph.debug();
        },
      });
    }
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !isLoaded) return;
    if (isSignedIn && user) {
      posthog.identify(user.id, {
        created_at: user.createdAt?.toISOString(),
      });
    } else if (!isSignedIn) {
      posthog.reset();
    }
  }, [isSignedIn, isLoaded, user]);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
