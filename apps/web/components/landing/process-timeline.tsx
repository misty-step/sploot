"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import {
  AnalyzeIcon,
  SearchIcon,
  UploadIcon,
  type ProcessIconProps,
} from "./process-icons";

type ProcessStep = {
  number: string;
  title: string;
  description: string;
  icon: React.ComponentType<ProcessIconProps>;
};

const steps: ProcessStep[] = [
  {
    number: "01",
    title: "upload chaos",
    description: "drop in the screenshots, reactions, and groupchat relics.",
    icon: UploadIcon,
  },
  {
    number: "02",
    title: "piles appear",
    description: "similar saves drift into nearby semantic neighborhoods.",
    icon: AnalyzeIcon,
  },
  {
    number: "03",
    title: "find bangers",
    description: "type what you remember and pull the exact meme back.",
    icon: SearchIcon,
  },
];

export function ProcessTimeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  const timelineChildren = useMemo(() => {
    return steps.map((step, index) => (
      <TimelineStep
        key={step.title}
        step={step}
        index={index}
        isVisible={isVisible}
        prefersReducedMotion={prefersReducedMotion}
        isLast={index === steps.length - 1}
      />
    ));
  }, [isVisible, prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center gap-6 md:flex-row md:items-stretch md:justify-center md:gap-4"
    >
      {timelineChildren}
    </div>
  );
}

type TimelineStepProps = {
  index: number;
  step: ProcessStep;
  isVisible: boolean;
  prefersReducedMotion: boolean;
  isLast: boolean;
};

function TimelineStep({
  index,
  step,
  isVisible,
  prefersReducedMotion,
  isLast,
}: TimelineStepProps) {
  const Icon = step.icon;
  const transitionDelayMs = index * 150;

  // Diagonal cascade offset on desktop
  const cascadeOffset = [
    "md:-mt-8",
    "md:mt-0",
    "md:mt-8",
  ];

  return (
    <div className="flex items-center gap-4 md:gap-2">
      <article
        className={cn(
          "relative flex flex-col items-center text-center",
          "w-full max-w-xs md:w-72",
          "bg-sploot-paper border border-sploot-ink",
          "p-6",
          cascadeOffset[index] ?? "md:mt-0",
          "transition-all duration-700 ease-out",
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
          prefersReducedMotion && "translate-y-0 opacity-100 transition-none"
        )}
        style={
          prefersReducedMotion || !isVisible
            ? undefined
            : { transitionDelay: `${transitionDelayMs}ms` }
        }
      >
        {/* Top accent bar */}
        <div className="absolute left-0 right-0 top-0 h-1 bg-sploot-cyan" />

        {/* Number + Title row */}
        <div className="flex items-center gap-3 mb-4">
          <span
            className="text-3xl tracking-wider text-sploot-cyan md:text-4xl"
            style={{ fontFamily: "var(--font-bebas-neue)" }}
          >
            {step.number}
          </span>
          <h3
            className="text-2xl tracking-wider md:text-3xl"
            style={{ fontFamily: "var(--font-bebas-neue)" }}
          >
            {step.title}
          </h3>
        </div>

        {/* Icon */}
        <div className="mb-4">
          <Icon className="h-16 w-16 md:h-20 md:w-20" />
        </div>

        {/* Description */}
        <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
          {step.description}
        </p>
      </article>

      {/* Arrow connector (not on last item) */}
      {!isLast && (
        <span
          className={cn(
            "hidden md:block text-3xl text-sploot-violet font-bold",
            "transition-all duration-700 ease-out",
            isVisible ? "opacity-100" : "opacity-0",
            prefersReducedMotion && "opacity-100 transition-none"
          )}
          style={
            prefersReducedMotion || !isVisible
              ? undefined
              : { transitionDelay: `${transitionDelayMs + 100}ms` }
          }
          aria-hidden="true"
        >
          →
        </span>
      )}
    </div>
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);

    handleChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleChange);
      } else if (typeof mediaQuery.removeListener === "function") {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  return prefersReducedMotion;
}
