import type { Metadata } from 'next';
import { Heart, Search, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BangerStamp,
  ClusterPile,
  IconButton,
  MemeCell,
  PileMark,
  SearchField,
  StatBlock,
  StatusBar,
  StickerTab,
} from '@/components/sploot';
import { TileActionDemo } from './tile-action-demo';

export const metadata: Metadata = {
  title: 'sploot // toybox design system',
  description: 'Every toybox primitive in every state — the living spec.',
};

// ---- catalog helpers ------------------------------------------------------

function Section({
  idx,
  title,
  desc,
  children,
}: {
  idx: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b-2 border-dashed border-sploot-ink/25 py-12">
      <div className="mb-6 px-5 sm:px-8">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="font-display text-3xl leading-none tracking-normal text-sploot-ink sm:text-4xl">
            {title}
          </h2>
          <span className="font-mono text-xs lowercase tracking-normal text-sploot-ink/60">
            {idx}
          </span>
        </div>
        <p className="mt-1 font-mono text-[0.8rem] lowercase tracking-normal text-sploot-ink/60">
          {desc}
        </p>
      </div>
      <div className="px-5 sm:px-8">{children}</div>
    </section>
  );
}

const SWATCHES: Array<{ name: string; varName: string }> = [
  { name: 'ink', varName: '--sploot-ink' },
  { name: 'paper', varName: '--sploot-paper' },
  { name: 'paper-warm', varName: '--sploot-paper-warm' },
  { name: 'panel', varName: '--sploot-panel' },
  { name: 'blue', varName: '--sploot-blue' },
  { name: 'cyan', varName: '--sploot-cyan' },
  { name: 'magenta', varName: '--sploot-magenta' },
  { name: 'yellow', varName: '--sploot-yellow' },
  { name: 'orange', varName: '--sploot-orange' },
  { name: 'lime', varName: '--sploot-lime' },
  { name: 'red', varName: '--sploot-red' },
  { name: 'purple', varName: '--sploot-purple' },
];

const TYPE_SCALE: Array<{ label: string; cls: string; sample: string }> = [
  {
    label: 'display / bungee · xl',
    cls: 'font-display text-6xl leading-none tracking-normal',
    sample: 'find it.',
  },
  {
    label: 'display / bungee · lg',
    cls: 'font-display text-4xl leading-none tracking-normal',
    sample: 'you saved it. now find it.',
  },
  {
    label: 'body / baloo 2',
    cls: 'font-sans text-lg font-medium',
    sample: 'a private library for screenshots and reaction pics.',
  },
  {
    label: 'label / space mono',
    cls: 'font-mono text-sm font-bold lowercase tracking-normal',
    sample: 'query >> describe what is in the meme',
  },
  {
    label: 'meta / space mono',
    cls: 'font-mono text-xs lowercase tracking-normal text-sploot-ink/70',
    sample: 'scorer: token overlap / index: 8 demo vec / status: live',
  },
];

function SwatchGrid() {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {SWATCHES.map((s) => (
        <div
          key={s.name}
          className="sploot-shadow-sm overflow-hidden rounded-[var(--sploot-radius-inner)] border-[3px] border-sploot-ink"
        >
          <div className="h-16 w-full" style={{ background: `var(${s.varName})` }} />
          <div className="border-t-2 border-sploot-ink bg-sploot-panel px-2 py-1.5">
            <span className="block font-mono text-[0.62rem] font-bold lowercase tracking-normal text-sploot-ink">
              {s.name}
            </span>
            <span className="block font-mono text-[0.56rem] lowercase tracking-normal text-sploot-ink/55">
              {s.varName}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StyleguidePage() {
  return (
    <main className="min-h-screen bg-sploot-workbench text-sploot-ink">
      {/* catalog header */}
      <header className="border-b-[3px] border-sploot-ink bg-sploot-panel px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-4">
          <PileMark />
          <h1 className="font-display text-4xl leading-none tracking-normal sm:text-5xl">
            sploot toybox
          </h1>
          <StickerTab tone="lime" tilt="right">
            ink minis
          </StickerTab>
        </div>
        <p className="mt-3 max-w-2xl font-mono text-xs lowercase tracking-normal text-sploot-ink/60">
          the living spec. every toy in every state: 3px ink shells, rounded corners,
          candy fills, drop-height elevation that lifts on hover and sinks on press.
        </p>
      </header>

      {/* 01 palette */}
      <Section idx="// 01" title="palette" desc="candy fills + ink on the dotted shelf — flips to the night shelf under .dark">
        <SwatchGrid />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink bg-sploot-workbench p-5">
            <span className="mb-3 block font-mono text-[0.66rem] lowercase tracking-normal text-sploot-ink/60">
              light shelf
            </span>
            <SwatchGrid />
          </div>
          {/* both themes by construction: this subtree is scoped to .dark */}
          <div className="dark rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink bg-sploot-workbench p-5 text-sploot-ink">
            <span className="mb-3 block font-mono text-[0.66rem] lowercase tracking-normal text-sploot-ink/60">
              night shelf (.dark)
            </span>
            <SwatchGrid />
          </div>
        </div>
      </Section>

      {/* 02 type specimen */}
      <Section idx="// 02" title="type specimen" desc="bungee display · baloo 2 body · space mono machine metadata">
        <div className="space-y-6">
          {TYPE_SCALE.map((t) => (
            <div key={t.label} className="border-b-2 border-dashed border-sploot-ink/20 pb-5">
              <span className="mb-2 block font-mono text-[0.62rem] lowercase tracking-normal text-sploot-ink/55">
                {t.label}
              </span>
              <p className={t.cls}>{t.sample}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 03 buttons */}
      <Section idx="// 03" title="buttons" desc="pill toys · 3px ink shell · drop shadow · hover lifts, press sinks">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary">primary</Button>
            <Button variant="attention">attention</Button>
            <Button variant="secondary">secondary</Button>
            <Button variant="accent">accent</Button>
            <Button variant="ghost">ghost</Button>
            <Button variant="ink">ink</Button>
            <Button variant="destructive">destructive</Button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary" size="sm">small</Button>
            <Button variant="primary" size="default">default</Button>
            <Button variant="primary" size="lg">large</Button>
            <Button variant="compact">compact</Button>
            <Button variant="primary" disabled>disabled</Button>
            <Button variant="link">a flat link</Button>
          </div>
        </div>
      </Section>

      {/* 04 icon buttons (ink minis) */}
      <Section idx="// 04" title="icon buttons" desc="the ink mini — flat at rest, candy-yellow lift on hover, bubblegum sink on press">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex flex-col items-center gap-2">
              <IconButton label="default heart">
                <Heart />
              </IconButton>
              <span className="font-mono text-[0.62rem] lowercase tracking-normal text-sploot-ink/60">default</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <IconButton
                label="focus specimen"
                className="outline outline-4 outline-offset-[3px] outline-sploot-focus"
              >
                <Search />
              </IconButton>
              <span className="font-mono text-[0.62rem] lowercase tracking-normal text-sploot-ink/60">focus-visible</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <IconButton label="banger" pressed>
                <Heart fill="currentColor" />
              </IconButton>
              <span className="font-mono text-[0.62rem] lowercase tracking-normal text-sploot-ink/60">pressed (banger)</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <IconButton label="disabled" disabled>
                <Trash2 />
              </IconButton>
              <span className="font-mono text-[0.62rem] lowercase tracking-normal text-sploot-ink/60">disabled</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <IconButton label="upload" size="dock" chip>
                <Upload />
              </IconButton>
              <span className="font-mono text-[0.62rem] lowercase tracking-normal text-sploot-ink/60">dock chip (44px)</span>
            </div>
          </div>
          <p className="max-w-2xl font-mono text-xs lowercase leading-5 tracking-normal text-sploot-ink/60">
            hover any control: it lifts up-left and fills banana yellow. press: it sinks and
            flashes bubblegum. the heart is the only banger mark — filled means banger,
            outline means not.
          </p>
        </div>
      </Section>

      {/* 05 action rail on a card */}
      <Section idx="// 05" title="action rail" desc="the rail sits below the caption, inside the transformed card, and never covers the meme">
        <div className="flex flex-wrap items-start gap-6">
          <TileActionDemo />
          <p className="max-w-sm font-mono text-xs lowercase leading-5 tracking-normal text-sploot-ink/60">
            tap the heart to toggle the banger. share and delete are ink minis too; delete
            fills cherry-red on hover. the rail rides along when the card lifts.
          </p>
        </div>
      </Section>

      {/* 06 search console */}
      <Section idx="// 06" title="search console" desc="THE centerpiece — type a chip, watch the match reveal on the pile">
        <div className="flex justify-center rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink bg-sploot-blue p-6 sploot-shadow sm:p-10">
          <SearchField />
        </div>
      </Section>

      {/* 07 meme cells */}
      <Section idx="// 07" title="meme cells" desc="default · near (orange inset) · match (lime ring) · dim">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MemeCell file="IMG_4471.png" index="v#00471" doodle="cat" caption="two cats arguing at a table" state="default" />
          <MemeCell file="reaction_022.jpg" index="v#00822" doodle="eyes" caption="side-eye, looking away" score="0.42" state="near" animate={false} />
          <MemeCell file="screenshot.png" index="v#02019" doodle="fire" caption="this is fine, the room is on fire" score="0.91" state="match" animate={false} />
          <MemeCell file="IMG_9013.png" index="v#09013" doodle="skull" caption="dead. still waiting." state="dim" />
          <MemeCell file="IMG_0388.jpg" index="v#00388" doodle="cat" caption="full sploot achieved. zero thoughts." state="selected" animate={false} />
          <MemeCell file="cooking.png" index="v#01101" doodle="eyes" caption="embedding in progress" state="loading" />
          <MemeCell file="borked.png" index="v#00500" doodle="skull" caption="this one borked" state="error" />
        </div>
      </Section>

      {/* 08 stat blocks */}
      <Section idx="// 08" title="stat blocks" desc="mono key over a bungee value, on a rounded toy shell">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatBlock label="memes indexed" value="1,482" tone="magenta" />
          <StatBlock label="folders required" value="0" tone="blue" />
          <StatBlock label="bangers" value="37" tone="paper" />
        </div>
      </Section>

      {/* 09 status bar */}
      <Section idx="// 09" title="status bar" desc="the machinery readout: index / scorer / mode / status">
        <StatusBar
          cells={[
            { label: 'index', value: '1,482 vec' },
            { label: 'scorer', value: 'siglip-base' },
            { label: 'queue', value: '0 cooking' },
            { label: 'route', value: '/api/search' },
            { label: 'status', value: 'live', ok: true },
          ]}
        />
      </Section>

      {/* 10 sticker tabs */}
      <Section idx="// 10" title="sticker tabs" desc="candy block · ink border · sticker drop · optional tilt">
        <div className="flex flex-wrap items-center gap-4">
          <StickerTab tone="cyan">cyan</StickerTab>
          <StickerTab tone="coral">coral</StickerTab>
          <StickerTab tone="violet">violet</StickerTab>
          <StickerTab tone="lime">lime</StickerTab>
          <StickerTab tone="ink">ink</StickerTab>
          <StickerTab tone="cyan" tilt="left">tilt left</StickerTab>
          <StickerTab tone="coral" tilt="right">tilt right</StickerTab>
        </div>
      </Section>

      {/* 11 banger stamps */}
      <Section idx="// 11" title="banger stamps" desc="bubblegum mark, slammed on like a rubber stamp">
        <div className="flex flex-wrap items-center gap-4">
          <BangerStamp />
          <BangerStamp count={1280} />
          <BangerStamp active={false} count={0} />
        </div>
      </Section>

      {/* 12 cluster pile */}
      <Section idx="// 12" title="cluster pile" desc="a self-organizing pile, resting and selected">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ClusterPile
            label="reaction pics"
            count={842}
            tone="coral"
            bangers={37}
            items={[
              { label: 'sob', doodle: 'sob', tone: 'violet' },
              { label: 'skull', doodle: 'skull', tone: 'coral' },
              { label: 'fire', doodle: 'fire', tone: 'lime' },
              { label: 'eyes', doodle: 'eyes', tone: 'cyan' },
              { label: 'cat', doodle: 'cat', tone: 'ink' },
              { label: '100', doodle: 'hundred', tone: 'coral' },
            ]}
          />
          <ClusterPile
            label="bangers only"
            count={128}
            tone="cyan"
            selected
            items={[
              { label: 'sparkle', doodle: 'sparkle', tone: 'cyan' },
              { label: 'bubble', doodle: 'bubble', tone: 'violet' },
              { label: 'check', doodle: 'check', tone: 'lime' },
              { label: 'zzz', doodle: 'zzz', tone: 'coral' },
              { label: 'fire', doodle: 'fire', tone: 'ink' },
              { label: 'cat', doodle: 'cat', tone: 'cyan' },
            ]}
          />
        </div>
      </Section>

      {/* 13 empty state */}
      <Section idx="// 13" title="empty state" desc="the shelf is empty — deadpan prompt to upload chaos, never a generic illustration">
        <div className="max-w-md rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink bg-sploot-panel p-6 sploot-shadow">
          <StickerTab tone="coral" tilt="left">
            nothing here yet
          </StickerTab>
          <h3 className="mt-4 font-display text-2xl leading-tight tracking-normal text-sploot-ink">
            the shelf is suspiciously empty
          </h3>
          <p className="mt-2 font-sans text-base leading-7 text-sploot-ink/80">
            upload chaos. the machine cannot organize a void — drop some screenshots in and
            it starts ranking them by meaning.
          </p>
          <div className="mt-5">
            <Button variant="primary" size="lg">
              <Upload /> upload chaos
            </Button>
          </div>
        </div>
      </Section>
    </main>
  );
}
