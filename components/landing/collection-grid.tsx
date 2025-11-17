"use client";

import { useEffect, useMemo, useState } from "react";

export function CollectionGrid() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Generate randomized timing for stochastic animation
  const timings = useMemo(() =>
    Array.from({ length: 9 }).map(() => ({
      delay: Math.random() * 2, // 0-2s random delay
      duration: 2.5 + Math.random() * 1.5, // 2.5-4s random duration
    })),
  []);

  // Rotate through neon colors for brutalist aesthetic
  const getBorderColor = (index: number) => {
    const colors = [
      "border-electric-lime hover:bg-electric-lime/10",
      "border-hot-pink hover:bg-hot-pink/10",
      "border-cyber-blue hover:bg-cyber-blue/10",
    ];
    return colors[index % 3];
  };

  return (
    <div className="grid grid-cols-3 gap-3 w-64 md:w-72">
      {Array.from({ length: 9 }).map((_, i) => {
        const { delay, duration } = timings[i];

        return (
          <div
            key={i}
            className={`aspect-square rounded-lg border-2 ${getBorderColor(i)} transition-all duration-200 opacity-0`}
            style={{
              animation: prefersReducedMotion
                ? `cascadeIn 0.3s ease-out ${i * 0.05}s forwards`
                : `cascadeIn 0.3s ease-out ${i * 0.05}s forwards, cascadeLoop ${duration}s ease-in-out ${0.5 + delay}s infinite`,
            }}
          />
        );
      })}

      <style jsx global>{`
        @keyframes cascadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes cascadeLoop {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0;
            transform: scale(0.95);
          }
        }
      `}</style>
    </div>
  );
}
