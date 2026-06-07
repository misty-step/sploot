"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SectionDividerProps {
  sectionNumber?: string;
  color?: "lime" | "coral" | "cyan" | "violet";
  className?: string;
}

export function SectionDivider({
  sectionNumber,
  color = "lime",
  className,
}: SectionDividerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionNumber) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [sectionNumber]);

  const colorClasses = {
    lime: "bg-sploot-lime text-black",
    coral: "bg-sploot-coral text-black",
    cyan: "bg-sploot-cyan text-black",
    violet: "bg-sploot-violet text-black",
  };

  return (
    <>
      <div className={cn("relative w-full group", className)} ref={ref}>
        <div
          className={cn(
            "h-2 w-full transition-all duration-200",
            "group-hover:animate-[glitch_0.3s_ease-in-out]",
            colorClasses[color]
          )}
        />
        {sectionNumber && (
          <div className="absolute -bottom-6 right-0">
            <span
              className={cn(
                "font-mono text-5xl md:text-6xl font-bold opacity-20 transition-all duration-500",
                colorClasses[color].split(" ")[0].replace("bg-", "text-"),
                isVisible && "animate-[sectionPulse_1s_ease-out]"
              )}
              aria-hidden="true"
            >
              {sectionNumber}
            </span>
          </div>
        )}
      </div>

      {/* Animation keyframes */}
      <style jsx global>{`
        @keyframes glitch {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-2px) scaleY(1.02); }
          40% { transform: translateX(2px) scaleY(0.98); }
          60% { transform: translateX(-1px) scaleY(1.01); }
          80% { transform: translateX(1px) scaleY(0.99); }
        }

        @keyframes sectionPulse {
          0% { opacity: 0; transform: scale(0.95); }
          50% { opacity: 0.4; transform: scale(1.05); }
          100% { opacity: 0.2; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
