'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, Suspense, useState } from 'react';
import posthog from 'posthog-js';
import { POSTHOG_READY_EVENT } from './events';

const posthogIsLoaded = () =>
  Boolean((posthog as typeof posthog & { __loaded?: boolean }).__loaded);

function PostHogPageviewInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isReady, setIsReady] = useState(posthogIsLoaded());

  useEffect(() => {
    if (posthogIsLoaded()) {
      setIsReady(true);
      return;
    }

    const markReady = () => setIsReady(true);
    window.addEventListener(POSTHOG_READY_EVENT, markReady);
    return () => window.removeEventListener(POSTHOG_READY_EVENT, markReady);
  }, []);

  useEffect(() => {
    if (pathname && isReady) {
      try {
        let url = window.origin + pathname;
        const search = searchParams.toString();
        if (search) url += '?' + search;
        posthog.capture('$pageview', { $current_url: url });
      } catch (error) {
        console.error('posthog.capture failed', error);
      }
    }
  }, [isReady, pathname, searchParams]);

  return null;
}

export function PostHogPageview() {
  return (
    <Suspense fallback={null}>
      <PostHogPageviewInner />
    </Suspense>
  );
}
