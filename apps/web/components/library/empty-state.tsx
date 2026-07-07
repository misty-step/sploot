'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { trackEmptyStateRender } from '@/lib/performance-metrics';
import { Button } from '@/components/ui/button';
import { MemeCell, StickerTab } from '@/components/sploot';
import { usePwaInstallPrompt, isIosBrowser } from '@/hooks/use-pwa-install';
import { logger } from '@/lib/observability-logger';

export type EmptyStateVariant = 'first-use' | 'filtered' | 'search';

/**
 * Live Chrome Web Store listing for the Sploot extension
 * (item fbhkflbcnllfogefckablkafjknmcfnd, submitted via
 * apps/extension/STORE_LISTING.md).
 */
export const SPLOOT_EXTENSION_STORE_URL =
  'https://chromewebstore.google.com/detail/sploot/fbhkflbcnllfogefckablkafjknmcfnd';

export type CaptureDevice = 'ios' | 'android' | 'desktop';

/**
 * Coarse device classification for the capture rig: which always-with-you
 * capture surface should lead. iPadOS 13+ masquerades as macOS but reports
 * multi-touch, so touch points break the tie (same rule as isIosBrowser).
 */
export function detectCaptureDevice(userAgent: string, maxTouchPoints = 0): CaptureDevice {
  if (isIosBrowser(userAgent, maxTouchPoints)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  onUploadClick?: () => void;
  searchQuery?: string;
  className?: string;
  showUploadButton?: boolean;
  onFilesDropped?: (files: File[]) => void;
}

/** One demo tile spec for the example pile. */
const DEMO_PILE = [
  { file: 'IMG_0041.png', index: 'v#00041', doodle: 'skull', state: 'dim' },
  { file: 'cat_scream.png', index: 'v#00107', doodle: 'cat', state: 'match', score: '0.91' },
  { file: 'rxn_774.png', index: 'v#00774', doodle: 'sob', state: 'dim' },
] as const;

/** A bordered LED square: lit lime = this surface already works. */
function SurfaceLed({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block h-3 w-3 shrink-0 border-2 border-sploot-ink',
        on ? 'bg-sploot-lime' : 'bg-sploot-paper'
      )}
    />
  );
}

/** One capture-surface row in the rig: LED + label + copy + one-tap action. */
function SurfaceRow({
  on,
  label,
  copy,
  action,
}: {
  on: boolean;
  label: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-[3px] border-sploot-ink bg-sploot-paper px-3 py-2">
      <SurfaceLed on={on} />
      <div className="min-w-0 flex-1 text-left">
        <div className="font-mono text-xs font-bold uppercase tracking-normal text-sploot-ink">{label}</div>
        <div className="font-mono text-[0.65rem] tracking-normal text-sploot-ink/70">{copy}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * The capture-surface lane of the first-use rig. Device-aware: desktop leads
 * with the Chrome extension, Android with the share sheet (via PWA install),
 * iOS with the "Save to Sploot" shortcut. Lab + decision:
 * docs/design/lab-074-capture-activation.html (option 01, two-lane capture rig).
 */
function CaptureSurfaces() {
  const [device, setDevice] = useState<CaptureDevice | null>(null);
  const { installable, installed, requiresManualInstall, promptInstall } = usePwaInstallPrompt();

  useEffect(() => {
    setDevice(
      detectCaptureDevice(window.navigator.userAgent, window.navigator.maxTouchPoints ?? 0)
    );
  }, []);

  if (device === null) {
    // One frame of unknown device: render nothing rather than the wrong pitch.
    return <div aria-hidden="true" className="min-h-[120px]" />;
  }

  return (
    <div className="flex flex-col gap-2">
      {device === 'desktop' && (
        <>
          <SurfaceRow
            on={false}
            label="chrome extension"
            copy="right-click any image, anywhere → straight into the pile"
            action={
              <Button asChild size="sm" variant="primary">
                <a href={SPLOOT_EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer">
                  get the extension
                </a>
              </Button>
            }
          />
          <SurfaceRow on label="paste / drag" copy="⌘V or drop files on this page — already live" />
        </>
      )}

      {device === 'android' && (
        <>
          {installed ? (
            <SurfaceRow on label="share sheet" copy="app installed — share any image to sploot" />
          ) : installable ? (
            <SurfaceRow
              on={false}
              label="share sheet"
              copy="install the app once, then share images from anywhere"
              action={
                <Button size="sm" variant="primary" onClick={() => promptInstall()}>
                  wire the share sheet
                </Button>
              }
            />
          ) : (
            <SurfaceRow
              on={false}
              label="share sheet"
              copy="browser menu → add to home screen, then share images from anywhere"
            />
          )}
          <SurfaceRow on label="paste / drag" copy="paste or drop images here — already live" />
        </>
      )}

      {device === 'ios' && (
        <>
          <SurfaceRow
            on={false}
            label="iphone shortcut"
            copy="put sploot in your share sheet — one tap from any app"
            action={
              <Button asChild size="sm" variant="primary">
                <Link href="/app/settings#upload-tokens">set up the shortcut</Link>
              </Button>
            }
          />
          {!installed && requiresManualInstall ? (
            <SurfaceRow
              on={false}
              label="home screen"
              copy="share icon → add to home screen for the full app"
            />
          ) : (
            <SurfaceRow on label="paste" copy="paste images here — already live" />
          )}
        </>
      )}
    </div>
  );
}

/**
 * One-tap starter pile: seeds 8 bundled, license-safe memes whose real CLIP
 * vectors are precomputed and committed (POST /api/library/starter), then
 * routes straight into a live search over them — the aha (type words → get
 * the picture) on real product machinery, seconds after signup, even for a
 * stranger with no memes on hand. Every seeded asset is tagged
 * `starter-pile`, so the whole pile deletes in one sweep. Mechanism chosen in
 * docs/design/lab-053-stranger-aha.html (option 02, opt-in starter pile).
 */
function StarterPileLoader() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'seeding' | 'failed'>('idle');

  const loadStarterPile = useCallback(async () => {
    setState('seeding');
    try {
      const res = await fetch('/api/library/starter', { method: 'POST' });
      if (!res.ok) throw new Error(`starter seed returned ${res.status}`);
      const body = (await res.json()) as { suggestedQueries?: string[] };
      const query = body.suggestedQueries?.[0] ?? 'two cats arguing at a table';
      router.push(`/app?q=${encodeURIComponent(query)}`);
    } catch (error) {
      logger.logError('library-empty-state.starter-seed-failed', error);
      setState('failed');
    }
  }, [router]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={loadStarterPile}
          disabled={state === 'seeding'}
          aria-label="Load the starter pile"
        >
          {state === 'seeding' ? 'loading the pile…' : 'load the starter pile'}
        </Button>
        <span className="font-mono text-[0.65rem] tracking-normal text-sploot-ink/70">
          8 demo memes, real vectors — delete anytime
        </span>
      </div>
      {state === 'failed' ? (
        <p
          role="alert"
          className="font-mono text-[0.65rem] font-bold uppercase tracking-normal text-sploot-orange"
        >
          the starter pile didn&rsquo;t load — try again
        </p>
      ) : null}
    </div>
  );
}

/**
 * Empty state component for the library.
 *
 * First-use is the capture rig (DESIGN.md §6: "show product action and example
 * pile, not generic illustration"): a demo pile of MemeCells with one locked
 * match, beside device-aware capture-surface activation. Search/filtered are
 * compact console blocks.
 */
export function EmptyState({
  variant = 'first-use',
  onUploadClick,
  searchQuery,
  className,
  showUploadButton = true,
  onFilesDropped,
}: EmptyStateProps) {
  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const mountTimeRef = useRef(performance.now());

  // Performance measurement
  useEffect(() => {
    const renderEnd = performance.now();
    const renderTime = renderEnd - mountTimeRef.current;

    trackEmptyStateRender(mountTimeRef.current);

    if (process.env.NODE_ENV === 'development') {
      logger.logInfo('library-empty-state.render-timing', {
        renderTimeMs: Number(renderTime.toFixed(2)),
      });
    }
  }, []);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter((file) => file.type.startsWith('image/'));

        if (imageFiles.length > 0 && onFilesDropped) {
          onFilesDropped(imageFiles);
        } else if (imageFiles.length === 0 && files.length > 0) {
          console.warn('[EmptyState] No image files in drop');
        }
      }
    },
    [onFilesDropped]
  );

  const enableDragDrop = variant === 'first-use';

  // Search / filtered: compact console block, no capture rig.
  if (variant !== 'first-use') {
    const isSearch = variant === 'search';
    return (
      <div className={cn('flex h-full items-center justify-center px-4 py-8', className)}>
        <div className="w-full max-w-md border-[4px] border-sploot-ink bg-sploot-paper sploot-shadow">
          <div className="flex items-center justify-between border-b-[4px] border-sploot-ink bg-sploot-ink px-3 py-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-normal text-sploot-paper">
            <span>{isSearch ? 'sploot.search' : 'pile.filters'}</span>
            <span aria-hidden="true">■ ■ ■</span>
          </div>
          <div className="space-y-3 p-5 text-center">
            <h2 className="font-mono text-base font-bold uppercase tracking-normal text-sploot-ink">
              {isSearch ? 'no matches in the pile' : 'no memes match these filters'}
            </h2>
            {isSearch && searchQuery ? (
              <div className="border-[3px] border-sploot-ink bg-sploot-yellow px-3 py-1.5 font-mono text-sm tracking-normal text-sploot-ink">
                “{searchQuery}”
              </div>
            ) : null}
            <p className="font-mono text-xs tracking-normal text-sploot-ink/70">
              {isSearch
                ? 'the vibe may be too specific. try fewer words.'
                : 'these filters filtered everything. loosen up or clear them.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // First-use: the two-lane capture rig.
  return (
    <div
      className={cn('flex h-full items-start justify-center overflow-y-auto px-4 py-8', className)}
      onDragEnter={enableDragDrop ? handleDragEnter : undefined}
      onDragOver={enableDragDrop ? handleDragOver : undefined}
      onDragLeave={enableDragDrop ? handleDragLeave : undefined}
      onDrop={enableDragDrop ? handleDrop : undefined}
    >
      <section
        aria-label="first-run capture setup"
        className={cn(
          'w-full max-w-3xl border-[4px] border-sploot-ink bg-sploot-paper-warm sploot-shadow-lg transition-transform duration-[var(--sploot-motion-base)] ease-[var(--sploot-ease-out)]',
          isDragging && 'scale-[1.01] shadow-[0_0_0_4px_var(--sploot-lime)]'
        )}
      >
        <div className="flex items-center justify-between border-b-[4px] border-sploot-ink bg-sploot-ink px-3 py-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-normal text-sploot-paper">
          <span>the.pile — 0 memes</span>
          <span>{isDragging ? 'drop it' : 'status: hungry'}</span>
        </div>

        <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-2">
          {/* Lane A: the product action, demonstrated on a demo pile */}
          <div className="space-y-3">
            <StickerTab tone="lime" tilt="left">
              demo pile — this is the trick
            </StickerTab>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_PILE.map((cell) => (
                <MemeCell
                  key={cell.file}
                  file={cell.file}
                  index={cell.index}
                  doodle={cell.doodle}
                  state={cell.state}
                  score={'score' in cell ? cell.score : undefined}
                  animate={false}
                  className="min-h-[110px]"
                />
              ))}
            </div>
            <p className="font-mono text-[0.65rem] tracking-normal text-sploot-ink/70">
              query “screaming cat” → match locked. type words. get the picture. no memes on
              hand? load the starter pile and run a real search right now.
            </p>
            <StarterPileLoader />
          </div>

          {/* Lane B: wire an always-with-you capture surface */}
          <div className="space-y-3">
            <StickerTab tone="cyan" tilt="right">
              wire a capture surface
            </StickerTab>
            <CaptureSurfaces />
            {showUploadButton ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[0.65rem] uppercase tracking-normal text-sploot-ink/70">
                  or right now:
                </span>
                {onUploadClick ? (
                  <Button size="sm" variant="ink" onClick={onUploadClick} aria-label="Upload images">
                    upload chaos
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="ink">
                    <Link href="/app?upload=1" aria-label="Upload images">
                      upload chaos
                    </Link>
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
