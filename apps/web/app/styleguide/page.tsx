import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import {
  BangerStamp,
  ClusterPile,
  MemeCell,
  PileMark,
  SearchField,
  StatBlock,
  StatusBar,
  StickerTab,
} from '@/components/sploot';

export const metadata: Metadata = {
  title: 'sploot // design system catalog',
  description: 'Every neo-brutalist primitive in every state.',
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
    <section className="border-b-[length:var(--sploot-active-border-width)] border-sploot-ink py-12">
      <div className="mb-6 px-5 sm:px-8">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="font-display text-3xl uppercase leading-none tracking-normal text-sploot-ink sm:text-4xl">
            {title}
          </h2>
          <span className="font-mono text-xs uppercase tracking-normal text-sploot-ink/60">
            {idx}
          </span>
        </div>
        <p className="mt-1 font-mono text-[0.8rem] uppercase tracking-normal text-sploot-ink/60">
          {desc}
        </p>
      </div>
      <div className="px-5 sm:px-8">{children}</div>
    </section>
  );
}

const SWATCHES: Array<{ name: string; varName: string; ink?: boolean }> = [
  { name: 'ink', varName: '--sploot-ink' },
  { name: 'paper', varName: '--sploot-paper', ink: true },
  { name: 'paper-warm', varName: '--sploot-paper-warm', ink: true },
  { name: 'blue', varName: '--sploot-blue' },
  { name: 'cyan', varName: '--sploot-cyan', ink: true },
  { name: 'magenta', varName: '--sploot-magenta' },
  { name: 'yellow', varName: '--sploot-yellow', ink: true },
  { name: 'orange', varName: '--sploot-orange' },
  { name: 'lime', varName: '--sploot-lime', ink: true },
];

const TYPE_SCALE: Array<{ label: string; cls: string; sample: string }> = [
  { label: 'display / xl', cls: 'font-display text-6xl uppercase leading-none tracking-normal', sample: 'find it.' },
  { label: 'display / lg', cls: 'font-display text-4xl uppercase leading-none tracking-normal', sample: 'you saved it. now find it.' },
  { label: 'body / grotesk', cls: 'font-sans text-lg', sample: 'a private library for screenshots and reaction pics.' },
  { label: 'mono / label', cls: 'font-mono text-sm font-bold uppercase tracking-normal', sample: 'query >> describe what is in the meme' },
  { label: 'mono / meta', cls: 'font-mono text-xs uppercase tracking-normal', sample: 'scorer: token overlap / index: 8 demo vec / status: live' },
];

export default function StyleguidePage() {
  return (
    <main className="min-h-screen bg-sploot-workbench text-sploot-ink">
      {/* catalog header */}
      <header className="border-b-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-paper px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-4">
          <PileMark />
          <h1 className="font-display text-4xl uppercase leading-none tracking-normal sm:text-5xl">
            sploot design system
          </h1>
          <StickerTab tone="lime" tilt="right">
            neo-brutalist
          </StickerTab>
        </div>
        <p className="mt-3 max-w-2xl font-mono text-xs uppercase tracking-normal text-sploot-ink/60">
          the living catalog. every primitive, every state. thick ink borders,
          hard offset shadows, square corners, saturated blocks on paper.
        </p>
      </header>

      {/* 01 palette */}
      <Section idx="// 01" title="palette" desc="saturated color blocks on unbleached paper">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {SWATCHES.map((s) => (
            <div
              key={s.name}
              className="sploot-shadow-sm border-[length:var(--sploot-active-border-width)] border-sploot-ink"
            >
              <div className="h-16 w-full" style={{ background: `var(${s.varName})` }} />
              <div className="border-t-[3px] border-sploot-ink bg-sploot-paper px-2 py-1.5">
                <span className="block font-mono text-[0.62rem] font-bold uppercase tracking-normal">
                  {s.name}
                </span>
                <span className="block font-mono text-[0.56rem] uppercase tracking-normal text-sploot-ink/55">
                  {s.varName}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 02 type scale */}
      <Section idx="// 02" title="type scale" desc="archivo black · space mono · space grotesk">
        <div className="space-y-6">
          {TYPE_SCALE.map((t) => (
            <div key={t.label} className="border-b-2 border-dashed border-sploot-ink/20 pb-5">
              <span className="mb-2 block font-mono text-[0.62rem] uppercase tracking-normal text-sploot-ink/55">
                {t.label}
              </span>
              <p className={t.cls}>{t.sample}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 03 buttons */}
      <Section idx="// 03" title="buttons" desc="thick border · hard shadow · press motion (hover to lift, click to slam)">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary">primary</Button>
            <Button variant="attention">attention</Button>
            <Button variant="ghost">ghost</Button>
            <Button variant="ink">ink</Button>
            <Button variant="secondary">secondary</Button>
            <Button variant="accent">accent</Button>
            <Button variant="destructive">destructive</Button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary" size="sm">small</Button>
            <Button variant="primary" size="default">default</Button>
            <Button variant="primary" size="lg">large</Button>
            <Button variant="primary" disabled>disabled</Button>
            <Button variant="link">a flat link</Button>
          </div>
        </div>
      </Section>

      {/* 04 search console */}
      <Section idx="// 04" title="search console" desc="THE centerpiece. type a chip, watch the match reveal">
        <div className="flex justify-center bg-sploot-blue p-6 sm:p-10">
          <SearchField />
        </div>
      </Section>

      {/* 05 meme cells */}
      <Section idx="// 05" title="meme cells" desc="default · near (orange inset) · match (lime ring) · dim">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MemeCell file="IMG_4471.png" index="v#00471" doodle="cat" caption="two cats arguing at a table" state="default" />
          <MemeCell file="reaction_022.jpg" index="v#00822" doodle="eyes" caption="side-eye, looking away" score="0.42" state="near" animate={false} />
          <MemeCell file="screenshot.png" index="v#02019" doodle="fire" caption="this is fine, the room is on fire" score="0.91" state="match" animate={false} />
          <MemeCell file="IMG_9013.png" index="v#09013" doodle="skull" caption="dead. still waiting." state="dim" />
        </div>
      </Section>

      {/* 06 stat blocks */}
      <Section idx="// 06" title="stat blocks" desc="mono key over archivo-black value">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatBlock label="demo vectors" value="8" tone="magenta" />
            <StatBlock label="folders required" value="0" tone="blue" />
          <StatBlock label="scorer mode" value="local" tone="paper" />
        </div>
      </Section>

      {/* 07 status bar */}
      <Section idx="// 07" title="status bar" desc="the machinery readout. index / scorer / mode / route">
        <StatusBar
          cells={[
            { label: 'index', value: '8 demo vec' },
            { label: 'scorer', value: 'token overlap' },
            { label: 'mode', value: 'signed-out demo' },
            { label: 'route', value: '/styleguide' },
            { label: 'status', value: 'live', ok: true },
          ]}
        />
      </Section>

      {/* 08 sticker tabs */}
      <Section idx="// 08" title="sticker tabs" desc="saturated block · thick border · hard shadow · tilts">
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

      {/* 09 banger stamps */}
      <Section idx="// 09" title="banger stamps" desc="magenta block, slammed on like a rubber stamp">
        <div className="flex flex-wrap items-center gap-4">
          <BangerStamp />
          <BangerStamp count={1280} />
          <BangerStamp active={false} count={0} />
        </div>
      </Section>

      {/* 10 cluster pile */}
      <Section idx="// 10" title="cluster pile" desc="a self-organizing pile, resting and selected">
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
    </main>
  );
}
