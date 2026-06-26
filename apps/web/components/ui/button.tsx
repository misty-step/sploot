import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Sploot buttons use the shared hard-shadow press utility so hover/active
// feedback stays consistent across app and landing surfaces.
const buttonVariants = cva(
  "sploot-press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border-[length:var(--sploot-active-border-width)] border-sploot-ink font-mono text-sm font-bold uppercase tracking-normal cursor-pointer disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline focus-visible:outline-[5px] focus-visible:outline-offset-[3px] focus-visible:outline-sploot-magenta aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // primary action: electric blue block
        default: "bg-sploot-blue text-white sploot-shadow-sm",
        primary: "bg-sploot-blue text-white sploot-shadow-sm",
        // attention: hot magenta block (bangers / favorites / destructive-lite)
        attention: "bg-sploot-magenta text-white sploot-shadow-sm",
        destructive: "bg-sploot-orange text-sploot-ink sploot-shadow-sm",
        // ghost: paper block with the same structure (still bordered + shadowed)
        ghost: "bg-sploot-paper text-sploot-ink sploot-shadow-sm",
        outline: "bg-sploot-paper text-sploot-ink sploot-shadow-sm",
        secondary: "bg-sploot-yellow text-sploot-ink sploot-shadow-sm",
        // ink: the inverted slab (dark fill, lime label)
        ink: "bg-sploot-ink text-sploot-lime sploot-shadow-sm",
        // link stays flat — no block, no shadow, no press lift
        link: "border-0 bg-transparent text-sploot-ink shadow-none normal-case tracking-normal underline-offset-4 hover:underline hover:bg-transparent",
        accent: "bg-sploot-cyan text-sploot-ink sploot-shadow-sm",
      },
      size: {
        default: "min-h-[var(--sploot-touch-target)] px-4 py-2 has-[>svg]:px-3",
        sm: "h-9 gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        lg: "min-h-[var(--sploot-touch-target)] px-6 py-3 text-base has-[>svg]:px-4",
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
