import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AppChrome } from '@/components/chrome/app-chrome';
import { OfflineProvider } from '@/components/offline/offline-provider';
import { FilterProvider } from '@/contexts/filter-context';
import { BlobCircuitBreakerProvider } from '@/contexts/blob-circuit-breaker-context';
import { BlobErrorBanner } from '@/components/library/blob-error-banner';
import { getAuthWithUser } from '@/lib/auth/server';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, authFailure } = await getAuthWithUser();

  if (authFailure) {
    redirect(`/sign-in?error=${encodeURIComponent(authFailure.code)}`);
  }

  if (!userId) {
    redirect('/sign-in');
  }

  return (
    <OfflineProvider>
      <Suspense fallback={
        <div className="min-h-screen bg-sploot-workbench">
          <div className="flex h-screen items-center justify-center">
            <div className="sploot-shadow-sm border-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-paper px-5 py-4 font-mono text-sm font-bold lowercase tracking-normal text-sploot-ink">
              loading the pile...
            </div>
          </div>
        </div>
      }>
        <BlobCircuitBreakerProvider>
          <FilterProvider>
            <div className="min-h-screen bg-background">
              <BlobErrorBanner />
              <AppChrome>
                {children}
              </AppChrome>
            </div>
          </FilterProvider>
        </BlobCircuitBreakerProvider>
      </Suspense>
    </OfflineProvider>
  );
}
