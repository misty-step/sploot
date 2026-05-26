import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BenefitGrid } from "@/components/landing/benefit-grid";

const titles = ["PRIVATE & SECURE", "LIGHTNING FAST", "WORKS EVERYWHERE"];

describe("BenefitGrid", () => {
  it("renders all benefit cards with the correct copy", () => {
    render(<BenefitGrid />);

    titles.forEach((title) => {
      expect(screen.getByText(title)).toBeInTheDocument();
    });

    expect(
      screen.getByText("Your memes stay yours. Private library by default, no ads."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Search thousands of memes in milliseconds with AI semantic search.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Install as a PWA, works offline, and feels native on any device.",
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
      expect(card.className).toContain("hover:-translate-y-2");
      expect(card.className).toContain("hover:shadow-lg");
      expect(card.className).toContain("transition-all");
    });
  });
});
