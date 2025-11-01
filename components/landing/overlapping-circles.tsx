"use client";

interface OverlappingCirclesProps {
  strokeWidth?: number;
  className?: string;
}

export function OverlappingCircles({
  strokeWidth = 3,
  className,
}: OverlappingCirclesProps) {
  const size = 224;
  const radius = (size - strokeWidth * 2) / 3;
  const centerY = size / 2;
  const leftCx = size / 2 - radius / 2;
  const rightCx = size / 2 + radius / 2;

  return (
    <svg
      viewBox="0 0 224 224"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Sploot logo: overlapping circles representing semantic search"
    >
      <circle
        cx={leftCx}
        cy={centerY}
        r={radius}
        className="stroke-primary transition-all duration-200 fill-transparent group-hover:fill-primary/5"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={rightCx}
        cy={centerY}
        r={radius}
        className="stroke-primary transition-all duration-200 fill-transparent group-hover:fill-primary/5"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}
