import Link from "next/link"
import { OverlappingCircles } from "@/components/landing/overlapping-circles"
import { SPLOOT_EXTENSION_STORE_URL } from "@/components/library/empty-state"

export function GlobalFooter() {
  return (
    <footer className="bg-sploot-void border-t-[3px] border-sploot-ink py-8">
      <div className="container px-6 mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">

        {/* Left: Brand/Copyright */}
        <Link href="/" className="flex items-center gap-3 group">
           <OverlappingCircles className="w-5 h-5 text-sploot-on-void group-hover:text-sploot-on-void transition-colors" strokeWidth={2} />
           <span className="text-sm text-sploot-on-void font-mono group-hover:text-sploot-on-void transition-colors">
             © {new Date().getFullYear()} SPLOOT
           </span>
        </Link>

        {/* Center: Links */}
        <div className="flex items-center gap-6 text-sm font-mono">
          <Link
            href="/changelog"
            className="sploot-public-link sploot-public-footer-link"
          >
            changelog
          </Link>
          <Link
            href="/support"
            className="sploot-public-link sploot-public-footer-link"
          >
            support
          </Link>
          <Link
            href="/privacy"
            className="sploot-public-link sploot-public-footer-link"
          >
            privacy
          </Link>
          <Link
            href={SPLOOT_EXTENSION_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="sploot-public-link sploot-public-footer-link"
          >
            extension
          </Link>
        </div>

        {/* Right: Misty Step Attribution */}
        <Link
          href="https://mistystep.io"
          target="_blank"
          rel="noopener noreferrer"
          className="sploot-public-link sploot-public-footer-link text-sm font-mono group"
        >
          a <span className="underline decoration-white/20 underline-offset-4 group-hover:decoration-sploot-cyan transition-all">misty step</span> project
        </Link>
      </div>
    </footer>
  )
}
