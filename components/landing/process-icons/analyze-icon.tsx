import { processIconClassName } from "./shared";
import type { ProcessIconProps } from "./shared";

export function AnalyzeIcon({ className, ...props }: ProcessIconProps) {
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
      <circle cx={60} cy={60} r={34} opacity={0.7} />
      <circle cx={60} cy={60} r={8} />
      <circle cx={60} cy={20} r={5} />
      <circle cx={96} cy={46} r={5} />
      <circle cx={24} cy={46} r={5} />
      <circle cx={60} cy={104} r={5} />
      <path d="M60 28v24" />
      <path d="M60 68v28" />
      <path d="M54 60H30" />
      <path d="M66 60h24" />
      <path d="M72 40l16-10" />
      <path d="M48 40 32 30" />
      <path d="M72 80l16 10" />
      <path d="M48 80 32 90" />
    </svg>
  );
}
