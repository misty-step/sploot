import Link from 'next/link';
import { Shuffle, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClusterPile } from './cluster-pile';
import { StickerTab } from './sticker-tab';

const importItems = [
  { label: 'reaction', tone: 'cyan' as const },
  { label: 'groupchat', tone: 'coral' as const },
  { label: 'cat?', tone: 'lime' as const },
  { label: 'drake', tone: 'violet' as const },
  { label: 'screenshot', tone: 'ink' as const },
  { label: 'chaos', tone: 'coral' as const },
];

const piles = [
  {
    label: 'dramatic reactions',
    count: 128,
    tone: 'violet' as const,
    selected: true,
    bangers: 17,
    items: [
      { label: 'nope', tone: 'violet' as const },
      { label: 'sigh', tone: 'cyan' as const },
      { label: 'panic', tone: 'coral' as const },
      { label: 'same', tone: 'lime' as const },
      { label: 'why', tone: 'violet' as const },
      { label: 'fine', tone: 'ink' as const },
    ],
  },
  {
    label: 'tiny wins',
    count: 74,
    tone: 'cyan' as const,
    items: [
      { label: 'yes', tone: 'cyan' as const },
      { label: 'chef', tone: 'lime' as const },
      { label: 'done', tone: 'cyan' as const },
      { label: 'ship', tone: 'violet' as const },
      { label: 'clean', tone: 'ink' as const },
      { label: 'nice', tone: 'coral' as const },
    ],
  },
  {
    label: 'unhinged office',
    count: 46,
    tone: 'coral' as const,
    items: [
      { label: 'email', tone: 'coral' as const },
      { label: 'slack', tone: 'violet' as const },
      { label: 'zoom', tone: 'ink' as const },
      { label: 'oops', tone: 'lime' as const },
      { label: 'later', tone: 'cyan' as const },
      { label: 'wild', tone: 'coral' as const },
    ],
  },
];

export function AtlasLandingHero() {
  return (
    <section className="min-h-[92svh] overflow-hidden bg-sploot-workbench px-4 pb-16 pt-24 md:px-8 md:pb-20 md:pt-24">
      <div className="mx-auto grid w-full min-w-0 max-w-7xl gap-6 lg:grid-cols-[0.9fr_0.72fr_1.08fr] lg:items-center">
        <div className="order-2 mx-auto w-full max-w-[22rem] min-w-0 space-y-4 lg:order-1 lg:max-w-none">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-sploot-cyan" aria-hidden="true" />
            <StickerTab tone="lime" tilt="left">upload chaos</StickerTab>
          </div>
          <div className="w-full max-w-full overflow-hidden border border-sploot-ink bg-sploot-paper p-3">
            <div className="mb-3 flex items-center justify-between font-mono text-xs uppercase text-muted-foreground">
              <span>messy import pile</span>
              <span className="sploot-tabular">312 saves</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {importItems.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className="min-w-0 overflow-hidden border border-sploot-ink bg-sploot-paper-warm p-2 font-mono text-[0.62rem] font-bold uppercase text-sploot-ink aspect-[4/5]"
                >
                  <div className="flex h-full items-end break-all">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="order-1 mx-auto w-full max-w-[22rem] space-y-5 overflow-hidden text-center lg:order-2 lg:max-w-none lg:text-left">
          <StickerTab tone="cyan" className="mx-auto lg:mx-0">
            no folders just vibes
          </StickerTab>
          <div className="space-y-4">
            <h1
              aria-label="your saves sort themselves."
              className="font-display text-5xl leading-[0.92] tracking-normal text-sploot-ink sm:text-6xl md:text-8xl lg:text-7xl"
            >
              <span className="block">your saves</span>
              <span className="block">sort</span>
              <span className="block">themselves.</span>
            </h1>
            <p className="mx-auto max-w-xl text-base leading-7 text-muted-foreground md:text-lg lg:mx-0">
              Sploot turns the memes you already saved into searchable semantic piles, bangers,
              and nearby weird little neighborhoods.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Button asChild variant="accent" size="lg" className="min-h-[var(--sploot-touch-target)] px-6">
              <Link href="/sign-up">start your pile</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-h-[var(--sploot-touch-target)] px-6">
              <Link href="/sign-in">sign in</Link>
            </Button>
          </div>
          <div className="grid min-w-0 grid-cols-3 overflow-hidden border border-sploot-ink bg-sploot-command-surface text-left font-mono text-[0.68rem] sploot-tabular sm:text-xs">
            <div className="min-w-0 border-r border-sploot-ink p-3">
              <span className="block truncate text-muted-foreground">search</span>
              <span className="font-bold text-sploot-cyan">0.18s</span>
            </div>
            <div className="min-w-0 border-r border-sploot-ink p-3">
              <span className="block truncate text-muted-foreground">piles</span>
              <span className="font-bold text-sploot-violet">24</span>
            </div>
            <div className="min-w-0 p-3">
              <span className="block truncate text-muted-foreground">bangers</span>
              <span className="font-bold text-sploot-coral">91</span>
            </div>
          </div>
        </div>

        <div className="order-3 mx-auto w-full max-w-[22rem] min-w-0 space-y-3 lg:max-w-none">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sploot-violet" aria-hidden="true" />
              <StickerTab tone="violet" tilt="right">automatic piles</StickerTab>
            </div>
            <Shuffle className="h-5 w-5 text-sploot-cyan" aria-hidden="true" />
          </div>
          <div className="space-y-4">
            {piles.map((pile) => (
              <ClusterPile key={pile.label} {...pile} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
