import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none font-mono text-sm font-bold uppercase tracking-normal cursor-pointer disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-sploot-cyan aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "sploot-press border-[3px] border-sploot-ink bg-sploot-blue text-white shadow-[3px_3px_0_var(--sploot-ink)]",
        primary: "sploot-press border-[3px] border-sploot-ink bg-sploot-blue text-white shadow-[3px_3px_0_var(--sploot-ink)]",
        attention: "sploot-press border-[3px] border-sploot-ink bg-sploot-magenta text-white shadow-[3px_3px_0_var(--sploot-ink)]",
        destructive: "sploot-press border-[3px] border-sploot-ink bg-sploot-orange text-sploot-ink shadow-[3px_3px_0_var(--sploot-ink)]",
        ghost: "border border-transparent bg-transparent text-foreground shadow-none transition-colors duration-[var(--sploot-motion-fast)] hover:bg-muted",
        outline: "border border-border bg-background text-foreground shadow-none transition-colors duration-[var(--sploot-motion-fast)] hover:border-sploot-ink hover:bg-muted",
        compact: "border border-transparent bg-transparent text-foreground shadow-none transition-colors duration-[var(--sploot-motion-fast)] hover:bg-muted active:bg-sploot-paper-warm",
        command: "border-2 border-sploot-ink bg-sploot-cyan text-sploot-ink shadow-none transition-[background-color,transform] duration-[var(--sploot-motion-fast)] hover:bg-sploot-yellow active:translate-y-px",
        secondary: "sploot-press border-[3px] border-sploot-ink bg-sploot-yellow text-sploot-ink shadow-[3px_3px_0_var(--sploot-ink)]",
        ink: "sploot-press border-[3px] border-sploot-ink bg-sploot-ink text-sploot-lime shadow-[3px_3px_0_var(--sploot-ink)]",
        // link stays flat — no block, no shadow, no press lift
        link: "border-0 bg-transparent text-sploot-ink shadow-none normal-case tracking-normal underline-offset-4 hover:underline hover:bg-transparent",
        accent: "sploot-press border-[3px] border-sploot-ink bg-sploot-cyan text-sploot-ink shadow-[3px_3px_0_var(--sploot-ink)]",
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
      data-variant={variant ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
