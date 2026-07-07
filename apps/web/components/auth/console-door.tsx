import { ReactNode } from "react";

/**
 * The console door — sploot's auth surfaces framed as a labeled instrument
 * console (DESIGN.md §4: "the search box is a labeled console with an ink
 * titlebar; the machinery is on display"). Winner of the sploot-032 design
 * lab (explorations/lab-032-auth-workbench.html, option 1): quiet
 * aesthetic-substrate chrome — hairlines, wash, steered cyan — with the
 * machinery strip on display and zero glassmorphism.
 *
 * Everything reads the shadcn semantic layer, which resolves to the
 * @misty-step/aesthetic --ae-* substrate (globals.css), so the door follows
 * light/dark automatically.
 */

/** Clerk appearance mapped onto the substrate: square corners, hairline
 *  borders, steered-cyan primary, mono field labels. No violet, no blur. */
export const consoleDoorAppearance = {
  variables: {
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full rounded-none border-0 shadow-none",
    card: "bg-background rounded-none border-0 shadow-none",
    headerTitle: "text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButton:
      "bg-secondary hover:bg-muted border border-border text-foreground rounded-none shadow-none",
    dividerLine: "bg-border",
    dividerText: "font-mono text-[11px] uppercase text-muted-foreground",
    formFieldLabel:
      "font-mono text-[11px] uppercase tracking-wide text-muted-foreground",
    formFieldInput:
      "bg-background border-border rounded-none text-foreground shadow-none focus:border-primary",
    formButtonPrimary:
      "bg-primary hover:bg-primary/90 text-primary-foreground rounded-none shadow-none transition-colors",
    formFieldInputShowPasswordButton:
      "text-muted-foreground hover:text-foreground",
    identityPreviewEditButtonIcon: "text-primary",
    footerActionLink: "text-primary hover:text-primary/80",
    footer: "bg-background",
    footerAction: "bg-background",
  },
  layout: {
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
};

interface ConsoleDoorProps {
  /** The route shown in the machinery strip, e.g. "/sign-in". */
  route: string;
  children: ReactNode;
}

/** Ink titlebar + hairline frame + machinery strip around a Clerk card. */
export function ConsoleDoor({ route, children }: ConsoleDoorProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-12">
      <div className="w-full max-w-md border border-foreground bg-background">
        <div className="flex items-center justify-between bg-foreground px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-background">
          <span>sploot / auth.console</span>
          <span aria-hidden="true">&#9679; ready</span>
        </div>
        <div className="flex justify-center [&>div]:w-full">{children}</div>
        <div className="flex gap-4 border-t border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
          <span>route: {route}</span>
          <span>auth: clerk</span>
          <span>mode: private</span>
        </div>
      </div>
    </div>
  );
}
