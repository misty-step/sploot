"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { OverlappingCircles } from "./overlapping-circles";

interface FeatureStatement {
  headline: string;
  subtext: string;
  color: string;
}

const FEATURES: FeatureStatement[] = [
  {
    headline: "UNLIMITED",
    subtext: "Your library. No limits.",
    color: "text-electric-lime",
  },
  {
    headline: "INSTANT",
    subtext: "Find anything. Sub-second.",
    color: "text-hot-pink",
  },
  {
    headline: "PRIVATE",
    subtext: "Zero tracking. Zero sharing.",
    color: "text-cyber-blue",
  },
];

function FeatureDisplay({ feature }: { feature: FeatureStatement }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`space-y-3 transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
    >
      <div
        className={`text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight ${feature.color}`}
        style={{ fontFamily: "var(--font-bebas-neue)" }}
      >
        {feature.headline}
      </div>
      <div className="text-base md:text-lg text-muted-foreground leading-relaxed">
        {feature.subtext}
      </div>
    </div>
  );
}

export function LandingFooter() {
  return (
    <footer className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-black">
      {/* Overlapping circles logo - large and centered */}
      <div className="mb-16 opacity-0 animate-[fadeIn_1s_ease-out_forwards]">
        <OverlappingCircles className="scale-150" />
      </div>

      {/* Feature statements - honest and impactful */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-20 mb-20 text-center max-w-6xl">
        {FEATURES.map((feature) => (
          <FeatureDisplay key={feature.headline} feature={feature} />
        ))}
      </div>

      {/* Thick neon divider bar */}
      <div className="w-full max-w-4xl mb-16 opacity-0 animate-[fadeIn_1s_ease-out_0.6s_forwards]">
        <div className="h-2 bg-gradient-to-r from-electric-lime via-hot-pink to-cyber-blue" />
      </div>

      {/* Large CTA */}
      <div className="mb-16 opacity-0 animate-[fadeIn_1s_ease-out_0.9s_forwards]">
        <Button
          asChild
          variant="brutalist"
          size="lg"
          className="px-16 py-10 text-2xl md:text-3xl shadow-2xl"
          style={{ fontFamily: "var(--font-bebas-neue)" }}
        >
          <Link href="/sign-up">START YOUR COLLECTION →</Link>
        </Button>
        <p className="mt-6 text-sm text-muted-foreground font-mono text-center">
          START FREE • NO CREDIT CARD • NO TRACKING
        </p>
      </div>

      {/* Footer - minimal and honest */}
      <div className="font-mono text-sm text-muted-foreground uppercase tracking-wider opacity-0 animate-[fadeIn_1s_ease-out_1.2s_forwards]">
        <span>© 2025 SPLOOT</span>
      </div>
    </footer>
  );
}
