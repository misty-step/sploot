import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

export type ProcessIconProps = SVGProps<SVGSVGElement>;

const baseClassName = "h-16 w-16 md:h-20 md:w-20 stroke-primary";

export function processIconClassName(className?: string) {
  return cn(baseClassName, className);
}
