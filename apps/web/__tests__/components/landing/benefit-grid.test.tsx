import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BenefitGrid } from "@/components/landing/benefit-grid";

const titles = ["private by default", "fast recall", "saves anywhere"];

describe("BenefitGrid", () => {
  it("renders all benefit cards with the correct copy", () => {
    render(<BenefitGrid />);

    titles.forEach((title) => {
      expect(screen.getByText(title)).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "your memes stay yours. no ads, no public profile, no weird social graph.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("search the pile by memory instead of doomscrolling your camera roll."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "clip from the extension, browse on mobile, and keep the chaos portable.",
      ),
    ).toBeInTheDocument();
  });

  it("renders lucide icons for each benefit", () => {
    const { container } = render(<BenefitGrid />);
    const icons = container.querySelectorAll("svg");

    expect(icons).toHaveLength(3);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute("stroke-width", "2.5");
      expect(icon.classList.contains("text-foreground")).toBe(true);
    });
  });

  it("applies responsive grid layout classes", () => {
    const { container } = render(<BenefitGrid />);
    const grid = container.firstElementChild;

    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("grid");
    expect(grid?.className).toContain("grid-cols-1");
    expect(grid?.className).toContain("md:grid-cols-3");
    expect(grid?.className).toContain("md:gap-10");
  });

  it("includes hover transitions on each card", () => {
    render(<BenefitGrid />);
    const cards = screen.getAllByRole("article");

    expect(cards).toHaveLength(3);
    cards.forEach((card) => {
      expect(card.className).toContain("hover:-translate-y-1");
      expect(card.className).toContain("transition-all");
    });
  });
});
