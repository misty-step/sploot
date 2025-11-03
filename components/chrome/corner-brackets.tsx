'use client';

import { cn } from '@/lib/utils';

interface CornerBracketsProps {
  className?: string;
}

/**
 * Terminal-style corner brackets for viewport framing
 * Creates a tactical/technical aesthetic
 *
 * Each bracket: 24px × 24px, 2px stroke, positioned absolutely in corners
 * Fixed positioning with 8px inset from viewport edges
 */
export function CornerBrackets({ className }: CornerBracketsProps) {
  const strokeWidth = 2;
  const size = 24;
  const armLength = 16; // Length of each bracket arm

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-0 z-[100]',
        className
      )}
      aria-hidden="true"
    >
      {/* Top-left bracket */}
      <svg
        className="absolute top-2 left-2 text-muted-foreground"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d={`M ${armLength} ${strokeWidth} L ${strokeWidth} ${strokeWidth} L ${strokeWidth} ${armLength}`}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>

      {/* Top-right bracket */}
      <svg
        className="absolute top-2 right-2 text-muted-foreground"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d={`M ${size - armLength} ${strokeWidth} L ${size - strokeWidth} ${strokeWidth} L ${size - strokeWidth} ${armLength}`}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>

      {/* Bottom-left bracket */}
      <svg
        className="absolute bottom-2 left-2 text-muted-foreground"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d={`M ${strokeWidth} ${size - armLength} L ${strokeWidth} ${size - strokeWidth} L ${armLength} ${size - strokeWidth}`}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>

      {/* Bottom-right bracket */}
      <svg
        className="absolute bottom-2 right-2 text-muted-foreground"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d={`M ${size - armLength} ${size - strokeWidth} L ${size - strokeWidth} ${size - strokeWidth} L ${size - strokeWidth} ${size - armLength}`}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    </div>
  );
}
