import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Shared control grammar: actions use the 3px pill shell, tokenized height
// ladder, common focus ring, and the toybox press/lift physics. Segmented and
// icon-only controls reuse these state contracts without changing semantics.
export const controlFocusClasses =
  "outline-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[3px] focus-visible:outline-sploot-focus"
export const controlDisabledClasses =
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
export const controlBaseClasses =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--sploot-radius-pill)] border-[3px] border-sploot-ink font-sans text-sm font-extrabold cursor-pointer [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0"

const buttonVariants = cva(
  `${controlBaseClasses} ${controlFocusClasses} ${controlDisabledClasses} aria-invalid:border-destructive`,
  {
    variants: {
      variant: {
        // Primary actions are blue; attention uses the banger bubblegum fill.
        default: "sploot-press bg-sploot-blue text-sploot-on-blue sploot-shadow",
        primary: "sploot-press bg-sploot-blue text-sploot-on-blue sploot-shadow",
        attention: "sploot-press bg-sploot-magenta text-sploot-on-magenta sploot-shadow",
        destructive: "sploot-press bg-sploot-red text-sploot-on-red sploot-shadow",
        // Secondary actions keep the shell and physics while staying quieter.
        ghost: "sploot-press bg-sploot-panel text-sploot-ink sploot-shadow",
        outline: "sploot-press bg-sploot-panel text-sploot-ink sploot-shadow",
        secondary: "sploot-press bg-sploot-yellow text-sploot-on-yellow sploot-shadow",
        ink: "sploot-press bg-sploot-ink text-sploot-paper sploot-shadow",
        // Links are semantic flat affordances, not button toys.
        link: "border-0 bg-transparent px-0 text-sploot-ink shadow-none hover:bg-transparent hover:underline hover:underline-offset-4",
        accent: "sploot-press bg-sploot-cyan text-sploot-on-cyan sploot-shadow",
        compact: "sploot-press-sm bg-sploot-panel text-sploot-ink sploot-shadow-sm",
      },
      size: {
        default: "min-h-[var(--sploot-control-height)] px-5 has-[>svg]:px-4",
        sm: "h-[var(--sploot-control-height-sm)] gap-1.5 px-3 text-xs has-[>svg]:px-2.5 max-sm:h-auto max-sm:min-h-[var(--sploot-touch-target)] max-sm:min-w-[var(--sploot-touch-target)]",
        lg: "min-h-[var(--sploot-control-height-lg)] px-7 text-base has-[>svg]:px-5",
        icon: "size-[var(--sploot-control-height)]",
        "icon-sm": "size-[var(--sploot-control-height-sm)] max-sm:size-[var(--sploot-touch-target)]",
        "icon-lg": "size-[var(--sploot-control-height-lg)]",
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
