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
    title: "PRIVATE & SECURE",
    description: "Your memes stay yours. Zero tracking, zero sharing.",
    borderColor: "border-electric-lime",
    iconBg: "bg-electric-lime/10",
  },
  {
    icon: Zap,
    title: "LIGHTNING FAST",
    description:
      "Search thousands of memes in milliseconds with AI semantic search.",
    borderColor: "border-hot-pink",
    iconBg: "bg-hot-pink/10",
  },
  {
    icon: Globe,
    title: "WORKS EVERYWHERE",
    description:
      "Install as a PWA, works offline, and feels native on any device.",
    borderColor: "border-cyber-blue",
    iconBg: "bg-cyber-blue/10",
  },
];

export function BenefitGrid() {
  // Icon-specific animation classes
  const getIconAnimation = (title: string) => {
    switch (title) {
      case "PRIVATE & SECURE":
        return "group-hover:animate-[shake_0.5s_ease-in-out]";
      case "LIGHTNING FAST":
        return "group-hover:animate-[flash_0.6s_ease-in-out]";
      case "WORKS EVERYWHERE":
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
            className={`group brutalist-border ${borderColor} bg-card p-8 transition-all duration-300 hover:-translate-y-2 hover:shadow-lg`}
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
            className="text-2xl md:text-3xl leading-tight tracking-wide mb-4"
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
    <style jsx global>{`
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
