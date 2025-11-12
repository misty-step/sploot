import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

export type ProcessIconProps = SVGProps<SVGSVGElement>;

const baseClassName = "h-[120px] w-[120px] stroke-primary";

export function processIconClassName(className?: string) {
  return cn(baseClassName, className);
}
