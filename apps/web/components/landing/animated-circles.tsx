"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedCircles() {
  const size = 300;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth * 2) / 3;
  const centerY = size / 2;
  const leftCx = size / 2 - radius / 2;
  const rightCx = size / 2 + radius / 2;

  // Calculate circumference for stroke animation
  const circumference = 2 * Math.PI * radius;

  // Viewport visibility detection
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Fire once, then stop observing
        }
      },
      { threshold: 0.5 } // Trigger when 50% visible
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center justify-center space-y-6"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="w-64 h-64 md:w-[300px] md:h-[300px]"
      >
        {/* Left circle - stroke draws first */}
        <circle
          cx={leftCx}
          cy={centerY}
          r={radius}
          className={`stroke-primary ${isVisible ? "draw-stroke-left" : ""}`}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
        />

        {/* Right circle - stroke draws second */}
        <circle
          cx={rightCx}
          cy={centerY}
          r={radius}
          className={`stroke-primary ${isVisible ? "draw-stroke-right" : ""}`}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
        />
      </svg>

      {/* Labels - sequential reveal matching visual story */}
      <div className="flex items-center justify-center gap-12 md:gap-16 text-xs md:text-sm font-mono text-muted-foreground">
        <span
          className={`opacity-0 ${
            isVisible ? "animate-[fadeIn_0.6s_ease-out_0.2s_forwards]" : ""
          }`}
        >
          queries
        </span>
        <span
          className={`opacity-0 ${
            isVisible
              ? "animate-[fadeIn_0.6s_ease-out_1.6s_forwards] text-primary"
              : ""
          }`}
        >
          matches
        </span>
        <span
          className={`opacity-0 ${
            isVisible ? "animate-[fadeIn_0.6s_ease-out_0.8s_forwards]" : ""
          }`}
        >
          images
        </span>
      </div>

      <style jsx>{`
        .draw-stroke-left {
          animation: drawStroke 0.8s ease-out forwards;
        }

        .draw-stroke-right {
          animation: drawStroke 0.8s ease-out 0.6s forwards;
        }

        @keyframes drawStroke {
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}
