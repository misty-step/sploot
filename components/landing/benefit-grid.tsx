import type { LucideIcon } from "lucide-react";
import { Globe, Lock, Zap } from "lucide-react";

type Benefit = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const benefits: Benefit[] = [
  {
    icon: Lock,
    title: "private & secure",
    description: "your memes stay yours. zero tracking, zero sharing.",
  },
  {
    icon: Zap,
    title: "lightning fast",
    description:
      "search thousands of memes in milliseconds with ai semantic search.",
  },
  {
    icon: Globe,
    title: "works everywhere",
    description:
      "install as a pwa, works offline, and feels native on any device.",
  },
];

export function BenefitGrid() {
  return (
    <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
      {benefits.map(({ icon: Icon, title, description }) => (
        <article
          key={title}
          className="group rounded-2xl border border-border/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/60 md:p-8"
        >
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background/40">
            <Icon className="h-6 w-6 text-primary" strokeWidth={1.5} />
          </div>
          <h3 className="text-xl font-light tracking-tight">{title}</h3>
          <p className="mt-4 text-base text-muted-foreground">{description}</p>
        </article>
      ))}
    </div>
  );
}
