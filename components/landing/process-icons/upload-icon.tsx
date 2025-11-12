import { processIconClassName } from "./shared";
import type { ProcessIconProps } from "./shared";

export function UploadIcon({ className, ...props }: ProcessIconProps) {
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
      <rect x={30} y={38} width={60} height={72} rx={10} opacity={0.35} />
      <path d="M44 86h32" opacity={0.6} />
      <path d="M44 98h32" opacity={0.4} />
      <path d="M60 74V28" />
      <path d="M48 44 60 32 72 44" />
      <path d="M60 32V16" />
    </svg>
  );
}
