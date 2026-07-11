'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthUser, useAuthActions } from '@/lib/auth/client';
import { usePwaInstallPrompt } from '@/hooks/use-pwa-install';
import { UploadTokensCard } from '@/components/settings/upload-tokens-card';
import { Button } from '@/components/ui/button';
import { StatBlock, StickerTab } from '@/components/sploot';
// Fallback while /api/version (latest landfall release tag) loads.
const APP_VERSION_FALLBACK = process.env.NEXT_PUBLIC_APP_VERSION || 'v0';

interface StorageStats {
  assetCount: number;
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
  const { installable, installed, requiresManualInstall, promptInstall } = usePwaInstallPrompt();
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [embeddedCount, setEmbeddedCount] = useState<number | null>(null);
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
          assetCount: data.assetCount ?? 0,
          storageBytes: data.storageBytes ?? 0,
          storageLimitBytes: data.storageLimitBytes ?? 0,
          storageRemainingBytes: data.storageRemainingBytes ?? 0,
          storageUsagePercent: data.storageUsagePercent ?? 0,
        });
      }
    }

    loadStorageStats().catch(() => {});

    // The automatic-piles endpoint always reports the ready-embedding count
    // (regardless of whether any pile clears the minimum-size bar), which is
    // the cheapest existing source for "embedded" — no dedicated stats route
    // for it exists yet.
    async function loadEmbeddedCount() {
      const response = await fetch('/api/piles?limit=1');
      if (!response.ok) return;
      const data = await response.json();
      if (!cancelled && typeof data?.embeddedAssetCount === 'number') {
        setEmbeddedCount(data.embeddedAssetCount);
      }
    }

    loadEmbeddedCount().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const totalCount = storageStats?.assetCount ?? null;
  const cookingCount =
    totalCount !== null && embeddedCount !== null ? Math.max(0, totalCount - embeddedCount) : null;

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
      <header className="space-y-2">
        <StickerTab tone="violet">settings</StickerTab>
        <h1 className="font-display text-4xl leading-[0.95] text-foreground sm:text-5xl">
          the knobs
        </h1>
        <p className="text-muted-foreground text-sm">
          Tune your meme bunker vibes, manage your login, and flex the PWA drip.
        </p>
      </header>

      <div className="flex flex-wrap gap-2.5">
        <StatBlock
          label="in the pile"
          value={totalCount !== null ? totalCount.toLocaleString() : '—'}
          tone="blue"
          className="flex-1 min-w-[8.5rem]"
        />
        <StatBlock
          label="embedded"
          value={embeddedCount !== null ? embeddedCount.toLocaleString() : '—'}
          className="flex-1 min-w-[8.5rem]"
        />
        <StatBlock
          label="not yet searchable"
          value={cookingCount !== null ? cookingCount.toLocaleString() : '—'}
          tone="magenta"
          className="flex-1 min-w-[8.5rem]"
        />
      </div>

      <section className="sploot-card p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Account lore</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Signed in as <span className="text-foreground">{user?.emailAddresses?.[0]?.emailAddress ?? 'unknown user'}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleSignOut}
            disabled={signOutLoading}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {signOutLoading ? 'Yeeting…' : 'Sign out'}
          </Button>
        </div>
      </section>

      <UploadTokensCard />

      <section className="sploot-card p-5 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Embeddings</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {embeddedCount !== null && totalCount !== null
              ? `${embeddedCount.toLocaleString()} of ${totalCount.toLocaleString()} saves embedded${cookingCount ? `, ${cookingCount.toLocaleString()} not yet searchable (cooking or awaiting retry).` : '.'}`
              : 'Checking embedding coverage...'}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Every save gets a CLIP vector on arrival so text search can find it.
          Failed embeddings retry from the library&apos;s retry banner.
        </p>
      </section>

      <section className="sploot-card p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Storage</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {storageStats
              ? `${formatBytes(storageStats.storageBytes)} of ${formatBytes(storageStats.storageLimitBytes)} used`
              : 'Checking storage usage...'}
          </p>
        </div>

        <div className="space-y-2">
          <div className="h-2 bg-muted overflow-hidden rounded-[var(--sploot-radius-pill)] border-2 border-sploot-ink">
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

      <section className="sploot-card p-5 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Install as app</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Add Sploot to your home screen so the memes hit quicker than doomscroll déjà vu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {installable && (
            <Button onClick={handleInstall} size="sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8l-8-8-8 8" />
              </svg>
              Install Sploot PWA
            </Button>
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
            <span className="text-xs text-sploot-lime">
              You already pinned the app. Absolute W.
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Heads up: sharing images into Sploot from other apps&apos; share
          sheets works on Android. iPhones can&apos;t put web apps in the share
          sheet — mint an upload token above and wire up the{" "}
          <Link href="/help/ios-shortcut" className="text-sploot-blue hover:underline">
            &ldquo;Save to Sploot&rdquo; shortcut
          </Link>{" "}
          to share images from any iOS app.
        </p>
      </section>

      <section className="sploot-card p-5 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">What exists now</h2>
        <p className="text-muted-foreground text-sm">
          This settings panel manages your account, storage, install path, upload
          tokens, version, help, support, and privacy links. No social surface is
          hiding behind a teaser.
        </p>
      </section>

      <section className="sploot-card p-5 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">About</h2>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Version</span>
          <span className="font-mono text-sm text-foreground">{appVersion}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">What&apos;s new</span>
          <Link
            href="/changelog"
            className="inline-flex items-center text-sm text-sploot-blue hover:underline max-sm:min-h-[var(--sploot-touch-target)]"
          >
            View changelog →
          </Link>
        </div>
        <div className="pt-2 border-t border-border flex flex-wrap gap-x-4 text-sm">
          <Link href="/help" className="inline-flex items-center py-1 text-muted-foreground hover:text-foreground transition-colors max-sm:min-h-[var(--sploot-touch-target)]">
            Getting started
          </Link>
          <Link href="/support" className="inline-flex items-center py-1 text-muted-foreground hover:text-foreground transition-colors max-sm:min-h-[var(--sploot-touch-target)]">
            Support
          </Link>
          <Link href="/privacy" className="inline-flex items-center py-1 text-muted-foreground hover:text-foreground transition-colors max-sm:min-h-[var(--sploot-touch-target)]">
            Privacy
          </Link>
        </div>
      </section>
    </div>
  );
}
