"use client"

import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import {
  controlBaseClasses,
  controlDisabledClasses,
  controlFocusClasses,
} from "@/components/ui/button"

const toggleVariants = cva(
  `${controlBaseClasses} ${controlFocusClasses} ${controlDisabledClasses} min-h-[var(--sploot-control-height)] px-3 font-sans font-bold transition-colors duration-150 data-[state=on]:bg-sploot-yellow data-[state=on]:text-sploot-on-yellow hover:bg-sploot-yellow hover:text-sploot-ink`,
  {
    variants: {
      variant: {
        default: "bg-sploot-panel text-sploot-ink sploot-press-sm",
        outline: "bg-sploot-panel text-sploot-ink sploot-press-sm",
        segmented: "bg-transparent text-sploot-ink sploot-press-sm",
      },
      size: {
        default: "h-[var(--sploot-control-height)]",
        sm: "h-[var(--sploot-control-height-sm)] min-h-[var(--sploot-control-height-sm)] px-2 text-xs max-sm:h-[var(--sploot-touch-target)] max-sm:min-h-[var(--sploot-touch-target)]",
        lg: "h-[var(--sploot-control-height-lg)] min-h-[var(--sploot-control-height-lg)] px-4",
      },
    },
    defaultVariants: {
      variant: "segmented",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
