import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Toybox buttons (lab-034 AFD-8): pill toys with a 3px ink shell and
// drop-height elevation. The shared physics utilities enforce the
// hover-physics law: surface lifts / shadow anchors; press sinks /
// shadow collapses. Icon sizes compose the flat ink-mini grammar instead.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--sploot-radius-pill)] border-[3px] border-sploot-ink font-sans text-sm font-extrabold cursor-pointer disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[3px] focus-visible:outline-sploot-focus aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // primary action: blue toy
        default: "sploot-press bg-sploot-blue text-white sploot-shadow",
        primary: "sploot-press bg-sploot-blue text-white sploot-shadow",
        // attention: bubblegum toy (bangers / favorites)
        attention: "sploot-press bg-sploot-magenta text-[#1c1547] sploot-shadow",
        destructive: "sploot-press bg-sploot-red text-white sploot-shadow",
        // ghost/outline: panel toy with the same shell + drop
        ghost: "sploot-press bg-sploot-panel text-sploot-ink sploot-shadow",
        outline: "sploot-press bg-sploot-panel text-sploot-ink sploot-shadow",
        secondary: "sploot-press bg-sploot-yellow text-[#1c1547] sploot-shadow",
        // ink: the inverted toy (ink fill, shelf label)
        ink: "sploot-press bg-sploot-ink text-sploot-paper sploot-shadow",
        // link stays flat — no shell, no drop, no press physics
        link: "border-0 bg-transparent text-sploot-ink shadow-none underline-offset-4 hover:underline hover:bg-transparent",
        accent: "sploot-press bg-sploot-cyan text-[#1c1547] sploot-shadow",
        // compact: smaller drop, same law
        compact: "sploot-press-sm bg-sploot-panel text-sploot-ink sploot-shadow-sm",
      },
      size: {
        default: "min-h-[var(--sploot-touch-target)] px-5 py-2 has-[>svg]:px-4",
        sm: "h-9 gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        lg: "min-h-[var(--sploot-touch-target)] px-7 py-3 text-base has-[>svg]:px-5",
        icon: "size-11",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
