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
  title: string;
  description: string;
  icon: React.ComponentType<ProcessIconProps>;
};

const steps: ProcessStep[] = [
  {
    title: "UPLOAD",
    description: "Drag and drop your memes. We'll handle the rest.",
    icon: UploadIcon,
  },
  {
    title: "AI ANALYZES",
    description: "CLIP embeddings capture semantic meaning of every image.",
    icon: AnalyzeIcon,
  },
  {
    title: "SEARCH & FIND",
    description: "Type what you remember, get what you need instantly.",
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
      />
    ));
  }, [isVisible, prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-12 md:gap-0 md:grid md:grid-cols-3 md:items-center"
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
};

function TimelineStep({
  index,
  step,
  isVisible,
  prefersReducedMotion,
}: TimelineStepProps) {
  const Icon = step.icon;
  const transitionDelayMs = index * 150;

  // Assign different neon colors to each step
  const badgeColors = [
    "bg-electric-lime text-black",
    "bg-hot-pink text-black",
    "bg-cyber-blue text-black",
  ];

  const borderColors = [
    "border-electric-lime",
    "border-hot-pink",
    "border-cyber-blue",
  ];

  // Diagonal cascade: stagger vertical position and add subtle rotation
  const cascadeStyles = [
    "md:mt-0", // First card at top
    "md:mt-12", // Second card middle
    "md:mt-24", // Third card bottom
  ];

  const rotations = [
    "md:rotate-[-2deg]",
    "md:rotate-0",
    "md:rotate-[2deg]",
  ];

  // Varying padding for visual rhythm
  const paddings = [
    "p-6 md:p-6",
    "p-6 md:p-8",
    "p-6 md:p-10",
  ];

  return (
    <article
      className={cn(
        "relative flex flex-col items-center text-center md:items-start md:text-left",
        "brutalist-border bg-card",
        borderColors[index],
        paddings[index],
        cascadeStyles[index],
        // Apply rotation only on desktop when visible
        isVisible ? rotations[index] : "",
        "transition-all duration-700 ease-out",
        // Hover states for playfulness
        "hover:scale-105 hover:z-10 hover:rotate-[0deg]",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        prefersReducedMotion && "translate-y-0 opacity-100 transition-none rotate-0"
      )}
      style={
        prefersReducedMotion || !isVisible
          ? undefined
          : { transitionDelay: `${transitionDelayMs}ms` }
      }
    >
      {/* Chunky numbered badge */}
      <div
        className={cn(
          "mb-6 flex h-14 w-14 items-center justify-center brutalist-corners font-mono text-2xl font-bold",
          badgeColors[index]
        )}
      >
        {String(index + 1).padStart(2, "0")}
      </div>

      {/* Icon */}
      <div className="mb-6 flex items-center justify-center md:justify-start">
        <Icon className="mx-auto" />
      </div>

      {/* Title - Bebas Neue */}
      <h3
        className="text-3xl md:text-4xl leading-tight tracking-wide mb-4"
        style={{ fontFamily: "var(--font-bebas-neue)" }}
      >
        {step.title}
      </h3>

      {/* Description */}
      <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
        {step.description}
      </p>
    </article>
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
