'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Complete-library export (Powder card sploot-057).
 *
 * One visible operation: start an export, download its zip parts and the
 * manifest, done. Progress is server-verified (a part only counts once the
 * server streamed its final byte), so reloading the page — or coming back
 * hours later — resumes exactly where the export left off.
 */

interface ExportPart {
  index: number;
  count: number;
  bytes: number;
  served: boolean;
  file: string;
}

interface ExportView {
  id: string;
  status: 'active' | 'superseded' | 'canceled' | 'expired';
  createdAt: string;
  expiresAt: string;
  totals: { assets: number; originalBytes: number };
  partCount: number;
  parts: ExportPart[];
  failures: Array<{ assetId: string; archivePath: string; reason: string }>;
  complete: boolean;
  incompleteReasons: string[];
  downloads: { status: string; manifest: string; parts: string[] };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatExpiry(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'expired';
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  if (hours >= 1) return `expires in ~${hours}h`;
  const minutes = Math.max(1, Math.floor(remaining / (60 * 1000)));
  return `expires in ~${minutes}m`;
}

const POLL_MS = 4000;

export function LibraryExportCard() {
  const [view, setView] = useState<ExportView | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/library/export');
      if (!res.ok) return;
      const data = await res.json();
      setView(data.export ?? null);
    } catch {
      // Transient — the next poll or user action retries.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/library/export');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setView(data.export ?? null);
        }
      } catch {
        // Transient — the user can retry via the button.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll while an export is in flight so served-part progress stays live.
  useEffect(() => {
    const shouldPoll = view && view.status === 'active' && !view.complete;
    if (shouldPoll && !pollRef.current) {
      pollRef.current = setInterval(() => {
        void refresh();
      }, POLL_MS);
    }
    if (!shouldPoll && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [view, refresh]);

  const start = async (force: boolean) => {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch('/api/library/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      if (!res.ok) {
        setError('Could not start the export. Try again in a moment.');
        return;
      }
      const data = await res.json();
      setView(data.export);
    } catch {
      setError('Could not start the export. Try again in a moment.');
    } finally {
      setWorking(false);
    }
  };

  const cancel = async () => {
    if (!view) return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(view.downloads.status, { method: 'DELETE' });
      if (res.ok) {
        setView(null);
      }
    } catch {
      setError('Could not cancel the export.');
    } finally {
      setWorking(false);
    }
  };

  const servedCount = view ? view.parts.filter((part) => part.served).length : 0;
  const active = view?.status === 'active';

  return (
    <section className="sploot-card p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Export your library</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Download every original you&apos;ve saved plus a{' '}
          <code className="text-xs">manifest.json</code> with all metadata (tags,
          favorites, checksums, timestamps). Works even if you&apos;re over
          quota, delinquent, or canceled — your memes are never held hostage.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Checking for an export in progress…</p>
      ) : !view || !active ? (
        <div className="space-y-3">
          {view?.status === 'expired' && (
            <p className="text-sm text-muted-foreground">
              Your previous export expired. Start a fresh one — nothing was lost.
            </p>
          )}
          <Button size="sm" onClick={() => start(false)} disabled={working}>
            {working ? 'Starting…' : 'Export my library'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Big libraries arrive as zip parts of up to 256 MB each, so an
            interrupted download only re-fetches one part, never the whole
            thing. Download links stay valid for 24 hours.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">
                {view.totals.assets.toLocaleString()} memes ·{' '}
                {formatBytes(view.totals.originalBytes)}
              </span>
              <span className="text-muted-foreground text-xs">{formatExpiry(view.expiresAt)}</span>
            </div>
            <div className="h-2 bg-muted overflow-hidden rounded-[var(--sploot-radius-pill)] border-2 border-sploot-ink">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${view.partCount === 0 ? 100 : Math.round((servedCount / view.partCount) * 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {view.partCount === 0
                ? 'No media to download — grab the manifest below.'
                : `${servedCount} of ${view.partCount} part${view.partCount === 1 ? '' : 's'} downloaded (server-verified).`}
            </p>
          </div>

          {view.parts.length > 0 && (
            <ul className="space-y-1.5">
              {view.parts.map((part) => (
                <li key={part.index} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-muted-foreground">
                    Part {part.index + 1} · {part.count.toLocaleString()} memes ·{' '}
                    {formatBytes(part.bytes)}
                    {part.served && <span className="text-sploot-lime"> ✓</span>}
                  </span>
                  <a
                    href={view.downloads.parts[part.index]}
                    className="text-sploot-blue hover:underline shrink-0"
                    download
                  >
                    {part.served ? 'Download again' : 'Download'}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {view.failures.length > 0 && (
            <p className="text-xs text-destructive">
              {view.failures.length} object{view.failures.length === 1 ? '' : 's'} could not be
              exported (listed in the manifest under <code>failures</code>). The rest of your
              library is intact.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" asChild>
              <a href={view.downloads.manifest} download>
                Download manifest.json
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={() => start(true)} disabled={working}>
              Start fresh export
            </Button>
            <Button size="sm" variant="destructive" onClick={cancel} disabled={working}>
              Cancel export
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Download the manifest last — it records exactly which parts were fully
            served and calls out anything missing, so you can prove your backup is
            complete. Your browser may ask permission to download multiple files.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
