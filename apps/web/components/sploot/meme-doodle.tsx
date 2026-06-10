import { cn } from '@/lib/utils';

export type MemeDoodleKind =
  | 'cat'
  | 'skull'
  | 'fire'
  | 'sob'
  | 'eyes'
  | 'sparkle'
  | 'check'
  | 'hundred'
  | 'bubble'
  | 'zzz';

interface MemeDoodleProps {
  kind: MemeDoodleKind;
  className?: string;
}

/**
 * Hand-drawn-style meme glyphs for pile tiles and landing collage moments.
 * Pure inline SVG in the zine linework grammar: currentColor strokes, square
 * caps off, round joins on. License-safe stand-ins for real thumbnails on
 * signed-out surfaces.
 */
export function MemeDoodle({ kind, className }: MemeDoodleProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('h-full w-full', className)}
    >
      {kind === 'cat' && (
        <>
          <path d="M12 18 L9 8 L18 13" />
          <path d="M36 18 L39 8 L30 13" />
          <circle cx="24" cy="26" r="13" />
          <circle cx="19" cy="24" r="1" fill="currentColor" />
          <circle cx="29" cy="24" r="1" fill="currentColor" />
          <path d="M21 31 Q24 34 27 31" />
          <path d="M4 26 L11 27 M5 32 L12 31" />
          <path d="M44 26 L37 27 M43 32 L36 31" />
        </>
      )}
      {kind === 'skull' && (
        <>
          <path d="M24 7 C14 7 10 14 10 21 C10 26 12 29 15 31 L15 38 L33 38 L33 31 C36 29 38 26 38 21 C38 14 34 7 24 7 Z" />
          <circle cx="18" cy="21" r="3.5" fill="currentColor" />
          <circle cx="30" cy="21" r="3.5" fill="currentColor" />
          <path d="M20 38 L20 33 M24 38 L24 33 M28 38 L28 33" />
        </>
      )}
      {kind === 'fire' && (
        <>
          <path d="M24 5 C26 12 33 14 33 23 C33 30 29 35 24 35 C19 35 15 30 15 23 C15 18 18 16 19 12 C21 15 23 15 24 5 Z" />
          <path d="M24 26 C25 29 27 29 27 32 C27 34 26 35 24 35 C22 35 21 34 21 32 C21 30 23 29 24 26 Z" />
          <path d="M10 42 L38 42" />
        </>
      )}
      {kind === 'sob' && (
        <>
          <circle cx="24" cy="24" r="16" />
          <path d="M16 20 L21 22 M32 20 L27 22" />
          <path d="M18 26 L18 36 M30 26 L30 36" strokeWidth="3.5" />
          <path d="M19 33 Q24 29 29 33" />
        </>
      )}
      {kind === 'eyes' && (
        <>
          <ellipse cx="15" cy="24" rx="8" ry="10" />
          <ellipse cx="33" cy="24" rx="8" ry="10" />
          <circle cx="17.5" cy="26" r="3" fill="currentColor" />
          <circle cx="35.5" cy="26" r="3" fill="currentColor" />
        </>
      )}
      {kind === 'sparkle' && (
        <>
          <path d="M24 6 L27 20 L41 24 L27 28 L24 42 L21 28 L7 24 L21 20 Z" />
          <path d="M37 8 L38 12 L42 13 L38 14 L37 18 L36 14 L32 13 L36 12 Z" strokeWidth="1.8" />
        </>
      )}
      {kind === 'check' && (
        <>
          <rect x="8" y="8" width="32" height="32" />
          <path d="M15 25 L21 31 L33 17" strokeWidth="3.5" />
        </>
      )}
      {kind === 'hundred' && (
        <>
          <text
            x="24"
            y="26"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="monospace"
            fontWeight="bold"
            fontSize="17"
            stroke="none"
            fill="currentColor"
          >
            100
          </text>
          <path d="M9 36 L39 36" strokeWidth="3" />
          <path d="M12 41 L36 41" strokeWidth="3" />
        </>
      )}
      {kind === 'bubble' && (
        <>
          <rect x="6" y="9" width="36" height="24" />
          <path d="M14 33 L14 41 L23 33" />
          <text
            x="24"
            y="21"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="monospace"
            fontWeight="bold"
            fontSize="13"
            stroke="none"
            fill="currentColor"
          >
            ?!
          </text>
        </>
      )}
      {kind === 'zzz' && (
        <>
          <path d="M8 30 L20 30 L8 42 L20 42" />
          <path d="M22 18 L32 18 L22 28 L32 28" strokeWidth="2.2" />
          <path d="M32 8 L40 8 L32 16 L40 16" strokeWidth="1.8" />
        </>
      )}
    </svg>
  );
}
