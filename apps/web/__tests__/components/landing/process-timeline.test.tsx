import { act, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ProcessTimeline } from "@/components/landing/process-timeline";

const titles = ["upload chaos", "piles appear", "find bangers"];
let intersectionCallback: IntersectionObserverCallback | null = null;

class IntersectionObserverMock implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = "0px";
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }

  observe() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve() {}
}

beforeAll(() => {
  vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  intersectionCallback = null;
});

function triggerIntersection() {
  act(() => {
    intersectionCallback?.(
      [
        {
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
  });
}

describe("ProcessTimeline", () => {
  it("renders all process steps with the correct copy", () => {
    render(<ProcessTimeline />);

    titles.forEach((title) => {
      expect(screen.getByText(title)).toBeInTheDocument();
    });

    expect(
      screen.getByText("drop in the screenshots, reactions, and groupchat relics."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("similar saves drift into nearby semantic neighborhoods."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("type what you remember and pull the exact meme back."),
    ).toBeInTheDocument();
  });

  it("renders process icons for each step", () => {
    const { container } = render(<ProcessTimeline />);
    const icons = container.querySelectorAll("svg");

    expect(icons).toHaveLength(3);
    icons.forEach((icon) => {
      expect(icon.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(icon.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("applies responsive layout classes to the wrapper", () => {
    const { container } = render(<ProcessTimeline />);
    const wrapper = container.firstElementChild as HTMLElement | null;

    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain("flex");
    expect(wrapper?.className).toContain("flex-col");
    expect(wrapper?.className).toContain("md:flex-row");
  });

  it("renders numbered badges for each step", () => {
    render(<ProcessTimeline />);

    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });

  it("keeps steps visible before intersecting and animates them in with staggered delays after", () => {
    render(<ProcessTimeline />);
    const articlesBefore = screen.getAllByRole("article");

    // Content must never be hidden waiting on the observer: no JS, aborted
    // scroll, or screenshots would otherwise see a blank section.
    articlesBefore.forEach((article) => {
      expect(article.className).not.toContain("opacity-0");
      expect(article.className).not.toContain("animate-sploot-slide-up");
    });

    triggerIntersection();

    const articlesAfter = screen.getAllByRole("article");
    articlesAfter.forEach((article, index) => {
      expect(article.className).toContain("animate-sploot-slide-up");
      expect(article.style.animationDelay).toBe(`${index * 150}ms`);
      expect(article.style.animationFillMode).toBe("backwards");
    });
  });
});
