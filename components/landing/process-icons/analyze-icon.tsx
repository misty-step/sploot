import { Brain } from "lucide-react";
import { processIconClassName } from "./shared";
import type { ProcessIconProps } from "./shared";

export function AnalyzeIcon({ className, ...props }: ProcessIconProps) {
  return (
    <Brain
      className={processIconClassName(className)}
      strokeWidth={1.5}
      aria-hidden="true"
      {...props}
    />
  );
}
