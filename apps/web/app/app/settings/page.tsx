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
}

interface UploadTokenSummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
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
  const [uploadTokens, setUploadTokens] = useState<UploadTokenSummary[]>([]);
  const [newUploadToken, setNewUploadToken] = useState<string | null>(null);
  const [uploadTokenBusy, setUploadTokenBusy] = useState<string | null>(null);
  const [uploadTokenError, setUploadTokenError] = useState<string | null>(null);
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
        });
      }
    }

    async function loadUploadTokens() {
      const response = await fetch('/api/upload-tokens');
      if (!response.ok) return;
      const data = await response.json();
      if (!cancelled) {
        setUploadTokens(Array.isArray(data.tokens) ? data.tokens : []);
      }
    }

    loadStorageStats().catch(() => {});
    loadUploadTokens().catch(() => {});

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

  const createUploadToken = async () => {
    setUploadTokenBusy('create');
    setUploadTokenError(null);
    setNewUploadToken(null);
    try {
      const response = await fetch('/api/upload-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Save to Sploot Shortcut' }),
      });
      const data = await response.json();
      if (!response.ok || !data.token || !data.record) {
        throw new Error(data.error ?? 'Could not create upload token');
      }
      setNewUploadToken(data.token);
      setUploadTokens((tokens) => [data.record, ...tokens]);
    } catch (error) {
      setUploadTokenError(error instanceof Error ? error.message : 'Could not create upload token');
    } finally {
      setUploadTokenBusy(null);
    }
  };

  const revokeUploadToken = async (tokenId: string) => {
    setUploadTokenBusy(tokenId);
    setUploadTokenError(null);
    try {
      const response = await fetch(`/api/upload-tokens/${tokenId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Could not revoke upload token');
      }
      setUploadTokens((tokens) => tokens.map((token) => (
        token.id === tokenId
          ? { ...token, revokedAt: new Date().toISOString() }
          : token
      )));
    } catch (error) {
      setUploadTokenError(error instanceof Error ? error.message : 'Could not revoke upload token');
    } finally {
      setUploadTokenBusy(null);
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
          Heads up: sharing images into Sploot from other apps&apos; share sheets
          works on Android. iPhones need the Save to Sploot Shortcut below.
        </p>
      </section>

      <section className="bg-card border border-border p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Save to Sploot Shortcut</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Mint an upload-only token for Apple Shortcuts. It can add memes but
            cannot read, edit, or delete your library.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void createUploadToken()}
            disabled={uploadTokenBusy !== null}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90',
              uploadTokenBusy !== null && 'opacity-60 cursor-not-allowed'
            )}
          >
            {uploadTokenBusy === 'create' ? 'Creating...' : 'Create upload token'}
          </button>
          <Link
            href="/docs/ios/save-to-sploot-shortcut"
            className="text-sm text-accent-cyan hover:underline"
          >
            Shortcut setup
          </Link>
        </div>

        {newUploadToken && (
          <div className="border border-border bg-background p-3 space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Copy this token now</p>
            <code className="block break-all text-xs text-foreground">{newUploadToken}</code>
            <p className="text-xs text-muted-foreground">
              Sploot stores only a hash. This token will not be shown again.
            </p>
          </div>
        )}

        {uploadTokenError && (
          <p className="text-sm text-destructive">{uploadTokenError}</p>
        )}

        <div className="space-y-2">
          {uploadTokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Shortcut tokens yet.</p>
          ) : uploadTokens.map((token) => (
            <div key={token.id} className="flex flex-wrap items-center justify-between gap-3 border border-border bg-background p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{token.name}</p>
                <p className="text-xs text-muted-foreground">
                  {token.revokedAt
                    ? `Revoked ${new Date(token.revokedAt).toLocaleDateString()}`
                    : token.lastUsedAt
                      ? `Last used ${new Date(token.lastUsedAt).toLocaleDateString()}`
                      : `Created ${new Date(token.createdAt).toLocaleDateString()}`}
                </p>
              </div>
              {!token.revokedAt && (
                <button
                  type="button"
                  onClick={() => void revokeUploadToken(token.id)}
                  disabled={uploadTokenBusy !== null}
                  className="border border-border px-3 py-2 text-xs font-medium uppercase text-foreground hover:bg-muted disabled:opacity-60"
                >
                  {uploadTokenBusy === token.id ? 'Revoking...' : 'Revoke'}
                </button>
              )}
            </div>
          ))}
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
