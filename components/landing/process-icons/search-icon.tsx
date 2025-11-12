import { processIconClassName } from "./shared";
import type { ProcessIconProps } from "./shared";

export function SearchIcon({ className, ...props }: ProcessIconProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={processIconClassName(className)}
      aria-hidden="true"
      {...props}
    >
      <circle cx={52} cy={52} r={26} />
      <path d="M69 69 96 96" />
      <rect x={78} y={78} width={20} height={20} rx={4} opacity={0.35} />
      <rect x={32} y={32} width={12} height={12} rx={2} opacity={0.6} />
      <rect x={48} y={32} width={12} height={12} rx={2} opacity={0.6} />
      <rect x={32} y={48} width={12} height={12} rx={2} opacity={0.6} />
      <rect x={48} y={48} width={12} height={12} rx={2} opacity={0.6} />
      <path d="M80 38h24" />
      <path d="M92 26v24" />
    </svg>
  );
}
