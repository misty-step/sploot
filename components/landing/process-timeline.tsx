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
  icon: (props: ProcessIconProps) => JSX.Element;
};

const steps: ProcessStep[] = [
  {
    title: "upload",
    description: "drag and drop your memes. we'll handle the rest.",
    icon: UploadIcon,
  },
  {
    title: "ai analyzes",
    description: "clip embeddings capture semantic meaning of every image.",
    icon: AnalyzeIcon,
  },
  {
    title: "search & find",
    description: "type what you remember, get what you need instantly.",
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
    return steps.flatMap((step, index) => {
      const elements = [
        <TimelineStep
          key={step.title}
          step={step}
          index={index}
          isVisible={isVisible}
          prefersReducedMotion={prefersReducedMotion}
        />,
      ];

      if (index < steps.length - 1) {
        elements.push(<Connector key={`connector-${step.title}`} />);
      }

      return elements;
    });
  }, [isVisible, prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-12 md:flex-row md:items-start md:gap-0"
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

  return (
    <article
      className={cn(
        "relative flex flex-1 flex-col items-center text-center md:items-start md:text-left",
        "transition-all duration-700 ease-out",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        prefersReducedMotion && "translate-y-0 opacity-100 transition-none"
      )}
      style={
        prefersReducedMotion || !isVisible
          ? undefined
          : { transitionDelay: `${transitionDelayMs}ms` }
      }
    >
      <span className="mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-border/60 font-mono text-sm tracking-tight text-muted-foreground">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="mb-6 flex items-center justify-center md:justify-start">
        <Icon className="mx-auto" />
      </div>
      <h3 className="text-2xl font-light tracking-tight md:text-3xl">
        {step.title}
      </h3>
      <p className="mt-4 text-lg text-muted-foreground">{step.description}</p>
    </article>
  );
}

function Connector() {
  return (
    <div
      className="hidden md:flex md:w-24 md:items-center md:justify-center"
      aria-hidden="true"
      data-connector
    >
      <div className="h-px w-full border-t border-border/60" />
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
