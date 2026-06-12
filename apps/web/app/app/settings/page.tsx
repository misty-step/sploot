'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthUser, useAuthActions } from '@/lib/auth/client';
import { usePwaInstallPrompt } from '@/hooks/use-pwa-install';
import { cn } from '@/lib/utils';
// Fallback while /api/version (latest landfall release tag) loads.
const APP_VERSION_FALLBACK = process.env.NEXT_PUBLIC_APP_VERSION || 'v0';

interface StorageStats {
  storageBytes: number;
  storageLimitBytes: number;
  storageRemainingBytes: number;
  storageUsagePercent: number;
  plan: string;
  planName: string;
  billingStatus: string;
  billingCurrentPeriodEnd: string | null;
}

interface BillingPlan {
  id: string;
  name: string;
  priceUsd: number;
  limitBytes: number;
  limitLabel: string;
  description: string;
}

interface BillingState {
  plans: BillingPlan[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function SettingsPage() {
  const { user } = useAuthUser();
  const { signOut } = useAuthActions();
  const { installable, installed, requiresManualInstall, promptInstall } = usePwaInstallPrompt();
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [billingAction, setBillingAction] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>(APP_VERSION_FALLBACK);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/version')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.version === 'string' && data.version) {
          setAppVersion(data.version);
        }
      })
      .catch(() => {});

    async function loadStorageStats() {
      const response = await fetch('/api/stats');
      if (!response.ok) return;
      const data = await response.json();
      if (!cancelled) {
        setStorageStats({
          storageBytes: data.storageBytes ?? 0,
          storageLimitBytes: data.storageLimitBytes ?? 0,
          storageRemainingBytes: data.storageRemainingBytes ?? 0,
          storageUsagePercent: data.storageUsagePercent ?? 0,
          plan: data.plan ?? 'free',
          planName: data.planName ?? 'Free',
          billingStatus: data.billingStatus ?? 'none',
          billingCurrentPeriodEnd: data.billingCurrentPeriodEnd ?? null,
        });
      }
    }

    async function loadBilling() {
      const response = await fetch('/api/billing');
      if (!response.ok) return;
      const data = await response.json();
      if (!cancelled) {
        setBilling({ plans: data.plans ?? [] });
      }
    }

    loadStorageStats().catch(() => {});
    loadBilling().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    setSignOutLoading(true);
    try {
      await signOut();
    } finally {
      setSignOutLoading(false);
    }
  };

  const handleInstall = async () => {
    await promptInstall();
  };

  const startCheckout = async (planId: string) => {
    setBillingAction(planId);
    setBillingError(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? 'Checkout is not available right now');
      }
      window.location.href = data.url;
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Checkout is not available right now');
    } finally {
      setBillingAction(null);
    }
  };

  const openBillingPortal = async () => {
    setBillingAction('portal');
    setBillingError(null);
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? 'Billing portal is not available right now');
      }
      window.location.href = data.url;
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Billing portal is not available right now');
    } finally {
      setBillingAction(null);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-3xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Tune your meme bunker vibes, manage your login, and flex the PWA drip.
        </p>
      </header>

      <section className="bg-card border border-border p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Account lore</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Signed in as <span className="text-foreground">{user?.emailAddresses?.[0]?.emailAddress ?? 'unknown gremlin'}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSignOut}
            disabled={signOutLoading}
            className={cn(
              'inline-flex items-center gap-2  px-4 py-2 text-sm font-medium transition-colors',
              'bg-destructive/20 text-destructive hover:bg-destructive/30',
              signOutLoading && 'opacity-60 cursor-not-allowed'
            )}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {signOutLoading ? 'Yeeting…' : 'Sign out'}
          </button>
        </div>
      </section>

      <section className="bg-card border border-border p-5 space-y-4">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Storage</h2>
              <p className="text-muted-foreground text-sm mt-1">
                {storageStats
                  ? `${formatBytes(storageStats.storageBytes)} of ${formatBytes(storageStats.storageLimitBytes)} used`
                  : 'Checking storage usage...'}
              </p>
            </div>
            {storageStats && (
              <div className="text-right">
                <span className="inline-flex border border-border bg-background px-2 py-1 font-mono text-xs uppercase text-muted-foreground">
                  {storageStats.planName}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  {storageStats.billingStatus === 'none' ? 'free tier' : storageStats.billingStatus}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-2 bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, storageStats?.storageUsagePercent ?? 0)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{storageStats ? `${storageStats.storageUsagePercent}% used` : 'Usage unavailable'}</span>
            <span>{storageStats ? `${formatBytes(storageStats.storageRemainingBytes)} remaining` : ''}</span>
          </div>
        </div>

        {billing?.plans && billing.plans.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {billing.plans.map((plan) => {
              const isCurrent = storageStats?.plan === plan.id;
              const hasPaidPlan = storageStats !== null && storageStats.plan !== 'free';
              const isDisabled = billingAction !== null || isCurrent;
              const actionLabel = isCurrent
                ? 'Current plan'
                : billingAction === plan.id || billingAction === 'portal'
                  ? 'Opening...'
                  : hasPaidPlan
                    ? 'Manage'
                    : 'Upgrade';
              return (
                <div key={plan.id} className="border border-border bg-background p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-foreground">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground">{plan.description}</p>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{plan.limitLabel}</span>
                  </div>
                  <p className="text-sm text-foreground">
                    {plan.priceUsd === 0 ? 'Free' : `$${plan.priceUsd}/mo`}
                  </p>
                  {plan.priceUsd > 0 && (
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (hasPaidPlan) {
                          void openBillingPortal();
                          return;
                        }
                        void startCheckout(plan.id);
                      }}
                      className={cn(
                        'w-full border border-border px-3 py-2 text-xs font-medium uppercase transition-colors',
                        isCurrent
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90',
                        isDisabled && 'opacity-60 cursor-not-allowed'
                      )}
                    >
                      {actionLabel}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {storageStats && storageStats.plan !== 'free' && (
            <button
              type="button"
              disabled={billingAction !== null}
              onClick={() => void openBillingPortal()}
              className="border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              {billingAction === 'portal' ? 'Opening billing...' : 'Manage billing'}
            </button>
          )}
          {billingError && (
            <p className="text-sm text-destructive">{billingError}</p>
          )}
        </div>
      </section>

      <section className="bg-card border border-border p-5 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Install as app</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Add Sploot to your home screen so the memes hit quicker than doomscroll déjà vu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {installable && (
            <button
              onClick={handleInstall}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8l-8-8-8 8" />
              </svg>
              Install Sploot PWA
            </button>
          )}

          {!installable && !installed && requiresManualInstall && (
            <p className="text-sm text-muted-foreground">
              iPhones don&apos;t do install buttons — tap the share icon in your
              browser, then <span className="text-foreground font-medium">Add to Home Screen</span>.
              Works in Safari and Chrome.
            </p>
          )}

          {!installable && !installed && !requiresManualInstall && (
            <span className="text-xs text-muted-foreground">
              No install prompt in this browser — try Chrome or Edge, or look
              for &ldquo;Add to Home Screen&rdquo; in the browser menu.
            </span>
          )}

          {installed && (
            <span className="text-xs text-green-500">
              You already pinned the app. Absolute W.
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Heads up: sharing images into Sploot from other apps&apos; share
          sheets works on Android. iPhones don&apos;t let web apps into the
          share sheet — copy an image and paste it into the upload zone
          instead.
        </p>
      </section>

      <section className="bg-card border border-border p-5 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Coming soon™</h2>
        <p className="text-muted-foreground text-sm">
          Theme switching, notification spam, and squad-sharing are on the roadmap. Ping us with your wildest feature dreams.
        </p>
      </section>

      <section className="bg-card border border-border p-5 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">About</h2>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Version</span>
          <span className="font-mono text-sm text-foreground">{appVersion}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">What&apos;s new</span>
          <Link
            href="/changelog"
            className="text-sm text-accent-cyan hover:underline"
          >
            View changelog →
          </Link>
        </div>
        <div className="pt-2 border-t border-border flex gap-4 text-sm">
          <Link href="/support" className="text-muted-foreground hover:text-foreground transition-colors">
            Support
          </Link>
          <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
            Privacy
          </Link>
        </div>
      </section>
    </div>
  );
}
