import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-xl mx-auto">
        
        {/* Glitchy 404 */}
        <div className="relative mb-8">
          <h1 
            className="text-[12rem] leading-none font-bold tracking-tighter text-transparent bg-clip-text bg-white select-none"
            style={{ fontFamily: "var(--font-bebas-neue)" }}
          >
            404
          </h1>
          <div 
            className="absolute inset-0 text-[12rem] leading-none font-bold tracking-tighter text-accent-cyan mix-blend-screen animate-[glitchShake_0.4s_infinite] opacity-50 select-none pointer-events-none"
            style={{ fontFamily: "var(--font-bebas-neue)", transform: "translateX(-2px)" }}
          >
            404
          </div>
           <div 
            className="absolute inset-0 text-[12rem] leading-none font-bold tracking-tighter text-accent-coral mix-blend-screen animate-[glitchShake_0.6s_infinite_reverse] opacity-50 select-none pointer-events-none"
            style={{ fontFamily: "var(--font-bebas-neue)", transform: "translateX(2px)" }}
          >
            404
          </div>
        </div>

        {/* Message */}
        <h2 className="text-2xl md:text-3xl font-mono mb-6 text-white">
          <span className="text-accent-cyan">{">"}</span> ASSET_NOT_FOUND
        </h2>
        
        <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
          The meme you are looking for has been deleted from the simulation or never existed in this timeline.
        </p>

        {/* Action */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            asChild 
            variant="accent" 
            size="lg"
            className="min-w-[200px]"
          >
            <Link href="/">
              RETURN TO BASE
            </Link>
          </Button>
        </div>
      </div>

      {/* Decorative Code overlay */}
      <div className="absolute bottom-12 right-12 text-white/10 font-mono text-xs text-right hidden md:block pointer-events-none">
        <p>ERR_CODE: 0x404</p>
        <p>MEM_ADDR: NULL</p>
        <p>STACK_TRACE: CLEARED</p>
      </div>
    </div>
  )
}
