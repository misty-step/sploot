'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { MemeCell, type MemeCellState } from './meme-cell';
import { type MemeDoodleKind } from './meme-doodle';

// Signed-out demo pile: license-safe doodles with enough keywords for the
// console to find the intended sample.
type Tile = {
  doodle: MemeDoodleKind;
  file: string;
  index: string;
  caption: string;
  kw: string;
};

const TILES: Tile[] = [
  { doodle: 'cat', file: 'IMG_4471.png', index: 'v#00471', caption: 'two cats arguing at a dinner table, one yelling', kw: 'cat cats kitten arguing argument yelling angry table dinner two pointing screaming fight' },
  { doodle: 'fire', file: 'screenshot_2019.png', index: 'v#02019', caption: 'cartoon dog drinking coffee in a burning room', kw: 'this is fine dog fire burning room flames coffee calm disaster everything okay' },
  { doodle: 'eyes', file: 'reaction_022.jpg', index: 'v#00822', caption: 'side-eye, guy looking at another thing', kw: 'distracted boyfriend looking turning other staring side eye jealous walking by' },
  { doodle: 'skull', file: 'IMG_9013.png', index: 'v#09013', caption: 'dead. skeleton still waiting on a bench', kw: 'skeleton waiting bench still forever dead bones patient reply text back' },
  { doodle: 'sparkle', file: 'galaxybrain_4.png', index: 'v#04004', caption: 'chef kiss, glowing brain expanding to a galaxy', kw: 'galaxy brain expanding glowing cosmic genius smart big mind ascend stars chef kiss sparkle' },
  { doodle: 'hundred', file: 'IMG_3120.png', index: 'v#03120', caption: 'no notes. a perfect hundred', kw: 'hundred 100 no notes perfect score keep it agree facts real top marks' },
  { doodle: 'bubble', file: 'mood_final2.png', index: 'v#08431', caption: 'group chat going off, what is happening', kw: 'group chat groupchat bubble text message reply notification what huh confused' },
  { doodle: 'sob', file: 'IMG_6004.png', index: 'v#06004', caption: 'crying, it is what it is', kw: 'crying sob tears sad fine mood feelings hiding it is what it is jordan' },
];

const STOP = new Set(['a', 'an', 'the', 'of', 'at', 'on', 'in', 'to', 'and', 'with', 'is', 'are', 'that', 'this', 'for', 'by', 'it', 'its', 'one', 'two', 'what', 'whats']);
const SYN: Record<string, string[]> = {
  guy: ['looking', 'staring'], man: ['guy'],
  kitty: ['cat'], cat: ['cats'], cats: ['cat'],
  mad: ['angry', 'yelling'], angry: ['mad', 'yelling'],
  burning: ['fire', 'flames'], fire: ['burning', 'flames'],
  sad: ['crying', 'tears'], crying: ['tears', 'sad'],
  smart: ['genius', 'brain', 'galaxy'], genius: ['brain', 'galaxy'],
};

function tokenize(str: string): string[] {
  const out: string[] = [];
  str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .forEach((t) => {
      if (!t || STOP.has(t)) return;
      out.push(t);
      if (SYN[t]) SYN[t].forEach((s) => out.push(s));
    });
  return out;
}

// Cosine-ish relevance: weighted token overlap normalized into 0..0.99.
function score(tokens: string[], kw: string): number {
  if (!tokens.length) return 0;
  let hits = 0;
  const unique = new Set<string>();
  tokens.forEach((t) => {
    if (kw.indexOf(t) !== -1) {
      hits += t.length >= 5 ? 1.4 : 1;
      unique.add(t);
    }
  });
  const coverage = unique.size / tokens.length;
  const raw = hits * 0.22 + coverage * 0.6;
  return Math.min(0.99, 1 - Math.exp(-raw));
}

const THRESHOLD = 0.2;

type Ranked = { tile: Tile; s: number };

/**
 * The centerpiece: a search console for your own memes. The best tile gets the
 * lime match ring, near matches get an orange inset ring, and everything else
 * recedes.
 */
export function SearchField() {
  const router = useRouter();
  const [query, setQuery] = useState('two cats arguing at a table');
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    queueMicrotask(() => setReducedMotion(mq.matches));
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const result = useMemo(() => {
    const tokens = tokenize(query);
    const ranked: Ranked[] = TILES.map((tile) => ({ tile, s: score(tokens, `${tile.kw} ${tile.caption}`) }))
      .sort((a, b) => b.s - a.s);
    const best = ranked[0];
    const found = !!query.trim() && best.s >= THRESHOLD;
    const states = new Map<string, { state: MemeCellState; score: string }>();
    ranked.forEach((r) => {
      let state: MemeCellState = 'default';
      if (found) {
        if (r.tile === best.tile) state = 'match';
        else if (r.s >= THRESHOLD && r.s >= best.s * 0.6) state = 'near';
        else state = 'dim';
      }
      states.set(r.tile.file, { state, score: r.s.toFixed(2) });
    });
    return {
      states,
      found,
      topSim: best.s.toFixed(2),
      hit: found ? best.tile.file : 'none',
      scanned: TILES.length,
      tokenCount: tokens.length,
    };
  }, [query]);

  return (
    <div className="w-full max-w-2xl">
      <div className="sploot-shadow-lg border-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-paper">
        {/* console titlebar with the 3 LED squares */}
        <div className="flex items-center justify-between gap-3 bg-sploot-ink px-3 py-2 font-mono text-[0.7rem] uppercase tracking-normal text-sploot-paper">
          <span>sploot://search.console</span>
          <span className="flex gap-1.5" aria-hidden="true">
            <i className="block h-3 w-3 border-2 border-sploot-paper bg-sploot-orange" />
            <i className="block h-3 w-3 border-2 border-sploot-paper bg-sploot-yellow" />
            <i className="block h-3 w-3 border-2 border-sploot-paper bg-sploot-lime" />
          </span>
        </div>

        {/* the search itself, on an acid-yellow shelf */}
        <form
          role="search"
          autoComplete="off"
          onSubmit={(e) => e.preventDefault()}
          className="border-b-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-yellow p-4"
        >
          <label
            htmlFor="search-input"
            className="mb-2 block font-mono text-[0.78rem] font-bold uppercase tracking-normal text-sploot-ink"
          >
            query &gt;&gt; describe what is in the meme
          </label>
          <div className="flex flex-wrap gap-3">
            <input
              id="search-input"
              type="search"
              value={query}
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="what's that one meme..."
              aria-describedby="search-readout"
              className="min-w-0 flex-1 border-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-paper px-4 py-3 font-mono text-lg font-bold text-sploot-ink shadow-[inset_3px_3px_0_rgba(10,10,10,0.12)] outline-none placeholder:text-sploot-ink/55"
            />
            <button
              type="submit"
              className="sploot-press flex min-h-[var(--sploot-touch-target)] shrink-0 items-center border-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-ink px-4 font-mono text-sm font-bold uppercase tracking-normal text-sploot-lime"
            >
              run search
            </button>
          </div>

          <div className="mt-3.5 flex flex-wrap gap-2" aria-label="example queries">
            {['two cats arguing at a table', 'this is fine dog fire', 'galaxy brain', 'skeleton still waiting'].map(
              (chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setQuery(chip)}
                  className="sploot-press border-[3px] border-sploot-ink bg-sploot-paper px-2.5 py-1.5 font-mono text-[0.72rem] font-bold lowercase tracking-normal text-sploot-ink shadow-[3px_3px_0_var(--sploot-ink)] hover:bg-sploot-magenta hover:text-white"
                >
                  try: {chip}
                </button>
              )
            )}
          </div>
        </form>

        {/* machinery readout: the product truth shows */}
        <output
          id="search-readout"
          aria-live="polite"
          className="flex flex-wrap gap-x-6 gap-y-1 bg-sploot-ink px-4 py-2.5 font-mono text-[0.72rem] uppercase tracking-normal text-sploot-paper"
        >
          <span>
            scan: <b className="text-sploot-lime sploot-tabular">{result.scanned}</b> vectors
          </span>
          <span>
            top sim:{' '}
            <b className={result.found ? 'text-sploot-lime' : 'text-sploot-orange'}>{result.topSim}</b>
          </span>
          <span>
            hit:{' '}
            <b className={result.found ? 'text-sploot-lime' : 'text-sploot-orange'}>{result.hit}</b>
          </span>
        </output>

        {/* grid head */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-magenta px-4 py-3 font-mono text-[0.74rem] font-bold uppercase tracking-normal text-white">
          <span>
            {result.found ? 'located 1 of 8 demo cells. i had a meme for this.' : '8 demo cells. zero folders.'}
          </span>
          <span aria-hidden="true">[ showing 8 sample vectors ]</span>
        </div>

        {/* the pile: search lights up the match, everything else recedes */}
        <div className="grid grid-cols-2 gap-px bg-sploot-ink sm:grid-cols-4" role="list" aria-label="sample meme library">
          {TILES.map((tile) => {
            const cell = result.states.get(tile.file)!;
            return (
              <div role="listitem" key={tile.file}>
                <MemeCell
                  file={tile.file}
                  index={tile.index}
                  doodle={tile.doodle}
                  caption={tile.caption}
                  score={cell.score}
                  state={cell.state}
                  animate={!reducedMotion}
                  className="h-full border-0"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="font-mono text-xs font-bold uppercase tracking-normal text-sploot-ink sploot-tabular">
          8 in the demo pile
        </span>
        <button
          type="button"
          onClick={() => router.push('/sign-up')}
          className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-normal text-sploot-ink underline decoration-sploot-magenta decoration-[3px] underline-offset-4 transition-colors duration-[var(--sploot-motion-fast)] hover:text-sploot-magenta"
        >
          search your own pile
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
