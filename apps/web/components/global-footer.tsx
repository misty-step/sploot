import Link from "next/link"
import { OverlappingCircles } from "@/components/landing/overlapping-circles"
import { SPLOOT_EXTENSION_STORE_URL } from "@/components/library/empty-state"

export function GlobalFooter() {
  return (
    <footer className="bg-sploot-void border-t-[3px] border-sploot-ink py-8">
      <div className="container px-6 mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">

        {/* Left: Brand/Copyright */}
        <Link href="/" className="inline-flex min-h-11 min-w-11 items-center gap-3 group">
           <OverlappingCircles className="w-5 h-5 text-sploot-on-void group-hover:text-sploot-on-void transition-colors" strokeWidth={2} />
           <span className="text-sm text-sploot-on-void font-mono group-hover:text-sploot-on-void transition-colors">
             © {new Date().getFullYear()} SPLOOT
           </span>
        </Link>

        {/* Center: Links — every footer link is a real >=44px touch target */}
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm font-mono">
          <Link
            href="/changelog"
            className="sploot-public-link sploot-public-footer-link inline-flex min-h-11 min-w-11 items-center px-1"
          >
            changelog
          </Link>
          <Link
            href="/support"
            className="sploot-public-link sploot-public-footer-link inline-flex min-h-11 min-w-11 items-center px-1"
          >
            support
          </Link>
          <Link
            href="/privacy"
            className="sploot-public-link sploot-public-footer-link inline-flex min-h-11 min-w-11 items-center px-1"
          >
            privacy
          </Link>
          <Link
            href={SPLOOT_EXTENSION_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="sploot-public-link sploot-public-footer-link inline-flex min-h-11 min-w-11 items-center px-1"
          >
            extension
          </Link>
        </nav>

        {/* Right: Misty Step Attribution */}
        <Link
          href="https://mistystep.io"
          target="_blank"
          rel="noopener noreferrer"
          className="sploot-public-link sploot-public-footer-link inline-flex min-h-11 min-w-11 items-center text-sm font-mono group"
        >
          a&nbsp;<span className="underline decoration-white/20 underline-offset-4 group-hover:decoration-sploot-cyan transition-all">misty step</span>&nbsp;project
        </Link>
      </div>
    </footer>
  )
}
