import { ReactNode } from "react";

/**
 * The auth door — sploot's sign-in / sign-up surfaces (lab-034, AFD-8
 * "ink minis"). A single centered toy card on the dotted candy shelf: rounded
 * ink shell, drop-height elevation, a quiet privacy line. No fake window
 * chrome, no glassmorphism. The Clerk widget lives inside unchanged; only the
 * room around it is toybox now. Historically this was the sploot-032
 * auth.console; the toybox recut keeps the machinery honest but drops the
 * brutalist titlebar.
 *
 * Everything reads the shadcn semantic layer, which now resolves to the toybox
 * --sploot-* tokens (globals.css), so the door follows light/dark automatically.
 */

/** Clerk appearance mapped onto the toybox: pill buttons and inputs, 3px ink
 *  borders, candy-blue primary, mono field labels. No violet, no blur. */
export const consoleDoorAppearance = {
  variables: {
    // candy-blue primary (light value; the trailing-! utilities below carry the
    // theme flip through the semantic tokens)
    colorPrimary: "#087bc1",
    colorText: "var(--foreground)",
    colorTextSecondary: "var(--muted-foreground)",
    colorInputText: "var(--foreground)",
    colorInputBackground: "var(--background)",
    borderRadius: "9999px",
  },
  elements: {
    // Clerk injects its own styles at high specificity, so the semantic-token
    // utilities ride the important flag (Tailwind v4 trailing !) to win.
    rootBox: "w-full",
    cardBox: "w-full rounded-none! border-0! shadow-none! bg-transparent!",
    card: "bg-transparent! rounded-none! border-0! shadow-none!",
    headerTitle: "font-display text-foreground! tracking-normal",
    headerSubtitle: "font-sans text-muted-foreground!",
    socialButtonsBlockButton:
      "min-h-[var(--sploot-touch-target)] bg-secondary! hover:bg-accent! border-[2px]! border-border! text-foreground! rounded-full! shadow-none! font-extrabold transition-colors",
    dividerLine: "bg-border!",
    dividerText: "font-mono text-[11px] lowercase text-muted-foreground!",
    formFieldLabel:
      "font-mono text-[11px] lowercase tracking-normal text-muted-foreground!",
    formFieldInput:
      "min-h-[var(--sploot-touch-target)] bg-background! border-[2px]! border-border! rounded-full! text-foreground! placeholder:text-[var(--sploot-auth-placeholder)]! shadow-none! focus:border-primary!",
    formButtonPrimary:
      "min-h-[var(--sploot-touch-target)] bg-primary! hover:bg-primary/90! text-primary-foreground! rounded-full! border-[2px]! border-border! shadow-none! font-extrabold transition-colors",
    formFieldInputShowPasswordButton:
      "min-h-[var(--sploot-touch-target)] min-w-[var(--sploot-touch-target)] text-muted-foreground! hover:text-foreground!",
    identityPreviewEditButtonIcon: "text-primary!",
    footerActionLink: "text-primary! hover:text-primary/80! font-extrabold",
    footer: "bg-transparent!",
    footerAction: "bg-transparent!",
    footerActionText: "text-muted-foreground!",
  },
  layout: {
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
};

interface ConsoleDoorProps {
  children: ReactNode;
  title: string;
}

/** Dotted candy shelf backdrop + centered rounded toy card around a Clerk widget. */
export function ConsoleDoor({ children, title }: ConsoleDoorProps) {
  return (
    <div className="min-h-screen bg-sploot-workbench px-4 py-12">
      <a
        href="#auth-content"
        className="skip-link fixed left-4 top-4 z-50 rounded-full border-[3px] border-sploot-ink bg-sploot-yellow px-4 py-3 font-mono text-sm font-bold text-sploot-ink shadow-[0_3px_0_var(--sploot-shadow-color)]"
      >
        skip to sign in
      </a>
      <main
        id="auth-content"
        tabIndex={-1}
        aria-labelledby="auth-title"
        className="flex min-h-[calc(100vh-6rem)] items-center justify-center focus:outline-none focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-sploot-focus"
      >
        <div className="w-full max-w-md rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink bg-sploot-panel p-6 sploot-shadow-lg sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-1 text-center">
          <h1 id="auth-title" className="font-display text-3xl lowercase tracking-normal text-sploot-ink">
            sploot
          </h1>
          <p className="font-mono text-sm font-bold lowercase tracking-normal text-sploot-ink">
            {title}
          </p>
          <span className="font-mono text-[11px] lowercase tracking-normal text-sploot-ink/60">
            your private meme library
          </span>
        </div>
        <div className="flex justify-center [&>div]:w-full">{children}</div>
        <p className="mt-6 text-center font-mono text-[11px] lowercase tracking-normal text-sploot-ink/55">
          private library. only you can see your pile.
        </p>
        </div>
      </main>
    </div>
  );
}
