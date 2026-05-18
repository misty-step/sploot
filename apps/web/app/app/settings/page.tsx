'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthUser, useAuthActions } from '@/lib/auth/client';
import { usePwaInstallPrompt } from '@/hooks/use-pwa-install';
import { cn } from '@/lib/utils';
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0';

interface StorageStats {
  storageBytes: number;
  storageLimitBytes: number;
  storageRemainingBytes: number;
  storageUsagePercent: number;
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
  const { installable, installed, promptInstall } = usePwaInstallPrompt();
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);

  useEffect(() => {
    let cancelled = false;

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
        });
      }
    }

    loadStorageStats().catch(() => {});

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
          <h2 className="text-lg font-semibold text-foreground">Storage</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {storageStats
              ? `${formatBytes(storageStats.storageBytes)} of ${formatBytes(storageStats.storageLimitBytes)} used`
              : 'Checking storage usage...'}
          </p>
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
      </section>

      <section className="bg-card border border-border p-5 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Install as app</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Add Sploot to your home screen so the memes hit quicker than doomscroll déjà vu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleInstall}
            disabled={!installable}
            className={cn(
              'inline-flex items-center gap-2  px-4 py-2 text-sm font-medium transition-colors',
              installable
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8l-8-8-8 8" />
            </svg>
            {installed ? 'Already installed 🔒' : 'Install Sploot PWA'}
          </button>

          {!installable && !installed && (
            <span className="text-xs text-muted-foreground">
              Browser not vibing? Try in Chrome/Edge/Android for install button energy.
            </span>
          )}

          {installed && (
            <span className="text-xs text-green-500">
              You already pinned the app. Absolute W.
            </span>
          )}
        </div>
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
          <span className="font-mono text-sm text-foreground">{APP_VERSION}</span>
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
