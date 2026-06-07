"use client";

import type { LucideIcon } from "lucide-react";
import { Globe, Lock, Zap } from "lucide-react";

type Benefit = {
  icon: LucideIcon;
  title: string;
  description: string;
  borderColor: string;
  iconBg: string;
};

const benefits: Benefit[] = [
  {
    icon: Lock,
    title: "private by default",
    description: "your memes stay yours. no ads, no public profile, no weird social graph.",
    borderColor: "border-sploot-cyan",
    iconBg: "bg-[var(--sploot-sticker-cyan)]",
  },
  {
    icon: Zap,
    title: "fast recall",
    description:
      "search the pile by memory instead of doomscrolling your camera roll.",
    borderColor: "border-sploot-coral",
    iconBg: "bg-[var(--sploot-sticker-coral)]",
  },
  {
    icon: Globe,
    title: "saves anywhere",
    description:
      "clip from the extension, browse on mobile, and keep the chaos portable.",
    borderColor: "border-sploot-violet",
    iconBg: "bg-[var(--sploot-sticker-violet)]",
  },
];

export function BenefitGrid() {
  // Icon-specific animation classes
  const getIconAnimation = (title: string) => {
    switch (title) {
      case "private by default":
        return "group-hover:animate-[shake_0.5s_ease-in-out]";
      case "fast recall":
        return "group-hover:animate-[flash_0.6s_ease-in-out]";
      case "saves anywhere":
        return "group-hover:animate-[spin_1s_ease-in-out]";
      default:
        return "";
    }
  };

  return (
    <>
      <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-10">
        {benefits.map(({ icon: Icon, title, description, borderColor, iconBg }) => (
          <article
            key={title}
            className={`group brutalist-border ${borderColor} bg-sploot-paper p-6 transition-all duration-150 hover:-translate-y-1 md:p-8`}
          >
            {/* Icon container */}
            <div className={`mb-6 flex h-16 w-16 items-center justify-center ${iconBg} brutalist-corners`}>
              <Icon
                className={`h-8 w-8 text-foreground ${getIconAnimation(title)}`}
                strokeWidth={2.5}
              />
            </div>

          {/* Title - Bebas Neue for boldness */}
          <h3
            className="mb-4 text-2xl leading-tight tracking-wide md:text-3xl"
            style={{ fontFamily: "var(--font-bebas-neue)" }}
          >
            {title}
          </h3>

          {/* Description */}
          <p className="text-base text-muted-foreground leading-relaxed">
            {description}
          </p>
        </article>
      ))}
    </div>

    {/* Animation keyframes */}
    <style>{`
      @keyframes shake {
        0%, 100% { transform: translateX(0) rotate(0deg); }
        25% { transform: translateX(-4px) rotate(-5deg); }
        75% { transform: translateX(4px) rotate(5deg); }
      }

      @keyframes flash {
        0%, 100% { opacity: 1; filter: brightness(1); }
        50% { opacity: 0.7; filter: brightness(1.8); }
      }
    `}</style>
  </>
  );
}
