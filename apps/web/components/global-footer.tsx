import Link from "next/link"
import { OverlappingCircles } from "@/components/landing/overlapping-circles"
import { SPLOOT_EXTENSION_STORE_URL } from "@/components/library/empty-state"

export function GlobalFooter() {
  return (
    <footer className="bg-black border-t border-white/10 py-8">
      <div className="container px-6 mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">

        {/* Left: Brand/Copyright */}
        <Link href="/" className="flex items-center gap-3 group">
           <OverlappingCircles className="w-5 h-5 text-white/40 group-hover:text-white transition-colors" strokeWidth={2} />
           <span className="text-sm text-white/40 font-mono group-hover:text-white transition-colors">
             © {new Date().getFullYear()} SPLOOT
           </span>
        </Link>

        {/* Center: Links */}
        <div className="flex items-center gap-6 text-sm font-mono">
          <Link
            href="/changelog"
            className="text-white/40 hover:text-white transition-colors"
          >
            changelog
          </Link>
          <Link
            href="/support"
            className="text-white/40 hover:text-white transition-colors"
          >
            support
          </Link>
          <Link
            href="/privacy"
            className="text-white/40 hover:text-white transition-colors"
          >
            privacy
          </Link>
          <Link
            href={SPLOOT_EXTENSION_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/40 hover:text-white transition-colors"
          >
            extension
          </Link>
        </div>

        {/* Right: Misty Step Attribution */}
        <Link
          href="https://mistystep.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-white/40 hover:text-white transition-colors font-mono group"
        >
          a <span className="underline decoration-white/20 underline-offset-4 group-hover:decoration-accent-cyan transition-all">misty step</span> project
        </Link>
      </div>
    </footer>
  )
}
